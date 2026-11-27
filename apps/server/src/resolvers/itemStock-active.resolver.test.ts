import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { CartFake, CartItemRow, CartRow } from '../test/cartFake.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { InventoryLogFake } from '../test/inventoryLogFake.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'

// The "Active here" switch on the server: `ItemStock.isActive`
// (docs/features/items/2026-11-26-item-stock-active-design.md, PR 1, task S.3).
//
// | Rule | Where |
// |---|---|
// | `upsertItemStock` writes a given boolean; `null` and a missing key leave the row alone | `toData` (itemStock.resolver.ts) |
// | a NEW row opens active, unless the caller says otherwise | `writeStock` (lib/itemStockWrite.ts) |
// | copy-on-add opens a new row active, even from an inactive source (owner answer 1A) | `ensureStockAtLocation` |
// | checkout, cooking and a unit switch never change the switch (owner answer 3A) | they do not write `isActive` |
//
// ── WHY THE FAKE MATTERS HERE ──
//
// The real column is `NOT NULL DEFAULT true`. `stockFake` does NOT apply that
// default: a row created with no `isActive` has no key. So "a new row is
// active" is only visible because the resolver writes `true` itself. The fake
// also refuses `null`, like Postgres. See `FakeStock.isActive` in
// src/test/stockFake.ts.
//
// The mock factory is the one of `stock-live-publish.resolver.test.ts`, with
// the failure hooks taken out.

type ItemRow = {
  id: string
  householdId: string
  name: string
  targetUnit: 'package' | 'measurement'
  measurementUnit: string | null
  amountPerPackage: number | null
  consumeAmount: number
  createdAt: Date
  updatedAt: Date
}

type RecipeRow = { id: string; householdId: string; name: string; lastCookedAt: Date | null }

type RecipeItemRow = { recipeId: string; itemId: string; defaultAmount: number }

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createCartFake } = await import('../test/cartFake.js')
  const { createInventoryLogFake } = await import('../test/inventoryLogFake.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const world = createHouseholdWorld()
  const carts = createCartFake()
  const logs = createInventoryLogFake()
  const items = createOwnedRowFake<ItemRow>({
    model: 'Item',
    scope: 'householdId',
    relations: () => ({ tags: [], vendors: [] }),
  })
  const recipes = createOwnedRowFake<RecipeRow>({ model: 'Recipe', scope: 'householdId' })
  const extra: { recipeItems: RecipeItemRow[]; [key: string]: unknown } = { recipeItems: [] }

  world.extend(
    {
      cart: carts.client.cart,
      cartItem: carts.client.cartItem,
      inventoryLog: logs.client,
      item: items.client,
      recipe: recipes.client,
      recipeItem: {
        deleteMany: async ({ where }: { where: { recipeId: string } }) => {
          const before = extra.recipeItems.length
          extra.recipeItems = extra.recipeItems.filter((r) => r.recipeId !== where.recipeId)
          return { count: before - extra.recipeItems.length }
        },
        createMany: async ({ data }: { data: RecipeItemRow[] }) => {
          extra.recipeItems.push(...data)
          return { count: data.length }
        },
      },
      // The row locks of `upsertItemStock` and `consumeRecipes`. One request
      // at a time here, so a lock has nothing to do.
      $queryRaw: async () => [],
    },
    [
      carts.state as unknown as Record<string, unknown>,
      logs.state as unknown as Record<string, unknown>,
      items.state as unknown as Record<string, unknown>,
      recipes.state as unknown as Record<string, unknown>,
      extra,
    ],
  )
  return {
    prisma: {
      ...world.client,
      $world: world,
      $carts: carts,
      $logs: logs,
      $items: items,
      $recipes: recipes,
      $extra: extra,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import { makeStock } from '../test/stockFake.js'

const handles = prisma as unknown as {
  $world: HouseholdWorld
  $carts: CartFake
  $logs: InventoryLogFake
  $items: { state: { rows: ItemRow[] } }
  $recipes: { state: { rows: RecipeRow[] } }
  $extra: { recipeItems: RecipeItemRow[] }
}
const world = handles.$world
const carts = handles.$carts
const logs = handles.$logs
const items = handles.$items
const recipes = handles.$recipes
const extra = handles.$extra

const ALICE = 'user_alice'
const LOC_HOME = 'loc_home'
const LOC_GARAGE = 'loc_garage'
const HOME_CART = `${LOC_HOME}:no-vendor`
const GARAGE_CART = `${LOC_GARAGE}:no-vendor`
const TAB = 'tab-alice-1'
const T0 = new Date('2026-01-01T00:00:00.000Z')
const T1 = new Date('2026-01-02T00:00:00.000Z')

function item(id: string): ItemRow {
  return {
    id,
    householdId: 'hh_home',
    name: id,
    targetUnit: 'package',
    measurementUnit: null,
    amountPerPackage: null,
    consumeAmount: 1,
    createdAt: T0,
    updatedAt: T0,
  }
}

function cartRow(id: string, locationId: string): CartRow {
  return { id, locationId, lastPurchasedAt: null }
}

function cartItemRow(id: string, cartId: string, itemId: string): CartItemRow {
  return { id, cartId, itemId, quantity: 2, userId: ALICE }
}

// | Row | Item | Location | isActive | target | packed |
// |---|---|---|---|---|---|
// | st_milk_home | milk | HOME | false | 5 | 3 |
// | st_milk_garage | milk | GARAGE | true | 2 | 1 |
// | st_bread_garage | bread | GARAGE | false | 4 | 0 |
//
// The inactive rows have a NON-zero target on purpose. Under the old rule
// (`targetQuantity !== 0`) they would read as active, so a writer that
// re-derives the switch from the target is visible.
// Bread is NOT stocked at HOME: copy-on-add and checkout create that row.
function seed() {
  world.reset()
  world.stock.reset(
    [
      { id: LOC_HOME, householdId: 'hh_home' },
      { id: LOC_GARAGE, householdId: 'hh_home' },
    ],
    [
      makeStock({
        id: 'st_milk_home',
        itemId: 'item_milk',
        locationId: LOC_HOME,
        isActive: false,
        targetQuantity: 5,
        packedQuantity: 3,
      }),
      makeStock({
        id: 'st_milk_garage',
        itemId: 'item_milk',
        locationId: LOC_GARAGE,
        isActive: true,
        targetQuantity: 2,
        packedQuantity: 1,
      }),
      makeStock({
        id: 'st_bread_garage',
        itemId: 'item_bread',
        locationId: LOC_GARAGE,
        isActive: false,
        targetQuantity: 4,
        refillThreshold: 1,
        updatedAt: T1,
      }),
    ],
  )
  world.seedHouseholds({
    households: [householdRow('hh_home', ALICE)],
    householdMembers: [householdMemberRow('hh_home', ALICE, 'owner')],
    locationMembers: [
      locationMemberRow(LOC_HOME, ALICE, 'organizer'),
      locationMemberRow(LOC_GARAGE, ALICE, 'organizer'),
    ],
  })
  items.state.rows = [item('item_milk'), item('item_bread')]
  recipes.state.rows = [{ id: 'rec_pancakes', householdId: 'hh_home', name: 'Pancakes', lastCookedAt: null }]
  extra.recipeItems = [{ recipeId: 'rec_pancakes', itemId: 'item_milk', defaultAmount: 1 }]
  logs.reset([])
  carts.reset({
    carts: [cartRow(HOME_CART, LOC_HOME), cartRow(GARAGE_CART, LOC_GARAGE)],
    cartItems: [
      cartItemRow('ci_milk_home', HOME_CART, 'item_milk'),
      cartItemRow('ci_bread_home', HOME_CART, 'item_bread'),
    ],
  })
}

let seen: ChangeEvent[] = []
let unsubscribe: () => void = () => undefined

beforeEach(() => {
  seed()
  seen = []
  unsubscribe = liveEvents.subscribe((event) => {
    seen.push(event)
  })
})

afterEach(() => {
  unsubscribe()
})

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(query: string, variables: Record<string, unknown>) {
  const contextValue: Context = { userId: ALICE, clientId: TAB }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

function stored(itemId: string, locationId: string) {
  return world.stock.state.itemStocks.find((s) => s.itemId === itemId && s.locationId === locationId)
}

const UPSERT_STOCK = `mutation M($i: ID!, $l: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $i, locationId: $l, input: $input) { id isActive targetQuantity }
}`
const ADD_TO_LOCATION = `mutation M($i: ID!, $l: ID!) {
  addItemToLocation(itemId: $i, locationId: $l) { id isActive targetQuantity refillThreshold }
}`
const CHECKOUT = `mutation M($c: ID!, $items: [CheckoutItemInput!]!) { checkout(cartId: $c, items: $items) { id } }`
const CONSUME = `mutation M($input: ConsumeRecipesInput!) { consumeRecipes(input: $input) { allSucceeded } }`
const UNIT_SWITCH = `mutation M($input: ApplyUnitSwitchInput!) { applyUnitSwitch(input: $input) { id } }`
const ITEM_STOCKS = `query Q($l: ID!) { itemStocks(locationId: $l) { id isActive } }`

describe('upsertItemStock and isActive', () => {
  it('user can turn an item off at a location: isActive false is written', async () => {
    // Given milk is active at the garage
    // When the switch is turned off
    const res = await run(UPSERT_STOCK, { i: 'item_milk', l: LOC_GARAGE, input: { isActive: false } })

    // Then the row and the answer both say inactive, and the target is kept
    expect(res.errors).toBeUndefined()
    expect(res.data?.upsertItemStock).toMatchObject({ isActive: false, targetQuantity: 2 })
    expect(stored('item_milk', LOC_GARAGE)?.isActive).toBe(false)
  })

  it('a save with no isActive key leaves a stored false alone', async () => {
    const res = await run(UPSERT_STOCK, { i: 'item_milk', l: LOC_HOME, input: { packedQuantity: 4 } })

    expect(res.errors).toBeUndefined()
    expect(stored('item_milk', LOC_HOME)).toMatchObject({ isActive: false, packedQuantity: 4 })
  })

  it('a save with isActive null leaves a stored false alone (null is "leave it")', async () => {
    const res = await run(UPSERT_STOCK, {
      i: 'item_milk',
      l: LOC_HOME,
      input: { isActive: null, packedQuantity: 4 },
    })

    expect(res.errors).toBeUndefined()
    expect(stored('item_milk', LOC_HOME)).toMatchObject({ isActive: false, packedQuantity: 4 })
  })

  it('a save with no isActive does not copy the old rule from the target (owner answer 3A)', async () => {
    // Target 0 used to mean "inactive". It no longer does: the switch stays on.
    const res = await run(UPSERT_STOCK, { i: 'item_milk', l: LOC_GARAGE, input: { targetQuantity: 0 } })

    expect(res.errors).toBeUndefined()
    expect(stored('item_milk', LOC_GARAGE)).toMatchObject({ isActive: true, targetQuantity: 0 })
  })

  it('a NEW row with no isActive opens active, even with target 0', async () => {
    // Bread is not stocked at HOME yet.
    const res = await run(UPSERT_STOCK, { i: 'item_bread', l: LOC_HOME, input: { packedQuantity: 1 } })

    expect(res.errors).toBeUndefined()
    expect(res.data?.upsertItemStock).toMatchObject({ isActive: true, targetQuantity: 0 })
    expect(stored('item_bread', LOC_HOME)?.isActive).toBe(true)
  })

  it('a NEW row with isActive false opens inactive', async () => {
    const res = await run(UPSERT_STOCK, { i: 'item_bread', l: LOC_HOME, input: { isActive: false } })

    expect(res.errors).toBeUndefined()
    expect(stored('item_bread', LOC_HOME)?.isActive).toBe(false)
  })

  it('a save that only flips the switch writes no stock count log and publishes STOCK alone', async () => {
    const res = await run(UPSERT_STOCK, { i: 'item_milk', l: LOC_HOME, input: { isActive: true } })

    expect(res.errors).toBeUndefined()
    expect(stored('item_milk', LOC_HOME)?.isActive).toBe(true)
    expect(logs.state.logs).toEqual([])
    expect(seen.map((e) => e.kind)).toEqual(['STOCK'])
  })

  it('the itemStocks query answers isActive', async () => {
    const res = await run(ITEM_STOCKS, { l: LOC_GARAGE })

    expect(res.errors).toBeUndefined()
    const rows = (res.data?.itemStocks ?? []) as { id: string; isActive: boolean }[]
    expect(Object.fromEntries(rows.map((r) => [r.id, r.isActive]))).toEqual({
      st_milk_garage: true,
      st_bread_garage: false,
    })
  })
})

describe('copy-on-add and isActive', () => {
  it('user can add an item to a location: the new row opens active, even from an inactive source (owner answer 1A)', async () => {
    // Given bread is stocked only at the garage, and is inactive there
    // When it is added to HOME
    const res = await run(ADD_TO_LOCATION, { i: 'item_bread', l: LOC_HOME })

    // Then the new row is active, and still inherits the target and the refill
    expect(res.errors).toBeUndefined()
    expect(res.data?.addItemToLocation).toMatchObject({ isActive: true, targetQuantity: 4, refillThreshold: 1 })
    expect(stored('item_bread', LOC_HOME)?.isActive).toBe(true)
    // The source row is not touched
    expect(stored('item_bread', LOC_GARAGE)?.isActive).toBe(false)
  })

  it('an item already stocked there comes back untouched, inactive', async () => {
    const res = await run(ADD_TO_LOCATION, { i: 'item_bread', l: LOC_GARAGE })

    expect(res.errors).toBeUndefined()
    expect(res.data?.addItemToLocation).toMatchObject({ id: 'st_bread_garage', isActive: false })
    expect(stored('item_bread', LOC_GARAGE)?.isActive).toBe(false)
  })
})

describe('checkout, cooking and a unit switch keep the switch as it is', () => {
  // A checkout must name every row of the cart, or it is refused as "the
  // cart changed". So both tests send both rows.
  const BOTH = [
    { cartItemId: 'ci_milk_home', quantity: 2 },
    { cartItemId: 'ci_bread_home', quantity: 2 },
  ]

  it('checkout of an inactive item succeeds and leaves it inactive', async () => {
    const res = await run(CHECKOUT, { c: HOME_CART, items: BOTH })

    expect(res.errors).toBeUndefined()
    expect(stored('item_milk', LOC_HOME)).toMatchObject({ isActive: false, packedQuantity: 5 })
  })

  it('checkout of an item not stocked at the cart\'s location opens its new row active', async () => {
    // Bread is stocked only at the garage, inactive. Buying it at HOME makes a
    // new HOME row through copy-on-add.
    const res = await run(CHECKOUT, { c: HOME_CART, items: BOTH })

    expect(res.errors).toBeUndefined()
    expect(stored('item_bread', LOC_HOME)).toMatchObject({ isActive: true, packedQuantity: 2 })
    expect(stored('item_bread', LOC_GARAGE)?.isActive).toBe(false)
  })

  it('cooking with an inactive item succeeds and leaves it inactive', async () => {
    const res = await run(CONSUME, {
      input: {
        occurredAt: '2026-02-01T00:00:00.000Z',
        recipeIds: ['rec_pancakes'],
        items: [{ itemId: 'item_milk', delta: -1 }],
        locationId: LOC_HOME,
      },
    })

    expect(res.errors).toBeUndefined()
    expect(res.data?.consumeRecipes).toEqual({ allSucceeded: true })
    expect(stored('item_milk', LOC_HOME)).toMatchObject({ isActive: false, packedQuantity: 2 })
  })

  it('a unit switch leaves an inactive row inactive and an active row active', async () => {
    const res = await run(UNIT_SWITCH, {
      input: {
        itemId: 'item_milk',
        updates: { targetUnit: 'measurement', measurementUnit: 'ml', amountPerPackage: 1000 },
        stockConversions: [
          { locationId: LOC_HOME, quantities: { targetQuantity: 5000, packedQuantity: 0, unpackedQuantity: 3000 } },
          { locationId: LOC_GARAGE, quantities: { targetQuantity: 2000, packedQuantity: 0, unpackedQuantity: 1000 } },
        ],
        recipeUpdates: [],
      },
    })

    expect(res.errors).toBeUndefined()
    expect(stored('item_milk', LOC_HOME)).toMatchObject({ isActive: false, targetQuantity: 5000 })
    expect(stored('item_milk', LOC_GARAGE)).toMatchObject({ isActive: true, targetQuantity: 2000 })
  })
})
