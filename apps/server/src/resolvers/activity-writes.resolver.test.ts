import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import type { HouseholdRole } from '@prisma/client'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { HouseholdInviteRow } from '../test/householdFake.js'
import type { FakeLocation } from '../test/stockFake.js'
import type { UserRow } from '../test/userFake.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'
import { INVITE_TOKEN_LENGTH } from '../lib/invite.js'

// The activity rows of the writes that exist today (households H6, task J.2;
// plan docs/global/permissions/2026-11-20-households-plan-h6.md, decisions
// T47 and T51, owner decision O33-A).
//
// Every write here must:
//
// - write ONE row, with the right action, actor, target, location and
//   details, when it changed something;
// - write NO row when it changed nothing or was refused;
// - write the row through the transaction of the change. Two tests prove
//   it. (1) The global client's `householdActivity` is its own object over
//   the same store, and the `afterEach` below checks that nobody called it.
//   (2) The atomicity tests make the log write fail: the change must then be
//   gone too.
//
// `clearAllData`'s row is tested in `clearAllData.resolver.test.ts`, and the
// one-row-after-a-retry rule of `joinHousehold` in
// `invite-join.resolver.test.ts`, next to the other P2034 tests.
//
// ── THE FIXTURE ──
//
// | Person | Households             | Location roles                       |
// |--------|------------------------|--------------------------------------|
// | OWEN   | hh_h owner             | none                                 |
// | MIA    | hh_h manager           | none                                 |
// | BEA    | hh_h member            | LOC_K organizer                      |
// | VIC    | hh_h member            | LOC_K viewer                         |
// | NOA    | hh_h member            | LOC_G organizer, no role on LOC_K    |
// | YUKI   | hh_x owner             | LOC_Z organizer                      |
// | PAT    | hh_p owner (joins hh_h) | LOC_P organizer                     |
//
// NOA is a household `member` with an organizer role on ANOTHER location, so
// "has some location role" is not enough to import or to give roles on LOC_K.
// hh_x has rows of its own, so a row written to the wrong household shows.

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  // The global `prisma` gets its own copy of each model object over the same
  // stores. So a spy on `prisma.householdActivity` sees only the writes made
  // through the global client, never the ones made through `tx`.
  const copy = Object.fromEntries(
    Object.entries(world.client).map(([key, value]) => [
      key,
      value && typeof value === 'object' ? { ...value } : value,
    ]),
  )
  return { prisma: { ...copy, $transaction: world.client.$transaction, $world: world } }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const OWEN = 'user_owen'
const MIA = 'user_mia'
const BEA = 'user_bea'
const VIC = 'user_vic'
const NOA = 'user_noa'
const YUKI = 'user_yuki'
const PAT = 'user_pat'

const LOC_K = 'loc_kitchen'
const LOC_G = 'loc_garage'
const LOC_Z = 'loc_z'
const LOC_P = 'loc_pat_home'

const T0 = new Date('2026-01-01T00:00:00.000Z')
const NOW = new Date('2026-11-20T12:00:00.000Z')

function loc(id: string, householdId: string, name: string, order: number): FakeLocation {
  return { id, householdId, name, order, createdAt: T0, updatedAt: T0 }
}

function user(id: string, displayName: string, activeHouseholdId: string | null): UserRow {
  return {
    id,
    displayName,
    email: `${id}@example.com`,
    lastSeenAt: null,
    deletedAt: null,
    householdSetupAt: T0,
    activeHouseholdId,
    locationSort: null,
    createdAt: T0,
    updatedAt: T0,
  }
}

function tok(name: string): string {
  return name.padEnd(INVITE_TOKEN_LENGTH, '0')
}

function invite(
  id: string,
  householdRole: HouseholdRole,
  extra: Partial<HouseholdInviteRow> = {},
): HouseholdInviteRow {
  return {
    id,
    householdId: 'hh_h',
    token: tok(`token_${id}`),
    householdRole,
    locationRoles: [],
    createdById: OWEN,
    createdAt: T0,
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    usedAt: null,
    usedById: null,
    revokedAt: null,
    ...extra,
  }
}

/** PAT's invite into hh_h: `member`, viewer on the kitchen and on a location deleted since. */
const JOIN_TOKEN = tok('token_join')

function seed() {
  world.reset()
  world.stock.reset(
    [
      loc(LOC_K, 'hh_h', 'Kitchen', 0),
      loc(LOC_G, 'hh_h', 'Garage', 1),
      loc(LOC_Z, 'hh_x', 'Their place', 0),
      loc(LOC_P, 'hh_p', 'Pat home', 0),
    ],
    [],
  )
  world.seedHouseholds({
    households: [householdRow('hh_h', OWEN), householdRow('hh_x', YUKI), householdRow('hh_p', PAT)],
    householdMembers: [
      householdMemberRow('hh_h', OWEN, 'owner'),
      householdMemberRow('hh_h', MIA, 'manager'),
      householdMemberRow('hh_h', BEA, 'member'),
      householdMemberRow('hh_h', VIC, 'member'),
      householdMemberRow('hh_h', NOA, 'member'),
      householdMemberRow('hh_x', YUKI, 'owner'),
      householdMemberRow('hh_p', PAT, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_K, BEA, 'organizer'),
      locationMemberRow(LOC_K, VIC, 'viewer'),
      locationMemberRow(LOC_G, NOA, 'organizer'),
      locationMemberRow(LOC_Z, YUKI, 'organizer'),
      locationMemberRow(LOC_P, PAT, 'organizer'),
    ],
    householdInvites: [
      invite('inv_member', 'member'),
      invite('inv_manager', 'manager'),
      invite('inv_join', 'member', {
        token: JOIN_TOKEN,
        locationRoles: [
          { locationId: LOC_K, role: 'viewer' },
          { locationId: 'loc_gone', role: 'participant' },
        ],
      }),
    ],
  })
  world.users.reset([
    user(OWEN, 'Owen', 'hh_h'),
    user(MIA, 'Mia', 'hh_h'),
    user(BEA, 'Bea', 'hh_h'),
    user(VIC, 'Vic', 'hh_h'),
    user(NOA, 'Noa', 'hh_h'),
    user(YUKI, 'Yuki', 'hh_x'),
    user(PAT, 'Pat', 'hh_p'),
  ])
}

let seen: ChangeEvent[] = []
let unsubscribe: () => void = () => undefined
let globalCreate: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seed()
  seen = []
  unsubscribe = liveEvents.subscribe((event) => {
    seen.push(event)
  })
  globalCreate = vi.spyOn(prisma.householdActivity, 'create')
})

afterEach(() => {
  // No write may log through the global client: the row would not roll back
  // with the change (decision T47). Read the calls first and clean up
  // before the check, so one failure does not leak into the next test.
  const globalCalls = globalCreate.mock.calls.length
  unsubscribe()
  vi.restoreAllMocks()
  vi.useRealTimers()
  expect(globalCalls, 'householdActivity.create through the global client').toBe(0)
})

// ─── running an operation ────────────────────────────────────────────────────

const server = new ApolloServer<Context>({ typeDefs, resolvers })

type Result = {
  data?: Record<string, unknown> | null
  errors?: ReadonlyArray<{ message: string; extensions?: Record<string, unknown> }>
}

async function run(query: string, variables: Record<string, unknown>, userId: string): Promise<Result> {
  const contextValue: Context = { userId, clientId: 'tab-1', language: 'en', requestCache: {} }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult as Result
}

function ok(res: Result): Record<string, unknown> {
  if (res.errors) throw new Error(`unexpected errors: ${JSON.stringify(res.errors)}`)
  return res.data ?? {}
}

function code(res: Result) {
  return res.errors?.[0]?.extensions?.code
}

/** Every activity row, with only the columns a test asserts. */
function logRows() {
  return world.households.state.householdActivities.map((row) => ({
    householdId: row.householdId,
    actorId: row.actorId,
    action: row.action,
    targetUserId: row.targetUserId,
    locationId: row.locationId,
    details: row.details,
  }))
}

/** Make the next activity write through `tx` fail, as a database error would. */
function failNextLogWrite() {
  vi.spyOn(world.client.householdActivity, 'create').mockRejectedValueOnce(
    new Error('the log write failed'),
  )
}

function roleOn(locationId: string, userId: string) {
  return (
    world.households.state.locationMembers.find(
      (m) => m.locationId === locationId && m.userId === userId,
    )?.role ?? null
  )
}

function householdRoleOf(householdId: string, userId: string) {
  return (
    world.households.state.householdMembers.find(
      (m) => m.householdId === householdId && m.userId === userId,
    )?.role ?? null
  )
}

const SET_ROLE = `mutation S($l: ID!, $u: ID!, $r: LocationRole!) { setLocationRole(locationId: $l, userId: $u, role: $r) { role } }`
const REMOVE_ROLE = `mutation R($l: ID!, $u: ID!) { removeLocationRole(locationId: $l, userId: $u) }`
const LEAVE_LOCATION = `mutation L($l: ID!) { leaveLocation(locationId: $l) }`
const SET_HOUSEHOLD_ROLE = `mutation H($u: ID!, $r: HouseholdRole!) { setHouseholdRole(userId: $u, role: $r) { role } }`
const REMOVE_MEMBER = `mutation M($u: ID!) { removeMember(userId: $u) }`
const LEAVE_HOUSEHOLD = `mutation { leaveHousehold }`
const CREATE_INVITE = `mutation C($r: HouseholdRole!, $l: [InviteLocationRoleInput!]!) { createInvite(householdRole: $r, locationRoles: $l) { id } }`
const REVOKE_INVITE = `mutation V($id: ID!) { revokeInvite(id: $id) }`
const JOIN = `mutation J($t: String!) { joinHousehold(token: $t) { id } }`
const RECORD_IMPORT = `mutation I($c: ImportCountsInput!) { recordImport(counts: $c) }`

// ─── location roles (location.resolver.ts) ──────────────────────────────────

describe('location role writes are logged', () => {
  it('household owner who gives a person a new location role writes one LOCATION_ROLE_SET row', async () => {
    // When OWEN gives NOA, who has no role on the kitchen, the viewer role
    ok(await run(SET_ROLE, { l: LOC_K, u: NOA, r: 'viewer' }, OWEN))

    // Then one row names the actor, the person, the location, its name and the change
    expect(logRows()).toEqual([
      {
        householdId: 'hh_h',
        actorId: OWEN,
        action: 'LOCATION_ROLE_SET',
        targetUserId: NOA,
        locationId: LOC_K,
        details: { locationName: 'Kitchen', from: null, to: 'viewer' },
      },
    ])
  })

  it('location organizer who changes a role writes the old and the new role', async () => {
    // When BEA, the kitchen's organizer, makes VIC a participant
    ok(await run(SET_ROLE, { l: LOC_K, u: VIC, r: 'participant' }, BEA))

    expect(logRows()).toEqual([
      {
        householdId: 'hh_h',
        actorId: BEA,
        action: 'LOCATION_ROLE_SET',
        targetUserId: VIC,
        locationId: LOC_K,
        details: { locationName: 'Kitchen', from: 'viewer', to: 'participant' },
      },
    ])
  })

  it('the same role again writes no row', async () => {
    ok(await run(SET_ROLE, { l: LOC_K, u: VIC, r: 'viewer' }, OWEN))
    expect(logRows()).toEqual([])
  })

  it('location viewer cannot give a role, and the refusal writes no row', async () => {
    const res = await run(SET_ROLE, { l: LOC_K, u: NOA, r: 'viewer' }, VIC)
    expect(code(res)).toBe('FORBIDDEN')
    expect(logRows()).toEqual([])
  })

  it('household member with a role on another location cannot give a role here, and nothing is logged', async () => {
    const res = await run(SET_ROLE, { l: LOC_K, u: VIC, r: 'participant' }, NOA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(logRows()).toEqual([])
  })

  it('the role change and its row roll back together when the log write fails', async () => {
    // Given the log write will fail
    failNextLogWrite()

    // When OWEN gives NOA a role
    const res = await run(SET_ROLE, { l: LOC_K, u: NOA, r: 'viewer' }, OWEN)

    // Then the mutation fails, NOA has no role, there is no row and no event
    expect(res.errors).toBeDefined()
    expect(roleOn(LOC_K, NOA)).toBeNull()
    expect(logRows()).toEqual([])
    expect(seen).toEqual([])
  })

  it('household manager who removes a role writes one LOCATION_ROLE_REMOVED row', async () => {
    expect(ok(await run(REMOVE_ROLE, { l: LOC_K, u: VIC }, MIA)).removeLocationRole).toBe(true)
    expect(logRows()).toEqual([
      {
        householdId: 'hh_h',
        actorId: MIA,
        action: 'LOCATION_ROLE_REMOVED',
        targetUserId: VIC,
        locationId: LOC_K,
        details: { locationName: 'Kitchen', from: 'viewer' },
      },
    ])
  })

  it('removing a role nobody has answers false and writes no row', async () => {
    expect(ok(await run(REMOVE_ROLE, { l: LOC_K, u: NOA }, OWEN)).removeLocationRole).toBe(false)
    expect(logRows()).toEqual([])
  })

  it('location viewer who leaves writes one LOCATION_LEFT row', async () => {
    expect(ok(await run(LEAVE_LOCATION, { l: LOC_K }, VIC)).leaveLocation).toBe(true)
    expect(logRows()).toEqual([
      {
        householdId: 'hh_h',
        actorId: VIC,
        action: 'LOCATION_LEFT',
        targetUserId: null,
        locationId: LOC_K,
        details: { locationName: 'Kitchen', from: 'viewer' },
      },
    ])
  })

  it('leaving a location with no role answers false and writes no row', async () => {
    expect(ok(await run(LEAVE_LOCATION, { l: LOC_K }, NOA)).leaveLocation).toBe(false)
    expect(logRows()).toEqual([])
  })
})

// ─── household roles and members (household.resolver.ts) ──────────────────

describe('household member writes are logged', () => {
  it('household owner who makes a member a manager writes one HOUSEHOLD_ROLE_CHANGED row', async () => {
    ok(await run(SET_HOUSEHOLD_ROLE, { u: BEA, r: 'manager' }, OWEN))
    expect(logRows()).toEqual([
      {
        householdId: 'hh_h',
        actorId: OWEN,
        action: 'HOUSEHOLD_ROLE_CHANGED',
        targetUserId: BEA,
        locationId: null,
        details: { from: 'member', to: 'manager' },
      },
    ])
  })

  it('the same household role again writes no row', async () => {
    ok(await run(SET_HOUSEHOLD_ROLE, { u: MIA, r: 'manager' }, OWEN))
    expect(logRows()).toEqual([])
  })

  it('household manager cannot change a household role, and the refusal writes no row', async () => {
    const res = await run(SET_HOUSEHOLD_ROLE, { u: BEA, r: 'manager' }, MIA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(logRows()).toEqual([])
  })

  it('the household role change and its row roll back together when the log write fails', async () => {
    failNextLogWrite()
    const res = await run(SET_HOUSEHOLD_ROLE, { u: BEA, r: 'manager' }, OWEN)
    expect(res.errors).toBeDefined()
    expect(householdRoleOf('hh_h', BEA)).toBe('member')
    expect(logRows()).toEqual([])
    expect(seen).toEqual([])
  })

  it('household manager who removes a member writes one MEMBER_REMOVED row', async () => {
    ok(await run(REMOVE_MEMBER, { u: VIC }, MIA))
    expect(logRows()).toEqual([
      {
        householdId: 'hh_h',
        actorId: MIA,
        action: 'MEMBER_REMOVED',
        targetUserId: VIC,
        locationId: null,
        details: null,
      },
    ])
  })

  it('household member cannot remove anyone, and the refusal writes no row', async () => {
    const res = await run(REMOVE_MEMBER, { u: VIC }, BEA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(logRows()).toEqual([])
  })

  it('household member who leaves writes one MEMBER_LEFT row', async () => {
    ok(await run(LEAVE_HOUSEHOLD, {}, BEA))
    expect(logRows()).toEqual([
      {
        householdId: 'hh_h',
        actorId: BEA,
        action: 'MEMBER_LEFT',
        targetUserId: null,
        locationId: null,
        details: null,
      },
    ])
  })

  it('household owner cannot leave, and the refusal writes no row', async () => {
    const res = await run(LEAVE_HOUSEHOLD, {}, OWEN)
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(logRows()).toEqual([])
  })
})

// ─── invites and joins (invite.resolver.ts) ─────────────────────────────────

describe('invite writes and joins are logged', () => {
  it('household manager who creates an invite writes one INVITE_CREATED row', async () => {
    ok(await run(CREATE_INVITE, { r: 'member', l: [{ locationId: LOC_K, role: 'viewer' }] }, MIA))
    expect(logRows()).toEqual([
      {
        householdId: 'hh_h',
        actorId: MIA,
        action: 'INVITE_CREATED',
        targetUserId: null,
        locationId: null,
        details: { householdRole: 'member' },
      },
    ])
    // And the invite is written, and other tabs hear of it
    expect(world.households.state.householdInvites).toHaveLength(4)
    expect(seen).toHaveLength(1)
  })

  it('household manager cannot invite a manager, and the refusal writes no row', async () => {
    const res = await run(CREATE_INVITE, { r: 'manager', l: [] }, MIA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(logRows()).toEqual([])
  })

  it('the invite and its row roll back together when the log write fails', async () => {
    failNextLogWrite()
    const res = await run(CREATE_INVITE, { r: 'member', l: [] }, MIA)
    expect(res.errors).toBeDefined()
    expect(world.households.state.householdInvites).toHaveLength(3)
    expect(logRows()).toEqual([])
    expect(seen).toEqual([])
  })

  it('household owner who revokes an invite writes one INVITE_REVOKED row', async () => {
    expect(ok(await run(REVOKE_INVITE, { id: 'inv_manager' }, OWEN)).revokeInvite).toBe(true)
    expect(logRows()).toEqual([
      {
        householdId: 'hh_h',
        actorId: OWEN,
        action: 'INVITE_REVOKED',
        targetUserId: null,
        locationId: null,
        details: null,
      },
    ])
  })

  it('a revoke that answers false writes no row', async () => {
    // A manager may not revoke a `manager` invite, and an unknown id is no invite
    expect(ok(await run(REVOKE_INVITE, { id: 'inv_manager' }, MIA)).revokeInvite).toBe(false)
    expect(ok(await run(REVOKE_INVITE, { id: 'inv_unknown' }, OWEN)).revokeInvite).toBe(false)
    expect(logRows()).toEqual([])
  })

  it('the revoke and its row roll back together when the log write fails', async () => {
    failNextLogWrite()
    const res = await run(REVOKE_INVITE, { id: 'inv_member' }, OWEN)
    expect(res.errors).toBeDefined()
    const row = world.households.state.householdInvites.find((i) => i.id === 'inv_member')
    expect(row?.revokedAt).toBeNull()
    expect(logRows()).toEqual([])
    expect(seen).toEqual([])
  })

  it('user who joins writes one MEMBER_JOINED row in the household joined, with the location roles given', async () => {
    ok(await run(JOIN, { t: JOIN_TOKEN }, PAT))
    expect(logRows()).toEqual([
      {
        householdId: 'hh_h',
        actorId: PAT,
        action: 'MEMBER_JOINED',
        targetUserId: null,
        locationId: null,
        // The deleted location is left out, as the join leaves out its role
        details: {
          householdRole: 'member',
          locationRoles: [{ locationId: LOC_K, locationName: 'Kitchen', role: 'viewer' }],
        },
      },
    ])
  })

  it('the join and its row roll back together when the log write fails', async () => {
    failNextLogWrite()
    const res = await run(JOIN, { t: JOIN_TOKEN }, PAT)
    expect(res.errors).toBeDefined()
    expect(householdRoleOf('hh_h', PAT)).toBeNull()
    expect(roleOn(LOC_K, PAT)).toBeNull()
    expect(logRows()).toEqual([])
    expect(seen).toEqual([])
  })
})

// ─── recordImport (import.resolver.ts, owner decision O33-A) ───────────────

const COUNTS = {
  items: 12,
  tags: 3,
  tagTypes: 1,
  vendors: 2,
  recipes: 1,
  shelves: 0,
  locations: 2,
  itemStocks: 14,
  inventoryLogs: 40,
  shoppingCarts: 1,
  cartItems: 2,
}

describe('recordImport', () => {
  it('household manager who records an import writes one IMPORT row with the counts', async () => {
    expect(ok(await run(RECORD_IMPORT, { c: COUNTS }, MIA)).recordImport).toBe(true)
    expect(logRows()).toEqual([
      {
        householdId: 'hh_h',
        actorId: MIA,
        action: 'IMPORT',
        targetUserId: null,
        locationId: null,
        details: { counts: COUNTS },
      },
    ])
    // It publishes nothing: the import's own mutations already did
    expect(seen).toEqual([])
  })

  it('household owner can record an import', async () => {
    expect(ok(await run(RECORD_IMPORT, { c: COUNTS }, OWEN)).recordImport).toBe(true)
    expect(logRows()).toHaveLength(1)
  })

  it('household member cannot record an import, even as the organizer of a location, and nothing is logged', async () => {
    const res = await run(RECORD_IMPORT, { c: COUNTS }, NOA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(logRows()).toEqual([])
  })

  it('writes the row to the household the caller acts in, not another one they manage', async () => {
    // Given YUKI owns hh_x and is also a manager of hh_h. Both rows give the
    // right to import, so only the active household can decide. The test
    // runs once with each household active, so it does not depend on the
    // order of the member rows in the store.
    world.households.state.householdMembers.push(householdMemberRow('hh_h', YUKI, 'manager'))
    const yuki = world.users.state.rows.find((row) => row.id === YUKI)
    if (!yuki) throw new Error('fixture: YUKI has no User row')

    // When YUKI records an import while acting in hh_x, then in hh_h
    ok(await run(RECORD_IMPORT, { c: COUNTS }, YUKI))
    yuki.activeHouseholdId = 'hh_h'
    ok(await run(RECORD_IMPORT, { c: COUNTS }, YUKI))

    // Then each row is in the household YUKI was acting in at the time
    expect(logRows().map((r) => r.householdId)).toEqual(['hh_x', 'hh_h'])
  })

  it('refuses a negative count with BAD_USER_INPUT, and writes no row', async () => {
    const res = await run(RECORD_IMPORT, { c: { ...COUNTS, items: -1 } }, MIA)
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(logRows()).toEqual([])
  })
})
