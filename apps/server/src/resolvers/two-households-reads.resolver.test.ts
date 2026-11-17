import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { CartFake, CartItemRow } from '../test/cartFake.js'
import type { HouseholdWorld } from '../test/householdWorld.js'

// Households H5 task F.2, decision T5: four reads that span several locations
// get a household filter. One person in TWO households holds roles in both,
// so "every location I have a role on" holds the other household's locations
// too. The four:
//
// | Resolver                                  | Household it reads     |
// |-------------------------------------------|------------------------|
// | `cartItemCountByItem` with no `locationId`| the caller's (`requireHousehold`) |
// | `itemStocksForItem`                       | the caller's           |
// | `addItemToLocation`'s copy-on-add sources | the TARGET location's  |
// | `checkout`'s copy-on-add sources          | the CART's location's  |
//
// The two writes read the LOCATION's household, not the caller's. The plan
// said `requireHousehold(ctx)` for all four. For a write at a location of the
// caller's second household that is wrong: the item is that household's
// (`requireLocationItems` checks it), so its settings are there, and a filter
// on the caller's household would find no source and write zeros. The last
// describe block pins that.
//
// ── WHY THE BAD ROWS ARE PUT STRAIGHT INTO THE FAKE ──
//
// Stock or a cart row of household A's item at household B's location cannot
// be made through the API: every write checks that the item and the location
// are in one household (`requireLocationItems`). These tests guard the
// invariant from the read side, so they write the broken state by hand.
//
// ── THE FIXTURE ──
//
// | Person | hh_a role | hh_b role | Location roles                                  |
// |--------|-----------|-----------|-------------------------------------------------|
// | USER   | owner     | member    | LOC_A1, LOC_A2 organizer; LOC_B1, LOC_B2 organizer |
// | VERA   | member    | —         | LOC_A1 viewer; LOC_A3 organizer                  |
// | BEN    | —         | owner     | LOC_B1 organizer                                 |
//
// - LOC_A3 is in hh_a, and USER has no role on it. A read scoped only by
//   household would count it.
// - Every request of USER pins hh_a through `requestCache.householdId`, the
//   H4 pattern. Since H5b `ensureHousehold` gives a fixed answer (decision
//   T14), but the pin says which household on purpose. Every operation here
//   is a QUERY, and a query is not wrapped by `forgetRolesAroundEach`, so the
//   pin holds (decision T15 forgets it only around a `Mutation` field).

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createCartFake } = await import('../test/cartFake.js')
  const { createInventoryLogFake } = await import('../test/inventoryLogFake.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const world = createHouseholdWorld()
  const carts = createCartFake()
  const logs = createInventoryLogFake()
  const items = createOwnedRowFake({
    model: 'Item',
    scope: 'householdId',
    rows: [
      { id: 'item_a', householdId: 'hh_a', userId: 'user_u', amountPerPackage: null },
      { id: 'item_b', householdId: 'hh_b', userId: 'user_ben', amountPerPackage: null },
    ],
  })
  world.extend(
    {
      cart: carts.client.cart,
      cartItem: carts.client.cartItem,
      inventoryLog: logs.client,
      item: { findMany: items.client.findMany },
    },
    [carts.state as unknown as Record<string, unknown>, logs.state as unknown as Record<string, unknown>],
  )
  return { prisma: { ...world.client, $world: world, $carts: carts } }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import { makeStock } from '../test/stockFake.js'

const handles = prisma as unknown as { $world: HouseholdWorld; $carts: CartFake }
const world = handles.$world
const carts = handles.$carts

const USER = 'user_u'
const VERA = 'user_vera'
const BEN = 'user_ben'

const LOC_A1 = 'loc_a1'
const LOC_A2 = 'loc_a2'
const LOC_A3 = 'loc_a3'
const LOC_B1 = 'loc_b1'
const LOC_B2 = 'loc_b2'

const OLD = new Date('2026-01-01T00:00:00.000Z')
const NEW = new Date('2026-06-01T00:00:00.000Z')

function cartItem(id: string, cartId: string, itemId: string, quantity: number): CartItemRow {
  return { id, cartId, itemId, quantity, userId: USER }
}

function seed() {
  world.reset()
  world.stock.reset(
    [
      { id: LOC_A1, householdId: 'hh_a' },
      { id: LOC_A2, householdId: 'hh_a' },
      { id: LOC_A3, householdId: 'hh_a' },
      { id: LOC_B1, householdId: 'hh_b' },
      { id: LOC_B2, householdId: 'hh_b' },
    ],
    [
      // item_a at a location of hh_a, with OLDER settings
      makeStock({ id: 'st_a_a1', itemId: 'item_a', locationId: LOC_A1, targetQuantity: 5, refillThreshold: 2, updatedAt: OLD }),
      // item_a at LOC_A3 (hh_a, no role for USER)
      makeStock({ id: 'st_a_a3', itemId: 'item_a', locationId: LOC_A3, targetQuantity: 50, updatedAt: OLD }),
      // THE BROKEN ROW: hh_a's item at hh_b's location, with NEWER settings.
      // A copy-on-add that reads every role location picks the newest row.
      makeStock({ id: 'st_a_b1', itemId: 'item_a', locationId: LOC_B1, targetQuantity: 99, refillThreshold: 9, updatedAt: NEW }),
      // hh_b's own item, at hh_b's location
      makeStock({ id: 'st_b_b1', itemId: 'item_b', locationId: LOC_B1, targetQuantity: 7, refillThreshold: 3, updatedAt: OLD }),
    ],
  )
  world.seedHouseholds({
    households: [householdRow('hh_a', USER), householdRow('hh_b', BEN)],
    householdMembers: [
      householdMemberRow('hh_a', USER, 'owner'),
      householdMemberRow('hh_a', VERA, 'member'),
      householdMemberRow('hh_b', BEN, 'owner'),
      householdMemberRow('hh_b', USER, 'member'),
    ],
    locationMembers: [
      locationMemberRow(LOC_A1, USER, 'organizer'),
      locationMemberRow(LOC_A2, USER, 'organizer'),
      locationMemberRow(LOC_A1, VERA, 'viewer'),
      locationMemberRow(LOC_A3, VERA, 'organizer'),
      locationMemberRow(LOC_B1, BEN, 'organizer'),
      locationMemberRow(LOC_B1, USER, 'organizer'),
      locationMemberRow(LOC_B2, USER, 'organizer'),
    ],
  })
  carts.reset({
    carts: [
      { id: `${LOC_A1}:no-vendor`, locationId: LOC_A1, lastPurchasedAt: null },
      { id: `${LOC_A2}:no-vendor`, locationId: LOC_A2, lastPurchasedAt: null },
      { id: `${LOC_A3}:no-vendor`, locationId: LOC_A3, lastPurchasedAt: null },
      { id: `${LOC_B1}:no-vendor`, locationId: LOC_B1, lastPurchasedAt: null },
      { id: `${LOC_B2}:no-vendor`, locationId: LOC_B2, lastPurchasedAt: null },
    ],
    cartItems: [
      cartItem('ci_a1', `${LOC_A1}:no-vendor`, 'item_a', 1),
      cartItem('ci_a2', `${LOC_A2}:no-vendor`, 'item_a', 2),
      cartItem('ci_a3', `${LOC_A3}:no-vendor`, 'item_a', 4),
      // THE BROKEN ROW: hh_a's item in a cart at hh_b's location
      cartItem('ci_a_b1', `${LOC_B1}:no-vendor`, 'item_a', 8),
      cartItem('ci_b_b2', `${LOC_B2}:no-vendor`, 'item_b', 3),
    ],
  })
}

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(query: string, variables: Record<string, unknown>, userId = USER, householdId = 'hh_a') {
  const res = await server.executeOperation(
    { query, variables },
    { contextValue: { userId, requestCache: { householdId: Promise.resolve(householdId) } } },
  )
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

function stockAt(itemId: string, locationId: string) {
  return world.stock.state.itemStocks.find((s) => s.itemId === itemId && s.locationId === locationId)
}

const COUNT = `query Q($itemId: ID!) { cartItemCountByItem(itemId: $itemId) }`
const STOCKS = `query Q($itemId: ID!) { itemStocksForItem(itemId: $itemId) { id locationId } }`
const ADD = `mutation M($itemId: ID!, $locationId: ID!) {
  addItemToLocation(itemId: $itemId, locationId: $locationId) { id targetQuantity refillThreshold }
}`
const CHECKOUT = `mutation M($c: ID!, $items: [CheckoutItemInput!]!) {
  checkout(cartId: $c, items: $items) { id }
}`

beforeEach(() => seed())

describe('reads across locations give one household (households H5 task F.2)', () => {
  it('user in two households counts only the carts of the pinned household', async () => {
    // When USER, pinned to hh_a, asks how many of item_a are in any cart
    const res = await run(COUNT, { itemId: 'item_a' })

    // Then 2 rows: LOC_A1's and LOC_A2's. (It counts ROWS, not amounts.) Not
    // LOC_A3's (no role), and not LOC_B1's, which is hh_b's location although
    // USER organizes it.
    expect(res.errors).toBeUndefined()
    expect(res.data?.cartItemCountByItem).toBe(2)
  })

  it('a household member with a viewer role counts the carts of their own locations only', async () => {
    // VERA is a viewer of LOC_A1 and organizes LOC_A3; she has no role on
    // LOC_A2. She is in one household, so this is a control: it shows the
    // filter keeps a viewer's rows and the rows of a location USER cannot see.
    const res = await run(COUNT, { itemId: 'item_a' }, VERA)
    expect(res.errors).toBeUndefined()
    expect(res.data?.cartItemCountByItem).toBe(2)
  })

  it("user in two households sees only the pinned household's stock rows of an item", async () => {
    const res = await run(STOCKS, { itemId: 'item_a' })

    // Then only LOC_A1's row. Not LOC_A3 (no role), not LOC_B1 (hh_b).
    expect(res.errors).toBeUndefined()
    expect(res.data?.itemStocksForItem).toEqual([{ id: 'st_a_a1', locationId: LOC_A1 }])
  })

  it("user in two households adding an item copies settings from the location's household only", async () => {
    // When USER adds item_a to LOC_A2 with no source location named
    const res = await run(ADD, { itemId: 'item_a', locationId: LOC_A2 })

    // Then the settings come from LOC_A1 (target 5), not from the newer row
    // at hh_b's LOC_B1 (target 99)
    expect(res.errors).toBeUndefined()
    expect(stockAt('item_a', LOC_A2)).toMatchObject({ targetQuantity: 5, refillThreshold: 2 })
  })

  it("user in two households checking out copies settings from the cart's household only", async () => {
    // When USER checks out LOC_A2's cart, where item_a is not stocked yet
    const res = await run(CHECKOUT, { c: `${LOC_A2}:no-vendor`, items: [{ cartItemId: 'ci_a2', quantity: 2 }] })

    // Then the new row has LOC_A1's settings and the 2 bought, not LOC_B1's
    expect(res.errors).toBeUndefined()
    expect(stockAt('item_a', LOC_A2)).toMatchObject({ targetQuantity: 5, refillThreshold: 2, packedQuantity: 2 })
  })
})

describe("the two writes read the LOCATION's household, not the caller's", () => {
  it("user pinned to one household, adding the other household's item to its location, keeps that household's settings", async () => {
    // Given USER is pinned to hh_a, and item_b (hh_b) is stocked at LOC_B1
    // with target 7. When USER adds item_b to LOC_B2, also in hh_b
    const res = await run(ADD, { itemId: 'item_b', locationId: LOC_B2 })

    // Then the settings come from LOC_B1. A filter on the CALLER's household
    // (hh_a) would find no source and write target 0.
    expect(res.errors).toBeUndefined()
    expect(stockAt('item_b', LOC_B2)).toMatchObject({ targetQuantity: 7, refillThreshold: 3 })
  })

  it("user pinned to one household, checking out the other household's cart, keeps that household's settings", async () => {
    const res = await run(CHECKOUT, { c: `${LOC_B2}:no-vendor`, items: [{ cartItemId: 'ci_b_b2', quantity: 3 }] })

    expect(res.errors).toBeUndefined()
    expect(stockAt('item_b', LOC_B2)).toMatchObject({ targetQuantity: 7, refillThreshold: 3, packedQuantity: 3 })
  })
})
