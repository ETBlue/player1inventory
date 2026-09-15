import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

// `recipe` / `recipeItem` / `item` / `inventoryLog` are plain `vi.fn()` call
// recorders. `location` and `itemStock` are the stateful fake
// (src/test/stockFake.ts): consumeRecipes' PR-2 dual-write is an end state, and
// the fake models `@@unique([itemId, locationId])` and Prisma's `where`
// semantics so a resolver that dropped the scope cannot stay green.
vi.mock('../lib/prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const stockFake = createStockFake()
  return {
    prisma: {
      recipe: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
      },
      recipeItem: {
        count: vi.fn(),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      item: {
        updateMany: vi.fn(),
      },
      inventoryLog: {
        create: vi.fn(),
      },
      ...stockFake.client,
      // Hung off the client because a `vi.mock` factory is hoisted above every
      // import and cannot close over a module-scope binding.
      $stockFake: stockFake,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import { makeStock, type StockFake } from '../test/stockFake.js'

const mockPrisma = prisma as unknown as {
  recipe: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    findUniqueOrThrow: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  recipeItem: {
    count: ReturnType<typeof vi.fn>
    createMany: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  item: {
    updateMany: ReturnType<typeof vi.fn>
  }
  inventoryLog: {
    create: ReturnType<typeof vi.fn>
  }
  $stockFake: StockFake
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRecipe(overrides: Partial<{
  id: string
  name: string
  userId: string
  items: { itemId: string; defaultAmount: number }[]
  lastCookedAt: Date | null
}> = {}) {
  return {
    id: overrides.id ?? 'recipe_1',
    name: overrides.name ?? 'Pancakes',
    userId: overrides.userId ?? 'user_test123',
    lastCookedAt: overrides.lastCookedAt ?? null,
    items: overrides.items ?? [],
  }
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let server: ApolloServer<Context>
const ctx: Context = { userId: 'user_test123' }

// TWO locations for the cooking user, plus one belonging to somebody else that
// is ALSO flagged isDefault. A single-location fixture cannot tell "writes the
// caller's default location" apart from "writes the first default it finds".
const LOC_DEFAULT = 'loc_kitchen'
const LOC_OTHER = 'loc_garage'
const LOC_STRANGER = 'loc_theirs'

const stockFake = mockPrisma.$stockFake

beforeEach(async () => {
  vi.clearAllMocks()
  stockFake.reset(
    [
      // The default is deliberately not first: a lookup that took locations[0]
      // rather than the isDefault row would otherwise pass by coincidence.
      { id: LOC_OTHER, userId: 'user_test123', isDefault: false },
      { id: LOC_DEFAULT, userId: 'user_test123', isDefault: true },
      { id: LOC_STRANGER, userId: 'user_other', isDefault: true },
    ],
    [],
  )
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function execOp(query: string, variables?: Record<string, unknown>, context = ctx) {
  const r = await server.executeOperation({ query, variables }, { contextValue: context })
  return r.body.kind === 'single' ? r.body.singleResult : null
}

// ─── Recipe resolvers ────────────────────────────────────────────────────────

describe('Recipe resolvers', () => {
  it('user can create a recipe via GraphQL', async () => {
    // Given Prisma returns a created recipe with no items
    const recipe = makeRecipe()
    mockPrisma.recipe.create.mockResolvedValue(recipe)
    mockPrisma.recipe.findUniqueOrThrow.mockResolvedValue(recipe)

    // When creating the recipe
    const result = await execOp(
      `mutation CreateRecipe($name: String!) {
        createRecipe(name: $name) { id name userId items { itemId defaultAmount } }
      }`,
      { name: 'Pancakes' },
    )

    // Then recipe is returned with correct fields
    expect(result?.errors).toBeUndefined()
    const created = result?.data?.createRecipe as { id: string; name: string; userId: string; items: unknown[] }
    expect(created.name).toBe('Pancakes')
    expect(created.userId).toBe('user_test123')
    expect(created.id).toBe('recipe_1')
    expect(created.items).toHaveLength(0)
  })

  it('user can create a recipe with items', async () => {
    // Given Prisma returns a created recipe with items
    const recipe = makeRecipe({
      name: 'Omelette',
      items: [
        { itemId: 'item_eggs', defaultAmount: 3 },
        { itemId: 'item_butter', defaultAmount: 0.5 },
      ],
    })
    mockPrisma.recipe.create.mockResolvedValue(recipe)
    mockPrisma.recipeItem.createMany.mockResolvedValue({ count: 2 })
    mockPrisma.recipe.findUniqueOrThrow.mockResolvedValue(recipe)

    // When creating with items
    const result = await execOp(
      `mutation CreateRecipe($name: String!, $items: [RecipeItemInput!]) {
        createRecipe(name: $name, items: $items) { id name items { itemId defaultAmount } }
      }`,
      { name: 'Omelette', items: [{ itemId: 'item_eggs', defaultAmount: 3 }, { itemId: 'item_butter', defaultAmount: 0.5 }] },
    )

    // Then items are returned
    expect(result?.errors).toBeUndefined()
    const created = result?.data?.createRecipe as { items: { itemId: string; defaultAmount: number }[] }
    expect(created.items).toHaveLength(2)
    expect(created.items[0].itemId).toBe('item_eggs')
    expect(created.items[0].defaultAmount).toBe(3)
  })

  it('user can list their recipes', async () => {
    // Given Prisma returns a list of recipes
    const recipes = [makeRecipe(), makeRecipe({ id: 'recipe_2', name: 'Omelette' })]
    mockPrisma.recipe.findMany.mockResolvedValue(recipes)

    // When querying recipes
    const result = await execOp(`query { recipes { id name } }`)

    // Then recipes are returned
    expect(result?.errors).toBeUndefined()
    const list = result?.data?.recipes as { id: string; name: string }[]
    expect(list).toHaveLength(2)
    expect(list[0].name).toBe('Pancakes')
  })

  it('user can get a single recipe by id', async () => {
    // Given Prisma returns a recipe
    const recipe = makeRecipe()
    mockPrisma.recipe.findFirst.mockResolvedValue(recipe)

    // When querying a single recipe
    const result = await execOp(
      `query Recipe($id: ID!) { recipe(id: $id) { id name } }`,
      { id: 'recipe_1' },
    )

    // Then the recipe is returned
    expect(result?.errors).toBeUndefined()
    const found = result?.data?.recipe as { id: string; name: string }
    expect(found.name).toBe('Pancakes')
  })

  it('user can update a recipe name', async () => {
    // Given a recipe exists and update returns updated recipe
    const existing = makeRecipe()
    const updated = makeRecipe({ name: 'New Name' })
    mockPrisma.recipe.findFirst.mockResolvedValue(existing)
    mockPrisma.recipe.update.mockResolvedValue(updated)
    mockPrisma.recipe.findUniqueOrThrow.mockResolvedValue(updated)

    // When updating the name
    const result = await execOp(
      `mutation UpdateRecipe($id: ID!, $name: String) {
        updateRecipe(id: $id, name: $name) { id name }
      }`,
      { id: 'recipe_1', name: 'New Name' },
    )

    // Then updated name is returned
    expect(result?.errors).toBeUndefined()
    expect((result?.data?.updateRecipe as { name: string }).name).toBe('New Name')
  })

  it('user can update recipe items', async () => {
    // Given a recipe exists with original items
    const existing = makeRecipe({ items: [{ itemId: 'item_eggs', defaultAmount: 2 }] })
    const updated = makeRecipe({ items: [{ itemId: 'item_eggs', defaultAmount: 4 }, { itemId: 'item_cheese', defaultAmount: 1 }] })
    mockPrisma.recipe.findFirst.mockResolvedValue(existing)
    mockPrisma.recipe.update.mockResolvedValue(existing)
    mockPrisma.recipeItem.deleteMany.mockResolvedValue({ count: 1 })
    mockPrisma.recipeItem.createMany.mockResolvedValue({ count: 2 })
    mockPrisma.recipe.findUniqueOrThrow.mockResolvedValue(updated)

    // When replacing items
    const result = await execOp(
      `mutation UpdateRecipe($id: ID!, $items: [RecipeItemInput!]) {
        updateRecipe(id: $id, items: $items) { id items { itemId defaultAmount } }
      }`,
      { id: 'recipe_1', items: [{ itemId: 'item_eggs', defaultAmount: 4 }, { itemId: 'item_cheese', defaultAmount: 1 }] },
    )

    // Then new items are returned
    expect(result?.errors).toBeUndefined()
    const items = (result?.data?.updateRecipe as { items: { itemId: string; defaultAmount: number }[] }).items
    expect(items).toHaveLength(2)
    expect(items[0].defaultAmount).toBe(4)
  })

  it('updateRecipe throws NOT_FOUND if recipe does not belong to user', async () => {
    // Given no recipe is found for this user
    mockPrisma.recipe.findFirst.mockResolvedValue(null)

    // When attempting to update
    const result = await execOp(
      `mutation UpdateRecipe($id: ID!, $name: String) {
        updateRecipe(id: $id, name: $name) { id }
      }`,
      { id: 'recipe_99', name: 'Hack' },
    )

    // Then a NOT_FOUND error is returned
    expect(result?.errors).toBeDefined()
    expect(result?.errors![0].extensions?.code).toBe('NOT_FOUND')
  })

  it('user can mark a recipe as last cooked', async () => {
    // Given a recipe exists
    const existing = makeRecipe()
    const now = new Date()
    const updated = makeRecipe({ lastCookedAt: now })
    mockPrisma.recipe.findFirst.mockResolvedValue(existing)
    mockPrisma.recipe.update.mockResolvedValue(updated)

    // When marking as cooked
    const result = await execOp(
      `mutation UpdateRecipeLastCookedAt($id: ID!) {
        updateRecipeLastCookedAt(id: $id) { id lastCookedAt }
      }`,
      { id: 'recipe_1' },
    )

    // Then lastCookedAt is set
    expect(result?.errors).toBeUndefined()
    const lastCookedAt = (result?.data?.updateRecipeLastCookedAt as { lastCookedAt: string }).lastCookedAt
    expect(lastCookedAt).toBeDefined()
    expect(new Date(lastCookedAt).getTime()).toBeGreaterThan(0)
  })

  it('user can delete a recipe', async () => {
    // Given a recipe exists
    const existing = makeRecipe()
    mockPrisma.recipe.findFirst.mockResolvedValue(existing)
    mockPrisma.recipe.delete.mockResolvedValue(existing)

    // When deleting
    const result = await execOp(
      `mutation DeleteRecipe($id: ID!) { deleteRecipe(id: $id) }`,
      { id: 'recipe_1' },
    )

    // Then true is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.deleteRecipe).toBe(true)
  })

  it('deleteRecipe returns false if recipe does not belong to user', async () => {
    // Given no recipe is found for this user
    mockPrisma.recipe.findFirst.mockResolvedValue(null)

    // When attempting to delete
    const result = await execOp(
      `mutation DeleteRecipe($id: ID!) { deleteRecipe(id: $id) }`,
      { id: 'recipe_99' },
    )

    // Then false is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.deleteRecipe).toBe(false)
  })

  it('does not return recipes belonging to another user', async () => {
    // Given Prisma returns empty list for user_B
    mockPrisma.recipe.findMany.mockResolvedValue([])

    // When user_B queries recipes
    const result = await execOp(`query { recipes { id } }`, {}, { userId: 'user_B' })

    // Then no recipes are returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.recipes).toHaveLength(0)
  })

  it('user can get item count for a recipe', async () => {
    // Given prisma.recipeItem.count returns 2 (handled by item resolver)
    mockPrisma.recipeItem.count.mockResolvedValue(2)

    // When querying itemCountByRecipe
    const result = await execOp(
      `query ItemCountByRecipe($recipeId: String!) { itemCountByRecipe(recipeId: $recipeId) }`,
      { recipeId: 'recipe_1' },
    )

    // Then the count is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.itemCountByRecipe).toBe(2)
  })
})

// ─── consumeRecipes ──────────────────────────────────────────────────────────
//
// Two groups, on purpose. The first pins the `Item` half of PR 2's dual-write,
// the second the `ItemStock` half. Deleting either half must turn exactly one
// group red — that pair is what "dual-write" means, and until PR 5 it is what
// keeps a browser on a stale bundle working.

const CONSUME = `mutation Consume($input: ConsumeRecipesInput!) {
  consumeRecipes(input: $input) { allSucceeded itemResults { itemId success } }
}`

function consumeInput(
  items: Array<{
    itemId: string
    packedQuantity: number
    unpackedQuantity: number
    delta: number
    quantity: number
  }>,
  recipeIds: string[] = [],
) {
  return {
    occurredAt: '2026-03-01T12:00:00.000Z',
    recipeIds,
    items,
  }
}

const COOKED_MILK = {
  itemId: 'item_milk',
  packedQuantity: 1,
  unpackedQuantity: 0.5,
  delta: -1.5,
  quantity: 1.5,
}

describe('consumeRecipes writes the Item columns', () => {
  it('user cooking a recipe has each item\'s quantities written and a log recorded', async () => {
    // Given a cook that leaves Milk at 1 packed + 0.5 unpacked
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    mockPrisma.recipe.updateMany.mockResolvedValue({ count: 1 })

    // When the cook is submitted
    const result = await execOp(CONSUME, { input: consumeInput([COOKED_MILK], ['recipe_1']) })

    // Then the Item's own columns were set to those numbers, scoped to the user
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.consumeRecipes).toMatchObject({ allSucceeded: true })
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: 'item_milk', userId: 'user_test123' },
      data: {
        packedQuantity: 1,
        unpackedQuantity: 0.5,
        updatedAt: new Date('2026-03-01T12:00:00.000Z'),
      },
    })
    expect(mockPrisma.inventoryLog.create).toHaveBeenCalledOnce()
  })
})

describe('consumeRecipes dual-writes onto ItemStock', () => {
  function stockAt(locationId: string) {
    return stockFake.state.itemStocks.find(
      (s) => s.itemId === 'item_milk' && s.locationId === locationId,
    )
  }

  beforeEach(() => {
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    mockPrisma.recipe.updateMany.mockResolvedValue({ count: 1 })
  })

  it('user cooking writes the DEFAULT location\'s stock and leaves the others alone', async () => {
    // Given Milk stocked in both of the user's locations and in a stranger's
    stockFake.reset(stockFake.state.locations, [
      makeStock({ id: 'st_default', itemId: 'item_milk', locationId: LOC_DEFAULT, packedQuantity: 3, unpackedQuantity: 1 }),
      makeStock({ id: 'st_other', itemId: 'item_milk', locationId: LOC_OTHER, packedQuantity: 40, unpackedQuantity: 9 }),
      makeStock({ id: 'st_stranger', itemId: 'item_milk', locationId: LOC_STRANGER, packedQuantity: 99, unpackedQuantity: 8 }),
    ])

    // When the user cooks
    const result = await execOp(CONSUME, { input: consumeInput([COOKED_MILK]) })

    // Then only the default location's row carries the post-cooking numbers
    expect(result?.errors).toBeUndefined()
    expect(stockAt(LOC_DEFAULT)).toMatchObject({ packedQuantity: 1, unpackedQuantity: 0.5 })
    // And the other two are untouched — the assertion a one-location fixture
    // could not make
    expect(stockAt(LOC_OTHER)).toMatchObject({ packedQuantity: 40, unpackedQuantity: 9 })
    expect(stockAt(LOC_STRANGER)).toMatchObject({ packedQuantity: 99, unpackedQuantity: 8 })
  })

  it('user cooking an item with no stock row there gets one created at the cooked quantities', async () => {
    // Given the item has no ItemStock anywhere yet
    stockFake.reset(stockFake.state.locations, [])

    // When the user cooks with it
    await execOp(CONSUME, { input: consumeInput([COOKED_MILK]) })

    // Then a single row appears, in the default location, holding exactly the
    // post-cooking values — absolute, not a delta
    expect(stockFake.state.itemStocks).toHaveLength(1)
    expect(stockFake.state.itemStocks[0]).toMatchObject({
      itemId: 'item_milk',
      locationId: LOC_DEFAULT,
      packedQuantity: 1,
      unpackedQuantity: 0.5,
    })
  })

  it('cooking twice sets rather than accumulates, and never duplicates the row', async () => {
    // Given a first cook has already written the row
    stockFake.reset(stockFake.state.locations, [])
    await execOp(CONSUME, { input: consumeInput([COOKED_MILK]) })

    // When a second cook leaves it at 0 packed / 0.25 unpacked
    await execOp(CONSUME, {
      input: consumeInput([
        { ...COOKED_MILK, packedQuantity: 0, unpackedQuantity: 0.25 },
      ]),
    })

    // Then the row holds the SECOND cook's numbers, not their sum — and the
    // @@unique constraint the fake enforces was respected by taking the update
    // branch rather than a second create
    expect(stockFake.state.itemStocks).toHaveLength(1)
    expect(stockAt(LOC_DEFAULT)).toMatchObject({ packedQuantity: 0, unpackedQuantity: 0.25 })
  })

  it('a user with no locations gets one, and the mirror still lands (issue #287)', async () => {
    // Given an account with no Location rows — a brand-new account that has
    // never run the `locations` query. Until issue #287 the mirror returned
    // early here and the cooked quantities were dropped with no error.
    stockFake.reset([], [])

    // When they cook
    const result = await execOp(CONSUME, { input: consumeInput([COOKED_MILK]) })

    // Then the cook reports success, the Item half still ran, a default
    // location was created for the caller, and the cook landed in it
    expect(result?.data?.consumeRecipes).toMatchObject({ allSucceeded: true })
    expect(mockPrisma.item.updateMany).toHaveBeenCalledOnce()
    const created = stockFake.state.locations.find((l) => l.userId === 'user_test123')
    expect(created).toMatchObject({ isDefault: true, name: 'My Home' })
    expect(stockFake.state.itemStocks).toHaveLength(1)
    expect(stockFake.state.itemStocks[0]).toMatchObject({
      itemId: 'item_milk',
      locationId: created?.id,
      packedQuantity: 1,
      unpackedQuantity: 0.5,
    })
  })
})
