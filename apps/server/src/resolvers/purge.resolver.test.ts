import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import { ItemModel } from '../models/Item.model.js'
import { TagModel, TagTypeModel } from '../models/Tag.model.js'
import { VendorModel } from '../models/Vendor.model.js'
import { RecipeModel } from '../models/Recipe.model.js'
import { CartModel, CartItemModel } from '../models/Cart.model.js'
import { InventoryLogModel } from '../models/InventoryLog.model.js'
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
  await Promise.all([
    ItemModel.deleteMany({}),
    TagModel.deleteMany({}),
    TagTypeModel.deleteMany({}),
    VendorModel.deleteMany({}),
    RecipeModel.deleteMany({}),
    CartModel.deleteMany({}),
    CartItemModel.deleteMany({}),
    InventoryLogModel.deleteMany({}),
  ])
})

const PURGE_MUTATION = `mutation {
  purgeUserData {
    items tags tagTypes vendors recipes carts cartItems inventoryLogs
  }
}`

describe('purgeUserData resolver', () => {
  it('user can purge all their data and receive deleted counts', async () => {
    // Given a user with data in multiple collections
    const userId = 'user_purge_test'
    const item = await ItemModel.create({ name: 'Milk', userId, targetUnit: 'package' })
    await TagTypeModel.create({ name: 'Category', color: 'blue', userId })
    await VendorModel.create({ name: 'Costco', userId })

    // When user calls purgeUserData
    const context: Context = { userId }
    const response = await server.executeOperation({ query: PURGE_MUTATION }, { contextValue: context })

    // Then deleted counts are returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const data = response.body.singleResult.data?.purgeUserData as Record<string, number>
      expect(data.items).toBe(1)
      expect(data.tagTypes).toBe(1)
      expect(data.vendors).toBe(1)
      expect(data.tags).toBe(0)
      expect(data.recipes).toBe(0)
      expect(data.carts).toBe(0)
      expect(data.cartItems).toBe(0)
      expect(data.inventoryLogs).toBe(0)
    }

    // And the documents are actually deleted
    expect(await ItemModel.findById(item._id)).toBeNull()
    expect(await VendorModel.countDocuments({ userId })).toBe(0)
  })

  it('user can only purge their own data, not other users data', async () => {
    // Given two users with items
    const userId = 'user_purge_test'
    const otherId = 'user_other'
    await ItemModel.create({ name: 'Milk', userId, targetUnit: 'package' })
    await ItemModel.create({ name: 'Eggs', userId: otherId, targetUnit: 'package' })

    // When user purges their data
    const response = await server.executeOperation({ query: PURGE_MUTATION }, { contextValue: { userId } })

    // Then only their item is deleted
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const data = response.body.singleResult.data?.purgeUserData as Record<string, number>
      expect(data.items).toBe(1)
    }
    expect(await ItemModel.countDocuments({ userId: otherId })).toBe(1)
  })

  it('returns error when unauthenticated', async () => {
    // Given no userId in context
    const response = await server.executeOperation({ query: PURGE_MUTATION }, { contextValue: { userId: null } })

    // Then an auth error is returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeDefined()
      expect(response.body.singleResult.errors?.[0].message).toMatch(/unauthorized/i)
    }
  })
})
