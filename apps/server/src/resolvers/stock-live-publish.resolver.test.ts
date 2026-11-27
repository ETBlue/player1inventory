import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { CartFake, CartItemRow, CartRow } from '../test/cartFake.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { InventoryLogFake } from '../test/inventoryLogFake.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'

// The `STOCK`, `LOG` and (for two of them) `CATALOG` and `CART` events of
// the stock and log mutations (households H3c-2, task D.2). `checkout`'s
// events are tested in `cart-live-publish.resolver.test.ts`.
//
// ── HOW THE BUS IS WATCHED ──
//
// The same way as `cart-live-publish.resolver.test.ts`: a recording listener
// on the DEFAULT bus (`liveEvents`), removed after each test. For each event
// it notes whether a `$transaction` callback was still running
// (`inTransaction`), which is how "published after commit" is checked.
//
// ── THE FIXTURE ──
//
// | Person   | Households                         | Location roles                          |
// |----------|------------------------------------|-----------------------------------------|
// | ALICE    | hh_home owner, hh_second member    | LOC_HOME, LOC_GARAGE, LOC_SECOND        |
// |          |                                    | organizer                               |
// | BOB      | hh_home member                     | LOC_HOME participant                    |
// | VERA     | hh_home member                     | LOC_HOME viewer                         |
// | CAROL    | hh_second owner                    | LOC_SECOND organizer                    |
// | STRANGER | hh_other owner                     | LOC_STRANGER organizer                  |
//
// TWO locations in hh_home, so an event with the wrong `locationId` is
// visible. ALICE is also in hh_second, listed AFTER hh_home, so
// `requireHousehold(ALICE)` answers hh_home while LOC_SECOND belongs to
// hh_second. An event that carried the caller's household instead of the
// location's would say hh_home for a LOC_SECOND change.

const hooks: {
  /** How many `$transaction` callbacks are running right now. */
  transactionDepth: number
  /** Throws from `recipe.updateMany` (consumeRecipes' last write). */
  failRecipeMark?: boolean
  /** Throws from `cartItem.deleteMany` (removeItemFromLocation's last write). */
  failCartDelete?: boolean
  /** Throws from `recipeItem.createMany` (applyUnitSwitch's last write). */
  failRecipeItems?: boolean
  /** The `inventoryLog.upsert` call number (1-based) that throws. */
  failLogUpsertNumber?: number
  logUpserts: number
} = { transactionDepth: 0, logUpserts: 0 }

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

  const worldTransaction = world.client.$transaction
  world.extend(
    {
      cart: carts.client.cart,
      cartItem: {
        ...carts.client.cartItem,
        deleteMany: async (args: Parameters<typeof carts.client.cartItem.deleteMany>[0]) => {
          if (hooks.failCartDelete) throw new Error('cartItem.deleteMany failed on purpose')
          return carts.client.cartItem.deleteMany(args)
        },
      },
      inventoryLog: {
        ...logs.client,
        upsert: async (args: Parameters<typeof logs.client.upsert>[0]) => {
          hooks.logUpserts += 1
          if (hooks.logUpserts === hooks.failLogUpsertNumber) throw new Error('upsert failed on purpose')
          return logs.client.upsert(args)
        },
      },
      item: items.client,
      recipe: {
        ...recipes.client,
        updateMany: async (args: Parameters<typeof recipes.client.updateMany>[0]) => {
          if (hooks.failRecipeMark) throw new Error('recipe.updateMany failed on purpose')
          return recipes.client.updateMany(args)
        },
      },
      recipeItem: {
        deleteMany: async ({ where }: { where: { recipeId: string } }) => {
          const before = extra.recipeItems.length
          extra.recipeItems = extra.recipeItems.filter((r) => r.recipeId !== where.recipeId)
          return { count: before - extra.recipeItems.length }
        },
        createMany: async ({ data }: { data: RecipeItemRow[] }) => {
          if (hooks.failRecipeItems) throw new Error('recipeItem.createMany failed on purpose')
          extra.recipeItems.push(...data)
          return { count: data.length }
        },
      },
      // consumeRecipes' row lock. This file runs one cook at a time, so the
      // lock has nothing to do; `recipe-consume.resolver.test.ts` tests it.
      $queryRaw: async () => [],
      // Counts the open callbacks, so a listener can see whether it was
      // called while a transaction was still running.
      $transaction: async (arg: unknown) => {
        hooks.transactionDepth += 1
        try {
          return await worldTransaction(arg)
        } finally {
          hooks.transactionDepth -= 1
        }
      },
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
import { makeInventoryLog } from '../test/inventoryLogFake.js'
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
const BOB = 'user_bob'
const VERA = 'user_vera'
const CAROL = 'user_carol'
const STRANGER = 'user_stranger'

const LOC_HOME = 'loc_home'
const LOC_GARAGE = 'loc_garage'
const LOC_SECOND = 'loc_second'
const LOC_STRANGER = 'loc_stranger'

const TAB = 'tab-alice-1'
const T0 = new Date('2026-01-01T00:00:00.000Z')

function item(id: string, householdId: string): ItemRow {
  return {
    id,
    householdId,
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
  return { id, cartId, itemId, quantity: 1, userId: ALICE }
}

function seed() {
  hooks.transactionDepth = 0
  hooks.failRecipeMark = undefined
  hooks.failCartDelete = undefined
  hooks.failRecipeItems = undefined
  hooks.failLogUpsertNumber = undefined
  hooks.logUpserts = 0
  world.reset()
  world.stock.reset(
    [
      { id: LOC_HOME, householdId: 'hh_home' },
      { id: LOC_GARAGE, householdId: 'hh_home' },
      { id: LOC_SECOND, householdId: 'hh_second' },
      { id: LOC_STRANGER, householdId: 'hh_other' },
    ],
    [
      makeStock({ id: 'st_milk_home', itemId: 'item_milk', locationId: LOC_HOME, packedQuantity: 3 }),
      makeStock({ id: 'st_milk_garage', itemId: 'item_milk', locationId: LOC_GARAGE, packedQuantity: 1 }),
      makeStock({ id: 'st_tea_second', itemId: 'item_tea', locationId: LOC_SECOND, packedQuantity: 2 }),
    ],
  )
  world.seedHouseholds({
    households: [
      householdRow('hh_home', ALICE),
      householdRow('hh_second', CAROL),
      householdRow('hh_other', STRANGER),
    ],
    householdMembers: [
      // ALICE's hh_home row joined LATER than her hh_second row, so hh_home
      // is NOT her oldest membership. She acts in hh_home only because it is
      // her active household (set below; decision T14 of the H5b plan). A
      // test that targets hh_home therefore goes red if the active
      // household is ignored.
      { ...householdMemberRow('hh_home', ALICE, 'owner'), joinedAt: new Date('2026-11-02T00:00:00.000Z') },
      householdMemberRow('hh_home', BOB, 'member'),
      householdMemberRow('hh_home', VERA, 'member'),
      householdMemberRow('hh_second', CAROL, 'owner'),
      householdMemberRow('hh_second', ALICE, 'member'),
      householdMemberRow('hh_other', STRANGER, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_HOME, ALICE, 'organizer'),
      locationMemberRow(LOC_GARAGE, ALICE, 'organizer'),
      locationMemberRow(LOC_SECOND, ALICE, 'organizer'),
      locationMemberRow(LOC_HOME, BOB, 'participant'),
      locationMemberRow(LOC_HOME, VERA, 'viewer'),
      locationMemberRow(LOC_SECOND, CAROL, 'organizer'),
      locationMemberRow(LOC_STRANGER, STRANGER, 'organizer'),
    ],
  })
  world.setActiveHousehold(ALICE, 'hh_home')
  items.state.rows = [
    item('item_milk', 'hh_home'),
    item('item_bread', 'hh_home'),
    item('item_tea', 'hh_second'),
    item('item_theirs', 'hh_other'),
  ]
  recipes.state.rows = [
    { id: 'rec_pancakes', householdId: 'hh_home', name: 'Pancakes', lastCookedAt: null },
    { id: 'rec_theirs', householdId: 'hh_other', name: 'Theirs', lastCookedAt: null },
  ]
  extra.recipeItems = [{ recipeId: 'rec_pancakes', itemId: 'item_milk', defaultAmount: 1 }]
  logs.reset([
    makeInventoryLog({ id: 'log_milk_home', itemId: 'item_milk', userId: ALICE, locationId: LOC_HOME }),
    makeInventoryLog({ id: 'log_milk_garage', itemId: 'item_milk', userId: ALICE, locationId: LOC_GARAGE }),
  ])
  carts.reset({
    carts: [cartRow(`${LOC_HOME}:no-vendor`, LOC_HOME), cartRow(`${LOC_GARAGE}:no-vendor`, LOC_GARAGE)],
    cartItems: [
      cartItemRow('ci_milk_home', `${LOC_HOME}:no-vendor`, 'item_milk'),
      cartItemRow('ci_milk_garage', `${LOC_GARAGE}:no-vendor`, 'item_milk'),
    ],
  })
}

// ─── the recording listener ──────────────────────────────────────────────────

type Seen = { event: ChangeEvent; inTransaction: boolean; stockIds: string[]; logIds: string[] }
let seen: Seen[] = []
let unsubscribe: () => void = () => undefined

beforeEach(() => {
  seed()
  seen = []
  unsubscribe = liveEvents.subscribe((event) => {
    seen.push({
      event,
      inTransaction: hooks.transactionDepth > 0,
      stockIds: world.stock.state.itemStocks.map((s) => s.id).sort(),
      logIds: logs.state.logs.map((l) => l.id).sort(),
    })
  })
})

afterEach(() => {
  unsubscribe()
})

function events(): ChangeEvent[] {
  return seen.map((s) => s.event)
}

/** Sorted by kind, then location, so the order inside a batch does not matter. */
function sortedEvents(): ChangeEvent[] {
  return events().sort(
    (a, b) => a.kind.localeCompare(b.kind) || (a.locationId ?? '').localeCompare(b.locationId ?? ''),
  )
}

function change(kind: ChangeEvent['kind'], locationId: string | null, householdId: string): ChangeEvent {
  return { kind, householdId, locationId, sourceClientId: TAB }
}

// ─── running a mutation ──────────────────────────────────────────────────────

const server = new ApolloServer<Context>({ typeDefs, resolvers })

/**
 * `householdId`, when given, becomes the caller's active household
 * (`User.activeHouseholdId`, decision T14 of the H5b plan; H4 plan rule 16).
 * An import writes into that household. Without it, `ensureHousehold` picks
 * the caller's oldest membership.
 */
async function run(query: string, variables: Record<string, unknown>, userId: string, householdId?: string) {
  // Since H5b the chosen household is the person's active one (decision
  // T14). A pin on `requestCache` is forgotten before every `Mutation`
  // field (decision T15).
  if (householdId !== undefined) world.setActiveHousehold(userId, householdId)
  const contextValue: Context = {
    userId,
    clientId: TAB,
  }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

function code(res: { errors?: ReadonlyArray<{ extensions?: Record<string, unknown> }> }) {
  return res.errors?.[0]?.extensions?.code
}

const UPSERT_STOCK = `mutation M($i: ID!, $l: ID!, $input: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $input) { id } }`
const ADD_TO_LOCATION = `mutation M($i: ID!, $l: ID!) { addItemToLocation(itemId: $i, locationId: $l) { id } }`
const REMOVE_FROM_LOCATION = `mutation M($i: ID!, $l: ID!) { removeItemFromLocation(itemId: $i, locationId: $l) }`
const ADD_LOG = `mutation M($i: ID!, $l: ID!) { addInventoryLog(itemId: $i, delta: 1, quantity: 4, occurredAt: "2026-02-01T00:00:00.000Z", locationId: $l) { id } }`
const CONSUME = `mutation M($input: ConsumeRecipesInput!) { consumeRecipes(input: $input) { allSucceeded } }`
const UNIT_SWITCH = `mutation M($input: ApplyUnitSwitchInput!) { applyUnitSwitch(input: $input) { id } }`
const BULK_CREATE_STOCKS = `mutation M($rows: [ItemStockImportInput!]!) { bulkCreateItemStocks(itemStocks: $rows) { id } }`
const BULK_UPSERT_STOCKS = `mutation M($rows: [ItemStockImportInput!]!) { bulkUpsertItemStocks(itemStocks: $rows) { id } }`
const BULK_CREATE_LOGS = `mutation M($rows: [InventoryLogInput!]!) { bulkCreateInventoryLogs(logs: $rows) { id } }`
const BULK_UPSERT_LOGS = `mutation M($rows: [InventoryLogInput!]!) { bulkUpsertInventoryLogs(logs: $rows) { id } }`

function stockImport(id: string, itemId: string, locationId: string, packedQuantity = 5) {
  return {
    id,
    itemId,
    locationId,
    targetQuantity: 1,
    refillThreshold: 0,
    packedQuantity,
    unpackedQuantity: 0,
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
  }
}

function logImport(id: string, itemId: string, locationId: string) {
  return { id, itemId, locationId, delta: 1, quantity: 1, occurredAt: T0.toISOString() }
}

// ─── upsertItemStock, addItemToLocation, addInventoryLog ─────────────────────

describe('the one-row stock and log mutations', () => {
  // Since the inventory log layout (design 2026-11-25) a save that changes
  // the on-hand total also writes a `stockCount` log row, in the same
  // transaction, so it publishes `LOG` with `STOCK`.
  it('upsertItemStock that changes the amount publishes STOCK and LOG for its location, after the write', async () => {
    const res = await run(UPSERT_STOCK, { i: 'item_bread', l: LOC_GARAGE, input: { packedQuantity: 2 } }, ALICE)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([change('STOCK', LOC_GARAGE, 'hh_home'), change('LOG', LOC_GARAGE, 'hh_home')])
    expect(seen.every((e) => !e.inTransaction)).toBe(true)
    // The new row was already in the store when the listener ran.
    const saved = world.stock.state.itemStocks.find((s) => s.itemId === 'item_bread')
    expect(seen[0]?.stockIds).toContain(saved?.id)
  })

  it('upsertItemStock carries the LOCATION\'s household, not the caller\'s', async () => {
    const res = await run(UPSERT_STOCK, { i: 'item_tea', l: LOC_SECOND, input: { packedQuantity: 9 } }, ALICE)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([change('STOCK', LOC_SECOND, 'hh_second'), change('LOG', LOC_SECOND, 'hh_second')])
  })

  it('upsertItemStock that changes only the target publishes STOCK alone, no LOG', async () => {
    const res = await run(UPSERT_STOCK, { i: 'item_bread', l: LOC_GARAGE, input: { targetQuantity: 4 } }, ALICE)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([change('STOCK', LOC_GARAGE, 'hh_home')])
  })

  it('addItemToLocation publishes STOCK for its location', async () => {
    const res = await run(ADD_TO_LOCATION, { i: 'item_bread', l: LOC_HOME }, BOB)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([change('STOCK', LOC_HOME, 'hh_home')])
    const saved = world.stock.state.itemStocks.find((s) => s.itemId === 'item_bread')
    expect(seen[0]?.stockIds).toContain(saved?.id)
  })

  it('addInventoryLog publishes LOG, and no STOCK, for its location', async () => {
    const res = await run(ADD_LOG, { i: 'item_milk', l: LOC_GARAGE }, ALICE)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([change('LOG', LOC_GARAGE, 'hh_home')])
    expect(seen[0]?.logIds).toHaveLength(3)
  })

  it('a viewer refused by the role check publishes nothing', async () => {
    const upsert = await run(UPSERT_STOCK, { i: 'item_milk', l: LOC_HOME, input: { packedQuantity: 1 } }, VERA)
    const add = await run(ADD_TO_LOCATION, { i: 'item_bread', l: LOC_HOME }, VERA)
    const log = await run(ADD_LOG, { i: 'item_milk', l: LOC_HOME }, VERA)

    expect([code(upsert), code(add), code(log)]).toEqual(['FORBIDDEN', 'FORBIDDEN', 'FORBIDDEN'])
    expect(events()).toEqual([])
  })

  it('another household\'s item, refused before the write, publishes nothing', async () => {
    const res = await run(UPSERT_STOCK, { i: 'item_theirs', l: LOC_HOME, input: { packedQuantity: 1 } }, ALICE)

    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })
})

// ─── removeItemFromLocation ──────────────────────────────────────────────────

describe('removeItemFromLocation', () => {
  it('publishes STOCK, LOG and CART for that location, after the transaction', async () => {
    const res = await run(REMOVE_FROM_LOCATION, { i: 'item_milk', l: LOC_HOME }, ALICE)

    expect(res.data?.removeItemFromLocation).toBe(true)
    // CART matters: the web does not refetch carts for STOCK or LOG, so
    // without it other tabs keep showing the deleted cart row.
    expect(events()).toEqual([
      change('STOCK', LOC_HOME, 'hh_home'),
      change('LOG', LOC_HOME, 'hh_home'),
      change('CART', LOC_HOME, 'hh_home'),
    ])
    expect(seen.map((s) => s.inTransaction)).toEqual([false, false, false])
    // The garage's rows were not touched, and no event names the garage.
    expect(seen[0]?.stockIds).toEqual(['st_milk_garage', 'st_tea_second'])
  })

  it('publishes only the kinds whose rows it deleted', async () => {
    // item_tea at LOC_SECOND has a stock row, but no log and no cart row.
    const res = await run(REMOVE_FROM_LOCATION, { i: 'item_tea', l: LOC_SECOND }, ALICE)

    expect(res.data?.removeItemFromLocation).toBe(true)
    expect(events()).toEqual([change('STOCK', LOC_SECOND, 'hh_second')])
  })

  it('a participant (it needs organizer) publishes nothing', async () => {
    const res = await run(REMOVE_FROM_LOCATION, { i: 'item_milk', l: LOC_HOME }, BOB)

    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })

  it('a removal whose transaction throws publishes nothing', async () => {
    hooks.failCartDelete = true

    const res = await run(REMOVE_FROM_LOCATION, { i: 'item_milk', l: LOC_HOME }, ALICE)

    expect(res.errors).toBeDefined()
    // Rolled back: the stock row is back.
    expect(world.stock.state.itemStocks.map((s) => s.id)).toContain('st_milk_home')
    expect(events()).toEqual([])
  })
})

// ─── consumeRecipes ──────────────────────────────────────────────────────────

describe('consumeRecipes', () => {
  function cook(locationId: string, itemId: string, recipeIds: string[] = ['rec_pancakes']) {
    return {
      input: {
        occurredAt: '2026-02-01T00:00:00.000Z',
        recipeIds,
        items: [{ itemId, delta: -1 }],
        locationId,
      },
    }
  }

  it('publishes STOCK and LOG at the location and CATALOG for the household, after commit', async () => {
    const res = await run(CONSUME, cook(LOC_GARAGE, 'item_milk'), ALICE)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([
      change('STOCK', LOC_GARAGE, 'hh_home'),
      change('LOG', LOC_GARAGE, 'hh_home'),
      change('CATALOG', null, 'hh_home'),
    ])
    expect(seen.map((s) => s.inTransaction)).toEqual([false, false, false])
    expect(recipes.state.rows.find((r) => r.id === 'rec_pancakes')?.lastCookedAt).not.toBeNull()
  })

  it('STOCK and LOG carry the location\'s household; CATALOG the household whose recipes it marked', async () => {
    // ALICE cooks at LOC_SECOND (hh_second). The recipes are read from her
    // household by `requireHousehold`, hh_home.
    const res = await run(CONSUME, cook(LOC_SECOND, 'item_tea'), ALICE)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([
      change('STOCK', LOC_SECOND, 'hh_second'),
      change('LOG', LOC_SECOND, 'hh_second'),
      change('CATALOG', null, 'hh_home'),
    ])
  })

  it('a cook that marks no recipe sends no CATALOG', async () => {
    // Another household's recipe: `updateMany` matches 0 rows.
    const res = await run(CONSUME, cook(LOC_HOME, 'item_milk', ['rec_theirs']), BOB)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([change('STOCK', LOC_HOME, 'hh_home'), change('LOG', LOC_HOME, 'hh_home')])
  })

  it('a viewer refused by the role check publishes nothing', async () => {
    const res = await run(CONSUME, cook(LOC_HOME, 'item_milk'), VERA)

    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })

  it('a cook whose transaction throws publishes nothing', async () => {
    hooks.failRecipeMark = true

    const res = await run(CONSUME, cook(LOC_HOME, 'item_milk'), ALICE)

    expect(res.errors).toBeDefined()
    // Rolled back: the stock is still 3, and no log was added.
    expect(world.stock.state.itemStocks.find((s) => s.id === 'st_milk_home')?.packedQuantity).toBe(3)
    expect(logs.state.logs).toHaveLength(2)
    expect(events()).toEqual([])
  })
})

// ─── applyUnitSwitch ─────────────────────────────────────────────────────────

describe('applyUnitSwitch', () => {
  function unitSwitch(over: { recipeUpdates?: unknown[]; updates?: Record<string, unknown> } = {}) {
    return {
      input: {
        itemId: 'item_milk',
        updates: over.updates ?? { targetUnit: 'measurement', measurementUnit: 'ml', amountPerPackage: 1000 },
        stockConversions: [
          { locationId: LOC_HOME, quantities: { packedQuantity: 0, unpackedQuantity: 3000 } },
          { locationId: LOC_GARAGE, quantities: { packedQuantity: 0, unpackedQuantity: 1000 } },
        ],
        recipeUpdates: over.recipeUpdates ?? [
          { recipeId: 'rec_pancakes', items: [{ itemId: 'item_milk', defaultAmount: 250 }] },
        ],
      },
    }
  }

  it('publishes STOCK at every converted location and CATALOG for the household, after commit', async () => {
    const res = await run(UNIT_SWITCH, unitSwitch(), ALICE)

    expect(res.errors).toBeUndefined()
    // No LOG: a unit switch writes no inventory log.
    expect(sortedEvents()).toEqual([
      change('CATALOG', null, 'hh_home'),
      change('STOCK', LOC_GARAGE, 'hh_home'),
      change('STOCK', LOC_HOME, 'hh_home'),
    ])
    expect(seen.map((s) => s.inTransaction)).toEqual([false, false, false])
  })

  it('a switch that changes neither the item nor a recipe sends no CATALOG', async () => {
    const res = await run(UNIT_SWITCH, unitSwitch({ updates: {}, recipeUpdates: [] }), ALICE)

    expect(res.errors).toBeUndefined()
    expect(sortedEvents()).toEqual([change('STOCK', LOC_GARAGE, 'hh_home'), change('STOCK', LOC_HOME, 'hh_home')])
  })

  it('a household member (it needs manager) publishes nothing', async () => {
    const res = await run(UNIT_SWITCH, unitSwitch(), BOB)

    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })

  it('a switch whose transaction throws publishes nothing', async () => {
    hooks.failRecipeItems = true

    const res = await run(UNIT_SWITCH, unitSwitch(), ALICE)

    expect(res.errors).toBeDefined()
    expect(world.stock.state.itemStocks.find((s) => s.id === 'st_milk_home')?.packedQuantity).toBe(3)
    expect(events()).toEqual([])
  })
})

// ─── the four imports ────────────────────────────────────────────────────────

describe('the stock and log imports publish one event per location written', () => {
  // Every import here is pinned to hh_home. Until households H4 task E.3 the
  // "over two locations" tests wrote a row at LOC_SECOND, of ALICE's OTHER
  // household, with an item of hh_home: the cross-household write issue #381
  // (gap 1) is about. That is now refused; see the two "other household"
  // tests below.
  it('bulkCreateItemStocks over two locations', async () => {
    const res = await run(
      BULK_CREATE_STOCKS,
      {
        rows: [
          stockImport('st_new_1', 'item_bread', LOC_HOME),
          stockImport('st_new_2', 'item_bread', LOC_GARAGE),
          // The pair is already stocked: skipped, so it adds no location.
          stockImport('st_new_3', 'item_milk', LOC_GARAGE),
        ],
      },
      ALICE,
      'hh_home',
    )

    expect(res.errors).toBeUndefined()
    expect(sortedEvents()).toEqual([change('STOCK', LOC_GARAGE, 'hh_home'), change('STOCK', LOC_HOME, 'hh_home')])
  })

  it('bulkUpsertItemStocks over two locations, one event per location', async () => {
    const res = await run(
      BULK_UPSERT_STOCKS,
      {
        rows: [
          stockImport('st_milk_home', 'item_milk', LOC_HOME, 7),
          stockImport('st_bread_home', 'item_bread', LOC_HOME),
          stockImport('st_bread_garage', 'item_bread', LOC_GARAGE),
        ],
      },
      ALICE,
      'hh_home',
    )

    expect(res.errors).toBeUndefined()
    expect(sortedEvents()).toEqual([change('STOCK', LOC_GARAGE, 'hh_home'), change('STOCK', LOC_HOME, 'hh_home')])
  })

  it('a stock import refused before its first write publishes nothing', async () => {
    const res = await run(BULK_UPSERT_STOCKS, { rows: [stockImport('st_x', 'item_milk', LOC_STRANGER)] }, ALICE, 'hh_home')

    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })

  for (const [label, query] of [
    ['bulkCreateItemStocks', BULK_CREATE_STOCKS],
    ['bulkUpsertItemStocks', BULK_UPSERT_STOCKS],
  ] as const) {
    it(`${label}: a row at a location of the caller's other household is refused and publishes nothing`, async () => {
      // ALICE organizes LOC_SECOND (hh_second). The import is aimed at
      // hh_home, and its first row is a good one.
      const res = await run(
        query,
        { rows: [stockImport('st_ok', 'item_bread', LOC_HOME), stockImport('st_x', 'item_bread', LOC_SECOND)] },
        ALICE,
        'hh_home',
      )

      expect(code(res)).toBe('FORBIDDEN')
      expect(world.stock.state.itemStocks.map((r) => r.id)).not.toContain('st_ok')
      expect(world.stock.state.itemStocks.map((r) => r.id)).not.toContain('st_x')
      expect(events()).toEqual([])
    })
  }

  it('bulkCreateInventoryLogs over two locations', async () => {
    const res = await run(
      BULK_CREATE_LOGS,
      {
        rows: [
          logImport('log_new_1', 'item_milk', LOC_HOME),
          logImport('log_new_2', 'item_bread', LOC_HOME),
          logImport('log_new_3', 'item_milk', LOC_GARAGE),
          // Already there: skipped.
          logImport('log_milk_garage', 'item_milk', LOC_GARAGE),
        ],
      },
      ALICE,
      'hh_home',
    )

    expect(res.errors).toBeUndefined()
    expect(sortedEvents()).toEqual([change('LOG', LOC_GARAGE, 'hh_home'), change('LOG', LOC_HOME, 'hh_home')])
  })

  it('bulkUpsertInventoryLogs over two locations', async () => {
    const res = await run(
      BULK_UPSERT_LOGS,
      { rows: [logImport('log_milk_garage', 'item_milk', LOC_GARAGE), logImport('log_new_4', 'item_milk', LOC_HOME)] },
      ALICE,
      'hh_home',
    )

    expect(res.errors).toBeUndefined()
    expect(sortedEvents()).toEqual([change('LOG', LOC_GARAGE, 'hh_home'), change('LOG', LOC_HOME, 'hh_home')])
  })

  for (const [label, query] of [
    ['bulkCreateInventoryLogs', BULK_CREATE_LOGS],
    ['bulkUpsertInventoryLogs', BULK_UPSERT_LOGS],
  ] as const) {
    it(`${label}: a row at a location of the caller's other household is refused and publishes nothing`, async () => {
      const res = await run(
        query,
        { rows: [logImport('log_ok', 'item_milk', LOC_HOME), logImport('log_x', 'item_milk', LOC_SECOND)] },
        ALICE,
        'hh_home',
      )

      expect(code(res)).toBe('FORBIDDEN')
      expect(logs.state.logs.map((l) => l.id)).not.toContain('log_ok')
      expect(logs.state.logs.map((l) => l.id)).not.toContain('log_x')
      expect(events()).toEqual([])
    })
  }

  it('a log import whose every row is skipped publishes nothing', async () => {
    // Another household's item: the row is skipped, nothing is written.
    const res = await run(BULK_CREATE_LOGS, { rows: [logImport('log_new_5', 'item_theirs', LOC_HOME)] }, ALICE)

    expect(res.data?.bulkCreateInventoryLogs).toEqual([])
    expect(events()).toEqual([])
  })

  it('a log import that fails part-way publishes the locations it already wrote', async () => {
    // Not one transaction: row 1 is saved before row 2 fails.
    hooks.failLogUpsertNumber = 2

    const res = await run(
      BULK_UPSERT_LOGS,
      { rows: [logImport('log_new_6', 'item_milk', LOC_HOME), logImport('log_new_7', 'item_milk', LOC_GARAGE)] },
      ALICE,
    )

    expect(res.errors).toBeDefined()
    expect(logs.state.logs.map((l) => l.id)).toContain('log_new_6')
    expect(events()).toEqual([change('LOG', LOC_HOME, 'hh_home')])
  })
})

// ─── Location.dataUpdatedAt (households H7b task M.2, decision T79) ─────────
//
// `publishChange` sets it for STOCK, CART and LOG. One writer of each kind is
// run through its RESOLVER here, so the path is proved, not only the helper
// (`publishChange.test.ts`). Both hh_home locations start with an OLD value,
// so a write that moved every location of the household, or none, is seen.

describe('Location.dataUpdatedAt moves only for the location the write changed', () => {
  const OLD = new Date('2026-02-02T00:00:00.000Z')

  beforeEach(() => {
    for (const location of world.stock.state.locations) location.dataUpdatedAt = OLD
  })

  function dataUpdatedAt(locationId: string): Date | null | undefined {
    return world.stock.state.locations.find((l) => l.id === locationId)?.dataUpdatedAt
  }

  function expectMovedOnly(locationId: string) {
    const moved = dataUpdatedAt(locationId)
    expect(moved).toBeInstanceOf(Date)
    expect(moved?.getTime()).toBeGreaterThan(OLD.getTime())
    for (const other of [LOC_HOME, LOC_GARAGE, LOC_SECOND, LOC_STRANGER]) {
      if (other !== locationId) expect(dataUpdatedAt(other)).toEqual(OLD)
    }
  }

  it('upsertItemStock (STOCK)', async () => {
    const res = await run(UPSERT_STOCK, { i: 'item_bread', l: LOC_GARAGE, input: { packedQuantity: 2 } }, ALICE)

    expect(res.errors).toBeUndefined()
    expectMovedOnly(LOC_GARAGE)
  })

  it('addToCart (CART)', async () => {
    const res = await run(
      `mutation M($c: ID!, $i: ID!) { addToCart(cartId: $c, itemId: $i, quantity: 1) { id } }`,
      { c: `${LOC_HOME}:no-vendor`, i: 'item_bread' },
      BOB,
    )

    expect(res.errors).toBeUndefined()
    expectMovedOnly(LOC_HOME)
  })

  it('addInventoryLog (LOG)', async () => {
    const res = await run(ADD_LOG, { i: 'item_milk', l: LOC_GARAGE }, ALICE)

    expect(res.errors).toBeUndefined()
    expectMovedOnly(LOC_GARAGE)
  })

  it('bulkCreateItemStocks (an import)', async () => {
    const res = await run(
      BULK_CREATE_STOCKS,
      { rows: [stockImport('st_new_1', 'item_bread', LOC_HOME)] },
      ALICE,
      'hh_home',
    )

    expect(res.errors).toBeUndefined()
    expectMovedOnly(LOC_HOME)
  })

  it('removeAllLocationItems', async () => {
    const res = await run(
      `mutation M($l: ID!) { removeAllLocationItems(locationId: $l) }`,
      { l: LOC_GARAGE },
      ALICE,
      'hh_home',
    )

    expect(res.errors).toBeUndefined()
    expect(res.data).toEqual({ removeAllLocationItems: true })
    expectMovedOnly(LOC_GARAGE)
  })

  it('a refused write moves nothing', async () => {
    const res = await run(UPSERT_STOCK, { i: 'item_milk', l: LOC_HOME, input: { packedQuantity: 1 } }, VERA)

    expect(code(res)).toBe('FORBIDDEN')
    for (const id of [LOC_HOME, LOC_GARAGE, LOC_SECOND, LOC_STRANGER]) expect(dataUpdatedAt(id)).toEqual(OLD)
  })
})
