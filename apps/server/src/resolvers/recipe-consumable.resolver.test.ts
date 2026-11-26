import { ApolloServer } from '@apollo/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── What this file covers ───────────────────────────────────────────────────
//
// Only consumable items can be in a recipe (owner decision 2026-11-26,
// `lib/consumable.ts`). The catalog writes that touch `RecipeItem`:
//
// | Write | A non-consumable item |
// |---|---|
// | `createRecipe`, `updateRecipe`, `applyShelfFilterPicks` | refused, `NOT_CONSUMABLE`, nothing written |
// | `bulkCreateRecipes`, `bulkUpsertRecipes` | skipped, the recipe lands |
// | `updateItem`, `bulkUpsertItems` turning an item off | its links are deleted |
//
// `consumeRecipes` is in `recipe-consume.resolver.test.ts` and `applyUnitSwitch`
// in `applyUnitSwitch.resolver.test.ts`: both need the stock fakes.
//
// ─── The fake ────────────────────────────────────────────────────────────────
//
// `item` and `recipe` are `ownedRowFake` stores. `recipeItem` is a small
// stateful junction store that THROWS on a `where` key it does not know, so a
// resolver that drops `itemId` from its delete cannot pass by deleting
// everything. `$transaction` is the shared `runInTransaction`, over all three
// stores, so a refusal inside a transaction is seen to roll back.
//
// The fixture has two items of each kind and two recipes, so a resolver that
// deletes every link, or the links of the wrong item, gives a different store.
vi.mock('../lib/prisma.js', async () => {
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const { createHouseholdFake } = await import('../test/householdFake.js')
  const { runInTransaction } = await import('../test/stockFake.js')
  const T = new Date('2026-11-01T00:00:00.000Z')
  const households = createHouseholdFake({
    householdMembers: [{ householdId: 'hh_mine', userId: 'user_rc', role: 'owner', joinedAt: T }],
  })
  const catalog = { scope: 'householdId' as const }

  type Link = { recipeId: string; itemId: string; defaultAmount: number }
  const links: { rows: Link[] } = { rows: [] }
  const KNOWN = ['recipeId', 'itemId']
  const matches = (row: Link, where: Record<string, unknown> = {}) => {
    for (const key of Object.keys(where)) {
      if (!KNOWN.includes(key)) throw new Error(`recipeItem fake: unknown where key "${key}"`)
    }
    return Object.entries(where).every(
      ([k, v]) => v === undefined || row[k as keyof Link] === v,
    )
  }
  const recipeItem = {
    findMany: async (args: { where?: Record<string, unknown> } = {}) =>
      links.rows.filter((r) => matches(r, args.where)).map((r) => ({ ...r })),
    create: async ({ data }: { data: Link }) => {
      if (links.rows.some((r) => r.recipeId === data.recipeId && r.itemId === data.itemId)) {
        throw Object.assign(new Error('Unique constraint failed — RecipeItem'), { code: 'P2002' })
      }
      links.rows.push({ ...data })
      return { ...data }
    },
    createMany: async ({ data, skipDuplicates }: { data: Link[]; skipDuplicates?: boolean }) => {
      let count = 0
      for (const row of data) {
        if (links.rows.some((r) => r.recipeId === row.recipeId && r.itemId === row.itemId)) {
          if (skipDuplicates) continue
          throw Object.assign(new Error('Unique constraint failed — RecipeItem'), { code: 'P2002' })
        }
        links.rows.push({ ...row })
        count++
      }
      return { count }
    },
    deleteMany: async (args: { where?: Record<string, unknown> } = {}) => {
      const before = links.rows.length
      links.rows = links.rows.filter((r) => !matches(r, args.where))
      return { count: before - links.rows.length }
    },
  }

  const junction = () => ({
    createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }),
    deleteMany: async () => ({ count: 0 }),
  })

  const item = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    targetUnit: string
    consumeAmount: number
    expirationMode: string
    consumable: boolean
    createdAt: Date
    updatedAt: Date
  }>({ model: 'Item', ...catalog, relations: () => ({ tags: [], vendors: [] }) })
  const recipe = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    lastCookedAt: Date | null
  }>({
    model: 'Recipe',
    ...catalog,
    relations: (row) => ({ items: links.rows.filter((r) => r.recipeId === row.id) }),
  })
  const tag = createOwnedRowFake<{ id: string; householdId: string; userId: string }>({ model: 'Tag', ...catalog })
  const vendor = createOwnedRowFake<{ id: string; householdId: string; userId: string }>({
    model: 'Vendor',
    ...catalog,
  })

  const client: Record<string, unknown> = {
    user: (await import('../test/userFake.js')).createUserFake([], {
      householdMembers: () => households.state.householdMembers,
      rowForEveryMember: true,
    }).client,
    householdMember: households.client.householdMember,
    item: item.client,
    recipe: recipe.client,
    recipeItem,
    tag: tag.client,
    vendor: vendor.client,
    itemTag: junction(),
    itemVendor: junction(),
    $item: item,
    $recipe: recipe,
    $links: links,
  }
  client.$transaction = (arg: unknown) =>
    runInTransaction(
      [item.state, recipe.state, links] as unknown as Parameters<typeof runInTransaction>[0],
      client,
      arg,
    )
  return { prisma: client }
})

import { prisma } from '../lib/prisma.js'
import type { OwnedRowFake } from '../test/ownedRowFake.js'

type ItemRow = {
  id: string
  householdId: string
  userId: string
  name: string
  targetUnit: string
  consumeAmount: number
  expirationMode: string
  consumable: boolean
  createdAt: Date
  updatedAt: Date
}
type RecipeRow = { id: string; householdId: string; userId: string; name: string; lastCookedAt: Date | null }
type Link = { recipeId: string; itemId: string; defaultAmount: number }

const mockPrisma = prisma as unknown as {
  $item: OwnedRowFake<ItemRow>
  $recipe: OwnedRowFake<RecipeRow>
  $links: { rows: Link[] }
}

let server: ApolloServer<Context>

beforeAll(async () => {
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

const USER = 'user_rc'
const HH = 'hh_mine'
const TS = new Date('2026-01-01T00:00:00.000Z')

const FLOUR = 'item_flour' // consumable
const EGGS = 'item_eggs' // consumable
const CUPS = 'item_cups' // not consumable
const PAN = 'item_pan' // not consumable
const CAKE = 'recipe_cake'
const SOUP = 'recipe_soup'

const itemRow = (id: string, consumable: boolean): ItemRow => ({
  id,
  householdId: HH,
  userId: USER,
  name: id,
  targetUnit: 'package',
  consumeAmount: 1,
  expirationMode: 'disabled',
  consumable,
  createdAt: TS,
  updatedAt: TS,
})
const recipeRow = (id: string): RecipeRow => ({ id, householdId: HH, userId: USER, name: id, lastCookedAt: null })

beforeEach(() => {
  vi.resetAllMocks()
  mockPrisma.$item.reset([itemRow(FLOUR, true), itemRow(EGGS, true), itemRow(CUPS, false), itemRow(PAN, false)])
  mockPrisma.$recipe.reset([recipeRow(CAKE), recipeRow(SOUP)])
  // CAKE holds FLOUR and an old link to PAN (made before the rule). SOUP
  // holds FLOUR and EGGS.
  mockPrisma.$links.rows = [
    { recipeId: CAKE, itemId: FLOUR, defaultAmount: 1 },
    { recipeId: CAKE, itemId: PAN, defaultAmount: 1 },
    { recipeId: SOUP, itemId: FLOUR, defaultAmount: 2 },
    { recipeId: SOUP, itemId: EGGS, defaultAmount: 3 },
  ]
})

async function exec(query: string, variables: Record<string, unknown> = {}) {
  const response = await server.executeOperation({ query, variables }, { contextValue: { userId: USER } })
  if (response.body.kind !== 'single') throw new Error('expected a single result')
  return response.body.singleResult
}

const linksOf = (recipeId: string) =>
  mockPrisma.$links.rows
    .filter((r) => r.recipeId === recipeId)
    .map((r) => r.itemId)
    .sort()
const allLinks = () =>
  mockPrisma.$links.rows.map((r) => `${r.recipeId}:${r.itemId}`).sort()

function expectNotConsumable(result: Awaited<ReturnType<typeof exec>>) {
  expect(result.errors?.[0]?.extensions).toMatchObject({
    code: 'BAD_USER_INPUT',
    reason: 'NOT_CONSUMABLE',
  })
}

const CREATE_RECIPE = `mutation ($name: String!, $items: [RecipeItemInput!]) { createRecipe(name: $name, items: $items) { id } }`
const UPDATE_RECIPE = `mutation ($id: ID!, $items: [RecipeItemInput!]) { updateRecipe(id: $id, items: $items) { id } }`
const PICKS = `mutation ($input: ApplyShelfFilterPicksInput!) { applyShelfFilterPicks(input: $input) { id } }`
const UPDATE_ITEM = `mutation ($id: ID!, $input: UpdateItemInput!) { updateItem(id: $id, input: $input) { id consumable } }`
const BULK_CREATE_RECIPES = `mutation ($recipes: [RecipeInput!]!) { bulkCreateRecipes(recipes: $recipes) { id } }`
const BULK_UPSERT_RECIPES = `mutation ($recipes: [RecipeInput!]!) { bulkUpsertRecipes(recipes: $recipes) { id } }`
const BULK_UPSERT_ITEMS = `mutation ($items: [ItemInput!]!) { bulkUpsertItems(items: $items) { id consumable } }`

describe('createRecipe and non-consumable items', () => {
  it('user cannot create a recipe with a non-consumable item', async () => {
    // When the user creates a recipe with one consumable and one non-consumable item
    const result = await exec(CREATE_RECIPE, {
      name: 'Tea',
      items: [
        { itemId: FLOUR, defaultAmount: 1 },
        { itemId: CUPS, defaultAmount: 1 },
      ],
    })

    // Then it is refused, and no recipe and no link is written
    expectNotConsumable(result)
    expect(mockPrisma.$recipe.state.rows).toHaveLength(2)
    expect(mockPrisma.$links.rows).toHaveLength(4)
  })

  it('user can create a recipe with consumable items', async () => {
    const result = await exec(CREATE_RECIPE, {
      name: 'Bread',
      items: [{ itemId: FLOUR, defaultAmount: 1 }],
    })

    expect(result.errors).toBeUndefined()
    const { id } = result.data?.createRecipe as { id: string }
    expect(linksOf(id)).toEqual([FLOUR])
  })
})

describe('updateRecipe and non-consumable items', () => {
  it('user cannot add a non-consumable item to a recipe', async () => {
    // Given SOUP holds FLOUR and EGGS
    // When the user adds CUPS, which is not consumable
    const result = await exec(UPDATE_RECIPE, {
      id: SOUP,
      items: [
        { itemId: FLOUR, defaultAmount: 2 },
        { itemId: EGGS, defaultAmount: 3 },
        { itemId: CUPS, defaultAmount: 1 },
      ],
    })

    // Then it is refused, and SOUP keeps its two links
    expectNotConsumable(result)
    expect(linksOf(SOUP)).toEqual([EGGS, FLOUR])
  })

  it('user editing a recipe that holds an old link to a non-consumable item is not refused', async () => {
    // Given CAKE holds an old link to PAN, made before the rule
    // When the user changes FLOUR's amount and the list still names PAN
    const result = await exec(UPDATE_RECIPE, {
      id: CAKE,
      items: [
        { itemId: FLOUR, defaultAmount: 4 },
        { itemId: PAN, defaultAmount: 1 },
      ],
    })

    // Then the save works: PAN is not newly attached
    expect(result.errors).toBeUndefined()
    expect(linksOf(CAKE)).toEqual([FLOUR, PAN])
  })

  it('user can still remove an old link to a non-consumable item', async () => {
    const result = await exec(UPDATE_RECIPE, { id: CAKE, items: [{ itemId: FLOUR, defaultAmount: 1 }] })

    expect(result.errors).toBeUndefined()
    expect(linksOf(CAKE)).toEqual([FLOUR])
  })
})

describe('applyShelfFilterPicks and non-consumable items', () => {
  it('user cannot join a non-consumable item to a filter shelf through its recipe axis', async () => {
    const result = await exec(PICKS, {
      input: { itemId: CUPS, addTagIds: [], addVendorIds: [], addRecipeId: SOUP },
    })

    expectNotConsumable(result)
    expect(linksOf(SOUP)).toEqual([EGGS, FLOUR])
  })

  it('a consumable item still joins through the recipe axis', async () => {
    // Negative control for the refusal above: the same call with a
    // consumable item writes the link.
    await exec(UPDATE_RECIPE, { id: SOUP, items: [{ itemId: FLOUR, defaultAmount: 2 }] })
    const result = await exec(PICKS, {
      input: { itemId: EGGS, addTagIds: [], addVendorIds: [], addRecipeId: SOUP },
    })

    expect(result.errors).toBeUndefined()
    expect(linksOf(SOUP)).toEqual([EGGS, FLOUR])
  })
})

describe('updateItem turning an item non-consumable', () => {
  it('user who turns Consumable off removes the item from every recipe', async () => {
    // Given FLOUR is in CAKE and SOUP
    // When the user makes FLOUR non-consumable
    const result = await exec(UPDATE_ITEM, { id: FLOUR, input: { consumable: false } })

    // Then FLOUR's links are gone, and every other link stays
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$item.state.rows.find((r) => r.id === FLOUR)?.consumable).toBe(false)
    expect(allLinks()).toEqual([`${CAKE}:${PAN}`, `${SOUP}:${EGGS}`])
  })

  it('a save that leaves Consumable on keeps the recipe links', async () => {
    // Negative control: a rename deletes nothing
    const result = await exec(UPDATE_ITEM, { id: FLOUR, input: { name: 'Rye flour' } })

    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$links.rows).toHaveLength(4)
  })

  it('the item write and the link delete roll back together', async () => {
    // A failing link delete must not leave the item non-consumable: they are
    // one transaction.
    const links = (prisma as unknown as { recipeItem: { deleteMany: unknown } }).recipeItem
    const real = links.deleteMany
    links.deleteMany = async () => {
      throw new Error('boom')
    }
    try {
      const result = await exec(UPDATE_ITEM, { id: FLOUR, input: { consumable: false } })
      expect(result.errors).toBeDefined()
    } finally {
      links.deleteMany = real
    }
    expect(mockPrisma.$item.state.rows.find((r) => r.id === FLOUR)?.consumable).toBe(true)
    expect(mockPrisma.$links.rows).toHaveLength(4)
  })
})

describe('imports and non-consumable items', () => {
  const recipeIn = (id: string, itemIds: string[]) => ({
    id,
    name: id,
    items: itemIds.map((itemId) => ({ itemId, defaultAmount: 1 })),
  })

  it('user importing a recipe that names a non-consumable item gets the recipe without it', async () => {
    const result = await exec(BULK_CREATE_RECIPES, { recipes: [recipeIn('recipe_new', [FLOUR, CUPS])] })

    // Skipped, not refused: the recipe lands with its consumable item
    expect(result.errors).toBeUndefined()
    expect(linksOf('recipe_new')).toEqual([FLOUR])
  })

  it('user replacing a recipe that names a non-consumable item gets the recipe without it', async () => {
    const result = await exec(BULK_UPSERT_RECIPES, { recipes: [recipeIn(SOUP, [EGGS, CUPS])] })

    expect(result.errors).toBeUndefined()
    expect(linksOf(SOUP)).toEqual([EGGS])
  })

  it('user replacing an item with a non-consumable one removes it from every recipe', async () => {
    const result = await exec(BULK_UPSERT_ITEMS, {
      items: [
        {
          id: FLOUR,
          name: 'flour',
          tagIds: [],
          targetUnit: 'package',
          consumeAmount: 1,
          consumable: false,
          createdAt: '2026-02-03T04:05:06.000Z',
          updatedAt: '2026-03-04T05:06:07.000Z',
        },
      ],
    })

    expect(result.errors).toBeUndefined()
    expect(allLinks()).toEqual([`${CAKE}:${PAN}`, `${SOUP}:${EGGS}`])
  })
})
