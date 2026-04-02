import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import { ItemModel } from '../models/Item.model.js'
import { RecipeModel } from '../models/Recipe.model.js'
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
  await ItemModel.deleteMany({})
  await RecipeModel.deleteMany({})
  await InventoryLogModel.deleteMany({})
})

describe('Item resolvers', () => {
  it('user can create an item via GraphQL', async () => {
    // Given an authenticated context
    const context: Context = { userId: 'user_test123' }

    // When user creates an item
    const response = await server.executeOperation(
      {
        query: `mutation CreateItem($input: CreateItemInput!) {
          createItem(input: $input) { id name userId }
        }`,
        variables: { input: { name: 'Milk' } },
      },
      { contextValue: context },
    )

    // Then item is returned with userId
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const item = response.body.singleResult.data?.createItem as { id: string; name: string; userId: string }
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
        query: `mutation CreateItem($input: CreateItemInput!) {
          createItem(input: $input) { id }
        }`,
        variables: { input: { name: 'Eggs' } },
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
      const items = response.body.singleResult.data?.items as Array<{ id: string; name: string }>
      expect(Array.isArray(items)).toBe(true)
      expect(items.length).toBeGreaterThan(0)
    }
  })

  it('user can fetch a single item by id', async () => {
    const context: Context = { userId: 'user_test123' }

    // Given an item exists
    const createResponse = await server.executeOperation(
      {
        query: `mutation CreateItem($input: CreateItemInput!) { createItem(input: $input) { id } }`,
        variables: { input: { name: 'Butter' } },
      },
      { contextValue: context },
    )
    const id =
      createResponse.body.kind === 'single'
        ? (createResponse.body.singleResult.data?.createItem as { id: string }).id
        : null

    // When fetching by id
    const response = await server.executeOperation(
      { query: `query GetItem($id: ID!) { item(id: $id) { id name } }`, variables: { id } },
      { contextValue: context },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect((response.body.singleResult.data?.item as { name: string }).name).toBe('Butter')
    }
  })

  it('user can update an item', async () => {
    const context: Context = { userId: 'user_test123' }

    // Given an item exists
    const createResponse = await server.executeOperation(
      {
        query: `mutation CreateItem($input: CreateItemInput!) { createItem(input: $input) { id } }`,
        variables: { input: { name: 'Oil' } },
      },
      { contextValue: context },
    )
    const id =
      createResponse.body.kind === 'single'
        ? (createResponse.body.singleResult.data?.createItem as { id: string }).id
        : null

    // When updating
    const response = await server.executeOperation(
      {
        query: `mutation UpdateItem($id: ID!, $input: UpdateItemInput!) {
        updateItem(id: $id, input: $input) { id name }
      }`,
        variables: { id, input: { name: 'Olive Oil' } },
      },
      { contextValue: context },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect((response.body.singleResult.data?.updateItem as { name: string }).name).toBe('Olive Oil')
    }
  })

  it('user can delete an item', async () => {
    const context: Context = { userId: 'user_test123' }

    // Given an item exists
    const createResponse = await server.executeOperation(
      {
        query: `mutation CreateItem($input: CreateItemInput!) { createItem(input: $input) { id } }`,
        variables: { input: { name: 'Trash' } },
      },
      { contextValue: context },
    )
    const id =
      createResponse.body.kind === 'single'
        ? (createResponse.body.singleResult.data?.createItem as { id: string }).id
        : null

    // When deleting
    const response = await server.executeOperation(
      {
        query: `mutation DeleteItem($id: ID!) { deleteItem(id: $id) }`,
        variables: { id },
      },
      { contextValue: context },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.deleteItem).toBe(true)
    }
  })

  it('does not return items belonging to another user', async () => {
    // Given user A creates an item
    await server.executeOperation(
      {
        query: `mutation CreateItem($input: CreateItemInput!) { createItem(input: $input) { id } }`,
        variables: { input: { name: 'UserA Item' } },
      },
      { contextValue: { userId: 'user_A' } },
    )

    // When user B queries items
    const response = await server.executeOperation(
      { query: `query { items { id name } }` },
      { contextValue: { userId: 'user_B' } },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.items).toHaveLength(0)
    }
  })

  it('deleting an item removes it from all recipe items arrays (cascade)', async () => {
    const context: Context = { userId: 'user_test123' }

    // Given an item and two recipes that reference it
    const createResponse = await server.executeOperation(
      {
        query: `mutation CreateItem($input: CreateItemInput!) { createItem(input: $input) { id } }`,
        variables: { input: { name: 'Eggs' } },
      },
      { contextValue: context },
    )
    const itemId =
      createResponse.body.kind === 'single'
        ? (createResponse.body.singleResult.data?.createItem as { id: string }).id
        : null

    await RecipeModel.create([
      { name: 'Omelette', items: [{ itemId, defaultAmount: 3 }], userId: 'user_test123' },
      { name: 'Fried Eggs', items: [{ itemId, defaultAmount: 2 }], userId: 'user_test123' },
    ])

    // When deleting the item
    await server.executeOperation(
      {
        query: `mutation DeleteItem($id: ID!) { deleteItem(id: $id) }`,
        variables: { id: itemId },
      },
      { contextValue: context },
    )

    // Then the itemId is removed from all recipes
    const recipes = await RecipeModel.find({ userId: 'user_test123' })
    for (const recipe of recipes) {
      expect(recipe.items.map((ri) => ri.itemId)).not.toContain(itemId)
    }
  })

  it('rejects unauthenticated requests', async () => {
    const response = await server.executeOperation(
      { query: `query { items { id name } }` },
      { contextValue: { userId: null } },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors?.[0].extensions?.code).toBe('UNAUTHENTICATED')
    }
  })

  it('deleting an item cascade-deletes its inventory logs', async () => {
    const context: Context = { userId: 'user_test123' }

    // Given an item exists
    const createResponse = await server.executeOperation(
      {
        query: `mutation CreateItem($input: CreateItemInput!) { createItem(input: $input) { id } }`,
        variables: { input: { name: 'Bread' } },
      },
      { contextValue: context },
    )
    const itemId =
      createResponse.body.kind === 'single'
        ? (createResponse.body.singleResult.data?.createItem as { id: string }).id
        : null

    // And there are inventory logs for that item
    await InventoryLogModel.create([
      { itemId, delta: 1, quantity: 1, occurredAt: new Date(), userId: 'user_test123' },
      { itemId, delta: -1, quantity: 0, occurredAt: new Date(), userId: 'user_test123' },
    ])

    // When deleting the item
    await server.executeOperation(
      {
        query: `mutation DeleteItem($id: ID!) { deleteItem(id: $id) }`,
        variables: { id: itemId },
      },
      { contextValue: context },
    )

    // Then the inventory logs for that item no longer exist
    const remainingLogs = await InventoryLogModel.find({ itemId })
    expect(remainingLogs).toHaveLength(0)
  })

  it('items returns epoch string for legacy records where createdAt or updatedAt is null', async () => {
    // Given a legacy document in MongoDB where createdAt and updatedAt are null
    await ItemModel.collection.insertOne({
      name: 'Legacy Item',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      userId: 'user_test123',
      createdAt: null,
      updatedAt: null,
    })

    // When querying items
    const response = await server.executeOperation(
      { query: `query { items { id name createdAt updatedAt } }` },
      { contextValue: { userId: 'user_test123' } },
    )

    // Then createdAt and updatedAt are the epoch string, not null (GraphQL non-nullable String! contract upheld)
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.items as { id: string; name: string; createdAt: string; updatedAt: string }[]
      const legacy = items.find(i => i.name === 'Legacy Item')
      expect(legacy).toBeDefined()
      expect(legacy?.createdAt).toBe(new Date(0).toISOString())
      expect(legacy?.updatedAt).toBe(new Date(0).toISOString())
    }
  })
})
