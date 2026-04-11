import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    inventoryLog: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { prisma } from '../lib/prisma.js'

const mockPrisma = prisma as unknown as {
  inventoryLog: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeLog(overrides: Partial<{
  id: string
  itemId: string
  delta: number
  quantity: number
  occurredAt: Date | null
  userId: string
  note: string | null
}> = {}) {
  return {
    id: overrides.id ?? 'log_1',
    itemId: overrides.itemId ?? 'item_1',
    delta: overrides.delta ?? 1,
    quantity: overrides.quantity ?? 1,
    occurredAt: overrides.occurredAt !== undefined ? overrides.occurredAt : new Date('2026-01-01T00:00:00.000Z'),
    userId: overrides.userId ?? 'user_test123',
    note: overrides.note ?? null,
  }
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let server: ApolloServer<Context>
const ctx: Context = { userId: 'user_test123' }

beforeEach(async () => {
  vi.clearAllMocks()
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function execOp(query: string, variables?: Record<string, unknown>, context = ctx) {
  const r = await server.executeOperation({ query, variables }, { contextValue: context })
  return r.body.kind === 'single' ? r.body.singleResult : null
}

// ─── itemLogs ────────────────────────────────────────────────────────────────

describe('itemLogs', () => {
  it('user can get item logs — returns logs sorted by occurredAt ascending', async () => {
    // Given two logs exist for the same item in chronological order (Prisma returns them sorted)
    const log1 = makeLog({ id: 'log_1', delta: 1, quantity: 1, occurredAt: new Date('2026-01-01') })
    const log2 = makeLog({ id: 'log_2', delta: 2, quantity: 2, occurredAt: new Date('2026-01-02') })
    mockPrisma.inventoryLog.findMany.mockResolvedValue([log1, log2])

    // When querying itemLogs
    const result = await execOp(
      `query ItemLogs($itemId: ID!) { itemLogs(itemId: $itemId) { id delta occurredAt } }`,
      { itemId: 'item_1' },
    )

    // Then logs are returned sorted by occurredAt ascending
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.itemLogs as { id: string; delta: number; occurredAt: string }[]
    expect(logs).toHaveLength(2)
    expect(logs[0].delta).toBe(1)
    expect(logs[1].delta).toBe(2)
    expect(mockPrisma.inventoryLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { occurredAt: 'asc' } }),
    )
  })

  it('user can get item logs — returns empty array when no logs exist', async () => {
    // Given no logs exist for the item
    mockPrisma.inventoryLog.findMany.mockResolvedValue([])

    // When querying itemLogs
    const result = await execOp(
      `query ItemLogs($itemId: ID!) { itemLogs(itemId: $itemId) { id } }`,
      { itemId: 'item_1' },
    )

    // Then an empty array is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.itemLogs).toHaveLength(0)
  })
})

// ─── inventoryLogCountByItem ──────────────────────────────────────────────────

describe('inventoryLogCountByItem', () => {
  it('user can get inventory log count for an item', async () => {
    // Given prisma returns count 3
    mockPrisma.inventoryLog.count.mockResolvedValue(3)

    // When querying the count
    const result = await execOp(
      `query InventoryLogCountByItem($itemId: ID!) { inventoryLogCountByItem(itemId: $itemId) }`,
      { itemId: 'item_1' },
    )

    // Then the count is 3
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.inventoryLogCountByItem).toBe(3)
  })
})

// ─── lastPurchaseDates ────────────────────────────────────────────────────────

describe('lastPurchaseDates', () => {
  it('user can get last purchase dates for multiple items — returns most recent positive-delta date per item', async () => {
    // Given two items with positive-delta logs
    const log1 = makeLog({ id: 'log_a', itemId: 'item_1', delta: 2, occurredAt: new Date('2026-01-20') })
    const log2 = makeLog({ id: 'log_b', itemId: 'item_2', delta: 3, occurredAt: new Date('2026-02-01') })
    mockPrisma.inventoryLog.findFirst
      .mockResolvedValueOnce(log1)
      .mockResolvedValueOnce(log2)

    // When querying lastPurchaseDates
    const result = await execOp(
      `query LastPurchaseDates($itemIds: [ID!]!) { lastPurchaseDates(itemIds: $itemIds) { itemId date } }`,
      { itemIds: ['item_1', 'item_2'] },
    )

    // Then the most recent positive-delta date is returned for each item
    expect(result?.errors).toBeUndefined()
    const results = result?.data?.lastPurchaseDates as { itemId: string; date: string | null }[]
    expect(results).toHaveLength(2)
    const r1 = results.find(r => r.itemId === 'item_1')
    const r2 = results.find(r => r.itemId === 'item_2')
    expect(r1?.date).toContain('2026-01-20')
    expect(r2?.date).toContain('2026-02-01')
  })

  it('last purchase date is null for items with no positive-delta logs', async () => {
    // Given no positive-delta log found
    mockPrisma.inventoryLog.findFirst.mockResolvedValue(null)

    // When querying lastPurchaseDates
    const result = await execOp(
      `query LastPurchaseDates($itemIds: [ID!]!) { lastPurchaseDates(itemIds: $itemIds) { itemId date } }`,
      { itemIds: ['item_1'] },
    )

    // Then date is null for that item
    expect(result?.errors).toBeUndefined()
    const results = result?.data?.lastPurchaseDates as { itemId: string; date: string | null }[]
    expect(results[0].date).toBeNull()
  })
})

// ─── addInventoryLog ──────────────────────────────────────────────────────────

describe('addInventoryLog', () => {
  it('user can add an inventory log', async () => {
    // Given prisma creates and returns a log
    const occurredAt = '2026-03-01T10:00:00.000Z'
    const log = makeLog({
      itemId: 'item_1',
      delta: 3,
      quantity: 5,
      occurredAt: new Date(occurredAt),
      note: 'restocked',
    })
    mockPrisma.inventoryLog.create.mockResolvedValue(log)

    // When adding an inventory log
    const result = await execOp(
      `mutation AddInventoryLog($itemId: ID!, $delta: Float!, $quantity: Float!, $occurredAt: String!, $note: String) {
        addInventoryLog(itemId: $itemId, delta: $delta, quantity: $quantity, occurredAt: $occurredAt, note: $note) {
          id itemId delta quantity occurredAt note
        }
      }`,
      { itemId: 'item_1', delta: 3, quantity: 5, occurredAt, note: 'restocked' },
    )

    // Then the log is created with the correct fields
    expect(result?.errors).toBeUndefined()
    const created = result?.data?.addInventoryLog as {
      id: string; itemId: string; delta: number; quantity: number; occurredAt: string; note: string | null
    }
    expect(created.id).toBeDefined()
    expect(created.itemId).toBe('item_1')
    expect(created.delta).toBe(3)
    expect(created.quantity).toBe(5)
    expect(created.occurredAt).toContain('2026-03-01')
    expect(created.note).toBe('restocked')
  })
})

// ─── Legacy null fields ───────────────────────────────────────────────────────

describe('legacy null fields', () => {
  it('itemLogs coalesces null quantity and delta to 0 for legacy records', async () => {
    // Given a legacy log with null quantity and delta
    const log = { ...makeLog(), delta: null, quantity: null }
    mockPrisma.inventoryLog.findMany.mockResolvedValue([log])

    // When querying itemLogs
    const result = await execOp(
      `query ItemLogs($itemId: ID!) { itemLogs(itemId: $itemId) { id delta quantity occurredAt } }`,
      { itemId: 'item_1' },
    )

    // Then quantity and delta are 0, not null (GraphQL non-nullable contract upheld)
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.itemLogs as { id: string; delta: number; quantity: number }[]
    expect(logs).toHaveLength(1)
    expect(logs[0].delta).toBe(0)
    expect(logs[0].quantity).toBe(0)
  })

  it('inventoryLogs coalesces null quantity and delta to 0 for legacy records', async () => {
    // Given a legacy log with null quantity and delta
    const log = { ...makeLog(), delta: null, quantity: null }
    mockPrisma.inventoryLog.findMany.mockResolvedValue([log])

    // When querying inventoryLogs
    const result = await execOp(`query InventoryLogs { inventoryLogs { id delta quantity occurredAt } }`)

    // Then quantity and delta are 0, not null (GraphQL non-nullable contract upheld)
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.inventoryLogs as { id: string; delta: number; quantity: number }[]
    expect(logs).toHaveLength(1)
    expect(logs[0].delta).toBe(0)
    expect(logs[0].quantity).toBe(0)
  })

  it('itemLogs returns epoch string for legacy records where occurredAt is null', async () => {
    // Given a legacy log with null occurredAt
    const log = makeLog({ occurredAt: null })
    mockPrisma.inventoryLog.findMany.mockResolvedValue([log])

    // When querying itemLogs
    const result = await execOp(
      `query ItemLogs($itemId: ID!) { itemLogs(itemId: $itemId) { id occurredAt } }`,
      { itemId: 'item_1' },
    )

    // Then occurredAt is the epoch string, not null (GraphQL non-nullable String! contract upheld)
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.itemLogs as { id: string; occurredAt: string }[]
    expect(logs).toHaveLength(1)
    expect(logs[0].occurredAt).toBe(new Date(0).toISOString())
  })

  it('inventoryLogs returns epoch string for legacy records where occurredAt is null', async () => {
    // Given a legacy log with null occurredAt
    const log = makeLog({ occurredAt: null })
    mockPrisma.inventoryLog.findMany.mockResolvedValue([log])

    // When querying inventoryLogs
    const result = await execOp(`query InventoryLogs { inventoryLogs { id occurredAt } }`)

    // Then occurredAt is the epoch string, not null (GraphQL non-nullable String! contract upheld)
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.inventoryLogs as { id: string; occurredAt: string }[]
    expect(logs).toHaveLength(1)
    expect(logs[0].occurredAt).toBe(new Date(0).toISOString())
  })
})

// ─── Cross-user isolation ─────────────────────────────────────────────────────

describe('cross-user isolation', () => {
  it('itemLogs is scoped to the requesting user — other users\' logs excluded', async () => {
    // Given prisma returns empty list for user B
    mockPrisma.inventoryLog.findMany.mockResolvedValue([])

    // When user B queries itemLogs for that item
    const result = await execOp(
      `query ItemLogs($itemId: ID!) { itemLogs(itemId: $itemId) { id } }`,
      { itemId: 'item_1' },
      { userId: 'user_B' },
    )

    // Then no logs are returned for user B
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.itemLogs).toHaveLength(0)
    expect(mockPrisma.inventoryLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user_B' }) }),
    )
  })

  it('lastPurchaseDates is scoped to the requesting user — other users\' logs excluded', async () => {
    // Given no positive-delta log found for user B
    mockPrisma.inventoryLog.findFirst.mockResolvedValue(null)

    // When user B queries lastPurchaseDates for that item
    const result = await execOp(
      `query LastPurchaseDates($itemIds: [ID!]!) { lastPurchaseDates(itemIds: $itemIds) { itemId date } }`,
      { itemIds: ['item_1'] },
      { userId: 'user_B' },
    )

    // Then date is null for user B (no logs belonging to them)
    expect(result?.errors).toBeUndefined()
    const results = result?.data?.lastPurchaseDates as { itemId: string; date: string | null }[]
    expect(results[0].date).toBeNull()
    expect(mockPrisma.inventoryLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user_B' }) }),
    )
  })
})
