import { expect, test } from '@playwright/test'
import { E2E_SECOND_USER_ID, E2E_USER_ID } from '../constants'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE DEMONSTRATES ──────────────────────────────────────────────
//
// That a BARE cart id — one with no location prefix, such as `'no-vendor'` —
// is shared across accounts. Two users import a cart under that id, and the
// SECOND user's cart items end up attached to the FIRST user's `Cart` row.
//
// Three pieces of the server make that happen, all read from the code:
//
//   1. `Cart.id` is a GLOBAL primary key with no `userId` in it
//      (apps/server/prisma/schema.prisma), so one account can hold an id for
//      everybody.
//   2. `bulkCreateShoppingCarts` (apps/server/src/resolvers/import.resolver.ts)
//      asks `prisma.cart.findUnique({ where: { id } })` — UNSCOPED — and
//      `continue`s when a row answers. The second user therefore gets no cart
//      row of their own, and no error either.
//   3. `bulkCreateCartItems` resolves `cartId` with the same unscoped
//      `findUnique`, so the second user's cart items are created pointing at
//      the first user's cart.
//
// ── WHAT THIS FILE DOES *NOT* PROVE ──────────────────────────────────────────
//
// **It does not prove that the real import path still produces bare cart ids.**
// This spec hands the bare id to the server itself. Whether the CLIENT ever
// sends one is a separate question, and the answer lives in a unit test:
//
//     apps/web/src/lib/importData.test.ts
//     → describe('importCloudData — a cart id keeps its location prefix (PR 4b task 3)')
//
// Those two tests are RED today, because `flattenPayloadForCloud` slices the
// location prefix off on the way to cloud. **They are the proof.** This file is
// not.
//
// ── THIS IS A NEGATIVE CONTROL, AND IT STAYS GREEN AFTER PR 4b ───────────────
//
// In the sense root `CLAUDE.md` describes under *Proving a Test Works*: it is
// GREEN today and it will still be GREEN after cloud-locations PR 4b ships.
// There is no red-to-green transition here and there cannot be one.
//
// PR 4b's fix is on the CLIENT: stop stripping the prefix, so no bare cart id
// is ever uploaded. It does not change the server at all, so the behaviour this
// file pins is untouched. Two accounts still genuinely cannot both hold the
// primary key `'no-vendor'` — no client change can make them.
//
// So do not count this file as evidence that the leak is closed. Read it as a
// characterisation of a hazard that survives this PR. A test reported as
// coverage it does not give is worse than no test at all.
//
// ── THE UNDERLYING CLASS OF HOLE IS ISSUE #327 ───────────────────────────────
//
// The unscoped `findUnique`-then-`continue` / `-upsert` pattern is not specific
// to carts. Issue **#327** tracks it across the whole import surface: nine
// `bulkUpsert*` mutations let one user take ownership of another's row, and
// nine `bulkCreate*` mutations silently drop the caller's own row because a
// stranger holds the id. Closing #327 is what would make a bare id safe. This
// PR does not attempt it.
//
// ── WHY THERE IS NO BROWSER ──────────────────────────────────────────────────
//
// `VITE_E2E_TEST_USER_ID` is baked into the web build as a single value
// (e2e/playwright.config.ts), so the browser can only ever be `E2E_USER_ID`.
// A second user is reachable only by setting the `x-e2e-user-id` header per
// request, which is what `makeGql(request, userId)` does. Everything below is
// GraphQL, like `location-scoped-writes.spec.ts` and `cleanup-endpoint.spec.ts`.
// This file runs in the `cloud` project only — named in that project's
// `testMatch` and in the `local` project's `testIgnore`.
//
// ── TEARDOWN COVERS BOTH USERS ───────────────────────────────────────────────
//
// `/e2e/cleanup` deletes `{ where: { userId } }` for one user per call, so both
// hooks below call it twice. The second user's rows are invisible to every
// other cloud spec's teardown, so leaving them behind would fail a later spec
// for a reason nobody would trace back here.

type Row = { id: string }
type CartItemRow = { id: string; cartId: string; itemId: string }

// A bare cart id: no location prefix, no colon. This is exactly the shape
// `flattenPayloadForCloud` produces today for the no-vendor cart.
const BARE_CART_ID = 'no-vendor'

const LOCATIONS = `query { locations { id name isDefault } }`
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

test.describe('cloud import — a bare cart id is shared across accounts', () => {
  test('a bare cart id imported by two accounts puts the second account’s cart items in the first account’s cart', async ({
    request,
  }) => {
    // Given two separate accounts, each with their own default location and item
    const gqlA = makeGql(request, E2E_USER_ID)
    const gqlB = makeGql(request, E2E_SECOND_USER_ID)

    const { locations: locationsA } = await gqlA<{
      locations: { id: string; isDefault: boolean }[]
    }>(LOCATIONS)
    const { locations: locationsB } = await gqlB<{
      locations: { id: string; isDefault: boolean }[]
    }>(LOCATIONS)
    const defaultA = locationsA.find((l) => l.isDefault)?.id
    const defaultB = locationsB.find((l) => l.isDefault)?.id
    expect(defaultA).toBeTruthy()
    expect(defaultB).toBeTruthy()
    // The two accounts really are separate accounts, not one account read
    // twice. Without this, every assertion below would pass against a server
    // that ignored the header entirely.
    expect(defaultA).not.toBe(defaultB)

    const { createItem: itemA } = await gqlA<{ createItem: Row }>(CREATE_ITEM, {
      input: { name: 'Milk A' },
    })
    const { createItem: itemB } = await gqlB<{ createItem: Row }>(CREATE_ITEM, {
      input: { name: 'Milk B' },
    })

    // When account A imports a backup whose cart id has no location prefix
    const createdForA = await gqlA<{ bulkCreateShoppingCarts: Row[] }>(
      BULK_CREATE_CARTS,
      { carts: [{ id: BARE_CART_ID }] },
    )
    expect(createdForA.bulkCreateShoppingCarts.map((c) => c.id)).toEqual([
      BARE_CART_ID,
    ])

    // And account B then imports a backup using that same bare id
    const createdForB = await gqlB<{ bulkCreateShoppingCarts: Row[] }>(
      BULK_CREATE_CARTS,
      { carts: [{ id: BARE_CART_ID }] },
    )

    // Then B's cart was silently NOT created — no error, no row
    expect(createdForB.bulkCreateShoppingCarts).toEqual([])
    const cartsB = await gqlB<{ allCarts: Row[] }>(ALL_CARTS)
    expect(cartsB.allCarts.map((c) => c.id)).toEqual([])

    // And the one `no-vendor` cart row in the database belongs to A
    const cartsA = await gqlA<{ allCarts: Row[] }>(ALL_CARTS)
    expect(cartsA.allCarts.map((c) => c.id)).toEqual([BARE_CART_ID])

    // And B's cart items are created anyway, pointing at A's cart row
    const itemsForB = await gqlB<{ bulkCreateCartItems: CartItemRow[] }>(
      BULK_CREATE_CART_ITEMS,
      {
        cartItems: [
          { id: 'ci-b', cartId: BARE_CART_ID, itemId: itemB.id, quantity: 3 },
        ],
      },
    )
    expect(itemsForB.bulkCreateCartItems).toHaveLength(1)
    expect(itemsForB.bulkCreateCartItems[0].cartId).toBe(BARE_CART_ID)

    // And that is the harm, read two ways.
    //
    // First: B owns a cart item that B can find nowhere. It is counted
    // whole-account, but at none of B's own locations — because the cart it
    // hangs from is at a location of A's. `cartItemCountByItem` with a
    // `locationId` is the number the shopping page and the Stock tab's
    // "remove from location" confirmation both show.
    const countAnywhere = await gqlB<{ cartItemCountByItem: number }>(
      CART_ITEM_COUNT,
      { itemId: itemB.id, locationId: null },
    )
    expect(countAnywhere.cartItemCountByItem).toBe(1)
    const countAtOwnLocation = await gqlB<{ cartItemCountByItem: number }>(
      CART_ITEM_COUNT,
      { itemId: itemB.id, locationId: defaultB },
    )
    expect(countAtOwnLocation.cartItemCountByItem).toBe(0)

    // Second: A's cart now holds a row A never put there. A's own cart items
    // are untouched, so the two accounts' rows are mixed inside one cart.
    const itemsForA = await gqlA<{ bulkCreateCartItems: CartItemRow[] }>(
      BULK_CREATE_CART_ITEMS,
      {
        cartItems: [
          { id: 'ci-a', cartId: BARE_CART_ID, itemId: itemA.id, quantity: 1 },
        ],
      },
    )
    expect(itemsForA.bulkCreateCartItems).toHaveLength(1)

    const allForA = await gqlA<{ allCartItems: CartItemRow[] }>(ALL_CART_ITEMS)
    const allForB = await gqlB<{ allCartItems: CartItemRow[] }>(ALL_CART_ITEMS)
    // `allCartItems` is scoped by `CartItem.userId`, so neither account SEES
    // the other's row. Both rows name the same `cartId` all the same.
    expect(allForA.allCartItems.map((ci) => ci.id)).toEqual(['ci-a'])
    expect(allForB.allCartItems.map((ci) => ci.id)).toEqual(['ci-b'])
    expect([
      ...allForA.allCartItems.map((ci) => ci.cartId),
      ...allForB.allCartItems.map((ci) => ci.cartId),
    ]).toEqual([BARE_CART_ID, BARE_CART_ID])
  })

  test('a location-prefixed cart id gives each account its own cart row', async ({
    request,
  }) => {
    // This is the shape PR 4b makes the import path produce, and it is here to
    // show the contrast: with the location in the id, the two accounts' ids
    // differ because their location ids differ, so nothing is shared.
    //
    // It is NOT a test of PR 4b's client fix — the ids here are built by the
    // test, not by `importData.ts`. The client fix is proved in
    // `apps/web/src/lib/importData.test.ts`.
    const gqlA = makeGql(request, E2E_USER_ID)
    const gqlB = makeGql(request, E2E_SECOND_USER_ID)

    // Given each account's own default location
    const { locations: locationsA } = await gqlA<{
      locations: { id: string; isDefault: boolean }[]
    }>(LOCATIONS)
    const { locations: locationsB } = await gqlB<{
      locations: { id: string; isDefault: boolean }[]
    }>(LOCATIONS)
    const defaultA = locationsA.find((l) => l.isDefault)?.id as string
    const defaultB = locationsB.find((l) => l.isDefault)?.id as string
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
