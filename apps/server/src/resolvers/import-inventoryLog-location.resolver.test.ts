import { ApolloServer } from '@apollo/server'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── Why this file is separate from import.resolver.test.ts ──────────────────
//
// `import.resolver.test.ts` mocks EVERY Prisma model as a plain `vi.fn()` call
// recorder. A recorder hands back whatever the test told it to, so it cannot
// tell a right implementation from a wrong one here: it would return the same
// row whether `bulkCreateInventoryLogs` wrote the location the payload named,
// the caller's default, or a stranger's location, and `location.findFirst`
// would answer "yes, that location is yours" for any id at all — which is
// exactly the ownership check these tests exist to pin. Root CLAUDE.md, "Write
// test doubles to model the constraint, not the happy path".
//
// `vi.mock` is per FILE, so the stateful fakes cannot be mixed into that file
// without rewriting its seven existing tests. This file carries its own mock
// built from the two stateful fakes instead:
//
//   - `src/test/stockFake.ts` for `location`, so `ensureDefaultLocation` and
//     `requireLocationRole` run against real rows. Its `location.findFirst`
//     applies `where` key by key (`where.x === undefined || row.x === where.x`),
//     so dropping `userId` from the ownership query returns MORE rows and the
//     fixture sees it.
//   - `src/test/inventoryLogFake.ts` for `inventoryLog`, so a written row can
//     be read back and its `locationId` column inspected.
//
// `item` stays a small store of its own: the resolvers only ask "does this item
// exist".
vi.mock('../lib/prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const { createInventoryLogFake } = await import('../test/inventoryLogFake.js')
  const stock = createStockFake()
  const log = createInventoryLogFake()
  const items: { id: string }[] = []
  return {
    prisma: {
      ...stock.client,
      location: {
        ...stock.client.location,
        // Wrapped so a test can count HOW MANY ownership checks ran, on top of
        // the fake's real row matching.
        findFirst: vi.fn(stock.client.location.findFirst),
      },
      inventoryLog: {
        findUnique: vi.fn(log.client.findUnique),
        findMany: vi.fn(log.client.findMany),
        create: vi.fn(log.client.create),
        upsert: vi.fn(log.client.upsert),
      },
      item: {
        findUnique: vi.fn(
          async ({ where }: { where: { id: string } }) =>
            items.find((i) => i.id === where.id) ?? null,
        ),
      },
      // Handles onto the fakes, hung off the mocked client because a `vi.mock`
      // factory is hoisted above every import and cannot close over a
      // module-scope binding.
      $stockFake: stock,
      $logFake: log,
      $items: items,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { InventoryLogFake } from '../test/inventoryLogFake.js'
import type { StockFake } from '../test/stockFake.js'

const mockPrisma = prisma as unknown as {
  $stockFake: StockFake
  $logFake: InventoryLogFake
  $items: { id: string }[]
}

// ─── Server ──────────────────────────────────────────────────────────────────

let server: ApolloServer<Context>

beforeAll(async () => {
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

// ─── Fixture ─────────────────────────────────────────────────────────────────
//
// THREE locations, and the one the tests target is NOT the default. With a
// single-location fixture "the location the payload names" and "the caller's
// default" are the same answer, so a resolver that ignored the input entirely
// would still pass — the vacuous-fixture trap root CLAUDE.md describes.

const USER = 'user_import_test'
const STRANGER = 'user_stranger'

const LOC_DEFAULT = 'loc_kitchen' // USER's default
const LOC_OTHER = 'loc_garage' // USER's, NOT default — the target
const LOC_STRANGER = 'loc_theirs' // STRANGER's — must be refused

const ITEM = 'item_milk'

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$stockFake.reset([
    { id: LOC_OTHER, userId: USER, isDefault: false, name: 'Garage', order: 1, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') },
    { id: LOC_DEFAULT, userId: USER, isDefault: true, name: 'Kitchen', order: 0, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') },
    { id: LOC_STRANGER, userId: STRANGER, isDefault: true, name: 'Theirs', order: 0, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') },
  ])
  mockPrisma.$logFake.reset([])
  mockPrisma.$items.length = 0
  mockPrisma.$items.push({ id: ITEM })
})

// ─── Helpers ───────────────────────────────────────────────────────────────── 

const CONTEXT: Context = { userId: USER }

const BULK_CREATE_LOGS = `
  mutation BulkCreateInventoryLogs($logs: [InventoryLogInput!]!) {
    bulkCreateInventoryLogs(logs: $logs) { id itemId locationId }
  }
`

const BULK_UPSERT_LOGS = `
  mutation BulkUpsertInventoryLogs($logs: [InventoryLogInput!]!) {
    bulkUpsertInventoryLogs(logs: $logs) { id itemId locationId }
  }
`

function makeLogInput(
  overrides: { id: string } & Partial<Record<string, unknown>>,
): Record<string, unknown> {
  const { id, ...rest } = overrides
  return {
    id,
    itemId: ITEM,
    delta: 1,
    quantity: 1,
    occurredAt: '2026-03-01T10:00:00.000Z',
    ...rest,
  }
}

async function exec(query: string, logs: Record<string, unknown>[], ctx: Context = CONTEXT) {
  const response = await server.executeOperation(
    { query, variables: { logs } },
    { contextValue: ctx },
  )
  if (response.body.kind !== 'single') throw new Error('expected a single result')
  return response.body.singleResult
}

/** The `locationId` column actually stored for a log, read back from the fake. */
function storedLocationOf(id: string): string | undefined {
  return mockPrisma.$logFake.state.logs.find((l) => l.id === id)?.locationId
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('bulkCreateInventoryLogs — the location comes from the payload', () => {
  it('user importing a log that names a location gets it stored in that location', async () => {
    // Given a payload naming LOC_OTHER, which is the caller's NON-default location
    const logs = [makeLogInput({ id: 'log_1', locationId: LOC_OTHER })]

    // When the import runs
    const result = await exec(BULK_CREATE_LOGS, logs)

    // Then the stored row carries LOC_OTHER, not the caller's default
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf('log_1')).toBe(LOC_OTHER)
    expect(storedLocationOf('log_1')).not.toBe(LOC_DEFAULT)
    const returned = result.data?.bulkCreateInventoryLogs as { id: string; locationId: string }[]
    expect(returned).toEqual([{ id: 'log_1', itemId: ITEM, locationId: LOC_OTHER }])
  })

  it('user importing a log with no location gets it stored in their default location', async () => {
    // Given a payload from an older client, with no locationId at all
    const logs = [makeLogInput({ id: 'log_2' })]

    // When the import runs
    const result = await exec(BULK_CREATE_LOGS, logs)

    // Then it falls back to the caller's default location
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf('log_2')).toBe(LOC_DEFAULT)
  })

  it('user importing a log that names someone else is refused and nothing is written', async () => {
    // Given a payload naming a location belonging to STRANGER
    const logs = [makeLogInput({ id: 'log_3', locationId: LOC_STRANGER })]

    // When the import runs
    const result = await exec(BULK_CREATE_LOGS, logs)

    // Then the caller sees FORBIDDEN
    expect(result.errors?.[0]?.message).toBe('Forbidden')
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    // And no row was written — not into the stranger's location, and not
    // quietly into the caller's default either
    expect(mockPrisma.$logFake.state.logs).toHaveLength(0)
  })

  it('user importing a mix of good and forbidden rows gets nothing written at all', async () => {
    // Given one allowed row ahead of a forbidden one. The resolver is not
    // transactional, so the check must run BEFORE the write loop or the first
    // row would already be on disk when the second one throws.
    const logs = [
      makeLogInput({ id: 'log_ok', locationId: LOC_OTHER }),
      makeLogInput({ id: 'log_bad', locationId: LOC_STRANGER }),
    ]

    // When the import runs
    const result = await exec(BULK_CREATE_LOGS, logs)

    // Then it is refused and the allowed row was never written
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.$logFake.state.logs).toHaveLength(0)
  })

  it('checks each distinct location once, not once per row', async () => {
    // Given five rows across two locations
    const logs = [
      makeLogInput({ id: 'log_a', locationId: LOC_OTHER }),
      makeLogInput({ id: 'log_b', locationId: LOC_OTHER }),
      makeLogInput({ id: 'log_c', locationId: LOC_DEFAULT }),
      makeLogInput({ id: 'log_d', locationId: LOC_OTHER }),
      makeLogInput({ id: 'log_e', locationId: LOC_DEFAULT }),
    ]

    // When the import runs
    const result = await exec(BULK_CREATE_LOGS, logs)

    // Then every row landed where it said
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf('log_a')).toBe(LOC_OTHER)
    expect(storedLocationOf('log_c')).toBe(LOC_DEFAULT)
    // And the ownership check ran twice — once per DISTINCT location, not five
    // times. `ensureDefaultLocation` is not called at all, because no row
    // omitted a location.
    const locationFindFirst = (prisma as unknown as { location: { findFirst: ReturnType<typeof vi.fn> } }).location.findFirst
    expect(locationFindFirst).toHaveBeenCalledTimes(2)
  })
})

describe('bulkUpsertInventoryLogs — the location comes from the payload', () => {
  it('user re-importing a log that names a location gets it stored in that location', async () => {
    // Given a payload naming the caller's NON-default location, for a log id
    // that does not exist yet
    const logs = [makeLogInput({ id: 'log_u1', locationId: LOC_OTHER })]

    // When the upsert import runs
    const result = await exec(BULK_UPSERT_LOGS, logs)

    // Then the created row carries LOC_OTHER
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf('log_u1')).toBe(LOC_OTHER)
    expect(storedLocationOf('log_u1')).not.toBe(LOC_DEFAULT)
  })

  it('user re-importing a log with no location gets it stored in their default location', async () => {
    // Given a payload from an older client, with no locationId
    const logs = [makeLogInput({ id: 'log_u2' })]

    // When the upsert import runs
    const result = await exec(BULK_UPSERT_LOGS, logs)

    // Then it falls back to the caller's default location
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf('log_u2')).toBe(LOC_DEFAULT)
  })

  it('user re-importing a log that names someone else is refused and nothing is written', async () => {
    // Given a payload naming STRANGER's location
    const logs = [makeLogInput({ id: 'log_u3', locationId: LOC_STRANGER })]

    // When the upsert import runs
    const result = await exec(BULK_UPSERT_LOGS, logs)

    // Then the caller sees FORBIDDEN and no row exists
    expect(result.errors?.[0]?.message).toBe('Forbidden')
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.$logFake.state.logs).toHaveLength(0)
  })

  it('does not move an existing log when the payload names a different location', async () => {
    // Given a log already stored at LOC_DEFAULT
    await exec(BULK_UPSERT_LOGS, [makeLogInput({ id: 'log_u4', locationId: LOC_DEFAULT })])
    expect(storedLocationOf('log_u4')).toBe(LOC_DEFAULT)

    // When the same id is re-imported naming LOC_OTHER
    const result = await exec(BULK_UPSERT_LOGS, [
      makeLogInput({ id: 'log_u4', locationId: LOC_OTHER, quantity: 9 }),
    ])

    // Then the row's other columns update but its location does NOT move.
    // `locationId` belongs in the upsert's `create` only — carrying it into
    // `update` would relocate every log on each re-import.
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf('log_u4')).toBe(LOC_DEFAULT)
    expect(mockPrisma.$logFake.state.logs.find((l) => l.id === 'log_u4')?.quantity).toBe(9)
  })
})
