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
// cannot fail, and a recorder cannot show which `isDefault` value was stored.
// Root CLAUDE.md, "Write test doubles to model the constraint, not the happy
// path". `vi.mock` is per FILE, so the stateful fake cannot be mixed into that
// file without rewriting its seven existing tests. Tasks 3 and 4 each wrote
// their own file for the same reason; this is the third.
//
// `src/test/stockFake.ts` is the whole mock here, because both mutations under
// test write only `Location`. Four things about that fake carry these tests:
//
//   - `findUnique` / `findFirst` apply `where` key by key
//     (`where.x === undefined || row.x === where.x`), so dropping `userId`
//     from a scoped lookup returns MORE rows and the fixture sees it.
//   - `create` HONOURS `data.id`, so "the payload's ids are preserved" is an
//     assertion that can fail. Before task 5 it generated `loc-N` and threw
//     `data.id` away — the same hole task 3 found in `inventoryLogFake`.
//   - `create` enforces `Location.id`'s primary key and the partial unique
//     index on ("userId") WHERE "isDefault", both with P2002.
//   - `upsert` keeps `create` and `update` apart and applies `update` key by
//     key, which is what makes a demoted default or a stolen row visible.
//     `shoppingFake.cart.upsert` ignored its `update` payload until task 4.
vi.mock('../lib/prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const stock = createStockFake()
  return {
    prisma: {
      ...stock.client,
      location: {
        ...stock.client.location,
        // Wrapped so a test can count HOW MANY authorization checks ran, on
        // top of the fake's real row matching.
        findUnique: vi.fn(stock.client.location.findUnique),
        findFirst: vi.fn(stock.client.location.findFirst),
      },
      // A handle onto the fake, hung off the mocked client because a `vi.mock`
      // factory is hoisted above every import and cannot close over a
      // module-scope binding.
      $stockFake: stock,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { StockFake } from '../test/stockFake.js'

const mockPrisma = prisma as unknown as { $stockFake: StockFake }

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
// THREE locations across TWO users, and the default is one of them. A fixture
// where the caller had no default could not tell "the import left my default
// alone" from "there was nothing to leave alone", and a fixture with only the
// caller's rows could not tell a scoped lookup from an unscoped one.

const USER = 'user_import_location_test'
const STRANGER = 'user_stranger'

const LOC_DEFAULT = 'loc_kitchen' // USER's default — must survive untouched
const LOC_OTHER = 'loc_garage' // USER's, NOT default
const LOC_STRANGER = 'loc_theirs' // STRANGER's — must be refused

const TS = new Date('2026-01-01T00:00:00.000Z')
const PAYLOAD_CREATED = '2026-02-03T04:05:06.000Z'
const PAYLOAD_UPDATED = '2026-03-04T05:06:07.000Z'

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$stockFake.reset([
    { id: LOC_DEFAULT, userId: USER, isDefault: true, name: 'Kitchen', order: 0, createdAt: TS, updatedAt: TS },
    { id: LOC_OTHER, userId: USER, isDefault: false, name: 'Garage', order: 1, createdAt: TS, updatedAt: TS },
    { id: LOC_STRANGER, userId: STRANGER, isDefault: true, name: 'Theirs', order: 0, createdAt: TS, updatedAt: TS },
  ])
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTEXT: Context = { userId: USER }

const FIELDS = '{ id name order isDefault createdAt updatedAt }'

const BULK_CREATE = `
  mutation BulkCreateLocations($locations: [LocationInput!]!) {
    bulkCreateLocations(locations: $locations) ${FIELDS}
  }
`

const BULK_UPSERT = `
  mutation BulkUpsertLocations($locations: [LocationInput!]!) {
    bulkUpsertLocations(locations: $locations) ${FIELDS}
  }
`

async function exec(
  query: string,
  locations: Record<string, unknown>[],
  ctx: Context = CONTEXT,
) {
  const response = await server.executeOperation(
    { query, variables: { locations } },
    { contextValue: ctx },
  )
  if (response.body.kind !== 'single') throw new Error('expected a single result')
  return response.body.singleResult
}

function input(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `Name of ${id}`,
    order: 7,
    createdAt: PAYLOAD_CREATED,
    updatedAt: PAYLOAD_UPDATED,
    ...over,
  }
}

/** Every stored row, read back out of the fake rather than out of the result. */
function stored() {
  return mockPrisma.$stockFake.state.locations
}

function storedRow(id: string) {
  return stored().find((l) => l.id === id)
}

function defaultsOf(userId: string) {
  return stored().filter((l) => l.userId === userId && l.isDefault)
}

const locationFindUnique = (
  prisma as unknown as { location: { findUnique: ReturnType<typeof vi.fn> } }
).location.findUnique

// ─── Creating ────────────────────────────────────────────────────────────────

describe('bulkCreateLocations', () => {
  it('user importing locations gets them stored under the ids the payload names', async () => {
    // Given two locations whose ids no row holds yet
    const payload = [
      input('loc_from_backup_a', { name: 'Pantry', order: 3 }),
      input('loc_from_backup_b', { name: 'Cellar', order: 4 }),
    ]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then both rows exist under the payload's OWN ids, not regenerated ones.
    // Every other imported row — ItemStock, Cart, InventoryLog — points at a
    // location by the id the payload uses, so a regenerated id orphans them.
    expect(result.errors).toBeUndefined()
    expect(storedRow('loc_from_backup_a')).toMatchObject({
      name: 'Pantry',
      order: 3,
      userId: USER,
      isDefault: false,
    })
    expect(storedRow('loc_from_backup_b')).toMatchObject({
      name: 'Cellar',
      order: 4,
      userId: USER,
      isDefault: false,
    })
    // And the returned rows carry the same ids
    const returned = result.data?.bulkCreateLocations as { id: string }[]
    expect(returned.map((l) => l.id)).toEqual(['loc_from_backup_a', 'loc_from_backup_b'])
  })

  it('user sees imported location timestamps as ISO strings, not epoch milliseconds', async () => {
    // Given a location carrying both timestamps
    // (PR 1 shipped this bug at every Location return site: the default String
    // scalar serializer coerces a Date through Date.valueOf() — epoch
    // milliseconds — before toJSON() ever runs. Task 1 hit it again.)
    const payload = [input('loc_dated')]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then the GraphQL result carries ISO strings
    const returned = (result.data?.bulkCreateLocations as Record<string, string>[])[0]
    expect(returned.createdAt).toBe(PAYLOAD_CREATED)
    expect(returned.updatedAt).toBe(PAYLOAD_UPDATED)
  })

  it('user re-importing a location they already have keeps the stored row unchanged', async () => {
    // Given the caller already owns LOC_OTHER, named "Garage" at order 1
    const payload = [input(LOC_OTHER, { name: 'Overwritten', order: 99 })]

    // When a "skip conflicts" import names that same id
    const result = await exec(BULK_CREATE, payload)

    // Then the stored row is untouched — bulkCreate skips, it does not replace
    expect(result.errors).toBeUndefined()
    expect(storedRow(LOC_OTHER)).toMatchObject({
      name: 'Garage',
      order: 1,
      createdAt: TS,
      updatedAt: TS,
    })
    // And nothing was added
    expect(stored()).toHaveLength(3)
  })

  it('user importing a location never gets it marked as the default', async () => {
    // Given an account with NO default location at all. This is the fixture
    // that makes the assertion mean something: when the caller already has a
    // default, the partial unique index refuses a second one, so a resolver
    // writing `isDefault: true` would fail rather than succeed wrongly. With
    // no default to collide with, the wrong write SUCCEEDS and the row comes
    // back flagged — which is what has to be visible.
    mockPrisma.$stockFake.reset([])

    // When the import runs
    const result = await exec(BULK_CREATE, [input('loc_fresh')])

    // Then the row is stored, and it is NOT the default. A brand-new cloud
    // account that imports a backup before its first `locations` query must
    // not have a random imported location promoted behind its back.
    expect(result.errors).toBeUndefined()
    expect(storedRow('loc_fresh')?.isDefault).toBe(false)
    expect(defaultsOf(USER)).toHaveLength(0)
  })

  it('user importing locations keeps their own default location untouched', async () => {
    // Given the caller's default is LOC_DEFAULT, named "Kitchen"
    expect(defaultsOf(USER).map((l) => l.id)).toEqual([LOC_DEFAULT])

    // When two more locations are imported
    const result = await exec(BULK_CREATE, [input('loc_new_1'), input('loc_new_2')])

    // Then the import succeeded — the partial unique index on
    // ("userId") WHERE "isDefault" would reject a second default with P2002,
    // and under the "clear & import" strategy that error arrives AFTER
    // clearAllData has run, leaving the account empty
    expect(result.errors).toBeUndefined()
    expect(storedRow('loc_new_1')).toBeDefined()
    expect(storedRow('loc_new_2')).toBeDefined()

    // And exactly one row is still the default, still LOC_DEFAULT, unrenamed
    expect(defaultsOf(USER)).toHaveLength(1)
    expect(storedRow(LOC_DEFAULT)).toMatchObject({ isDefault: true, name: 'Kitchen', order: 0 })
  })

  it('user cannot import a location whose id belongs to another account', async () => {
    // Given a payload naming STRANGER's location id
    const payload = [input(LOC_STRANGER, { name: 'Stolen', order: 42 })]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then it is refused through requireLocationRole, which reports FORBIDDEN
    // indistinguishably from "not found"
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')

    // And the stranger's row is untouched, and still theirs.
    // Without the scoped pre-check the house style would instead have found
    // the row with an unscoped `findUnique` and `continue`d — dropping the
    // caller's own location silently, with no error, and handing the
    // stranger's row back in the result.
    expect(storedRow(LOC_STRANGER)).toMatchObject({
      userId: STRANGER,
      name: 'Theirs',
      order: 0,
      isDefault: true,
    })
    expect(stored()).toHaveLength(3)
  })

  it('user importing a batch with one forbidden location gets no rows written at all', async () => {
    // Given an allowed row AHEAD of the forbidden one. These bulk resolvers
    // are not transactional, so a check inside the write loop would leave the
    // earlier row on disk.
    const payload = [input('loc_allowed_first'), input(LOC_STRANGER)]

    // When the import runs
    const result = await exec(BULK_CREATE, payload)

    // Then nothing was written, not even the row the caller was allowed
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(storedRow('loc_allowed_first')).toBeUndefined()
    expect(stored()).toHaveLength(3)
  })

  it('checks each distinct location id once, not once per row', async () => {
    // Given five payload rows across two ids
    const payload = [
      input(LOC_OTHER),
      input('loc_new'),
      input(LOC_OTHER),
      input('loc_new'),
      input(LOC_OTHER),
    ]

    // When the import runs
    await exec(BULK_CREATE, payload)

    // Then the pre-check made exactly 2 existence lookups — one per distinct
    // id. The per-row scoped lookups inside the write loop are counted
    // separately below, so this number is the pre-check's alone.
    const precheckCalls = locationFindUnique.mock.calls.filter(
      (call) => (call[0] as { select?: unknown }).select !== undefined,
    )
    expect(precheckCalls).toHaveLength(2)
  })

  it('returns [] for an empty payload without touching the database', async () => {
    const result = await exec(BULK_CREATE, [])
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateLocations).toEqual([])
    expect(locationFindUnique).not.toHaveBeenCalled()
  })
})

// ─── Upserting ───────────────────────────────────────────────────────────────

describe('bulkUpsertLocations', () => {
  it('user re-importing a location with "replace conflicts" gets its name and order updated', async () => {
    // Given the caller owns LOC_OTHER, named "Garage" at order 1
    const payload = [input(LOC_OTHER, { name: 'Garage Shelf', order: 5 })]

    // When a replace-conflicts import names it
    const result = await exec(BULK_UPSERT, payload)

    // Then the stored row carries the payload's name and order
    expect(result.errors).toBeUndefined()
    expect(storedRow(LOC_OTHER)).toMatchObject({
      name: 'Garage Shelf',
      order: 5,
      userId: USER,
      isDefault: false,
    })
    expect(stored()).toHaveLength(3)
  })

  it('user importing a new location by upsert gets it created under the payload id', async () => {
    // Given an id no row holds
    const payload = [input('loc_upsert_new', { name: 'Loft', order: 8 })]

    // When the upsert import runs
    const result = await exec(BULK_UPSERT, payload)

    // Then it is created, under the payload's id, and not as the default
    expect(result.errors).toBeUndefined()
    expect(storedRow('loc_upsert_new')).toMatchObject({
      name: 'Loft',
      order: 8,
      userId: USER,
      isDefault: false,
    })
  })

  it('user re-importing their own default location keeps it the default', async () => {
    // Given a payload naming the caller's default id. The client's remap
    // rewrites the payload's default id to the destination's own default id,
    // so this is the shape a replace-conflicts import really produces.
    const payload = [input(LOC_DEFAULT, { name: 'Kitchen Renamed', order: 2 })]

    // When the upsert import runs
    const result = await exec(BULK_UPSERT, payload)

    // Then the name and order change — but the row is STILL the default.
    // `isDefault` is absent from the update payload on purpose: writing
    // `false` there would clear the account's only default, and
    // `ensureDefaultLocation` would then build a spare "My Home" beside it.
    expect(result.errors).toBeUndefined()
    expect(storedRow(LOC_DEFAULT)).toMatchObject({
      name: 'Kitchen Renamed',
      order: 2,
      isDefault: true,
    })
    expect(defaultsOf(USER)).toHaveLength(1)
  })

  it('user cannot overwrite another account’s location by upsert', async () => {
    // Given a payload naming STRANGER's location id
    const payload = [input(LOC_STRANGER, { name: 'Stolen', order: 42 })]

    // When the upsert import runs
    const result = await exec(BULK_UPSERT, payload)

    // Then it is refused
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')

    // And every column of the stranger's row is intact — `userId` included.
    // Without the pre-check, `upsert({ where: { id }, update: data })` with
    // the house style's shared `data` object would have renamed the row AND
    // reassigned it to the caller, taking its stock, carts and logs with it.
    expect(storedRow(LOC_STRANGER)).toMatchObject({
      userId: STRANGER,
      name: 'Theirs',
      order: 0,
      isDefault: true,
    })
  })

  it('user upserting a batch with one forbidden location gets no rows written at all', async () => {
    // Given an allowed row ahead of the forbidden one
    const payload = [input('loc_allowed_first'), input(LOC_STRANGER)]

    // When the upsert import runs
    const result = await exec(BULK_UPSERT, payload)

    // Then nothing was written
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(storedRow('loc_allowed_first')).toBeUndefined()
    expect(stored()).toHaveLength(3)
  })

  it('returns [] for an empty payload without touching the database', async () => {
    const result = await exec(BULK_UPSERT, [])
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertLocations).toEqual([])
    expect(locationFindUnique).not.toHaveBeenCalled()
  })
})

// ─── The input shape itself ──────────────────────────────────────────────────

describe('LocationInput carries no isDefault', () => {
  it('rejects a payload that tries to set isDefault', async () => {
    // Given a hand-edited payload carrying the flag. The schema is the guard:
    // GraphQL refuses an input field the type does not declare, so the
    // resolver never sees it. This test is what keeps someone from "helpfully"
    // adding the field later — see `LocationInput` in schema/import.graphql
    // for the three reasons.
    const result = await exec(BULK_CREATE, [input('loc_sneaky', { isDefault: true })])

    // Then the mutation does not run at all
    expect(result.errors?.[0]?.message).toContain('isDefault')
    expect(storedRow('loc_sneaky')).toBeUndefined()
    expect(defaultsOf(USER)).toHaveLength(1)
  })
})
