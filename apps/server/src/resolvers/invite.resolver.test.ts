import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import type { HouseholdRole, LocationRole } from '@prisma/client'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { HouseholdInviteRow } from '../test/householdFake.js'
import type { FakeLocation } from '../test/stockFake.js'
import type { UserRow } from '../test/userFake.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'
import { INVITE_TOKEN_LENGTH } from '../lib/invite.js'

// Create, list, preview and revoke household invites (households H5b, task
// G.3; plan docs/global/permissions/2026-11-18-households-plan-h5b.md).
//
// ── THE FIXTURE ──
//
// | Person | Households (joinedAt order)               | Location roles        |
// |--------|-------------------------------------------|-----------------------|
// | OWEN   | hh_x member (first), hh_h owner (active)  | LOC_K, LOC_G organizer|
// | MIA    | hh_x member (first), hh_h manager (active)| LOC_K organizer       |
// | BAO    | hh_h member                               | LOC_K viewer          |
// | YUKI   | hh_x owner                                | LOC_Z organizer       |
// | PIA    | none (set up once, then left)             | none                  |
//
// OWEN and MIA act in hh_h only because it is their ACTIVE household
// (decision T14). Their OLDEST membership is hh_x, where they are only
// `member`. So a test where they act in hh_h goes red if the active
// household is ignored. MIA has no role on LOC_G, a location of her own
// household (the "second person, location with no role" rule).

// `ensureHousehold` is wrapped in a spy, so the T22 test can see that
// `invitePreview` never asks for the caller's household.
vi.mock('../lib/household.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/household.js')>()
  return { ...real, ensureHousehold: vi.fn(real.ensureHousehold) }
})

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  return { prisma: { ...world.client, $world: world } }
})

import { prisma } from '../lib/prisma.js'
import { ensureHousehold } from '../lib/household.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const OWEN = 'user_owen'
const MIA = 'user_mia'
const BAO = 'user_bao'
const YUKI = 'user_yuki'
const PIA = 'user_pia'

const LOC_K = 'loc_kitchen'
const LOC_G = 'loc_garage'
const LOC_Z = 'loc_z'

const TAB = 'tab-1'
const T0 = new Date('2026-01-01T00:00:00.000Z')
const NOW = new Date('2026-11-18T12:00:00.000Z')
const EARLY = new Date('2026-10-01T00:00:00.000Z')
const LATE = new Date('2026-11-02T00:00:00.000Z')

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
    locationSort: null,
    createdAt: T0,
    updatedAt: T0,
  }
}

/**
 * A test token of the length every real token has. `invitePreview` answers
 * INVALID, with no read, for a token of any other length.
 */
function tok(name: string): string {
  return name.padEnd(INVITE_TOKEN_LENGTH, '0')
}

let inviteSeq = 0
/** An open invite of `householdId`, made by `createdById`, unless `extra` says otherwise. */
function invite(
  householdId: string,
  createdById: string,
  householdRole: HouseholdRole,
  extra: Partial<HouseholdInviteRow> = {},
): HouseholdInviteRow {
  inviteSeq += 1
  return {
    id: `inv_${inviteSeq}`,
    householdId,
    token: tok(`token_${inviteSeq}`),
    householdRole,
    locationRoles: [],
    createdById,
    createdAt: new Date(T0.getTime() + inviteSeq * 1000),
    expiresAt: new Date('2026-11-20T00:00:00.000Z'),
    usedAt: null,
    usedById: null,
    revokedAt: null,
    ...extra,
  }
}

function seed(invites: HouseholdInviteRow[] = []) {
  world.reset()
  world.stock.reset([loc(LOC_K, 'hh_h', 0), loc(LOC_G, 'hh_h', 1), loc(LOC_Z, 'hh_x', 0)], [])
  world.seedHouseholds({
    households: [householdRow('hh_h', OWEN), householdRow('hh_x', YUKI)],
    householdMembers: [
      { ...householdMemberRow('hh_x', OWEN, 'member'), joinedAt: EARLY },
      { ...householdMemberRow('hh_x', MIA, 'member'), joinedAt: EARLY },
      { ...householdMemberRow('hh_x', YUKI, 'owner'), joinedAt: EARLY },
      { ...householdMemberRow('hh_h', OWEN, 'owner'), joinedAt: LATE },
      { ...householdMemberRow('hh_h', MIA, 'manager'), joinedAt: LATE },
      { ...householdMemberRow('hh_h', BAO, 'member'), joinedAt: LATE },
    ],
    locationMembers: [
      locationMemberRow(LOC_K, OWEN, 'organizer'),
      locationMemberRow(LOC_G, OWEN, 'organizer'),
      locationMemberRow(LOC_K, MIA, 'organizer'),
      locationMemberRow(LOC_K, BAO, 'viewer'),
      locationMemberRow(LOC_Z, YUKI, 'organizer'),
    ],
    householdInvites: invites,
  })
  world.users.reset([
    user(OWEN, 'Owen', 'hh_h'),
    user(MIA, 'Mia', 'hh_h'),
    user(BAO, 'Bao', null),
    user(YUKI, 'Yuki', null),
    user(PIA, 'Pia', null),
  ])
}

// ─── live events ─────────────────────────────────────────────────────────────

let seen: ChangeEvent[] = []
let unsubscribe: () => void = () => undefined

beforeEach(() => {
  inviteSeq = 0
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
  vi.useRealTimers()
})

function locationEvent(householdId: string): ChangeEvent {
  return { kind: 'LOCATION', householdId, locationId: null, sourceClientId: TAB }
}

// ─── running an operation ────────────────────────────────────────────────────

const server = new ApolloServer<Context>({ typeDefs, resolvers })

type Result = {
  data?: Record<string, unknown> | null
  errors?: ReadonlyArray<{ message: string; extensions?: Record<string, unknown> }>
}

async function run(query: string, variables: Record<string, unknown>, userId: string): Promise<Result> {
  const contextValue: Context = { userId, clientId: TAB }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult as Result
}

function code(res: Result) {
  return res.errors?.[0]?.extensions?.code
}

const INVITE_FIELDS = `id token householdRole createdByName expiresAt
  locationRoles { locationId locationName role }`

const CREATE = `mutation M($role: HouseholdRole!, $roles: [InviteLocationRoleInput!]!) {
  createInvite(householdRole: $role, locationRoles: $roles) { ${INVITE_FIELDS} }
}`
const LIST = `query { householdInvites { ${INVITE_FIELDS} } }`
const PREVIEW = `query Q($token: String!) {
  invitePreview(token: $token) {
    status householdName invitedByName householdRole
    locationRoles { locationId locationName role }
  }
}`
const REVOKE = `mutation M($id: ID!) { revokeInvite(id: $id) }`

function roles(...pairs: [string, LocationRole][]) {
  return pairs.map(([locationId, role]) => ({ locationId, role }))
}

// ─── createInvite ────────────────────────────────────────────────────────────

describe('createInvite', () => {
  it('household owner can create a manager invite with location roles', async () => {
    // Given OWEN, owner of hh_h (his active household, not his oldest)
    // When he invites a manager who will organize the kitchen
    const res = await run(CREATE, { role: 'manager', roles: roles([LOC_K, 'organizer']) }, OWEN)

    // Then the invite is answered and stored for hh_h
    expect(res.errors).toBeUndefined()
    const created = (res.data as { createInvite: Record<string, unknown> }).createInvite
    expect(created).toMatchObject({
      householdRole: 'manager',
      createdByName: 'Owen',
      expiresAt: '2026-11-25T12:00:00.000Z',
      locationRoles: [{ locationId: LOC_K, locationName: `${LOC_K} name`, role: 'organizer' }],
    })
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const stored = world.households.state.householdInvites
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      id: created.id,
      householdId: 'hh_h',
      token: created.token,
      householdRole: 'manager',
      createdById: OWEN,
      locationRoles: [{ locationId: LOC_K, role: 'organizer' }],
      usedAt: null,
      revokedAt: null,
    })
    expect(stored[0]?.expiresAt.toISOString()).toBe('2026-11-25T12:00:00.000Z')
  })

  it('household manager can create a member invite, also for a location they have no role on', async () => {
    // Given MIA, manager of hh_h, with no role on LOC_G
    const res = await run(CREATE, { role: 'member', roles: roles([LOC_G, 'viewer']) }, MIA)

    // Then it is written for hh_h (owner and manager give any location role)
    expect(res.errors).toBeUndefined()
    expect(world.households.state.householdInvites).toMatchObject([
      { householdId: 'hh_h', householdRole: 'member', createdById: MIA },
    ])
  })

  it('household manager cannot create a manager invite (O3-A)', async () => {
    const res = await run(CREATE, { role: 'manager', roles: [] }, MIA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(world.households.state.householdInvites).toEqual([])
  })

  it('household member cannot create an invite', async () => {
    const res = await run(CREATE, { role: 'member', roles: [] }, BAO)
    expect(code(res)).toBe('FORBIDDEN')
    expect(world.households.state.householdInvites).toEqual([])
  })

  it('an invite for owner is refused', async () => {
    const res = await run(CREATE, { role: 'owner', roles: [] }, OWEN)
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(world.households.state.householdInvites).toEqual([])
  })

  it("an invite naming another household's location is refused", async () => {
    // LOC_Z is in hh_x, where OWEN is a member with no role
    const res = await run(
      CREATE,
      { role: 'member', roles: roles([LOC_K, 'viewer'], [LOC_Z, 'viewer']) },
      OWEN,
    )
    expect(code(res)).toBe('FORBIDDEN')
    expect(world.households.state.householdInvites).toEqual([])
  })

  it('an invite naming a location that does not exist is refused', async () => {
    const res = await run(CREATE, { role: 'member', roles: roles(['loc_none', 'viewer']) }, OWEN)
    expect(code(res)).toBe('FORBIDDEN')
    expect(world.households.state.householdInvites).toEqual([])
  })

  it('an invite naming a location twice is refused', async () => {
    const res = await run(
      CREATE,
      { role: 'member', roles: roles([LOC_K, 'viewer'], [LOC_K, 'organizer']) },
      OWEN,
    )
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(world.households.state.householdInvites).toEqual([])
  })

  it('an invite with no location roles is accepted (O14-A)', async () => {
    const res = await run(CREATE, { role: 'member', roles: [] }, OWEN)
    expect(res.errors).toBeUndefined()
    expect(world.households.state.householdInvites).toMatchObject([
      { householdId: 'hh_h', locationRoles: [] },
    ])
  })

  it('two invites get two different tokens', async () => {
    await run(CREATE, { role: 'member', roles: [] }, OWEN)
    await run(CREATE, { role: 'member', roles: [] }, OWEN)
    const [a, b] = world.households.state.householdInvites
    expect(a?.token).not.toBe(b?.token)
  })
})

// ─── householdInvites ────────────────────────────────────────────────────────

function listed(res: Result) {
  return (res.data as { householdInvites: Array<Record<string, unknown>> }).householdInvites
}

describe('householdInvites', () => {
  it('lists only open invites of the household, oldest first', async () => {
    // Given hh_h has two open invites, and one used, one revoked and one
    // expired; and hh_x has an open invite of its own. The OLDER open invite
    // has the id that sorts LATER (inv_open_b), so "oldest first" and "by id"
    // give different orders.
    seed([
      invite('hh_h', OWEN, 'member', { id: 'inv_open_a', createdAt: new Date('2026-11-10T00:00:00.000Z') }),
      invite('hh_h', OWEN, 'member', { id: 'inv_used', usedAt: T0, usedById: BAO }),
      invite('hh_h', OWEN, 'member', { id: 'inv_revoked', revokedAt: T0 }),
      // Expires exactly now: no longer open (`expiresAt > now` is strict).
      invite('hh_h', OWEN, 'member', { id: 'inv_expired', expiresAt: NOW }),
      invite('hh_x', YUKI, 'member', { id: 'inv_other' }),
      invite('hh_h', MIA, 'manager', {
        id: 'inv_open_b',
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        locationRoles: [{ locationId: LOC_G, role: 'participant' }],
      }),
    ])

    // When OWEN lists them
    const res = await run(LIST, {}, OWEN)

    // Then only the two open ones of hh_h come back, oldest first (not by id)
    expect(res.errors).toBeUndefined()
    expect(listed(res)).toEqual([
      {
        id: 'inv_open_b',
        token: tok('token_6'),
        householdRole: 'manager',
        createdByName: 'Mia',
        expiresAt: '2026-11-20T00:00:00.000Z',
        locationRoles: [{ locationId: LOC_G, locationName: `${LOC_G} name`, role: 'participant' }],
      },
      {
        id: 'inv_open_a',
        token: tok('token_1'),
        householdRole: 'member',
        createdByName: 'Owen',
        expiresAt: '2026-11-20T00:00:00.000Z',
        locationRoles: [],
      },
    ])
  })

  it('two invites made at the same time are listed by id', async () => {
    // Given two open invites with the same createdAt, stored in the order
    // that is NOT the id order
    const same = new Date('2026-11-05T00:00:00.000Z')
    seed([
      invite('hh_h', OWEN, 'member', { id: 'inv_2', createdAt: same }),
      invite('hh_h', OWEN, 'member', { id: 'inv_1', createdAt: same }),
    ])

    // Then the id breaks the tie
    const res = await run(LIST, {}, OWEN)
    expect(listed(res).map((i) => i.id)).toEqual(['inv_1', 'inv_2'])
  })

  it('household manager sees only member invites (O15-A, T27)', async () => {
    seed([
      invite('hh_h', OWEN, 'manager', { id: 'inv_manager' }),
      invite('hh_h', OWEN, 'member', { id: 'inv_member' }),
    ])
    const res = await run(LIST, {}, MIA)
    expect(res.errors).toBeUndefined()
    expect(listed(res).map((i) => i.id)).toEqual(['inv_member'])

    // And the owner sees both
    const owner = await run(LIST, {}, OWEN)
    expect(listed(owner).map((i) => i.id)).toEqual(['inv_manager', 'inv_member'])
  })

  it('household member cannot list invites (O13-A)', async () => {
    seed([invite('hh_h', OWEN, 'member')])
    const res = await run(LIST, {}, BAO)
    expect(code(res)).toBe('FORBIDDEN')
    expect(res.data).toBeNull()
  })

  it('leaves out a location deleted since, and keeps the invite', async () => {
    // Given an invite that names LOC_K and LOC_G
    seed([
      invite('hh_h', OWEN, 'member', {
        id: 'inv_1',
        locationRoles: [
          { locationId: LOC_K, role: 'viewer' },
          { locationId: LOC_G, role: 'organizer' },
        ],
      }),
    ])
    // When LOC_K is deleted
    await world.client.location.delete({ where: { id: LOC_K } })

    // Then the invite is still listed, with LOC_G only
    const res = await run(LIST, {}, OWEN)
    expect(listed(res)).toMatchObject([
      { id: 'inv_1', locationRoles: [{ locationId: LOC_G, role: 'organizer' }] },
    ])
  })

  it('an invite whose every location was deleted is listed with an empty role list', async () => {
    // This is what `clearAllData` leaves: open invites, and only new locations.
    seed([
      invite('hh_h', OWEN, 'member', {
        id: 'inv_1',
        locationRoles: [{ locationId: LOC_K, role: 'viewer' }],
      }),
    ])
    await world.client.location.delete({ where: { id: LOC_K } })
    const res = await run(LIST, {}, OWEN)
    expect(listed(res)).toMatchObject([{ id: 'inv_1', locationRoles: [] }])
  })
})

// ─── invitePreview ───────────────────────────────────────────────────────────

function preview(res: Result) {
  return (res.data as { invitePreview: Record<string, unknown> }).invitePreview
}

const INVALID = {
  status: 'INVALID',
  householdName: null,
  invitedByName: null,
  householdRole: null,
  locationRoles: null,
}

describe('invitePreview', () => {
  beforeEach(() => {
    seed([
      invite('hh_h', OWEN, 'manager', {
        token: tok('tok_open'),
        locationRoles: [{ locationId: LOC_K, role: 'organizer' }],
      }),
      invite('hh_h', OWEN, 'member', { token: tok('tok_used'), usedAt: T0, usedById: BAO }),
      invite('hh_h', OWEN, 'member', { token: tok('tok_revoked'), revokedAt: T0 }),
      invite('hh_h', OWEN, 'member', { token: tok('tok_expired'), expiresAt: NOW }),
    ])
  })

  it('VALID for a person in another household: names and roles', async () => {
    // YUKI is in hh_x only
    const res = await run(PREVIEW, { token: tok('tok_open') }, YUKI)
    expect(res.errors).toBeUndefined()
    expect(preview(res)).toEqual({
      status: 'VALID',
      householdName: 'hh_h name',
      invitedByName: 'Owen',
      householdRole: 'manager',
      locationRoles: [{ locationId: LOC_K, locationName: `${LOC_K} name`, role: 'organizer' }],
    })
  })

  it('ALREADY_MEMBER for a member of the household', async () => {
    const res = await run(PREVIEW, { token: tok('tok_open') }, BAO)
    expect(preview(res)).toMatchObject({ status: 'ALREADY_MEMBER', householdName: 'hh_h name' })
    // And the link is not used up
    expect(world.households.state.householdInvites[0]?.usedAt).toBeNull()
  })

  it.each([
    ['an unknown token', tok('tok_none')],
    ['a used invite', tok('tok_used')],
    ['a revoked invite', tok('tok_revoked')],
    ['an expired invite', tok('tok_expired')],
  ])('INVALID, with no household name, for %s', async (_, token) => {
    const res = await run(PREVIEW, { token }, YUKI)
    expect(res.errors).toBeUndefined()
    expect(preview(res)).toEqual(INVALID)
  })

  it('INVALID for a used invite even for a member of its household', async () => {
    const res = await run(PREVIEW, { token: tok('tok_used') }, BAO)
    expect(preview(res)).toEqual(INVALID)
  })

  it.each([
    ['one character short', -1],
    ['one character long', 1],
  ])('INVALID with no read for a token %s', async (_, extra) => {
    // Given an OPEN invite whose stored token has the wrong length. No real
    // token looks like this, so without the length check it would be VALID.
    const odd =
      extra < 0 ? tok('tok_odd').slice(0, INVITE_TOKEN_LENGTH - 1) : `${tok('tok_odd')}0`
    seed([invite('hh_h', OWEN, 'member', { token: odd })])
    const read = vi.spyOn(prisma.householdInvite, 'findUnique')
    try {
      // When YUKI previews it
      const res = await run(PREVIEW, { token: odd }, YUKI)

      // Then it is INVALID, and the invite table was not read
      expect(preview(res)).toEqual(INVALID)
      expect(read).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
  })

  it('a token of the right length is read', async () => {
    // A control for the test above: the spy does see a read.
    const read = vi.spyOn(prisma.householdInvite, 'findUnique')
    try {
      await run(PREVIEW, { token: tok('tok_open') }, YUKI)
      expect(read).toHaveBeenCalledTimes(1)
    } finally {
      read.mockRestore()
    }
  })

  it('invitePreview works for a person with no household (T22)', async () => {
    // Given PIA: set up once (the claim is set), and in no household now
    const res = await run(PREVIEW, { token: tok('tok_open') }, PIA)

    // Then she sees the invite, and her household was never asked for
    expect(res.errors).toBeUndefined()
    expect(preview(res)).toMatchObject({ status: 'VALID', householdName: 'hh_h name' })
    expect(ensureHousehold).not.toHaveBeenCalled()
  })

  it('needs a signed-in caller', async () => {
    const res = await server.executeOperation(
      { query: PREVIEW, variables: { token: tok('tok_open') } },
      { contextValue: { userId: null } as unknown as Context },
    )
    if (res.body.kind !== 'single') throw new Error('expected a single result')
    expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED')
  })
})

// ─── revokeInvite ────────────────────────────────────────────────────────────

function revokedIds() {
  return world.households.state.householdInvites.filter((i) => i.revokedAt !== null).map((i) => i.id)
}

describe('revokeInvite', () => {
  beforeEach(() => {
    seed([
      invite('hh_h', OWEN, 'manager', { id: 'inv_manager' }),
      invite('hh_h', MIA, 'member', { id: 'inv_member' }),
      invite('hh_x', YUKI, 'member', { id: 'inv_other' }),
      invite('hh_h', OWEN, 'member', { id: 'inv_used', usedAt: T0, usedById: BAO }),
    ])
  })

  it('owner can revoke any invite', async () => {
    const a = await run(REVOKE, { id: 'inv_manager' }, OWEN)
    const b = await run(REVOKE, { id: 'inv_member' }, OWEN)
    expect(a.data).toEqual({ revokeInvite: true })
    expect(b.data).toEqual({ revokeInvite: true })
    expect(revokedIds()).toEqual(['inv_manager', 'inv_member'])
    expect(world.households.state.householdInvites[0]?.revokedAt?.toISOString()).toBe(
      NOW.toISOString(),
    )
  })

  it('manager can revoke a member invite', async () => {
    const res = await run(REVOKE, { id: 'inv_member' }, MIA)
    expect(res.data).toEqual({ revokeInvite: true })
    expect(revokedIds()).toEqual(['inv_member'])
  })

  it('manager cannot revoke a manager invite (O15-A)', async () => {
    const res = await run(REVOKE, { id: 'inv_manager' }, MIA)
    expect(res.data).toEqual({ revokeInvite: false })
    expect(revokedIds()).toEqual([])
  })

  it('member cannot revoke', async () => {
    const res = await run(REVOKE, { id: 'inv_member' }, BAO)
    expect(code(res)).toBe('FORBIDDEN')
    expect(revokedIds()).toEqual([])
  })

  it("revoking another household's invite changes nothing", async () => {
    // OWEN owns hh_h and is a member of hh_x; inv_other is hh_x's
    const res = await run(REVOKE, { id: 'inv_other' }, OWEN)
    expect(res.data).toEqual({ revokeInvite: false })
    expect(revokedIds()).toEqual([])
  })

  it('an expired invite that was never used can be revoked, and publishes', async () => {
    // Given an invite of hh_h that expired an hour ago and was never used.
    // Expiry is not in revoke's `where` on purpose (see the resolver): the
    // invite could not be used anyway, and the list leaves it out either way.
    seed([invite('hh_h', OWEN, 'member', { id: 'inv_old', expiresAt: new Date(NOW.getTime() - 3_600_000) })])

    // When OWEN revokes it
    const res = await run(REVOKE, { id: 'inv_old' }, OWEN)

    // Then it is revoked, and the household hears of it
    expect(res.data).toEqual({ revokeInvite: true })
    expect(revokedIds()).toEqual(['inv_old'])
    expect(seen).toEqual([locationEvent('hh_h')])
  })

  it('a used invite cannot be revoked', async () => {
    const res = await run(REVOKE, { id: 'inv_used' }, OWEN)
    expect(res.data).toEqual({ revokeInvite: false })
    expect(revokedIds()).toEqual([])
  })

  it('revoking twice returns false the second time', async () => {
    const first = await run(REVOKE, { id: 'inv_member' }, OWEN)
    const firstAt = world.households.state.householdInvites[1]?.revokedAt
    vi.setSystemTime(new Date(NOW.getTime() + 60_000))
    const second = await run(REVOKE, { id: 'inv_member' }, OWEN)
    expect(first.data).toEqual({ revokeInvite: true })
    expect(second.data).toEqual({ revokeInvite: false })
    // The first revoke time is kept
    expect(world.households.state.householdInvites[1]?.revokedAt).toEqual(firstAt)
  })
})

// ─── live events (decision T19) ──────────────────────────────────────────────

describe('createInvite and revokeInvite publish household-level LOCATION', () => {
  it('createInvite publishes LOCATION once, for the household of the invite', async () => {
    const res = await run(CREATE, { role: 'member', roles: [] }, OWEN)
    expect(res.errors).toBeUndefined()
    expect(seen).toEqual([locationEvent('hh_h')])
  })

  it('createInvite publishes even when a read after the write fails', async () => {
    // Given the name read after the write throws
    const names = vi.spyOn(prisma.user, 'findMany').mockRejectedValueOnce(new Error('read failed'))
    try {
      // When OWEN creates an invite
      const res = await run(CREATE, { role: 'member', roles: [] }, OWEN)

      // Then the call fails, but the row is written and the household hears of it
      expect(res.errors).toBeDefined()
      expect(world.households.state.householdInvites).toHaveLength(1)
      expect(seen).toEqual([locationEvent('hh_h')])
    } finally {
      names.mockRestore()
    }
  })

  it('a refused createInvite publishes nothing', async () => {
    await run(CREATE, { role: 'manager', roles: [] }, MIA)
    await run(CREATE, { role: 'member', roles: roles([LOC_Z, 'viewer']) }, OWEN)
    await run(CREATE, { role: 'member', roles: [] }, BAO)
    expect(seen).toEqual([])
  })

  it('revokeInvite publishes LOCATION once, for the household', async () => {
    seed([invite('hh_h', OWEN, 'member', { id: 'inv_1' })])
    const res = await run(REVOKE, { id: 'inv_1' }, MIA)
    expect(res.data).toEqual({ revokeInvite: true })
    expect(seen).toEqual([locationEvent('hh_h')])
  })

  it('a revokeInvite that changes nothing, or is refused, publishes nothing', async () => {
    seed([invite('hh_h', OWEN, 'manager', { id: 'inv_1' }), invite('hh_x', YUKI, 'member', { id: 'inv_2' })])
    await run(REVOKE, { id: 'inv_1' }, MIA)
    await run(REVOKE, { id: 'inv_2' }, OWEN)
    await run(REVOKE, { id: 'inv_1' }, BAO)
    await run(REVOKE, { id: 'inv_none' }, OWEN)
    expect(seen).toEqual([])
  })

  it('the queries publish nothing', async () => {
    seed([invite('hh_h', OWEN, 'member', { token: tok('tok') })])
    await run(LIST, {}, OWEN)
    await run(PREVIEW, { token: tok('tok') }, YUKI)
    expect(seen).toEqual([])
  })
})
