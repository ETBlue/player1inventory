import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import type { ActivityAction, Prisma } from '@prisma/client'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { HouseholdActivityRow } from '../test/householdFake.js'
import type { FakeLocation } from '../test/stockFake.js'
import type { UserRow } from '../test/userFake.js'

// The `householdActivity` query (households H6, task J.3; plan
// docs/global/permissions/2026-11-20-households-plan-h6.md, decisions T53 and
// T54, owner decision O35-A, Review Focus 6).
//
// ── THE FIXTURE ──
//
// | Person | Households                      | Location roles   | Account |
// |--------|---------------------------------|------------------|---------|
// | OWEN   | hh_h owner                      | none             |         |
// | MIA    | hh_h manager, hh_x manager      | none             |         |
// | BEA    | hh_h member, hh_b owner         | LOC_K organizer  |         |
// | DAN    | none any more                   | none             | deleted |
// | YUKI   | hh_x owner                      | LOC_Z organizer  |         |
//
// - MIA is a manager in TWO households, so a test can tell "the household she
//   acts in" from "any household where she is a manager".
// - BEA is a household `member` of hh_h who organizes a location there AND
//   owns another household. So neither "has a location role" nor "is an
//   owner somewhere" may let her read hh_h's log.
// - hh_x's newest row is newer than every hh_h row. A query that drops the
//   household filter shows it first.
// - The kitchen was renamed after the log was written ("Old kitchen" in the
//   log, "Kitchen" now), and the shed is deleted. So a name read from the
//   `Location` table instead of `details` shows.

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  return { prisma: { ...world.client, $world: world } }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const OWEN = 'user_owen'
const MIA = 'user_mia'
const BEA = 'user_bea'
const DAN = 'user_dan'
const YUKI = 'user_yuki'

const LOC_K = 'loc_kitchen'
const LOC_SHED = 'loc_shed_gone'
const LOC_Z = 'loc_z'

const T0 = new Date('2026-01-01T00:00:00.000Z')

function at(minute: number): Date {
  return new Date(Date.UTC(2026, 10, 20, 10, minute))
}

function loc(id: string, householdId: string, name: string, order: number): FakeLocation {
  return { id, householdId, name, order, createdAt: T0, updatedAt: T0 }
}

function user(
  id: string,
  displayName: string,
  activeHouseholdId: string | null,
  deletedAt: Date | null = null,
): UserRow {
  return {
    id,
    displayName,
    email: `${id}@example.com`,
    lastSeenAt: null,
    deletedAt,
    householdSetupAt: T0,
    activeHouseholdId,
    createdAt: T0,
    updatedAt: T0,
  }
}

function row(
  id: string,
  householdId: string,
  createdAt: Date,
  actorId: string,
  action: ActivityAction,
  extra: { targetUserId?: string; locationId?: string; details?: Prisma.JsonValue } = {},
): HouseholdActivityRow {
  return {
    id,
    householdId,
    actorId,
    action,
    targetUserId: extra.targetUserId ?? null,
    locationId: extra.locationId ?? null,
    details: extra.details ?? null,
    createdAt,
  }
}

const COUNTS = {
  items: 12,
  tags: 3,
  tagTypes: 1,
  vendors: 2,
  recipes: 0,
  shelves: 1,
  locations: 2,
  itemStocks: 14,
  inventoryLogs: 40,
  shoppingCarts: 2,
  cartItems: 5,
}

// hh_h's rows, oldest first. `act_07a` and `act_07b` have the SAME
// `createdAt`, and the store holds `07a` first. Newest first by
// `(createdAt, id)` puts `07b` first; an order without `id` keeps the store
// order and puts `07a` first.
const HH_H_ROWS: HouseholdActivityRow[] = [
  row('act_01', 'hh_h', at(1), OWEN, 'INVITE_CREATED', { details: { householdRole: 'member' } }),
  row('act_02', 'hh_h', at(2), OWEN, 'LOCATION_ROLE_SET', {
    targetUserId: BEA,
    locationId: LOC_K,
    details: { locationName: 'Old kitchen', from: null, to: 'organizer' },
  }),
  row('act_03', 'hh_h', at(3), MIA, 'LOCATION_ROLE_REMOVED', {
    targetUserId: DAN,
    locationId: LOC_SHED,
    details: { locationName: 'Shed', from: 'viewer' },
  }),
  row('act_04', 'hh_h', at(4), DAN, 'MEMBER_LEFT'),
  row('act_05', 'hh_h', at(5), OWEN, 'HOUSEHOLD_ROLE_CHANGED', {
    targetUserId: MIA,
    details: { from: 'member', to: 'manager' },
  }),
  row('act_06', 'hh_h', at(6), MIA, 'IMPORT', { details: { counts: COUNTS } }),
  row('act_07a', 'hh_h', at(7), OWEN, 'LOCATIONS_DELETED', { details: { count: 3 } }),
  row('act_07b', 'hh_h', at(7), MIA, 'INVITE_REVOKED'),
]

const HH_X_ROW = row('act_x1', 'hh_x', at(30), YUKI, 'INVITE_CREATED', {
  details: { householdRole: 'manager' },
})
const HH_B_ROW = row('act_b1', 'hh_b', at(2), BEA, 'HOUSEHOLD_CLEARED')

function seed(activities: HouseholdActivityRow[] = [...HH_H_ROWS, HH_X_ROW, HH_B_ROW]) {
  world.reset()
  world.stock.reset([loc(LOC_K, 'hh_h', 'Kitchen', 0), loc(LOC_Z, 'hh_x', 'Their place', 0)], [])
  world.seedHouseholds({
    households: [householdRow('hh_h', OWEN), householdRow('hh_x', YUKI), householdRow('hh_b', BEA)],
    householdMembers: [
      householdMemberRow('hh_h', OWEN, 'owner'),
      householdMemberRow('hh_h', MIA, 'manager'),
      householdMemberRow('hh_h', BEA, 'member'),
      householdMemberRow('hh_x', YUKI, 'owner'),
      householdMemberRow('hh_x', MIA, 'manager'),
      householdMemberRow('hh_b', BEA, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_K, BEA, 'organizer'),
      locationMemberRow(LOC_Z, YUKI, 'organizer'),
    ],
    householdActivities: activities,
  })
  world.users.reset([
    user(OWEN, 'Owen', 'hh_h'),
    user(MIA, 'Mia', 'hh_h'),
    user(BEA, 'Bea', 'hh_h'),
    user(DAN, 'Dan', null, new Date('2026-11-10T00:00:00.000Z')),
    user(YUKI, 'Yuki', 'hh_x'),
  ])
}

beforeEach(() => {
  seed()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── running the query ───────────────────────────────────────────────────────

const server = new ApolloServer<Context>({ typeDefs, resolvers })

type Result = {
  data?: Record<string, unknown> | null
  errors?: ReadonlyArray<{ message: string; extensions?: Record<string, unknown> }>
}

const ACTIVITY = `query A($before: ID, $first: Int) {
  householdActivity(before: $before, first: $first) {
    id action createdAt
    actorName actorIsMe actorDeleted
    targetName targetIsMe targetDeleted
    locationName fromRole toRole householdRole count
    importCounts {
      items tags tagTypes vendors recipes shelves locations
      itemStocks inventoryLogs shoppingCarts cartItems
    }
  }
}`

type Entry = Record<string, unknown> & { id: string }

async function run(userId: string, variables: Record<string, unknown> = {}): Promise<Result> {
  const contextValue: Context = { userId, clientId: 'tab-1', language: 'en', requestCache: {} }
  const res = await server.executeOperation({ query: ACTIVITY, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult as Result
}

async function entries(userId: string, variables: Record<string, unknown> = {}): Promise<Entry[]> {
  const res = await run(userId, variables)
  if (res.errors) throw new Error(`unexpected errors: ${JSON.stringify(res.errors)}`)
  return (res.data?.householdActivity ?? []) as Entry[]
}

async function ids(userId: string, variables: Record<string, unknown> = {}): Promise<string[]> {
  return (await entries(userId, variables)).map((e) => e.id)
}

function code(res: Result) {
  return res.errors?.[0]?.extensions?.code
}

const HH_H_NEWEST_FIRST = [
  'act_07b',
  'act_07a',
  'act_06',
  'act_05',
  'act_04',
  'act_03',
  'act_02',
  'act_01',
]

// ─── who may read it ─────────────────────────────────────────────────────────

describe('householdActivity: who may read it', () => {
  it("user sees the household's activity, newest first (household owner)", async () => {
    expect(await ids(OWEN)).toEqual(HH_H_NEWEST_FIRST)
  })

  it("user sees the household's activity, newest first (household manager)", async () => {
    expect(await ids(MIA)).toEqual(HH_H_NEWEST_FIRST)
  })

  it('household manager in two households sees only the household they act in', async () => {
    // Given MIA is a manager in hh_h and in hh_x
    // When she acts in hh_x
    world.setActiveHousehold(MIA, 'hh_x')

    // Then she sees hh_x's row and none of hh_h's
    expect(await ids(MIA)).toEqual(['act_x1'])

    // And back in hh_h she sees hh_h's rows and not hh_x's
    world.setActiveHousehold(MIA, 'hh_h')
    expect(await ids(MIA)).toEqual(HH_H_NEWEST_FIRST)
  })

  it('household member cannot read the activity, even as the organizer of a location', async () => {
    // BEA is a member of hh_h and organizes its kitchen
    const res = await run(BEA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(res.data?.householdActivity ?? null).toBeNull()
  })

  it('household member who owns another household reads only that one, when acting in it', async () => {
    // Acting in hh_h, BEA is a member there: refused, although she owns hh_b
    expect(code(await run(BEA))).toBe('FORBIDDEN')

    // Acting in hh_b, she is its owner: she sees hh_b's row only
    world.setActiveHousehold(BEA, 'hh_b')
    expect(await ids(BEA)).toEqual(['act_b1'])
  })

  it("another household's rows never appear", async () => {
    const seen = await ids(OWEN, { first: 200 })
    expect(seen).not.toContain('act_x1')
    expect(seen).not.toContain('act_b1')
  })

  it('a caller who is not signed in is refused', async () => {
    const contextValue: Context = { userId: null, clientId: 'tab-1', language: 'en', requestCache: {} }
    const res = await server.executeOperation({ query: ACTIVITY }, { contextValue })
    if (res.body.kind !== 'single') throw new Error('expected a single result')
    expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED')
  })
})

// ─── paging ──────────────────────────────────────────────────────────────────

describe('householdActivity: paging', () => {
  it('user can page through the activity with first and before', async () => {
    expect(await ids(OWEN, { first: 2 })).toEqual(['act_07b', 'act_07a'])
    expect(await ids(OWEN, { first: 2, before: 'act_07a' })).toEqual(['act_06', 'act_05'])
    expect(await ids(OWEN, { first: 2, before: 'act_05' })).toEqual(['act_04', 'act_03'])
    expect(await ids(OWEN, { first: 10, before: 'act_02' })).toEqual(['act_01'])
    expect(await ids(OWEN, { before: 'act_01' })).toEqual([])
  })

  it('two rows with the same createdAt keep one order, with id breaking the tie', async () => {
    // Twice, so the order is not an accident of one read
    expect((await ids(OWEN)).slice(0, 2)).toEqual(['act_07b', 'act_07a'])
    expect((await ids(OWEN)).slice(0, 2)).toEqual(['act_07b', 'act_07a'])
  })

  it('paging one row at a time crosses two rows with the same createdAt without losing one', async () => {
    expect(await ids(OWEN, { first: 1 })).toEqual(['act_07b'])
    expect(await ids(OWEN, { first: 1, before: 'act_07b' })).toEqual(['act_07a'])
    expect(await ids(OWEN, { first: 1, before: 'act_07a' })).toEqual(['act_06'])
  })

  it("an id of another household's row is BAD_USER_INPUT", async () => {
    const res = await run(OWEN, { before: 'act_x1' })
    expect(code(res)).toBe('BAD_USER_INPUT')
  })

  it('an unknown id is BAD_USER_INPUT', async () => {
    const res = await run(OWEN, { before: 'act_nope' })
    expect(code(res)).toBe('BAD_USER_INPUT')
  })

  it('first of 0 or less is BAD_USER_INPUT', async () => {
    expect(code(await run(OWEN, { first: 0 }))).toBe('BAD_USER_INPUT')
    expect(code(await run(OWEN, { first: -1 }))).toBe('BAD_USER_INPUT')
  })

  it('first defaults to 50, and a first above 200 is cut to 200', async () => {
    // Given 250 rows in hh_h, one minute apart
    const many = Array.from({ length: 250 }, (_, i) =>
      row(`act_m${String(i).padStart(3, '0')}`, 'hh_h', new Date(Date.UTC(2026, 0, 1, 0, i)), OWEN, 'INVITE_REVOKED'),
    )
    seed([...many, HH_X_ROW])

    const byDefault = await ids(OWEN)
    expect(byDefault).toHaveLength(50)
    expect(byDefault[0]).toBe('act_m249')

    const capped = await ids(OWEN, { first: 1000 })
    expect(capped).toHaveLength(200)
    expect(capped[0]).toBe('act_m249')
    expect(capped[199]).toBe('act_m050')
  })
})

// ─── what one entry says ─────────────────────────────────────────────────────

describe('householdActivity: the fields of an entry', () => {
  async function byId(userId: string): Promise<Map<string, Entry>> {
    return new Map((await entries(userId)).map((e) => [e.id, e]))
  }

  it('user sees who acted, and whether it was them', async () => {
    const seen = await byId(OWEN)
    expect(seen.get('act_01')).toMatchObject({ actorName: 'Owen', actorIsMe: true, actorDeleted: false })
    expect(seen.get('act_07b')).toMatchObject({ actorName: 'Mia', actorIsMe: false, actorDeleted: false })

    const asMia = await byId(MIA)
    expect(asMia.get('act_07b')).toMatchObject({ actorIsMe: true })
    expect(asMia.get('act_01')).toMatchObject({ actorIsMe: false })
  })

  it("user sees a deleted account's stored name, marked as deleted", async () => {
    const seen = await byId(OWEN)
    // DAN acted, and his account is deleted
    expect(seen.get('act_04')).toMatchObject({
      action: 'MEMBER_LEFT',
      actorName: 'Dan',
      actorIsMe: false,
      actorDeleted: true,
      targetName: null,
      targetIsMe: null,
      targetDeleted: null,
    })
    // DAN is the person a change was about
    expect(seen.get('act_03')).toMatchObject({ targetName: 'Dan', targetIsMe: false, targetDeleted: true })
  })

  it('user sees the person a change was about', async () => {
    const asBea = await byId(OWEN)
    expect(asBea.get('act_02')).toMatchObject({ targetName: 'Bea', targetIsMe: false, targetDeleted: false })
    const asMia = await byId(MIA)
    expect(asMia.get('act_05')).toMatchObject({ targetName: 'Mia', targetIsMe: true, targetDeleted: false })
  })

  it("user sees the location's name as it was when the change was logged, also after the location is deleted", async () => {
    const seen = await byId(OWEN)
    // The kitchen is called "Kitchen" now
    expect(seen.get('act_02')).toMatchObject({
      action: 'LOCATION_ROLE_SET',
      locationName: 'Old kitchen',
      fromRole: null,
      toRole: 'organizer',
    })
    // The shed is gone
    expect(seen.get('act_03')).toMatchObject({
      action: 'LOCATION_ROLE_REMOVED',
      locationName: 'Shed',
      fromRole: 'viewer',
      toRole: null,
    })
  })

  it('user sees a household role change, an invite role, a count and the import counts', async () => {
    const seen = await byId(OWEN)
    expect(seen.get('act_05')).toMatchObject({
      action: 'HOUSEHOLD_ROLE_CHANGED',
      fromRole: 'member',
      toRole: 'manager',
      householdRole: null,
      locationName: null,
    })
    expect(seen.get('act_01')).toMatchObject({ action: 'INVITE_CREATED', householdRole: 'member' })
    expect(seen.get('act_07a')).toMatchObject({ action: 'LOCATIONS_DELETED', count: 3, importCounts: null })
    expect(seen.get('act_06')).toMatchObject({ action: 'IMPORT', importCounts: COUNTS, count: null })
    expect(seen.get('act_07b')).toMatchObject({
      action: 'INVITE_REVOKED',
      locationName: null,
      fromRole: null,
      toRole: null,
      householdRole: null,
      count: null,
      importCounts: null,
    })
  })

  it('createdAt is an ISO date string', async () => {
    const seen = await byId(OWEN)
    expect(seen.get('act_01')?.createdAt).toBe(at(1).toISOString())
  })

  it('details of the wrong shape give null fields, not an error', async () => {
    seed([
      row('act_bad', 'hh_h', at(1), OWEN, 'LOCATION_ROLE_SET', {
        details: { locationName: 7, from: { x: 1 }, to: ['viewer'] },
      }),
      row('act_bad2', 'hh_h', at(2), OWEN, 'INVITE_CREATED', { details: { householdRole: 'king' } }),
      row('act_bad3', 'hh_h', at(3), OWEN, 'IMPORT', { details: { counts: 'many' } }),
      row('act_bad4', 'hh_h', at(4), OWEN, 'LOCATIONS_DELETED', { details: { count: 1.5 } }),
      row('act_bad5', 'hh_h', at(5), OWEN, 'HOUSEHOLD_CLEARED', { details: [1, 2] }),
    ])
    const seen = new Map((await entries(OWEN)).map((e) => [e.id, e]))
    expect(seen.get('act_bad')).toMatchObject({ locationName: null, fromRole: null, toRole: null })
    expect(seen.get('act_bad2')).toMatchObject({ householdRole: null })
    expect(seen.get('act_bad3')).toMatchObject({ importCounts: null })
    expect(seen.get('act_bad4')).toMatchObject({ count: null })
    expect(seen.get('act_bad5')).toMatchObject({ locationName: null, count: null })
  })

  it('an import row missing one count gives 0 for that count', async () => {
    const { cartItems: _dropped, ...partial } = COUNTS
    seed([row('act_imp', 'hh_h', at(1), MIA, 'IMPORT', { details: { counts: partial } })])
    const [entry] = await entries(OWEN)
    expect(entry?.importCounts).toEqual({ ...COUNTS, cartItems: 0 })
  })

  it('an actor with no User row shows an empty name, marked as deleted', async () => {
    // Production never deletes a User row, but /e2e/cleanup does
    seed([row('act_ghost', 'hh_h', at(1), 'user_ghost', 'MEMBER_LEFT')])
    const [entry] = await entries(OWEN)
    expect(entry).toMatchObject({ actorName: '', actorIsMe: false, actorDeleted: true })
  })
})

// ─── no e-mail ───────────────────────────────────────────────────────────────

describe('householdActivity: no e-mail', () => {
  it('reads names with id, displayName and deletedAt only, and answers no e-mail', async () => {
    const findMany = vi.spyOn(prisma.user, 'findMany')
    const res = await run(OWEN)

    expect(JSON.stringify(res)).not.toContain('@example.com')
    expect(findMany).toHaveBeenCalledTimes(1)
    const args = findMany.mock.calls[0]?.[0] as { select?: Record<string, unknown> } | undefined
    expect(args?.select).toEqual({ id: true, displayName: true, deletedAt: true })
  })
})
