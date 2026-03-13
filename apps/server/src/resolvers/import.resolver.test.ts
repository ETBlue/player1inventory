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

describe('importData resolver', () => {
  it('user can import exported data', async () => {
    // Given an export payload with one item
    const context: Context = { userId: 'user_import_test' }
    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      items: [
        {
          id: 'old-id',
          name: 'Milk',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
    })

    // When user imports the payload
    const response = await server.executeOperation(
      {
        query: `mutation Import($payload: String!) { importData(payload: $payload) { itemCount } }`,
        variables: { payload },
      },
      { contextValue: context },
    )

    // Then the item count matches
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.importData.itemCount).toBe(1)
    }
  })

  it('assigns the authenticated userId to imported items', async () => {
    // Given an export from a different user
    const context: Context = { userId: 'new_user' }
    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      items: [
        {
          id: 'old-id',
          name: 'Eggs',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 1,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
          userId: 'old_user',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
    })

    // When the new user imports the payload
    await server.executeOperation(
      {
        query: `mutation Import($payload: String!) { importData(payload: $payload) { itemCount } }`,
        variables: { payload },
      },
      { contextValue: context },
    )

    // Then the item belongs to the new user
    const items = await ItemModel.find({ userId: 'new_user' })
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Eggs')
  })

  it('returns zero counts for empty payload', async () => {
    // Given an empty export payload
    const context: Context = { userId: 'user_empty' }
    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      items: [],
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
    })

    // When user imports empty payload
    const response = await server.executeOperation(
      {
        query: `mutation Import($payload: String!) { importData(payload: $payload) { itemCount } }`,
        variables: { payload },
      },
      { contextValue: context },
    )

    // Then zero items are reported
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.importData.itemCount).toBe(0)
    }
  })

  it('rejects unauthenticated import requests', async () => {
    // Given an unauthenticated context
    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      items: [],
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
    })

    // When an unauthenticated user tries to import
    const response = await server.executeOperation(
      {
        query: `mutation Import($payload: String!) { importData(payload: $payload) { itemCount } }`,
        variables: { payload },
      },
      { contextValue: { userId: null } },
    )

    // Then it is rejected
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors?.[0].extensions?.code).toBe('UNAUTHENTICATED')
    }
  })
})
