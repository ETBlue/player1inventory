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
//   - `src/test/householdWorld.ts` for `location` (its `stockFake`) and the
//     household and role rows, so `resolveCartLocations`,
//     `requireLocationRole`, `fallbackImportLocation` and
//     `householdOfLocation` run against real rows. Every role is a row
//     `beforeEach` seeds (`soloHouseholds`): the caller and the stranger are
//     in two different households. (Households H3a task 3.9 removed
//     `derivedRoles`, which invented those rows from each location's
//     `userId`.)
//   - `src/test/cartFake.ts` for `cart` AND `cartItem` (households H3b task
//     B.7; `cartItem` was on `ownedRowFake` until then). `Cart` has no
//     `userId` since task B.3, and `CartItem.userId` means "added by" and is
//     never a scope (H3b rule 13): the fake refuses a `userId` in any cart or
//     cart item `where`, so a resolver that still scopes by it fails here.
//     It also models what the P3 import rules need: one row per
//     `(cartId, itemId)` (a second one raises P2002), `upsert` on
//     `cartId_itemId`, `quantity: { increment }`, and `update` applied key by
//     key, so a `userId` left in `update` shows as a row that changed its
//     "added by". A cart, or a cart item, is "the caller's" when its cart is
//     at a location where the caller is `participant` or higher.
//   - `src/test/ownedRowFake.ts` for `item`, which `resolveCartItemParents`
//     checks against the household of the cart's location.
vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')

  const world = createHouseholdWorld()
  const stock = world.stock

  const { createCartFake } = await import('../test/cartFake.js')
  const carts = createCartFake()
  // The `state.rows` / `reset(rows)` shape the tests below use, over the cart
  // fake's two stores. Each `reset` replaces ONE store and leaves the other,
  // so `beforeEach` can seed carts and then cart items.
  const cart = {
    client: carts.client.cart,
    state: {
      get rows() {
        return carts.state.carts
      },
    },
    reset: (rows: { id: string; locationId: string; lastPurchasedAt: Date | null }[]) => {
      carts.state.carts = [...rows]
    },
  }
  const cartItem = {
    client: carts.client.cartItem,
    state: {
      get rows() {
        return carts.state.cartItems
      },
    },
    reset: (
      rows: { id: string; userId: string; cartId: string; itemId: string; quantity: number }[],
    ) => {
      carts.state.cartItems = [...rows]
    },
  }

  // A catalog model, so scoped by `householdId` since households H3a task
  // 3.7 (and refusing a `userId` on a write since task 3.14). Each item
  // row is in its owner's household (`HH_USER` or `HH_STRANGER` below).
  const item = createOwnedRowFake<{ id: string; householdId: string; userId: string; name: string }>({
    model: 'Item',
    scope: 'householdId',
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
      ...world.client,
      location: {
        ...world.client.location,
        // Wrapped so a test can count how many location checks ran.
        findFirst: vi.fn(world.client.location.findFirst),
      },
      cart: wrap(cart.client),
      cartItem: wrap(cartItem.client),
      item: item.client,
      // Handles onto the fakes, hung off the mocked client because a `vi.mock`
      // factory is hoisted above every import and cannot close over a
      // module-scope binding.
      $world: world,
      $stockFake: stock,
      $cart: cart,
      $cartItem: cartItem,
      $item: item,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import { householdMemberRow, householdRow, locationMemberRow, soloHouseholds } from '../test/householdRows.js'
import type { OwnedRowFake } from '../test/ownedRowFake.js'
import type { StockFake } from '../test/stockFake.js'

type CartRow = {
  id: string
  locationId: string
  lastPurchasedAt: Date | null
}
type CartStore = { state: { rows: CartRow[] }; reset: (rows: CartRow[]) => void }
type CartItemRow = {
  id: string
  userId: string
  cartId: string
  itemId: string
  quantity: number
}
type ItemRow = { id: string; householdId: string; userId: string; name: string }

const mockPrisma = prisma as unknown as {
  cart: { findUnique: ReturnType<typeof vi.fn> }
  cartItem: { findUnique: ReturnType<typeof vi.fn> }
  location: { findFirst: ReturnType<typeof vi.fn> }
  $world: HouseholdWorld
  $stockFake: StockFake
  $cart: CartStore
  $cartItem: { state: { rows: CartItemRow[] }; reset: (rows: CartItemRow[]) => void }
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
// TWO CARTS of the caller's and TWO ITEMS of the caller's, so a cart item
// test can name a row under another cart and item. That is what pins a row
// NOT moving (households H3b task B.7, design D5) — with a single cart and a
// single item there is nowhere to move to and the assertion could not fail.

const USER = 'user_import_cart_own_test'
const STRANGER = 'user_stranger'

const LOC_DEFAULT = 'loc_kitchen' // USER's default
const LOC_OTHER = 'loc_garage' // USER's, NOT default
const LOC_STRANGER = 'loc_theirs' // STRANGER's — must be refused
// In USER's own household, but USER holds no role on it; only MEMBER does.
// Households H3b task B.3: since `Cart.userId` is gone, a cart is usable
// through a location role, so this is the location a check by household
// instead of by role would wrongly let through.
const LOC_NOROLE = 'loc_attic'
// A second member of USER's household (H3b rule 14). MEMBER organizes
// LOC_DEFAULT with USER, and LOC_NOROLE alone.
const MEMBER = 'user_member'

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
const CART_NOROLE = `${LOC_NOROLE}:${VENDOR}` // in USER's household, no role for USER

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

const HH_USER = 'hh_user'
const HH_STRANGER = 'hh_stranger'

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
    { id: LOC_OTHER, householdId: HH_USER, name: 'Garage', order: 1, createdAt: TS, updatedAt: TS },
    { id: LOC_DEFAULT, householdId: HH_USER, name: 'Kitchen', order: 0, createdAt: TS, updatedAt: TS },
    { id: LOC_STRANGER, householdId: HH_STRANGER, name: 'Theirs', order: 0, createdAt: TS, updatedAt: TS },
    { id: LOC_NOROLE, householdId: HH_USER, name: 'Attic', order: 2, createdAt: TS, updatedAt: TS },
  ])
  // The caller and the stranger are in two different households, each the
  // owner, each the organizer of their own locations. MEMBER is a second
  // member of the caller's household: organizer of LOC_DEFAULT (with the
  // caller) and of LOC_NOROLE (alone).
  const solo = soloHouseholds([
    { userId: USER, householdId: HH_USER, locationIds: [LOC_OTHER, LOC_DEFAULT] },
    { userId: STRANGER, householdId: HH_STRANGER, locationIds: [LOC_STRANGER] },
  ])
  mockPrisma.$world.seedHouseholds({
    households: solo.households,
    householdMembers: [...solo.householdMembers, householdMemberRow(HH_USER, MEMBER, 'member')],
    locationMembers: [
      ...solo.locationMembers,
      locationMemberRow(LOC_DEFAULT, MEMBER, 'organizer'),
      locationMemberRow(LOC_NOROLE, MEMBER, 'organizer'),
    ],
  })

  // No cart has an owner since households H3b task B.3.
  mockPrisma.$cart.reset([
    { id: CART_MINE, locationId: LOC_OTHER, lastPurchasedAt: STORED_PURCHASED },
    { id: CART_OTHER, locationId: LOC_DEFAULT, lastPurchasedAt: null },
    { id: CART_THEIRS, locationId: LOC_STRANGER, lastPurchasedAt: null },
    { id: CART_NOROLE, locationId: LOC_NOROLE, lastPurchasedAt: null },
  ])

  mockPrisma.$cartItem.reset([
    { id: CI_MINE, userId: USER, cartId: CART_MINE, itemId: ITEM_MINE, quantity: 2 },
    { id: CI_THEIRS, userId: STRANGER, cartId: CART_THEIRS, itemId: ITEM_MINE, quantity: 7 },
  ])

  mockPrisma.$item.reset([
    { id: ITEM_MINE, householdId: HH_USER, userId: USER, name: 'Milk' },
    { id: ITEM_OTHER, householdId: HH_USER, userId: USER, name: 'Rice' },
    { id: ITEM_THEIRS, householdId: HH_STRANGER, userId: STRANGER, name: 'Theirs' },
  ])
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTEXT: Context = { userId: USER }

async function exec(query: string, variables: Record<string, unknown>, context: Context = CONTEXT) {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: context },
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
    expect(mockPrisma.$cart.state.rows).toHaveLength(4)
    expect(storedCart(CART_THEIRS)).toMatchObject({
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
    expect(mockPrisma.$cart.state.rows).toHaveLength(4)
    expect(storedCart(CART_THEIRS)).toMatchObject({
      locationId: LOC_STRANGER,
      lastPurchasedAt: null,
    })
  })

  it('user re-importing their own cart still replaces it and does not move it', async () => {
    // Given a payload naming the caller's OWN cart id with a new date
    const payload = [cartIn(CART_MINE, PAYLOAD_PURCHASED)]

    // When the upsert-path import runs
    const result = await exec(UPSERT_CARTS, { carts: payload })

    // Then the date is replaced and the location is unchanged. (This test
    // also checked the cart's owner until households H3b task B.3 dropped
    // `Cart.userId`. The cart fake now refuses a `userId` in a write.)
    expect(result.errors).toBeUndefined()
    expect(storedCart(CART_MINE)).toMatchObject({
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
      [CART_MINE, CART_OTHER, CART_THEIRS, CART_NOROLE].sort(),
    )
  })

  it("bulkUpsertShoppingCarts does not move a stranger's cart even when the guard misses it", async () => {
    // Given the guard's lookup misses the stranger's row, so the upsert really
    // reaches it. `locationId` being OUT of the `update` payload is the
    // defence here: a future edit that drops the guard must not be able to
    // move another household's cart into the caller's location. (Until
    // households H3b task B.3 this also checked `Cart.userId`, now dropped.)
    simulateGuardMiss(mockPrisma.cart)

    // When the caller upserts under the stranger's id
    const result = await exec(UPSERT_CARTS, { carts: [cartIn(CART_THEIRS, PAYLOAD_PURCHASED)] })

    // Then the row has not MOVED.
    //
    // The mutation itself succeeds: these four resolvers have no closing read
    // to refuse, which is why the guard is the only thing standing here.
    expect(result.errors).toBeUndefined()
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
    expect(mockPrisma.$cart.state.rows).toHaveLength(4)
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

  it("bulkUpsertCartItems never writes through the payload's id, even when the guard misses it", async () => {
    // Given the guard's lookup misses the stranger's row, so the stranger's
    // id reaches the write. The payload names the pair CI_MINE holds.
    simulateGuardMiss(mockPrisma.cartItem)

    // When the caller upserts under the stranger's id
    const result = await exec(UPSERT_CART_ITEMS, {
      cartItems: [cartItemIn(CI_THEIRS, { cartId: CART_MINE, itemId: ITEM_MINE, quantity: 99 })],
    })

    // Then the write landed on the PAIR's row, CI_MINE, and changed only its
    // amount. The stranger's row is untouched in every column: since
    // households H3b task B.7 the upsert finds its row by `(cartId, itemId)`,
    // never by the payload's id, and `update` holds only `quantity`. Until
    // then `cartId` and `itemId` stayed in `update`, so a missed guard MOVED
    // the stranger's row into the caller's cart.
    expect(result.errors).toBeUndefined()
    expect(storedCartItem(CI_THEIRS)).toEqual({
      id: CI_THEIRS,
      userId: STRANGER,
      cartId: CART_THEIRS,
      itemId: ITEM_MINE,
      quantity: 7,
    })
    expect(storedCartItem(CI_MINE)).toEqual({
      id: CI_MINE,
      userId: USER,
      cartId: CART_MINE,
      itemId: ITEM_MINE,
      quantity: 99,
    })
  })

  it('user re-importing their own cart item under another cart and item does not move it', async () => {
    // Given the caller's own cart item, stored in CART_MINE against ITEM_MINE,
    // and a payload that names the SAME cart item id under a DIFFERENT cart
    // and a different item — both the caller's. That pair has no row yet.
    expect(storedCartItem(CI_MINE)).toMatchObject({ cartId: CART_MINE, itemId: ITEM_MINE })
    const payload = [cartItemIn(CI_MINE, { cartId: CART_OTHER, itemId: ITEM_OTHER, quantity: 3 })]

    // When the upsert-path import runs
    const result = await exec(UPSERT_CART_ITEMS, { cartItems: payload })

    // Then the stored row has NOT moved and keeps its amount (design D5: an
    // update never moves a row), and the pair the payload names gets a NEW
    // row with the amount. It cannot reuse CI_MINE's id, which is taken.
    //
    // Until households H3b task B.7 the row moved, to match local mode's
    // Dexie `bulkPut` (design decision 3 of the import ownership guard).
    expect(result.errors).toBeUndefined()
    expect(storedCartItem(CI_MINE)).toEqual({
      id: CI_MINE,
      userId: USER,
      cartId: CART_MINE,
      itemId: ITEM_MINE,
      quantity: 2,
    })
    const created = mockPrisma.$cartItem.state.rows.filter(
      (r) => r.cartId === CART_OTHER && r.itemId === ITEM_OTHER,
    )
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ userId: USER, quantity: 3 })
    expect(created[0]?.id).not.toBe(CI_MINE)
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
})

// ─── A cart is reached through a location role (households H3b B.3 and B.7) ──
//
// `Cart.userId` is gone, so `resolveCartItemParents` finds a cart only at a
// location where the caller is `participant` or higher
// (`locationIdsWithRole(ctx, 'participant')`, since task B.7). Rule 14 of the
// H3b plan: two members, and a location the caller has no role on. CART_NOROLE
// is in USER's OWN household, at LOC_NOROLE, where only MEMBER has a role. A
// lookup scoped by household would let USER write into it; a lookup with no
// scope at all would too.

describe('CartItem → Cart is reached through a location role', () => {
  for (const [label, query, field] of [
    ['bulkCreateCartItems', CREATE_CART_ITEMS, 'bulkCreateCartItems'],
    ['bulkUpsertCartItems', UPSERT_CART_ITEMS, 'bulkUpsertCartItems'],
  ] as const) {
    it(`${label}: user cannot put a row into a cart at a location of their household they have no role on`, async () => {
      // Given a FREE cart-item id naming CART_NOROLE and an item of USER's
      // household
      const payload = [cartItemIn(CI_FREE, { cartId: CART_NOROLE, itemId: ITEM_MINE })]

      // When USER imports it
      const result = await exec(query, { cartItems: payload })

      // Then the row is skipped, the same answer as a stranger's cart
      expect(result.errors).toBeUndefined()
      expect(result.data?.[field]).toEqual([])
      expect(storedCartItem(CI_FREE)).toBeUndefined()
    })

    it(`${label}: a second member with a role there can put the same row into that cart`, async () => {
      // Given the same payload, sent by MEMBER, who organizes LOC_NOROLE. This
      // is the positive half: a lookup that refused every cart would pass the
      // test above.
      const payload = [cartItemIn(CI_FREE, { cartId: CART_NOROLE, itemId: ITEM_MINE, quantity: 3 })]

      // When MEMBER imports it
      const result = await exec(query, { cartItems: payload }, { userId: MEMBER })

      // Then it is written, with MEMBER as "added by"
      expect(result.errors).toBeUndefined()
      expect(storedCartItem(CI_FREE)).toMatchObject({
        userId: MEMBER,
        cartId: CART_NOROLE,
        itemId: ITEM_MINE,
        quantity: 3,
      })
    })

    it(`${label}: user can put a row into a cart they share with a second member`, async () => {
      // Given CART_OTHER at LOC_DEFAULT, which USER and MEMBER both organize.
      // No cart has an owner, so it does not matter who made it.
      const payload = [cartItemIn(CI_FREE, { cartId: CART_OTHER, itemId: ITEM_OTHER, quantity: 2 })]

      // When MEMBER imports it
      const result = await exec(query, { cartItems: payload }, { userId: MEMBER })

      // Then it is written into the shared cart
      expect(result.errors).toBeUndefined()
      expect(storedCartItem(CI_FREE)).toMatchObject({ userId: MEMBER, cartId: CART_OTHER })
    })
  }
})

// ─── The item is checked against the CART's household ─────────────────────────
//
// Households H3a task 3.9. Until then both cart-item mutations checked the
// item against the CALLER's household (`requireHousehold`). With one household
// per person that is the same household as the cart's location, so a test can
// only tell the two apart when the caller is in TWO households. Nothing in the
// schema stops that, and H5 makes it real.
//
// | Person | Household | Household role | Location roles        |
// |--------|-----------|----------------|-----------------------|
// | USER   | hh_user   | owner          | LOC_OTHER, LOC_DEFAULT: organizer |
// | USER   | hh_second | member         | LOC_SECOND: participant |
// | OWNER2 | hh_second | owner          | LOC_SECOND: organizer |
//
// USER's `hh_user` row is seeded FIRST, so `requireHousehold` (the first
// membership it finds) answers `hh_user`. USER has a cart at LOC_SECOND.

describe('CartItem → Item is checked against the household of the cart location', () => {
  const OWNER2 = 'user_second_owner'
  const HH_SECOND = 'hh_second'
  const LOC_SECOND = 'loc_second'
  const CART_SECOND = `${LOC_SECOND}:${VENDOR}` // USER's cart at hh_second's location
  const ITEM_SECOND = 'item_second' // an item of hh_second

  beforeEach(() => {
    mockPrisma.$stockFake.reset([
      ...mockPrisma.$stockFake.state.locations,
      { id: LOC_SECOND, householdId: HH_SECOND, name: 'Second', order: 0, createdAt: TS, updatedAt: TS },
    ])
    const solo = soloHouseholds([
      { userId: USER, householdId: HH_USER, locationIds: [LOC_OTHER, LOC_DEFAULT] },
      { userId: STRANGER, householdId: HH_STRANGER, locationIds: [LOC_STRANGER] },
    ])
    mockPrisma.$world.seedHouseholds({
      households: [...solo.households, householdRow(HH_SECOND, OWNER2)],
      householdMembers: [
        ...solo.householdMembers,
        householdMemberRow(HH_SECOND, OWNER2, 'owner'),
        householdMemberRow(HH_SECOND, USER, 'member'),
      ],
      locationMembers: [
        ...solo.locationMembers,
        locationMemberRow(LOC_SECOND, OWNER2, 'organizer'),
        locationMemberRow(LOC_SECOND, USER, 'participant'),
      ],
    })
    mockPrisma.$cart.reset([
      ...mockPrisma.$cart.state.rows,
      { id: CART_SECOND, locationId: LOC_SECOND, lastPurchasedAt: null },
    ])
    mockPrisma.$item.reset([
      ...mockPrisma.$item.state.rows,
      { id: ITEM_SECOND, householdId: HH_SECOND, userId: OWNER2, name: 'Second' },
    ])
  })

  for (const [label, query, field] of [
    ['bulkCreateCartItems', CREATE_CART_ITEMS, 'bulkCreateCartItems'],
    ['bulkUpsertCartItems', UPSERT_CART_ITEMS, 'bulkUpsertCartItems'],
  ] as const) {
    it(`${label}: user cannot put an item of their own household into a cart at another household's location`, async () => {
      // Given a cart item in USER's cart at LOC_SECOND (hh_second), naming
      // ITEM_MINE, an item of hh_user — the CALLER's household
      const payload = [cartItemIn(CI_FREE, { cartId: CART_SECOND, itemId: ITEM_MINE })]

      // When the import runs
      const result = await exec(query, { cartItems: payload })

      // Then the row is SKIPPED, as for any item that is not usable here.
      // Checked against the caller's household, ITEM_MINE would pass and
      // `checkout` would later buy it into hh_second's stock.
      expect(result.errors).toBeUndefined()
      expect(result.data?.[field]).toEqual([])
      expect(storedCartItem(CI_FREE)).toBeUndefined()
    })

    it(`${label}: user can put an item of the cart location's household into that cart`, async () => {
      // Given the same cart, naming ITEM_SECOND, an item of hh_second. This
      // is the positive half: a check against the CALLER's household skips it.
      const payload = [cartItemIn(CI_FREE, { cartId: CART_SECOND, itemId: ITEM_SECOND })]

      // When the import runs
      const result = await exec(query, { cartItems: payload })

      // Then it is written
      expect(result.errors).toBeUndefined()
      expect(storedCartItem(CI_FREE)).toMatchObject({
        userId: USER,
        cartId: CART_SECOND,
        itemId: ITEM_SECOND,
      })
    })

    it(`${label}: user who is only a viewer at the cart's location has that row skipped`, async () => {
      // Given USER's role at LOC_SECOND lowered to viewer, and an allowed row
      // FIRST, at a pair that has no row yet.
      //
      // Households H3b task B.7 (decision D7): a cart is usable for an import
      // only where the caller is `participant` or higher, and a cart that is
      // not usable is a reference that does not resolve, so the row is
      // SKIPPED, like a cart that is gone. Until task B.7 a viewer got
      // FORBIDDEN for the whole batch (and until task B.3 that was a cart of
      // USER's found by `Cart.userId`). What still REFUSES a viewer is the
      // row's own id: see "a viewer at the shared location is refused" below.
      mockPrisma.$world.households.state.locationMembers =
        mockPrisma.$world.households.state.locationMembers.map((m) =>
          m.locationId === LOC_SECOND && m.userId === USER ? { ...m, role: 'viewer' as const } : m,
        )
      const payload = [
        cartItemIn(CI_FREE, { cartId: CART_MINE, itemId: ITEM_OTHER }),
        cartItemIn('ci_free_2', { cartId: CART_SECOND, itemId: ITEM_SECOND }),
      ]

      // When the import runs
      const result = await exec(query, { cartItems: payload })

      // Then the viewer's row is skipped and the other one is written
      expect(result.errors).toBeUndefined()
      expect(storedCartItem(CI_FREE)).toMatchObject({ cartId: CART_MINE, itemId: ITEM_OTHER })
      expect(storedCartItem('ci_free_2')).toBeUndefined()
    })

    it(`${label}: user with no role left on the cart's location has that row skipped`, async () => {
      // Given USER's role at LOC_SECOND removed. A cart has no owner since
      // households H3b task B.3, so a cart at a location USER holds no role
      // on looks the same as a stranger's cart, or a cart that is gone.
      mockPrisma.$world.households.state.locationMembers =
        mockPrisma.$world.households.state.locationMembers.filter(
          (m) => !(m.locationId === LOC_SECOND && m.userId === USER),
        )
      const payload = [
        cartItemIn(CI_FREE, { cartId: CART_MINE, itemId: ITEM_OTHER }),
        cartItemIn('ci_free_2', { cartId: CART_SECOND, itemId: ITEM_SECOND }),
      ]

      // When the import runs
      const result = await exec(query, { cartItems: payload })

      // Then the row for LOC_SECOND is skipped and the other one is written
      expect(result.errors).toBeUndefined()
      expect(storedCartItem(CI_FREE)).toMatchObject({ cartId: CART_MINE, itemId: ITEM_OTHER })
      expect(storedCartItem('ci_free_2')).toBeUndefined()
    })
  }
})

// ─── A shared cart, and the P3 import rules (households H3b task B.7) ─────────
//
// Decisions D5 and D7, written as code paths in decision P3 of the H3b plan.
//
// | Person  | Household | Location role at LOC_DEFAULT |
// |---------|-----------|------------------------------|
// | USER    | hh_user   | organizer                    |
// | MEMBER  | hh_user   | organizer                    |
// | VIEWER  | hh_user   | viewer                       |
// | STRANGER| hh_stranger | none                       |
//
// CART_OTHER is at LOC_DEFAULT, the location USER and MEMBER share. It holds
// two rows, ONE ADDED BY EACH MEMBER (H3b rule 14). With one member, "rows I
// added" and "rows in this cart" are the same set, and a guard that still
// scoped by `CartItem.userId` would pass.
//
// Every P3 test starts with a row ALREADY in the cloud for the pair it
// names. With an empty cart, "add to the row", "set the row" and "make a new
// row" all leave the same single row behind.

describe('A shared cart, and the import rules for cart rows (households H3b task B.7)', () => {
  const VIEWER = 'user_viewer'
  const ITEM_THIRD = 'item_third' // a third item of hh_user, so two pairs are free
  const CI_SHARED_M = 'ci_shared_member' // MEMBER added it: CART_OTHER, ITEM_MINE, 4
  const CI_SHARED_U = 'ci_shared_user' // USER added it: CART_OTHER, ITEM_OTHER, 1

  // The rows of the shared cart, as a backup made by USER would name them.
  const sharedBackup = () => [
    cartItemIn(CI_SHARED_M, { cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 4 }),
    cartItemIn(CI_SHARED_U, { cartId: CART_OTHER, itemId: ITEM_OTHER, quantity: 1 }),
  ]

  const rowsAt = (cartId: string, itemId: string) =>
    mockPrisma.$cartItem.state.rows.filter((r) => r.cartId === cartId && r.itemId === itemId)

  beforeEach(() => {
    mockPrisma.$world.households.state.householdMembers = [
      ...mockPrisma.$world.households.state.householdMembers,
      householdMemberRow(HH_USER, VIEWER, 'member'),
    ]
    mockPrisma.$world.households.state.locationMembers = [
      ...mockPrisma.$world.households.state.locationMembers,
      locationMemberRow(LOC_DEFAULT, VIEWER, 'viewer'),
    ]
    mockPrisma.$item.reset([
      ...mockPrisma.$item.state.rows,
      { id: ITEM_THIRD, householdId: HH_USER, userId: USER, name: 'Eggs' },
    ])
    mockPrisma.$cartItem.reset([
      ...mockPrisma.$cartItem.state.rows,
      { id: CI_SHARED_M, userId: MEMBER, cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 4 },
      { id: CI_SHARED_U, userId: USER, cartId: CART_OTHER, itemId: ITEM_OTHER, quantity: 1 },
    ])
  })

  for (const [label, query] of [
    ['bulkCreateCartItems', CREATE_CART_ITEMS],
    ['bulkUpsertCartItems', UPSERT_CART_ITEMS],
  ] as const) {
    it(`${label}: a co-member importing a backup that names the shared cart and its rows is not refused`, async () => {
      // Given USER's backup of the shared cart, which holds a row MEMBER
      // added and a row USER added
      // When MEMBER imports it
      const result = await exec(query, { cartItems: sharedBackup() }, { userId: MEMBER })

      // Then nothing is refused, and the cart still holds exactly its two rows,
      // each with its own "added by"
      expect(result.errors).toBeUndefined()
      expect(rowsAt(CART_OTHER, ITEM_MINE)).toEqual([
        { id: CI_SHARED_M, userId: MEMBER, cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 4 },
      ])
      expect(rowsAt(CART_OTHER, ITEM_OTHER)).toEqual([
        { id: CI_SHARED_U, userId: USER, cartId: CART_OTHER, itemId: ITEM_OTHER, quantity: 1 },
      ])
    })

    it(`${label}: a viewer at the shared location is refused, with nothing written`, async () => {
      // Given the same backup, with a new row for USER's own cart FIRST
      const payload = [cartItemIn(CI_FREE, { cartId: CART_MINE, itemId: ITEM_OTHER }), ...sharedBackup()]

      // When VIEWER, a household member who may only read LOC_DEFAULT,
      // imports it
      const result = await exec(query, { cartItems: payload }, { userId: VIEWER })

      // Then the whole batch is refused: the backup names rows that already
      // exist at a location VIEWER may not write to
      expect(errorCode(result)).toBe('FORBIDDEN')
      expect(storedCartItem(CI_FREE)).toBeUndefined()
      expect(storedCartItem(CI_SHARED_M)?.quantity).toBe(4)
      expect(storedCartItem(CI_SHARED_U)?.quantity).toBe(1)
    })

    it(`${label}: a stranger importing the same backup is refused, with nothing written`, async () => {
      // When STRANGER, of another household, imports it
      const result = await exec(query, { cartItems: sharedBackup() }, { userId: STRANGER })

      // Then it is refused and the shared rows are unchanged
      expect(errorCode(result)).toBe('FORBIDDEN')
      expect(storedCartItem(CI_SHARED_M)).toMatchObject({ userId: MEMBER, quantity: 4 })
      expect(storedCartItem(CI_SHARED_U)).toMatchObject({ userId: USER, quantity: 1 })
    })

    it(`${label}: a payload with two rows for one item writes one row, under the lowest id`, async () => {
      // Given two rows for one free pair — an old backup made before the
      // shared-cart migration merged them. The higher id comes first.
      const payload = [
        cartItemIn('ci_dup_b', { cartId: CART_MINE, itemId: ITEM_THIRD, quantity: 2 }),
        cartItemIn('ci_dup_a', { cartId: CART_MINE, itemId: ITEM_THIRD, quantity: 1 }),
      ]

      // When it is imported
      const result = await exec(query, { cartItems: payload })

      // Then one row holds the sum, under the lowest id, as the migration
      // kept it. Writing the two rows one by one raises P2002 on the pair.
      expect(result.errors).toBeUndefined()
      expect(rowsAt(CART_MINE, ITEM_THIRD)).toEqual([
        { id: 'ci_dup_a', userId: USER, cartId: CART_MINE, itemId: ITEM_THIRD, quantity: 3 },
      ])
    })

    it(`${label}: a payload that repeats one id under two items writes both, with no P2002`, async () => {
      // Given one id used for two different free pairs. Only a hand-edited
      // backup holds this, and it must not fail the import.
      const payload = [
        cartItemIn('ci_rep', { cartId: CART_MINE, itemId: ITEM_OTHER, quantity: 1 }),
        cartItemIn('ci_rep', { cartId: CART_MINE, itemId: ITEM_THIRD, quantity: 2 }),
      ]

      // When it is imported
      const result = await exec(query, { cartItems: payload })

      // Then both pairs get a row. The first takes the id; the second gets
      // a new one, because a second row under 'ci_rep' would raise P2002.
      expect(result.errors).toBeUndefined()
      expect(rowsAt(CART_MINE, ITEM_OTHER)).toMatchObject([{ id: 'ci_rep', quantity: 1 }])
      expect(rowsAt(CART_MINE, ITEM_THIRD)).toHaveLength(1)
      expect(rowsAt(CART_MINE, ITEM_THIRD)[0]).toMatchObject({ quantity: 2 })
      expect(rowsAt(CART_MINE, ITEM_THIRD)[0]?.id).not.toBe('ci_rep')
    })
  }

  for (const [label, query, field] of [
    ['bulkCreateShoppingCarts', CREATE_CARTS, 'bulkCreateShoppingCarts'],
    ['bulkUpsertShoppingCarts', UPSERT_CARTS, 'bulkUpsertShoppingCarts'],
  ] as const) {
    it(`${label}: a co-member may import the shared cart, a viewer there may not`, async () => {
      // Given the shared cart CART_OTHER, at LOC_DEFAULT
      const payload = [cartIn(CART_OTHER, PAYLOAD_PURCHASED)]

      // When VIEWER imports it, then MEMBER
      const asViewer = await exec(query, { carts: payload }, { userId: VIEWER })
      const asMember = await exec(query, { carts: payload }, { userId: MEMBER })

      // Then the viewer is refused and the co-member is not. A cart import
      // writes the cart, so it asks for `participant`, like its rows.
      expect(errorCode(asViewer)).toBe('FORBIDDEN')
      expect(asMember.errors).toBeUndefined()
      expect(asMember.data?.[field]).toBeDefined()
      expect(storedCart(CART_OTHER)?.locationId).toBe(LOC_DEFAULT)
    })
  }

  // ── The four P3 paths, each with a row already in the cloud ──

  it('bulkCreateCartItems: a new id whose item is already in the cart ADDS its amount to that row', async () => {
    // Given the shared cart holds MEMBER's row for ITEM_MINE, amount 4
    // When USER imports a NEW id for the same cart and item, amount 2
    const result = await exec(CREATE_CART_ITEMS, {
      cartItems: [cartItemIn('ci_new', { cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 2 })],
    })

    // Then MEMBER's row now holds 6. No second row, no P2002, and the row is
    // still "added by" MEMBER: an import adds to a row, it does not take it
    // over.
    expect(result.errors).toBeUndefined()
    expect(rowsAt(CART_OTHER, ITEM_MINE)).toEqual([
      { id: CI_SHARED_M, userId: MEMBER, cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 6 },
    ])
  })

  it('bulkCreateCartItems: an id that is already in the cloud is skipped, whoever added it', async () => {
    // Given MEMBER's row, amount 4
    // When USER imports that row's id with another amount
    const result = await exec(CREATE_CART_ITEMS, {
      cartItems: [cartItemIn(CI_SHARED_M, { cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 9 })],
    })

    // Then it is skipped: "skip conflicts" means skip, and nothing is added
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateCartItems).toEqual([])
    expect(storedCartItem(CI_SHARED_M)).toMatchObject({ userId: MEMBER, quantity: 4 })
  })

  it('bulkCreateCartItems: a row merged before the import is not added again by its other ids', async () => {
    // Given a backup made before the shared-cart migration: two rows for one
    // pair. The migration kept the lowest id, CI_SHARED_M, with the sum.
    // 'ci_shared_zzz' is the id it merged away.
    const payload = [
      cartItemIn(CI_SHARED_M, { cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 3 }),
      cartItemIn('ci_shared_zzz', { cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 1 }),
    ]

    // When USER imports it again on the skip strategy
    const result = await exec(CREATE_CART_ITEMS, { cartItems: payload })

    // Then the whole pair is skipped. Skipping only the known id would add
    // the merged-away row's 1 a second time, on every re-import.
    expect(result.errors).toBeUndefined()
    expect(rowsAt(CART_OTHER, ITEM_MINE)).toEqual([
      { id: CI_SHARED_M, userId: MEMBER, cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 4 },
    ])
  })

  it('bulkUpsertCartItems: an id that is already in the cloud has only its amount replaced', async () => {
    // Given MEMBER's row, amount 4
    // When USER replaces it with amount 9
    const result = await exec(UPSERT_CART_ITEMS, {
      cartItems: [cartItemIn(CI_SHARED_M, { cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 9 })],
    })

    // Then the amount is 9 and the row is still "added by" MEMBER. This is
    // the test for `userId` staying OUT of `update`: the row is MEMBER's and
    // USER writes it, so a `userId` in `update` would show here.
    expect(result.errors).toBeUndefined()
    expect(rowsAt(CART_OTHER, ITEM_MINE)).toEqual([
      { id: CI_SHARED_M, userId: MEMBER, cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 9 },
    ])
  })

  it('bulkUpsertCartItems: a new id whose item is already in the cart SETS that row', async () => {
    // Given MEMBER's row for ITEM_MINE, amount 4
    // When USER replaces with a NEW id for the same cart and item, amount 2
    const result = await exec(UPSERT_CART_ITEMS, {
      cartItems: [cartItemIn('ci_new', { cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 2 })],
    })

    // Then MEMBER's row now holds 2 — set, not 6 — with no second row
    expect(result.errors).toBeUndefined()
    expect(rowsAt(CART_OTHER, ITEM_MINE)).toEqual([
      { id: CI_SHARED_M, userId: MEMBER, cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 2 },
    ])
  })

  it('bulkUpsertCartItems: two rows for an item already in the cart set it to their sum', async () => {
    // When USER replaces with two new rows for MEMBER's pair, 1 and 2
    const result = await exec(UPSERT_CART_ITEMS, {
      cartItems: [
        cartItemIn('ci_x', { cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 1 }),
        cartItemIn('ci_y', { cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 2 }),
      ],
    })

    // Then the row holds 3: summed first, then set. Set one row at a time,
    // the last row would win and leave 2.
    expect(result.errors).toBeUndefined()
    expect(rowsAt(CART_OTHER, ITEM_MINE)).toEqual([
      { id: CI_SHARED_M, userId: MEMBER, cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 3 },
    ])
  })

  it('bulkUpsertCartItems: a row moved onto an item already in the cart sets that row and moves nothing', async () => {
    // Given USER's own CI_MINE (CART_MINE, ITEM_MINE, 2), and a payload that
    // names it under the shared cart's pair (CART_OTHER, ITEM_MINE), which
    // MEMBER's row already holds
    const payload = [cartItemIn(CI_MINE, { cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 5 })]

    // When USER replaces
    const result = await exec(UPSERT_CART_ITEMS, { cartItems: payload })

    // Then no P2002: CI_MINE stays where it is, and MEMBER's row gets the
    // amount. A move would put two rows on that pair.
    expect(result.errors).toBeUndefined()
    expect(storedCartItem(CI_MINE)).toEqual({
      id: CI_MINE,
      userId: USER,
      cartId: CART_MINE,
      itemId: ITEM_MINE,
      quantity: 2,
    })
    expect(rowsAt(CART_OTHER, ITEM_MINE)).toEqual([
      { id: CI_SHARED_M, userId: MEMBER, cartId: CART_OTHER, itemId: ITEM_MINE, quantity: 5 },
    ])
  })
})
