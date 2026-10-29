import { ApolloServer } from '@apollo/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── What this file covers ───────────────────────────────────────────────────
//
// The ownership guard on the four Cart / CartItem import mutations:
// `bulkCreateShoppingCarts`, `bulkCreateCartItems`,
// `bulkUpsertShoppingCarts` and `bulkUpsertCartItems`. Issue #327, task 6.
//
// Before the guard each had the two holes the other seven models had. A
// `bulkUpsert*` ran `upsert({ where: { id } })` with `userId` inside `update`,
// so a payload naming another account's row id OVERWROTE that row and took
// ownership of it. A `bulkCreate*` ran an UNSCOPED
// `findUnique({ where: { id } })` and skipped on a hit, so a stranger's row
// read as "already exists" and the caller's OWN cart or cart item was dropped
// with no error and no count.
//
// ─── Two guards, in this order ───────────────────────────────────────────────
//
// `bulkCreateShoppingCarts` and `bulkUpsertShoppingCarts` already had a
// location guard: `resolveCartLocations` reads the location id out of each
// cart id and sends it to `requireLocationRole`. The new cart-id guard runs
// AFTER it, so a stranger's live location is still refused first and the 19
// tests in `import-cart-location.resolver.test.ts` keep the error they assert.
//
// The two guards cover different columns, and neither replaces the other:
//
//   - `resolveCartLocations` guards the location a cart is written TO.
//   - `requireOwnRowIdsOrUnclaimed` guards the cart's OWN primary key.
//
// Why the cart-id guard is reachable at all, given the location guard: a cart
// id with NO colon names no location, so it falls back to the caller's default
// and the location guard refuses nothing. That is the pre-PR-3b cart id shape,
// and it is exactly the shape `cart-id-cross-user-leak.spec.ts` demonstrates
// against real Postgres — two accounts each holding a cart with the bare id
// `no-vendor`. So `CART_THEIRS` below is a BARE id. If it named the stranger's
// location instead, `resolveCartLocations` would throw first and every test
// here would pass with the new guard deleted. One test asserts that ordering
// on purpose, by counting the guard's own lookup.
//
// ─── Why this file is separate from import.resolver.test.ts ──────────────────
//
// That file mocks every Prisma model as a plain `vi.fn()` call recorder, and
// task 3 armed all nine `findUnique` / `findFirst` recorders to resolve `null`
// so its 11 tests keep answering "nobody holds this id" for any id. An
// ownership assertion written against those stubs therefore CANNOT fail, and a
// recorder cannot show which `userId` a row ended up with. Root CLAUDE.md,
// "Write test doubles to model the constraint, not the happy path".
//
// It is also separate from `import-cart-location.resolver.test.ts`, whose
// subject is the `locationId` COLUMN each cart lands in. `vi.mock` is per
// FILE, and that file's `cart` store is `shoppingFake`, which models a cart
// row's four columns and no owner assertions. This file uses `ownedRowFake`
// instead, because what it has to read back is `userId`.
//
// ─── The fakes ───────────────────────────────────────────────────────────────
//
//   - `src/test/stockFake.ts` for `location`, so `resolveCartLocations`,
//     `requireLocationRole` and `ensureDefaultLocation` run against real rows.
//   - `src/test/ownedRowFake.ts` for `cart`, `cartItem` and `item`. Three of
//     the things it models are what let these tests fail: `where` is applied
//     KEY BY KEY (Prisma's own semantics), `upsert` keeps `create` and
//     `update` apart and applies `update` key by key — which is what makes a
//     `userId` left in `update` visible as a row that CHANGED OWNER — and an
//     `update` key whose value is `undefined` counts as "not mentioned",
//     Prisma's rule, which is what keeps a stored `lastPurchasedAt` alive when
//     the payload omits it.
//   - `item` is here only because `bulkCreateCartItems` checks that the
//     payload's `itemId` exists before it writes. That check is still
//     UNSCOPED, and so is its `cartId` twin — a separate hole that plan task 8
//     closes, not this one.
vi.mock('../lib/prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')

  const stock = createStockFake()

  const cart = createOwnedRowFake<{
    id: string
    userId: string
    locationId: string
    lastPurchasedAt: Date | null
  }>({ model: 'Cart' })

  const cartItem = createOwnedRowFake<{
    id: string
    userId: string
    cartId: string
    itemId: string
    quantity: number
  }>({ model: 'CartItem' })

  const item = createOwnedRowFake<{ id: string; userId: string; name: string }>({
    model: 'Item',
  })

  // `findUnique` is wrapped in a `vi.fn` on top of the fake's real row
  // matching, for two reasons: a test can make one lookup answer "nobody holds
  // this id" (see `simulateGuardMiss`), and a test can assert the guard's
  // lookup did NOT run, which is how the two guards' ORDER is pinned.
  const wrap = <T extends { findUnique: (...args: never[]) => unknown }>(client: T) => ({
    ...client,
    findUnique: vi.fn(client.findUnique),
  })

  return {
    prisma: {
      ...stock.client,
      location: {
        ...stock.client.location,
        // Wrapped so a test can count how many location checks ran.
        findFirst: vi.fn(stock.client.location.findFirst),
      },
      cart: wrap(cart.client),
      cartItem: wrap(cartItem.client),
      item: item.client,
      // Handles onto the fakes, hung off the mocked client because a `vi.mock`
      // factory is hoisted above every import and cannot close over a
      // module-scope binding.
      $stockFake: stock,
      $cart: cart,
      $cartItem: cartItem,
      $item: item,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { OwnedRowFake } from '../test/ownedRowFake.js'
import type { StockFake } from '../test/stockFake.js'

type CartRow = {
  id: string
  userId: string
  locationId: string
  lastPurchasedAt: Date | null
}
type CartItemRow = {
  id: string
  userId: string
  cartId: string
  itemId: string
  quantity: number
}
type ItemRow = { id: string; userId: string; name: string }

const mockPrisma = prisma as unknown as {
  cart: { findUnique: ReturnType<typeof vi.fn> }
  cartItem: { findUnique: ReturnType<typeof vi.fn> }
  location: { findFirst: ReturnType<typeof vi.fn> }
  $stockFake: StockFake
  $cart: OwnedRowFake<CartRow>
  $cartItem: OwnedRowFake<CartItemRow>
  $item: OwnedRowFake<ItemRow>
}

// ─── Server ──────────────────────────────────────────────────────────────────

let server: ApolloServer<Context>

beforeAll(async () => {
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

// ─── Fixture ─────────────────────────────────────────────────────────────────
//
// THREE LOCATIONS, two of them the caller's — copied from
// `import-itemStock.resolver.test.ts`. With ONE location, "the location the
// cart id names" and "the caller's default location" give the SAME answer, so
// a resolver that ignored the id entirely and wrote everything to the default
// would pass every assertion — the vacuous-fixture trap root CLAUDE.md
// describes, which shipped four useless tests in PR D. `LOC_OTHER` is the
// caller's and is NOT the default, so a hardcoded default is visible.
// `LOC_STRANGER` belongs to another account, so an unscoped lookup is visible
// too.
//
// TWO USERS, and per model THREE ids: one row the caller's, one row the
// STRANGER's, and an id no row holds. This is the single most important
// property of the file. With a one-user fixture, "the row this account owns"
// and "the row that exists" give the same answer, so a resolver with no
// ownership check at all would pass everything. `*_THEIRS` is what makes the
// guard distinguishable from no guard, and `*_FREE` is what keeps a legitimate
// new row provable.
//
// TWO CARTS of the caller's and TWO ITEMS of the caller's, so the cart item
// tests can MOVE a row from one parent to the other. That is what pins
// `cartId` and `itemId` STAYING in `bulkUpsertCartItems`' `update` payload —
// with a single cart and a single item there is nowhere to move to and the
// assertion could not fail.

const USER = 'user_import_cart_own_test'
const STRANGER = 'user_stranger'

const LOC_DEFAULT = 'loc_kitchen' // USER's default
const LOC_OTHER = 'loc_garage' // USER's, NOT default
const LOC_STRANGER = 'loc_theirs' // STRANGER's — must be refused

const VENDOR = 'vendor_costco'

const CART_MINE = `${LOC_OTHER}:${VENDOR}` // USER's, at the non-default location
const CART_OTHER = `${LOC_DEFAULT}:${VENDOR}` // USER's second cart
// The STRANGER's cart, under a BARE id — no colon, so it names no location and
// `resolveCartLocations` lets it through to the caller's default. That is the
// pre-PR-3b id shape, and the shape of the real collision
// `cart-id-cross-user-leak.spec.ts` reproduces against Postgres. A composite
// id naming `LOC_STRANGER` would be refused by the LOCATION guard instead, and
// then these tests would pass with the cart-id guard deleted.
const CART_THEIRS = 'no-vendor'
const CART_FREE = `${LOC_OTHER}:vendor_new` // no cart row holds it

const ITEM_MINE = 'item_milk' // USER's
const ITEM_OTHER = 'item_rice' // USER's second item
// The STRANGER's item, and an id no item row holds. Plan task 8 scoped both
// cart-item mutations' `cartId` and `itemId` lookups, and these two are what
// make a scoped lookup distinguishable from an unscoped one. With only the
// caller's two items in the store, "an item that exists" and "an item the
// caller owns" give the SAME answer and a reference test could not fail.
const ITEM_THEIRS = 'item_theirs' // STRANGER's
const ITEM_GONE = 'item_gone' // no Item row holds it

const CI_MINE = 'ci_mine' // USER's
const CI_THEIRS = 'ci_theirs' // STRANGER's — must be refused
const CI_FREE = 'ci_free' // no cart item row holds it

const TS = new Date('2026-01-01T00:00:00.000Z')
const STORED_PURCHASED = new Date('2026-02-01T00:00:00.000Z')
const PAYLOAD_PURCHASED = '2026-03-01T00:00:00.000Z'

beforeEach(() => {
  // `resetAllMocks`, not `clearAllMocks`. `clearAllMocks` empties the call
  // lists but LEAVES A QUEUED `mockImplementationOnce` in place, so a
  // `simulateGuardMiss` the test under it never reached would fire inside the
  // NEXT test instead. Measured on 2026-10-28 during the mutation checks:
  // with the guard deleted from `bulkUpsertShoppingCarts`, its
  // `cart.findUnique` was never called, the queued stub survived into
  // "user re-importing a cart they already own on the create path", made that
  // id read as unclaimed, and the create raised a P2002 — a SECOND red test
  // that the mutation did not cause. Since Vitest 2, `mockReset` restores the
  // implementation handed to `vi.fn(impl)`, so the three wrapped delegates
  // keep the fake's real row matching.
  vi.resetAllMocks()

  mockPrisma.$stockFake.reset([
    { id: LOC_OTHER, userId: USER, isDefault: false, name: 'Garage', order: 1, createdAt: TS, updatedAt: TS },
    { id: LOC_DEFAULT, userId: USER, isDefault: true, name: 'Kitchen', order: 0, createdAt: TS, updatedAt: TS },
    { id: LOC_STRANGER, userId: STRANGER, isDefault: true, name: 'Theirs', order: 0, createdAt: TS, updatedAt: TS },
  ])

  mockPrisma.$cart.reset([
    { id: CART_MINE, userId: USER, locationId: LOC_OTHER, lastPurchasedAt: STORED_PURCHASED },
    { id: CART_OTHER, userId: USER, locationId: LOC_DEFAULT, lastPurchasedAt: null },
    { id: CART_THEIRS, userId: STRANGER, locationId: LOC_STRANGER, lastPurchasedAt: null },
  ])

  mockPrisma.$cartItem.reset([
    { id: CI_MINE, userId: USER, cartId: CART_MINE, itemId: ITEM_MINE, quantity: 2 },
    { id: CI_THEIRS, userId: STRANGER, cartId: CART_THEIRS, itemId: ITEM_MINE, quantity: 7 },
  ])

  mockPrisma.$item.reset([
    { id: ITEM_MINE, userId: USER, name: 'Milk' },
    { id: ITEM_OTHER, userId: USER, name: 'Rice' },
    { id: ITEM_THEIRS, userId: STRANGER, name: 'Theirs' },
  ])
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTEXT: Context = { userId: USER }

async function exec(query: string, variables: Record<string, unknown>) {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: CONTEXT },
  )
  if (response.body.kind !== 'single') throw new Error('expected a single result')
  return response.body.singleResult
}

/** The `code` of the first GraphQL error, or `undefined` when there was none. */
function errorCode(result: Awaited<ReturnType<typeof exec>>) {
  return result.errors?.[0]?.extensions?.code
}

function storedCart(id: string) {
  return mockPrisma.$cart.state.rows.find((r) => r.id === id)
}

function storedCartItem(id: string) {
  return mockPrisma.$cartItem.state.rows.find((r) => r.id === id)
}

/**
 * Make the guard's ONE unscoped lookup answer "nobody holds this id", so the
 * payload's stranger id reaches the write.
 *
 * Why this exists. The test "user re-importing their own cart still replaces
 * it and keeps its owner" CANNOT catch a `userId` left in the `update`
 * payload: the row is already the caller's, so writing `USER` over `USER`
 * changes nothing. Task 4 measured that, task 5 measured it again, and both
 * recorded it. So the `userId`-out-of-`update` half of this fix needs a case
 * where the upsert really reaches a row that is NOT the caller's — which the
 * guard, working correctly, makes unreachable through GraphQL.
 *
 * Stubbing `findUnique` for one call simulates exactly the case that half is
 * defence against: a future edit drops the guard, or the guard's lookup misses
 * the row. It leaves the stored rows legal — one row per id, one owner each.
 * It depends on `requireOwnRowOrUnclaimed` reading `findUnique` BEFORE
 * `findFirst`; if that order ever changes, this helper stops working and the
 * tests using it go red rather than silently passing.
 *
 * It reaches the UPSERT path only. On the create path a guard miss cannot get
 * as far: `cart.create` / `cartItem.create` hits the stranger's row as a
 * duplicate primary key and raises P2002 first.
 *
 * What these tests do NOT prove: that the guard refuses the stranger's id.
 * That is what the FORBIDDEN tests prove, and here the simulated miss lets a
 * real write reach the stranger's row — which is the point.
 */
function simulateGuardMiss(delegate: { findUnique: ReturnType<typeof vi.fn> }) {
  delegate.findUnique.mockImplementationOnce(async () => null)
}

// ─── Queries ─────────────────────────────────────────────────────────────────

const CART_FIELDS = '{ id lastPurchasedAt }'
const CREATE_CARTS = `mutation ($carts: [ShoppingCartInput!]!) { bulkCreateShoppingCarts(carts: $carts) ${CART_FIELDS} }`
const UPSERT_CARTS = `mutation ($carts: [ShoppingCartInput!]!) { bulkUpsertShoppingCarts(carts: $carts) ${CART_FIELDS} }`

const CART_ITEM_FIELDS = '{ id cartId itemId quantity }'
const CREATE_CART_ITEMS = `mutation ($cartItems: [CartItemInput!]!) { bulkCreateCartItems(cartItems: $cartItems) ${CART_ITEM_FIELDS} }`
const UPSERT_CART_ITEMS = `mutation ($cartItems: [CartItemInput!]!) { bulkUpsertCartItems(cartItems: $cartItems) ${CART_ITEM_FIELDS} }`

// ─── Input builders ──────────────────────────────────────────────────────────

const cartIn = (id: string, lastPurchasedAt: string | null = null) => ({
  id,
  lastPurchasedAt,
})

const cartItemIn = (
  id: string,
  extra: { cartId?: string; itemId?: string; quantity?: number } = {},
) => ({
  id,
  cartId: extra.cartId ?? CART_MINE,
  itemId: extra.itemId ?? ITEM_MINE,
  quantity: extra.quantity ?? 1,
})

// ─── Cart ────────────────────────────────────────────────────────────────────

describe('Cart ownership', () => {
  it("user cannot import a cart under an id another account's row holds", async () => {
    // Given a payload naming the STRANGER's cart id. The id is bare, so the
    // LOCATION guard sends it to the caller's default and refuses nothing —
    // only the cart-id guard can stop it.
    const payload = [cartIn(CART_THEIRS, PAYLOAD_PURCHASED)]

    // When the create-path import runs
    const result = await exec(CREATE_CARTS, { carts: payload })

    // Then it is refused, and the stranger's row is untouched. Before the
    // guard this returned `[]` with NO error: the unscoped `findUnique` found
    // the stranger's row and the caller's own cart was silently dropped.
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$cart.state.rows).toHaveLength(3)
    expect(storedCart(CART_THEIRS)).toMatchObject({
      userId: STRANGER,
      locationId: LOC_STRANGER,
      lastPurchasedAt: null,
    })
  })

  it("user cannot take over another account's cart", async () => {
    // Given the same payload on the upsert path, which before the guard
    // overwrote the stranger's row AND reassigned it to the caller
    const payload = [cartIn(CART_THEIRS, PAYLOAD_PURCHASED)]

    // When the upsert-path import runs
    const result = await exec(UPSERT_CARTS, { carts: payload })

    // Then it is refused and the stranger keeps their row, date and all
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$cart.state.rows).toHaveLength(3)
    expect(storedCart(CART_THEIRS)).toMatchObject({
      userId: STRANGER,
      locationId: LOC_STRANGER,
      lastPurchasedAt: null,
    })
  })

  it('user re-importing their own cart still replaces it and keeps its owner', async () => {
    // Given a payload naming the caller's OWN cart id with a new date
    const payload = [cartIn(CART_MINE, PAYLOAD_PURCHASED)]

    // When the upsert-path import runs
    const result = await exec(UPSERT_CARTS, { carts: payload })

    // Then the date is replaced and the owner is unchanged.
    //
    // The owner assertion here is a NEGATIVE CONTROL, not coverage. The row is
    // already the caller's, so putting `userId` back into the `update` payload
    // writes `USER` over `USER` and this test stays green. Measured on
    // 2026-10-28, the same way task 4 and task 5 measured it. The test that
    // DOES catch a `userId` in `update` is "does not reassign a row's owner
    // even when the guard misses it" below.
    expect(result.errors).toBeUndefined()
    expect(storedCart(CART_MINE)).toMatchObject({
      userId: USER,
      locationId: LOC_OTHER,
      lastPurchasedAt: new Date(PAYLOAD_PURCHASED),
    })
  })

  it('user importing a batch with one forbidden cart gets no carts written at all', async () => {
    // Given an ALLOWED row placed AHEAD of the forbidden one. The order is the
    // test: if the guard ran inside the write loop, the first row would be on
    // disk before the second was refused, and these resolvers are not
    // transactional so nothing would roll it back.
    const payload = [cartIn(CART_FREE), cartIn(CART_THEIRS)]

    // When the create-path import runs
    const result = await exec(CREATE_CARTS, { carts: payload })

    // Then nothing was written — the allowed row is absent too
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$cart.state.rows.map((r) => r.id).sort()).toEqual(
      [CART_MINE, CART_OTHER, CART_THEIRS].sort(),
    )
  })

  it("bulkUpsertShoppingCarts does not reassign a row's owner even when the guard misses it", async () => {
    // Given the guard's lookup misses the stranger's row, so the upsert really
    // reaches it. This is the case `userId` being OUT of the `update` payload
    // is defence against: a future edit that drops the guard must not be able
    // to hand another account's cart to the importer.
    simulateGuardMiss(mockPrisma.cart)

    // When the caller upserts under the stranger's id
    const result = await exec(UPSERT_CARTS, { carts: [cartIn(CART_THEIRS, PAYLOAD_PURCHASED)] })

    // Then the row is still the STRANGER's, and it has not MOVED either —
    // `locationId` is out of `update` too. This is what goes red if `userId`
    // creeps back in.
    //
    // The mutation itself succeeds: these four resolvers have no closing read
    // to refuse, which is why the guard is the only thing standing here.
    expect(result.errors).toBeUndefined()
    expect(storedCart(CART_THEIRS)?.userId).toBe(STRANGER)
    expect(storedCart(CART_THEIRS)?.locationId).toBe(LOC_STRANGER)
  })

  it("user importing a cart that names a stranger's location is refused before the cart-id guard runs", async () => {
    // Given a cart id naming the STRANGER's location, for an id no cart row
    // holds. Both guards answer FORBIDDEN with the same message, so the error
    // alone cannot say which one fired. Counting the cart-id guard's own
    // lookup can.
    const payload = [cartIn(`${LOC_STRANGER}:${VENDOR}`)]

    // When the create-path import runs
    const result = await exec(CREATE_CARTS, { carts: payload })

    // Then it is refused, and the cart-id guard never ran: the location check
    // threw first. That ORDER is what keeps the 19 tests in
    // `import-cart-location.resolver.test.ts` asserting the error they assert.
    // Move `requireOwnRowIdsOrUnclaimed` above `resolveCartLocations` and this
    // goes red.
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.cart.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.$cart.state.rows).toHaveLength(3)
  })

  it('user re-importing a cart they already own on the create path skips it instead of failing', async () => {
    // Given the caller's OWN cart id on the CREATE path, with a new date. The
    // create path must skip a row it already holds rather than raise P2002.
    // The per-row `findUnique` this used to do was unscoped; the skip now
    // comes from the guard's returned `ownIds` set.
    const payload = [cartIn(CART_MINE, PAYLOAD_PURCHASED)]

    // When the create-path import runs
    const result = await exec(CREATE_CARTS, { carts: payload })

    // Then nothing is returned, nothing is written, and the stored date is the
    // one that was already there — "skip conflicts" means skip.
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateShoppingCarts).toEqual([])
    expect(storedCart(CART_MINE)?.lastPurchasedAt).toEqual(STORED_PURCHASED)
  })
})

// ─── CartItem ────────────────────────────────────────────────────────────────

describe('CartItem ownership', () => {
  it("user cannot import a cart item under an id another account's row holds", async () => {
    // Given a payload naming the STRANGER's cart item id
    const payload = [cartItemIn(CI_THEIRS, { quantity: 99 })]

    // When the create-path import runs
    const result = await exec(CREATE_CART_ITEMS, { cartItems: payload })

    // Then it is refused and the stranger's row is untouched. Before the guard
    // this returned `[]` with no error and the caller's own cart item was
    // silently dropped.
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$cartItem.state.rows).toHaveLength(2)
    expect(storedCartItem(CI_THEIRS)).toMatchObject({
      userId: STRANGER,
      cartId: CART_THEIRS,
      quantity: 7,
    })
  })

  it("user cannot take over another account's cart item", async () => {
    // Given the same payload on the upsert path, which before the guard
    // overwrote the stranger's row, reassigned it to the caller, AND moved it
    // into the caller's own cart
    const payload = [cartItemIn(CI_THEIRS, { quantity: 99 })]

    // When the upsert-path import runs
    const result = await exec(UPSERT_CART_ITEMS, { cartItems: payload })

    // Then it is refused and every column of the stranger's row survives
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$cartItem.state.rows).toHaveLength(2)
    expect(storedCartItem(CI_THEIRS)).toMatchObject({
      userId: STRANGER,
      cartId: CART_THEIRS,
      itemId: ITEM_MINE,
      quantity: 7,
    })
  })

  it('user re-importing their own cart item keeps its owner', async () => {
    // Given a payload naming the caller's OWN cart item id with a new quantity
    const payload = [cartItemIn(CI_MINE, { quantity: 5 })]

    // When the upsert-path import runs
    const result = await exec(UPSERT_CART_ITEMS, { cartItems: payload })

    // Then the quantity is replaced and the owner is unchanged. The owner
    // assertion is a NEGATIVE CONTROL — same reason as the cart version above:
    // the row is already the caller's, so a `userId` in `update` writes `USER`
    // over `USER` and cannot be seen here.
    expect(result.errors).toBeUndefined()
    expect(storedCartItem(CI_MINE)).toMatchObject({ userId: USER, quantity: 5 })
  })

  it('user importing a batch with one forbidden cart item gets no cart items written at all', async () => {
    // Given an ALLOWED row placed AHEAD of the forbidden one — same reason as
    // the cart batch test above.
    const payload = [cartItemIn(CI_FREE), cartItemIn(CI_THEIRS)]

    // When the create-path import runs
    const result = await exec(CREATE_CART_ITEMS, { cartItems: payload })

    // Then nothing was written — the allowed row is absent too
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$cartItem.state.rows.map((r) => r.id).sort()).toEqual(
      [CI_MINE, CI_THEIRS].sort(),
    )
  })

  it("bulkUpsertCartItems does not reassign a row's owner even when the guard misses it", async () => {
    // Given the guard's lookup misses the stranger's row, so the upsert really
    // reaches it — the case `userId` being OUT of `update` is defence against.
    simulateGuardMiss(mockPrisma.cartItem)

    // When the caller upserts under the stranger's id
    const result = await exec(UPSERT_CART_ITEMS, {
      cartItems: [cartItemIn(CI_THEIRS, { quantity: 99 })],
    })

    // Then the row is still the STRANGER's. This goes red if `userId` creeps
    // back into `update`.
    //
    // Note what this test does NOT claim. `cartId` and `itemId` DO stay in
    // `update` on purpose (design decision 3), so with the guard missed this
    // payload really does move the stranger's row into the caller's cart. That
    // is why the guard, not the `update` payload, is what closes the cart-item
    // hole — the owner column is the only part `update` protects.
    expect(result.errors).toBeUndefined()
    expect(storedCartItem(CI_THEIRS)?.userId).toBe(STRANGER)
  })

  it('user re-importing their own cart item moves it to the cart and item the payload names', async () => {
    // Given the caller's own cart item, stored in CART_MINE against ITEM_MINE,
    // and a payload that names the SAME cart item id under a DIFFERENT cart
    // and a different item — both the caller's.
    expect(storedCartItem(CI_MINE)).toMatchObject({ cartId: CART_MINE, itemId: ITEM_MINE })
    const payload = [cartItemIn(CI_MINE, { cartId: CART_OTHER, itemId: ITEM_OTHER, quantity: 3 })]

    // When the upsert-path import runs
    const result = await exec(UPSERT_CART_ITEMS, { cartItems: payload })

    // Then both parents follow the payload.
    //
    // This is the test for `cartId` and `itemId` STAYING in the `update`
    // payload. Local `importCartItems` does a Dexie `bulkPut`, which replaces
    // the whole row including both columns, so dropping either from `update`
    // would make the cloud `replace` strategy disagree with the local one —
    // design decision 3. Remove `cartId` from `update` and this goes red.
    expect(result.errors).toBeUndefined()
    expect(storedCartItem(CI_MINE)).toMatchObject({
      userId: USER,
      cartId: CART_OTHER,
      itemId: ITEM_OTHER,
      quantity: 3,
    })
  })

  it('user re-importing a cart item they already own on the create path skips it instead of failing', async () => {
    // Given the caller's OWN cart item id on the CREATE path with a new
    // quantity. The skip now comes from the guard's returned `ownIds` set, not
    // from the unscoped per-row `findUnique` it replaced.
    const payload = [cartItemIn(CI_MINE, { quantity: 42 })]

    // When the create-path import runs
    const result = await exec(CREATE_CART_ITEMS, { cartItems: payload })

    // Then nothing is returned and the stored quantity is the one already
    // there — "skip conflicts" means skip, and no P2002 escapes.
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateCartItems).toEqual([])
    expect(storedCartItem(CI_MINE)?.quantity).toBe(2)
  })
})

// ─── Cross-model references: CartItem → Cart, CartItem → Item ────────────────
//
// Plan task 8. The guards above protect each row's OWN primary key. These
// protect the OTHER two ids in a `CartItem` — the `cartId` and `itemId` the
// payload attaches its own row to.
//
// `bulkCreateCartItems` looked both up with an UNSCOPED
// `findUnique({ where: { id } })`, and `bulkUpsertCartItems` did not look them
// up at all. So the caller's own cart item could land inside a STRANGER's
// cart. That is exactly what `e2e/tests/cart-id-cross-user-leak.spec.ts`
// demonstrates against real Postgres, with the same bare cart id `no-vendor`
// this file uses for `CART_THEIRS`.
//
// A reference the caller may not use is SKIPPED, not refused — the rest of the
// batch still lands. The resolver comments say why: a partial backup
// legitimately names a cart or item that is gone, and making "not yours"
// distinguishable from "not there" turns the mutation into a probe for another
// account's ids. The `_GONE` tests below pin the two answers as the same.

describe('CartItem → Cart and CartItem → Item references', () => {
  it("user importing a cart item for another account's cart gets nothing written", async () => {
    // Given a FREE cart-item id pointing at the STRANGER's cart. The cart id
    // is bare, so no location guard is involved — only the scoped `cartId`
    // lookup can stop this.
    const payload = [cartItemIn(CI_FREE, { cartId: CART_THEIRS })]

    // When the create-path import runs
    const result = await exec(CREATE_CART_ITEMS, { cartItems: payload })

    // Then nothing is written and nothing is returned. The two seeded cart
    // items are all that remain, and the stranger's cart gained nothing.
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateCartItems).toEqual([])
    expect(storedCartItem(CI_FREE)).toBeUndefined()
    expect(mockPrisma.$cartItem.state.rows).toHaveLength(2)
  })

  it('user importing a cart item for a cart that no longer exists gets the same answer', async () => {
    // Given a FREE cart-item id pointing at a cart id NO row holds. This is
    // the NEGATIVE CONTROL for the `continue`-not-FORBIDDEN decision: a
    // deleted cart and a stranger's cart must be indistinguishable.
    const payload = [cartItemIn(CI_FREE, { cartId: `${LOC_OTHER}:vendor_nobody` })]

    // When the create-path import runs
    const result = await exec(CREATE_CART_ITEMS, { cartItems: payload })

    // Then the answer is the same as above: skipped, no error
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateCartItems).toEqual([])
    expect(storedCartItem(CI_FREE)).toBeUndefined()
  })

  it("user importing a cart item for another account's item gets nothing written", async () => {
    // Given a FREE cart-item id in the CALLER's own cart but naming the
    // STRANGER's item
    const payload = [cartItemIn(CI_FREE, { cartId: CART_MINE, itemId: ITEM_THEIRS })]

    // When the create-path import runs
    const result = await exec(CREATE_CART_ITEMS, { cartItems: payload })

    // Then nothing is written
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateCartItems).toEqual([])
    expect(storedCartItem(CI_FREE)).toBeUndefined()
  })

  it('user importing a cart item for an item that no longer exists gets the same answer', async () => {
    // Given a FREE cart-item id naming an item id NO row holds — the negative
    // control for `itemId`, matching the one for `cartId` above
    const payload = [cartItemIn(CI_FREE, { cartId: CART_MINE, itemId: ITEM_GONE })]

    // When the create-path import runs
    const result = await exec(CREATE_CART_ITEMS, { cartItems: payload })

    // Then the answer is the same
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateCartItems).toEqual([])
    expect(storedCartItem(CI_FREE)).toBeUndefined()
  })

  it('user importing a cart item for their own cart and item gets it written', async () => {
    // Given a FREE cart-item id naming the CALLER's own cart and item. A
    // lookup that refused everything would pass all four tests above.
    const payload = [cartItemIn(CI_FREE, { cartId: CART_OTHER, itemId: ITEM_OTHER, quantity: 4 })]

    // When the create-path import runs
    const result = await exec(CREATE_CART_ITEMS, { cartItems: payload })

    // Then the row is written into the cart the payload named — `CART_OTHER`,
    // not `CART_MINE`, so a resolver that hardcoded one cart is visible
    expect(result.errors).toBeUndefined()
    expect(storedCartItem(CI_FREE)).toMatchObject({
      userId: USER,
      cartId: CART_OTHER,
      itemId: ITEM_OTHER,
      quantity: 4,
    })
  })

  it("user replacing their own cart item cannot move it into another account's cart", async () => {
    // Given the CALLER's OWN cart-item id on the upsert path, pointing at the
    // STRANGER's cart. `cartId` STAYS in this mutation's `update` payload on
    // purpose (design decision 3), so before task 8 this moved the caller's
    // row straight into the stranger's cart.
    const payload = [cartItemIn(CI_MINE, { cartId: CART_THEIRS, quantity: 11 })]

    // When the upsert-path import runs
    const result = await exec(UPSERT_CART_ITEMS, { cartItems: payload })

    // Then the row is skipped: it has NOT moved and its quantity is the stored
    // one, not the payload's
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertCartItems).toEqual([])
    expect(storedCartItem(CI_MINE)).toMatchObject({
      userId: USER,
      cartId: CART_MINE,
      quantity: 2,
    })
  })

  it("user replacing their own cart item cannot repoint it at another account's item", async () => {
    // Given the CALLER's OWN cart-item id on the upsert path, naming the
    // STRANGER's item. `itemId` also stays in `update`.
    const payload = [cartItemIn(CI_MINE, { cartId: CART_MINE, itemId: ITEM_THEIRS, quantity: 11 })]

    // When the upsert-path import runs
    const result = await exec(UPSERT_CART_ITEMS, { cartItems: payload })

    // Then the row is skipped and still names the caller's own item
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertCartItems).toEqual([])
    expect(storedCartItem(CI_MINE)).toMatchObject({
      userId: USER,
      itemId: ITEM_MINE,
      quantity: 2,
    })
  })

  it('user replacing their own cart item still moves it between carts and items they own', async () => {
    // Given the CALLER's OWN cart-item id moved to their OTHER cart and OTHER
    // item. This is the positive half: the two tests above would pass against
    // a lookup that refused everything, and this is what stops that.
    const payload = [cartItemIn(CI_MINE, { cartId: CART_OTHER, itemId: ITEM_OTHER, quantity: 6 })]

    // When the upsert-path import runs
    const result = await exec(UPSERT_CART_ITEMS, { cartItems: payload })

    // Then the row really moved
    expect(result.errors).toBeUndefined()
    expect(storedCartItem(CI_MINE)).toMatchObject({
      userId: USER,
      cartId: CART_OTHER,
      itemId: ITEM_OTHER,
      quantity: 6,
    })
  })
})
