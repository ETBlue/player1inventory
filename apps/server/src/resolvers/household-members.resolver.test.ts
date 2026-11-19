import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import type { HouseholdRole } from '@prisma/client'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { AppLanguage, Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { HouseholdInviteRow } from '../test/householdFake.js'
import type { FakeLocation } from '../test/stockFake.js'
import type { UserRow } from '../test/userFake.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'
import { INVITE_TOKEN_LENGTH } from '../lib/invite.js'
import { shouldDeliver } from './live.resolver.js'

// The Members page's server side (households H5b, task G.5; plan
// docs/global/permissions/2026-11-18-households-plan-h5b.md, decisions T11,
// T16, T19 and T22, owner decisions O13-A, O16-A and O20):
// `householdMembers`, `setHouseholdRole`, `removeMember`, `leaveHousehold`
// and `createHousehold`.
//
// ── THE FIXTURE ──
//
// | Person | Households, OLDEST first              | Active | Location roles          |
// |--------|---------------------------------------|--------|-------------------------|
// | OWEN   | hh_x member, hh_h owner               | hh_h   | LOC_K, LOC_G organizer  |
// | MIA    | hh_x manager, hh_h manager            | hh_h   | LOC_K organizer, LOC_Z viewer |
// | MAX    | hh_h manager                          | —      | LOC_G participant       |
// | BEA    | hh_b owner, hh_h member               | hh_h   | LOC_K participant, LOC_G viewer, LOC_B organizer |
// | BOB    | hh_h member                           | —      | LOC_K viewer            |
// | YUKI   | hh_x owner (a stranger to hh_h)       | —      | LOC_Z organizer         |
// | PIA    | none (set up once, then left)         | —      | none                    |
// | NEWT   | none, never set up                    | —      | none                    |
//
// OWEN, MIA and BEA act in hh_h, which is NOT their oldest membership. So a
// resolver that read their oldest membership instead of the household they
// act in (decision T14) would act in hh_x or hh_b, and the tests fail.
//
// BEA has a location role in a SECOND household (LOC_B in hh_b). So a delete
// of her location roles with no household filter would also delete that one.
//
// In hh_h the owner did NOT join first (MAX did), and BEA and BOB joined at
// the same moment. So "owner first, then by joinedAt, then by id" is tested
// against a store order that gives a different list.

vi.mock('../lib/household.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/household.js')>()
  return { ...real, ensureHousehold: vi.fn(real.ensureHousehold) }
})

// The global `prisma` gets its OWN copy of each model object, over the same
// stores. A `$transaction` callback receives `world.client` as its `tx`, so a
// spy on `prisma.<model>` sees only the reads made OUTSIDE a transaction, and
// a spy on `world.client.<model>` only the ones made through `tx`. That is what
// lets a test see whether a resolver passes `tx` to `requireHouseholdRole`
// (review of G.5). It works because no fake method uses `this`.
vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  const copy = Object.fromEntries(
    Object.entries(world.client).map(([key, value]) => [
      key,
      value && typeof value === 'object' ? { ...value } : value,
    ]),
  )
  return { prisma: { ...copy, $world: world } }
})

import { prisma } from '../lib/prisma.js'
import { ensureHousehold } from '../lib/household.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const OWEN = 'user_owen'
const MIA = 'user_mia'
const MAX = 'user_max'
const BEA = 'user_bea'
const BOB = 'user_bob'
const YUKI = 'user_yuki'
const PIA = 'user_pia'
const NEWT = 'user_newt'

const LOC_K = 'loc_kitchen'
const LOC_G = 'loc_garage'
const LOC_Z = 'loc_z'
const LOC_B = 'loc_bea_home'

const TAB = 'tab-1'
const OTHER_TAB = 'tab-2'
const T0 = new Date('2026-01-01T00:00:00.000Z')
const NOW = new Date('2026-11-18T12:00:00.000Z')
const D1 = new Date('2026-09-01T00:00:00.000Z')
const D2 = new Date('2026-09-02T00:00:00.000Z')
const D3 = new Date('2026-09-03T00:00:00.000Z')
const D4 = new Date('2026-09-04T00:00:00.000Z')
const D5 = new Date('2026-09-05T00:00:00.000Z')

function loc(id: string, householdId: string, order: number): FakeLocation {
  return { id, householdId, name: `${id} name`, order, createdAt: T0, updatedAt: T0 }
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
    createdAt: T0,
    updatedAt: T0,
  }
}

function tok(name: string): string {
  return name.padEnd(INVITE_TOKEN_LENGTH, '0')
}

/** An open `member` invite to hh_h, used by NEWT to join. */
const NEWT_LINK = tok('tok_newt')

function invite(
  id: string,
  createdById: string,
  token: string,
  householdId = 'hh_h',
): HouseholdInviteRow {
  return {
    id,
    householdId,
    token,
    householdRole: 'member',
    locationRoles: [],
    createdById,
    createdAt: T0,
    expiresAt: new Date('2026-11-20T00:00:00.000Z'),
    usedAt: null,
    usedById: null,
    revokedAt: null,
  }
}

function seed() {
  world.reset()
  world.stock.reset(
    [loc(LOC_K, 'hh_h', 0), loc(LOC_G, 'hh_h', 1), loc(LOC_Z, 'hh_x', 0), loc(LOC_B, 'hh_b', 0)],
    [],
  )
  world.seedHouseholds({
    households: [householdRow('hh_x', YUKI), householdRow('hh_h', OWEN), householdRow('hh_b', BEA)],
    // Store order on purpose: not the order the list must have.
    householdMembers: [
      { ...householdMemberRow('hh_h', BOB, 'member'), joinedAt: D4 },
      { ...householdMemberRow('hh_h', BEA, 'member'), joinedAt: D4 },
      { ...householdMemberRow('hh_h', MIA, 'manager'), joinedAt: D3 },
      { ...householdMemberRow('hh_h', OWEN, 'owner'), joinedAt: D2 },
      { ...householdMemberRow('hh_h', MAX, 'manager'), joinedAt: D1 },
      { ...householdMemberRow('hh_x', YUKI, 'owner'), joinedAt: T0 },
      { ...householdMemberRow('hh_x', OWEN, 'member'), joinedAt: T0 },
      { ...householdMemberRow('hh_x', MIA, 'manager'), joinedAt: T0 },
      { ...householdMemberRow('hh_b', BEA, 'owner'), joinedAt: T0 },
    ],
    locationMembers: [
      locationMemberRow(LOC_K, OWEN, 'organizer'),
      locationMemberRow(LOC_G, OWEN, 'organizer'),
      locationMemberRow(LOC_K, MIA, 'organizer'),
      locationMemberRow(LOC_Z, MIA, 'viewer'),
      locationMemberRow(LOC_G, MAX, 'participant'),
      locationMemberRow(LOC_K, BEA, 'participant'),
      locationMemberRow(LOC_G, BEA, 'viewer'),
      locationMemberRow(LOC_B, BEA, 'organizer'),
      locationMemberRow(LOC_K, BOB, 'viewer'),
      locationMemberRow(LOC_Z, YUKI, 'organizer'),
    ],
    // MIA's invites cover every case of owner decision O20: open in hh_h,
    // open in her OTHER household hh_x, used, already revoked, and expired
    // but never used.
    householdInvites: [
      invite('inv_newt', OWEN, NEWT_LINK),
      invite('inv_max', MAX, tok('tok_max')),
      invite('inv_mia_h', MIA, tok('tok_mia_h')),
      invite('inv_mia_x', MIA, tok('tok_mia_x'), 'hh_x'),
      { ...invite('inv_mia_used', MIA, tok('tok_mia_used')), usedAt: D5, usedById: BOB },
      { ...invite('inv_mia_revoked', MIA, tok('tok_mia_revoked')), revokedAt: D5 },
      { ...invite('inv_mia_expired', MIA, tok('tok_mia_expired')), expiresAt: D5 },
    ],
  })
  world.users.reset([
    user(OWEN, 'Owen', 'hh_h'),
    user(MIA, 'Mia', 'hh_h'),
    user(MAX, 'Max', null),
    user(BEA, 'Bea', 'hh_h'),
    user(BOB, 'Bob', null),
    user(YUKI, 'Yuki', null),
    user(PIA, 'Pia', null),
    { ...user(NEWT, 'Newt', null), householdSetupAt: null },
  ])
}

let seen: ChangeEvent[] = []
let unsubscribe: () => void = () => undefined

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seed()
  vi.mocked(ensureHousehold).mockClear()
  seen = []
  unsubscribe = liveEvents.subscribe((event) => {
    seen.push(event)
  })
})

afterEach(() => {
  unsubscribe()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ─── running an operation ────────────────────────────────────────────────────

const server = new ApolloServer<Context>({ typeDefs, resolvers })

type Result = {
  data?: Record<string, unknown> | null
  errors?: ReadonlyArray<{ message: string; extensions?: Record<string, unknown> }>
}

async function run(
  query: string,
  variables: Record<string, unknown>,
  userId: string,
  language: AppLanguage = 'en',
): Promise<Result> {
  const contextValue: Context = { userId, clientId: TAB, language }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult as Result
}

const PERSON = 'userId displayName role joinedAt isMe'
const MEMBERS = `query { householdMembers { ${PERSON} } }`
const SET_ROLE = `mutation S($userId: ID!, $role: HouseholdRole!) { setHouseholdRole(userId: $userId, role: $role) { ${PERSON} } }`
const REMOVE = `mutation R($userId: ID!) { removeMember(userId: $userId) }`
const LEAVE = `mutation { leaveHousehold }`
const CREATE = `mutation C($name: String) { createHousehold(name: $name) { id name role } }`
const HOUSEHOLD = `query { household { id } }`
const JOIN = `mutation J($token: String!) { joinHousehold(token: $token) { id } }`
const INVITES = `query { householdInvites { id } }`

const setRole = (actor: string, userId: string, role: HouseholdRole) =>
  run(SET_ROLE, { userId, role }, actor)
const remove = (actor: string, userId: string) => run(REMOVE, { userId }, actor)
const leave = (actor: string) => run(LEAVE, {}, actor)
const create = (actor: string, name: string | null, language: AppLanguage = 'en') =>
  run(CREATE, { name }, actor, language)

function code(res: Result) {
  return res.errors?.[0]?.extensions?.code
}

function reason(res: Result) {
  return res.errors?.[0]?.extensions?.reason
}

function members() {
  return world.households.state.householdMembers
    .map((m) => `${m.householdId}:${m.userId}:${m.role}`)
    .sort()
}

function locationRolesOf(userId: string) {
  return world.households.state.locationMembers
    .filter((m) => m.userId === userId)
    .map((m) => `${m.locationId}:${m.role}`)
    .sort()
}

function householdIds() {
  return world.households.state.households.map((h) => h.id).sort()
}

function userRow(userId: string) {
  const row = world.users.state.rows.find((r) => r.id === userId)
  if (!row) throw new Error(`no stored User row for ${userId}`)
  return row
}

/** Everything a refused call must leave as it was. */
function snapshot() {
  return {
    members: members(),
    locationMembers: world.households.state.locationMembers
      .map((m) => `${m.locationId}:${m.userId}:${m.role}`)
      .sort(),
    households: householdIds(),
    locations: world.stock.state.locations.map((l) => l.id).sort(),
    users: world.users.state.rows.map((r) => `${r.id}:${r.activeHouseholdId}`).sort(),
    invites: inviteStates(),
  }
}

/** Every invite as `id:open`, or `id:<revokedAt>`. */
function inviteStates() {
  return world.households.state.householdInvites
    .map((i) => `${i.id}:${i.revokedAt ? i.revokedAt.toISOString() : 'open'}`)
    .sort()
}

/** The invites a removal or leave of MIA from hh_h must revoke (owner decision O20). */
function miaRevokedInHh() {
  return [
    `inv_max:open`,
    `inv_mia_expired:${NOW.toISOString()}`,
    `inv_mia_h:${NOW.toISOString()}`,
    `inv_mia_revoked:${D5.toISOString()}`,
    `inv_mia_used:open`,
    `inv_mia_x:open`,
    `inv_newt:open`,
  ]
}

function locationEvent(householdId: string): ChangeEvent {
  return { kind: 'LOCATION', householdId, locationId: null, sourceClientId: TAB }
}

/**
 * Spy on every write to `User` rows, through `tx` AND through the global
 * client. Returns the user ids each one named.
 */
function spyOnUserWrites() {
  const named: unknown[] = []
  for (const client of [world.client.user, prisma.user]) {
    const users = client as unknown as Record<string, (...args: unknown[]) => unknown>
    for (const method of ['update', 'updateMany', 'upsert', 'create']) {
      if (typeof users[method] !== 'function') continue
      const real = users[method].bind(users)
      vi.spyOn(users, method).mockImplementation(async (...args: unknown[]) => {
        const a = args[0] as { where?: { id?: unknown }; data?: { id?: unknown } }
        named.push(a.where?.id ?? a.data?.id)
        return real(...args)
      })
    }
  }
  return named
}

// ─── householdMembers ────────────────────────────────────────────────────────

describe('householdMembers', () => {
  it('household member sees every person of the household, owner first, then by joinedAt', async () => {
    // Given BEA, a member of hh_h (her oldest membership is hh_b)
    // When she reads the members list
    const res = await run(MEMBERS, {}, BEA)

    // Then she sees all five people of hh_h with their names and household
    // roles (owner decision O13-A), the owner first even though MAX joined
    // earlier, and BEA before BOB (same joinedAt, then by id)
    expect(res.errors).toBeUndefined()
    expect(res.data?.householdMembers).toEqual([
      { userId: OWEN, displayName: 'Owen', role: 'owner', joinedAt: D2.toISOString(), isMe: false },
      { userId: MAX, displayName: 'Max', role: 'manager', joinedAt: D1.toISOString(), isMe: false },
      { userId: MIA, displayName: 'Mia', role: 'manager', joinedAt: D3.toISOString(), isMe: false },
      { userId: BEA, displayName: 'Bea', role: 'member', joinedAt: D4.toISOString(), isMe: true },
      { userId: BOB, displayName: 'Bob', role: 'member', joinedAt: D4.toISOString(), isMe: false },
    ])
  })

  it('a person of another household gets that household’s list, never hh_h’s', async () => {
    // Given YUKI, the owner of hh_x, where OWEN and MIA are also members
    const res = await run(MEMBERS, {}, YUKI)

    // Then the list is hh_x's three people only
    expect(res.data?.householdMembers).toEqual([
      expect.objectContaining({ userId: YUKI, role: 'owner', isMe: true }),
      expect.objectContaining({ userId: MIA, role: 'manager' }),
      expect.objectContaining({ userId: OWEN, role: 'member' }),
    ])
  })

  it('the list reads names only, never an e-mail address (O13-A)', async () => {
    const findMany = vi.spyOn(prisma.user, 'findMany')

    const res = await run(MEMBERS, {}, OWEN)

    expect(res.errors).toBeUndefined()
    expect(findMany).toHaveBeenCalled()
    for (const call of findMany.mock.calls) {
      expect(call[0]?.select).toEqual({ id: true, displayName: true })
    }
  })

  it('HouseholdPerson has no e-mail field at all, so no role can read one', async () => {
    const res = await run(`query { __type(name: "HouseholdPerson") { fields { name } } }`, {}, BEA)
    const type = res.data?.__type as { fields: { name: string }[] } | null
    expect(type?.fields.map((f) => f.name).sort()).toEqual(
      // `hasLocationRole` since households H5c task H.2 (decision T40).
      ['displayName', 'hasLocationRole', 'isMe', 'joinedAt', 'role', 'userId'].sort(),
    )
  })

  it('a person in no household gets NO_HOUSEHOLD', async () => {
    const res = await run(MEMBERS, {}, PIA)
    expect(code(res)).toBe('NO_HOUSEHOLD')
  })
})

// ─── setHouseholdRole ────────────────────────────────────────────────────────

describe('setHouseholdRole', () => {
  it('household owner can make a member a manager and back', async () => {
    // Given OWEN, the owner of hh_h, and BOB, a member
    // When OWEN makes BOB a manager
    const up = await setRole(OWEN, BOB, 'manager')

    // Then BOB is a manager, and the answer is BOB's row
    expect(up.errors).toBeUndefined()
    expect(up.data?.setHouseholdRole).toEqual({
      userId: BOB,
      displayName: 'Bob',
      role: 'manager',
      joinedAt: D4.toISOString(),
      isMe: false,
    })
    expect(members()).toContain(`hh_h:${BOB}:manager`)

    // When OWEN makes him a member again
    const down = await setRole(OWEN, BOB, 'member')
    expect(down.errors).toBeUndefined()
    expect(members()).toContain(`hh_h:${BOB}:member`)
    // And BOB's location role is untouched by both changes
    expect(locationRolesOf(BOB)).toEqual([`${LOC_K}:viewer`])
  })

  // `hasLocationRole` on the answer (households H5c, decision T40). The
  // shared `PERSON` selection does not name it, so these tests ask for it.
  const SET_ROLE_MARK = `mutation S($userId: ID!, $role: HouseholdRole!) { setHouseholdRole(userId: $userId, role: $role) { userId hasLocationRole } }`
  const setRoleMark = async (userId: string, role: HouseholdRole) => {
    const res = await run(SET_ROLE_MARK, { userId, role }, OWEN)
    expect(res.errors).toBeUndefined()
    return (res.data?.setHouseholdRole as { hasLocationRole: boolean }).hasLocationRole
  }

  it('the answer marks a person with a location role in this household', async () => {
    // Given BOB, a member with a viewer role on LOC_K (hh_h)
    // When OWEN promotes him, and demotes him again
    // Then both answers say he has a location role
    expect(await setRoleMark(BOB, 'manager')).toBe(true)
    expect(await setRoleMark(BOB, 'member')).toBe(true)
  })

  it('the answer does not mark a person with no location role', async () => {
    // Given BOB with his only location role removed
    world.households.state.locationMembers = world.households.state.locationMembers.filter(
      (m) => m.userId !== BOB,
    )

    // When OWEN promotes him
    // Then the answer says he has no location role
    expect(await setRoleMark(BOB, 'manager')).toBe(false)
  })

  it('the answer does not count a role on another household\'s location', async () => {
    // Given MIA, a manager of hh_h, whose only location role left is the
    // viewer role on LOC_Z, a location of hh_x
    world.households.state.locationMembers = world.households.state.locationMembers.filter(
      (m) => !(m.userId === MIA && m.locationId === LOC_K),
    )
    expect(locationRolesOf(MIA)).toEqual([`${LOC_Z}:viewer`])

    // When OWEN demotes her to member
    // Then the answer says she has no location role in hh_h
    expect(await setRoleMark(MIA, 'member')).toBe(false)
  })

  it('household manager cannot change a role', async () => {
    const before = snapshot()
    const res = await setRole(MIA, BOB, 'manager')
    expect(code(res)).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
  })

  it('household member cannot change a role', async () => {
    const res = await setRole(BEA, BOB, 'manager')
    expect(code(res)).toBe('FORBIDDEN')
    expect(members()).toContain(`hh_h:${BOB}:member`)
  })

  it('the owner’s own role cannot be changed', async () => {
    const res = await setRole(OWEN, OWEN, 'manager')
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(members()).toContain(`hh_h:${OWEN}:owner`)
  })

  it('role owner is refused', async () => {
    const res = await setRole(OWEN, MIA, 'owner')
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(members()).toContain(`hh_h:${MIA}:manager`)
  })

  it('a person outside the household is FORBIDDEN, and their role elsewhere is untouched', async () => {
    // YUKI is in hh_x only. OWEN is a member of hh_x, so a lookup that is not
    // scoped to hh_h would find nothing to stop it.
    const before = snapshot()
    const res = await setRole(OWEN, YUKI, 'manager')
    expect(code(res)).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
  })

  it('a person in no household gets NO_HOUSEHOLD', async () => {
    const res = await setRole(PIA, BOB, 'manager')
    expect(code(res)).toBe('NO_HOUSEHOLD')
    expect(members()).toContain(`hh_h:${BOB}:member`)
  })

  it('the role is changed in the household the owner acts in, not in their other one', async () => {
    // MIA is a manager in BOTH hh_h and hh_x. OWEN acts in hh_h.
    await setRole(OWEN, MIA, 'member')
    expect(members()).toContain(`hh_h:${MIA}:member`)
    expect(members()).toContain(`hh_x:${MIA}:manager`)
  })

  it('a demoted manager’s open invites stay open (O20 covers removal and leave only)', async () => {
    const before = inviteStates()
    await setRole(OWEN, MAX, 'member')
    expect(inviteStates()).toEqual(before)
    const res = await run(INVITES, {}, OWEN)
    expect(res.data?.householdInvites).toEqual(
      expect.arrayContaining([{ id: 'inv_max' }, { id: 'inv_newt' }]),
    )
  })

  it('the same role again changes no member row and publishes nothing', async () => {
    // `world.client`: the update runs through `tx`.
    const update = vi.spyOn(world.client.householdMember, 'update')
    const res = await setRole(OWEN, MIA, 'manager')
    expect(res.errors).toBeUndefined()
    expect(res.data?.setHouseholdRole).toMatchObject({ userId: MIA, role: 'manager' })
    expect(update).not.toHaveBeenCalled()
    expect(seen).toEqual([])
  })
})

// ─── removeMember ────────────────────────────────────────────────────────────

describe('removeMember', () => {
  it('household owner can remove a manager', async () => {
    const res = await remove(OWEN, MAX)
    expect(res.errors).toBeUndefined()
    expect(res.data?.removeMember).toBe(true)
    expect(members().filter((m) => m.includes(MAX))).toEqual([])
    expect(locationRolesOf(MAX)).toEqual([])
  })

  it('household manager can remove a member', async () => {
    const res = await remove(MIA, BOB)
    expect(res.data?.removeMember).toBe(true)
    expect(members().filter((m) => m.includes(BOB))).toEqual([])
    expect(locationRolesOf(BOB)).toEqual([])
  })

  it('household manager cannot remove another manager', async () => {
    const before = snapshot()
    const res = await remove(MIA, MAX)
    expect(code(res)).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
  })

  it('household manager cannot remove the owner', async () => {
    const before = snapshot()
    const res = await remove(MIA, OWEN)
    expect(code(res)).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
  })

  it('household owner cannot remove themself', async () => {
    const before = snapshot()
    const res = await remove(OWEN, OWEN)
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(snapshot()).toEqual(before)
  })

  it('household manager cannot remove themself; they leave instead', async () => {
    const before = snapshot()
    const res = await remove(MIA, MIA)
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(snapshot()).toEqual(before)
  })

  it('a person in no household gets NO_HOUSEHOLD', async () => {
    const before = snapshot()
    const res = await remove(PIA, BOB)
    expect(code(res)).toBe('NO_HOUSEHOLD')
    expect(snapshot()).toEqual(before)
  })

  it('household member cannot remove anyone', async () => {
    const before = snapshot()
    const res = await remove(BEA, BOB)
    expect(code(res)).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
  })

  it('a person outside the household is FORBIDDEN, and stays in their own', async () => {
    const before = snapshot()
    const res = await remove(OWEN, YUKI)
    expect(code(res)).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
  })

  it('removing deletes the person’s location roles in that household only (T11)', async () => {
    // Given BEA: participant of K, viewer of G (hh_h), organizer of LOC_B
    // in her own household hh_b
    await remove(OWEN, BEA)

    // Then her hh_h roles are gone, and her hh_b role and membership stay
    expect(locationRolesOf(BEA)).toEqual([`${LOC_B}:organizer`])
    expect(members().filter((m) => m.includes(BEA))).toEqual([`hh_b:${BEA}:owner`])
  })

  it('a removed member’s next request uses their other household', async () => {
    await remove(OWEN, BEA)
    const res = await run(HOUSEHOLD, {}, BEA)
    expect(res.data?.household).toEqual({ id: 'hh_b' })
  })

  it('a removed member with no other household gets NO_HOUSEHOLD, and no new household is made', async () => {
    // Given NEWT, never set up, whose FIRST request is a join
    const joined = await run(JOIN, { token: NEWT_LINK }, NEWT)
    expect(joined.errors).toBeUndefined()
    // When the owner removes them
    await remove(OWEN, NEWT)
    const before = householdIds()

    // Then their next request finds no household, and none is made
    const res = await run(HOUSEHOLD, {}, NEWT)
    expect(code(res)).toBe('NO_HOUSEHOLD')
    expect(householdIds()).toEqual(before)
  })

  it('removal does not write the removed person’s User row (T16)', async () => {
    const named = spyOnUserWrites()
    const res = await remove(OWEN, BEA)
    expect(res.errors).toBeUndefined()
    expect(named).toEqual([])
    // So her active household still names hh_h, on purpose. ensureHousehold
    // ignores it, because she is no longer a member there.
    expect(userRow(BEA).activeHouseholdId).toBe('hh_h')
  })

  it('removing a manager revokes their open invites of that household only (O20)', async () => {
    // Given MIA, a manager of hh_h AND hh_x, with invites of every kind
    // When the owner removes her from hh_h
    const res = await remove(OWEN, MIA)
    expect(res.errors).toBeUndefined()

    // Then her unused, unrevoked hh_h invites are revoked now (the expired
    // one too). Her used invite, her invite revoked earlier (its date is
    // kept), her hh_x invite and the invites of OWEN and MAX are untouched.
    expect(inviteStates()).toEqual(miaRevokedInHh())
    // And the owner's list no longer shows hers
    const list = await run(INVITES, {}, OWEN)
    expect(list.data?.householdInvites).toEqual(
      expect.arrayContaining([{ id: 'inv_max' }, { id: 'inv_newt' }]),
    )
    expect(list.data?.householdInvites).toHaveLength(2)
  })

  it('a removed manager cannot rejoin through their own invite (O20)', async () => {
    // Given MAX made an open member invite, and is then removed
    await remove(OWEN, MAX)

    // When MAX opens it
    const res = await run(JOIN, { token: tok('tok_max') }, MAX)

    // Then it is refused and MAX is still out of hh_h
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(reason(res)).toBe('INVITE_INVALID')
    expect(members().filter((m) => m.includes(MAX))).toEqual([])
  })

  it('a removal that fails revokes nothing (one transaction)', async () => {
    // Given the member row delete fails, AFTER the revoke has run
    vi.spyOn(world.client.householdMember, 'delete').mockRejectedValue(new Error('boom'))
    const before = snapshot()

    const res = await remove(OWEN, MIA)

    // Then nothing is written, the invites included
    expect(res.errors).toBeDefined()
    expect(snapshot()).toEqual(before)
    expect(seen).toEqual([])
  })
})

// ─── leaveHousehold ──────────────────────────────────────────────────────────

describe('leaveHousehold', () => {
  it('household member can leave the household they act in, and keeps their other one', async () => {
    // Given BEA acts in hh_h; her oldest membership is hh_b
    const res = await leave(BEA)

    expect(res.errors).toBeUndefined()
    expect(res.data?.leaveHousehold).toBe(true)
    expect(members().filter((m) => m.includes(BEA))).toEqual([`hh_b:${BEA}:owner`])
    // T11: only her hh_h location roles are gone
    expect(locationRolesOf(BEA)).toEqual([`${LOC_B}:organizer`])
    // And her next request acts in hh_b
    const next = await run(HOUSEHOLD, {}, BEA)
    expect(next.data?.household).toEqual({ id: 'hh_b' })
  })

  it('household manager can leave', async () => {
    // MIA acts in hh_h and is also a manager of hh_x
    const res = await leave(MIA)
    expect(res.data?.leaveHousehold).toBe(true)
    expect(members().filter((m) => m.includes(MIA))).toEqual([`hh_x:${MIA}:manager`])
    expect(locationRolesOf(MIA)).toEqual([`${LOC_Z}:viewer`])
  })

  it('household owner cannot leave', async () => {
    const before = snapshot()
    const res = await leave(OWEN)
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(snapshot()).toEqual(before)
  })

  it('leaving revokes the leaver’s open invites of that household only (O20)', async () => {
    // Given MIA, a manager of hh_h AND hh_x, with invites of every kind
    const res = await leave(MIA)
    expect(res.errors).toBeUndefined()
    expect(inviteStates()).toEqual(miaRevokedInHh())
    // And one LOCATION event for hh_h, which makes open Members pages read
    // the invite list again
    expect(seen).toEqual([locationEvent('hh_h')])
  })

  it('a leave that fails revokes nothing (one transaction)', async () => {
    vi.spyOn(world.client.householdMember, 'delete').mockRejectedValue(new Error('boom'))
    const before = snapshot()
    const res = await leave(MIA)
    expect(res.errors).toBeDefined()
    expect(snapshot()).toEqual(before)
  })

  it('leaving does not write the leaver’s User row (T16)', async () => {
    const named = spyOnUserWrites()
    await leave(BEA)
    expect(named).toEqual([])
    expect(userRow(BEA).activeHouseholdId).toBe('hh_h')
  })

  it('a person in no household gets NO_HOUSEHOLD', async () => {
    const res = await leave(PIA)
    expect(code(res)).toBe('NO_HOUSEHOLD')
  })
})

// ─── createHousehold ─────────────────────────────────────────────────────────

describe('createHousehold', () => {
  function newHouseholdOf(userId: string) {
    const m = world.households.state.householdMembers.find((r) => r.userId === userId)
    if (!m) throw new Error(`${userId} is in no household`)
    return m.householdId
  }

  it('runs in a transaction with a longer timeout than the 5 s default', async () => {
    // Given a spy on the transaction, so the options it gets can be read.
    // The fake ignores them; only real Postgres times out.
    const spy = vi.spyOn(prisma, '$transaction')
    try {
      // When PIA creates a household
      await create(PIA, 'the Lin home')

      // Then the transaction asked for HOUSEHOLD_MOVE_TIMEOUT_MS
      // (an E2E join once took 5064 ms against the 5 s default)
      const withTimeout = spy.mock.calls.filter((call) => {
        const options = call[1] as { timeout?: number } | undefined
        return options?.timeout === 15_000
      })
      expect(withTimeout).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('user with no household can create one', async () => {
    // Given PIA, set up once and in no household now
    const res = await create(PIA, '  the Lin home  ')

    // Then she owns a new household with the trimmed name, a "Home"
    // location and her organizer row there, and acts in it
    expect(res.errors).toBeUndefined()
    const id = newHouseholdOf(PIA)
    expect(res.data?.createHousehold).toEqual({ id, name: 'the Lin home', role: 'owner' })
    expect(members()).toContain(`${id}:${PIA}:owner`)
    expect(world.households.state.households.find((h) => h.id === id)?.ownerId).toBe(PIA)
    const homes = world.stock.state.locations.filter((l) => l.householdId === id)
    expect(homes.map((l) => l.name)).toEqual(['Home'])
    expect(locationRolesOf(PIA)).toEqual([`${homes[0]?.id}:organizer`])
    expect(userRow(PIA).activeHouseholdId).toBe(id)
    // And her next request acts in it
    const next = await run(HOUSEHOLD, {}, PIA)
    expect(next.data?.household).toEqual({ id })
  })

  it('with no name it gets the first sign-in names, in the app language', async () => {
    const res = await create(PIA, null, 'tw')
    expect(res.data?.createHousehold).toMatchObject({ name: 'Pia的家', role: 'owner' })
    const id = newHouseholdOf(PIA)
    expect(world.stock.state.locations.filter((l) => l.householdId === id).map((l) => l.name)).toEqual([
      '住家',
    ])
  })

  it('a person never set up can create one, and the first sign-in claim is set', async () => {
    const res = await create(NEWT, 'Newt home')
    expect(res.errors).toBeUndefined()
    expect(userRow(NEWT).householdSetupAt).toEqual(NOW)
  })

  it('user in a household cannot create another (O16-A)', async () => {
    // BOB is in hh_h only; BEA is in two
    for (const person of [BOB, BEA]) {
      const before = snapshot()
      const res = await create(person, 'Second home')
      expect(code(res)).toBe('BAD_USER_INPUT')
      expect(reason(res)).toBe('ALREADY_IN_HOUSEHOLD')
      expect(snapshot()).toEqual(before)
    }
  })

  it('a blank name is refused and nothing is written', async () => {
    const before = snapshot()
    const res = await create(PIA, '   ')
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(snapshot()).toEqual(before)
  })

  it('a name over the limit is refused and nothing is written', async () => {
    const before = snapshot()
    const res = await create(PIA, 'x'.repeat(101))
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(snapshot()).toEqual(before)
    // 100 is still allowed
    const ok = await create(PIA, 'y'.repeat(100))
    expect(ok.errors).toBeUndefined()
  })

  it('two creates at once make one household', async () => {
    // The User row lock runs them one after the other on Postgres; the
    // queue does that here. The second must see the first one's membership.
    world.serialTransactions(true)
    const before = householdIds().length
    const [a, b] = await Promise.all([create(PIA, 'One'), create(PIA, 'Two')])
    const reasons = [a, b].map(reason).sort()
    expect(reasons).toEqual(['ALREADY_IN_HOUSEHOLD', undefined])
    expect(householdIds().length).toBe(before + 1)
  })

  it('the user lock is taken before the membership is read (T16)', async () => {
    const order: string[] = []
    const lock = world.client.user.update
    vi.spyOn(world.client.user, 'update').mockImplementation(async (args) => {
      if ((args.data as { updatedAt?: unknown }).updatedAt !== undefined) order.push('lockUser')
      return lock(args)
    })
    const count = world.client.householdMember.count
    vi.spyOn(world.client.householdMember, 'count').mockImplementation(async (args) => {
      order.push('count')
      return count(args)
    })
    const createHh = world.client.household.create
    vi.spyOn(world.client.household, 'create').mockImplementation(async (args) => {
      order.push('create')
      return createHh(args)
    })

    await create(PIA, 'Mine')

    expect(order).toEqual(['lockUser', 'count', 'create'])
  })

  it('never asks for the caller’s household (T22)', async () => {
    await create(PIA, 'Mine')
    await create(BOB, 'Mine')
    expect(ensureHousehold).not.toHaveBeenCalled()
  })
})

// ─── the household lock ──────────────────────────────────────────────────────

describe('setHouseholdRole, removeMember and leaveHousehold lock the household first', () => {
  /** Record the lock of hh_h and every member row read, in call order. */
  function recordOrder() {
    const order: string[] = []
    const updateMany = world.client.household.updateMany
    vi.spyOn(world.client.household, 'updateMany').mockImplementation(async (args) => {
      order.push(`lock:${String((args.where as { id?: unknown } | undefined)?.id)}`)
      return updateMany(args)
    })
    const findUnique = world.client.householdMember.findUnique
    vi.spyOn(world.client.householdMember, 'findUnique').mockImplementation(async (args) => {
      order.push('read')
      return findUnique(args)
    })
    return order
  }

  it.each([
    ['setHouseholdRole', () => setRole(OWEN, BOB, 'manager')],
    ['removeMember', () => remove(OWEN, BOB)],
    ['leaveHousehold', () => leave(BEA)],
  ])('%s: the lock comes before every role read', async (_name, act) => {
    const order = recordOrder()
    const res = await act()
    expect(res.errors).toBeUndefined()
    // The lock of the household the caller acts in, then the reads.
    expect(order[0]).toBe('lock:hh_h')
    expect(order.filter((x) => x.startsWith('lock:'))).toEqual(['lock:hh_h'])
    expect(order.length).toBeGreaterThan(1)
  })

  it.each([
    ['setHouseholdRole', () => setRole(OWEN, BOB, 'manager')],
    ['removeMember', () => remove(OWEN, BOB)],
    ['leaveHousehold', () => leave(BEA)],
  ])('%s: every member row is read through tx, never through the global client', async (_name, act) => {
    // The global client is a second pool connection on Postgres. Inside the
    // transaction every read must use `tx` (see `requireHouseholdRole`).
    const outside = vi.spyOn(prisma.householdMember, 'findUnique')
    const inside = vi.spyOn(world.client.householdMember, 'findUnique')
    const res = await act()
    expect(res.errors).toBeUndefined()
    expect(inside).toHaveBeenCalled()
    expect(outside).not.toHaveBeenCalled()
  })

  it.each([
    ['setHouseholdRole', () => setRole(OWEN, BOB, 'manager')],
    ['removeMember', () => remove(OWEN, BOB)],
    ['leaveHousehold', () => leave(BEA)],
  ])('%s: a household deleted after it was looked up gives FORBIDDEN, not an internal error', async (_name, act) => {
    // Given hh_h is deleted (for example by the owner's join in another tab)
    // between `requireHousehold` and the lock: the lock finds no row
    const updateMany = world.client.household.updateMany
    vi.spyOn(world.client.household, 'updateMany').mockImplementation(async (args) => {
      if ((args.where as { id?: unknown } | undefined)?.id === 'hh_h') return { count: 0 }
      return updateMany(args)
    })
    vi.spyOn(world.client.household, 'update').mockRejectedValue(
      Object.assign(new Error('Record to update not found.'), { code: 'P2025' }),
    )
    const before = snapshot()

    const res = await act()

    expect(code(res)).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
    expect(seen).toEqual([])
  })
})

// ─── live events ─────────────────────────────────────────────────────────────

describe('the four mutations publish household-level LOCATION', () => {
  it('setHouseholdRole: once, for the household', async () => {
    await setRole(OWEN, BOB, 'manager')
    expect(seen).toEqual([locationEvent('hh_h')])
  })

  it('removeMember: once, for the household the person was removed from', async () => {
    await remove(OWEN, BEA)
    expect(seen).toEqual([locationEvent('hh_h')])
  })

  it('leaveHousehold: once, for the household LEFT, not the one the leaver acts in next', async () => {
    await leave(BEA)
    expect(seen).toEqual([locationEvent('hh_h')])
  })

  it('createHousehold: once, for the new household', async () => {
    const res = await create(PIA, 'Mine')
    const id = (res.data?.createHousehold as { id: string }).id
    expect(seen).toEqual([locationEvent(id)])
  })

  it('a refusal publishes nothing', async () => {
    await setRole(MIA, BOB, 'manager')
    await setRole(OWEN, OWEN, 'manager')
    await remove(MIA, MAX)
    await remove(OWEN, OWEN)
    await leave(OWEN)
    await create(BOB, 'Second')
    await create(PIA, '  ')
    expect(seen).toEqual([])
  })
})

describe('who hears the event (shouldDeliver)', () => {
  it('a remaining member’s tab hears a removal; the removed person’s open tab does NOT', async () => {
    await remove(OWEN, BEA)
    const [event] = seen
    if (!event) throw new Error('no event')

    expect(await shouldDeliver({ userId: BOB, clientId: OTHER_TAB }, event)).toBe(true)
    // The known gap of H5a, still open: the removed person is no longer a
    // member, so the membership check refuses the event for them.
    expect(await shouldDeliver({ userId: BEA, clientId: OTHER_TAB }, event)).toBe(false)
  })

  it('the leaver’s other tab does not hear their own leave either', async () => {
    await leave(BEA)
    const [event] = seen
    if (!event) throw new Error('no event')
    expect(await shouldDeliver({ userId: BEA, clientId: OTHER_TAB }, event)).toBe(false)
  })

  it('the creator’s other tab hears createHousehold', async () => {
    await create(PIA, 'Mine')
    const [event] = seen
    if (!event) throw new Error('no event')
    expect(await shouldDeliver({ userId: PIA, clientId: OTHER_TAB }, event)).toBe(true)
  })
})
