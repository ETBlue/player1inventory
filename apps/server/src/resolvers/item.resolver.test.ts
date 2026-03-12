import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import { ItemModel } from '../models/Item.model.js'
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
  await ItemModel.deleteMany({})
})

describe('Item resolvers', () => {
  it('user can create an item via GraphQL', async () => {
    // Given an authenticated context
    const context: Context = { userId: 'user_test123' }

    // When user creates an item
    const response = await server.executeOperation(
      {
        query: `mutation CreateItem($name: String!) {
          createItem(name: $name) { id name userId }
        }`,
        variables: { name: 'Milk' },
      },
      { contextValue: context },
    )

    // Then item is returned with userId
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const item = response.body.singleResult.data?.createItem
      expect(item.name).toBe('Milk')
      expect(item.userId).toBe('user_test123')
      expect(item.id).toBeDefined()
    }
  })

  it('user can list their items', async () => {
    const context: Context = { userId: 'user_test123' }

    // Given an item already exists
    await server.executeOperation(
      {
        query: `mutation CreateItem($name: String!) {
          createItem(name: $name) { id }
        }`,
        variables: { name: 'Eggs' },
      },
      { contextValue: context },
    )

    // When user queries items
    const response = await server.executeOperation(
      { query: `query { items { id name } }` },
      { contextValue: context },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const items = response.body.singleResult.data?.items
      expect(Array.isArray(items)).toBe(true)
      expect(items.length).toBeGreaterThan(0)
    }
  })
})
