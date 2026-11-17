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

// `joinHousehold` (households H5b, task G.4; plan
// docs/global/permissions/2026-11-18-households-plan-h5b.md, decisions T16,
// T17, T18, T19, T20, T21 and T22, owner decision O2-A).
//
// ── THE FIXTURE ──
//
// | Person | Households (joinedAt order)  | Location roles              |
// |--------|------------------------------|-----------------------------|
// | OWEN   | hh_h owner                   | LOC_K, LOC_G organizer      |
// | BAO    | hh_h member                  | LOC_K viewer                |
// | YUKI   | hh_x owner (a stranger)      | LOC_Z organizer             |
// | PAT    | hh_p owner, EMPTY ("Home")   | LOC_P organizer             |
// | RIA    | hh_r owner, active hh_r      | LOC_R organizer             |
// | PIA    | none (set up once, then left)| none                        |
//
// hh_p holds only its first location. hh_r is empty too, until a test puts a
// row in it. After a join the target household (hh_h) is RIA's NEWEST
// membership, not her oldest, so "RIA now acts in hh_h" is true only when
// `joinHousehold` wrote her `activeHouseholdId` (decision T14).

// `ensureHousehold` is wrapped in a spy, so the T22 test can see that
// `joinHousehold` never asks for the caller's household.
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
const BAO = 'user_bao'
const YUKI = 'user_yuki'
const PAT = 'user_pat'
const RIA = 'user_ria'
const PIA = 'user_pia'

const LOC_K = 'loc_kitchen'
const LOC_G = 'loc_garage'
const LOC_Z = 'loc_z'
const LOC_P = 'loc_pat_home'
const LOC_R = 'loc_ria_home'

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
    createdAt: T0,
    updatedAt: T0,
  }
}

/** A test token of the length every real token has. */
function tok(name: string): string {
  return name.padEnd(INVITE_TOKEN_LENGTH, '0')
}

let inviteSeq = 0
function invite(
  householdId: string,
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
    createdById: OWEN,
    createdAt: new Date(T0.getTime() + inviteSeq * 1000),
    expiresAt: new Date('2026-11-20T00:00:00.000Z'),
    usedAt: null,
    usedById: null,
    revokedAt: null,
    ...extra,
  }
}

/** The main invite: hh_h, `member`, participant on the kitchen. */
const MAIN = tok('tok_main')

function seed(invites: HouseholdInviteRow[] = []) {
  world.reset()
  world.stock.reset(
    [
      loc(LOC_K, 'hh_h', 0),
      loc(LOC_G, 'hh_h', 1),
      loc(LOC_Z, 'hh_x', 0),
      loc(LOC_P, 'hh_p', 0),
      loc(LOC_R, 'hh_r', 0),
    ],
    [],
  )
  world.seedHouseholds({
    households: [
      householdRow('hh_h', OWEN),
      householdRow('hh_x', YUKI),
      householdRow('hh_p', PAT),
      householdRow('hh_r', RIA),
    ],
    householdMembers: [
      { ...householdMemberRow('hh_h', OWEN, 'owner'), joinedAt: EARLY },
      { ...householdMemberRow('hh_h', BAO, 'member'), joinedAt: LATE },
      { ...householdMemberRow('hh_x', YUKI, 'owner'), joinedAt: EARLY },
      { ...householdMemberRow('hh_p', PAT, 'owner'), joinedAt: EARLY },
      { ...householdMemberRow('hh_r', RIA, 'owner'), joinedAt: EARLY },
    ],
    locationMembers: [
      locationMemberRow(LOC_K, OWEN, 'organizer'),
      locationMemberRow(LOC_G, OWEN, 'organizer'),
      locationMemberRow(LOC_K, BAO, 'viewer'),
      locationMemberRow(LOC_Z, YUKI, 'organizer'),
      locationMemberRow(LOC_P, PAT, 'organizer'),
      locationMemberRow(LOC_R, RIA, 'organizer'),
    ],
    householdInvites: [
      invite('hh_h', 'member', {
        token: MAIN,
        locationRoles: [{ locationId: LOC_K, role: 'participant' }],
      }),
      ...invites,
    ],
  })
  world.users.reset([
    user(OWEN, 'Owen', null),
    user(BAO, 'Bao', null),
    user(YUKI, 'Yuki', null),
    user(PAT, 'Pat', null),
    user(RIA, 'Ria', 'hh_r'),
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
  vi.restoreAllMocks()
  vi.useRealTimers()
})

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

const JOIN = `mutation J($token: String!) { joinHousehold(token: $token) { id name role } }`
const HOUSEHOLD = `query { household { id } }`

function join(token: string, userId: string) {
  return run(JOIN, { token }, userId)
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

function mainInvite() {
  const row = world.households.state.householdInvites.find((i) => i.token === MAIN)
  if (!row) throw new Error('the main invite is gone')
  return row
}

function activeOf(userId: string) {
  return world.users.state.rows.find((r) => r.id === userId)?.activeHouseholdId
}

/** Everything a refused join must leave as it was. */
function snapshot() {
  return {
    members: members(),
    locationMembers: world.households.state.locationMembers
      .map((m) => `${m.locationId}:${m.userId}:${m.role}`)
      .sort(),
    households: householdIds(),
    invites: world.households.state.householdInvites.map((i) => ({ ...i })),
    users: world.users.state.rows.map((r) => `${r.id}:${r.activeHouseholdId}`).sort(),
    locations: world.stock.state.locations.map((l) => l.id).sort(),
  }
}

// ─── the join ────────────────────────────────────────────────────────────────

describe('joinHousehold', () => {
  it('user can join a household with an invite', async () => {
    // Given PAT, owner of an empty household of his own, and an open invite
    // to hh_h as `member` with participant on the kitchen
    // When he joins
    const res = await join(MAIN, PAT)

    // Then he is a member of hh_h with exactly the invite's roles
    expect(res.errors).toBeUndefined()
    expect(res.data).toEqual({ joinHousehold: { id: 'hh_h', name: 'hh_h name', role: 'member' } })
    expect(members()).toContain(`hh_h:${PAT}:member`)
    expect(locationRolesOf(PAT)).toEqual([`${LOC_K}:participant`])
    // And the invite is used, by him, now
    expect(mainInvite().usedAt).toEqual(NOW)
    expect(mainInvite().usedById).toBe(PAT)
    // And hh_h is his active household
    expect(activeOf(PAT)).toBe('hh_h')
  })

  it('joining deletes the joiner’s own household when it is empty', async () => {
    // Given PAT's own household holds only "Home" and his organizer row
    await join(MAIN, PAT)

    // Then hh_p is gone, with its location and his role there
    expect(householdIds()).toEqual(['hh_h', 'hh_r', 'hh_x'])
    expect(world.stock.state.locations.map((l) => l.id)).not.toContain(LOC_P)
    expect(members().filter((m) => m.startsWith('hh_p:'))).toEqual([])
    // And nobody else's household changed
    expect(members()).toEqual(
      [
        `hh_h:${OWEN}:owner`,
        `hh_h:${BAO}:member`,
        `hh_h:${PAT}:member`,
        `hh_x:${YUKI}:owner`,
        `hh_r:${RIA}:owner`,
      ].sort(),
    )
  })

  it('joining keeps the joiner’s own household when it has data, and the joiner now acts in the joined one', async () => {
    // Given RIA, whose own household hh_r has an item, and whose active
    // household is hh_r
    world.contents.rows.items.push({ householdId: 'hh_r' })

    // When she joins hh_h
    const res = await join(MAIN, RIA)

    // Then hh_r stays, she is still its owner, and still its organizer
    expect(res.errors).toBeUndefined()
    expect(householdIds()).toContain('hh_r')
    expect(members()).toContain(`hh_r:${RIA}:owner`)
    expect(members()).toContain(`hh_h:${RIA}:member`)
    expect(locationRolesOf(RIA)).toEqual([`${LOC_K}:participant`, `${LOC_R}:organizer`].sort())
    // And hh_h is now her active household. hh_h is her NEWEST membership,
    // so the next request reads hh_h only because of that.
    expect(activeOf(RIA)).toBe('hh_h')
    const after = await run(HOUSEHOLD, {}, RIA)
    expect(after.data).toEqual({ household: { id: 'hh_h' } })
  })

  it('an invite location deleted since is skipped', async () => {
    // Given an invite for the kitchen AND the garage, and the garage deleted
    // since the invite was made
    const token = tok('tok_two')
    seed([
      invite('hh_h', 'member', {
        token,
        locationRoles: [
          { locationId: LOC_K, role: 'participant' },
          { locationId: LOC_G, role: 'viewer' },
        ],
      }),
    ])
    await prisma.location.delete({ where: { id: LOC_G } })

    // When PAT joins
    const res = await join(token, PAT)

    // Then he joins with the kitchen only, and no error
    expect(res.errors).toBeUndefined()
    expect(locationRolesOf(PAT)).toEqual([`${LOC_K}:participant`])
  })

  it('an invite location of ANOTHER household gives no role there', async () => {
    // Given a corrupt invite that names YUKI's location. createInvite refuses
    // this, so only a bad row can hold it.
    const token = tok('tok_foreign')
    seed([
      invite('hh_h', 'member', {
        token,
        locationRoles: [
          { locationId: LOC_K, role: 'viewer' },
          { locationId: LOC_Z, role: 'organizer' },
        ],
      }),
    ])

    const res = await join(token, PAT)

    expect(res.errors).toBeUndefined()
    expect(locationRolesOf(PAT)).toEqual([`${LOC_K}:viewer`])
  })

  it('joining replaces leftover location roles (T20)', async () => {
    // Given PAT has an old organizer row on the garage of hh_h but no
    // membership there (a leftover from before decision T11)
    world.households.state.locationMembers.push(locationMemberRow(LOC_G, PAT, 'organizer'))

    // When he joins with an invite that gives the kitchen only
    const res = await join(MAIN, PAT)

    // Then the old garage row is gone
    expect(res.errors).toBeUndefined()
    expect(locationRolesOf(PAT)).toEqual([`${LOC_K}:participant`])
  })

  it('a leftover row with a HIGHER role on an invite location is replaced by the invite role', async () => {
    // Given an old organizer row on the kitchen, and an invite giving
    // participant there
    world.households.state.locationMembers.push(locationMemberRow(LOC_K, PAT, 'organizer'))

    await join(MAIN, PAT)

    expect(locationRolesOf(PAT)).toEqual([`${LOC_K}:participant`])
  })

  it('a person with no household can join (T22)', async () => {
    // Given PIA: set up once (the claim is set), and in no household now
    const res = await join(MAIN, PIA)

    // Then she joins, and her household was never asked for
    expect(res.errors).toBeUndefined()
    expect(members()).toContain(`hh_h:${PIA}:member`)
    expect(activeOf(PIA)).toBe('hh_h')
    expect(ensureHousehold).not.toHaveBeenCalled()
  })

  it('a manager invite makes a manager', async () => {
    const token = tok('tok_mgr')
    seed([invite('hh_h', 'manager', { token })])
    const res = await join(token, PAT)
    expect(res.data).toEqual({ joinHousehold: { id: 'hh_h', name: 'hh_h name', role: 'manager' } })
    expect(members()).toContain(`hh_h:${PAT}:manager`)
  })

  it('needs a signed-in caller', async () => {
    const res = await server.executeOperation(
      { query: JOIN, variables: { token: MAIN } },
      { contextValue: { userId: null } as unknown as Context },
    )
    if (res.body.kind !== 'single') throw new Error('expected a single result')
    expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED')
    expect(mainInvite().usedAt).toBeNull()
  })
})

// ─── "is it empty" (decision T21) ────────────────────────────────────────────

describe('joinHousehold keeps the joiner’s own household when it is not empty', () => {
  // Each test puts ONE thing into PAT's household hh_p. With only an item in
  // the fixture, a check that forgot `itemStocks` would still pass.
  const cases: [string, () => void][] = [
    ['an item', () => world.contents.rows.items.push({ householdId: 'hh_p' })],
    ['a tag', () => world.contents.rows.tags.push({ householdId: 'hh_p' })],
    ['a tag type', () => world.contents.rows.tagTypes.push({ householdId: 'hh_p' })],
    ['a vendor', () => world.contents.rows.vendors.push({ householdId: 'hh_p' })],
    ['a recipe', () => world.contents.rows.recipes.push({ householdId: 'hh_p' })],
    ['a shelf', () => world.contents.rows.shelves.push({ householdId: 'hh_p' })],
    [
      'a stock row',
      () =>
        world.stock.state.itemStocks.push({
          id: 'stock_p',
          itemId: 'item_p',
          locationId: LOC_P,
          targetQuantity: 1,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          dueDate: null,
          createdAt: T0,
          updatedAt: T0,
        }),
    ],
    ['a log', () => world.contents.rows.inventoryLogs.push({ locationId: LOC_P })],
    [
      'a cart row',
      () => {
        world.contents.rows.carts.push({ id: `${LOC_P}:v`, locationId: LOC_P })
        world.contents.rows.cartItems.push({ cartId: `${LOC_P}:v` })
      },
    ],
    [
      'a second member',
      () => world.households.state.householdMembers.push(householdMemberRow('hh_p', YUKI, 'member')),
    ],
  ]

  it.each(cases)('%s alone keeps it', async (_, add) => {
    add()
    const res = await join(MAIN, PAT)
    expect(res.errors).toBeUndefined()
    expect(householdIds()).toContain('hh_p')
    expect(members()).toContain(`hh_p:${PAT}:owner`)
    expect(activeOf(PAT)).toBe('hh_h')
  })

  it('an empty cart does not keep it', async () => {
    world.contents.rows.carts.push({ id: `${LOC_P}:v`, locationId: LOC_P })
    await join(MAIN, PAT)
    expect(householdIds()).not.toContain('hh_p')
    expect(world.contents.rows.carts).toEqual([])
  })

  it('an open invite does not keep it', async () => {
    world.households.state.householdInvites.push(
      invite('hh_p', 'member', { createdById: PAT, token: tok('tok_hp') }),
    )
    await join(MAIN, PAT)
    expect(householdIds()).not.toContain('hh_p')
  })

  it("another household's data does not keep it", async () => {
    // A control for the cases above: rows that belong to hh_x only.
    world.contents.rows.items.push({ householdId: 'hh_x' })
    world.contents.rows.inventoryLogs.push({ locationId: LOC_Z })
    await join(MAIN, PAT)
    expect(householdIds()).not.toContain('hh_p')
    expect(householdIds()).toContain('hh_x')
  })
})

// ─── refusals ────────────────────────────────────────────────────────────────

describe('joinHousehold refuses', () => {
  it('already in this household: ALREADY_MEMBER, the invite stays unused, nothing written', async () => {
    const before = snapshot()
    const claim = vi.spyOn(prisma.householdInvite, 'updateMany')

    const res = await join(MAIN, BAO)

    expect(res.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT')
    expect(reason(res)).toBe('ALREADY_MEMBER')
    expect(snapshot()).toEqual(before)
    // The claim was never tried (decision T17: ALREADY_MEMBER comes first).
    expect(claim).not.toHaveBeenCalled()
  })

  it('a member whose invite was used by someone else in the meantime still gets ALREADY_MEMBER', async () => {
    // The order of the checks is what a person sees: the membership check
    // runs before the claim, so the answer is about them, not the link.
    const claim = vi.spyOn(prisma.householdInvite, 'updateMany')
    // The fake's own object: `prisma.householdInvite` is the same object.
    const invites = world.households.client.householdInvite
    const findUnique = invites.findUnique
    vi.spyOn(invites, 'findUnique').mockImplementationOnce(async (args) => {
      const real = await findUnique(args)
      mainInvite().usedAt = NOW
      mainInvite().usedById = YUKI
      return real
    })

    const res = await join(MAIN, BAO)

    expect(reason(res)).toBe('ALREADY_MEMBER')
    expect(claim).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown token', () => tok('tok_none')],
    [
      'a used invite',
      () => {
        mainInvite().usedAt = T0
        mainInvite().usedById = YUKI
        return MAIN
      },
    ],
    [
      'a revoked invite',
      () => {
        mainInvite().revokedAt = T0
        return MAIN
      },
    ],
    [
      'an invite that expires exactly now',
      () => {
        mainInvite().expiresAt = NOW
        return MAIN
      },
    ],
  ])('INVITE_INVALID for %s, nothing written', async (_, prepare) => {
    const token = prepare()
    const before = snapshot()

    const res = await join(token, PAT)

    expect(res.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT')
    expect(reason(res)).toBe('INVITE_INVALID')
    expect(snapshot()).toEqual(before)
  })

  it('INVITE_INVALID for a used invite even for a member of its household, as invitePreview says', async () => {
    // The open check runs on the read, before ALREADY_MEMBER. So the join
    // and the preview give the same answer for a link that no longer works.
    mainInvite().usedAt = T0
    mainInvite().usedById = YUKI
    const lock = vi.spyOn(prisma.household, 'update')

    const res = await join(MAIN, BAO)

    expect(reason(res)).toBe('INVITE_INVALID')
    // And the household lock was not taken for it
    expect(lock).not.toHaveBeenCalled()
  })

  it.each([
    ['one character short', MAIN.slice(0, INVITE_TOKEN_LENGTH - 1)],
    ['one character long', `${MAIN}0`],
  ])('INVITE_INVALID with no read and no lock for a token %s', async (_, token) => {
    // Given an open invite whose stored token has this wrong length, so only
    // the length check can refuse it
    const row = mainInvite()
    row.token = token
    const read = vi.spyOn(prisma.householdInvite, 'findUnique')
    const lock = vi.spyOn(prisma.user, 'update')

    const res = await join(token, PAT)

    expect(reason(res)).toBe('INVITE_INVALID')
    expect(read).not.toHaveBeenCalled()
    expect(lock).not.toHaveBeenCalled()
    expect(row.usedAt).toBeNull()
  })

  it('a household deleted between the invite read and its lock gives INVITE_INVALID', async () => {
    // Given the household lock finds no row (P2025): the household, and with
    // it the invite, was deleted after the invite was read
    const households = world.client.household
    vi.spyOn(households, 'update').mockImplementationOnce(async () => {
      throw Object.assign(new Error('No Household found'), { code: 'P2025' })
    })
    const before = snapshot()

    const res = await join(MAIN, PAT)

    expect(res.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT')
    expect(reason(res)).toBe('INVITE_INVALID')
    expect(snapshot()).toEqual(before)
  })

  it('any other failure of the household lock is not turned into INVITE_INVALID', async () => {
    vi.spyOn(world.client.household, 'update').mockImplementationOnce(async () => {
      throw Object.assign(new Error('connection lost'), { code: 'P1001' })
    })

    const res = await join(MAIN, PAT)

    expect(res.errors).toBeDefined()
    expect(reason(res)).toBeUndefined()
  })

  it('the second of two joins on one link is refused (T17)', async () => {
    // Given another join claims the invite between this join's read and its
    // claim. The claim's `where` must see `usedAt` set and match nothing.
    const invites = world.households.client.householdInvite
    const original = invites.updateMany
    vi.spyOn(invites, 'updateMany').mockImplementationOnce(async (args) => {
      mainInvite().usedAt = NOW
      mainInvite().usedById = YUKI
      return original(args)
    })

    const res = await join(MAIN, PAT)

    expect(reason(res)).toBe('INVITE_INVALID')
    expect(members()).not.toContain(`hh_h:${PAT}:member`)
    expect(householdIds()).toContain('hh_p')
  })

  it.each([
    ['revoked', (row: HouseholdInviteRow) => (row.revokedAt = NOW)],
    ['expired', (row: HouseholdInviteRow) => (row.expiresAt = NOW)],
  ])('a join whose invite is %s between the read and the claim is refused (T17)', async (_, change) => {
    // Each key of the claim's `where` on its own: a claim that forgot it
    // would still match.
    const invites = world.households.client.householdInvite
    const original = invites.updateMany
    vi.spyOn(invites, 'updateMany').mockImplementationOnce(async (args) => {
      change(mainInvite())
      return original(args)
    })

    const res = await join(MAIN, PAT)

    expect(reason(res)).toBe('INVITE_INVALID')
    expect(members()).not.toContain(`hh_h:${PAT}:member`)
  })
})

// ─── order and atomicity ─────────────────────────────────────────────────────

describe('joinHousehold locks and rolls back', () => {
  it('the user lock is taken before the household lock (T16)', async () => {
    const userUpdate = vi.spyOn(prisma.user, 'update')
    const householdUpdate = vi.spyOn(prisma.household, 'update')

    await join(MAIN, PAT)

    // The first `User` update is the lock, of PAT's row, before any
    // `Household` update.
    expect(userUpdate.mock.calls[0]?.[0]).toMatchObject({ where: { id: PAT } })
    expect(householdUpdate.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'hh_h' } })
    const firstUser = userUpdate.mock.invocationCallOrder[0] ?? Infinity
    const firstHousehold = householdUpdate.mock.invocationCallOrder[0] ?? -Infinity
    expect(firstUser).toBeLessThan(firstHousehold)
  })

  it('the user lock comes before the invite is read', async () => {
    const userUpdate = vi.spyOn(prisma.user, 'update')
    const read = vi.spyOn(prisma.householdInvite, 'findUnique')

    await join(MAIN, PAT)

    expect(userUpdate.mock.invocationCallOrder[0] ?? Infinity).toBeLessThan(
      read.mock.invocationCallOrder[0] ?? -Infinity,
    )
  })

  it('a refused location role write rolls back the whole join', async () => {
    const before = snapshot()
    vi.spyOn(prisma.locationMember, 'create').mockRejectedValueOnce(new Error('boom'))

    const res = await join(MAIN, PAT)

    expect(res.errors).toBeDefined()
    expect(snapshot()).toEqual(before)
    expect(mainInvite().usedAt).toBeNull()
  })

  it('a failure in the LAST step rolls back the claim, the member row, the roles and the active household', async () => {
    const before = snapshot()
    vi.spyOn(prisma.household, 'deleteMany').mockRejectedValueOnce(new Error('boom'))

    const res = await join(MAIN, PAT)

    expect(res.errors).toBeDefined()
    expect(snapshot()).toEqual(before)
    expect(householdIds()).toContain('hh_p')
    expect(activeOf(PAT)).toBeNull()
  })

  it('a corrupt locationRoles row fails the join and writes nothing', async () => {
    mainInvite().locationRoles = [{ locationId: LOC_K, role: 'boss' }]
    const before = snapshot()

    const res = await join(MAIN, PAT)

    // A plain Error: the client sees an internal error, not a reason.
    expect(res.errors).toBeDefined()
    expect(reason(res)).toBeUndefined()
    expect(snapshot()).toEqual(before)
  })
})

// ─── live events (decision T19) ──────────────────────────────────────────────

describe('joinHousehold publishes household-level LOCATION', () => {
  function locationEvent(householdId: string): ChangeEvent {
    return { kind: 'LOCATION', householdId, locationId: null, sourceClientId: TAB }
  }

  it('one event, for the joined household, and none for the deleted own household', async () => {
    await join(MAIN, PAT)
    expect(seen).toEqual([locationEvent('hh_h')])
  })

  it('none for the kept own household either', async () => {
    world.contents.rows.items.push({ householdId: 'hh_r' })
    await join(MAIN, RIA)
    expect(seen).toEqual([locationEvent('hh_h')])
  })

  it('a refused join publishes nothing', async () => {
    await join(MAIN, BAO)
    await join(tok('tok_none'), PAT)
    vi.spyOn(prisma.household, 'deleteMany').mockRejectedValueOnce(new Error('boom'))
    await join(MAIN, PAT)
    expect(seen).toEqual([])
  })
})
