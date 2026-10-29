import { expect, test } from '@playwright/test'
import { E2E_SECOND_USER_ID, E2E_USER_ID } from '../constants'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// That a BARE cart id — one with no location prefix, such as `'no-vendor'` —
// can no longer be used by one account to reach another account's `Cart` row.
// Two users import a cart under that id. The first one wins the id. The second
// one is REFUSED with `FORBIDDEN`, and writes nothing.
//
// Four pieces of the server make that true, all read from the code:
//
//   1. `Cart.id` is a GLOBAL primary key with no `userId` in it
//      (apps/server/prisma/schema.prisma), so one account can hold an id for
//      everybody. That has not changed and cannot change here.
//   2. `bulkCreateShoppingCarts` (apps/server/src/resolvers/import.resolver.ts)
//      now calls `requireOwnRowIdsOrUnclaimed(ctx, 'cart', carts)` before its
//      first write. A cart id held by a stranger throws `FORBIDDEN`; an id no
//      row holds is free; an id the caller already owns is skipped. It used to
//      ask `prisma.cart.findUnique({ where: { id } })` — UNSCOPED — and
//      `continue` when any row answered, so the second user got no cart row of
//      their own and no error either.
//   3. `bulkCreateCartItems` resolves `cartId` with
//      `findFirst({ where: { id: cartId, userId } })` — SCOPED. It used to use
//      the same unscoped `findUnique`, so the second user's cart items were
//      created pointing at the first user's cart.
//   4. `bulkUpsertCartItems` carries the same scoped lookup, so the `replace`
//      import strategy cannot do it either.
//
// This is the ONLY real-SQL, two-user test of that guard. Every other test of
// it runs against the hand-written Prisma fake in
// `apps/server/src/resolvers/import-ownership-cart.resolver.test.ts`.
//
// ── WHAT THIS FILE DOES *NOT* PROVE ──────────────────────────────────────────
//
// **It does not prove anything about the CLIENT.** This spec hands the bare id
// to the server itself. Whether the client ever sends one is a separate
// question, answered by a unit test:
//
//     apps/web/src/lib/importData.test.ts
//     → describe('importCloudData — a cart id keeps its location prefix (PR 4b task 3)')
//
// Those tests are green since cloud locations PR 4b, which stopped
// `flattenPayloadForCloud` slicing the location prefix off on the way to
// cloud. So two layers now stand between a backup and another account's cart:
// the client keeps the prefix, and the server refuses a stranger's id anyway.
//
// **It covers two mutations, not the whole import surface.** The guard runs in
// nine `bulkCreate*` and nine `bulkUpsert*` mutations. This file reaches
// `bulkCreateShoppingCarts` and `bulkCreateCartItems`. The other sixteen are
// covered by the server unit tests only, against the fake.
//
// **It does not prove the refusal is atomic.** "One forbidden row writes
// nothing at all" is asserted in the server unit tests, which send a batch of
// several carts. This file sends one cart per call.
//
// ── ISSUE #327 IS CLOSED BY THIS BRANCH ──────────────────────────────────────
//
// The unscoped `findUnique`-then-`continue` / `-upsert` pattern was never
// specific to carts. Issue **#327** tracked it across the whole import
// surface: nine `bulkUpsert*` mutations let one user take ownership of
// another's row, and nine `bulkCreate*` mutations silently dropped the
// caller's own row because a stranger held the id.
//
// Branch `fix/import-ownership-guard` closes it. `requireOwnRowOrUnclaimed`
// (apps/server/src/lib/authz.ts) is the one function that decides account
// ownership for all nine models, and
// `requireOwnRowIdsOrUnclaimed` (import.resolver.ts) applies it to a whole
// payload before the first write. See
// `docs/features/settings/2026-10-28-design-import-ownership-guard.md`.
//
// **So this file is no longer a negative control.** It used to be labelled one
// — green before the fix and green after it, because PR 4b changed only the
// client. That is over: test 1 below asserts a refusal that did not exist
// before this branch, so it is red on `main` and green here.
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

// A bare cart id: no location prefix, no colon. This is the shape
// `flattenPayloadForCloud` produced before cloud locations PR 4b, and the
// shape a hand-edited backup can still carry.
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

test.describe('cloud import — a bare cart id another account holds is refused', () => {
  test('user cannot import a cart under a bare id that another account holds', async ({
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
    // Then A holds the id. A free id is still free — the guard refuses a
    // stranger's row, never a new one.
    expect(createdForA.bulkCreateShoppingCarts.map((c) => c.id)).toEqual([
      BARE_CART_ID,
    ])

    // When account B then imports a backup using that same bare id
    // Then the whole mutation is REFUSED. `makeGql` throws when the response
    // carries GraphQL errors, and its message is `JSON.stringify(json.errors)`.
    //
    // Measured in process on 2026-10-28 with this repo's own `@apollo/server`:
    // a `GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } })` —
    // which is byte for byte what `requireOwnRowOrUnclaimed` throws — comes
    // back as
    // `[{"message":"Forbidden",...,"extensions":{"code":"FORBIDDEN",...}}]`.
    // So the regex below matches the error CODE, not the message: the message
    // is `Forbidden`, in mixed case.
    //
    // THIS IS THE LINE THE CART GUARD OWNS. Delete
    // `requireOwnRowIdsOrUnclaimed(ctx, 'cart', carts)` from
    // `bulkCreateShoppingCarts` and this assertion is the one that goes red.
    // Nothing else in this test changes: A still holds the row and B still has
    // none, either way.
    //
    // UNVERIFIED PREDICTION, not a measurement — no Playwright run was made
    // for it. With the guard gone there is no existence check left at all, so
    // `prisma.cart.create` should reach A's primary key and Postgres should
    // answer `P2002`. That is still a rejection, with the wrong error inside
    // it, so the regex should fail rather than the `await` itself. If instead
    // somebody restores the old unscoped `findUnique`-then-`continue`, the
    // call RESOLVES with `[]` and this line fails for not rejecting at all.
    await expect(
      gqlB<{ bulkCreateShoppingCarts: Row[] }>(BULK_CREATE_CARTS, {
        carts: [{ id: BARE_CART_ID }],
      }),
    ).rejects.toThrow(/FORBIDDEN/)

    // And the one `no-vendor` cart row in the database still belongs to A,
    // unchanged. Asserted BEFORE B's absence, so a query that returned nothing
    // at all could not satisfy both.
    const cartsA = await gqlA<{ allCarts: Row[] }>(ALL_CARTS)
    expect(cartsA.allCarts.map((c) => c.id)).toEqual([BARE_CART_ID])

    // And B has no cart row. Same outcome as before this branch, now because
    // B was told no instead of being silently skipped.
    const cartsB = await gqlB<{ allCarts: Row[] }>(ALL_CARTS)
    expect(cartsB.allCarts.map((c) => c.id)).toEqual([])

    // When A puts a cart item in A's own cart
    // Then it is written — the positive control for everything below. It
    // proves `bulkCreateCartItems` works at all, so B's empty result cannot be
    // a broken mutation.
    const itemsForA = await gqlA<{ bulkCreateCartItems: CartItemRow[] }>(
      BULK_CREATE_CART_ITEMS,
      {
        cartItems: [
          { id: 'ci-a', cartId: BARE_CART_ID, itemId: itemA.id, quantity: 1 },
        ],
      },
    )
    expect(itemsForA.bulkCreateCartItems).toHaveLength(1)
    expect(itemsForA.bulkCreateCartItems[0].cartId).toBe(BARE_CART_ID)

    // When B imports a cart item naming A's cart id
    // Then nothing is written. B's cart items can no longer land inside A's
    // cart row, which is the second half of the leak.
    //
    // THIS IS THE LINE TASK 8's SCOPED LOOKUP OWNS. Change
    // `prisma.cart.findFirst({ where: { id: cartId, userId } })` back to
    // `prisma.cart.findUnique({ where: { id: cartId } })` in
    // `bulkCreateCartItems` and this assertion should go red reading
    // `Expected length: 0 / Received length: 1`. UNVERIFIED PREDICTION — no
    // Playwright run was made for it. It fails on a VALUE, not on a missing
    // element, which is why the length is asserted here and not only the
    // absence from `allCartItems` below.
    //
    // The call does NOT throw. A cart the caller may not use is skipped
    // exactly like a cart that is gone, on purpose: a partial backup
    // legitimately names a missing parent, and a distinguishable refusal would
    // turn the mutation into a probe for another account's ids.
    const itemsForB = await gqlB<{ bulkCreateCartItems: CartItemRow[] }>(
      BULK_CREATE_CART_ITEMS,
      {
        cartItems: [
          { id: 'ci-b', cartId: BARE_CART_ID, itemId: itemB.id, quantity: 3 },
        ],
      },
    )
    expect(itemsForB.bulkCreateCartItems).toHaveLength(0)

    // And the two accounts' cart items read back the way they were written:
    // A has one, B has none. `allCartItems` is scoped by `CartItem.userId`.
    const allForA = await gqlA<{ allCartItems: CartItemRow[] }>(ALL_CART_ITEMS)
    const allForB = await gqlB<{ allCartItems: CartItemRow[] }>(ALL_CART_ITEMS)
    expect(allForA.allCartItems.map((ci) => ci.id)).toEqual(['ci-a'])
    expect(allForA.allCartItems.map((ci) => ci.cartId)).toEqual([BARE_CART_ID])
    expect(allForB.allCartItems.map((ci) => ci.id)).toEqual([])

    // And the harm is gone, read through the number the app shows.
    // `cartItemCountByItem` with a `locationId` resolves through
    // `where: { itemId, userId, cart: { locationId } }`, so it reads the
    // cart's `locationId` COLUMN rather than parsing the id string. It is the
    // number the shopping page and the Stock tab's "remove from location"
    // confirmation both display.
    //
    // A's own row counts at A's own location — the positive control, so a
    // query that counted nothing could not pass the two zeros below.
    const countForAAtOwnLocation = await gqlA<{ cartItemCountByItem: number }>(
      CART_ITEM_COUNT,
      { itemId: itemA.id, locationId: defaultA },
    )
    expect(countForAAtOwnLocation.cartItemCountByItem).toBe(1)

    // B owns no cart item anywhere. Before this branch B owned one that B
    // could find nowhere: counted whole-account, but at none of B's own
    // locations, because the cart it hung from was at a location of A's.
    const countForBAnywhere = await gqlB<{ cartItemCountByItem: number }>(
      CART_ITEM_COUNT,
      { itemId: itemB.id, locationId: null },
    )
    expect(countForBAnywhere.cartItemCountByItem).toBe(0)
    const countForBAtOwnLocation = await gqlB<{ cartItemCountByItem: number }>(
      CART_ITEM_COUNT,
      { itemId: itemB.id, locationId: defaultB },
    )
    expect(countForBAtOwnLocation.cartItemCountByItem).toBe(0)
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
