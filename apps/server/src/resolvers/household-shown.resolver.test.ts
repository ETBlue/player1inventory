import { ApolloServer } from '@apollo/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'
import type { HouseholdWorld } from '../test/householdWorld.js'

// The stale tab of owner decision O21 (households H7 task L.1, decisions T66
// and T67). A tab sends the household it shows in `x-household-id`, which
// becomes `ctx.shownHouseholdId`. When the person acts in ANOTHER household
// now, `requireHousehold` refuses with `HOUSEHOLD_CHANGED`, so the tab can no
// longer read or write the other household. The `household` query is the one
// field that answers anyway, because the web needs the true household to
// recover.
//
// Every field below goes through the real executable schema, so the test
// does not depend on which helper a resolver calls: `createTag`, `items` and
// `bulkCreateItems` reach `requireHousehold` through `requireCatalogRole`;
// `createLocation` and `clearAllData` call it directly.
//
// ── THE FIXTURE ──
//
// | Person | hh_a   | hh_b   | Location roles               | Active household |
// |--------|--------|--------|------------------------------|------------------|
// | PAT    | owner  | owner  | LOC_A, LOC_B: organizer      | hh_b             |
// | ANN    | owner  | —      | LOC_A: organizer             | hh_a             |
//
// PAT owns BOTH households, so every field below would succeed in either one.
// Only the shown-household check can refuse it. ANN keeps hh_a non-empty when
// PAT leaves it.
//
// Every refusal checks BOTH households' stores, so a write that went to the
// wrong household is seen as well as a write that went to the right one.

vi.mock('../lib/prisma.js', async () => {
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { runInTransaction } = await import('../test/stockFake.js')

  const world = createHouseholdWorld()
  const catalog = { scope: 'householdId' as const }

  const items = createOwnedRowFake<{ id: string; householdId: string; name: string }>({
    model: 'Item',
    ...catalog,
    relations: () => ({ tags: [], vendors: [] }),
  })
  const tags = createOwnedRowFake<{ id: string; householdId: string; name: string; typeId: string }>({
    model: 'Tag',
    columns: ['typeId', 'parentId'],
    ...catalog,
  })
  const tagTypes = createOwnedRowFake<{ id: string; householdId: string; name: string }>({
    model: 'TagType',
    ...catalog,
  })
  const recipes = createOwnedRowFake<{ id: string; householdId: string; name: string }>({ model: 'Recipe', ...catalog })
  const vendors = createOwnedRowFake<{ id: string; householdId: string; name: string }>({ model: 'Vendor', ...catalog })
  const shelves = createOwnedRowFake<{ id: string; householdId: string; name: string }>({ model: 'Shelf', ...catalog })

  // The models `deleteHouseholdData` deletes by a RELATION filter, which the
  // stores above do not model. This file has no rows of them, so each only
  // records that it was called. `clearAllData`'s own filters are pinned in
  // clearAllData.resolver.test.ts.
  const deleteCalls: string[] = []
  const recorder = (model: string) => ({
    deleteMany: async () => {
      deleteCalls.push(model)
      return { count: 0 }
    },
  })
  const junction = (model: string) => ({
    ...recorder(model),
    createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }),
  })

  const client: Record<string, unknown> = {
    ...world.client,
    item: {
      ...items.client,
      // Prisma fills this; `ownedRowFake` does not, and `toGraphQL` reads it.
      create: async (args: { data: Record<string, unknown> }) =>
        items.client.create({ ...args, data: { consumeAmount: 1, ...args.data } }),
    },
    tag: tags.client,
    tagType: tagTypes.client,
    recipe: recipes.client,
    vendor: vendors.client,
    shelf: shelves.client,
    itemTag: junction('itemTag'),
    itemVendor: junction('itemVendor'),
    recipeItem: junction('recipeItem'),
    inventoryLog: recorder('inventoryLog'),
    cart: recorder('cart'),
    cartItem: recorder('cartItem'),
  }
  const stores = [
    world.users.state,
    world.households.state,
    world.stock.state,
    items.state,
    tags.state,
    tagTypes.state,
    recipes.state,
    vendors.state,
    shelves.state,
  ] as unknown as Record<string, unknown>[]
  client.$transaction = (arg: unknown) => runInTransaction(stores, client, arg)

  return {
    prisma: {
      ...client,
      $world: world,
      $stores: { items, tags, tagTypes },
      $all: stores,
      $deleteCalls: deleteCalls,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'

type Rows = { state: { rows: Record<string, unknown>[] }; reset: (rows?: never[]) => void }
const handles = prisma as unknown as {
  $world: HouseholdWorld
  $stores: { items: Rows; tags: Rows; tagTypes: Rows }
  $all: Record<string, unknown>[]
  $deleteCalls: string[]
}
const world = handles.$world
const S = handles.$stores

const PAT = 'user_pat'
const ANN = 'user_ann'
const HH_A = 'hh_a'
const HH_B = 'hh_b'
const LOC_A = 'loc_a'
const LOC_B = 'loc_b'
const T = new Date('2026-01-01T00:00:00.000Z')

function seed() {
  world.reset()
  world.stock.reset(
    [
      { id: LOC_A, householdId: HH_A, name: 'Kitchen A', order: 0 },
      { id: LOC_B, householdId: HH_B, name: 'Kitchen B', order: 0 },
    ],
    [],
  )
  world.seedHouseholds({
    households: [householdRow(HH_A, ANN), householdRow(HH_B, PAT)],
    householdMembers: [
      householdMemberRow(HH_A, ANN, 'owner'),
      householdMemberRow(HH_A, PAT, 'owner'),
      householdMemberRow(HH_B, PAT, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_A, ANN, 'organizer'),
      locationMemberRow(LOC_A, PAT, 'organizer'),
      locationMemberRow(LOC_B, PAT, 'organizer'),
    ],
  })
  world.setActiveHousehold(PAT, HH_B)
  world.setActiveHousehold(ANN, HH_A)
  S.items.reset([
    { id: 'item_a', householdId: HH_A, name: 'Milk', consumeAmount: 1, createdAt: T, updatedAt: T },
    { id: 'item_b', householdId: HH_B, name: 'Tea', consumeAmount: 1, createdAt: T, updatedAt: T },
  ] as never[])
  S.tagTypes.reset([
    { id: 'tt_a', householdId: HH_A, name: 'Kind A', color: 'blue' },
    { id: 'tt_b', householdId: HH_B, name: 'Kind B', color: 'red' },
  ] as never[])
  S.tags.reset([] as never[])
  handles.$deleteCalls.length = 0
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

/** Run as PAT. `shown` is the `x-household-id` the tab sends; `undefined` sends none. */
async function run(query: string, variables: Record<string, unknown>, shown: string | undefined) {
  const contextValue: Context = { userId: PAT, requestCache: {}, shownHouseholdId: shown }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

function codeOf(res: { errors?: ReadonlyArray<{ extensions?: Record<string, unknown> }> }) {
  return res.errors?.[0]?.extensions?.code
}

const ISO = '2026-01-01T00:00:00.000Z'

const CREATE_TAG = /* GraphQL */ `
  mutation ($typeId: String!) {
    createTag(name: "Dairy", typeId: $typeId) { id }
  }
`
const ITEMS = /* GraphQL */ `
  query { items { id } }
`
const CREATE_LOCATION = /* GraphQL */ `
  mutation { createLocation(name: "Garage") { id } }
`
const BULK_CREATE_ITEMS = /* GraphQL */ `
  mutation ($items: [ItemInput!]!) { bulkCreateItems(items: $items) { id } }
`
const CLEAR_ALL_DATA = /* GraphQL */ `
  mutation { clearAllData }
`
const HOUSEHOLD = /* GraphQL */ `
  query { household { id role } }
`

const newItem = {
  id: 'item_new',
  name: 'Bread',
  tagIds: [],
  targetUnit: 'package',
  consumeAmount: 1,
  createdAt: ISO,
  updatedAt: ISO,
}

const tagsIn = (householdId: string) => S.tags.state.rows.filter((r) => r.householdId === householdId)
const itemIdsIn = (householdId: string) =>
  S.items.state.rows.filter((r) => r.householdId === householdId).map((r) => r.id)
const locationsIn = (householdId: string) =>
  world.stock.state.locations.filter((l) => l.householdId === householdId).map((l) => l.id)

describe('a tab that shows another household (header hh_a, PAT acts in hh_b)', () => {
  it('createTag is refused, and neither household gets a tag', async () => {
    const before = snapshot()

    const res = await run(CREATE_TAG, { typeId: 'tt_b' }, HH_A)

    expect(codeOf(res)).toBe('HOUSEHOLD_CHANGED')
    expect(tagsIn(HH_A)).toEqual([])
    expect(tagsIn(HH_B)).toEqual([])
    expect(snapshot()).toBe(before)
  })

  it('items is refused', async () => {
    const res = await run(ITEMS, {}, HH_A)

    expect(codeOf(res)).toBe('HOUSEHOLD_CHANGED')
    expect(res.data?.items ?? null).toBeNull()
  })

  it('createLocation is refused, and no location is written', async () => {
    const before = snapshot()

    const res = await run(CREATE_LOCATION, {}, HH_A)

    expect(codeOf(res)).toBe('HOUSEHOLD_CHANGED')
    expect(locationsIn(HH_A)).toEqual([LOC_A])
    expect(locationsIn(HH_B)).toEqual([LOC_B])
    expect(snapshot()).toBe(before)
  })

  it('bulkCreateItems is refused, and writes nothing', async () => {
    const before = snapshot()

    const res = await run(BULK_CREATE_ITEMS, { items: [newItem] }, HH_A)

    expect(codeOf(res)).toBe('HOUSEHOLD_CHANGED')
    expect(itemIdsIn(HH_A)).toEqual(['item_a'])
    expect(itemIdsIn(HH_B)).toEqual(['item_b'])
    expect(snapshot()).toBe(before)
  })

  it('clearAllData is refused, and deletes nothing', async () => {
    const before = snapshot()

    const res = await run(CLEAR_ALL_DATA, {}, HH_A)

    expect(codeOf(res)).toBe('HOUSEHOLD_CHANGED')
    expect(handles.$deleteCalls).toEqual([])
    expect(itemIdsIn(HH_A)).toEqual(['item_a'])
    expect(itemIdsIn(HH_B)).toEqual(['item_b'])
    expect(snapshot()).toBe(before)
  })

  it('the household query answers the household PAT acts in', async () => {
    const res = await run(HOUSEHOLD, {}, HH_A)

    expect(res.errors).toBeUndefined()
    expect(res.data?.household).toEqual({ id: HH_B, role: 'owner' })
  })
})

describe('a tab that shows the household PAT acts in (header hh_b)', () => {
  it('createTag writes the tag into hh_b only', async () => {
    const res = await run(CREATE_TAG, { typeId: 'tt_b' }, HH_B)

    expect(res.errors).toBeUndefined()
    expect(tagsIn(HH_A)).toEqual([])
    expect(tagsIn(HH_B)).toHaveLength(1)
  })

  it('items answers hh_b', async () => {
    const res = await run(ITEMS, {}, HH_B)

    expect(res.errors).toBeUndefined()
    expect(res.data?.items).toEqual([{ id: 'item_b' }])
  })

  it('createLocation writes into hh_b only', async () => {
    const res = await run(CREATE_LOCATION, {}, HH_B)

    expect(res.errors).toBeUndefined()
    expect(locationsIn(HH_A)).toEqual([LOC_A])
    expect(locationsIn(HH_B)).toHaveLength(2)
  })

  it('bulkCreateItems writes into hh_b only', async () => {
    const res = await run(BULK_CREATE_ITEMS, { items: [newItem] }, HH_B)

    expect(res.errors).toBeUndefined()
    expect(itemIdsIn(HH_A)).toEqual(['item_a'])
    expect(itemIdsIn(HH_B).sort()).toEqual(['item_b', 'item_new'])
  })

  it('clearAllData clears hh_b only', async () => {
    const res = await run(CLEAR_ALL_DATA, {}, HH_B)

    expect(res.errors).toBeUndefined()
    expect(itemIdsIn(HH_A)).toEqual(['item_a'])
    expect(itemIdsIn(HH_B)).toEqual([])
    expect(locationsIn(HH_A)).toEqual([LOC_A])
  })

  it('the household query answers hh_b', async () => {
    const res = await run(HOUSEHOLD, {}, HH_B)

    expect(res.data?.household).toEqual({ id: HH_B, role: 'owner' })
  })
})

// An old web bundle and `makeGql` in E2E send no header. They keep the
// behaviour from before H7: every field works in the active household.
describe('a request with no x-household-id (an old bundle)', () => {
  it('createTag writes into hh_b only', async () => {
    const res = await run(CREATE_TAG, { typeId: 'tt_b' }, undefined)

    expect(res.errors).toBeUndefined()
    expect(tagsIn(HH_A)).toEqual([])
    expect(tagsIn(HH_B)).toHaveLength(1)
  })

  it('items answers hh_b', async () => {
    const res = await run(ITEMS, {}, undefined)

    expect(res.data?.items).toEqual([{ id: 'item_b' }])
  })

  it('createLocation writes into hh_b only', async () => {
    const res = await run(CREATE_LOCATION, {}, undefined)

    expect(res.errors).toBeUndefined()
    expect(locationsIn(HH_A)).toEqual([LOC_A])
    expect(locationsIn(HH_B)).toHaveLength(2)
  })

  it('bulkCreateItems writes into hh_b only', async () => {
    const res = await run(BULK_CREATE_ITEMS, { items: [newItem] }, undefined)

    expect(res.errors).toBeUndefined()
    expect(itemIdsIn(HH_A)).toEqual(['item_a'])
    expect(itemIdsIn(HH_B).sort()).toEqual(['item_b', 'item_new'])
  })

  it('clearAllData clears hh_b only', async () => {
    const res = await run(CLEAR_ALL_DATA, {}, undefined)

    expect(res.errors).toBeUndefined()
    expect(itemIdsIn(HH_A)).toEqual(['item_a'])
    expect(itemIdsIn(HH_B)).toEqual([])
  })

  it('the household query answers hh_b', async () => {
    const res = await run(HOUSEHOLD, {}, undefined)

    expect(res.data?.household).toEqual({ id: HH_B, role: 'owner' })
  })
})

describe('owner decision O21: a person who LEFT the household the tab shows', () => {
  it('createTag is refused, and neither household gets a tag', async () => {
    // Given PAT left hh_a and is a member of hh_b only
    world.households.state.householdMembers = world.households.state.householdMembers.filter(
      (m) => !(m.householdId === HH_A && m.userId === PAT),
    )
    world.households.state.locationMembers = world.households.state.locationMembers.filter(
      (m) => !(m.locationId === LOC_A && m.userId === PAT),
    )
    const before = snapshot()

    // When a tab that still shows hh_a creates a tag
    const res = await run(CREATE_TAG, { typeId: 'tt_b' }, HH_A)

    // Then it is refused, and nothing is written in either household
    expect(codeOf(res)).toBe('HOUSEHOLD_CHANGED')
    expect(tagsIn(HH_A)).toEqual([])
    expect(tagsIn(HH_B)).toEqual([])
    expect(snapshot()).toBe(before)
  })
})
