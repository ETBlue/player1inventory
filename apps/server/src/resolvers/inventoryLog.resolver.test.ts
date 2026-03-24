import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
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
  await InventoryLogModel.deleteMany({})
})

const ctx: Context = { userId: 'user_test123' }

// ─── helpers ────────────────────────────────────────────────────────────────

async function addInventoryLog(
  itemId: string,
  delta: number,
  quantity: number,
  occurredAt: string,
  note?: string,
  ctxOverride = ctx,
) {
  const r = await server.executeOperation(
    {
      query: `mutation AddInventoryLog($itemId: ID!, $delta: Float!, $quantity: Float!, $occurredAt: String!, $note: String) {
        addInventoryLog(itemId: $itemId, delta: $delta, quantity: $quantity, occurredAt: $occurredAt, note: $note) {
          id itemId delta quantity occurredAt note
        }
      }`,
      variables: { itemId, delta, quantity, occurredAt, note },
    },
    { contextValue: ctxOverride },
  )
  return (r.body.kind === 'single' ? r.body.singleResult.data?.addInventoryLog : null) as {
    id: string
    itemId: string
    delta: number
    quantity: number
    occurredAt: string
    note: string | null
  }
}

// ─── itemLogs ────────────────────────────────────────────────────────────────

describe('itemLogs', () => {
  it('user can get item logs — returns logs sorted by occurredAt ascending', async () => {
    // Given two logs exist for the same item in reverse chronological order
    const itemId = new mongoose.Types.ObjectId().toString()
    await InventoryLogModel.create({ itemId, delta: 2, quantity: 2, occurredAt: new Date('2026-01-02'), userId: 'user_test123' })
    await InventoryLogModel.create({ itemId, delta: 1, quantity: 1, occurredAt: new Date('2026-01-01'), userId: 'user_test123' })

    // When querying itemLogs
    const response = await server.executeOperation(
      {
        query: `query ItemLogs($itemId: ID!) { itemLogs(itemId: $itemId) { id delta occurredAt } }`,
        variables: { itemId },
      },
      { contextValue: ctx },
    )

    // Then logs are returned sorted by occurredAt ascending
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const logs = response.body.singleResult.data?.itemLogs as { id: string; delta: number; occurredAt: string }[]
      expect(logs).toHaveLength(2)
      expect(logs[0].delta).toBe(1)
      expect(logs[1].delta).toBe(2)
    }
  })

  it('user can get item logs — returns empty array when no logs exist', async () => {
    // Given no logs exist for the item
    const itemId = new mongoose.Types.ObjectId().toString()

    // When querying itemLogs
    const response = await server.executeOperation(
      {
        query: `query ItemLogs($itemId: ID!) { itemLogs(itemId: $itemId) { id } }`,
        variables: { itemId },
      },
      { contextValue: ctx },
    )

    // Then an empty array is returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.itemLogs).toHaveLength(0)
    }
  })
})

// ─── inventoryLogCountByItem ──────────────────────────────────────────────────

describe('inventoryLogCountByItem', () => {
  it('user can get inventory log count for an item', async () => {
    // Given three logs exist for the same item
    const itemId = new mongoose.Types.ObjectId().toString()
    await InventoryLogModel.create({ itemId, delta: 1, quantity: 1, occurredAt: new Date(), userId: 'user_test123' })
    await InventoryLogModel.create({ itemId, delta: 2, quantity: 3, occurredAt: new Date(), userId: 'user_test123' })
    await InventoryLogModel.create({ itemId, delta: -1, quantity: 2, occurredAt: new Date(), userId: 'user_test123' })

    // When querying the count
    const response = await server.executeOperation(
      {
        query: `query InventoryLogCountByItem($itemId: ID!) { inventoryLogCountByItem(itemId: $itemId) }`,
        variables: { itemId },
      },
      { contextValue: ctx },
    )

    // Then the count is 3
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.inventoryLogCountByItem).toBe(3)
    }
  })
})

// ─── lastPurchaseDates ────────────────────────────────────────────────────────

describe('lastPurchaseDates', () => {
  it('user can get last purchase dates for multiple items — returns most recent positive-delta date per item', async () => {
    // Given two items with positive-delta logs at different times
    const itemId1 = new mongoose.Types.ObjectId().toString()
    const itemId2 = new mongoose.Types.ObjectId().toString()
    await InventoryLogModel.create({ itemId: itemId1, delta: 1, quantity: 1, occurredAt: new Date('2026-01-10'), userId: 'user_test123' })
    await InventoryLogModel.create({ itemId: itemId1, delta: 2, quantity: 3, occurredAt: new Date('2026-01-20'), userId: 'user_test123' })
    await InventoryLogModel.create({ itemId: itemId2, delta: 3, quantity: 3, occurredAt: new Date('2026-02-01'), userId: 'user_test123' })

    // When querying lastPurchaseDates
    const response = await server.executeOperation(
      {
        query: `query LastPurchaseDates($itemIds: [ID!]!) { lastPurchaseDates(itemIds: $itemIds) { itemId date } }`,
        variables: { itemIds: [itemId1, itemId2] },
      },
      { contextValue: ctx },
    )

    // Then the most recent positive-delta date is returned for each item
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const results = response.body.singleResult.data?.lastPurchaseDates as { itemId: string; date: string | null }[]
      expect(results).toHaveLength(2)
      const result1 = results.find(r => r.itemId === itemId1)
      const result2 = results.find(r => r.itemId === itemId2)
      expect(result1?.date).toContain('2026-01-20')
      expect(result2?.date).toContain('2026-02-01')
    }
  })

  it('last purchase date is null for items with no positive-delta logs', async () => {
    // Given an item with only a negative-delta log
    const itemId = new mongoose.Types.ObjectId().toString()
    await InventoryLogModel.create({ itemId, delta: -1, quantity: 0, occurredAt: new Date(), userId: 'user_test123' })

    // When querying lastPurchaseDates
    const response = await server.executeOperation(
      {
        query: `query LastPurchaseDates($itemIds: [ID!]!) { lastPurchaseDates(itemIds: $itemIds) { itemId date } }`,
        variables: { itemIds: [itemId] },
      },
      { contextValue: ctx },
    )

    // Then date is null for that item
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const results = response.body.singleResult.data?.lastPurchaseDates as { itemId: string; date: string | null }[]
      expect(results[0].date).toBeNull()
    }
  })
})

// ─── addInventoryLog ──────────────────────────────────────────────────────────

describe('addInventoryLog', () => {
  it('user can add an inventory log', async () => {
    // Given a valid item id and log data
    const itemId = new mongoose.Types.ObjectId().toString()
    const occurredAt = '2026-03-01T10:00:00.000Z'

    // When adding an inventory log
    const log = await addInventoryLog(itemId, 3, 5, occurredAt, 'restocked')

    // Then the log is created with the correct fields
    expect(log.id).toBeDefined()
    expect(log.itemId).toBe(itemId)
    expect(log.delta).toBe(3)
    expect(log.quantity).toBe(5)
    expect(log.occurredAt).toContain('2026-03-01')
    expect(log.note).toBe('restocked')

    // And it is persisted in the database
    const saved = await InventoryLogModel.findById(log.id)
    expect(saved).not.toBeNull()
    expect(saved?.delta).toBe(3)
  })
})

// ─── Legacy null fields ───────────────────────────────────────────────────────

describe('legacy null fields', () => {
  it('itemLogs coalesces null quantity and delta to 0 for legacy records', async () => {
    // Given a legacy document in MongoDB where quantity and delta are null
    const itemId = new mongoose.Types.ObjectId().toString()
    await InventoryLogModel.collection.insertOne({
      itemId,
      delta: null,
      quantity: null,
      occurredAt: new Date('2026-01-01'),
      userId: 'user_test123',
    })

    // When querying itemLogs
    const response = await server.executeOperation(
      {
        query: `query ItemLogs($itemId: ID!) { itemLogs(itemId: $itemId) { id delta quantity occurredAt } }`,
        variables: { itemId },
      },
      { contextValue: ctx },
    )

    // Then quantity and delta are 0, not null (GraphQL non-nullable contract upheld)
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const logs = response.body.singleResult.data?.itemLogs as { id: string; delta: number; quantity: number }[]
      expect(logs).toHaveLength(1)
      expect(logs[0].delta).toBe(0)
      expect(logs[0].quantity).toBe(0)
    }
  })

  it('inventoryLogs coalesces null quantity and delta to 0 for legacy records', async () => {
    // Given a legacy document in MongoDB where quantity and delta are null
    const itemId = new mongoose.Types.ObjectId().toString()
    await InventoryLogModel.collection.insertOne({
      itemId,
      delta: null,
      quantity: null,
      occurredAt: new Date('2026-01-01'),
      userId: 'user_test123',
    })

    // When querying inventoryLogs
    const response = await server.executeOperation(
      {
        query: `query InventoryLogs { inventoryLogs { id delta quantity occurredAt } }`,
      },
      { contextValue: ctx },
    )

    // Then quantity and delta are 0, not null (GraphQL non-nullable contract upheld)
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const logs = response.body.singleResult.data?.inventoryLogs as { id: string; delta: number; quantity: number }[]
      expect(logs).toHaveLength(1)
      expect(logs[0].delta).toBe(0)
      expect(logs[0].quantity).toBe(0)
    }
  })

  it('itemLogs returns epoch string for legacy records where occurredAt is null', async () => {
    // Given a legacy document in MongoDB where occurredAt is null
    const itemId = new mongoose.Types.ObjectId().toString()
    await InventoryLogModel.collection.insertOne({
      itemId,
      delta: 1,
      quantity: 1,
      occurredAt: null,
      userId: 'user_test123',
    })

    // When querying itemLogs
    const response = await server.executeOperation(
      {
        query: `query ItemLogs($itemId: ID!) { itemLogs(itemId: $itemId) { id occurredAt } }`,
        variables: { itemId },
      },
      { contextValue: ctx },
    )

    // Then occurredAt is the epoch string, not null (GraphQL non-nullable String! contract upheld)
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const logs = response.body.singleResult.data?.itemLogs as { id: string; occurredAt: string }[]
      expect(logs).toHaveLength(1)
      expect(logs[0].occurredAt).toBe(new Date(0).toISOString())
    }
  })

  it('inventoryLogs returns epoch string for legacy records where occurredAt is null', async () => {
    // Given a legacy document in MongoDB where occurredAt is null
    const itemId = new mongoose.Types.ObjectId().toString()
    await InventoryLogModel.collection.insertOne({
      itemId,
      delta: 1,
      quantity: 1,
      occurredAt: null,
      userId: 'user_test123',
    })

    // When querying inventoryLogs
    const response = await server.executeOperation(
      {
        query: `query InventoryLogs { inventoryLogs { id occurredAt } }`,
      },
      { contextValue: ctx },
    )

    // Then occurredAt is the epoch string, not null (GraphQL non-nullable String! contract upheld)
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const logs = response.body.singleResult.data?.inventoryLogs as { id: string; occurredAt: string }[]
      expect(logs).toHaveLength(1)
      expect(logs[0].occurredAt).toBe(new Date(0).toISOString())
    }
  })
})

// ─── Cross-user isolation ─────────────────────────────────────────────────────

describe('cross-user isolation', () => {
  it('itemLogs is scoped to the requesting user — other users\' logs excluded', async () => {
    // Given user A has a log for an item
    const itemId = new mongoose.Types.ObjectId().toString()
    await InventoryLogModel.create({ itemId, delta: 1, quantity: 1, occurredAt: new Date(), userId: 'user_A' })

    // When user B queries itemLogs for that item
    const response = await server.executeOperation(
      {
        query: `query ItemLogs($itemId: ID!) { itemLogs(itemId: $itemId) { id } }`,
        variables: { itemId },
      },
      { contextValue: { userId: 'user_B' } },
    )

    // Then no logs are returned for user B
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.itemLogs).toHaveLength(0)
    }
  })

  it('lastPurchaseDates is scoped to the requesting user — other users\' logs excluded', async () => {
    // Given user A has a positive-delta log for an item
    const itemId = new mongoose.Types.ObjectId().toString()
    await InventoryLogModel.create({ itemId, delta: 5, quantity: 5, occurredAt: new Date(), userId: 'user_A' })

    // When user B queries lastPurchaseDates for that item
    const response = await server.executeOperation(
      {
        query: `query LastPurchaseDates($itemIds: [ID!]!) { lastPurchaseDates(itemIds: $itemIds) { itemId date } }`,
        variables: { itemIds: [itemId] },
      },
      { contextValue: { userId: 'user_B' } },
    )

    // Then date is null for user B (no logs belonging to them)
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const results = response.body.singleResult.data?.lastPurchaseDates as { itemId: string; date: string | null }[]
      expect(results[0].date).toBeNull()
    }
  })
})
