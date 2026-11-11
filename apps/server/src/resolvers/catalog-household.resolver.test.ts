import { ApolloServer } from '@apollo/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import type { HouseholdRole, LocationRole } from '../lib/authz.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── What this file covers ───────────────────────────────────────────────────
//
// Households H3a task 3.7: the catalog — items, tags, tag types, vendors,
// recipes and shelves — belongs to a HOUSEHOLD.
//
// - Every read needs household role `member` and returns only the caller's
//   household's rows. A row another member of the household made is read like
//   the caller's own.
// - Every write needs `manager` (design, *Household roles*: members read the
//   catalog, managers write it). The one exception is marking a recipe as
//   cooked, which is a cooking right and needs only `member`.
// - Issue #273: an id a write ATTACHES — an item's tags and vendors, a
//   recipe's items, a shelf's items and filter ids, a tag's type and parent,
//   the picks of `applyShelfFilterPicks` — must be the household's.
//   Another household's id is FORBIDDEN. The three `itemCountBy*` queries
//   count only the household's items.
//
// ─── The fixture: three people (plan H3a rule 10) ────────────────────────────
//
// | Person   | Household | Household role                                    |
// |----------|-----------|---------------------------------------------------|
// | caller   | hh-1      | set by each test (`member` or `manager`)          |
// | other    | hh-1      | always the OTHER one of the two, so it differs    |
// | stranger | hh-2      | owner                                             |
//
// With one person, "check the role" and "ignore the role" give the same
// answer. `other` holds a different role from the caller, so a check that
// reads the wrong person's row gives a different answer too. Some hh-1 rows
// were made by `other`, so a scope by `userId` and a scope by household give
// different answers.
//
// hh-2's rows include the cross-household junction rows that unchecked ids
// could write before #273: the stranger's item is tagged with hh-1's tag, sold
// by hh-1's vendor and in hh-1's recipe. They are what lets a count that is
// not scoped to the household fail.
//
// ─── The fakes ───────────────────────────────────────────────────────────────
//
// - the six catalog models: `ownedRowFake`, scoped by `householdId`. A
//   `where` that still names `userId` throws, and so does a write that names
//   it (task 3.14 dropped the column). Some fixture rows below still carry a
//   `userId` value; nothing reads it.
// - `ItemTag`, `ItemVendor`, `RecipeItem`: a small junction fake below, with
//   the composite primary key and the `item: { householdId }` relation filter
//   the counts use. Any other `where` key throws (`checkWhere`).
// - `Household`, `HouseholdMember`, `LocationMember`, `Location`: the
//   `householdWorld` fakes, for the role checks and `createVendor`'s location
//   check.
// - `Cart`, `CartItem`: `ownedRowFake` scoped by `userId`, which carts keep
//   until H3b.
// - `$transaction`: `runInTransaction` over every store, for
//   `applyShelfFilterPicks`.
vi.mock('../lib/prisma.js', async () => {
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { runInTransaction } = await import('../test/stockFake.js')
  const { checkWhere } = await import('./../test/whereKeys.js')

  const world = createHouseholdWorld()
  const catalog = { scope: 'householdId' as const }

  type Junction = Record<string, unknown>

  /**
   * One composite-key junction table. `keys` are its key columns; `extra`
   * are other columns it stores. `where` may name a key column (a string or
   * `{ in }`) or `item: { householdId }`, which is resolved through the item
   * store. Anything else throws.
   */
  function createJunctionFake(model: string, keys: string[], extra: string[] = []) {
    const state: { rows: Junction[] } = { rows: [] }
    const spec = {
      ...Object.fromEntries(keys.map((k) => [k, 'in' as const])),
      // `equals`, not `in`: the matcher below compares the item's household
      // to a plain string. With `in`, a `{ in: [...] }` filter would pass the
      // check, match no row, and raise no error. The three `itemCountBy*`
      // queries send a plain string.
      item: { nested: { householdId: 'equals' as const } },
    }
    const pk = (row: Junction) => keys.map((k) => String(row[k])).join('|')
    const matches = (row: Junction, where: Record<string, unknown>) => {
      for (const [key, filter] of Object.entries(where)) {
        if (filter === undefined) continue
        if (key === 'item') {
          const householdId = (filter as { householdId: string }).householdId
          const item = itemStore.state.rows.find((i) => i.id === row.itemId)
          if (!item || item.householdId !== householdId) return false
          continue
        }
        const value = row[key]
        if (typeof filter === 'string') {
          if (value !== filter) return false
        } else if (!(filter as { in: unknown[] }).in.includes(value)) return false
      }
      return true
    }
    const client = {
      count: async ({ where = {} }: { where?: Record<string, unknown> } = {}) => {
        checkWhere(`junctionFake(${model})`, where, spec)
        return state.rows.filter((r) => matches(r, where)).length
      },
      createMany: async ({ data, skipDuplicates }: { data: Junction[]; skipDuplicates?: boolean }) => {
        let count = 0
        for (const row of data) {
          if (state.rows.some((r) => pk(r) === pk(row))) {
            if (skipDuplicates) continue
            throw Object.assign(new Error(`Unique constraint failed — ${model}`), { code: 'P2002' })
          }
          state.rows.push(pickColumns(row))
          count++
        }
        return { count }
      },
      create: async ({ data }: { data: Junction }) => {
        if (state.rows.some((r) => pk(r) === pk(data))) {
          throw Object.assign(new Error(`Unique constraint failed — ${model}`), { code: 'P2002' })
        }
        state.rows.push(pickColumns(data))
        return data
      },
      deleteMany: async ({ where = {} }: { where?: Record<string, unknown> } = {}) => {
        checkWhere(`junctionFake(${model})`, where, spec)
        const before = state.rows.length
        state.rows = state.rows.filter((r) => !matches(r, where))
        return { count: before - state.rows.length }
      },
    }
    function pickColumns(row: Junction): Junction {
      return Object.fromEntries([...keys, ...extra].map((k) => [k, row[k]]))
    }
    return { state, client }
  }

  type ItemRow = {
    id: string
    householdId: string
    userId: string
    name: string
    consumeAmount: number
    targetUnit: string
    createdAt?: Date
    updatedAt?: Date
  }
  const itemTag = createJunctionFake('ItemTag', ['itemId', 'tagId'])
  const itemVendor = createJunctionFake('ItemVendor', ['itemId', 'vendorId'])
  const recipeItem = createJunctionFake('RecipeItem', ['recipeId', 'itemId'], ['defaultAmount'])

  const itemStore = createOwnedRowFake<ItemRow>({
    model: 'Item',
    ...catalog,
    relations: (row) => ({
      tags: itemTag.state.rows.filter((r) => r.itemId === row.id),
      vendors: itemVendor.state.rows.filter((r) => r.itemId === row.id),
    }),
  })
  const recipeStore = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    lastCookedAt: Date | null
  }>({
    model: 'Recipe',
    ...catalog,
    relations: (row) => ({
      items: recipeItem.state.rows.filter((r) => r.recipeId === row.id),
    }),
  })
  const tagStore = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    typeId: string
    parentId: string | null
  }>({ model: 'Tag', columns: ['typeId', 'parentId'], ...catalog })
  const tagTypeStore = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    color: string
  }>({ model: 'TagType', ...catalog })
  const vendorStore = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
  }>({ model: 'Vendor', ...catalog })
  const shelfStore = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    type: string
    order: number
    filterConfig: unknown
    itemIds: string[]
  }>({ model: 'Shelf', ...catalog })
  const cartStore = createOwnedRowFake<{ id: string; userId: string; locationId: string }>({
    model: 'Cart',
  })
  const cartItemStore = createOwnedRowFake<{ id: string; userId: string; cartId: string }>({
    model: 'CartItem',
    columns: ['cartId'],
  })

  // `count` is not modelled by `ownedRowFake`; here it is `findMany` plus a
  // length, so it gets the same `where` checks.
  const withCount = <C extends { findMany: (args: { where?: Record<string, unknown> }) => Promise<unknown[]> }>(
    c: C,
  ) => ({
    ...c,
    count: async (args: { where?: Record<string, unknown> } = {}) =>
      (await c.findMany({ where: args.where })).length,
  })

  const client: Record<string, unknown> = {
    ...world.client,
    item: {
      ...itemStore.client,
      // Prisma fills `createdAt` (`@default(now())`) and `updatedAt`
      // (`@updatedAt`) on a create. `ownedRowFake` never invents a timestamp,
      // and `toGraphQL` reads both, so the test fills them here.
      create: (args: { data: Record<string, unknown> }) => {
        const now = new Date('2026-11-04T00:00:00.000Z')
        return itemStore.client.create({
          ...args,
          data: { createdAt: now, updatedAt: now, consumeAmount: 1, ...args.data },
        })
      },
    },
    recipe: recipeStore.client,
    tag: withCount(tagStore.client),
    tagType: {
      ...tagTypeStore.client,
      // `Tag_typeId_fkey` is ON DELETE NO ACTION, so Postgres refuses to
      // delete a tag type while ANY tag still uses it, in any household.
      // `ownedRowFake` models no foreign key, so this models that one, with
      // Prisma's `P2003`. It is a model of the constraint, not a stub told to
      // throw: it throws only when a tag row really uses the type. Pinned by
      // "the tagType fake refuses to delete a type a tag still uses" below.
      delete: async (args: { where: { id: string } }) => {
        if (tagStore.state.rows.some((t) => t.typeId === args.where.id)) {
          throw Object.assign(new Error('Foreign key constraint violated: Tag_typeId_fkey'), {
            code: 'P2003',
          })
        }
        return tagTypeStore.client.delete(args)
      },
    },
    vendor: vendorStore.client,
    shelf: {
      ...withCount(shelfStore.client),
      // `ownedRowFake` refuses `orderBy` on purpose. `shelves` sends
      // `{ order: 'asc' }`, so this applies exactly that and nothing else.
      findMany: async (args: { where?: Record<string, unknown>; orderBy?: unknown }) => {
        const { orderBy, ...rest } = args
        const rows = await shelfStore.client.findMany(rest)
        if (orderBy === undefined) return rows
        expect(orderBy).toEqual({ order: 'asc' })
        return [...rows].sort((a, b) => a.order - b.order)
      },
    },
    itemTag: itemTag.client,
    itemVendor: itemVendor.client,
    recipeItem: recipeItem.client,
    cart: cartStore.client,
    cartItem: cartItemStore.client,
  }
  const stores = [
    world.users.state,
    world.households.state,
    world.stock.state,
    itemStore.state,
    recipeStore.state,
    tagStore.state,
    tagTypeStore.state,
    vendorStore.state,
    shelfStore.state,
    itemTag.state,
    itemVendor.state,
    recipeItem.state,
    cartStore.state,
    cartItemStore.state,
  ] as unknown as Record<string, unknown>[]
  client.$transaction = (arg: unknown) => runInTransaction(stores, client, arg)

  return {
    prisma: {
      ...client,
      $world: world,
      $stores: {
        item: itemStore,
        recipe: recipeStore,
        tag: tagStore,
        tagType: tagTypeStore,
        vendor: vendorStore,
        shelf: shelfStore,
        cart: cartStore,
        itemTag,
        itemVendor,
        recipeItem,
      },
      $snapshot: () => structuredClone(stores),
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { HouseholdWorld } from '../test/householdWorld.js'

type Row = Record<string, unknown> & { id: string }
type Store = { state: { rows: Row[] }; reset: (rows?: Row[]) => void }
type JunctionStore = { state: { rows: Record<string, unknown>[] } }

const handles = prisma as unknown as {
  $world: HouseholdWorld
  $stores: {
    item: Store
    recipe: Store
    tag: Store
    tagType: Store
    vendor: Store
    shelf: Store
    cart: Store
    itemTag: JunctionStore
    itemVendor: JunctionStore
    recipeItem: JunctionStore
  }
  $snapshot: () => unknown
}
const world = handles.$world
const S = handles.$stores

const T = new Date('2026-11-01T00:00:00.000Z')

// ─── Seed ────────────────────────────────────────────────────────────────────

function seed(callerRole: HouseholdRole, callerLocationRole: LocationRole = 'organizer') {
  world.reset()
  world.stock.reset(
    [
      { id: 'loc-1', householdId: 'hh-1', name: 'Kitchen', order: 0 },
      { id: 'loc-s', householdId: 'hh-2', name: 'Theirs', order: 0 },
    ],
    [],
  )
  const household = (id: string, ownerId: string) => ({
    id,
    name: `${id} name`,
    ownerId,
    ownerGoneAt: null,
    createdAt: T,
    updatedAt: T,
  })
  const otherRole: HouseholdRole = callerRole === 'manager' ? 'member' : 'manager'
  world.seedHouseholds({
    households: [household('hh-1', 'caller'), household('hh-2', 'stranger')],
    householdMembers: [
      { householdId: 'hh-1', userId: 'caller', role: callerRole, joinedAt: T },
      { householdId: 'hh-1', userId: 'other', role: otherRole, joinedAt: T },
      { householdId: 'hh-2', userId: 'stranger', role: 'owner', joinedAt: T },
    ],
    locationMembers: [
      // The caller organizes loc-1 whatever their household role, so
      // `createVendor`'s location check passes and only the household role
      // decides. One test lowers it, to pin that location check.
      { locationId: 'loc-1', userId: 'caller', role: callerLocationRole, createdAt: T },
      { locationId: 'loc-s', userId: 'stranger', role: 'organizer', createdAt: T },
    ],
  })

  const mine = (userId = 'caller') => ({ householdId: 'hh-1', userId })
  const theirs = { householdId: 'hh-2', userId: 'stranger' }
  const item = (id: string, owner: { householdId: string; userId: string }) => ({
    id,
    ...owner,
    name: id,
    consumeAmount: 1,
    targetUnit: 'package',
    expirationMode: 'disabled',
    createdAt: T,
    updatedAt: T,
  })
  S.item.reset([item('item-1', mine()), item('item-2', mine('other')), item('item-s', theirs)])
  S.tagType.reset([
    { id: 'tt-1', ...mine(), name: 'Category', color: 'blue' },
    { id: 'tt-2', ...mine('other'), name: 'Unused', color: 'red' },
    { id: 'tt-s', ...theirs, name: 'Theirs', color: 'green' },
  ])
  S.tag.reset([
    { id: 'tag-1', ...mine(), name: 'Dairy', typeId: 'tt-1', parentId: null },
    { id: 'tag-1b', ...mine('other'), name: 'Milk', typeId: 'tt-1', parentId: 'tag-1' },
    { id: 'tag-s', ...theirs, name: 'Theirs', typeId: 'tt-s', parentId: null },
  ])
  S.vendor.reset([
    { id: 'ven-1', ...mine(), name: 'Costco' },
    { id: 'ven-2', ...mine('other'), name: 'iHerb' },
    { id: 'ven-s', ...theirs, name: 'Theirs' },
  ])
  S.recipe.reset([
    { id: 'rec-1', ...mine(), name: 'Pancakes', lastCookedAt: null },
    { id: 'rec-2', ...mine('other'), name: 'Omelette', lastCookedAt: null },
    { id: 'rec-s', ...theirs, name: 'Theirs', lastCookedAt: null },
  ])
  S.shelf.reset([
    { id: 'sh-1', ...mine(), name: 'Fridge', type: 'selection', order: 1, filterConfig: null, itemIds: ['item-1'] },
    { id: 'sh-2', ...mine('other'), name: 'Pantry', type: 'selection', order: 0, filterConfig: null, itemIds: [] },
    { id: 'sh-s', ...theirs, name: 'Theirs', type: 'selection', order: 5, filterConfig: null, itemIds: [] },
  ])
  S.cart.reset([])
  S.itemTag.state.rows = [
    { itemId: 'item-1', tagId: 'tag-1' },
    { itemId: 'item-2', tagId: 'tag-1' },
    // A cross-household row: the stranger's item, tagged with hh-1's tag.
    { itemId: 'item-s', tagId: 'tag-1' },
  ]
  S.itemVendor.state.rows = [
    { itemId: 'item-1', vendorId: 'ven-1' },
    { itemId: 'item-s', vendorId: 'ven-1' },
  ]
  S.recipeItem.state.rows = [
    { recipeId: 'rec-1', itemId: 'item-1', defaultAmount: 1 },
    { recipeId: 'rec-1', itemId: 'item-s', defaultAmount: 1 },
  ]
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

async function exec(query: string, variables: Record<string, unknown> = {}) {
  const r = await server.executeOperation({ query, variables }, { contextValue: { userId: 'caller' } })
  if (r.body.kind !== 'single') throw new Error('expected a single result')
  return r.body.singleResult
}

function codeOf(result: { errors?: ReadonlyArray<{ extensions?: Record<string, unknown> }> }) {
  return result.errors?.[0]?.extensions?.code
}

const ids = (rows: { id: string }[] | undefined | null) => (rows ?? []).map((r) => r.id).sort()

// ─── Reads ───────────────────────────────────────────────────────────────────

describe('a household member reads the household catalog, and never another household', () => {
  beforeEach(() => seed('member'))

  it.each([
    ['items', '{ items { id } }', ['item-1', 'item-2']],
    ['tagTypes', '{ tagTypes { id } }', ['tt-1', 'tt-2']],
    ['tags', '{ tags { id } }', ['tag-1', 'tag-1b']],
    ['vendors', '{ vendors { id } }', ['ven-1', 'ven-2']],
    ['recipes', '{ recipes { id } }', ['rec-1', 'rec-2']],
    ['shelves', '{ shelves { id } }', ['sh-1', 'sh-2']],
  ])('user sees the household %s, including rows another member made', async (field, query, expected) => {
    const result = await exec(query)

    expect(result.errors).toBeUndefined()
    expect(ids(result.data?.[field] as { id: string }[])).toEqual(expected)
  })

  it('user sees shelves in their order', async () => {
    const result = await exec('{ shelves { id } }')
    expect((result.data?.shelves as { id: string }[]).map((s) => s.id)).toEqual(['sh-2', 'sh-1'])
  })

  it("user sees tags of a type only in their household", async () => {
    // Given the stranger's tag type id: the filter is by household AND type
    const own = await exec('query ($t: String!) { tagsByType(typeId: $t) { id } }', { t: 'tt-1' })
    const theirs = await exec('query ($t: String!) { tagsByType(typeId: $t) { id } }', { t: 'tt-s' })
    const count = await exec('query ($t: String!) { tagCountByType(typeId: $t) }', { t: 'tt-s' })

    expect(ids(own.data?.tagsByType as { id: string }[])).toEqual(['tag-1', 'tag-1b'])
    expect(theirs.data?.tagsByType).toEqual([])
    expect(count.data?.tagCountByType).toBe(0)
  })

  it.each([
    ['item', 'query ($id: ID!) { item(id: $id) { id } }', 'item-s', 'item-2'],
    ['recipe', 'query ($id: ID!) { recipe(id: $id) { id } }', 'rec-s', 'rec-2'],
    ['shelf', 'query ($id: ID!) { shelf(id: $id) { id } }', 'sh-s', 'sh-2'],
  ])("user gets null for another household's %s, and the row for one another member made", async (field, query, theirs, others) => {
    const refused = await exec(query, { id: theirs })
    const allowed = await exec(query, { id: others })

    expect(refused.errors).toBeUndefined()
    expect(refused.data?.[field]).toBeNull()
    expect((allowed.data?.[field] as { id: string }).id).toBe(others)
  })

  // Issue #273. Each of hh-1's tag, vendor and recipe is linked to the
  // stranger's item by a cross-household junction row. The count must leave
  // it out: 3, 2 and 2 rows exist, and only 2, 1 and 1 are hh-1's items.
  it.each([
    ['itemCountByTag', 'query ($id: String!) { itemCountByTag(tagId: $id) }', 'tag-1', 2],
    ['itemCountByVendor', 'query ($id: String!) { itemCountByVendor(vendorId: $id) }', 'ven-1', 1],
    ['itemCountByRecipe', 'query ($id: String!) { itemCountByRecipe(recipeId: $id) }', 'rec-1', 1],
  ])("user's %s does not count another household's items", async (field, query, id, expected) => {
    const result = await exec(query, { id })

    expect(result.errors).toBeUndefined()
    expect(result.data?.[field]).toBe(expected)
  })
})

// ─── Writes: the role ────────────────────────────────────────────────────────
//
// Each write, run once as a `member` (refused, nothing changes) and once as a
// `manager` (it works). `other` holds the opposite role each time.

interface WriteCase {
  name: string
  query: string
  variables: Record<string, unknown>
  /** What a successful run as a manager must have changed. */
  changed: () => void
}

const WRITES: WriteCase[] = [
  {
    name: 'createItem',
    query: 'mutation ($input: CreateItemInput!) { createItem(input: $input) { id } }',
    variables: { input: { name: 'Bread', tagIds: ['tag-1'], vendorIds: ['ven-2'] } },
    changed: () => {
      const created = S.item.state.rows.find((r) => r.name === 'Bread')
      expect(created).toMatchObject({ householdId: 'hh-1' })
    },
  },
  {
    name: 'updateItem',
    query: 'mutation ($id: ID!, $input: UpdateItemInput!) { updateItem(id: $id, input: $input) { id } }',
    variables: { id: 'item-2', input: { name: 'Renamed' } },
    changed: () => expect(S.item.state.rows.find((r) => r.id === 'item-2')?.name).toBe('Renamed'),
  },
  {
    name: 'deleteItem',
    query: 'mutation ($id: ID!) { deleteItem(id: $id) }',
    variables: { id: 'item-2' },
    changed: () => expect(ids(S.item.state.rows)).not.toContain('item-2'),
  },
  {
    name: 'createTagType',
    query: 'mutation { createTagType(name: "Aisle", color: "teal") { id } }',
    variables: {},
    changed: () =>
      expect(S.tagType.state.rows.find((r) => r.name === 'Aisle')).toMatchObject({ householdId: 'hh-1' }),
  },
  {
    name: 'updateTagType',
    query: 'mutation ($id: ID!) { updateTagType(id: $id, name: "Renamed") { id } }',
    variables: { id: 'tt-2' },
    changed: () => expect(S.tagType.state.rows.find((r) => r.id === 'tt-2')?.name).toBe('Renamed'),
  },
  {
    name: 'deleteTagType',
    query: 'mutation ($id: ID!) { deleteTagType(id: $id) }',
    variables: { id: 'tt-2' },
    changed: () => expect(ids(S.tagType.state.rows)).not.toContain('tt-2'),
  },
  {
    name: 'createTag',
    query: 'mutation { createTag(name: "Cheese", typeId: "tt-1", parentId: "tag-1b") { id } }',
    variables: {},
    changed: () =>
      expect(S.tag.state.rows.find((r) => r.name === 'Cheese')).toMatchObject({
        householdId: 'hh-1',
        parentId: 'tag-1b',
      }),
  },
  {
    name: 'updateTag',
    query: 'mutation ($id: ID!) { updateTag(id: $id, name: "Renamed") { id } }',
    variables: { id: 'tag-1b' },
    changed: () => expect(S.tag.state.rows.find((r) => r.id === 'tag-1b')?.name).toBe('Renamed'),
  },
  {
    name: 'deleteTag',
    query: 'mutation ($id: ID!) { deleteTag(id: $id) }',
    variables: { id: 'tag-1b' },
    changed: () => expect(ids(S.tag.state.rows)).not.toContain('tag-1b'),
  },
  {
    name: 'createVendor',
    query: 'mutation { createVendor(name: "Lidl", locationId: "loc-1") { id } }',
    variables: {},
    changed: () =>
      expect(S.vendor.state.rows.find((r) => r.name === 'Lidl')).toMatchObject({ householdId: 'hh-1' }),
  },
  {
    name: 'updateVendor',
    query: 'mutation ($id: ID!) { updateVendor(id: $id, name: "Renamed") { id } }',
    variables: { id: 'ven-2' },
    changed: () => expect(S.vendor.state.rows.find((r) => r.id === 'ven-2')?.name).toBe('Renamed'),
  },
  {
    name: 'deleteVendor',
    query: 'mutation ($id: ID!) { deleteVendor(id: $id) }',
    variables: { id: 'ven-2' },
    changed: () => expect(ids(S.vendor.state.rows)).not.toContain('ven-2'),
  },
  {
    name: 'createRecipe',
    query: 'mutation { createRecipe(name: "Toast", items: [{ itemId: "item-2", defaultAmount: 1 }]) { id } }',
    variables: {},
    changed: () =>
      expect(S.recipe.state.rows.find((r) => r.name === 'Toast')).toMatchObject({ householdId: 'hh-1' }),
  },
  {
    name: 'updateRecipe',
    query: 'mutation ($id: ID!) { updateRecipe(id: $id, name: "Renamed") { id } }',
    variables: { id: 'rec-2' },
    changed: () => expect(S.recipe.state.rows.find((r) => r.id === 'rec-2')?.name).toBe('Renamed'),
  },
  {
    name: 'deleteRecipe',
    query: 'mutation ($id: ID!) { deleteRecipe(id: $id) }',
    variables: { id: 'rec-2' },
    changed: () => expect(ids(S.recipe.state.rows)).not.toContain('rec-2'),
  },
  {
    name: 'createShelf',
    query:
      'mutation { createShelf(name: "Snacks", type: "filter", filterConfig: { tagIds: ["tag-1"] }, itemIds: ["item-2"]) { id } }',
    variables: {},
    changed: () =>
      expect(S.shelf.state.rows.find((r) => r.name === 'Snacks')).toMatchObject({
        householdId: 'hh-1',
        // The household has sh-1 and sh-2; the stranger's sh-s is not counted
        order: 3,
      }),
  },
  {
    name: 'updateShelf',
    query: 'mutation ($id: ID!) { updateShelf(id: $id, name: "Renamed") { id } }',
    variables: { id: 'sh-2' },
    changed: () => expect(S.shelf.state.rows.find((r) => r.id === 'sh-2')?.name).toBe('Renamed'),
  },
  {
    name: 'deleteShelf',
    query: 'mutation ($id: ID!) { deleteShelf(id: $id) }',
    variables: { id: 'sh-2' },
    changed: () => expect(ids(S.shelf.state.rows)).not.toContain('sh-2'),
  },
  {
    name: 'reorderShelves',
    query: 'mutation { reorderShelves(orderedIds: ["sh-1", "sh-2"]) }',
    variables: {},
    changed: () => expect(S.shelf.state.rows.find((r) => r.id === 'sh-1')?.order).toBe(0),
  },
  {
    name: 'reorderShelfItems',
    query: 'mutation { reorderShelfItems(shelfId: "sh-2", orderedItemIds: ["item-2", "item-1"]) }',
    variables: {},
    changed: () =>
      expect(S.shelf.state.rows.find((r) => r.id === 'sh-2')?.itemIds).toEqual(['item-2', 'item-1']),
  },
  {
    name: 'applyShelfFilterPicks',
    query:
      'mutation { applyShelfFilterPicks(input: { itemId: "item-2", addTagIds: ["tag-1b"], addVendorIds: ["ven-1"], addRecipeId: "rec-2" }) { id } }',
    variables: {},
    changed: () => {
      expect(S.itemTag.state.rows).toContainEqual({ itemId: 'item-2', tagId: 'tag-1b' })
      expect(S.recipeItem.state.rows).toContainEqual(
        expect.objectContaining({ recipeId: 'rec-2', itemId: 'item-2' }),
      )
    },
  },
]

describe('a household member cannot write the catalog', () => {
  it.each(WRITES)('$name is refused for a member, and changes nothing', async ({ query, variables }) => {
    // Given the caller is a `member` and `other` is the manager
    seed('member')
    const before = handles.$snapshot()

    // When the member writes
    const result = await exec(query, variables)

    // Then it is refused, and no store changed
    expect(codeOf(result)).toBe('FORBIDDEN')
    expect(handles.$snapshot()).toEqual(before)
  })
})

describe('a household manager can write the catalog', () => {
  it.each(WRITES)('$name works for a manager, on rows another member made', async ({ query, variables, changed }) => {
    // Given the caller is a `manager` and `other` is a member
    seed('manager')

    // When the manager writes
    const result = await exec(query, variables)

    // Then it worked
    expect(result.errors).toBeUndefined()
    changed()
  })
})

describe('createVendor also needs location role participant', () => {
  // `createVendor` writes a Cart row at the location, so it needs location
  // role `participant` as well as household role `manager`. Every other
  // createVendor test runs as the location's `organizer`, so a check lowered
  // to `viewer` would pass them all. This test is the one that goes red then.
  it('user who is a household manager but only a location viewer cannot create a vendor', async () => {
    // Given the caller is a household manager, and only a viewer at loc-1
    seed('manager', 'viewer')
    const before = handles.$snapshot()

    // When they create a vendor there
    const result = await exec('mutation { createVendor(name: "Lidl", locationId: "loc-1") { id } }')

    // Then it is refused, and no vendor and no cart were written
    expect(codeOf(result)).toBe('FORBIDDEN')
    expect(S.vendor.state.rows.find((r) => r.name === 'Lidl')).toBeUndefined()
    expect(S.cart.state.rows).toEqual([])
    expect(handles.$snapshot()).toEqual(before)
  })

  it('user who is a household manager and a location participant can create a vendor', async () => {
    // Given the caller is a household manager and a participant at loc-1
    seed('manager', 'participant')

    // When they create a vendor there
    const result = await exec('mutation { createVendor(name: "Lidl", locationId: "loc-1") { id } }')

    // Then the vendor and its cart at loc-1 are written
    expect(result.errors).toBeUndefined()
    const vendor = S.vendor.state.rows.find((r) => r.name === 'Lidl')
    expect(vendor).toMatchObject({ householdId: 'hh-1' })
    expect(S.cart.state.rows).toEqual([expect.objectContaining({ locationId: 'loc-1' })])
  })
})

describe('marking a recipe as cooked is a cooking right, not a catalog edit', () => {
  it('user who is a household member can mark a recipe as cooked', async () => {
    seed('member')

    const result = await exec('mutation { updateRecipeLastCookedAt(id: "rec-2") { id } }')

    expect(result.errors).toBeUndefined()
    expect(S.recipe.state.rows.find((r) => r.id === 'rec-2')?.lastCookedAt).toBeInstanceOf(Date)
  })

  it("user cannot mark another household's recipe as cooked", async () => {
    seed('member')

    const result = await exec('mutation { updateRecipeLastCookedAt(id: "rec-s") { id } }')

    expect(codeOf(result)).toBe('NOT_FOUND')
    expect(S.recipe.state.rows.find((r) => r.id === 'rec-s')?.lastCookedAt).toBeNull()
  })
})

// ─── deleteTagType: a failed type delete undoes the tag cleanup ──────────────
//
// `deleteTagType` deletes the household's tags of the type, then the type. If
// another household still holds a tag of that type (a cross-household row an
// unchecked `createTag` could write before #273), Postgres refuses the type
// delete. Both writes run in one transaction, so the household's tags must
// come back. Before task 3.7's review they did not: the result was `false`
// and the tags were gone.

describe('deleteTagType rolls back its tag cleanup when the type delete fails', () => {
  it('the tagType fake refuses to delete a type a tag still uses', async () => {
    // Pins the foreign-key model above. tt-1 is used by tag-1 and tag-1b.
    seed('manager')
    await expect(prisma.tagType.delete({ where: { id: 'tt-1' } })).rejects.toMatchObject({
      code: 'P2003',
    })
    expect(ids(S.tagType.state.rows)).toContain('tt-1')
    // tt-2 is used by no tag, so it goes
    await prisma.tagType.delete({ where: { id: 'tt-2' } })
    expect(ids(S.tagType.state.rows)).not.toContain('tt-2')
  })

  it("user who deletes a tag type that another household's tag uses keeps their own tags", async () => {
    // Given hh-1's type tt-1 has hh-1's tags tag-1 and tag-1b, AND a tag of
    // the stranger's household that uses tt-1 too
    seed('manager')
    S.tag.state.rows.push({
      id: 'tag-s-of-tt1',
      householdId: 'hh-2',
      userId: 'stranger',
      name: 'Cross',
      typeId: 'tt-1',
      parentId: null,
    })
    const before = handles.$snapshot()

    // When the manager deletes tt-1
    const result = await exec('mutation { deleteTagType(id: "tt-1") }')

    // Then the delete reports failure, as before
    expect(result.errors).toBeUndefined()
    expect(result.data?.deleteTagType).toBe(false)
    // And nothing changed: the type and hh-1's two tags are still there
    expect(ids(S.tag.state.rows)).toEqual(['tag-1', 'tag-1b', 'tag-s', 'tag-s-of-tt1'])
    expect(ids(S.tagType.state.rows)).toContain('tt-1')
    expect(handles.$snapshot()).toEqual(before)
  })
})

// ─── Writes: another household's row ─────────────────────────────────────────
//
// Run as a manager, so the role passes and only the household scope can
// refuse. Each names the STRANGER's row. The expected answer is what each
// mutation has always given for a row that is not the caller's: FORBIDDEN
// for the writes guarded by `requireOwnRowOrUnclaimed`, NOT_FOUND or `false`
// for the ones that read the row first.

const STRANGER_ROW: Array<[string, string, (r: Awaited<ReturnType<typeof exec>>) => void]> = [
  ['updateItem', 'mutation { updateItem(id: "item-s", input: { name: "X" }) { id } }', (r) => expect(codeOf(r)).toBe('NOT_FOUND')],
  ['deleteItem', 'mutation { deleteItem(id: "item-s") }', (r) => expect(r.data?.deleteItem).toBe(false)],
  ['updateTagType', 'mutation { updateTagType(id: "tt-s", name: "X") { id } }', (r) => expect(codeOf(r)).toBe('FORBIDDEN')],
  ['deleteTagType', 'mutation { deleteTagType(id: "tt-s") }', (r) => expect(codeOf(r)).toBe('FORBIDDEN')],
  ['updateTag', 'mutation { updateTag(id: "tag-s", name: "X") { id } }', (r) => expect(codeOf(r)).toBe('FORBIDDEN')],
  ['deleteTag', 'mutation { deleteTag(id: "tag-s") }', (r) => expect(codeOf(r)).toBe('FORBIDDEN')],
  ['updateVendor', 'mutation { updateVendor(id: "ven-s", name: "X") { id } }', (r) => expect(codeOf(r)).toBe('FORBIDDEN')],
  ['deleteVendor', 'mutation { deleteVendor(id: "ven-s") }', (r) => expect(codeOf(r)).toBe('FORBIDDEN')],
  ['updateRecipe', 'mutation { updateRecipe(id: "rec-s", name: "X") { id } }', (r) => expect(codeOf(r)).toBe('NOT_FOUND')],
  ['deleteRecipe', 'mutation { deleteRecipe(id: "rec-s") }', (r) => expect(r.data?.deleteRecipe).toBe(false)],
  ['updateShelf', 'mutation { updateShelf(id: "sh-s", name: "X") { id } }', (r) => expect(codeOf(r)).toBe('NOT_FOUND')],
  ['deleteShelf', 'mutation { deleteShelf(id: "sh-s") }', (r) => expect(r.data?.deleteShelf).toBe(false)],
  ['reorderShelfItems', 'mutation { reorderShelfItems(shelfId: "sh-s", orderedItemIds: []) }', (r) => expect(codeOf(r)).toBe('NOT_FOUND')],
  [
    'applyShelfFilterPicks',
    'mutation { applyShelfFilterPicks(input: { itemId: "item-s", addTagIds: [], addVendorIds: [], addRecipeId: null }) { id } }',
    (r) => expect(codeOf(r)).toBe('NOT_FOUND'),
  ],
]

describe("a household manager cannot write another household's row", () => {
  it.each(STRANGER_ROW)('%s refuses the row, and changes nothing', async (_name, query, refused) => {
    seed('manager')
    const before = handles.$snapshot()

    const result = await exec(query)

    refused(result)
    expect(handles.$snapshot()).toEqual(before)
  })

  it("reorderShelves leaves another household's shelf where it was", async () => {
    seed('manager')

    const result = await exec('mutation { reorderShelves(orderedIds: ["sh-s", "sh-1"]) }')

    expect(result.errors).toBeUndefined()
    // sh-s would get order 0 if the update were not scoped to the household
    expect(S.shelf.state.rows.find((r) => r.id === 'sh-s')?.order).toBe(5)
    expect(S.shelf.state.rows.find((r) => r.id === 'sh-1')?.order).toBe(1)
  })
})

// ─── Issue #273: ids a write attaches ────────────────────────────────────────
//
// Run as a manager, on the household's own rows, so only the attached id can
// be refused. Each attaches ONE id of the stranger's household.

const STRANGER_ID: Array<[string, string]> = [
  ['createItem tagIds', 'mutation { createItem(input: { name: "X", tagIds: ["tag-s"] }) { id } }'],
  ['createItem vendorIds', 'mutation { createItem(input: { name: "X", vendorIds: ["ven-s"] }) { id } }'],
  ['updateItem tagIds', 'mutation { updateItem(id: "item-1", input: { name: "X", tagIds: ["tag-1", "tag-s"] }) { id } }'],
  ['updateItem vendorIds', 'mutation { updateItem(id: "item-1", input: { name: "X", vendorIds: ["ven-s"] }) { id } }'],
  ['createTag typeId', 'mutation { createTag(name: "X", typeId: "tt-s") { id } }'],
  ['createTag parentId', 'mutation { createTag(name: "X", typeId: "tt-1", parentId: "tag-s") { id } }'],
  ['updateTag typeId', 'mutation { updateTag(id: "tag-1b", name: "X", typeId: "tt-s") { id } }'],
  ['updateTag parentId', 'mutation { updateTag(id: "tag-1b", name: "X", parentId: "tag-s") { id } }'],
  ['createRecipe items', 'mutation { createRecipe(name: "X", items: [{ itemId: "item-s", defaultAmount: 1 }]) { id } }'],
  ['updateRecipe items', 'mutation { updateRecipe(id: "rec-1", name: "X", items: [{ itemId: "item-s", defaultAmount: 1 }]) { id } }'],
  ['createShelf itemIds', 'mutation { createShelf(name: "X", type: "selection", itemIds: ["item-s"]) { id } }'],
  ['createShelf filterConfig.tagIds', 'mutation { createShelf(name: "X", type: "filter", filterConfig: { tagIds: ["tag-s"] }) { id } }'],
  ['createShelf filterConfig.vendorIds', 'mutation { createShelf(name: "X", type: "filter", filterConfig: { vendorIds: ["ven-s"] }) { id } }'],
  ['createShelf filterConfig.recipeIds', 'mutation { createShelf(name: "X", type: "filter", filterConfig: { recipeIds: ["rec-s"] }) { id } }'],
  ['updateShelf itemIds', 'mutation { updateShelf(id: "sh-1", name: "X", itemIds: ["item-s"]) { id } }'],
  ['updateShelf filterConfig', 'mutation { updateShelf(id: "sh-1", name: "X", filterConfig: { tagIds: ["tag-s"] }) { id } }'],
  ['reorderShelfItems', 'mutation { reorderShelfItems(shelfId: "sh-1", orderedItemIds: ["item-1", "item-s"]) }'],
  [
    'applyShelfFilterPicks addTagIds',
    'mutation { applyShelfFilterPicks(input: { itemId: "item-1", addTagIds: ["tag-s"], addVendorIds: [], addRecipeId: null }) { id } }',
  ],
  [
    'applyShelfFilterPicks addVendorIds',
    'mutation { applyShelfFilterPicks(input: { itemId: "item-1", addTagIds: [], addVendorIds: ["ven-s"], addRecipeId: null }) { id } }',
  ],
  [
    'applyShelfFilterPicks addRecipeId',
    'mutation { applyShelfFilterPicks(input: { itemId: "item-1", addTagIds: [], addVendorIds: [], addRecipeId: "rec-s" }) { id } }',
  ],
]

describe("issue #273: a write cannot attach another household's id", () => {
  it.each(STRANGER_ID)('%s is FORBIDDEN, and changes nothing', async (_name, query) => {
    seed('manager')
    const before = handles.$snapshot()

    const result = await exec(query)

    expect(codeOf(result)).toBe('FORBIDDEN')
    expect(handles.$snapshot()).toEqual(before)
  })

  it('an id no row holds is BAD_USER_INPUT on a foreign-key reference', async () => {
    seed('manager')
    const before = handles.$snapshot()

    const result = await exec('mutation { createItem(input: { name: "X", tagIds: ["tag-gone"] }) { id } }')

    expect(codeOf(result)).toBe('BAD_USER_INPUT')
    expect(handles.$snapshot()).toEqual(before)
  })

  it("a shelf may still name an item no row holds, as it always could", async () => {
    // A shelf's `itemIds` is a plain array, not a foreign key, and nothing
    // removes a deleted item from it. Refusing the id would refuse the user's
    // own edit of a shelf that names a deleted item.
    seed('manager')

    const result = await exec('mutation { updateShelf(id: "sh-1", name: "X", itemIds: ["item-1", "item-gone"]) { id } }')

    expect(result.errors).toBeUndefined()
    expect(S.shelf.state.rows.find((r) => r.id === 'sh-1')?.itemIds).toEqual(['item-1', 'item-gone'])
  })
})
