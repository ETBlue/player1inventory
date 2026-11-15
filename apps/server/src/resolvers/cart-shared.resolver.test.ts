import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { CartFake, CartItemRow, CartRow } from '../test/cartFake.js'
import type { HouseholdWorld } from '../test/householdWorld.js'

// Shared carts: every cart read and write except `checkout` (see
// `cart-checkout.resolver.test.ts`), scoped by the
// cart's LOCATION, not by who added a row (households H3b, task B.4).
//
// ── WHY A FILE OF ITS OWN ──
//
// `cart.resolver.test.ts` mocks `cart` with plain `vi.fn()` recorders for
// `vendorCart` and `allCarts`. The resolvers task B.4 moved live here, on the
// stateful `cartFake` (src/test/cartFake.ts). `checkout` has its own file,
// `cart-checkout.resolver.test.ts` (task B.5), because it needs the stock, log
// and item stores too, all registered for rollback.
//
// ── WHAT THE FAKE MAKES TESTABLE ──
//
//   - `userId` as a `where` key throws (`UnknownWhereKeyError`). A resolver
//     that scopes a cart read or write by the person fails here.
//   - `@@unique([cartId, itemId])`: a second row for one item raises P2002,
//     so "two adds make one row" is a real end state, not a recorded call.
//   - `cart: { locationId }` and `cart: { locationId: { in } }` are read off
//     the Cart ROW, through the shared matcher in `cartItemFake.ts`.
//
// ── THE FIXTURE (H3b rules 10 and 14) ──
//
// Two members add rows to ONE cart. With one member, "rows I added" and
// "rows in this cart" are the same set, and no scope test could fail.
//
// | Person    | Household | Location roles                                         |
// |-----------|-----------|--------------------------------------------------------|
// | ALICE     | hh_home   | LOC_HOME organizer, LOC_GARAGE organizer               |
// | BOB       | hh_home   | LOC_HOME participant, LOC_GARAGE organizer, LOC_ATTIC  |
// |           |           | organizer                                              |
// | VERA      | hh_home   | LOC_HOME viewer                                        |
// | STRANGER  | hh_other  | LOC_STRANGER organizer                                 |
//
// LOC_ATTIC is in ALICE's OWN household, but she holds no role there. A read
// scoped by household instead of by location role would wrongly count it.

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createCartFake } = await import('../test/cartFake.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const world = createHouseholdWorld()
  const carts = createCartFake()
  // `findMany` only: it answers `requireCatalogIds` (lib/authz.ts), which
  // `addToCart` uses to check the item is in the cart location's household.
  const items = createOwnedRowFake({
    model: 'Item',
    scope: 'householdId',
    rows: [
      { id: 'item_milk', householdId: 'hh_home', userId: 'user_alice' },
      { id: 'item_bread', householdId: 'hh_home', userId: 'user_bob' },
      { id: 'item_eggs', householdId: 'hh_home', userId: 'user_bob' },
      { id: 'item_theirs', householdId: 'hh_other', userId: 'user_stranger' },
    ],
  })
  world.extend(
    {
      cart: carts.client.cart,
      cartItem: carts.client.cartItem,
      item: { findMany: items.client.findMany },
    },
    [carts.state as unknown as Record<string, unknown>],
  )
  return { prisma: { ...world.client, $world: world, $carts: carts } }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'

const handles = prisma as unknown as { $world: HouseholdWorld; $carts: CartFake }
const world = handles.$world
const carts = handles.$carts

const ALICE = 'user_alice'
const BOB = 'user_bob'
const VERA = 'user_vera'
const STRANGER = 'user_stranger'

const LOC_HOME = 'loc_home'
const LOC_GARAGE = 'loc_garage'
const LOC_ATTIC = 'loc_attic'
const LOC_STRANGER = 'loc_stranger'

const HOME_CART = `${LOC_HOME}:no-vendor`
const HOME_VENDOR_CART = `${LOC_HOME}:ven_1`
const GARAGE_CART = `${LOC_GARAGE}:no-vendor`
const ATTIC_CART = `${LOC_ATTIC}:no-vendor`
const STRANGER_CART = `${LOC_STRANGER}:no-vendor`

const PURCHASED = new Date('2026-11-01T00:00:00.000Z')

function cartRow(id: string, locationId: string, lastPurchasedAt: Date | null = null): CartRow {
  return { id, locationId, lastPurchasedAt }
}

function row(id: string, cartId: string, itemId: string, quantity: number, userId: string): CartItemRow {
  return { id, cartId, itemId, quantity, userId }
}

function seed() {
  world.reset()
  world.stock.reset(
    [
      { id: LOC_HOME, householdId: 'hh_home' },
      { id: LOC_GARAGE, householdId: 'hh_home' },
      { id: LOC_ATTIC, householdId: 'hh_home' },
      { id: LOC_STRANGER, householdId: 'hh_other' },
    ],
    [],
  )
  world.seedHouseholds({
    households: [householdRow('hh_home', ALICE), householdRow('hh_other', STRANGER)],
    householdMembers: [
      householdMemberRow('hh_home', ALICE, 'owner'),
      householdMemberRow('hh_home', BOB, 'member'),
      householdMemberRow('hh_home', VERA, 'member'),
      householdMemberRow('hh_other', STRANGER, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_HOME, ALICE, 'organizer'),
      locationMemberRow(LOC_HOME, BOB, 'participant'),
      locationMemberRow(LOC_HOME, VERA, 'viewer'),
      locationMemberRow(LOC_GARAGE, ALICE, 'organizer'),
      locationMemberRow(LOC_GARAGE, BOB, 'organizer'),
      locationMemberRow(LOC_ATTIC, BOB, 'organizer'),
      locationMemberRow(LOC_STRANGER, STRANGER, 'organizer'),
    ],
  })
  carts.reset({
    carts: [
      cartRow(HOME_CART, LOC_HOME, PURCHASED),
      cartRow(HOME_VENDOR_CART, LOC_HOME),
      cartRow(GARAGE_CART, LOC_GARAGE),
      cartRow(ATTIC_CART, LOC_ATTIC),
      cartRow(STRANGER_CART, LOC_STRANGER),
    ],
    cartItems: [
      // The shared home cart: rows from BOTH members, and one pinned row.
      row('ci_alice_milk', HOME_CART, 'item_milk', 2, ALICE),
      row('ci_bob_bread', HOME_CART, 'item_bread', 3, BOB),
      row('ci_bob_eggs_pinned', HOME_CART, 'item_eggs', 0, BOB),
      // The same location, another cart.
      row('ci_bob_milk_vendor', HOME_VENDOR_CART, 'item_milk', 1, BOB),
      // Another location ALICE holds a role on.
      row('ci_bob_milk_garage', GARAGE_CART, 'item_milk', 4, BOB),
      // ALICE's own household, but no role for her.
      row('ci_bob_milk_attic', ATTIC_CART, 'item_milk', 5, BOB),
      // Another household.
      row('ci_stranger_milk', STRANGER_CART, 'item_milk', 7, STRANGER),
    ],
  })
}

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(query: string, variables: Record<string, unknown>, userId: string) {
  const res = await server.executeOperation({ query, variables }, { contextValue: { userId } })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

function code(res: { errors?: ReadonlyArray<{ extensions?: Record<string, unknown> }> }) {
  return res.errors?.[0]?.extensions?.code
}

/** The rows of one cart, sorted by id, as `id:quantity:addedBy`. */
function rowsOf(cartId: string): string[] {
  return carts.state.cartItems
    .filter((r) => r.cartId === cartId)
    .map((r) => `${r.id}:${r.quantity}:${r.userId}`)
    .sort()
}

const CART_ITEMS = `query Q($c: ID!) { cartItems(cartId: $c) { id } }`
const COUNT = `query Q($i: ID!, $l: ID) { cartItemCountByItem(itemId: $i, locationId: $l) }`
const ALL_ITEMS = `query Q { allCartItems { id } }`
const ADD = `mutation M($c: ID!, $i: ID!, $q: Int!) {
  addToCart(cartId: $c, itemId: $i, quantity: $q) { id itemId quantity }
}`
const UPDATE = `mutation M($id: ID!, $q: Int!) { updateCartItem(id: $id, quantity: $q) { id quantity } }`
const REMOVE = `mutation M($id: ID!) { removeFromCart(id: $id) }`
const ABANDON = `mutation M($c: ID!) { abandonCart(cartId: $c) { id lastPurchasedAt } }`

beforeEach(() => {
  seed()
})

// ─── cartItems ───────────────────────────────────────────────────────────────

describe('cartItems reads every row of a shared cart', () => {
  it('user sees the rows a co-member added, not only their own', async () => {
    // Given ALICE and BOB both have rows in the home cart
    // When ALICE reads it
    const res = await run(CART_ITEMS, { c: HOME_CART }, ALICE)

    // Then she sees all three rows, BOB's two included
    expect(res.errors).toBeUndefined()
    const ids = (res.data?.cartItems as { id: string }[]).map((r) => r.id).sort()
    expect(ids).toEqual(['ci_alice_milk', 'ci_bob_bread', 'ci_bob_eggs_pinned'])
  })

  it('a location viewer can read the cart', async () => {
    const res = await run(CART_ITEMS, { c: HOME_CART }, VERA)
    expect(res.errors).toBeUndefined()
    expect(res.data?.cartItems as unknown[]).toHaveLength(3)
  })

  it('a stranger cannot read the cart', async () => {
    const res = await run(CART_ITEMS, { c: HOME_CART }, STRANGER)
    expect(code(res)).toBe('FORBIDDEN')
    expect(res.data?.cartItems ?? null).toBeNull()
  })
})

// ─── cartItemCountByItem ─────────────────────────────────────────────────────

describe('cartItemCountByItem counts rows in carts at locations the caller holds', () => {
  // item_milk sits in five carts. Each wrong scope gives a different number:
  //
  // | Scope                                | ALICE's count |
  // |--------------------------------------|---------------|
  // | locations with a role (right)        | 3             |
  // | rows ALICE added                     | 1             |
  // | ALICE's household                    | 4 (LOC_ATTIC) |
  // | nothing                              | 5             |
  it('user counts rows a co-member added, at every location they hold a role on', async () => {
    const res = await run(COUNT, { i: 'item_milk' }, ALICE)
    expect(res.errors).toBeUndefined()
    expect(res.data?.cartItemCountByItem).toBe(3)
  })

  it('user counts only one location when it is named', async () => {
    // Two rows at LOC_HOME (ALICE's and BOB's), not the garage row
    const res = await run(COUNT, { i: 'item_milk', l: LOC_HOME }, ALICE)
    expect(res.errors).toBeUndefined()
    expect(res.data?.cartItemCountByItem).toBe(2)
  })

  // Moved from `cart.resolver.test.ts`. The Stock tab's remove confirmation
  // shows this number, and `removeItemFromLocation` deletes with the same
  // `cart: { locationId }`, so both must read the cart's COLUMN.
  it("a count for one location reads the cart's locationId, not the text of its cart id", async () => {
    // Given two carts whose id TEXT and whose `locationId` COLUMN disagree.
    // Production cannot reach this state (`cartIdFor` builds the id from the
    // column), and that is why it is the one fixture that tells the two
    // rules apart.
    carts.reset({
      carts: [cartRow(`${LOC_GARAGE}:ven_9`, LOC_HOME), cartRow(`${LOC_HOME}:ven_9`, LOC_GARAGE)],
      cartItems: [
        row('ci_column_here', `${LOC_GARAGE}:ven_9`, 'item_milk', 1, BOB),
        row('ci_column_away', `${LOC_HOME}:ven_9`, 'item_milk', 1, BOB),
      ],
    })
    const both = await run(COUNT, { i: 'item_milk', l: LOC_HOME }, ALICE)
    expect(both.data?.cartItemCountByItem).toBe(1)

    // The count alone cannot say WHICH row was counted, so ask again with
    // only the row whose id text says LOC_HOME. A parser would say 1; the
    // column says 0.
    carts.state.cartItems = carts.state.cartItems.filter((r) => r.id === 'ci_column_away')
    const away = await run(COUNT, { i: 'item_milk', l: LOC_HOME }, ALICE)
    expect(away.data?.cartItemCountByItem).toBe(0)
  })

  it('a location viewer can count at the location', async () => {
    const res = await run(COUNT, { i: 'item_milk', l: LOC_HOME }, VERA)
    expect(res.errors).toBeUndefined()
    expect(res.data?.cartItemCountByItem).toBe(2)
  })

  it('a location in the caller\'s own household but with no role is refused', async () => {
    const res = await run(COUNT, { i: 'item_milk', l: LOC_ATTIC }, ALICE)
    expect(code(res)).toBe('FORBIDDEN')
  })

  it('a stranger cannot count the rows of a cart at a location they do not hold', async () => {
    // Named: refused
    const named = await run(COUNT, { i: 'item_milk', l: LOC_HOME }, STRANGER)
    expect(code(named)).toBe('FORBIDDEN')

    // Not named: only the stranger's own row counts
    const all = await run(COUNT, { i: 'item_milk' }, STRANGER)
    expect(all.data?.cartItemCountByItem).toBe(1)
  })
})

// ─── allCartItems ────────────────────────────────────────────────────────────

describe('allCartItems', () => {
  it('user gets every row at every location they hold a role on, whoever added it', async () => {
    const res = await run(ALL_ITEMS, {}, ALICE)
    expect(res.errors).toBeUndefined()
    const ids = (res.data?.allCartItems as { id: string }[]).map((r) => r.id).sort()
    // Not ci_bob_milk_attic (no role) and not ci_stranger_milk (other household)
    expect(ids).toEqual([
      'ci_alice_milk',
      'ci_bob_bread',
      'ci_bob_eggs_pinned',
      'ci_bob_milk_garage',
      'ci_bob_milk_vendor',
    ])
  })

  it('a location viewer gets the rows at that location', async () => {
    const res = await run(ALL_ITEMS, {}, VERA)
    const ids = (res.data?.allCartItems as { id: string }[]).map((r) => r.id).sort()
    expect(ids).toEqual(['ci_alice_milk', 'ci_bob_bread', 'ci_bob_eggs_pinned', 'ci_bob_milk_vendor'])
  })
})

// ─── addToCart ───────────────────────────────────────────────────────────────

describe('addToCart keeps one row per item per cart', () => {
  it('user adding an item a co-member already added gets one row with the sum, and the first adder is kept', async () => {
    // Given the garage cart is empty
    carts.state.cartItems = carts.state.cartItems.filter((r) => r.cartId !== GARAGE_CART)

    // When ALICE adds 2 milk, then BOB adds 3 milk to the same cart
    const first = await run(ADD, { c: GARAGE_CART, i: 'item_milk', q: 2 }, ALICE)
    const second = await run(ADD, { c: GARAGE_CART, i: 'item_milk', q: 3 }, BOB)

    // Then there is ONE row, with 5, still marked as added by ALICE
    expect(first.errors).toBeUndefined()
    expect(second.errors).toBeUndefined()
    const garage = carts.state.cartItems.filter((r) => r.cartId === GARAGE_CART)
    expect(garage).toHaveLength(1)
    expect(garage[0]).toMatchObject({ itemId: 'item_milk', quantity: 5, userId: ALICE })
    // And both calls answered with that same row
    const a = first.data?.addToCart as { id: string; quantity: number }
    const b = second.data?.addToCart as { id: string; quantity: number }
    expect(b.id).toBe(a.id)
    expect(b.quantity).toBe(5)
  })

  it('user adding to a row a co-member added increments it instead of making a second row', async () => {
    // Given BOB's 3 bread in the home cart
    // When ALICE adds 2 bread
    const res = await run(ADD, { c: HOME_CART, i: 'item_bread', q: 2 }, ALICE)

    // Then BOB's row holds 5 and is still BOB's
    expect(res.errors).toBeUndefined()
    expect(rowsOf(HOME_CART)).toEqual([
      'ci_alice_milk:2:user_alice',
      'ci_bob_bread:5:user_bob',
      'ci_bob_eggs_pinned:0:user_bob',
    ])
  })

  // Today's behaviour, kept on purpose (task B.4): the amount is taken as
  // sent. There is no check for 0 or for a negative number.
  it('the amount is taken as sent: 0 makes a pinned row, and adding to a pinned row makes it a row being bought', async () => {
    // Given no milk in the garage cart
    carts.state.cartItems = carts.state.cartItems.filter((r) => r.cartId !== GARAGE_CART)

    // When ALICE adds 0 milk, then 4 milk, then -1 milk. The amounts are
    // read at once, because the fake updates a row in place.
    const amounts = () => carts.state.cartItems.filter((r) => r.cartId === GARAGE_CART).map((r) => r.quantity)
    await run(ADD, { c: GARAGE_CART, i: 'item_milk', q: 0 }, ALICE)
    const pinned = amounts()
    await run(ADD, { c: GARAGE_CART, i: 'item_milk', q: 4 }, ALICE)
    const bought = amounts()
    const res = await run(ADD, { c: GARAGE_CART, i: 'item_milk', q: -1 }, ALICE)

    // Then the row went 0, 4, 3
    expect(pinned).toEqual([0])
    expect(bought).toEqual([4])
    expect(res.errors).toBeUndefined()
    expect(amounts()).toEqual([3])
  })

  it('a location participant can add', async () => {
    const res = await run(ADD, { c: HOME_CART, i: 'item_milk', q: 1 }, BOB)
    expect(res.errors).toBeUndefined()
    expect(rowsOf(HOME_CART)).toContain('ci_alice_milk:3:user_alice')
  })

  it('a location viewer cannot add, and nothing is written', async () => {
    const before = rowsOf(HOME_CART)
    const res = await run(ADD, { c: HOME_CART, i: 'item_milk', q: 1 }, VERA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(rowsOf(HOME_CART)).toEqual(before)
  })

  it('a stranger cannot add to the cart, and nothing is written', async () => {
    const before = rowsOf(HOME_CART)
    const res = await run(ADD, { c: HOME_CART, i: 'item_milk', q: 1 }, STRANGER)
    expect(code(res)).toBe('FORBIDDEN')
    expect(rowsOf(HOME_CART)).toEqual(before)
  })
})

describe("addToCart takes only an item of the cart location's household", () => {
  it('user can add an item another member of the household made', async () => {
    const res = await run(ADD, { c: GARAGE_CART, i: 'item_bread', q: 1 }, ALICE)
    expect(res.errors).toBeUndefined()
    expect(rowsOf(GARAGE_CART)).toHaveLength(2)
  })

  it("user cannot add another household's item, and nothing is written", async () => {
    const res = await run(ADD, { c: GARAGE_CART, i: 'item_theirs', q: 1 }, ALICE)
    expect(code(res)).toBe('FORBIDDEN')
    expect(rowsOf(GARAGE_CART)).toHaveLength(1)
  })

  it('an item id no row holds is refused with BAD_USER_INPUT, and nothing is written', async () => {
    const res = await run(ADD, { c: GARAGE_CART, i: 'item_ghost', q: 1 }, ALICE)
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(rowsOf(GARAGE_CART)).toHaveLength(1)
  })

  // The cart's location role is checked BEFORE the item (H3a rule 12).
  // The other order gives BAD_USER_INPUT here and FORBIDDEN for an unknown
  // location, so a stranger could tell which location ids exist.
  it("a stranger adding to a cart at another household's location gets FORBIDDEN, even for a missing item", async () => {
    const res = await run(ADD, { c: HOME_CART, i: 'item_ghost', q: 1 }, STRANGER)
    expect(code(res)).toBe('FORBIDDEN')
  })

  it('an unknown location in the cart id with a missing item gets the same FORBIDDEN (control)', async () => {
    // A negative control: green in both orders.
    const res = await run(ADD, { c: 'loc_nowhere:no-vendor', i: 'item_ghost', q: 1 }, STRANGER)
    expect(code(res)).toBe('FORBIDDEN')
  })

  // An old browser bundle sends a cart id from before PR 3b's re-key. It has
  // no ':', so the whole id parses as a location id no row holds.
  for (const [label, cartId] of [
    ['a bare vendor id', 'vendor_1'],
    ["the literal 'no-vendor'", 'no-vendor'],
  ] as const) {
    it(`${label} as the cart id is refused, and nothing is written`, async () => {
      const before = carts.state.cartItems.length
      const res = await run(ADD, { c: cartId, i: 'item_milk', q: 1 }, ALICE)
      expect(code(res)).toBe('FORBIDDEN')
      expect(carts.state.cartItems).toHaveLength(before)
    })
  }
})

// ─── updateCartItem and removeFromCart ───────────────────────────────────────

describe('updateCartItem', () => {
  it("user can change the amount of a row a co-member added, and it stays the co-member's row", async () => {
    const res = await run(UPDATE, { id: 'ci_bob_bread', q: 9 }, ALICE)
    expect(res.errors).toBeUndefined()
    expect(rowsOf(HOME_CART)).toContain('ci_bob_bread:9:user_bob')
  })

  it('a location participant can change a row', async () => {
    const res = await run(UPDATE, { id: 'ci_alice_milk', q: 6 }, BOB)
    expect(res.errors).toBeUndefined()
    expect(rowsOf(HOME_CART)).toContain('ci_alice_milk:6:user_alice')
  })

  it('a location viewer cannot change a row, and nothing is written', async () => {
    const before = rowsOf(HOME_CART)
    const res = await run(UPDATE, { id: 'ci_alice_milk', q: 6 }, VERA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(rowsOf(HOME_CART)).toEqual(before)
  })

  // The answer must not tell a stranger whether an id exists. The code
  // before task B.4 answered NOT_FOUND for both, and still does.
  it("a stranger gets the same NOT_FOUND for another household's row as for an id no row holds", async () => {
    const theirs = await run(UPDATE, { id: 'ci_alice_milk', q: 99 }, STRANGER)
    const ghost = await run(UPDATE, { id: 'ci_ghost', q: 99 }, STRANGER)

    expect(code(theirs)).toBe('NOT_FOUND')
    expect(theirs.errors?.[0]?.message).toBe(ghost.errors?.[0]?.message)
    expect(code(ghost)).toBe('NOT_FOUND')
    expect(rowsOf(HOME_CART)).toContain('ci_alice_milk:2:user_alice')
  })

  it("a row at a location in the caller's own household but with no role is NOT_FOUND too", async () => {
    const res = await run(UPDATE, { id: 'ci_bob_milk_attic', q: 99 }, ALICE)
    expect(code(res)).toBe('NOT_FOUND')
    expect(rowsOf(ATTIC_CART)).toEqual(['ci_bob_milk_attic:5:user_bob'])
  })
})

describe('removeFromCart', () => {
  it('user can remove a row a co-member added', async () => {
    const res = await run(REMOVE, { id: 'ci_bob_bread' }, ALICE)
    expect(res.data?.removeFromCart).toBe(true)
    expect(rowsOf(HOME_CART)).toEqual(['ci_alice_milk:2:user_alice', 'ci_bob_eggs_pinned:0:user_bob'])
  })

  it('a location participant can remove a row', async () => {
    const res = await run(REMOVE, { id: 'ci_alice_milk' }, BOB)
    expect(res.data?.removeFromCart).toBe(true)
    expect(rowsOf(HOME_CART)).not.toContain('ci_alice_milk:2:user_alice')
  })

  it('a location viewer cannot remove a row, and nothing is deleted', async () => {
    const before = rowsOf(HOME_CART)
    const res = await run(REMOVE, { id: 'ci_alice_milk' }, VERA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(rowsOf(HOME_CART)).toEqual(before)
  })

  it("a stranger gets the same false for another household's row as for an id no row holds", async () => {
    const theirs = await run(REMOVE, { id: 'ci_alice_milk' }, STRANGER)
    const ghost = await run(REMOVE, { id: 'ci_ghost' }, STRANGER)

    expect(theirs.errors).toBeUndefined()
    expect(theirs.data?.removeFromCart).toBe(false)
    expect(ghost.errors).toBeUndefined()
    expect(ghost.data?.removeFromCart).toBe(false)
    expect(rowsOf(HOME_CART)).toContain('ci_alice_milk:2:user_alice')
  })
})

// ─── abandonCart ─────────────────────────────────────────────────────────────

describe('abandonCart', () => {
  it("user clearing a shared cart removes every row, the co-member's and the pinned ones too", async () => {
    // When ALICE clears the home cart
    const res = await run(ABANDON, { c: HOME_CART }, ALICE)

    // Then the cart comes back as it was, with lastPurchasedAt as ISO 8601
    expect(res.errors).toBeUndefined()
    expect(res.data?.abandonCart).toEqual({ id: HOME_CART, lastPurchasedAt: PURCHASED.toISOString() })
    // And all three rows are gone, BOB's and the pinned one included
    expect(rowsOf(HOME_CART)).toEqual([])
    // And the cart itself is kept
    expect(carts.state.carts.map((c) => c.id)).toContain(HOME_CART)
    // And the other cart at the same location is untouched
    expect(rowsOf(HOME_VENDOR_CART)).toEqual(['ci_bob_milk_vendor:1:user_bob'])
  })

  it('a location participant can clear the cart', async () => {
    const res = await run(ABANDON, { c: HOME_CART }, BOB)
    expect(res.errors).toBeUndefined()
    expect(rowsOf(HOME_CART)).toEqual([])
  })

  it('a location viewer cannot clear the cart, and nothing is deleted', async () => {
    const before = rowsOf(HOME_CART)
    const res = await run(ABANDON, { c: HOME_CART }, VERA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(rowsOf(HOME_CART)).toEqual(before)
  })

  it('a stranger cannot clear the cart, and nothing is deleted', async () => {
    const before = rowsOf(HOME_CART)
    const res = await run(ABANDON, { c: HOME_CART }, STRANGER)
    expect(code(res)).toBe('FORBIDDEN')
    expect(rowsOf(HOME_CART)).toEqual(before)
  })
})
