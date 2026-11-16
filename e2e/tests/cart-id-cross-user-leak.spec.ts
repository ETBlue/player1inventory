import { expect, test } from '@playwright/test'
import { E2E_SECOND_USER_ID, E2E_USER_ID } from '../constants'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// That one HOUSEHOLD cannot reach another household's `Cart` row through an
// import, against real Postgres. Three tests:
//
// | Test | Cart id imported             | Answer                                   |
// |------|------------------------------|------------------------------------------|
// | 1    | a BARE id, `no-vendor`       | `BAD_USER_INPUT` for BOTH households, nothing in the batch written |
// | 2    | household A's id, `${locA}:no-vendor`, imported by B | `FORBIDDEN`; B's cart item naming it is skipped |
// | 3    | each household's own prefixed id | both written, one row each           |
//
// ── WHAT CHANGED IN HOUSEHOLDS H4 (task E.6) ─────────────────────────────────
//
// Until H4 test 1 was the leak test itself: A imported a cart under the bare
// id `no-vendor`, then B was refused the same id with `FORBIDDEN`. Since
// households H4 task E.1 (issue #361, decision T6) a cart id MUST start with
// its location id and a colon, so A's own import of `no-vendor` is refused
// with `BAD_USER_INPUT` before anything reads the cart table. Test 1 now
// pins that refusal, for both households.
//
// The leak guard did not go away; it moved to the only cart id shape that can
// still be imported. Test 2 is the old test 1 with a prefixed id: B names A's
// cart id. That id's prefix is A's location, where B has no role, so
// `cartVerdict` (apps/server/src/lib/authz.ts) refuses it BEFORE it reads the
// cart table. B therefore cannot even learn whether the id is taken.
//
// Each user is alone in a household of their own: each first request makes
// one (first sign-in, `ensureHousehold` in apps/server/src/lib/household.ts).
// Neither holds any role on the other's locations. The opposite case, two
// people in ONE household who DO share a cart, is `shared-cart.spec.ts`.
//
// What the server does, read from the code:
//
//   1. `Cart.id` is a GLOBAL primary key (apps/server/prisma/schema.prisma), so
//      one household can hold an id for everybody.
//   2. `bulkCreateShoppingCarts` (apps/server/src/resolvers/import.resolver.ts)
//      refuses a bare id with `BAD_USER_INPUT` (`resolveCartLocations`), then
//      checks every id with `requireOwnRowIdsOrUnclaimed(ctx, 'cart', …)`: a
//      prefix that is not a location of the target household where the caller
//      is `participant` or higher is `FORBIDDEN`, before the cart table is read.
//   3. `bulkCreateCartItems` resolves `cartId` in `resolveCartItemParents`
//      among the target household's writable locations only, and SKIPS a row
//      whose cart it cannot find there. So B's cart items cannot land in A's
//      cart.
//
// Every other test of these rules runs against the hand-written Prisma fake
// (`import-ownership-cart.resolver.test.ts`, `import-role-gate.resolver.test.ts`).
//
// ── WHAT THIS FILE DOES *NOT* PROVE ──────────────────────────────────────────
//
// **Nothing about the CLIENT.** This spec hands the ids to the server itself.
// Whether the web client ever sends a bare id is answered by unit tests in
// `apps/web/src/lib/importData.test.ts`: a local backup's carts keep their
// location prefix, and a legacy file's carts get one (`upgradeLegacyPayload`).
//
// **It covers two mutations, not the whole import surface.** It reaches
// `bulkCreateShoppingCarts` and `bulkCreateCartItems`. The other import
// mutations are covered by the server unit tests only.
//
// **One person in two households is not here.** The E2E route that adds a
// person to a household refuses a person who already has one (409), so issue
// #381's two-household cases are tested only against the fake.
//
// ── WHY THERE IS NO BROWSER ──────────────────────────────────────────────────
//
// `VITE_E2E_TEST_USER_ID` is baked into the web build as a single value
// (e2e/playwright.config.ts), so the browser can only ever be `E2E_USER_ID`.
// A second user is reachable only by setting the `x-e2e-user-id` header per
// request, which is what `makeGql(request, userId)` does. This file runs in
// the `cloud` project only — named in that project's `testMatch` and in the
// `local` project's `testIgnore`.
//
// ── TEARDOWN COVERS BOTH USERS ───────────────────────────────────────────────
//
// `/e2e/cleanup` deletes the households ONE user owns per call (since
// households H3a task 3.10), so both hooks below call it twice. The second
// user's rows are invisible to every other cloud spec's teardown, so leaving
// them behind would fail a later spec for a reason nobody would trace back
// here.

type Row = { id: string }
type CartItemRow = { id: string; cartId: string; itemId: string }

// A bare cart id: no location prefix, no colon. This is the shape
// `flattenPayloadForCloud` produced before cloud locations PR 4b, and the
// shape a hand-edited backup can still carry. Refused since households H4
// task E.1 (issue #361).
const BARE_CART_ID = 'no-vendor'

const LOCATIONS = `query { locations { id name } }`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) {
  createItem(input: $input) { id }
}`
const BULK_CREATE_CARTS = `mutation ($carts: [ShoppingCartInput!]!) {
  bulkCreateShoppingCarts(carts: $carts) { id }
}`
const BULK_CREATE_CART_ITEMS = `mutation ($cartItems: [CartItemInput!]!) {
  bulkCreateCartItems(cartItems: $cartItems) { id cartId itemId }
}`
const ALL_CARTS = `query { allCarts { id } }`
const ALL_CART_ITEMS = `query { allCartItems { id cartId itemId quantity } }`
const CART_ITEM_COUNT = `query ($itemId: ID!, $locationId: ID) {
  cartItemCountByItem(itemId: $itemId, locationId: $locationId)
}`

/** The first location of `gql`'s household. The first request makes it. */
async function firstLocationId(
  gql: ReturnType<typeof makeGql>,
): Promise<string> {
  const { locations } = await gql<{ locations: { id: string }[] }>(LOCATIONS)
  const id = locations[0]?.id
  if (!id) throw new Error('no location after first sign-in')
  return id
}

/** Both users, in both hooks. One call deletes one user. */
async function cleanupBothUsers(
  request: Parameters<typeof cleanupCloudData>[0],
): Promise<void> {
  await cleanupCloudData(request, E2E_USER_ID)
  await cleanupCloudData(request, E2E_SECOND_USER_ID)
}

test.beforeEach(async ({ request }) => {
  // Guards against a previous run that crashed before its teardown.
  await cleanupBothUsers(request)
})

test.afterEach(async ({ request }) => {
  await cleanupBothUsers(request)
})

test.describe('cloud import — a cart id of another household is refused', () => {
  test('user cannot import a cart under a bare id, in either household', async ({
    request,
  }) => {
    // Given two separate households, each with its own first location ("Home")
    const gqlA = makeGql(request, E2E_USER_ID)
    const gqlB = makeGql(request, E2E_SECOND_USER_ID)
    const defaultA = await firstLocationId(gqlA)
    const defaultB = await firstLocationId(gqlB)
    // The two really are separate households, not one read twice. Without
    // this, every assertion below would pass against a server that ignored
    // the header.
    expect(defaultA).not.toBe(defaultB)

    // When each imports a batch with the bare id `no-vendor` AND a new,
    // correctly prefixed cart id. The prefixed id is what makes "nothing in
    // the batch is written" able to fail (H4 plan, rule 17): a server that
    // refused the bare id row by row would still write it.
    //
    // Then each batch is refused with `BAD_USER_INPUT`. `makeGql` throws the
    // GraphQL errors as JSON text, so the regex matches the error CODE.
    for (const [gql, locationId] of [
      [gqlA, defaultA],
      [gqlB, defaultB],
    ] as const) {
      await expect(
        gql<{ bulkCreateShoppingCarts: Row[] }>(BULK_CREATE_CARTS, {
          carts: [{ id: `${locationId}:no-vendor` }, { id: BARE_CART_ID }],
        }),
      ).rejects.toThrow(/"code":"BAD_USER_INPUT"/)
    }

    // And neither household holds any cart row
    const cartsA = await gqlA<{ allCarts: Row[] }>(ALL_CARTS)
    const cartsB = await gqlB<{ allCarts: Row[] }>(ALL_CARTS)
    expect(cartsA.allCarts).toEqual([])
    expect(cartsB.allCarts).toEqual([])

    // And the same batch without the bare id IS written: the positive
    // control, so the two empty lists above cannot come from a mutation that
    // writes nothing at all
    const created = await gqlA<{ bulkCreateShoppingCarts: Row[] }>(
      BULK_CREATE_CARTS,
      { carts: [{ id: `${defaultA}:no-vendor` }] },
    )
    expect(created.bulkCreateShoppingCarts.map((c) => c.id)).toEqual([
      `${defaultA}:no-vendor`,
    ])
  })

  test('user cannot import a cart under another household’s cart id, nor put cart items in it', async ({
    request,
  }) => {
    // Given two separate households, each with its own first location and item
    const gqlA = makeGql(request, E2E_USER_ID)
    const gqlB = makeGql(request, E2E_SECOND_USER_ID)
    const defaultA = await firstLocationId(gqlA)
    const defaultB = await firstLocationId(gqlB)
    expect(defaultA).not.toBe(defaultB)
    const { createItem: itemA } = await gqlA<{ createItem: Row }>(CREATE_ITEM, {
      input: { name: 'Milk A' },
    })
    const { createItem: itemB } = await gqlB<{ createItem: Row }>(CREATE_ITEM, {
      input: { name: 'Milk B' },
    })

    // And household A holds the cart `${defaultA}:no-vendor`
    const cartIdA = `${defaultA}:no-vendor`
    await gqlA(BULK_CREATE_CARTS, { carts: [{ id: cartIdA }] })

    // When B imports a cart under A's cart id
    // Then the whole mutation is REFUSED with `FORBIDDEN`: the id's prefix is
    // a location of another household. THIS IS THE LINE THE CART GUARD OWNS.
    await expect(
      gqlB<{ bulkCreateShoppingCarts: Row[] }>(BULK_CREATE_CARTS, {
        carts: [{ id: cartIdA }],
      }),
    ).rejects.toThrow(/"code":"FORBIDDEN"/)

    // And A still holds its one cart (asserted BEFORE B's absence, so a query
    // that returned nothing could not satisfy both), and B holds none
    const cartsA = await gqlA<{ allCarts: Row[] }>(ALL_CARTS)
    expect(cartsA.allCarts.map((c) => c.id)).toEqual([cartIdA])
    const cartsB = await gqlB<{ allCarts: Row[] }>(ALL_CARTS)
    expect(cartsB.allCarts.map((c) => c.id)).toEqual([])

    // When A puts a cart item in its own cart
    // Then it is written — the positive control for B's empty result below
    const itemsForA = await gqlA<{ bulkCreateCartItems: CartItemRow[] }>(
      BULK_CREATE_CART_ITEMS,
      {
        cartItems: [
          { id: 'ci-a', cartId: cartIdA, itemId: itemA.id, quantity: 1 },
        ],
      },
    )
    expect(itemsForA.bulkCreateCartItems.map((ci) => ci.cartId)).toEqual([
      cartIdA,
    ])

    // When B imports a cart item naming A's cart
    // Then nothing is written, and the call does not throw. A cart the caller
    // may not use is skipped exactly like a cart that is gone, on purpose: a
    // partial backup legitimately names a missing parent, and a refusal here
    // would turn the mutation into a probe for another household's ids.
    // THIS IS THE LINE THE SCOPED CART LOOKUP IN `resolveCartItemParents` OWNS.
    const itemsForB = await gqlB<{ bulkCreateCartItems: CartItemRow[] }>(
      BULK_CREATE_CART_ITEMS,
      {
        cartItems: [
          { id: 'ci-b', cartId: cartIdA, itemId: itemB.id, quantity: 3 },
        ],
      },
    )
    expect(itemsForB.bulkCreateCartItems).toHaveLength(0)

    // And the cart items read back the way they were written: A has one, B
    // none
    const allForA = await gqlA<{ allCartItems: CartItemRow[] }>(ALL_CART_ITEMS)
    const allForB = await gqlB<{ allCartItems: CartItemRow[] }>(ALL_CART_ITEMS)
    expect(allForA.allCartItems.map((ci) => ci.id)).toEqual(['ci-a'])
    expect(allForB.allCartItems.map((ci) => ci.id)).toEqual([])

    // And through the number the app shows. `cartItemCountByItem` with a
    // `locationId` reads the cart's `locationId` COLUMN, not the id string.
    // A's own row counts at A's location (the positive control); B's item has
    // no cart row anywhere.
    const countA = await gqlA<{ cartItemCountByItem: number }>(
      CART_ITEM_COUNT,
      { itemId: itemA.id, locationId: defaultA },
    )
    expect(countA.cartItemCountByItem).toBe(1)
    const countBAnywhere = await gqlB<{ cartItemCountByItem: number }>(
      CART_ITEM_COUNT,
      { itemId: itemB.id, locationId: null },
    )
    expect(countBAnywhere.cartItemCountByItem).toBe(0)
    const countBAtOwn = await gqlB<{ cartItemCountByItem: number }>(
      CART_ITEM_COUNT,
      { itemId: itemB.id, locationId: defaultB },
    )
    expect(countBAtOwn.cartItemCountByItem).toBe(0)
  })

  test('a location-prefixed cart id gives each account its own cart row', async ({
    request,
  }) => {
    // This is the shape PR 4b makes the import path produce, and it is here to
    // show the contrast: with the location in the id, the two accounts' ids
    // differ because their location ids differ, so nothing is shared.
    //
    // The ownership guard changes nothing here, because neither id is held by
    // anybody when it is imported. It refuses a stranger's row, never a new
    // one.
    //
    // It is NOT a test of PR 4b's client fix — the ids here are built by the
    // test, not by `importData.ts`. The client fix is proved in
    // `apps/web/src/lib/importData.test.ts`.
    const gqlA = makeGql(request, E2E_USER_ID)
    const gqlB = makeGql(request, E2E_SECOND_USER_ID)

    // Given each account's own first location, "Home"
    const { locations: locationsA } = await gqlA<{
      locations: { id: string }[]
    }>(LOCATIONS)
    const { locations: locationsB } = await gqlB<{
      locations: { id: string }[]
    }>(LOCATIONS)
    const defaultA = locationsA[0]?.id as string
    const defaultB = locationsB[0]?.id as string
    expect(defaultA).not.toBe(defaultB)

    // When each imports its no-vendor cart under the composite id
    const createdForA = await gqlA<{ bulkCreateShoppingCarts: Row[] }>(
      BULK_CREATE_CARTS,
      { carts: [{ id: `${defaultA}:no-vendor` }] },
    )
    const createdForB = await gqlB<{ bulkCreateShoppingCarts: Row[] }>(
      BULK_CREATE_CARTS,
      { carts: [{ id: `${defaultB}:no-vendor` }] },
    )

    // Then both cart rows exist, one per account
    expect(createdForA.bulkCreateShoppingCarts.map((c) => c.id)).toEqual([
      `${defaultA}:no-vendor`,
    ])
    expect(createdForB.bulkCreateShoppingCarts.map((c) => c.id)).toEqual([
      `${defaultB}:no-vendor`,
    ])
  })
})
