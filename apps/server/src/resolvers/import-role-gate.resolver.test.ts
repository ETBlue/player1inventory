import { ApolloServer } from '@apollo/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'
import type { CartFake } from '../test/cartFake.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { InventoryLogFake } from '../test/inventoryLogFake.js'

// The server import rules of households H4 task E.3:
//
// - the ROLE GATE: every one of the 22 bulk import mutations asks household
//   role `manager` first (decision T8), and refuses a `member` before any
//   write;
// - issue #381, gap 1: a stock or log row must be at a location of the
//   TARGET household, and its item must be in that same household
//   (decision T13);
// - no fallback location (decisions T10, T11): a bare cart id is
//   BAD_USER_INPUT, a cart id naming no location is FORBIDDEN, and no
//   location row is read before the role check;
// - the location id rule (decision T12): `'local'` and an id with `:` are
//   BAD_USER_INPUT.
//
// ── THE FIXTURE (H4 plan rule 16) ──
//
// | Person   | Households                     | Location roles                  |
// |----------|--------------------------------|---------------------------------|
// | ALICE    | hh_a owner, hh_b manager       | LOC_A, LOC_B: organizer         |
// | MIA      | hh_a member                    | LOC_A: organizer                |
// | STRANGER | hh_c owner                     | LOC_C: organizer                |
//
// ALICE is in TWO households, and holds a write role in both. With one
// household, "the caller's household", "the target household" and "the
// location's household" are the same answer, so a check against the wrong
// one passes (issue #381). The target is pinned through
// `ctx.requestCache.householdId`, because `ensureHousehold` picks one of two
// households in no fixed order.
//
// MIA organizes LOC_A but is only a household `member`. Decision O7: a member
// who organizes a location still may not import. So MIA would pass every
// location check, and only the role gate can refuse her.
//
// Every refusal fixture also holds a new row that WOULD be written (H4 plan
// rule 17), so "refused as a whole" differs from "refused row by row".

vi.mock('../lib/prisma.js', async () => {
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { runInTransaction } = await import('../test/stockFake.js')
  const { createCartFake } = await import('../test/cartFake.js')
  const { createInventoryLogFake } = await import('../test/inventoryLogFake.js')

  const world = createHouseholdWorld()
  const carts = createCartFake()
  const logs = createInventoryLogFake()
  const catalog = { scope: 'householdId' as const }

  type Junction = Record<string, unknown>
  /** A composite-key junction table that only needs to be written to here. */
  function createJunctionFake(keys: string[], extra: string[] = []) {
    const state: { rows: Junction[] } = { rows: [] }
    const pick = (row: Junction) => Object.fromEntries([...keys, ...extra].map((k) => [k, row[k]]))
    const client = {
      createMany: async ({ data }: { data: Junction[] }) => {
        for (const row of data) state.rows.push(pick(row))
        return { count: data.length }
      },
      deleteMany: async ({ where = {} }: { where?: Record<string, unknown> } = {}) => {
        const before = state.rows.length
        state.rows = state.rows.filter((r) => !Object.entries(where).every(([k, v]) => r[k] === v))
        return { count: before - state.rows.length }
      },
    }
    return { state, client }
  }
  const itemTag = createJunctionFake(['itemId', 'tagId'])
  const itemVendor = createJunctionFake(['itemId', 'vendorId'])
  const recipeItem = createJunctionFake(['recipeId', 'itemId'], ['defaultAmount'])

  const items = createOwnedRowFake<{ id: string; householdId: string; name: string }>({
    model: 'Item',
    ...catalog,
    relations: (row) => ({
      tags: itemTag.state.rows.filter((r) => r.itemId === row.id),
      vendors: itemVendor.state.rows.filter((r) => r.itemId === row.id),
    }),
  })
  const recipes = createOwnedRowFake<{ id: string; householdId: string; name: string }>({
    model: 'Recipe',
    ...catalog,
    relations: (row) => ({ items: recipeItem.state.rows.filter((r) => r.recipeId === row.id) }),
  })
  const tags = createOwnedRowFake<{ id: string; householdId: string; name: string; typeId: string }>({
    model: 'Tag',
    columns: ['typeId', 'parentId'],
    ...catalog,
  })
  const tagTypes = createOwnedRowFake<{ id: string; householdId: string; name: string }>({ model: 'TagType', ...catalog })
  const vendors = createOwnedRowFake<{ id: string; householdId: string; name: string }>({ model: 'Vendor', ...catalog })
  const shelves = createOwnedRowFake<{ id: string; householdId: string; name: string }>({ model: 'Shelf', ...catalog })

  const client: Record<string, unknown> = {
    ...world.client,
    item: {
      ...items.client,
      // Prisma fills these; `ownedRowFake` does not, and `toGraphQL` reads them.
      create: async (args: { data: Record<string, unknown> }) =>
        items.client.create({ ...args, data: { consumeAmount: 1, ...args.data } }),
    },
    recipe: recipes.client,
    tag: tags.client,
    tagType: tagTypes.client,
    vendor: vendors.client,
    shelf: shelves.client,
    itemTag: itemTag.client,
    itemVendor: itemVendor.client,
    recipeItem: recipeItem.client,
    cart: carts.client.cart,
    cartItem: carts.client.cartItem,
    inventoryLog: logs.client,
  }
  const stores = [
    world.users.state,
    world.households.state,
    world.stock.state,
    items.state,
    recipes.state,
    tags.state,
    tagTypes.state,
    vendors.state,
    shelves.state,
    itemTag.state,
    itemVendor.state,
    recipeItem.state,
    carts.state,
    logs.state,
  ] as unknown as Record<string, unknown>[]
  client.$transaction = (arg: unknown) => runInTransaction(stores, client, arg)

  return {
    prisma: {
      ...client,
      // Wrapped so a test can see whether a location row was read at all.
      location: { ...world.client.location, findUnique: vi.fn(world.client.location.findUnique) },
      $world: world,
      $carts: carts,
      $logs: logs,
      $stores: { items, recipes, tags, tagTypes, vendors, shelves },
      $all: stores,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'

type Rows = { state: { rows: Record<string, unknown>[] }; reset: (rows?: never[]) => void }
const handles = prisma as unknown as {
  $world: HouseholdWorld
  $carts: CartFake
  $logs: InventoryLogFake
  $stores: { items: Rows; recipes: Rows; tags: Rows; tagTypes: Rows; vendors: Rows; shelves: Rows }
  $all: Record<string, unknown>[]
  location: { findUnique: ReturnType<typeof vi.fn> }
}
const world = handles.$world
const carts = handles.$carts
const logs = handles.$logs
const S = handles.$stores

const ALICE = 'user_alice'
const MIA = 'user_mia'
const STRANGER = 'user_stranger'

const HH_A = 'hh_a'
const HH_B = 'hh_b'
const HH_C = 'hh_c'

const LOC_A = 'loc_a'
const LOC_B = 'loc_b'
const LOC_C = 'loc_c'

const ITEM_A = 'item_a'
const ITEM_B = 'item_b'
const CART_A = `${LOC_A}:no-vendor`

const ISO = '2026-01-01T00:00:00.000Z'

function seed() {
  world.reset()
  world.stock.reset(
    [
      { id: LOC_A, householdId: HH_A },
      { id: LOC_B, householdId: HH_B },
      { id: LOC_C, householdId: HH_C },
    ],
    [],
  )
  world.seedHouseholds({
    households: [householdRow(HH_A, ALICE), householdRow(HH_B, 'user_bob'), householdRow(HH_C, STRANGER)],
    householdMembers: [
      householdMemberRow(HH_A, ALICE, 'owner'),
      householdMemberRow(HH_B, 'user_bob', 'owner'),
      householdMemberRow(HH_B, ALICE, 'manager'),
      householdMemberRow(HH_A, MIA, 'member'),
      householdMemberRow(HH_C, STRANGER, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_A, ALICE, 'organizer'),
      locationMemberRow(LOC_B, ALICE, 'organizer'),
      locationMemberRow(LOC_A, MIA, 'organizer'),
      locationMemberRow(LOC_C, STRANGER, 'organizer'),
    ],
  })
  S.items.reset([
    { id: ITEM_A, householdId: HH_A, name: 'Milk' },
    { id: ITEM_B, householdId: HH_B, name: 'Tea' },
  ] as never[])
  S.tagTypes.reset([{ id: 'tt_a', householdId: HH_A, name: 'Kind', color: 'blue' }] as never[])
  S.tags.reset([] as never[])
  S.vendors.reset([] as never[])
  S.recipes.reset([] as never[])
  S.shelves.reset([] as never[])
  logs.reset([])
  carts.reset({ carts: [{ id: CART_A, locationId: LOC_A, lastPurchasedAt: null }], cartItems: [] })
}

beforeEach(() => {
  vi.clearAllMocks()
  seed()
})

/** Every store, as text, to tell "nothing was written" from "something was". */
function snapshot(): string {
  return JSON.stringify(handles.$all)
}

const server = new ApolloServer<Context>({ typeDefs, resolvers })

/** Run as `userId`, with the target household pinned (H4 plan rule 16). */
async function run(query: string, variables: Record<string, unknown>, userId: string, householdId: string) {
  const contextValue: Context = { userId, requestCache: { householdId: Promise.resolve(householdId) } }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

function errorOf(res: { errors?: ReadonlyArray<{ extensions?: Record<string, unknown> }> }) {
  return res.errors?.[0]?.extensions
}

// ─── the 22 mutations, each with a payload of NEW rows ───────────────────────

const stock = (id: string, itemId: string, locationId: string) => ({
  id,
  itemId,
  locationId,
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
  createdAt: ISO,
  updatedAt: ISO,
})
const log = (id: string, itemId: string, locationId?: string) => ({
  id,
  itemId,
  delta: 1,
  quantity: 1,
  occurredAt: ISO,
  ...(locationId === undefined ? {} : { locationId }),
})
const location = (id: string) => ({ id, name: id, order: 5, createdAt: ISO, updatedAt: ISO })

const MUTATIONS: Array<{ field: string; arg: string; type: string; rows: () => unknown[] }> = [
  ['Items', 'items', 'ItemInput', () => [{ id: 'item_new', name: 'Rice', tagIds: [], targetUnit: 'package', consumeAmount: 1, createdAt: ISO, updatedAt: ISO }]],
  ['Tags', 'tags', 'TagInput', () => [{ id: 'tag_new', name: 'Dairy', typeId: 'tt_a' }]],
  ['TagTypes', 'tagTypes', 'TagTypeInput', () => [{ id: 'tt_new', name: 'Shop', color: 'red' }]],
  ['Vendors', 'vendors', 'VendorInput', () => [{ id: 'ven_new', name: 'Market' }]],
  ['Recipes', 'recipes', 'RecipeInput', () => [{ id: 'rec_new', name: 'Soup', items: [] }]],
  ['InventoryLogs', 'logs', 'InventoryLogInput', () => [log('log_new', ITEM_A, LOC_A)]],
  ['ShoppingCarts', 'carts', 'ShoppingCartInput', () => [{ id: `${LOC_A}:ven_new` }]],
  ['CartItems', 'cartItems', 'CartItemInput', () => [{ id: 'ci_new', cartId: CART_A, itemId: ITEM_A, quantity: 1 }]],
  ['Shelves', 'shelves', 'ShelfInput', () => [{ id: 'sh_new', name: 'Fridge', type: 'selection', order: 0, itemIds: [], createdAt: ISO, updatedAt: ISO }]],
  ['Locations', 'locations', 'LocationInput', () => [location('loc_new')]],
  ['ItemStocks', 'itemStocks', 'ItemStockImportInput', () => [stock('st_new', ITEM_A, LOC_A)]],
].flatMap(([name, arg, type, rows]) =>
  (['Create', 'Upsert'] as const).map((verb) => ({
    field: `bulk${verb}${name as string}`,
    arg: arg as string,
    type: type as string,
    rows: rows as () => unknown[],
  })),
)

function mutationText(field: string, arg: string, type: string) {
  return `mutation M($rows: [${type}!]!) { ${field}(${arg}: $rows) { id } }`
}

describe('the import role gate (households H4 task E.3, decision T8)', () => {
  it('covers all 22 bulk import mutations', () => {
    // So a mutation added later without a row here is noticed.
    expect(MUTATIONS).toHaveLength(22)
    expect(new Set(MUTATIONS.map((m) => m.field)).size).toBe(22)
  })

  for (const { field, arg, type, rows } of MUTATIONS) {
    it(`${field}: a household member is refused, and nothing is written`, async () => {
      // Given MIA, a household `member` who organizes LOC_A, and a payload
      // of new rows that a manager may write (the next test)
      const before = snapshot()

      // When MIA imports it
      const res = await run(mutationText(field, arg, type), { rows: rows() }, MIA, HH_A)

      // Then the role gate refuses her, and no store changed
      expect(errorOf(res)?.code).toBe('FORBIDDEN')
      expect(snapshot()).toBe(before)
    })

    it(`${field}: a household manager may import the same payload`, async () => {
      // Given ALICE as a `manager` of hh_b, importing into hh_b. The payload
      // is the same, with hh_b's location and item.
      const payload = JSON.parse(
        JSON.stringify(rows()).replaceAll(LOC_A, LOC_B).replaceAll(ITEM_A, ITEM_B).replaceAll('tt_a', 'tt_b'),
      ) as unknown[]
      S.tagTypes.state.rows.push({ id: 'tt_b', householdId: HH_B, name: 'Kind', color: 'blue' })
      carts.state.carts.push({ id: `${LOC_B}:no-vendor`, locationId: LOC_B, lastPurchasedAt: null })
      const before = snapshot()

      // When she imports it
      const res = await run(mutationText(field, arg, type), { rows: payload }, ALICE, HH_B)

      // Then nothing is refused and something was written. This is what
      // makes the member test above mean something: the payload itself is
      // fine, so the member's refusal can only come from the role.
      expect(res.errors).toBeUndefined()
      expect(snapshot()).not.toBe(before)
    })
  }

  it('a member is refused even for an empty batch, before any read', async () => {
    // The gate runs before the empty-batch return
    const res = await run(mutationText('bulkCreateItems', 'items', 'ItemInput'), { rows: [] }, MIA, HH_A)

    expect(errorOf(res)?.code).toBe('FORBIDDEN')
  })
})

// ─── issue #381, gap 1: stock and log rows ────────────────────────────────────

describe('issue #381 gap 1: a stock or log row must be in the target household', () => {
  for (const verb of ['Create', 'Upsert'] as const) {
    const STOCKS = mutationText(`bulk${verb}ItemStocks`, 'itemStocks', 'ItemStockImportInput')
    const LOGS = mutationText(`bulk${verb}InventoryLogs`, 'logs', 'InventoryLogInput')

    it(`bulk${verb}ItemStocks: a row at a location of the caller's other household, item of the target, is refused`, async () => {
      // Given ALICE importing into hh_a. Row 1 is good. Row 2 is at LOC_B,
      // where ALICE is organizer, but LOC_B is in hh_b; its item is hh_a's.
      // Until E.3 the item was checked against the caller's household and
      // the location only by role, so row 2 was written: a location of hh_b
      // pointing at an item of hh_a.
      const res = await run(STOCKS, { rows: [stock('st_ok', ITEM_A, LOC_A), stock('st_x', ITEM_A, LOC_B)] }, ALICE, HH_A)

      expect(errorOf(res)?.code).toBe('FORBIDDEN')
      expect(world.stock.state.itemStocks).toEqual([])
    })

    it(`bulk${verb}ItemStocks: a row at a location of the target with an item of the other household is refused`, async () => {
      const res = await run(STOCKS, { rows: [stock('st_ok', ITEM_A, LOC_A), stock('st_x', ITEM_B, LOC_A)] }, ALICE, HH_A)

      expect(errorOf(res)?.code).toBe('FORBIDDEN')
      expect(world.stock.state.itemStocks).toEqual([])
    })

    it(`bulk${verb}ItemStocks: an existing row stored at a location of the other household is refused`, async () => {
      // Given a stock row already stored at LOC_B (hh_b). The payload names
      // its id with hh_a's location and item. `bulkUpsertItemStocks` updates
      // a row in place and keeps its location, so it would write into hh_b.
      world.stock.state.itemStocks.push({ ...stock('st_b', ITEM_B, LOC_B), dueDate: null, createdAt: new Date(ISO), updatedAt: new Date(ISO) } as never)
      const res = await run(STOCKS, { rows: [stock('st_ok', ITEM_A, LOC_A), stock('st_b', ITEM_A, LOC_A)] }, ALICE, HH_A)

      expect(errorOf(res)?.code).toBe('FORBIDDEN')
      expect(world.stock.state.itemStocks.map((r) => r.id)).toEqual(['st_b'])
      expect(world.stock.state.itemStocks[0]).toMatchObject({ itemId: ITEM_B, locationId: LOC_B, packedQuantity: 1 })
    })

    it(`bulk${verb}InventoryLogs: a row at a location of the caller's other household, item of the target, is refused`, async () => {
      const res = await run(LOGS, { rows: [log('log_ok', ITEM_A, LOC_A), log('log_x', ITEM_A, LOC_B)] }, ALICE, HH_A)

      expect(errorOf(res)?.code).toBe('FORBIDDEN')
      expect(logs.state.logs).toEqual([])
    })

    it(`bulk${verb}InventoryLogs: a row at a location of the target with an item of the other household is skipped`, async () => {
      // A log whose item is not usable is SKIPPED, not refused, the same as
      // a log whose item is gone (root CLAUDE.md, the reference table).
      const res = await run(LOGS, { rows: [log('log_ok', ITEM_A, LOC_A), log('log_x', ITEM_B, LOC_A)] }, ALICE, HH_A)

      expect(res.errors).toBeUndefined()
      expect(logs.state.logs.map((l) => l.id)).toEqual(['log_ok'])
    })

    it(`bulk${verb}InventoryLogs: the same rows imported into the other household land there`, async () => {
      // The positive half: aimed at hh_b, a log at LOC_B with hh_b's item
      // is written. So the refusal above comes from the target, not from
      // LOC_B itself.
      const res = await run(LOGS, { rows: [log('log_b', ITEM_B, LOC_B)] }, ALICE, HH_B)

      expect(res.errors).toBeUndefined()
      expect(logs.state.logs.map((l) => [l.id, l.locationId])).toEqual([['log_b', LOC_B]])
    })
  }
})

// ─── no fallback location (decisions T10, T11) ────────────────────────────────

describe('no fallback location', () => {
  for (const verb of ['Create', 'Upsert'] as const) {
    const CARTS = mutationText(`bulk${verb}ShoppingCarts`, 'carts', 'ShoppingCartInput')
    const LOGS = mutationText(`bulk${verb}InventoryLogs`, 'logs', 'InventoryLogInput')

    it(`bulk${verb}ShoppingCarts: a bare cart id is BAD_USER_INPUT, and nothing is written`, async () => {
      const res = await run(CARTS, { rows: [{ id: `${LOC_A}:ven_new` }, { id: 'no-vendor' }] }, ALICE, HH_A)

      expect(errorOf(res)?.code).toBe('BAD_USER_INPUT')
      expect(carts.state.carts.map((c) => c.id)).toEqual([CART_A])
    })

    it(`bulk${verb}ShoppingCarts: a bare cart id is BAD_USER_INPUT even when the caller has no location to write to, and no location row is read`, async () => {
      // Review note 2 of task E.1. Before E.3 the cart location check ran
      // `fallbackImportLocation` for a bare id, so a caller with no writable
      // location got NO_LOCATION; and it read `location.findUnique` for
      // every named prefix before any role check.
      world.households.state.locationMembers = world.households.state.locationMembers.filter((m) => m.userId !== ALICE)
      const res = await run(CARTS, { rows: [{ id: 'no-vendor' }] }, ALICE, HH_A)

      expect(errorOf(res)?.code).toBe('BAD_USER_INPUT')
      expect(handles.location.findUnique).not.toHaveBeenCalled()
    })

    it(`bulk${verb}ShoppingCarts: a cart id naming a location that does not exist is FORBIDDEN, and no location row is read`, async () => {
      // Until E.3 the cart went to the caller's first location and kept its
      // id. A missing location and another household's location now give
      // the same answer, and the unscoped existence read is gone.
      const res = await run(CARTS, { rows: [{ id: `${LOC_A}:ven_new` }, { id: 'loc_gone:ven_new' }] }, ALICE, HH_A)

      expect(errorOf(res)?.code).toBe('FORBIDDEN')
      expect(carts.state.carts.map((c) => c.id)).toEqual([CART_A])
      expect(handles.location.findUnique).not.toHaveBeenCalled()
    })

    it(`bulk${verb}InventoryLogs: a log with no location is IMPORT_NEEDS_LOCATION, and the other new log is not written`, async () => {
      const res = await run(LOGS, { rows: [log('log_ok', ITEM_A, LOC_A), log('log_x', ITEM_A)] }, ALICE, HH_A)

      expect(errorOf(res)).toMatchObject({ code: 'BAD_USER_INPUT', reason: 'IMPORT_NEEDS_LOCATION' })
      expect(logs.state.logs).toEqual([])
    })
  }
})

// ─── the location id rule (decision T12) ──────────────────────────────────────

describe("a location id cannot be 'local' or contain ':'", () => {
  for (const verb of ['Create', 'Upsert'] as const) {
    const LOCATIONS = mutationText(`bulk${verb}Locations`, 'locations', 'LocationInput')

    for (const bad of ['local', 'a:b']) {
      it(`bulk${verb}Locations: '${bad}' is BAD_USER_INPUT, and the other new location is not written`, async () => {
        const res = await run(LOCATIONS, { rows: [location('loc_new'), location(bad)] }, ALICE, HH_A)

        expect(errorOf(res)?.code).toBe('BAD_USER_INPUT')
        expect(world.stock.state.locations.map((l) => l.id).sort()).toEqual([LOC_A, LOC_B, LOC_C])
      })
    }

    it(`bulk${verb}Locations: an existing location of the caller's other household is refused`, async () => {
      // ALICE organizes LOC_B, in hh_b; the import is aimed at hh_a. Before
      // E.3 `bulkCreateLocations` skipped it as hers and
      // `bulkUpsertLocations` renamed it.
      const res = await run(LOCATIONS, { rows: [location('loc_new'), { ...location(LOC_B), name: 'Renamed' }] }, ALICE, HH_A)

      expect(errorOf(res)?.code).toBe('FORBIDDEN')
      expect(world.stock.state.locations.map((l) => l.id)).not.toContain('loc_new')
      expect(world.stock.state.locations.find((l) => l.id === LOC_B)?.name).not.toBe('Renamed')
    })
  }
})
