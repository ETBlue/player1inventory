import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

// Every model is a STATEFUL fake.
//
// `inventoryLog` used to be four plain `vi.fn()` call recorders. A recorder
// returns whatever the test told it to return, so it cannot tell a
// location-scoped query apart from an unscoped one — drop `locationId` from
// the resolver's `where` and every assertion still passes. PR 3a Task 2
// replaced it with src/test/inventoryLogFake.ts, which applies the `where`
// itself. Each method is still wrapped in `vi.fn` so a test can assert on the
// call when it needs to.
//
// `user`, `household`, `householdMember`, `locationMember`, `location` and
// `itemStock` are `householdWorld` (src/test/householdWorld.ts). Every role is
// a row `seedLocations` writes. Nothing is derived from a location's `userId`:
// households H3a task 3.8 removed `derivedRoles` from this file.
//
// `item` has `findMany` only. It answers `requireCatalogIds` (lib/authz.ts),
// which `addInventoryLog` uses to check that the item is an item of the
// location's household (task 3.8). It reads a household-scoped
// `ownedRowFake` store, so a stranger's item is really another household's
// row here.
vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createInventoryLogFake } = await import('../test/inventoryLogFake.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const world = createHouseholdWorld()
  const logFake = createInventoryLogFake()
  const items = createOwnedRowFake({
    model: 'Item',
    scope: 'householdId',
    rows: [
      { id: 'item_1', householdId: 'hh_test', userId: 'user_test123' },
      { id: 'item_2', householdId: 'hh_test', userId: 'user_test123' },
      { id: 'item_new', householdId: 'hh_test', userId: 'user_member' },
      { id: 'item_theirs', householdId: 'hh_other', userId: 'user_other' },
    ],
  })
  world.extend(
    {
      inventoryLog: {
        findMany: vi.fn(logFake.client.findMany),
        findFirst: vi.fn(logFake.client.findFirst),
        count: vi.fn(logFake.client.count),
        create: vi.fn(logFake.client.create),
      },
      item: { findMany: items.client.findMany },
    },
    [logFake.state as unknown as Record<string, unknown>],
  )
  return {
    prisma: {
      ...world.client,
      // Handles onto the fakes' state, hung off the mocked client because a
      // `vi.mock` factory is hoisted above every import and cannot close over
      // a module-scope binding.
      $world: world,
      $logFake: logFake,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { LocationRole } from '../lib/authz.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import { makeInventoryLog } from '../test/inventoryLogFake.js'
import type { InventoryLogFake } from '../test/inventoryLogFake.js'

const mockPrisma = prisma as unknown as {
  inventoryLog: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  $world: HouseholdWorld
  $logFake: InventoryLogFake
}

// The caller's two locations, a stranger's, one belonging to the second user
// the cross-household tests sign in as, and two more in the caller's
// household (see the table below). A one-location fixture cannot tell "reads
// the location I asked for" apart from "reads every location", nor "writes
// the caller's DEFAULT" apart from "writes whatever location it finds first"
// — root CLAUDE.md, "Proving a Test Works".
const USER = 'user_test123'
const MEMBER = 'user_member'
const STRANGER = 'user_other'
const USER_B = 'user_B'
const LOC_DEFAULT = 'loc_kitchen'
const LOC_OTHER = 'loc_garage'
const LOC_SHARED = 'loc_shared'
const LOC_HIDDEN = 'loc_hidden'
const LOC_STRANGER = 'loc_theirs'
const LOC_USER_B = 'loc_user_b'

// ── The three-person fixture (plan H3a, rule 10) ──
//
// | Person   | Household | Household role | Location roles                                             |
// |----------|-----------|----------------|------------------------------------------------------------|
// | USER     | hh_test   | owner          | LOC_DEFAULT: organizer; LOC_OTHER: set by the test         |
// |          |           |                | (organizer by default); LOC_SHARED: viewer                 |
// | MEMBER   | hh_test   | member         | LOC_DEFAULT, LOC_SHARED, LOC_HIDDEN: organizer;            |
// |          |           |                | LOC_OTHER: a role DIFFERENT from USER's                    |
// | STRANGER | hh_other  | owner          | LOC_STRANGER: organizer                                    |
// | USER_B   | hh_b      | owner          | LOC_USER_B: organizer                                      |
//
// LOC_SHARED was made by MEMBER and USER holds a role on it; LOC_HIDDEN was
// made by USER and USER holds NO role on it. So "the locations I hold a role
// on" and "the locations whose `userId` is mine" give opposite answers.
function seedLocations(options: { callerRoleOnOther?: LocationRole } = {}) {
  const callerRoleOnOther = options.callerRoleOnOther ?? 'organizer'
  const world = mockPrisma.$world
  world.reset()
  world.stock.reset(
    [
      // Not first on purpose: a resolver taking `locations[0]` would still
      // pass if the default came first.
      { id: LOC_OTHER, householdId: 'hh_test' },
      { id: LOC_DEFAULT, householdId: 'hh_test' },
      { id: LOC_SHARED, householdId: 'hh_test' },
      { id: LOC_HIDDEN, householdId: 'hh_test' },
      { id: LOC_STRANGER, householdId: 'hh_other' },
      { id: LOC_USER_B, householdId: 'hh_b' },
    ],
    [],
  )
  world.seedHouseholds({
    households: [
      householdRow('hh_test', USER),
      householdRow('hh_other', STRANGER),
      householdRow('hh_b', USER_B),
    ],
    householdMembers: [
      householdMemberRow('hh_test', USER, 'owner'),
      householdMemberRow('hh_test', MEMBER, 'member'),
      householdMemberRow('hh_other', STRANGER, 'owner'),
      householdMemberRow('hh_b', USER_B, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_DEFAULT, USER, 'organizer'),
      locationMemberRow(LOC_DEFAULT, MEMBER, 'organizer'),
      locationMemberRow(LOC_OTHER, USER, callerRoleOnOther),
      locationMemberRow(
        LOC_OTHER,
        MEMBER,
        callerRoleOnOther === 'participant' ? 'organizer' : 'participant',
      ),
      locationMemberRow(LOC_SHARED, MEMBER, 'organizer'),
      locationMemberRow(LOC_SHARED, USER, 'viewer'),
      locationMemberRow(LOC_HIDDEN, MEMBER, 'organizer'),
      locationMemberRow(LOC_STRANGER, STRANGER, 'organizer'),
      locationMemberRow(LOC_USER_B, USER_B, 'organizer'),
    ],
  })
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

const ITEM_LOGS = `query ItemLogs($itemId: ID!, $locationId: ID!) {
  itemLogs(itemId: $itemId, locationId: $locationId) { id locationId delta quantity occurredAt }
}`

const LOG_COUNT = `query Count($itemId: ID!, $locationId: ID!) {
  inventoryLogCountByItem(itemId: $itemId, locationId: $locationId)
}`

const LAST_PURCHASE = `query LastPurchaseDates($itemIds: [ID!]!, $locationId: ID!) {
  lastPurchaseDates(itemIds: $itemIds, locationId: $locationId) { itemId date }
}`

const ADD_LOG = `mutation AddInventoryLog($itemId: ID!, $delta: Float!, $quantity: Float!, $occurredAt: String!, $locationId: ID!, $note: String) {
  addInventoryLog(itemId: $itemId, delta: $delta, quantity: $quantity, occurredAt: $occurredAt, locationId: $locationId, note: $note) {
    id itemId locationId delta quantity occurredAt note
  }
}`

// The same four operations with the `locationId` ARGUMENT left out entirely.
// `locationId` is `ID!` since PR 3a Task 4, so these are invalid documents and
// the server rejects them before any resolver runs. They exist to prove the
// default-location fallback Task 2 shipped is gone: with the fallback in place
// each of these returned the caller's default location and said nothing.
const ITEM_LOGS_NO_LOCATION = `query ItemLogs($itemId: ID!) {
  itemLogs(itemId: $itemId) { id }
}`

const LOG_COUNT_NO_LOCATION = `query Count($itemId: ID!) {
  inventoryLogCountByItem(itemId: $itemId)
}`

const LAST_PURCHASE_NO_LOCATION = `query LastPurchaseDates($itemIds: [ID!]!) {
  lastPurchaseDates(itemIds: $itemIds) { itemId date }
}`

const ADD_LOG_NO_LOCATION = `mutation AddInventoryLog($itemId: ID!, $delta: Float!, $quantity: Float!, $occurredAt: String!) {
  addInventoryLog(itemId: $itemId, delta: $delta, quantity: $quantity, occurredAt: $occurredAt) { id }
}`

type LogRow = { id: string; locationId: string; delta: number; quantity: number; occurredAt: string }

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

  it('omitting locationId is refused — it does NOT fall back to the default location', async () => {
    // Given the caller's default location is LOC_DEFAULT, holding 3 logs for
    // item_1. Task 2 shipped a fallback that returned exactly those.

    // When the user omits locationId
    const result = await execOp(ITEM_LOGS_NO_LOCATION, { itemId: 'item_1' })

    // Then the request is refused and no rows come back at all
    expect(errorCode(result)).toBe('GRAPHQL_VALIDATION_FAILED')
    expect(result?.data?.itemLogs).toBeFalsy()
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

  it('omitting locationId is refused — it does NOT count at the default location', async () => {
    // When the user omits locationId
    const result = await execOp(LOG_COUNT_NO_LOCATION, { itemId: 'item_1' })

    // Then the request is refused and no count comes back (the fallback
    // returned 3 here)
    expect(errorCode(result)).toBe('GRAPHQL_VALIDATION_FAILED')
    expect(result?.data?.inventoryLogCountByItem).toBeFalsy()
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

  it('omitting locationId is refused — it does NOT read the default location', async () => {
    // When the user omits locationId
    const result = await execOp(LAST_PURCHASE_NO_LOCATION, { itemIds: ['item_1'] })

    // Then the request is refused and no dates come back (the fallback
    // returned LOC_DEFAULT's 2026-01-03 here)
    expect(errorCode(result)).toBe('GRAPHQL_VALIDATION_FAILED')
    expect(result?.data?.lastPurchaseDates).toBeFalsy()
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

// ─── InventoryLog.locationId (PR 4a, Task 2) ──────────────────────────────────
//
// The field is new on the GraphQL type; the Prisma column has existed since
// PR 3a. Cloud export reads it, so a log has to report the location it was
// written at — NOT the caller's default location.
//
// Every assertion below names a log at LOC_OTHER, which is NOT the caller's
// default (LOC_DEFAULT is `isDefault: true` in seedLocations). A fixture with
// one location, or one that only checked LOC_DEFAULT rows, could not tell
// "the location the row names" apart from "the caller's default location".

describe('InventoryLog.locationId', () => {
  it('each exported log reports the location it was written at', async () => {
    // Given the caller's 7 logs are split across LOC_DEFAULT and LOC_OTHER
    // (see the fixture table above)

    // When the caller exports every log
    const result = await execOp(`query InventoryLogs { inventoryLogs { id locationId } }`)

    // Then each log names its OWN location, not one shared value
    expect(result?.errors).toBeUndefined()
    const byId = new Map(
      (result?.data?.inventoryLogs as { id: string; locationId: string }[]).map((l) => [
        l.id,
        l.locationId,
      ]),
    )
    expect(byId.get('log_k1')).toBe(LOC_DEFAULT)
    expect(byId.get('log_g1')).toBe(LOC_OTHER)
    expect(byId.get('log_g2')).toBe(LOC_OTHER)
    expect(byId.get('log_g9')).toBe(LOC_OTHER)

    // And both locations really are represented, so a resolver returning one
    // constant value for every row cannot pass
    expect(new Set(byId.values())).toEqual(new Set([LOC_DEFAULT, LOC_OTHER]))
  })

  it('itemLogs reports the non-default location it was asked for', async () => {
    // When the caller reads item_1 at LOC_OTHER
    const result = await execOp(ITEM_LOGS, { itemId: 'item_1', locationId: LOC_OTHER })

    // Then every returned log names LOC_OTHER
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.itemLogs as LogRow[]
    expect(logs).toHaveLength(2)
    expect(logs.map((l) => l.locationId)).toEqual([LOC_OTHER, LOC_OTHER])
  })

  it('user can add a log and read back the non-default location it was written at', async () => {
    // Given the caller names LOC_OTHER, which is NOT their default location
    const result = await execOp(ADD_LOG, {
      itemId: 'item_new', delta: 3, quantity: 5, occurredAt: '2026-03-01T10:00:00.000Z', locationId: LOC_OTHER, note: null,
    })

    // Then the mutation's own payload reports LOC_OTHER
    expect(result?.errors).toBeUndefined()
    const created = result?.data?.addInventoryLog as { id: string; locationId: string }
    expect(created.locationId).toBe(LOC_OTHER)

    // And so does the export read of the same row
    const exported = await execOp(`query InventoryLogs { inventoryLogs { id locationId } }`)
    const row = (exported?.data?.inventoryLogs as { id: string; locationId: string }[]).find(
      (l) => l.id === created.id,
    )
    expect(row?.locationId).toBe(LOC_OTHER)
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

  it('omitting locationId is refused and writes nothing — no silent default-location write', async () => {
    // When the caller omits locationId
    const result = await execOp(ADD_LOG_NO_LOCATION, {
      itemId: 'item_new', delta: 1, quantity: 1, occurredAt: '2026-03-01T10:00:00.000Z',
    })

    // Then the request is refused
    expect(errorCode(result)).toBe('GRAPHQL_VALIDATION_FAILED')

    // And NO row was written anywhere. Task 2's fallback wrote one at
    // LOC_DEFAULT, so this assertion is what proves the fallback is gone.
    const written = mockPrisma.$logFake.state.logs.filter((l) => l.itemId === 'item_new')
    expect(written).toHaveLength(0)
  })
})

// ─── Authorization ────────────────────────────────────────────────────────────

describe('authorization — a caller-supplied locationId goes through requireLocationRole', () => {
  it('itemLogs is refused for a location the caller holds no role on', async () => {
    // Given LOC_STRANGER belongs to another user

    // When the caller asks for its logs
    const result = await execOp(ITEM_LOGS, { itemId: 'item_1', locationId: LOC_STRANGER })

    // Then the request is refused with FORBIDDEN. Asserting on the ERROR, not
    // on an empty row list: the stranger's location holds one item_1 log, but
    // an empty list would also be what a resolver that read the wrong
    // location returns, so a row-count assertion is weaker than the error.
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

// ─── Logs belong to their location, not to their author ──────────────────────
//
// Households H3a task 3.8. `InventoryLog.userId` means the AUTHOR. A log a
// co-member wrote at a location the caller holds a role on is the caller's to
// read too. Until task 3.8 every read also filtered by `userId`, so these
// tests went red: the co-member's log was hidden.

describe('logs a co-member wrote', () => {
  beforeEach(() => {
    // MEMBER bought item_1 at LOC_DEFAULT on 2026-01-04, after every one of
    // USER's LOC_DEFAULT logs (the latest is 2026-01-03)
    mockPrisma.$logFake.state.logs.push(
      makeInventoryLog({ id: 'log_m1', itemId: 'item_1', userId: MEMBER, locationId: LOC_DEFAULT, delta: 2, quantity: 8, occurredAt: new Date('2026-01-04T00:00:00.000Z') }),
    )
  })

  it('user sees a log a co-member wrote at a location they share', async () => {
    const result = await execOp(ITEM_LOGS, { itemId: 'item_1', locationId: LOC_DEFAULT })
    expect(result?.errors).toBeUndefined()
    const logs = result?.data?.itemLogs as LogRow[]
    expect(logs.map((l) => l.id)).toEqual(['log_k1', 'log_k2', 'log_k3', 'log_m1'])
  })

  it('user\'s log count includes a co-member\'s log', async () => {
    const result = await execOp(LOG_COUNT, { itemId: 'item_1', locationId: LOC_DEFAULT })
    expect(result?.data?.inventoryLogCountByItem).toBe(4)
  })

  it('user\'s last purchase date is a co-member\'s purchase when it is the latest', async () => {
    const result = await execOp(LAST_PURCHASE, { itemIds: ['item_1'], locationId: LOC_DEFAULT })
    const rows = result?.data?.lastPurchaseDates as DateRow[]
    expect(rows[0].date).toContain('2026-01-04')
  })

  it('user exporting every log gets a co-member\'s log at a location they share', async () => {
    const result = await execOp(`query InventoryLogs { inventoryLogs { id } }`)
    const ids = (result?.data?.inventoryLogs as { id: string }[]).map((l) => l.id)
    expect(ids).toContain('log_m1')
  })
})

describe('inventoryLogs reads the locations the caller holds a role on', () => {
  it('user gets the logs of a shared location, and not of one they hold no role on', async () => {
    // Given one log at LOC_SHARED (made by MEMBER; USER is a viewer there) and
    // one at LOC_HIDDEN (made by USER; USER holds no role there). Both were
    // written by USER, so an author filter cannot tell them apart.
    mockPrisma.$logFake.state.logs.push(
      makeInventoryLog({ id: 'log_shared', itemId: 'item_1', userId: USER, locationId: LOC_SHARED }),
      makeInventoryLog({ id: 'log_hidden', itemId: 'item_1', userId: USER, locationId: LOC_HIDDEN }),
    )

    // When USER exports
    const result = await execOp(`query InventoryLogs { inventoryLogs { id } }`)

    // Then the LOC_SHARED log is there and the LOC_HIDDEN one is not
    expect(result?.errors).toBeUndefined()
    const ids = (result?.data?.inventoryLogs as { id: string }[]).map((l) => l.id)
    expect(ids).toContain('log_shared')
    expect(ids).not.toContain('log_hidden')
  })

  it('a user in another household reads none of these logs', async () => {
    // Given USER_B, whose only location holds no log
    const result = await execOp(`query InventoryLogs { inventoryLogs { id } }`, undefined, { userId: USER_B })
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.inventoryLogs).toEqual([])
  })

  it('a user in another household reads no log of this item at their own location', async () => {
    // Given item_1 has logs at three locations of two other households
    const logs = await execOp(ITEM_LOGS, { itemId: 'item_1', locationId: LOC_USER_B }, { userId: USER_B })
    expect(logs?.errors).toBeUndefined()
    expect(logs?.data?.itemLogs).toHaveLength(0)
    const dates = await execOp(LAST_PURCHASE, { itemIds: ['item_1'], locationId: LOC_USER_B }, { userId: USER_B })
    expect((dates?.data?.lastPurchaseDates as DateRow[])[0].date).toBeNull()
  })
})

// ─── Roles and the household's items ─────────────────────────────────────────

describe('addInventoryLog needs location role participant, and an item of the location\'s household', () => {
  const add = (itemId: string, locationId: string) =>
    execOp(ADD_LOG, { itemId, delta: 1, quantity: 1, occurredAt: '2026-03-01T10:00:00.000Z', locationId })

  it('a location viewer can read the location\'s logs', async () => {
    // Given USER is only a viewer at LOC_SHARED
    mockPrisma.$logFake.state.logs.push(
      makeInventoryLog({ id: 'log_shared', itemId: 'item_1', userId: MEMBER, locationId: LOC_SHARED }),
    )
    const result = await execOp(ITEM_LOGS, { itemId: 'item_1', locationId: LOC_SHARED })
    expect(result?.errors).toBeUndefined()
    expect((result?.data?.itemLogs as LogRow[]).map((l) => l.id)).toEqual(['log_shared'])
  })

  it('a location viewer cannot add a log, and nothing is written', async () => {
    seedLocations({ callerRoleOnOther: 'viewer' })
    const before = mockPrisma.$logFake.state.logs.length
    const result = await add('item_1', LOC_OTHER)
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$logFake.state.logs).toHaveLength(before)
  })

  it('a location participant can add a log', async () => {
    seedLocations({ callerRoleOnOther: 'participant' })
    const result = await add('item_1', LOC_OTHER)
    expect(result?.errors).toBeUndefined()
    expect((result?.data?.addInventoryLog as { locationId: string }).locationId).toBe(LOC_OTHER)
  })

  it('user can add a log for an item a co-member made', async () => {
    // item_new was made by MEMBER, and it is hh_test's
    const result = await add('item_new', LOC_DEFAULT)
    expect(result?.errors).toBeUndefined()
  })

  it('user cannot add a log for another household\'s item, and nothing is written', async () => {
    const before = mockPrisma.$logFake.state.logs.length
    const result = await add('item_theirs', LOC_DEFAULT)
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$logFake.state.logs).toHaveLength(before)
  })

  it('an item id no row holds is refused with BAD_USER_INPUT, and nothing is written', async () => {
    const before = mockPrisma.$logFake.state.logs.length
    const result = await add('item_ghost', LOC_DEFAULT)
    expect(errorCode(result)).toBe('BAD_USER_INPUT')
    expect(mockPrisma.$logFake.state.logs).toHaveLength(before)
  })

  it('the new log records its author', async () => {
    seedLocations({ callerRoleOnOther: 'participant' })
    const result = await add('item_1', LOC_OTHER)
    const id = (result?.data?.addInventoryLog as { id: string }).id
    expect(mockPrisma.$logFake.state.logs.find((l) => l.id === id)?.userId).toBe(USER)
  })

  // `requireLocationRole` must run BEFORE `requireLocationItems`. Run the other
  // way round, an existing foreign location plus an item id no row holds gives
  // BAD_USER_INPUT, while an unknown location gives FORBIDDEN, so a stranger
  // could tell which location ids exist (task 3.8 review).
  it('a stranger adding a log at another household\'s location gets FORBIDDEN, even for a missing item', async () => {
    // Given LOC_STRANGER exists and USER holds no role on it, and no item has
    // the id item_ghost
    const before = mockPrisma.$logFake.state.logs.length

    // When USER adds a log there
    const result = await add('item_ghost', LOC_STRANGER)

    // Then the answer is FORBIDDEN, the same as for an unknown location, and
    // nothing is written
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$logFake.state.logs).toHaveLength(before)
  })

  it('an unknown location id with a missing item gets the same FORBIDDEN (control)', async () => {
    // A negative control: green in both orders. It shows the answer above
    // matches this one.
    const before = mockPrisma.$logFake.state.logs.length
    const result = await add('item_ghost', 'loc_does_not_exist')
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$logFake.state.logs).toHaveLength(before)
  })
})
