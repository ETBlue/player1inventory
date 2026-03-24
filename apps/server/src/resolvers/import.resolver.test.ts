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

const BULK_CREATE_ITEMS = `
  mutation BulkCreateItems($items: [ItemInput!]!) {
    bulkCreateItems(items: $items) { id name userId }
  }
`

const BULK_UPSERT_ITEMS = `
  mutation BulkUpsertItems($items: [ItemInput!]!) {
    bulkUpsertItems(items: $items) { id name }
  }
`

const CLEAR_ALL_DATA = `mutation { clearAllData }`

function makeItemInput(overrides: Partial<Record<string, unknown>> & { id: string }) {
  return {
    name: 'Milk',
    tagIds: [],
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

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

describe('bulkCreateItems', () => {
  it('user can bulk-create items with original MongoDB ObjectIds', async () => {
    // Given an authenticated context and a valid MongoDB ObjectId
    const context: Context = { userId: 'user_import_test' }
    const originalId = new mongoose.Types.ObjectId().toString()

    // When calling bulkCreateItems with valid item data
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: { items: [makeItemInput({ id: originalId, name: 'Milk' })] },
      },
      { contextValue: context },
    )

    // Then the mutation returns the inserted item (not empty array)
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkCreateItems as Array<{
        id: string
        name: string
        userId: string
      }>
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe(originalId)
      expect(items[0].name).toBe('Milk')
      expect(items[0].userId).toBe('user_import_test')
    }

    // And the item is persisted in MongoDB with the original ID
    const stored = await ItemModel.findById(originalId)
    expect(stored).not.toBeNull()
    expect(stored?.name).toBe('Milk')
  })

  it('assigns the authenticated userId to imported items', async () => {
    // Given an item input (ItemInput has no userId field — userId is assigned server-side from auth context)
    const context: Context = { userId: 'new_user' }
    const originalId = new mongoose.Types.ObjectId().toString()

    // When the new user imports it
    await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: { items: [makeItemInput({ id: originalId, name: 'Eggs' })] },
      },
      { contextValue: context },
    )

    // Then the item is owned by the authenticated user, not any userId embedded in the payload
    const items = await ItemModel.find({ userId: 'new_user' })
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Eggs')
  })

  it('skips duplicate IDs instead of throwing (ordered: false skip behaviour)', async () => {
    // Given an item already exists
    const context: Context = { userId: 'user_import_test' }
    const existingId = new mongoose.Types.ObjectId().toString()
    await ItemModel.create({
      _id: existingId,
      name: 'Existing',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      userId: 'user_import_test',
    })

    // When bulk-creating with the same ID (conflict) plus a new item
    const newId = new mongoose.Types.ObjectId().toString()
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: {
          items: [
            makeItemInput({ id: existingId, name: 'Duplicate' }),
            makeItemInput({ id: newId, name: 'New Item' }),
          ],
        },
      },
      { contextValue: context },
    )

    // Then the mutation succeeds (no GraphQL error) — BulkWriteError is caught internally
    // and only the successfully inserted docs are returned (skip semantics)
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkCreateItems as Array<{ id: string }>
      // Only the new (non-conflicting) item is returned
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe(newId)
    }

    // And the existing item was not overwritten
    const existing = await ItemModel.findById(existingId)
    expect(existing?.name).toBe('Existing')
  })

  it('user can clear all data and re-import items (clear strategy)', async () => {
    // Given items already exist
    const context: Context = { userId: 'user_import_test' }
    const originalId = new mongoose.Types.ObjectId().toString()
    await ItemModel.create({
      _id: originalId,
      name: 'Old Name',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      userId: 'user_import_test',
    })

    // When clearing and re-importing the same IDs
    await server.executeOperation({ query: CLEAR_ALL_DATA }, { contextValue: context })
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: { items: [makeItemInput({ id: originalId, name: 'Restored' })] },
      },
      { contextValue: context },
    )

    // Then the item is restored with the original ID
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkCreateItems as Array<{
        id: string
        name: string
      }>
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe(originalId)
      expect(items[0].name).toBe('Restored')
    }
  })

  it('user can import items with UUID IDs (exported from local mode)', async () => {
    // Given a UUID-format ID (as exported from local/Dexie mode)
    const context: Context = { userId: 'user_import_test' }
    const uuidId = '02ce891b-d9c5-40cc-8f06-9cfb945cde49' // typical Dexie UUID

    // When calling bulkCreateItems with a UUID ID
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: { items: [makeItemInput({ id: uuidId, name: 'UUID Item' })] },
      },
      { contextValue: context },
    )

    // Then the mutation returns the inserted item (UUID ID is preserved)
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkCreateItems as Array<{
        id: string
        name: string
      }>
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe(uuidId)
      expect(items[0].name).toBe('UUID Item')
    }

    // And the item is persisted with the UUID as _id
    const stored = await ItemModel.findById(uuidId)
    expect(stored).not.toBeNull()
    expect(stored?.name).toBe('UUID Item')
  })

  it('rejects unauthenticated bulk-create requests', async () => {
    // Given an unauthenticated context
    const id = new mongoose.Types.ObjectId().toString()

    // When an unauthenticated user tries to bulk-create
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: { items: [makeItemInput({ id })] },
      },
      { contextValue: { userId: null } },
    )

    // Then it is rejected with UNAUTHENTICATED
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors?.[0].extensions?.code).toBe('UNAUTHENTICATED')
    }
  })
})

describe('bulkUpsertItems', () => {
  it('user can upsert items — creates if absent, replaces if present', async () => {
    // Given an existing item
    const context: Context = { userId: 'user_import_test' }
    const existingId = new mongoose.Types.ObjectId().toString()
    await ItemModel.create({
      _id: existingId,
      name: 'Old Name',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      userId: 'user_import_test',
    })

    // And a new item ID
    const newId = new mongoose.Types.ObjectId().toString()

    // When upserting both
    const response = await server.executeOperation(
      {
        query: BULK_UPSERT_ITEMS,
        variables: {
          items: [
            makeItemInput({ id: existingId, name: 'Updated Name' }),
            makeItemInput({ id: newId, name: 'Brand New' }),
          ],
        },
      },
      { contextValue: context },
    )

    // Then both items are returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkUpsertItems as Array<{
        id: string
        name: string
      }>
      expect(items).toHaveLength(2)
    }

    // And existing item is updated
    const updated = await ItemModel.findById(existingId)
    expect(updated?.name).toBe('Updated Name')

    // And new item is created
    const created = await ItemModel.findById(newId)
    expect(created?.name).toBe('Brand New')
  })
})
