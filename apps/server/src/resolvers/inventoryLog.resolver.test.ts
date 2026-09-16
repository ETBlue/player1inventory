import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

// BOTH models are STATEFUL fakes.
//
// `inventoryLog` used to be four plain `vi.fn()` call recorders. A recorder
// returns whatever the test told it to return, so it cannot tell a
// location-scoped query apart from an unscoped one — drop `locationId` from
// the resolver's `where` and every assertion still passes. PR 3a Task 2
// replaced it with src/test/inventoryLogFake.ts, which applies the `where`
// itself. Each method is still wrapped in `vi.fn` so the `toHaveBeenCalledWith`
// assertions keep working on top of real state.
//
// `location` is src/test/stockFake.ts, because the resolvers resolve a
// location through `ensureDefaultLocation` and `requireLocationRole`, and a
// call recorder cannot answer "did it pick the caller's default one".
vi.mock('../lib/prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const { createInventoryLogFake } = await import('../test/inventoryLogFake.js')
  const stockFake = createStockFake()
  const logFake = createInventoryLogFake()
  return {
    prisma: {
      inventoryLog: {
        findMany: vi.fn(logFake.client.findMany),
        findFirst: vi.fn(logFake.client.findFirst),
        count: vi.fn(logFake.client.count),
        create: vi.fn(logFake.client.create),
      },
      ...stockFake.client,
      // Handles onto the fakes' state, hung off the mocked client because a
      // `vi.mock` factory is hoisted above every import and cannot close over
      // a module-scope binding.
      $stockFake: stockFake,
      $logFake: logFake,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import { makeInventoryLog } from '../test/inventoryLogFake.js'
import type { InventoryLogFake } from '../test/inventoryLogFake.js'
import type { StockFake } from '../test/stockFake.js'

const mockPrisma = prisma as unknown as {
  inventoryLog: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  $stockFake: StockFake
  $logFake: InventoryLogFake
}

// THREE locations: the caller's default, the caller's other one, and a
// stranger's. A one-location fixture cannot tell "reads the location I asked
// for" apart from "reads every location", nor "writes the caller's DEFAULT"
// apart from "writes whatever location it finds first" — root CLAUDE.md,
// "Proving a Test Works".
const USER = 'user_test123'
const STRANGER = 'user_other'
const LOC_DEFAULT = 'loc_kitchen'
const LOC_OTHER = 'loc_garage'
const LOC_STRANGER = 'loc_theirs'

function seedLocations() {
  mockPrisma.$stockFake.reset(
    [
      // Not first on purpose: a resolver taking `locations[0]` would still
      // pass if the default came first.
      { id: LOC_OTHER, userId: USER, isDefault: false },
      { id: LOC_DEFAULT, userId: USER, isDefault: true },
      { id: LOC_STRANGER, userId: STRANGER, isDefault: true },
    ],
    [],
  )
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
//
// Every item below has logs at BOTH of the caller's locations, and the counts
// and dates differ between them. That is what makes a missing `locationId`
// filter visible:
//
// | id     | item   | location    | owner | delta | occurredAt |
// |--------|--------|-------------|-------|-------|------------|
// | log_k1 | item_1 | LOC_DEFAULT | USER  |   +1  | 2026-01-01 |
// | log_k2 | item_1 | LOC_DEFAULT | USER  |   +2  | 2026-01-02 |
// | log_k3 | item_1 | LOC_DEFAULT | USER  |   +3  | 2026-01-03 |
// | log_g1 | item_1 | LOC_OTHER   | USER  |   +5  | 2026-01-10 |
// | log_g2 | item_1 | LOC_OTHER   | USER  |   -1  | 2026-01-11 |
// | log_k9 | item_2 | LOC_DEFAULT | USER  |   +4  | 2026-01-05 |
// | log_g9 | item_2 | LOC_OTHER   | USER  |   +7  | 2026-01-20 |
// | log_s1 | item_1 | LOC_STRANGER| STRANGER | +9 | 2026-02-01 |
//
// Counts differ per location (item_1: 3 at LOC_DEFAULT, 2 at LOC_OTHER, 5 if
// unscoped). Last purchase dates differ too (item_1: 2026-01-03 at
// LOC_DEFAULT, 2026-01-10 at LOC_OTHER, 2026-01-10 if unscoped). log_g2 is
// negative AND the most recent at LOC_OTHER, so it also pins the
// `delta: { gt: 0 }` filter.

function seedLogs() {
  mockPrisma.$logFake.reset([
    makeInventoryLog({ id: 'log_k1', itemId: 'item_1', userId: USER, locationId: LOC_DEFAULT, delta: 1, quantity: 1, occurredAt: new Date('2026-01-01T00:00:00.000Z') }),
    makeInventoryLog({ id: 'log_k2', itemId: 'item_1', userId: USER, locationId: LOC_DEFAULT, delta: 2, quantity: 3, occurredAt: new Date('2026-01-02T00:00:00.000Z') }),
    makeInventoryLog({ id: 'log_k3', itemId: 'item_1', userId: USER, locationId: LOC_DEFAULT, delta: 3, quantity: 6, occurredAt: new Date('2026-01-03T00:00:00.000Z') }),
    makeInventoryLog({ id: 'log_g1', itemId: 'item_1', userId: USER, locationId: LOC_OTHER, delta: 5, quantity: 5, occurredAt: new Date('2026-01-10T00:00:00.000Z') }),
    makeInventoryLog({ id: 'log_g2', itemId: 'item_1', userId: USER, locationId: LOC_OTHER, delta: -1, quantity: 4, occurredAt: new Date('2026-01-11T00:00:00.000Z') }),
    makeInventoryLog({ id: 'log_k9', itemId: 'item_2', userId: USER, locationId: LOC_DEFAULT, delta: 4, quantity: 4, occurredAt: new Date('2026-01-05T00:00:00.000Z') }),
    makeInventoryLog({ id: 'log_g9', itemId: 'item_2', userId: USER, locationId: LOC_OTHER, delta: 7, quantity: 7, occurredAt: new Date('2026-01-20T00:00:00.000Z') }),
    makeInventoryLog({ id: 'log_s1', itemId: 'item_1', userId: STRANGER, locationId: LOC_STRANGER, delta: 9, quantity: 9, occurredAt: new Date('2026-02-01T00:00:00.000Z') }),
  ])
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let server: ApolloServer<Context>
const ctx: Context = { userId: USER }

beforeEach(async () => {
  vi.clearAllMocks()
  seedLocations()
  seedLogs()
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function execOp(query: string, variables?: Record<string, unknown>, context = ctx) {
  const r = await server.executeOperation({ query, variables }, { contextValue: context })
  return r.body.kind === 'single' ? r.body.singleResult : null
}

const ITEM_LOGS = `query ItemLogs($itemId: ID!, $locationId: ID) {
  itemLogs(itemId: $itemId, locationId: $locationId) { id delta quantity occurredAt }
}`

const LOG_COUNT = `query Count($itemId: ID!, $locationId: ID) {
  inventoryLogCountByItem(itemId: $itemId, locationId: $locationId)
}`

const LAST_PURCHASE = `query LastPurchaseDates($itemIds: [ID!]!, $locationId: ID) {
  lastPurchaseDates(itemIds: $itemIds, locationId: $locationId) { itemId date }
}`

const ADD_LOG = `mutation AddInventoryLog($itemId: ID!, $delta: Float!, $quantity: Float!, $occurredAt: String!, $locationId: ID, $note: String) {
  addInventoryLog(itemId: $itemId, delta: $delta, quantity: $quantity, occurredAt: $occurredAt, locationId: $locationId, note: $note) {
    id itemId delta quantity occurredAt note
  }
}`

type LogRow = { id: string; delta: number; quantity: number; occurredAt: string }

function errorCode(result: { errors?: readonly { extensions?: Record<string, unknown> }[] } | null) {
  return result?.errors?.[0]?.extensions?.code
}

// ─── itemLogs ────────────────────────────────────────────────────────────────

describe('itemLogs', () => {
  it('user can get item logs at one location — only that location\'s logs, oldest first', async () => {
    // Given item_1 has 3 logs at LOC_DEFAULT and 2 at LOC_OTHER (see fixture table)

    // When the user asks for item_1 at LOC_DEFAULT
    const result = await execOp(ITEM_LOGS, { itemId: 'item_1', locationId: LOC_DEFAULT })

    // Then only the 3 LOC_DEFAULT logs come back, sorted by occurredAt ascending
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.itemLogs as LogRow[]
    expect(logs.map((l) => l.id)).toEqual(['log_k1', 'log_k2', 'log_k3'])
    expect(logs.map((l) => l.delta)).toEqual([1, 2, 3])
  })

  it('user can get item logs at their other location — a different set of logs', async () => {
    // Given the same item also has logs at LOC_OTHER

    // When the user asks for item_1 at LOC_OTHER
    const result = await execOp(ITEM_LOGS, { itemId: 'item_1', locationId: LOC_OTHER })

    // Then only the LOC_OTHER logs come back, and none of the LOC_DEFAULT ones
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.itemLogs as LogRow[]
    expect(logs.map((l) => l.id)).toEqual(['log_g1', 'log_g2'])
    expect(logs.map((l) => l.id)).not.toContain('log_k1')
  })

  it('user can get item logs — returns empty array when the item has no logs at that location', async () => {
    // Given item_2 has no logs at all under id 'item_none'

    // When the user asks for an item with no logs
    const result = await execOp(ITEM_LOGS, { itemId: 'item_none', locationId: LOC_DEFAULT })

    // Then an empty array is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.itemLogs).toHaveLength(0)
  })

  it('omitting locationId reads the caller\'s default location', async () => {
    // Given the caller's default location is LOC_DEFAULT, not LOC_OTHER

    // When the user omits locationId
    const result = await execOp(ITEM_LOGS, { itemId: 'item_1' })

    // Then the LOC_DEFAULT logs come back, not the LOC_OTHER ones
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.itemLogs as LogRow[]
    expect(logs.map((l) => l.id)).toEqual(['log_k1', 'log_k2', 'log_k3'])
  })
})

// ─── inventoryLogCountByItem ──────────────────────────────────────────────────

describe('inventoryLogCountByItem', () => {
  it('user can get the log count for an item at one location', async () => {
    // Given item_1 has 3 logs at LOC_DEFAULT, 2 at LOC_OTHER, 5 in total

    // When the user counts item_1 at LOC_DEFAULT
    const atDefault = await execOp(LOG_COUNT, { itemId: 'item_1', locationId: LOC_DEFAULT })

    // Then the count is 3, not 5
    expect(atDefault?.errors).toBeUndefined()
    expect(atDefault?.data?.inventoryLogCountByItem).toBe(3)

    // And counting at the other location gives 2
    const atOther = await execOp(LOG_COUNT, { itemId: 'item_1', locationId: LOC_OTHER })
    expect(atOther?.data?.inventoryLogCountByItem).toBe(2)
  })

  it('omitting locationId counts at the caller\'s default location', async () => {
    // When the user omits locationId
    const result = await execOp(LOG_COUNT, { itemId: 'item_1' })

    // Then the LOC_DEFAULT count is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.inventoryLogCountByItem).toBe(3)
  })
})

// ─── lastPurchaseDates ────────────────────────────────────────────────────────

type DateRow = { itemId: string; date: string | null }

describe('lastPurchaseDates', () => {
  it('user can get last purchase dates at one location — most recent positive-delta log per item', async () => {
    // Given item_1's latest purchase is 2026-01-03 at LOC_DEFAULT and
    // 2026-01-10 at LOC_OTHER, and item_2's is 2026-01-05 at LOC_DEFAULT

    // When the user asks at LOC_DEFAULT
    const result = await execOp(LAST_PURCHASE, { itemIds: ['item_1', 'item_2'], locationId: LOC_DEFAULT })

    // Then each item's LOC_DEFAULT date is returned, not its LOC_OTHER one
    expect(result?.errors).toBeUndefined()
    const rows = result?.data?.lastPurchaseDates as DateRow[]
    expect(rows.find((r) => r.itemId === 'item_1')?.date).toContain('2026-01-03')
    expect(rows.find((r) => r.itemId === 'item_2')?.date).toContain('2026-01-05')
  })

  it('last purchase date at another location is that location\'s date, and skips negative deltas', async () => {
    // Given LOC_OTHER holds a +5 log on 2026-01-10 and a MORE RECENT -1 log on
    // 2026-01-11. Only the positive one is a purchase.

    // When the user asks at LOC_OTHER
    const result = await execOp(LAST_PURCHASE, { itemIds: ['item_1'], locationId: LOC_OTHER })

    // Then the date is the +5 log's, not the newer -1 log's
    expect(result?.errors).toBeUndefined()
    const rows = result?.data?.lastPurchaseDates as DateRow[]
    expect(rows[0].date).toContain('2026-01-10')
    expect(rows[0].date).not.toContain('2026-01-11')
  })

  it('last purchase date is null for items with no positive-delta logs at that location', async () => {
    // When the user asks about an item with no logs
    const result = await execOp(LAST_PURCHASE, { itemIds: ['item_none'], locationId: LOC_DEFAULT })

    // Then date is null for that item
    expect(result?.errors).toBeUndefined()
    const rows = result?.data?.lastPurchaseDates as DateRow[]
    expect(rows[0].date).toBeNull()
  })

  it('omitting locationId reads the caller\'s default location', async () => {
    // When the user omits locationId
    const result = await execOp(LAST_PURCHASE, { itemIds: ['item_1'] })

    // Then the LOC_DEFAULT date is returned
    const rows = result?.data?.lastPurchaseDates as DateRow[]
    expect(rows[0].date).toContain('2026-01-03')
  })
})

// ─── inventoryLogs (the export path) ──────────────────────────────────────────

describe('inventoryLogs', () => {
  it('returns every log the caller owns, across every location', async () => {
    // Given the caller owns 5 item_1/item_2 logs spread over TWO locations, and
    // a stranger owns one more. This query is the export/import snapshot path
    // (exportData.ts, importData.ts), so it must not be location-scoped.

    // When the caller exports
    const result = await execOp(`query InventoryLogs { inventoryLogs { id } }`)

    // Then all 7 of the caller's logs come back, from both locations, and the
    // stranger's is excluded
    expect(result?.errors).toBeUndefined()
    const ids = (result?.data?.inventoryLogs as { id: string }[]).map((l) => l.id)
    expect(ids).toHaveLength(7)
    expect(ids).toContain('log_k1')
    expect(ids).toContain('log_g1')
    expect(ids).not.toContain('log_s1')
  })
})

// ─── addInventoryLog ──────────────────────────────────────────────────────────

describe('addInventoryLog', () => {
  it('user can add an inventory log at the location they named', async () => {
    // Given the caller names LOC_OTHER, which is NOT their default location
    const occurredAt = '2026-03-01T10:00:00.000Z'
    const result = await execOp(ADD_LOG, {
      itemId: 'item_new', delta: 3, quantity: 5, occurredAt, locationId: LOC_OTHER, note: 'restocked',
    })

    // Then the log is created with the correct fields
    expect(result?.errors).toBeUndefined()
    const created = result?.data?.addInventoryLog as {
      id: string; itemId: string; delta: number; quantity: number; occurredAt: string; note: string | null
    }
    expect(created.itemId).toBe('item_new')
    expect(created.delta).toBe(3)
    expect(created.quantity).toBe(5)
    expect(created.note).toBe('restocked')

    // And it is readable back AT LOC_OTHER
    const atOther = await execOp(ITEM_LOGS, { itemId: 'item_new', locationId: LOC_OTHER })
    expect((atOther?.data?.itemLogs as LogRow[]).map((l) => l.delta)).toEqual([3])

    // And NOT at the caller's default location
    const atDefault = await execOp(ITEM_LOGS, { itemId: 'item_new', locationId: LOC_DEFAULT })
    expect(atDefault?.data?.itemLogs).toHaveLength(0)
  })

  it('omitting locationId writes the caller\'s default location, not another of theirs and not a stranger\'s', async () => {
    // When the caller omits locationId
    await execOp(ADD_LOG, {
      itemId: 'item_new', delta: 1, quantity: 1, occurredAt: '2026-03-01T10:00:00.000Z',
    })

    // Then the row landed at LOC_DEFAULT
    const written = mockPrisma.$logFake.state.logs.find((l) => l.itemId === 'item_new')
    expect(written?.locationId).toBe(LOC_DEFAULT)
    expect(written?.locationId).not.toBe(LOC_OTHER)
    expect(written?.locationId).not.toBe(LOC_STRANGER)
  })
})

// ─── Authorization ────────────────────────────────────────────────────────────

describe('authorization — a caller-supplied locationId goes through requireLocationRole', () => {
  it('itemLogs is refused for a location the caller holds no role on', async () => {
    // Given LOC_STRANGER belongs to another user

    // When the caller asks for its logs
    const result = await execOp(ITEM_LOGS, { itemId: 'item_1', locationId: LOC_STRANGER })

    // Then the request is refused with FORBIDDEN. Asserting on the ERROR, not
    // on an empty row list: the `userId` scope in the where clause would also
    // return zero rows, so a row-count assertion could not tell the guard
    // apart from the scope.
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(result?.data?.itemLogs).toBeFalsy()
  })

  it('inventoryLogCountByItem is refused for a location the caller holds no role on', async () => {
    const result = await execOp(LOG_COUNT, { itemId: 'item_1', locationId: LOC_STRANGER })
    expect(errorCode(result)).toBe('FORBIDDEN')
  })

  it('lastPurchaseDates is refused for a location the caller holds no role on', async () => {
    const result = await execOp(LAST_PURCHASE, { itemIds: ['item_1'], locationId: LOC_STRANGER })
    expect(errorCode(result)).toBe('FORBIDDEN')
  })

  it('addInventoryLog is refused for a location the caller holds no role on, and writes nothing', async () => {
    // Given the count of stored logs before the attempt
    const before = mockPrisma.$logFake.state.logs.length

    // When the caller tries to write into the stranger's location
    const result = await execOp(ADD_LOG, {
      itemId: 'item_1', delta: 1, quantity: 1, occurredAt: '2026-03-01T10:00:00.000Z', locationId: LOC_STRANGER,
    })

    // Then it is refused and no row was created
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$logFake.state.logs).toHaveLength(before)
  })

  it('an unknown location id is refused the same way, so ids cannot be probed', async () => {
    // Given an id that matches no location at all
    const result = await execOp(ITEM_LOGS, { itemId: 'item_1', locationId: 'loc_does_not_exist' })

    // Then the error is FORBIDDEN, indistinguishable from "not yours"
    expect(errorCode(result)).toBe('FORBIDDEN')
  })
})

// ─── Legacy null fields ───────────────────────────────────────────────────────

describe('legacy null fields', () => {
  it('itemLogs coalesces null quantity and delta to 0 for legacy records', async () => {
    // Given a single legacy log with null quantity and delta
    mockPrisma.$logFake.reset([
      makeInventoryLog({ id: 'log_legacy', itemId: 'item_1', userId: USER, locationId: LOC_DEFAULT, delta: null, quantity: null }),
    ])

    // When querying itemLogs
    const result = await execOp(ITEM_LOGS, { itemId: 'item_1', locationId: LOC_DEFAULT })

    // Then quantity and delta are 0, not null (GraphQL non-nullable contract upheld)
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.itemLogs as LogRow[]
    expect(logs).toHaveLength(1)
    expect(logs[0].delta).toBe(0)
    expect(logs[0].quantity).toBe(0)
  })

  it('inventoryLogs coalesces null quantity and delta to 0 for legacy records', async () => {
    // Given a single legacy log with null quantity and delta
    mockPrisma.$logFake.reset([
      makeInventoryLog({ id: 'log_legacy', itemId: 'item_1', userId: USER, locationId: LOC_DEFAULT, delta: null, quantity: null }),
    ])

    // When querying inventoryLogs
    const result = await execOp(`query InventoryLogs { inventoryLogs { id delta quantity occurredAt } }`)

    // Then quantity and delta are 0, not null
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.inventoryLogs as LogRow[]
    expect(logs).toHaveLength(1)
    expect(logs[0].delta).toBe(0)
    expect(logs[0].quantity).toBe(0)
  })

  it('itemLogs returns epoch string for legacy records where occurredAt is null', async () => {
    // Given a single legacy log with null occurredAt
    mockPrisma.$logFake.reset([
      makeInventoryLog({ id: 'log_legacy', itemId: 'item_1', userId: USER, locationId: LOC_DEFAULT, occurredAt: null }),
    ])

    // When querying itemLogs
    const result = await execOp(ITEM_LOGS, { itemId: 'item_1', locationId: LOC_DEFAULT })

    // Then occurredAt is the epoch string, not null (String! contract upheld)
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.itemLogs as LogRow[]
    expect(logs).toHaveLength(1)
    expect(logs[0].occurredAt).toBe(new Date(0).toISOString())
  })

  it('inventoryLogs returns epoch string for legacy records where occurredAt is null', async () => {
    // Given a single legacy log with null occurredAt
    mockPrisma.$logFake.reset([
      makeInventoryLog({ id: 'log_legacy', itemId: 'item_1', userId: USER, locationId: LOC_DEFAULT, occurredAt: null }),
    ])

    // When querying inventoryLogs
    const result = await execOp(`query InventoryLogs { inventoryLogs { id occurredAt } }`)

    // Then occurredAt is the epoch string, not null
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.inventoryLogs as LogRow[]
    expect(logs).toHaveLength(1)
    expect(logs[0].occurredAt).toBe(new Date(0).toISOString())
  })
})

// ─── Cross-user isolation ─────────────────────────────────────────────────────

describe('cross-user isolation', () => {
  it('itemLogs is scoped to the requesting user — other users\' logs excluded', async () => {
    // Given user_B has no locations yet, so ensureDefaultLocation makes one

    // When user_B queries itemLogs for an item the stranger has logs for
    const result = await execOp(ITEM_LOGS, { itemId: 'item_1' }, { userId: 'user_B' })

    // Then no logs are returned for user_B
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.itemLogs).toHaveLength(0)
    expect(mockPrisma.inventoryLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user_B' }) }),
    )
  })

  it('lastPurchaseDates is scoped to the requesting user — other users\' logs excluded', async () => {
    // When user_B queries lastPurchaseDates for that item
    const result = await execOp(LAST_PURCHASE, { itemIds: ['item_1'] }, { userId: 'user_B' })

    // Then date is null for user_B (no logs belonging to them)
    expect(result?.errors).toBeUndefined()
    const rows = result?.data?.lastPurchaseDates as DateRow[]
    expect(rows[0].date).toBeNull()
    expect(mockPrisma.inventoryLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user_B' }) }),
    )
  })
})
