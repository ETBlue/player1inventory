import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

// `recipe` and `recipeItem` are plain `vi.fn()` call recorders.
//
// The `item` store has `findMany` and nothing else. `findMany` answers
// `requireCatalogIds` (lib/authz.ts) for a recipe's item ids. It reads a
// household-scoped `ownedRowFake` store: every item the tests name is
// `hh_test`'s, except `item_theirs`, which is the stranger's (`hh_other`).
//
// `consumeRecipes` (cooking) is tested in `recipe-consume.resolver.test.ts`
// since households H3b task B.6. Its stock, log and recipe writes run in one
// transaction, and its tests need stateful stores registered for rollback.
//
// `user`, `household`, `householdMember`, `locationMember`, `location` and
// `itemStock` are the stateful fakes joined in `src/test/householdWorld.ts`.
// Every role is a row `seedWorld` writes. Nothing is derived from a
// location's `userId` (households H3a task 3.7 removed `derivedRoles` from
// this file). The household role checks themselves, with three people, are
// tested in `catalog-household.resolver.test.ts`.
vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const world = createHouseholdWorld()
  const items = createOwnedRowFake({
    model: 'Item',
    scope: 'householdId',
  })
  return {
    prisma: {
      item: { findMany: items.client.findMany },
      $items: items,
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
      ...world.client,
      // Hung off the client because a `vi.mock` factory is hoisted above every
      // import and cannot close over a module-scope binding.
      $world: world,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { HouseholdRole, LocationRole } from '../lib/authz.js'
import type { HouseholdWorld } from '../test/householdWorld.js'

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
  $world: HouseholdWorld
  $items: { reset: (rows: { id: string; householdId: string; userId: string }[]) => void }
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

// Two locations for the caller and one for a stranger. Only the recipe
// resolvers above read them, through the role checks.
const LOC_DEFAULT = 'loc_kitchen'
const LOC_OTHER = 'loc_garage'
const LOC_STRANGER = 'loc_theirs'

const world = mockPrisma.$world
const stockFake = world.stock
const T = new Date('2026-11-01T00:00:00.000Z')

// Three households: the caller's (`hh_test`, both of the caller's
// locations), a stranger's (`hh_other`), and `user_B`'s, who has no location.
// Each person is the `owner` of their own household and the `organizer` of
// their own locations, unless a test passes other roles for the caller. The
// roles apply to the caller's household and BOTH of the caller's locations.
function seedWorld(
  callerRoles: { household: HouseholdRole; location: LocationRole } = {
    household: 'owner',
    location: 'organizer',
  },
) {
  world.reset()
  stockFake.reset(
    [
      // The default is deliberately not first: a lookup that took locations[0]
      // rather than the isDefault row would otherwise pass by coincidence.
      { id: LOC_OTHER, householdId: 'hh_test' },
      { id: LOC_DEFAULT, householdId: 'hh_test' },
      { id: LOC_STRANGER, householdId: 'hh_other' },
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
  const owner = (householdId: string, userId: string, role: HouseholdRole = 'owner') => ({
    householdId,
    userId,
    role,
    joinedAt: T,
  })
  const organizer = (locationId: string, userId: string, role: LocationRole = 'organizer') => ({
    locationId,
    userId,
    role,
    createdAt: T,
  })
  world.seedHouseholds({
    households: [
      household('hh_test', 'user_test123'),
      household('hh_other', 'user_other'),
      household('hh_b', 'user_B'),
    ],
    householdMembers: [
      owner('hh_test', 'user_test123', callerRoles.household),
      owner('hh_other', 'user_other'),
      owner('hh_b', 'user_B'),
    ],
    locationMembers: [
      organizer(LOC_OTHER, 'user_test123', callerRoles.location),
      organizer(LOC_DEFAULT, 'user_test123', callerRoles.location),
      organizer(LOC_STRANGER, 'user_other'),
    ],
  })
}

// The catalog: `hh_test`'s items, and one of the stranger's.
function seedItems(householdId = 'hh_test') {
  mockPrisma.$items.reset([
    ...['item_milk', 'item_eggs', 'item_butter', 'item_cheese'].map((id) => ({
      id,
      householdId,
      userId: 'user_test123',
    })),
    { id: 'item_theirs', householdId: 'hh_other', userId: 'user_other' },
  ])
}

beforeEach(async () => {
  vi.clearAllMocks()
  seedWorld()
  seedItems()
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
        createRecipe(name: $name) { id name items { itemId defaultAmount } }
      }`,
      { name: 'Pancakes' },
    )

    // Then recipe is returned with correct fields
    expect(result?.errors).toBeUndefined()
    const created = result?.data?.createRecipe as { id: string; name: string; items: unknown[] }
    expect(created.name).toBe('Pancakes')
    // And the row is written into the caller's household, with no `userId`
    // (households H3a task 3.14 dropped the column)
    expect(mockPrisma.recipe.create).toHaveBeenCalledWith({
      data: { name: 'Pancakes', householdId: 'hh_test' },
    })
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
// Moved to `recipe-consume.resolver.test.ts` in households H3b task B.6. The
// cook now runs in one transaction, and its tests need stateful log and
// recipe stores registered for rollback, which this file's call recorders are
// not.
