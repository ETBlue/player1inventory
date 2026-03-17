import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import { ItemModel } from '../models/Item.model.js'
import { RecipeModel } from '../models/Recipe.model.js'
import type { Context } from '../context.js'

let mongod: MongoMemoryServer
let server: ApolloServer<Context>

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
}, 120000)

afterAll(async () => {
  await server.stop()
  await mongoose.disconnect()
  await mongod.stop()
})

afterEach(async () => {
  await RecipeModel.deleteMany({})
  await ItemModel.deleteMany({})
})

const ctx: Context = { userId: 'user_test123' }

// ─── helpers ────────────────────────────────────────────────────────────────

async function createRecipe(name = 'Pancakes', items: { itemId: string; defaultAmount: number }[] = []) {
  const r = await server.executeOperation(
    {
      query: `mutation($name: String!, $items: [RecipeItemInput!]) {
        createRecipe(name: $name, items: $items) { id name items { itemId defaultAmount } }
      }`,
      variables: { name, items },
    },
    { contextValue: ctx },
  )
  return (r.body.kind === 'single' ? r.body.singleResult.data?.createRecipe : null) as {
    id: string
    name: string
    items: { itemId: string; defaultAmount: number }[]
  }
}

// ─── Recipe resolvers ────────────────────────────────────────────────────────

describe('Recipe resolvers', () => {
  it('user can create a recipe via GraphQL', async () => {
    const response = await server.executeOperation(
      {
        query: `mutation CreateRecipe($name: String!) {
          createRecipe(name: $name) { id name userId items { itemId defaultAmount } }
        }`,
        variables: { name: 'Pancakes' },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const recipe = response.body.singleResult.data?.createRecipe as {
        id: string
        name: string
        userId: string
        items: unknown[]
      }
      expect(recipe.name).toBe('Pancakes')
      expect(recipe.userId).toBe('user_test123')
      expect(recipe.id).toBeDefined()
      expect(recipe.items).toHaveLength(0)
    }
  })

  it('user can create a recipe with items', async () => {
    const recipe = await createRecipe('Omelette', [
      { itemId: 'item_eggs', defaultAmount: 3 },
      { itemId: 'item_butter', defaultAmount: 0.5 },
    ])

    expect(recipe.items).toHaveLength(2)
    expect(recipe.items[0].itemId).toBe('item_eggs')
    expect(recipe.items[0].defaultAmount).toBe(3)
  })

  it('user can list their recipes', async () => {
    await RecipeModel.create({ name: 'Pancakes', items: [], userId: 'user_test123' })

    const response = await server.executeOperation(
      { query: `query { recipes { id name } }` },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const recipes = response.body.singleResult.data?.recipes as { id: string }[]
      expect(Array.isArray(recipes)).toBe(true)
      expect(recipes.length).toBe(1)
    }
  })

  it('user can update a recipe name', async () => {
    // Given a recipe exists
    const { id } = await createRecipe('Old Name')

    // When updating the name
    const response = await server.executeOperation(
      {
        query: `mutation UpdateRecipe($id: ID!, $name: String) {
          updateRecipe(id: $id, name: $name) { id name }
        }`,
        variables: { id, name: 'New Name' },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect((response.body.singleResult.data?.updateRecipe as { name: string }).name).toBe('New Name')
    }
  })

  it('user can update recipe items', async () => {
    // Given a recipe with items
    const { id } = await createRecipe('Omelette', [{ itemId: 'item_eggs', defaultAmount: 2 }])

    // When replacing items
    const response = await server.executeOperation(
      {
        query: `mutation UpdateRecipe($id: ID!, $items: [RecipeItemInput!]) {
          updateRecipe(id: $id, items: $items) { id items { itemId defaultAmount } }
        }`,
        variables: { id, items: [{ itemId: 'item_eggs', defaultAmount: 4 }, { itemId: 'item_cheese', defaultAmount: 1 }] },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const items = (response.body.singleResult.data?.updateRecipe as { items: { itemId: string; defaultAmount: number }[] }).items
      expect(items).toHaveLength(2)
      expect(items[0].defaultAmount).toBe(4)
    }
  })

  it('user can mark a recipe as last cooked', async () => {
    // Given a recipe exists
    const { id } = await createRecipe()

    // When marking it as cooked
    const response = await server.executeOperation(
      {
        query: `mutation UpdateRecipeLastCookedAt($id: ID!) {
          updateRecipeLastCookedAt(id: $id) { id lastCookedAt }
        }`,
        variables: { id },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const lastCookedAt = (response.body.singleResult.data?.updateRecipeLastCookedAt as { lastCookedAt: string }).lastCookedAt
      expect(lastCookedAt).toBeDefined()
      expect(new Date(lastCookedAt).getTime()).toBeGreaterThan(0)
    }
  })

  it('user can delete a recipe', async () => {
    const { id } = await createRecipe()

    const response = await server.executeOperation(
      {
        query: `mutation DeleteRecipe($id: ID!) { deleteRecipe(id: $id) }`,
        variables: { id },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.deleteRecipe).toBe(true)
    }
  })

  it('deleting a recipe does not affect items', async () => {
    // Given an item and a recipe with that item
    await ItemModel.create({
      name: 'Eggs',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      userId: 'user_test123',
    })
    const { id: recipeId } = await createRecipe('Omelette')

    // When deleting the recipe
    await server.executeOperation(
      {
        query: `mutation DeleteRecipe($id: ID!) { deleteRecipe(id: $id) }`,
        variables: { id: recipeId },
      },
      { contextValue: ctx },
    )

    // Then the item still exists
    const items = await ItemModel.find({ userId: 'user_test123' })
    expect(items.length).toBe(1)
  })

  it('does not return recipes belonging to another user', async () => {
    await RecipeModel.create({ name: 'Other Recipe', items: [], userId: 'user_A' })

    const response = await server.executeOperation(
      { query: `query { recipes { id } }` },
      { contextValue: { userId: 'user_B' } },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.recipes).toHaveLength(0)
    }
  })

  it('user can get item count for a recipe', async () => {
    // Given a recipe with 2 items
    const { id: recipeId } = await createRecipe('Omelette', [
      { itemId: 'item_eggs', defaultAmount: 3 },
      { itemId: 'item_butter', defaultAmount: 0.5 },
    ])

    // When querying item count for that recipe
    const response = await server.executeOperation(
      {
        query: `query ItemCountByRecipe($recipeId: String!) { itemCountByRecipe(recipeId: $recipeId) }`,
        variables: { recipeId },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.itemCountByRecipe).toBe(2)
    }
  })
})
