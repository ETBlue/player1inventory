import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { RecipeModel } from './Recipe.model.js'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}, 120000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

describe('RecipeModel', () => {
  afterEach(() => RecipeModel.deleteMany({}))

  it('user can create a recipe', async () => {
    // Given valid recipe data
    const recipe = await RecipeModel.create({
      name: 'Pancakes',
      items: [],
      userId: 'user_test123',
    })

    // Then recipe is persisted with id
    expect(recipe.id).toBeDefined()
    expect(recipe.name).toBe('Pancakes')
    expect(recipe.userId).toBe('user_test123')
    expect(recipe.items).toHaveLength(0)
  })

  it('recipe with items stores itemId and defaultAmount', async () => {
    // Given recipe with items
    const recipe = await RecipeModel.create({
      name: 'Omelette',
      items: [
        { itemId: 'item_eggs', defaultAmount: 3 },
        { itemId: 'item_butter', defaultAmount: 0.5 },
      ],
      userId: 'user_test123',
    })

    // Then items are persisted correctly
    expect(recipe.items).toHaveLength(2)
    expect(recipe.items[0].itemId).toBe('item_eggs')
    expect(recipe.items[0].defaultAmount).toBe(3)
  })

  it('rejects a recipe without a required name', async () => {
    await expect(
      RecipeModel.create({ userId: 'user_test123', items: [] }),
    ).rejects.toThrow()
  })

  it('rejects a recipe without a required userId', async () => {
    await expect(
      RecipeModel.create({ name: 'Pancakes', items: [] }),
    ).rejects.toThrow()
  })
})
