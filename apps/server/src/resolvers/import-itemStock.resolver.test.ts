import { ApolloServer } from '@apollo/server'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── Why this file is separate from import.resolver.test.ts ──────────────────
//
// `import.resolver.test.ts` mocks every Prisma model as a plain `vi.fn()` call
// recorder, and at `:195` it does
//
//   p.location.findFirst.mockResolvedValue(DEFAULT_LOCATION)
//
// which answers "yes, that location is yours" for ANY id, a stranger's
// included. An ownership check written against that file's stubs therefore
// cannot fail, and a recorder cannot show which `locationId` column a row was
// written to. Root CLAUDE.md, "Write test doubles to model the constraint, not
// the happy path". `vi.mock` is per FILE, so the stateful fake cannot be mixed
// into that file without rewriting its seven existing tests. Tasks 3, 4 and 5
// each wrote their own file for the same reason; this is the fourth.
//
// `src/test/stockFake.ts` carries most of it, plus a small `item` store below
// because `requireOwnItemStockRefs` scopes `itemId` to the caller and
// `stockFake` owns no `item` model. Five things about those fakes carry these
// tests:
//
//   - `findUnique` / `findFirst` apply `where` key by key
//     (`where.x === undefined || row.x === where.x`), so dropping `userId`
//     from a scoped lookup returns MORE rows and the fixture sees it.
//   - `itemStock.create` HONOURS `data.id`, `data.createdAt` and
//     `data.updatedAt`, so "the payload's values are preserved" is an
//     assertion that can fail. Before task 6 it threw all three away and
//     generated `stock-N` — the same hole task 3 found in `inventoryLogFake`
//     and task 5 in `location.create`.
//   - `itemStock.create` enforces BOTH of this model's unique constraints with
//     P2002: the primary key on `id`, and `@@unique([itemId, locationId])`
//     (schema.prisma:282). That is what makes "two payload rows for one pair"
//     a test that can fail rather than a hope.
//   - `itemStock.upsert` keeps `create` and `update` apart and applies
//     `update` key by key, including `itemId` and `locationId`, which is what
//     makes a MOVED row visible.
//   - `itemStock.delete` throws when nothing matches, so the stale-pair drop
//     cannot silently no-op.
vi.mock('../lib/prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const stock = createStockFake()

  // A minimal stateful `item` store. Only `findFirst` is needed —
  // `requireOwnItemStockRefs` asks "does the caller own this item id" and
  // reads nothing else. It applies `where` key by key, Prisma's own semantics,
  // so a resolver that drops `userId` from the filter matches MORE rows and
  // the two-user fixture sees it. A `vi.fn()` told to resolve to a row would
  // pass against a resolver with no item scope at all.
  const items: { id: string; userId: string }[] = []
  const item = {
    findFirst: vi.fn(async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
      items.find(
        (i) =>
          (where.id === undefined || i.id === where.id) &&
          (where.userId === undefined || i.userId === where.userId),
      ) ?? null,
    ),
  }

  return {
    prisma: {
      ...stock.client,
      item,
      itemStock: {
        ...stock.client.itemStock,
        // Wrapped so a test can count HOW MANY lookups ran, on top of the
        // fake's real row matching.
        findUnique: vi.fn(stock.client.itemStock.findUnique),
        findFirst: vi.fn(stock.client.itemStock.findFirst),
      },
      location: {
        ...stock.client.location,
        findFirst: vi.fn(stock.client.location.findFirst),
      },
      // Handles onto the fakes, hung off the mocked client because a `vi.mock`
      // factory is hoisted above every import and cannot close over a
      // module-scope binding.
      $stockFake: stock,
      $items: items,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { StockFake } from '../test/stockFake.js'

const mockPrisma = prisma as unknown as {
  $stockFake: StockFake
  $items: { id: string; userId: string }[]
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
// THREE LOCATIONS, two of them the caller's. This is the single most important
// property of this file. With ONE location, "the location the row names" and
// "the caller's default location" give the SAME answer, so a resolver that
// ignored `locationId` entirely and wrote everything to the default would pass
// every assertion — the vacuous-fixture trap root CLAUDE.md describes, which
// shipped four useless tests in PR D. `LOC_OTHER` is the caller's and is NOT
// the default, so a hardcoded default is visible. `LOC_STRANGER` belongs to
// another account, so an unscoped lookup is visible too.
//
// TWO ITEMS, likewise: `ITEM_THEIRS` is the stranger's, which is the only way
// the itemId guard can be told apart from no guard at all.

const USER = 'user_import_stock_test'
const STRANGER = 'user_stranger'

const LOC_DEFAULT = 'loc_kitchen' // USER's default
const LOC_OTHER = 'loc_garage' // USER's, NOT default
const LOC_STRANGER = 'loc_theirs' // STRANGER's — must be refused

const ITEM_A = 'item_milk' // USER's
const ITEM_B = 'item_rice' // USER's
const ITEM_THEIRS = 'item_theirs' // STRANGER's — must be refused

const TS = new Date('2026-01-01T00:00:00.000Z')
const PAYLOAD_CREATED = '2026-02-03T04:05:06.000Z'
const PAYLOAD_UPDATED = '2026-03-04T05:06:07.000Z'
const PAYLOAD_DUE = '2026-04-05T06:07:08.000Z'

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$stockFake.reset([
    { id: LOC_DEFAULT, userId: USER, isDefault: true, name: 'Kitchen', order: 0, createdAt: TS, updatedAt: TS },
    { id: LOC_OTHER, userId: USER, isDefault: false, name: 'Garage', order: 1, createdAt: TS, updatedAt: TS },
    { id: LOC_STRANGER, userId: STRANGER, isDefault: true, name: 'Theirs', order: 0, createdAt: TS, updatedAt: TS },
  ])
  mockPrisma.$items.length = 0
  mockPrisma.$items.push(
    { id: ITEM_A, userId: USER },
    { id: ITEM_B, userId: USER },
    { id: ITEM_THEIRS, userId: STRANGER },
  )
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTEXT: Context = { userId: USER }

const FIELDS = `{
  id itemId locationId
  targetQuantity refillThreshold packedQuantity unpackedQuantity
  dueDate createdAt updatedAt
}`

const BULK_CREATE = `
  mutation BulkCreateItemStocks($itemStocks: [ItemStockImportInput!]!) {
    bulkCreateItemStocks(itemStocks: $itemStocks) ${FIELDS}
  }
`

const BULK_UPSERT = `
  mutation BulkUpsertItemStocks($itemStocks: [ItemStockImportInput!]!) {
    bulkUpsertItemStocks(itemStocks: $itemStocks) ${FIELDS}
  }
`

async function exec(
  query: string,
  itemStocks: Record<string, unknown>[],
  ctx: Context = CONTEXT,
) {
  const response = await server.executeOperation(
    { query, variables: { itemStocks } },
    { contextValue: ctx },
  )
  if (response.body.kind !== 'single') throw new Error('expected a single result')
  return response.body.singleResult
}

function input(
  id: string,
  itemId: string,
  locationId: string,
  over: Record<string, unknown> = {},
) {
  return {
    id,
    itemId,
    locationId,
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 2,
    unpackedQuantity: 0.5,
    dueDate: PAYLOAD_DUE,
    createdAt: PAYLOAD_CREATED,
    updatedAt: PAYLOAD_UPDATED,
    ...over,
  }
}

/** Every stored row, read back out of the fake rather than out of the result. */
function stored() {
  return mockPrisma.$stockFake.state.itemStocks
}

function storedRow(id: string) {
  return stored().find((s) => s.id === id)
}

function storedPair(itemId: string, locationId: string) {
  return stored().filter((s) => s.itemId === itemId && s.locationId === locationId)
}

// ─── Creating ────────────────────────────────────────────────────────────────

describe('bulkCreateItemStocks', () => {
  it('user importing stock gets each row in the location its own payload names', async () => {
    // Given two rows naming DIFFERENT locations — one the caller's NON-default
    // location, one the default. Both locations are the caller's, so neither
    // is refused; the only thing separating a correct resolver from one that
    // writes everything to the default is WHICH location each row lands in.
    //
    // The two rows name DIFFERENT ITEMS on purpose. With one item at two
    // locations, a resolver hardcoding the default would make both rows the
    // same (itemId, locationId) pair and die with P2002 — so the test would go
    // red for a COLLISION rather than for a wrong location, and the assertion
    // below would never run. Different items mean the wrong location SUCCEEDS
    // and has to be caught by reading the column.
    const payload = [
      input('stock_a_other', ITEM_A, LOC_OTHER, { packedQuantity: 9 }),
      input('stock_b_default', ITEM_B, LOC_DEFAULT),
    ]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then each row sits in the location IT named, under the payload's own id
    expect(result.errors).toBeUndefined()
    expect(storedRow('stock_a_other')).toMatchObject({
      itemId: ITEM_A,
      locationId: LOC_OTHER,
      packedQuantity: 9,
    })
    expect(storedRow('stock_b_default')).toMatchObject({
      itemId: ITEM_B,
      locationId: LOC_DEFAULT,
      packedQuantity: 2,
    })
    // And nothing was collapsed onto one location
    expect(new Set(stored().map((s) => s.locationId))).toEqual(
      new Set([LOC_DEFAULT, LOC_OTHER]),
    )
  })

  it('user importing one item stocked in two locations gets a row in each', async () => {
    // Given ONE item at both of the caller's locations. This is the shape the
    // whole feature exists for — the same item tracked in the Kitchen and in
    // the Garage with different quantities — and it is the shape a flat import
    // surface cannot express at all. Before this mutation existed, both rows
    // would have been collapsed into the caller's default by
    // `mirrorStockToDefaultLocation`.
    const payload = [
      input('stock_a_kitchen', ITEM_A, LOC_DEFAULT, { packedQuantity: 1 }),
      input('stock_a_garage', ITEM_A, LOC_OTHER, { packedQuantity: 6 }),
    ]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then two rows exist, one per location, with their own quantities
    expect(result.errors).toBeUndefined()
    expect(storedRow('stock_a_kitchen')).toMatchObject({
      locationId: LOC_DEFAULT,
      packedQuantity: 1,
    })
    expect(storedRow('stock_a_garage')).toMatchObject({
      locationId: LOC_OTHER,
      packedQuantity: 6,
    })
    expect(stored()).toHaveLength(2)
  })

  it('user importing stock gets every quantity column from the payload', async () => {
    // Given one row carrying all four quantities
    const payload = [
      input('stock_q', ITEM_B, LOC_OTHER, {
        targetQuantity: 7,
        refillThreshold: 3,
        packedQuantity: 5,
        unpackedQuantity: 0.25,
      }),
    ]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then all four are stored as given
    expect(result.errors).toBeUndefined()
    expect(storedRow('stock_q')).toMatchObject({
      targetQuantity: 7,
      refillThreshold: 3,
      packedQuantity: 5,
      unpackedQuantity: 0.25,
    })
  })

  it('user sees imported stock dates as ISO strings, not epoch milliseconds', async () => {
    // Given a row carrying all three date fields.
    // (PR 1 shipped this bug at every return site: the default String scalar
    // serializer coerces a Date through Date.valueOf() — epoch milliseconds —
    // before toJSON() ever runs. Task 1 hit it again on `allItemStocks`.)
    const payload = [input('stock_dated', ITEM_A, LOC_OTHER)]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then the GraphQL result carries ISO strings for all three
    const returned = (result.data?.bulkCreateItemStocks as Record<string, string>[])[0]
    expect(returned.createdAt).toBe(PAYLOAD_CREATED)
    expect(returned.updatedAt).toBe(PAYLOAD_UPDATED)
    expect(returned.dueDate).toBe(PAYLOAD_DUE)
  })

  it('user importing stock with no due date gets null, not a date', async () => {
    // Given a row whose dueDate is absent — the common case, since dueDate is
    // the only nullable column on the model
    const payload = [input('stock_nodue', ITEM_A, LOC_OTHER, { dueDate: null })]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then the stored row and the result both carry null
    expect(result.errors).toBeUndefined()
    expect(storedRow('stock_nodue')?.dueDate).toBeNull()
    const returned = (result.data?.bulkCreateItemStocks as Record<string, unknown>[])[0]
    expect(returned.dueDate).toBeNull()
  })

  it('user re-importing stock they already have keeps the stored row unchanged', async () => {
    // Given a stored row with packedQuantity 11
    mockPrisma.$stockFake.reset(mockPrisma.$stockFake.state.locations, [
      {
        id: 'stock_existing',
        itemId: ITEM_A,
        locationId: LOC_OTHER,
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 11,
        unpackedQuantity: 0,
        dueDate: null,
        createdAt: TS,
        updatedAt: TS,
      },
    ])

    // When a "skip conflicts" import names that same id with new numbers
    const result = await exec(BULK_CREATE, [
      input('stock_existing', ITEM_A, LOC_OTHER, { packedQuantity: 99 }),
    ])

    // Then the stored row is untouched — bulkCreate skips, it does not replace
    expect(result.errors).toBeUndefined()
    expect(storedRow('stock_existing')).toMatchObject({
      packedQuantity: 11,
      targetQuantity: 1,
      createdAt: TS,
      updatedAt: TS,
    })
    expect(stored()).toHaveLength(1)
  })

  it('user importing two rows for one item and location gets only one row', async () => {
    // Given two payload rows with DIFFERENT ids on the SAME (item, location)
    // pair. `@@unique([itemId, locationId])` (schema.prisma:282) means the
    // second insert raises P2002, and under the "clear & import" strategy an
    // unhandled P2002 arrives AFTER clearAllData has run — the account is left
    // empty and the import dead.
    const payload = [
      input('stock_dup_first', ITEM_A, LOC_OTHER, { packedQuantity: 1 }),
      input('stock_dup_second', ITEM_A, LOC_OTHER, { packedQuantity: 2 }),
    ]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then there is no error at all — not a P2002 surfaced as "Unexpected"
    expect(result.errors).toBeUndefined()

    // And exactly one row holds the pair. The FIRST wins, which is what
    // "skip conflicts" means.
    expect(storedPair(ITEM_A, LOC_OTHER)).toHaveLength(1)
    expect(storedRow('stock_dup_first')).toMatchObject({ packedQuantity: 1 })
    expect(storedRow('stock_dup_second')).toBeUndefined()
  })

  it('user importing stock for a pair they already hold keeps the stored row', async () => {
    // Given a stored row on (ITEM_A, LOC_OTHER) under one id
    mockPrisma.$stockFake.reset(mockPrisma.$stockFake.state.locations, [
      {
        id: 'stock_stored',
        itemId: ITEM_A,
        locationId: LOC_OTHER,
        targetQuantity: 1,
        refillThreshold: 0,
        packedQuantity: 11,
        unpackedQuantity: 0,
        dueDate: null,
        createdAt: TS,
        updatedAt: TS,
      },
    ])

    // When a skip-conflicts import names the same PAIR under a DIFFERENT id
    const result = await exec(BULK_CREATE, [
      input('stock_from_backup', ITEM_A, LOC_OTHER, { packedQuantity: 77 }),
    ])

    // Then no P2002 escaped, and the stored row is still the only one
    expect(result.errors).toBeUndefined()
    expect(storedPair(ITEM_A, LOC_OTHER)).toHaveLength(1)
    expect(storedRow('stock_stored')).toMatchObject({ packedQuantity: 11 })
    expect(storedRow('stock_from_backup')).toBeUndefined()
  })

  it('user cannot import stock into another account’s location', async () => {
    // Given a payload naming STRANGER's location
    const payload = [input('stock_into_theirs', ITEM_A, LOC_STRANGER)]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then it is refused through requireLocationRole, which reports FORBIDDEN
    // indistinguishably from "not found"
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')

    // And nothing was written into the stranger's location
    expect(stored()).toHaveLength(0)
  })

  it('user cannot import stock for another account’s item', async () => {
    // Given a payload whose locationId is the caller's own but whose itemId is
    // the stranger's. `ItemStock` has NO userId column (root CLAUDE.md), so
    // without an item-scoped check this row would be written and the caller's
    // pantry would show quantities for an item they do not own.
    const payload = [input('stock_their_item', ITEM_THEIRS, LOC_OTHER)]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then it is refused, with the same FORBIDDEN a wrong location gets
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(stored()).toHaveLength(0)
  })

  it('user cannot import stock under an id another account’s row already holds', async () => {
    // Given a stock row that lives in the STRANGER's location
    mockPrisma.$stockFake.reset(mockPrisma.$stockFake.state.locations, [
      {
        id: 'stock_contested',
        itemId: ITEM_THEIRS,
        locationId: LOC_STRANGER,
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 8,
        unpackedQuantity: 0,
        dueDate: null,
        createdAt: TS,
        updatedAt: TS,
      },
    ])

    // When the caller imports their own row under that same id
    const result = await exec(BULK_CREATE, [input('stock_contested', ITEM_A, LOC_OTHER)])

    // Then it is refused. Without the id pre-check the house style would
    // instead have found the row with an unscoped `findUnique` and `continue`d
    // — SILENTLY DROPPING the caller's own stock, with no error anywhere, and
    // handing the stranger's row back in the result.
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')

    // And the stranger's row is untouched, still in THEIR location
    expect(storedRow('stock_contested')).toMatchObject({
      itemId: ITEM_THEIRS,
      locationId: LOC_STRANGER,
      packedQuantity: 8,
    })
    expect(stored()).toHaveLength(1)
  })

  it('user importing a batch with one forbidden row gets no rows written at all', async () => {
    // Given an allowed row AHEAD of the forbidden one. These bulk resolvers
    // are not transactional, so a check inside the write loop would leave the
    // earlier row on disk.
    const payload = [
      input('stock_allowed_first', ITEM_A, LOC_OTHER),
      input('stock_forbidden', ITEM_B, LOC_STRANGER),
    ]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then nothing was written, not even the row the caller was allowed
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(storedRow('stock_allowed_first')).toBeUndefined()
    expect(stored()).toHaveLength(0)
  })

  it('checks each distinct location and item once, not once per row', async () => {
    // Given six payload rows spanning 2 locations and 2 items
    const payload = [
      input('s1', ITEM_A, LOC_DEFAULT),
      input('s2', ITEM_A, LOC_OTHER),
      input('s3', ITEM_B, LOC_DEFAULT),
      input('s4', ITEM_B, LOC_OTHER),
      input('s5', ITEM_A, LOC_DEFAULT),
      input('s6', ITEM_B, LOC_OTHER),
    ]

    // When the import runs
    await exec(BULK_CREATE, payload)

    // Then 2 location checks and 2 item checks ran, not 6 of each. A 500-row
    // backup spanning 3 locations costs 3 authorization lookups.
    const locationFindFirst = (
      prisma as unknown as { location: { findFirst: ReturnType<typeof vi.fn> } }
    ).location.findFirst
    const itemFindFirst = (
      prisma as unknown as { item: { findFirst: ReturnType<typeof vi.fn> } }
    ).item.findFirst
    expect(locationFindFirst.mock.calls).toHaveLength(2)
    expect(itemFindFirst.mock.calls).toHaveLength(2)
  })

  it('returns [] for an empty payload without touching the database', async () => {
    const result = await exec(BULK_CREATE, [])
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateItemStocks).toEqual([])
    const locationFindFirst = (
      prisma as unknown as { location: { findFirst: ReturnType<typeof vi.fn> } }
    ).location.findFirst
    expect(locationFindFirst).not.toHaveBeenCalled()
  })
})

// ─── Upserting ───────────────────────────────────────────────────────────────

describe('bulkUpsertItemStocks', () => {
  it('user re-importing stock with "replace conflicts" gets its quantities updated', async () => {
    // Given a stored row with packedQuantity 11
    mockPrisma.$stockFake.reset(mockPrisma.$stockFake.state.locations, [
      {
        id: 'stock_existing',
        itemId: ITEM_A,
        locationId: LOC_OTHER,
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 11,
        unpackedQuantity: 0,
        dueDate: null,
        createdAt: TS,
        updatedAt: TS,
      },
    ])

    // When a replace-conflicts import names it with new numbers
    const result = await exec(BULK_UPSERT, [
      input('stock_existing', ITEM_A, LOC_OTHER, {
        targetQuantity: 6,
        refillThreshold: 2,
        packedQuantity: 3,
        unpackedQuantity: 0.75,
      }),
    ])

    // Then all four quantities carry the payload's values
    expect(result.errors).toBeUndefined()
    expect(storedRow('stock_existing')).toMatchObject({
      targetQuantity: 6,
      refillThreshold: 2,
      packedQuantity: 3,
      unpackedQuantity: 0.75,
    })
    expect(stored()).toHaveLength(1)
  })

  it('user upserting stock gets each row in the location its own payload names', async () => {
    // Given two NEW rows naming different locations, one the default and one not
    const payload = [
      input('stock_up_default', ITEM_A, LOC_DEFAULT),
      input('stock_up_other', ITEM_B, LOC_OTHER),
    ]

    // When the upsert import runs
    const result = await exec(BULK_UPSERT, payload)

    // Then each is created in the location IT named
    expect(result.errors).toBeUndefined()
    expect(storedRow('stock_up_default')?.locationId).toBe(LOC_DEFAULT)
    expect(storedRow('stock_up_other')?.locationId).toBe(LOC_OTHER)
  })

  it('user upserting stock for a pair they already hold replaces the stale row', async () => {
    // Given a stored row on (ITEM_A, LOC_OTHER) under an OLD id.
    // This is the local rule: `importItemStocks`
    // (apps/web/src/lib/importData.ts:1127-1148) deletes every stored row
    // holding an incoming pair under a different id, then bulkPuts the
    // payload. The payload wins. Keeping the stored row instead would
    // silently discard the quantities in the file the user chose to restore.
    mockPrisma.$stockFake.reset(mockPrisma.$stockFake.state.locations, [
      {
        id: 'stock_old_id',
        itemId: ITEM_A,
        locationId: LOC_OTHER,
        targetQuantity: 1,
        refillThreshold: 0,
        packedQuantity: 11,
        unpackedQuantity: 0,
        dueDate: null,
        createdAt: TS,
        updatedAt: TS,
      },
    ])

    // When the backup's row names the same pair under a NEW id
    const result = await exec(BULK_UPSERT, [
      input('stock_new_id', ITEM_A, LOC_OTHER, { packedQuantity: 77 }),
    ])

    // Then no P2002 escaped, exactly one row holds the pair, and it is the
    // payload's
    expect(result.errors).toBeUndefined()
    expect(storedPair(ITEM_A, LOC_OTHER)).toHaveLength(1)
    expect(storedRow('stock_new_id')).toMatchObject({ packedQuantity: 77 })
    expect(storedRow('stock_old_id')).toBeUndefined()
  })

  it('user upserting two rows for one item and location gets only one row', async () => {
    // Given two payload rows with different ids on the same pair
    const payload = [
      input('stock_up_dup_a', ITEM_B, LOC_DEFAULT, { packedQuantity: 1 }),
      input('stock_up_dup_b', ITEM_B, LOC_DEFAULT, { packedQuantity: 2 }),
    ]

    // When the upsert import runs
    const result = await exec(BULK_UPSERT, payload)

    // Then no P2002 escaped and one row holds the pair. The LAST wins, which
    // is what `bulkPut` does for two local rows sharing one id.
    expect(result.errors).toBeUndefined()
    expect(storedPair(ITEM_B, LOC_DEFAULT)).toHaveLength(1)
    expect(storedRow('stock_up_dup_b')).toMatchObject({ packedQuantity: 2 })
    expect(storedRow('stock_up_dup_a')).toBeUndefined()
  })

  it('user cannot overwrite another account’s stock row by upsert', async () => {
    // Given a stock row in the STRANGER's location
    mockPrisma.$stockFake.reset(mockPrisma.$stockFake.state.locations, [
      {
        id: 'stock_contested',
        itemId: ITEM_THEIRS,
        locationId: LOC_STRANGER,
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 8,
        unpackedQuantity: 0,
        dueDate: null,
        createdAt: TS,
        updatedAt: TS,
      },
    ])

    // When the caller upserts their own row under that id
    const result = await exec(BULK_UPSERT, [input('stock_contested', ITEM_A, LOC_OTHER)])

    // Then it is refused
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')

    // And every column of the stranger's row is intact — both PARENTS
    // included. Without the pre-check, `upsert({ where: { id }, update: data })`
    // with the house style's shared `data` object would have MOVED this row
    // into the caller's location and repointed it at the caller's item. That
    // is the row steal in the shape a model with no `userId` column takes:
    // the quantities leave the victim's pantry and appear in the attacker's.
    expect(storedRow('stock_contested')).toMatchObject({
      itemId: ITEM_THEIRS,
      locationId: LOC_STRANGER,
      packedQuantity: 8,
      targetQuantity: 3,
    })
    expect(stored()).toHaveLength(1)
  })

  it('user cannot upsert stock into another account’s location', async () => {
    const result = await exec(BULK_UPSERT, [input('stock_new', ITEM_A, LOC_STRANGER)])
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(stored()).toHaveLength(0)
  })

  it('user cannot upsert stock for another account’s item', async () => {
    const result = await exec(BULK_UPSERT, [input('stock_new', ITEM_THEIRS, LOC_OTHER)])
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(stored()).toHaveLength(0)
  })

  it('user upserting a batch with one forbidden row gets no rows written at all', async () => {
    // Given an allowed row ahead of the forbidden one
    const payload = [
      input('stock_allowed_first', ITEM_A, LOC_OTHER),
      input('stock_forbidden', ITEM_B, LOC_STRANGER),
    ]

    // When the upsert import runs
    const result = await exec(BULK_UPSERT, payload)

    // Then nothing was written
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(storedRow('stock_allowed_first')).toBeUndefined()
    expect(stored()).toHaveLength(0)
  })

  it('returns [] for an empty payload without touching the database', async () => {
    const result = await exec(BULK_UPSERT, [])
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertItemStocks).toEqual([])
    const locationFindFirst = (
      prisma as unknown as { location: { findFirst: ReturnType<typeof vi.fn> } }
    ).location.findFirst
    expect(locationFindFirst).not.toHaveBeenCalled()
  })
})

// ─── The input shape itself ──────────────────────────────────────────────────

describe('ItemStockImportInput is not ItemStockInput', () => {
  it('rejects a payload row missing a quantity field', async () => {
    // Given a row with no packedQuantity. `ItemStockInput`
    // (schema/itemStock.graphql:78) would ACCEPT this — all five of its fields
    // are optional, because it is the partial-merge input `upsertItemStock`
    // takes and a missing key there means "leave that column alone". Import is
    // a REPLACE, so a missing column is a broken payload and the schema has to
    // say so. This test is what keeps someone from merging the two inputs; see
    // `ItemStockImportInput` in schema/import.graphql for the four reasons.
    const row = input('stock_partial', ITEM_A, LOC_OTHER) as Record<string, unknown>
    delete row.packedQuantity

    const result = await exec(BULK_CREATE, [row])

    expect(result.errors?.[0]?.message).toContain('packedQuantity')
    expect(stored()).toHaveLength(0)
  })

  it('rejects a payload row carrying a userId', async () => {
    // Given a hand-edited payload trying to set a userId. `ItemStock` has no
    // such COLUMN, on purpose — it is scoped through its location (root
    // CLAUDE.md, Authorization) — so the input declares no such field and
    // GraphQL refuses it before the resolver runs.
    const result = await exec(BULK_CREATE, [
      input('stock_sneaky', ITEM_A, LOC_OTHER, { userId: STRANGER }),
    ])

    expect(result.errors?.[0]?.message).toContain('userId')
    expect(stored()).toHaveLength(0)
  })
})
