import { ApolloServer } from '@apollo/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'
import type { CartFake } from '../test/cartFake.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { InventoryLogFake } from '../test/inventoryLogFake.js'

// The `CATALOG` events of the catalog mutations, and the `CART`, `STOCK` and
// `LOG` events of the three that also change location rows: `deleteItem`,
// `createVendor` and `deleteVendor` (households H3c-2, task D.4).
//
// ── HOW THE BUS IS WATCHED ──
//
// The same way as `stock-live-publish.resolver.test.ts`: a recording
// listener on the DEFAULT bus (`liveEvents`), removed after each test. For
// each event it notes whether a `$transaction` callback was still running,
// which is how "published after commit" is checked.
//
// ── THE FIXTURE ──
//
// | Person   | Households                        | Location roles                         |
// |----------|-----------------------------------|----------------------------------------|
// | ALICE    | hh_home owner, hh_second member   | LOC_HOME, LOC_GARAGE, LOC_SECOND       |
// |          |                                   | organizer                              |
// | BOB      | hh_home member                    | LOC_HOME participant                   |
// | CAROL    | hh_second owner                   | LOC_SECOND organizer                   |
// | STRANGER | hh_other owner                    | LOC_STRANGER organizer                 |
//
// ALICE's hh_home row is listed FIRST, so `requireHousehold(ALICE)` and
// `requireCatalogRole(ALICE)` answer hh_home. Every catalog write lands in
// the caller's household, so every `CATALOG` event below says hh_home.
//
// BOB is only a household `member`: every catalog write needs `manager`, so
// he is the "refused" caller. The one exception is
// `updateRecipeLastCookedAt`, which needs only `member`.
//
// item_milk has rows of three kinds at different locations, so a kind sent
// at the wrong location is visible:
//
// | Kind  | Locations                                                   |
// |-------|-------------------------------------------------------------|
// | STOCK | LOC_HOME, and LOC_SECOND (a row of ANOTHER household)       |
// | LOG   | LOC_HOME (two logs), LOC_GARAGE                             |
// | CART  | LOC_HOME                                                    |
//
// The stock row at LOC_SECOND should not exist: today `requireLocationItems`
// keeps an item's stock in its own household. It is here so that an event
// with the CALLER's household instead of the LOCATION's is visible.

const hooks = vi.hoisted(() => ({
  /** How many `$transaction` callbacks are running right now. */
  transactionDepth: 0,
  /** The `item.create` call number (1-based) that throws. */
  failItemCreateNumber: undefined as number | undefined,
  itemCreates: 0,
}))

vi.mock('../lib/prisma.js', async () => {
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { runInTransaction } = await import('../test/stockFake.js')
  const { createCartFake } = await import('../test/cartFake.js')
  const { createInventoryLogFake } = await import('../test/inventoryLogFake.js')
  const { checkWhere } = await import('../test/whereKeys.js')

  const world = createHouseholdWorld()
  const carts = createCartFake()
  const logs = createInventoryLogFake()
  const catalog = { scope: 'householdId' as const }

  type Junction = Record<string, unknown>

  /**
   * One composite-key junction table, the same as in
   * `catalog-household.resolver.test.ts`: `where` may name a key column (a
   * string or `{ in }`); anything else throws.
   */
  function createJunctionFake(model: string, keys: string[], extra: string[] = []) {
    const state: { rows: Junction[] } = { rows: [] }
    const spec = Object.fromEntries(keys.map((k) => [k, 'in' as const]))
    const pk = (row: Junction) => keys.map((k) => String(row[k])).join('|')
    const matches = (row: Junction, where: Record<string, unknown>) =>
      Object.entries(where).every(([key, filter]) => {
        if (filter === undefined) return true
        if (typeof filter === 'string') return row[key] === filter
        return (filter as { in: unknown[] }).in.includes(row[key])
      })
    const pick = (row: Junction) => Object.fromEntries([...keys, ...extra].map((k) => [k, row[k]]))
    const duplicate = () =>
      Object.assign(new Error(`Unique constraint failed — ${model}`), { code: 'P2002' })
    const client = {
      createMany: async ({ data, skipDuplicates }: { data: Junction[]; skipDuplicates?: boolean }) => {
        let count = 0
        for (const row of data) {
          if (state.rows.some((r) => pk(r) === pk(row))) {
            if (skipDuplicates) continue
            throw duplicate()
          }
          state.rows.push(pick(row))
          count++
        }
        return { count }
      },
      create: async ({ data }: { data: Junction }) => {
        if (state.rows.some((r) => pk(r) === pk(data))) throw duplicate()
        state.rows.push(pick(data))
        return data
      },
      deleteMany: async ({ where = {} }: { where?: Record<string, unknown> } = {}) => {
        checkWhere(`junctionFake(${model})`, where, spec)
        const before = state.rows.length
        state.rows = state.rows.filter((r) => !matches(r, where))
        return { count: before - state.rows.length }
      },
    }
    return { state, client }
  }

  const itemTag = createJunctionFake('ItemTag', ['itemId', 'tagId'])
  const itemVendor = createJunctionFake('ItemVendor', ['itemId', 'vendorId'])
  const recipeItem = createJunctionFake('RecipeItem', ['recipeId', 'itemId'], ['defaultAmount'])

  const items = createOwnedRowFake<{
    id: string
    householdId: string
    name: string
    consumeAmount: number
    targetUnit: string
    createdAt?: Date
    updatedAt?: Date
  }>({
    model: 'Item',
    ...catalog,
    relations: (row) => ({
      tags: itemTag.state.rows.filter((r) => r.itemId === row.id),
      vendors: itemVendor.state.rows.filter((r) => r.itemId === row.id),
    }),
  })
  const recipes = createOwnedRowFake<{
    id: string
    householdId: string
    name: string
    lastCookedAt: Date | null
  }>({
    model: 'Recipe',
    ...catalog,
    relations: (row) => ({ items: recipeItem.state.rows.filter((r) => r.recipeId === row.id) }),
  })
  const tags = createOwnedRowFake<{
    id: string
    householdId: string
    name: string
    typeId: string
    parentId: string | null
  }>({ model: 'Tag', columns: ['typeId', 'parentId'], ...catalog })
  const tagTypes = createOwnedRowFake<{ id: string; householdId: string; name: string; color: string }>({
    model: 'TagType',
    ...catalog,
  })
  const vendors = createOwnedRowFake<{ id: string; householdId: string; name: string }>({
    model: 'Vendor',
    ...catalog,
  })
  const shelves = createOwnedRowFake<{
    id: string
    householdId: string
    name: string
    type: string
    order: number
    filterConfig: unknown
    itemIds: string[]
  }>({ model: 'Shelf', ...catalog })

  const client: Record<string, unknown> = {
    ...world.client,
    item: {
      ...items.client,
      // Prisma fills `createdAt` and `updatedAt`; `ownedRowFake` does not,
      // and `toGraphQL` reads both. The hook makes the Nth create fail.
      create: async (args: { data: Record<string, unknown> }) => {
        hooks.itemCreates += 1
        if (hooks.itemCreates === hooks.failItemCreateNumber) throw new Error('item.create failed on purpose')
        const now = new Date('2026-11-16T00:00:00.000Z')
        return items.client.create({
          ...args,
          data: { createdAt: now, updatedAt: now, consumeAmount: 1, ...args.data },
        })
      },
    },
    recipe: recipes.client,
    tag: tags.client,
    tagType: {
      ...tagTypes.client,
      // `Tag_typeId_fkey` is ON DELETE NO ACTION: Postgres refuses to delete
      // a tag type while any tag uses it. Modelled with Prisma's `P2003`, as
      // in `catalog-household.resolver.test.ts`.
      delete: async (args: { where: { id: string } }) => {
        if (tags.state.rows.some((t) => t.typeId === args.where.id)) {
          throw Object.assign(new Error('Foreign key constraint violated: Tag_typeId_fkey'), { code: 'P2003' })
        }
        return tagTypes.client.delete(args)
      },
    },
    vendor: vendors.client,
    shelf: {
      ...shelves.client,
      count: async (args: { where?: Record<string, unknown> } = {}) =>
        (await shelves.client.findMany({ where: args.where })).length,
    },
    itemTag: itemTag.client,
    itemVendor: itemVendor.client,
    recipeItem: {
      ...recipeItem.client,
      // `setItemRecipes` reads an item's links with the relation filter
      // `recipe: { householdId }` (`RecipeItem` has no `householdId`). It is
      // followed to the recipe store. Any other key or shape throws, checked
      // once per call, before the rows are searched.
      findMany: async ({ where = {} }: { where?: Record<string, unknown> } = {}) => {
        checkWhere('junctionFake(RecipeItem).findMany', where, {
          itemId: 'in',
          recipeId: 'in',
          recipe: { nested: { householdId: 'equals' } },
        })
        return recipeItem.state.rows
          .filter((r) =>
            Object.entries(where).every(([key, filter]) => {
              if (filter === undefined) return true
              if (key === 'recipe') {
                const parent = recipes.state.rows.find((x) => x.id === r.recipeId)
                return parent?.householdId === (filter as { householdId: string }).householdId
              }
              if (typeof filter === 'string') return r[key] === filter
              return (filter as { in: unknown[] }).in.includes(r[key])
            }),
          )
          .map((r) => ({ ...r }))
      },
    },
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
  // Counts the open callbacks, so a listener can see whether it was called
  // while a transaction was still running.
  client.$transaction = async (arg: unknown) => {
    hooks.transactionDepth += 1
    try {
      return await runInTransaction(stores, client, arg)
    } finally {
      hooks.transactionDepth -= 1
    }
  }

  return {
    prisma: {
      ...client,
      $world: world,
      $carts: carts,
      $logs: logs,
      $stores: { items, recipes, tags, tagTypes, vendors, shelves, itemTag, recipeItem },
    },
  }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import { makeInventoryLog } from '../test/inventoryLogFake.js'
import { makeStock } from '../test/stockFake.js'

type Rows = { state: { rows: Record<string, unknown>[] }; reset: (rows?: never[]) => void }
const handles = prisma as unknown as {
  $world: HouseholdWorld
  $carts: CartFake
  $logs: InventoryLogFake
  $stores: {
    items: Rows
    recipes: Rows
    tags: Rows
    tagTypes: Rows
    vendors: Rows
    shelves: Rows
    itemTag: { state: { rows: Record<string, unknown>[] } }
    recipeItem: { state: { rows: Record<string, unknown>[] } }
  }
}
const world = handles.$world
const carts = handles.$carts
const logs = handles.$logs
const S = handles.$stores

const ALICE = 'user_alice'
const BOB = 'user_bob'
const CAROL = 'user_carol'
const STRANGER = 'user_stranger'

const LOC_HOME = 'loc_home'
const LOC_GARAGE = 'loc_garage'
const LOC_SECOND = 'loc_second'
const LOC_STRANGER = 'loc_stranger'

const TAB = 'tab-alice-1'
const T0 = new Date('2026-01-01T00:00:00.000Z')
const ISO = T0.toISOString()

function seed() {
  hooks.transactionDepth = 0
  hooks.failItemCreateNumber = undefined
  hooks.itemCreates = 0
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
      makeStock({ id: 'st_milk_second', itemId: 'item_milk', locationId: LOC_SECOND, packedQuantity: 1 }),
      makeStock({ id: 'st_bread_garage', itemId: 'item_bread', locationId: LOC_GARAGE, packedQuantity: 1 }),
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
      householdMemberRow('hh_second', CAROL, 'owner'),
      householdMemberRow('hh_second', ALICE, 'member'),
      householdMemberRow('hh_other', STRANGER, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_HOME, ALICE, 'organizer'),
      locationMemberRow(LOC_GARAGE, ALICE, 'organizer'),
      locationMemberRow(LOC_SECOND, ALICE, 'organizer'),
      locationMemberRow(LOC_HOME, BOB, 'participant'),
      locationMemberRow(LOC_SECOND, CAROL, 'organizer'),
      locationMemberRow(LOC_STRANGER, STRANGER, 'organizer'),
    ],
  })
  world.setActiveHousehold(ALICE, 'hh_home')
  const item = (id: string, householdId: string) => ({
    id,
    householdId,
    name: id,
    consumeAmount: 1,
    targetUnit: 'package',
    expirationMode: 'disabled',
    createdAt: T0,
    updatedAt: T0,
  })
  S.items.reset([
    item('item_milk', 'hh_home'),
    item('item_bread', 'hh_home'),
    item('item_theirs', 'hh_other'),
  ] as never[])
  S.tagTypes.reset([
    { id: 'tt_1', householdId: 'hh_home', name: 'Category', color: 'blue' },
    { id: 'tt_2', householdId: 'hh_home', name: 'Used elsewhere', color: 'red' },
    { id: 'tt_unused', householdId: 'hh_home', name: 'Unused', color: 'teal' },
    { id: 'tt_theirs', householdId: 'hh_other', name: 'Theirs', color: 'green' },
  ] as never[])
  S.tags.reset([
    { id: 'tag_1', householdId: 'hh_home', name: 'Dairy', typeId: 'tt_1', parentId: null },
    { id: 'tag_child', householdId: 'hh_home', name: 'Milk', typeId: 'tt_1', parentId: 'tag_1' },
    { id: 'tag_lone', householdId: 'hh_home', name: 'Lone', typeId: 'tt_1', parentId: null },
    { id: 'tag_theirs', householdId: 'hh_other', name: 'Theirs', typeId: 'tt_theirs', parentId: null },
    // Another household's tag on hh_home's type tt_2. Possible before
    // 2026-11-04, when `createTag` did not check `typeId`. It makes
    // `deleteTagType(tt_2)` fail inside its transaction.
    { id: 'tag_odd', householdId: 'hh_other', name: 'Odd', typeId: 'tt_2', parentId: null },
  ] as never[])
  S.vendors.reset([
    { id: 'ven_1', householdId: 'hh_home', name: 'Costco' },
    { id: 'ven_empty', householdId: 'hh_home', name: 'No carts' },
    { id: 'ven_theirs', householdId: 'hh_other', name: 'Theirs' },
  ] as never[])
  S.recipes.reset([
    { id: 'rec_1', householdId: 'hh_home', name: 'Pancakes', lastCookedAt: null },
    { id: 'rec_theirs', householdId: 'hh_other', name: 'Theirs', lastCookedAt: null },
  ] as never[])
  S.shelves.reset([
    { id: 'sh_1', householdId: 'hh_home', name: 'Fridge', type: 'selection', order: 0, filterConfig: null, itemIds: ['item_milk'] },
    { id: 'sh_2', householdId: 'hh_home', name: 'Pantry', type: 'selection', order: 1, filterConfig: null, itemIds: [] },
    { id: 'sh_theirs', householdId: 'hh_other', name: 'Theirs', type: 'selection', order: 0, filterConfig: null, itemIds: [] },
  ] as never[])
  S.itemTag.state.rows = []
  S.recipeItem.state.rows = []
  logs.reset([
    makeInventoryLog({ id: 'log_milk_home_1', itemId: 'item_milk', userId: ALICE, locationId: LOC_HOME }),
    makeInventoryLog({ id: 'log_milk_home_2', itemId: 'item_milk', userId: ALICE, locationId: LOC_HOME }),
    makeInventoryLog({ id: 'log_milk_garage', itemId: 'item_milk', userId: ALICE, locationId: LOC_GARAGE }),
  ])
  carts.reset({
    carts: [
      { id: `${LOC_HOME}:no-vendor`, locationId: LOC_HOME, lastPurchasedAt: null },
      { id: `${LOC_GARAGE}:no-vendor`, locationId: LOC_GARAGE, lastPurchasedAt: null },
      { id: `${LOC_HOME}:ven_1`, locationId: LOC_HOME, lastPurchasedAt: null },
    ],
    cartItems: [
      { id: 'ci_milk_home', cartId: `${LOC_HOME}:no-vendor`, itemId: 'item_milk', quantity: 1, userId: ALICE },
      // Bread only: the garage has no cart row of item_milk.
      { id: 'ci_bread_garage', cartId: `${LOC_GARAGE}:no-vendor`, itemId: 'item_bread', quantity: 1, userId: ALICE },
    ],
  })
}

// ─── the recording listener ──────────────────────────────────────────────────

type Seen = { event: ChangeEvent; inTransaction: boolean; itemIds: string[]; itemTagCount: number }
let seen: Seen[] = []
let unsubscribe: () => void = () => undefined

beforeEach(() => {
  seed()
  seen = []
  unsubscribe = liveEvents.subscribe((event) => {
    seen.push({
      event,
      inTransaction: hooks.transactionDepth > 0,
      itemIds: S.items.state.rows.map((r) => r.id as string).sort(),
      itemTagCount: S.itemTag.state.rows.length,
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

const CATALOG_HOME = change('CATALOG', null, 'hh_home')

// ─── running a mutation ──────────────────────────────────────────────────────

const server = new ApolloServer<Context>({ typeDefs, resolvers })

type Result = {
  data?: Record<string, unknown> | null
  errors?: ReadonlyArray<{ extensions?: Record<string, unknown> }>
}

/**
 * `householdId`, when given, becomes the caller's active household
 * (`User.activeHouseholdId`, decision T14 of the H5b plan; H4 plan rule 16),
 * so a test about ALICE's two households says which one it acts in.
 */
async function run(
  query: string,
  userId: string,
  variables: Record<string, unknown> = {},
  householdId?: string,
): Promise<Result> {
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
  return res.body.singleResult as Result
}

function code(res: Result) {
  return res.errors?.[0]?.extensions?.code
}

function itemImport(id: string) {
  return { id, name: id, tagIds: [], targetUnit: 'package', consumeAmount: 1, createdAt: ISO, updatedAt: ISO }
}

function shelfImport(id: string) {
  return { id, name: id, type: 'selection', order: 3, createdAt: ISO, updatedAt: ISO }
}

// ─── the plain CATALOG mutations ─────────────────────────────────────────────

// Each row runs the real resolver against the fakes, as ALICE (a manager,
// the owner of hh_home), and must send exactly one household-level
// `CATALOG` event for hh_home, with no transaction open, and no error.
const plainCatalog: [name: string, query: string, variables?: Record<string, unknown>][] = [
  ['createItem', 'mutation { createItem(input: { name: "Eggs", tagIds: ["tag_1"] }) { id } }'],
  ['updateItem', 'mutation { updateItem(id: "item_milk", input: { name: "Oat milk", tagIds: ["tag_1"] }) { id } }'],
  ['createTagType', 'mutation { createTagType(name: "Aisle", color: "teal") { id } }'],
  ['updateTagType', 'mutation { updateTagType(id: "tt_1", name: "Renamed") { id } }'],
  ['deleteTagType', 'mutation { deleteTagType(id: "tt_unused") }'],
  ['createTag', 'mutation { createTag(name: "Cheese", typeId: "tt_1", parentId: "tag_1") { id } }'],
  ['updateTag', 'mutation { updateTag(id: "tag_1", name: "Renamed") { id } }'],
  ['deleteTag (orphan the children)', 'mutation { deleteTag(id: "tag_1") }'],
  ['deleteTag (with its children)', 'mutation { deleteTag(id: "tag_1", deleteChildren: true) }'],
  ['updateVendor', 'mutation { updateVendor(id: "ven_1", name: "Renamed") { id } }'],
  ['createRecipe', 'mutation { createRecipe(name: "Toast", items: [{ itemId: "item_bread", defaultAmount: 1 }]) { id } }'],
  ['updateRecipe', 'mutation { updateRecipe(id: "rec_1", name: "Renamed", items: []) { id } }'],
  ['deleteRecipe', 'mutation { deleteRecipe(id: "rec_1") }'],
  ['updateRecipeLastCookedAt', 'mutation { updateRecipeLastCookedAt(id: "rec_1") { id } }'],
  ['setItemRecipes', 'mutation { setItemRecipes(itemId: "item_bread", recipeIds: ["rec_1"]) { id } }'],
  ['createShelf', 'mutation { createShelf(name: "Snacks", type: "selection", itemIds: ["item_bread"]) { id } }'],
  ['updateShelf', 'mutation { updateShelf(id: "sh_1", name: "Renamed") { id } }'],
  ['deleteShelf', 'mutation { deleteShelf(id: "sh_1") }'],
  ['reorderShelves', 'mutation { reorderShelves(orderedIds: ["sh_2", "sh_1"]) }'],
  ['reorderShelfItems', 'mutation { reorderShelfItems(shelfId: "sh_1", orderedItemIds: ["item_bread", "item_milk"]) }'],
  [
    'applyShelfFilterPicks',
    'mutation { applyShelfFilterPicks(input: { itemId: "item_bread", addTagIds: ["tag_1"], addVendorIds: [], addRecipeId: "rec_1" }) { id } }',
  ],
  ['renameHousehold', 'mutation { renameHousehold(name: "The Lin home") { id } }'],
  ['bulkCreateItems', 'mutation ($r: [ItemInput!]!) { bulkCreateItems(items: $r) { id } }', { r: [itemImport('item_new')] }],
  ['bulkUpsertItems', 'mutation ($r: [ItemInput!]!) { bulkUpsertItems(items: $r) { id } }', { r: [itemImport('item_milk')] }],
  ['bulkCreateTags', 'mutation ($r: [TagInput!]!) { bulkCreateTags(tags: $r) { id } }', { r: [{ id: 'tag_new', name: 'New', typeId: 'tt_1' }] }],
  ['bulkUpsertTags', 'mutation ($r: [TagInput!]!) { bulkUpsertTags(tags: $r) { id } }', { r: [{ id: 'tag_1', name: 'Dairy 2', typeId: 'tt_1' }] }],
  [
    'bulkCreateTagTypes',
    'mutation ($r: [TagTypeInput!]!) { bulkCreateTagTypes(tagTypes: $r) { id } }',
    { r: [{ id: 'tt_new', name: 'New', color: 'blue' }] },
  ],
  [
    'bulkUpsertTagTypes',
    'mutation ($r: [TagTypeInput!]!) { bulkUpsertTagTypes(tagTypes: $r) { id } }',
    { r: [{ id: 'tt_1', name: 'Category 2', color: 'blue' }] },
  ],
  ['bulkCreateVendors', 'mutation ($r: [VendorInput!]!) { bulkCreateVendors(vendors: $r) { id } }', { r: [{ id: 'ven_new', name: 'Lidl' }] }],
  ['bulkUpsertVendors', 'mutation ($r: [VendorInput!]!) { bulkUpsertVendors(vendors: $r) { id } }', { r: [{ id: 'ven_1', name: 'Costco 2' }] }],
  ['bulkCreateRecipes', 'mutation ($r: [RecipeInput!]!) { bulkCreateRecipes(recipes: $r) { id } }', { r: [{ id: 'rec_new', name: 'Soup', items: [] }] }],
  ['bulkUpsertRecipes', 'mutation ($r: [RecipeInput!]!) { bulkUpsertRecipes(recipes: $r) { id } }', { r: [{ id: 'rec_1', name: 'Crepes', items: [] }] }],
  ['bulkCreateShelves', 'mutation ($r: [ShelfInput!]!) { bulkCreateShelves(shelves: $r) { id } }', { r: [shelfImport('sh_new')] }],
  ['bulkUpsertShelves', 'mutation ($r: [ShelfInput!]!) { bulkUpsertShelves(shelves: $r) { id } }', { r: [shelfImport('sh_1')] }],
]

describe('every plain catalog mutation publishes one CATALOG for the caller\'s household', () => {
  it.each(plainCatalog)('%s', async (_name, query, variables) => {
    const res = await run(query, ALICE, variables)

    expect(res.errors).toBeUndefined()
    // A delete that found nothing returns false; every row here must really
    // change something.
    expect(Object.values(res.data ?? {})).not.toContain(false)
    expect(events()).toEqual([CATALOG_HOME])
    expect(seen.map((s) => s.inTransaction)).toEqual([false])
  })

  it('updateRecipeLastCookedAt needs only `member`, and still publishes', async () => {
    const res = await run('mutation { updateRecipeLastCookedAt(id: "rec_1") { id } }', BOB)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([CATALOG_HOME])
  })
})

// ─── nothing on a refusal, a miss, or a write of nothing ─────────────────────

// BOB is a household `member`; every one of these needs `manager` (or
// `owner`, for `renameHousehold`). Refused before any write, so no event.
const refusedForMember: [name: string, query: string][] = [
  ['createItem', 'mutation { createItem(input: { name: "X" }) { id } }'],
  ['updateItem', 'mutation { updateItem(id: "item_milk", input: { name: "X" }) { id } }'],
  ['deleteItem', 'mutation { deleteItem(id: "item_milk") }'],
  ['createTagType', 'mutation { createTagType(name: "X", color: "teal") { id } }'],
  ['updateTagType', 'mutation { updateTagType(id: "tt_1", name: "X") { id } }'],
  ['deleteTagType', 'mutation { deleteTagType(id: "tt_unused") }'],
  ['createTag', 'mutation { createTag(name: "X", typeId: "tt_1") { id } }'],
  ['updateTag', 'mutation { updateTag(id: "tag_1", name: "X") { id } }'],
  ['deleteTag', 'mutation { deleteTag(id: "tag_1") }'],
  ['createVendor', `mutation { createVendor(name: "X", locationId: "${LOC_HOME}") { id } }`],
  ['updateVendor', 'mutation { updateVendor(id: "ven_1", name: "X") { id } }'],
  ['deleteVendor', 'mutation { deleteVendor(id: "ven_1") }'],
  ['createRecipe', 'mutation { createRecipe(name: "X") { id } }'],
  ['updateRecipe', 'mutation { updateRecipe(id: "rec_1", name: "X") { id } }'],
  ['deleteRecipe', 'mutation { deleteRecipe(id: "rec_1") }'],
  ['setItemRecipes', 'mutation { setItemRecipes(itemId: "item_bread", recipeIds: ["rec_1"]) { id } }'],
  ['createShelf', 'mutation { createShelf(name: "X", type: "selection") { id } }'],
  ['updateShelf', 'mutation { updateShelf(id: "sh_1", name: "X") { id } }'],
  ['deleteShelf', 'mutation { deleteShelf(id: "sh_1") }'],
  ['reorderShelves', 'mutation { reorderShelves(orderedIds: ["sh_2", "sh_1"]) }'],
  ['reorderShelfItems', 'mutation { reorderShelfItems(shelfId: "sh_1", orderedItemIds: []) }'],
  [
    'applyShelfFilterPicks',
    'mutation { applyShelfFilterPicks(input: { itemId: "item_bread", addTagIds: ["tag_1"], addVendorIds: [] }) { id } }',
  ],
  ['renameHousehold', 'mutation { renameHousehold(name: "X") { id } }'],
]

describe('a refused catalog write publishes nothing', () => {
  it.each(refusedForMember)('%s by a household member', async (_name, query) => {
    const res = await run(query, BOB)

    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })
})

// ALICE may write the catalog, but each of these names a row that is not
// there (or is another household's), so it changes nothing.
const changesNothing: [name: string, query: string, check: (res: Result) => void][] = [
  ['updateItem, another household\'s item', 'mutation { updateItem(id: "item_theirs", input: { name: "X" }) { id } }', (r) => expect(code(r)).toBe('NOT_FOUND')],
  ['deleteItem, a missing item', 'mutation { deleteItem(id: "item_gone") }', (r) => expect(r.data?.deleteItem).toBe(false)],
  ['updateTagType, a missing type', 'mutation { updateTagType(id: "tt_gone", name: "X") { id } }', (r) => expect(code(r)).toBe('NOT_FOUND')],
  ['deleteTagType, a missing type', 'mutation { deleteTagType(id: "tt_gone") }', (r) => expect(r.data?.deleteTagType).toBe(false)],
  ['updateTag, another household\'s tag', 'mutation { updateTag(id: "tag_theirs", name: "X") { id } }', (r) => expect(code(r)).toBe('FORBIDDEN')],
  ['updateTag, a missing tag', 'mutation { updateTag(id: "tag_gone", name: "X") { id } }', (r) => expect(code(r)).toBe('NOT_FOUND')],
  ['deleteTag, a missing tag', 'mutation { deleteTag(id: "tag_gone") }', (r) => expect(r.data?.deleteTag).toBe(false)],
  ['deleteTag with children, a missing tag', 'mutation { deleteTag(id: "tag_gone", deleteChildren: true) }', (r) => expect(r.data?.deleteTag).toBe(true)],
  ['updateVendor, another household\'s vendor', 'mutation { updateVendor(id: "ven_theirs", name: "X") { id } }', (r) => expect(code(r)).toBe('FORBIDDEN')],
  ['deleteVendor, a missing vendor', 'mutation { deleteVendor(id: "ven_gone") }', (r) => expect(r.data?.deleteVendor).toBe(false)],
  ['updateRecipe, a missing recipe', 'mutation { updateRecipe(id: "rec_gone", name: "X") { id } }', (r) => expect(code(r)).toBe('NOT_FOUND')],
  ['deleteRecipe, another household\'s recipe', 'mutation { deleteRecipe(id: "rec_theirs") }', (r) => expect(r.data?.deleteRecipe).toBe(false)],
  ['setItemRecipes, another household\'s recipe', 'mutation { setItemRecipes(itemId: "item_bread", recipeIds: ["rec_theirs"]) { id } }', (r) => expect(code(r)).toBe('FORBIDDEN')],
  ['setItemRecipes, another household\'s item', 'mutation { setItemRecipes(itemId: "item_theirs", recipeIds: ["rec_1"]) { id } }', (r) => expect(code(r)).toBe('NOT_FOUND')],
  ['setItemRecipes, a list that changes nothing', 'mutation { setItemRecipes(itemId: "item_bread", recipeIds: []) { id } }', (r) => expect(r.data?.setItemRecipes).toEqual([])],
  ['updateRecipeLastCookedAt, a missing recipe', 'mutation { updateRecipeLastCookedAt(id: "rec_gone") { id } }', (r) => expect(code(r)).toBe('NOT_FOUND')],
  ['updateShelf, a missing shelf', 'mutation { updateShelf(id: "sh_gone", name: "X") { id } }', (r) => expect(code(r)).toBe('NOT_FOUND')],
  ['deleteShelf, another household\'s shelf', 'mutation { deleteShelf(id: "sh_theirs") }', (r) => expect(r.data?.deleteShelf).toBe(false)],
  ['reorderShelves, an empty list', 'mutation { reorderShelves(orderedIds: []) }', (r) => expect(r.data?.reorderShelves).toBe(true)],
  ['reorderShelves, only another household\'s shelf', 'mutation { reorderShelves(orderedIds: ["sh_theirs"]) }', (r) => expect(r.data?.reorderShelves).toBe(true)],
  ['reorderShelfItems, a missing shelf', 'mutation { reorderShelfItems(shelfId: "sh_gone", orderedItemIds: []) }', (r) => expect(code(r)).toBe('NOT_FOUND')],
  ['renameHousehold, an empty name', 'mutation { renameHousehold(name: "  ") { id } }', (r) => expect(code(r)).toBe('BAD_USER_INPUT')],
]

describe('a catalog write that changes nothing publishes nothing', () => {
  it.each(changesNothing)('%s', async (_name, query, check) => {
    const res = await run(query, ALICE)

    check(res)
    expect(events()).toEqual([])
  })

  it('setItemRecipes with the same list again publishes nothing', async () => {
    // Given a first save that added item_bread to rec_1 (and published once)
    const first = await run('mutation { setItemRecipes(itemId: "item_bread", recipeIds: ["rec_1"]) { id } }', ALICE)
    expect(first.errors).toBeUndefined()
    expect(events()).toEqual([CATALOG_HOME])
    seen.length = 0

    // When the same list is saved again
    const again = await run('mutation { setItemRecipes(itemId: "item_bread", recipeIds: ["rec_1"]) { id } }', ALICE)

    // Then nothing changed, so no event
    expect(again.errors).toBeUndefined()
    expect(again.data?.setItemRecipes).toEqual([])
    expect(events()).toEqual([])
  })

  it('an import whose every row is skipped publishes nothing', async () => {
    // item_milk and tt_1 are already the household's: `bulkCreate*` skips them.
    const items = await run('mutation ($r: [ItemInput!]!) { bulkCreateItems(items: $r) { id } }', ALICE, {
      r: [itemImport('item_milk')],
    })
    const types = await run('mutation ($r: [TagTypeInput!]!) { bulkCreateTagTypes(tagTypes: $r) { id } }', ALICE, {
      r: [{ id: 'tt_1', name: 'Category', color: 'blue' }],
    })

    expect(items.errors).toBeUndefined()
    expect(types.errors).toBeUndefined()
    expect(events()).toEqual([])
  })
})

// ─── transactions: after commit, nothing on rollback ─────────────────────────

describe('the catalog mutations with a transaction', () => {
  it('applyShelfFilterPicks publishes after its transaction, with the new rows saved', async () => {
    const res = await run(
      'mutation { applyShelfFilterPicks(input: { itemId: "item_bread", addTagIds: ["tag_1"], addVendorIds: [] }) { id } }',
      ALICE,
    )

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([CATALOG_HOME])
    expect(seen[0]?.inTransaction).toBe(false)
    // The new ItemTag row was already in the store when the listener ran.
    expect(seen[0]?.itemTagCount).toBe(1)
  })

  it('applyShelfFilterPicks whose transaction throws publishes nothing', async () => {
    // The tag row is written first; then the recipe is not found, and the
    // transaction rolls the tag row back.
    const res = await run(
      'mutation { applyShelfFilterPicks(input: { itemId: "item_bread", addTagIds: ["tag_1"], addVendorIds: [], addRecipeId: "rec_gone" }) { id } }',
      ALICE,
    )

    expect(code(res)).toBe('NOT_FOUND')
    expect(S.itemTag.state.rows).toEqual([])
    expect(events()).toEqual([])
  })

  it('deleteTagType whose transaction fails publishes nothing', async () => {
    // tag_odd (another household) uses tt_2, so the type delete fails and
    // the household's own tags of tt_2 are rolled back.
    const res = await run('mutation { deleteTagType(id: "tt_2") }', ALICE)

    expect(res.data?.deleteTagType).toBe(false)
    expect(events()).toEqual([])
  })
})

// ─── deleteItem ──────────────────────────────────────────────────────────────

describe('deleteItem', () => {
  it('publishes CATALOG, and STOCK, LOG and CART at each location where it had rows', async () => {
    const res = await run('mutation { deleteItem(id: "item_milk") }', ALICE)

    expect(res.data?.deleteItem).toBe(true)
    expect(sortedEvents()).toEqual([
      change('CART', LOC_HOME, 'hh_home'),
      CATALOG_HOME,
      change('LOG', LOC_GARAGE, 'hh_home'),
      // Two logs at LOC_HOME, one event.
      change('LOG', LOC_HOME, 'hh_home'),
      change('STOCK', LOC_HOME, 'hh_home'),
      // The LOCATION's household, not the caller's (hh_home).
      change('STOCK', LOC_SECOND, 'hh_second'),
    ])
    // After the delete: the item was gone when the listener ran.
    for (const s of seen) expect(s.itemIds).not.toContain('item_milk')
  })

  it('an item with no stock, logs or cart rows publishes CATALOG only', async () => {
    // Remove bread's rows, so it has nothing at any location.
    world.stock.state.itemStocks = world.stock.state.itemStocks.filter((s) => s.itemId !== 'item_bread')
    carts.state.cartItems = carts.state.cartItems.filter((r) => r.itemId !== 'item_bread')

    const res = await run('mutation { deleteItem(id: "item_bread") }', ALICE)

    expect(res.data?.deleteItem).toBe(true)
    expect(events()).toEqual([CATALOG_HOME])
  })

  it('another household\'s item publishes nothing', async () => {
    const res = await run('mutation { deleteItem(id: "item_theirs") }', ALICE)

    expect(res.data?.deleteItem).toBe(false)
    expect(events()).toEqual([])
  })
})

// ─── createVendor and deleteVendor ───────────────────────────────────────────

describe('createVendor', () => {
  it('publishes CATALOG and CART at the location of the cart it made', async () => {
    const res = await run(`mutation { createVendor(name: "Lidl", locationId: "${LOC_GARAGE}") { id } }`, ALICE)

    expect(res.errors).toBeUndefined()
    expect(sortedEvents()).toEqual([change('CART', LOC_GARAGE, 'hh_home'), CATALOG_HOME])
  })

  it('with no location named, it writes no cart and publishes only CATALOG', async () => {
    // A household with no location sends no `locationId` (households H5,
    // review of task F.7).
    const cartsBefore = carts.state.carts.length

    const res = await run('mutation { createVendor(name: "Lidl") { id } }', ALICE)

    expect(res.errors).toBeUndefined()
    expect(carts.state.carts).toHaveLength(cartsBefore)
    expect(events()).toEqual([CATALOG_HOME])
  })

  it('a viewer of the location gets the vendor, no cart, and only CATALOG', async () => {
    // Given ALICE is only a viewer at LOC_GARAGE (she stays hh_home owner)
    const row = world.households.state.locationMembers.find(
      (r) => r.locationId === LOC_GARAGE && r.userId === ALICE,
    )
    if (!row) throw new Error('fixture: ALICE has no row at LOC_GARAGE')
    row.role = 'viewer'
    const cartsBefore = carts.state.carts.length

    // When she creates a vendor there
    const res = await run(`mutation { createVendor(name: "Lidl", locationId: "${LOC_GARAGE}") { id } }`, ALICE)

    // Then no cart is written, so no CART event is sent
    expect(res.errors).toBeUndefined()
    expect(carts.state.carts).toHaveLength(cartsBefore)
    expect(events()).toEqual([CATALOG_HOME])
  })

  it("a location of the caller's other household is refused and publishes nothing", async () => {
    // ALICE is organizer at LOC_SECOND (hh_second), and her catalog is
    // hh_home (pinned). Until households H4 task E.3 `createVendor` let that
    // through: the vendor went to hh_home and its cart to LOC_SECOND, with
    // CART published for hh_second (issue #381, gap 2). Now
    // `requireLocationInHousehold` refuses it before any write.
    const vendorsBefore = S.vendors.state.rows.length
    const cartsBefore = carts.state.carts.length
    const res = await run(
      `mutation { createVendor(name: "Lidl", locationId: "${LOC_SECOND}") { id } }`,
      ALICE,
      {},
      'hh_home',
    )

    expect(code(res)).toBe('FORBIDDEN')
    expect(S.vendors.state.rows).toHaveLength(vendorsBefore)
    expect(carts.state.carts).toHaveLength(cartsBefore)
    expect(events()).toEqual([])
  })

  it('a location the caller holds no role on publishes nothing', async () => {
    const res = await run(`mutation { createVendor(name: "Lidl", locationId: "${LOC_STRANGER}") { id } }`, ALICE)

    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })
})

describe('deleteVendor', () => {
  it('publishes CART where it deleted carts, and CATALOG', async () => {
    const res = await run('mutation { deleteVendor(id: "ven_1") }', ALICE)

    expect(res.data?.deleteVendor).toBe(true)
    expect(sortedEvents()).toEqual([change('CART', LOC_HOME, 'hh_home'), CATALOG_HOME])
  })

  it('a vendor with no carts publishes CATALOG only', async () => {
    const res = await run('mutation { deleteVendor(id: "ven_empty") }', ALICE)

    expect(res.data?.deleteVendor).toBe(true)
    expect(events()).toEqual([CATALOG_HOME])
  })
})

// ─── renameHousehold ─────────────────────────────────────────────────────────

describe('renameHousehold', () => {
  it('publishes CATALOG for the household it renamed, after the write', async () => {
    let nameAtEvent: string | undefined
    const stop = liveEvents.subscribe(() => {
      nameAtEvent = world.households.state.households.find((h) => h.id === 'hh_home')?.name
    })
    try {
      const res = await run('mutation { renameHousehold(name: "The Lin home") { id name } }', ALICE)

      expect(res.errors).toBeUndefined()
      expect(events()).toEqual([CATALOG_HOME])
      expect(nameAtEvent).toBe('The Lin home')
    } finally {
      stop()
    }
  })

  it('CAROL renames hh_second, and the event says hh_second', async () => {
    const res = await run('mutation { renameHousehold(name: "Second") { id } }', CAROL)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([{ ...change('CATALOG', null, 'hh_second') }])
  })
})

// ─── an import that fails part-way ───────────────────────────────────────────

describe('a catalog import that fails part-way', () => {
  it('publishes CATALOG for the rows it saved before the failure', async () => {
    hooks.failItemCreateNumber = 2

    const res = await run('mutation ($r: [ItemInput!]!) { bulkCreateItems(items: $r) { id } }', ALICE, {
      r: [itemImport('item_a'), itemImport('item_b')],
    })

    expect(res.errors).toBeDefined()
    // item_a is saved; the rows are not one transaction.
    expect(S.items.state.rows.map((r) => r.id)).toContain('item_a')
    expect(events()).toEqual([CATALOG_HOME])
  })

  it('a batch that fails on its first row publishes nothing', async () => {
    hooks.failItemCreateNumber = 1

    const res = await run('mutation ($r: [ItemInput!]!) { bulkCreateItems(items: $r) { id } }', ALICE, {
      r: [itemImport('item_a')],
    })

    expect(res.errors).toBeDefined()
    expect(events()).toEqual([])
  })
})
