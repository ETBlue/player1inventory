import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { FakeLocation } from '../test/stockFake.js'
import type { UserRow } from '../test/userFake.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'

// Switching households, and creating one while in a household (households
// H7 task L.2; plan docs/global/permissions/2026-11-21-households-plan-h7.md,
// decisions T68, T69 and T70, owner decision O50-A): `myHouseholds`,
// `setActiveHousehold` and `createHousehold(alsoWhenMember:)`.
//
// ── THE FIXTURE ──
//
// | Person | Households, OLDEST first   | Active (default) | Location roles           |
// |--------|----------------------------|------------------|--------------------------|
// | MIA    | hh_a owner, hh_b member    | hh_a             | LOC_A organizer, LOC_B viewer |
// | BEA    | hh_b owner                 | hh_b             | LOC_B organizer          |
// | CY     | none, never set up         | —                | none                     |
//
// MIA is in BOTH households, so every test about one of them checks that the
// other one is unchanged. The member rows are stored newest first, so a list
// that kept the store order instead of `joinedAt` order is wrong.
//
// CY was never set up (`householdSetupAt` is null). So a field that ran
// first sign-in (`requireHousehold` → `ensureHousehold`) for him would make
// him a household, and the tests see it.

vi.mock('../lib/household.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/household.js')>()
  return { ...real, ensureHousehold: vi.fn(real.ensureHousehold) }
})

// The global `prisma` gets its OWN copy of each model object, over the same
// stores, as in household-members.resolver.test.ts. A `$transaction` callback
// receives `world.client` as its `tx`. So a spy on `prisma.<model>` sees only
// calls made OUTSIDE a transaction, and a spy on `world.client.<model>` only
// calls made through `tx`.
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

const MIA = 'user_mia'
const BEA = 'user_bea'
const CY = 'user_cy'
const HH_A = 'hh_a'
const HH_B = 'hh_b'
const LOC_A = 'loc_a'
const LOC_B = 'loc_b'

const TAB = 'tab-1'
const T0 = new Date('2026-01-01T00:00:00.000Z')
const NOW = new Date('2026-11-21T12:00:00.000Z')
const D1 = new Date('2026-09-01T00:00:00.000Z')
const D2 = new Date('2026-09-02T00:00:00.000Z')

function loc(id: string, householdId: string): FakeLocation {
  return { id, householdId, name: `${id} name`, order: 0, createdAt: T0, updatedAt: T0 }
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

function seed() {
  world.reset()
  world.stock.reset([loc(LOC_A, HH_A), loc(LOC_B, HH_B)], [])
  world.seedHouseholds({
    households: [
      { ...householdRow(HH_A, MIA), name: 'Mia home' },
      { ...householdRow(HH_B, BEA), name: 'Bea home' },
    ],
    // Newest first on purpose: not the order the list must have.
    householdMembers: [
      { ...householdMemberRow(HH_B, BEA, 'owner'), joinedAt: D1 },
      { ...householdMemberRow(HH_B, MIA, 'member'), joinedAt: D2 },
      { ...householdMemberRow(HH_A, MIA, 'owner'), joinedAt: D1 },
    ],
    locationMembers: [
      locationMemberRow(LOC_A, MIA, 'organizer'),
      locationMemberRow(LOC_B, MIA, 'viewer'),
      locationMemberRow(LOC_B, BEA, 'organizer'),
    ],
  })
  world.users.reset([
    user(MIA, 'Mia', HH_A),
    user(BEA, 'Bea', HH_B),
    { ...user(CY, 'Cy', null), householdSetupAt: null },
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

/** Run as `userId`. `shown` is the `x-household-id` the tab sends; `undefined` sends none. */
async function run(
  query: string,
  variables: Record<string, unknown>,
  userId: string,
  shown?: string,
): Promise<Result> {
  const contextValue: Context = {
    userId,
    clientId: TAB,
    language: 'en',
    requestCache: {},
    shownHouseholdId: shown,
  }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult as Result
}

const MY_HOUSEHOLDS = `query { myHouseholds { id name role isActive } }`
const SET_ACTIVE = `mutation S($householdId: ID!) { setActiveHousehold(householdId: $householdId) { id name role } }`
const CREATE = `mutation C($name: String, $alsoWhenMember: Boolean) {
  createHousehold(name: $name, alsoWhenMember: $alsoWhenMember) { id name role }
}`
const CREATE_NO_FLAG = `mutation C($name: String) { createHousehold(name: $name) { id name role } }`
const HOUSEHOLD = `query { household { id } }`
const MEMBERS = `query { householdMembers { userId } }`

const myHouseholds = (userId: string, shown?: string) => run(MY_HOUSEHOLDS, {}, userId, shown)
const setActive = (userId: string, householdId: string, shown?: string) =>
  run(SET_ACTIVE, { householdId }, userId, shown)

function code(res: Result) {
  return res.errors?.[0]?.extensions?.code
}

function reason(res: Result) {
  return res.errors?.[0]?.extensions?.reason
}

function userRow(userId: string) {
  const row = world.users.state.rows.find((r) => r.id === userId)
  if (!row) throw new Error(`no stored User row for ${userId}`)
  return row
}

function householdIds() {
  return world.households.state.households.map((h) => h.id).sort()
}

/** The rows of ONE household, to check that it did not change. */
function householdState(householdId: string) {
  const locationIds = world.stock.state.locations
    .filter((l) => l.householdId === householdId)
    .map((l) => l.id)
    .sort()
  return {
    household: world.households.state.households.find((h) => h.id === householdId),
    members: world.households.state.householdMembers
      .filter((m) => m.householdId === householdId)
      .map((m) => `${m.userId}:${m.role}`)
      .sort(),
    locations: locationIds,
    locationMembers: world.households.state.locationMembers
      .filter((m) => locationIds.includes(m.locationId))
      .map((m) => `${m.locationId}:${m.userId}:${m.role}`)
      .sort(),
    activities: world.households.state.householdActivities.filter((a) => a.householdId === householdId)
      .length,
  }
}

/** Everything a refused call must leave as it was. */
function snapshot() {
  return {
    a: householdState(HH_A),
    b: householdState(HH_B),
    households: householdIds(),
    users: world.users.state.rows
      .map((r) => `${r.id}:${r.activeHouseholdId}:${r.householdSetupAt?.toISOString() ?? 'null'}`)
      .sort(),
  }
}

// ─── myHouseholds ────────────────────────────────────────────────────────────

describe('myHouseholds', () => {
  it('user sees every household they are in, oldest membership first, with their role', async () => {
    // Given MIA acts in hh_b, which is NOT her oldest membership
    world.setActiveHousehold(MIA, HH_B)

    // When she lists her households
    const res = await myHouseholds(MIA)

    // Then both come back in joinedAt order, with her role in each, and
    // hh_b is the active one
    expect(res.errors).toBeUndefined()
    expect(res.data?.myHouseholds).toEqual([
      { id: HH_A, name: 'Mia home', role: 'owner', isActive: false },
      { id: HH_B, name: 'Bea home', role: 'member', isActive: true },
    ])
  })

  it('isActive follows the same rule as requireHousehold: an active household she left falls back to the oldest', async () => {
    // Given MIA's active household names one she is not a member of
    world.setActiveHousehold(MIA, 'hh_gone')

    const res = await myHouseholds(MIA)

    // Then the oldest membership is the active one, as every other field acts
    expect(res.data?.myHouseholds).toEqual([
      { id: HH_A, name: 'Mia home', role: 'owner', isActive: true },
      { id: HH_B, name: 'Bea home', role: 'member', isActive: false },
    ])
    const acting = await run(HOUSEHOLD, {}, MIA)
    expect(acting.data?.household).toEqual({ id: HH_A })
  })

  it('a person in one household gets one entry', async () => {
    const res = await myHouseholds(BEA)
    expect(res.data?.myHouseholds).toEqual([
      { id: HH_B, name: 'Bea home', role: 'owner', isActive: true },
    ])
  })

  it('a person in no household gets an empty list, and no household is made for them', async () => {
    // Given CY, never set up: first sign-in would make him a household
    const before = snapshot()

    // When he lists his households
    const res = await myHouseholds(CY)

    // Then the list is empty, with no error, and nothing was written
    expect(res.errors).toBeUndefined()
    expect(res.data?.myHouseholds).toEqual([])
    expect(snapshot()).toEqual(before)
    expect(userRow(CY).householdSetupAt).toBeNull()
    expect(ensureHousehold).not.toHaveBeenCalled()
  })

  it('a person with no User row gets an empty list', async () => {
    const res = await myHouseholds('user_nobody')
    expect(res.errors).toBeUndefined()
    expect(res.data?.myHouseholds).toEqual([])
  })

  it('a tab that shows another household is not refused (stale tab, T67)', async () => {
    // Given MIA acts in hh_b, and her tab still shows hh_a
    world.setActiveHousehold(MIA, HH_B)

    // When that tab lists her households
    const res = await myHouseholds(MIA, HH_A)

    // Then it answers, with hh_b active
    expect(res.errors).toBeUndefined()
    expect(res.data?.myHouseholds).toEqual([
      { id: HH_A, name: 'Mia home', role: 'owner', isActive: false },
      { id: HH_B, name: 'Bea home', role: 'member', isActive: true },
    ])
    // Control: the same header DOES refuse a field that goes through
    // requireHousehold, so the header in this test is really stale.
    const other = await run(MEMBERS, {}, MIA, HH_A)
    expect(code(other)).toBe('HOUSEHOLD_CHANGED')
  })

  it('a signed-out caller is refused', async () => {
    const res = await server.executeOperation(
      { query: MY_HOUSEHOLDS },
      { contextValue: { requestCache: {} } as Context },
    )
    if (res.body.kind !== 'single') throw new Error('expected a single result')
    expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED')
  })
})

// ─── setActiveHousehold ──────────────────────────────────────────────────────

describe('setActiveHousehold', () => {
  it('user can switch to another household they are in', async () => {
    // Given MIA acts in hh_a
    const aBefore = householdState(HH_A)
    const bBefore = householdState(HH_B)
    const beaBefore = { ...userRow(BEA) }

    // When she switches to hh_b
    const res = await setActive(MIA, HH_B)

    // Then she gets hh_b with her role there, and her User row names it
    expect(res.errors).toBeUndefined()
    expect(res.data?.setActiveHousehold).toEqual({ id: HH_B, name: 'Bea home', role: 'member' })
    expect(userRow(MIA).activeHouseholdId).toBe(HH_B)
    // And her next request acts in hh_b
    const next = await run(HOUSEHOLD, {}, MIA)
    expect(next.data?.household).toEqual({ id: HH_B })
    // And neither household changed, nor anybody else's User row
    expect(householdState(HH_A)).toEqual(aBefore)
    expect(householdState(HH_B)).toEqual(bBefore)
    expect(userRow(BEA)).toEqual(beaBefore)
  })

  it('user can switch back from a tab that still shows the old household', async () => {
    // Given MIA acts in hh_b (switched in another tab), and this tab shows hh_a
    world.setActiveHousehold(MIA, HH_B)

    // When this tab switches her to hh_a
    const res = await setActive(MIA, HH_A, HH_A)

    // Then it is not refused with HOUSEHOLD_CHANGED
    expect(res.errors).toBeUndefined()
    expect(res.data?.setActiveHousehold).toEqual({ id: HH_A, name: 'Mia home', role: 'owner' })
    expect(userRow(MIA).activeHouseholdId).toBe(HH_A)
  })

  it('a stale tab can switch to a third household too', async () => {
    // Given MIA acts in hh_a, and the tab shows hh_b (a stale header)
    const res = await setActive(MIA, HH_B, HH_B)
    expect(res.errors).toBeUndefined()
    expect(userRow(MIA).activeHouseholdId).toBe(HH_B)
  })

  it('a household the caller is not in is FORBIDDEN, and nothing changes', async () => {
    // Given BEA, who is in hh_b only
    const before = snapshot()

    // When she asks to act in hh_a
    const res = await setActive(BEA, HH_A)

    // Then she is refused, and her row still names hh_b
    expect(code(res)).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
    expect(userRow(BEA).activeHouseholdId).toBe(HH_B)
    const next = await run(HOUSEHOLD, {}, BEA)
    expect(next.data?.household).toEqual({ id: HH_B })
  })

  it('an unknown household id is FORBIDDEN, the same answer', async () => {
    const before = snapshot()
    const res = await setActive(MIA, 'hh_nope')
    expect(code(res)).toBe('FORBIDDEN')
    expect(res.errors?.[0]?.message).toBe('Forbidden')
    expect(snapshot()).toEqual(before)
  })

  it('a person in no household is FORBIDDEN, and no household is made', async () => {
    const before = snapshot()
    const res = await setActive(CY, HH_A)
    expect(code(res)).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
    expect(ensureHousehold).not.toHaveBeenCalled()
  })

  it('takes the User lock first and no household lock (T16)', async () => {
    const order: string[] = []
    const update = world.client.user.update
    vi.spyOn(world.client.user, 'update').mockImplementation(async (args) => {
      const data = args.data as { updatedAt?: unknown; activeHouseholdId?: unknown }
      if (data.activeHouseholdId !== undefined) order.push('write')
      else if (data.updatedAt !== undefined) order.push('lockUser')
      return update(args)
    })
    const findUnique = world.client.householdMember.findUnique
    vi.spyOn(world.client.householdMember, 'findUnique').mockImplementation(async (args) => {
      order.push('member')
      return findUnique(args)
    })
    const lockHousehold = vi.spyOn(world.client.household, 'updateMany')
    const lockHouseholdGlobal = vi.spyOn(prisma.household, 'updateMany')

    const res = await setActive(MIA, HH_B)

    expect(res.errors).toBeUndefined()
    expect(order).toEqual(['lockUser', 'member', 'write'])
    expect(lockHousehold).not.toHaveBeenCalled()
    expect(lockHouseholdGlobal).not.toHaveBeenCalled()
  })

  it('reads the membership through tx, never through the global client', async () => {
    const outside = vi.spyOn(prisma.householdMember, 'findUnique')
    const inside = vi.spyOn(world.client.householdMember, 'findUnique')
    const res = await setActive(MIA, HH_B)
    expect(res.errors).toBeUndefined()
    expect(inside).toHaveBeenCalled()
    expect(outside).not.toHaveBeenCalled()
  })

  it('publishes nothing and writes no activity row', async () => {
    await setActive(MIA, HH_B)
    await setActive(BEA, HH_A)
    expect(seen).toEqual([])
    expect(world.households.state.householdActivities).toEqual([])
  })

  it('never asks for the caller’s household (it chooses one)', async () => {
    await setActive(MIA, HH_B)
    expect(ensureHousehold).not.toHaveBeenCalled()
  })
})

// ─── createHousehold(alsoWhenMember:) ────────────────────────────────────────

describe('createHousehold with alsoWhenMember', () => {
  function newHouseholdId(): string {
    const ids = householdIds().filter((id) => id !== HH_A && id !== HH_B)
    if (ids.length !== 1) throw new Error(`expected one new household, got ${ids.length}`)
    return ids[0] as string
  }

  it('user in a household can create another one with alsoWhenMember: true', async () => {
    // Given MIA, in hh_a and hh_b
    const aBefore = householdState(HH_A)
    const bBefore = householdState(HH_B)

    // When she creates "Second" from Switch to… › Create new
    const res = await run(CREATE, { name: 'Second', alsoWhenMember: true }, MIA)

    // Then she owns a third household with a "Home" location and her
    // organizer row there, and acts in it
    expect(res.errors).toBeUndefined()
    const id = newHouseholdId()
    expect(res.data?.createHousehold).toEqual({ id, name: 'Second', role: 'owner' })
    expect(householdState(id).members).toEqual([`${MIA}:owner`])
    expect(world.households.state.households.find((h) => h.id === id)?.ownerId).toBe(MIA)
    const homes = world.stock.state.locations.filter((l) => l.householdId === id)
    expect(homes.map((l) => l.name)).toEqual(['Home'])
    expect(householdState(id).locationMembers).toEqual([`${homes[0]?.id}:${MIA}:organizer`])
    expect(userRow(MIA).activeHouseholdId).toBe(id)
    // And household-level LOCATION for the NEW household only
    expect(seen).toEqual([
      { kind: 'LOCATION', householdId: id, locationId: null, sourceClientId: TAB },
    ])
    // And her two old households did not change
    expect(householdState(HH_A)).toEqual(aBefore)
    expect(householdState(HH_B)).toEqual(bBefore)
    // And she can still list all three
    const list = await myHouseholds(MIA)
    expect((list.data?.myHouseholds as { id: string }[]).map((h) => h.id).sort()).toEqual(
      [HH_A, HH_B, id].sort(),
    )
  })

  it('user in a household still gets ALREADY_IN_HOUSEHOLD without the argument (T70)', async () => {
    // The no-household screen relies on this refusal (useHousehold.ts).
    const before = snapshot()
    const res = await run(CREATE_NO_FLAG, { name: 'Second' }, MIA)
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(reason(res)).toBe('ALREADY_IN_HOUSEHOLD')
    expect(snapshot()).toEqual(before)
    expect(seen).toEqual([])
  })

  it.each([
    ['false', false],
    ['null', null],
  ])('alsoWhenMember: %s is the same as leaving it out', async (_label, value) => {
    const before = snapshot()
    const res = await run(CREATE, { name: 'Second', alsoWhenMember: value }, MIA)
    expect(reason(res)).toBe('ALREADY_IN_HOUSEHOLD')
    expect(snapshot()).toEqual(before)
  })

  it('user with no household can create one without the argument, as before', async () => {
    const res = await run(CREATE_NO_FLAG, { name: 'Cy home' }, CY)
    expect(res.errors).toBeUndefined()
    const id = newHouseholdId()
    expect(res.data?.createHousehold).toEqual({ id, name: 'Cy home', role: 'owner' })
    expect(userRow(CY).activeHouseholdId).toBe(id)
    expect(userRow(CY).householdSetupAt).toEqual(NOW)
  })

  it('user with no household can create one with alsoWhenMember: true too', async () => {
    const res = await run(CREATE, { name: 'Cy home', alsoWhenMember: true }, CY)
    expect(res.errors).toBeUndefined()
    expect(userRow(CY).activeHouseholdId).toBe(newHouseholdId())
  })

  it('a tab that shows another household can create one', async () => {
    world.setActiveHousehold(MIA, HH_B)
    const res = await run(CREATE, { name: 'Second', alsoWhenMember: true }, MIA, HH_A)
    expect(res.errors).toBeUndefined()
    expect(userRow(MIA).activeHouseholdId).toBe(newHouseholdId())
  })

  it('a blank name is still refused with alsoWhenMember, and nothing is written', async () => {
    const before = snapshot()
    const res = await run(CREATE, { name: '  ', alsoWhenMember: true }, MIA)
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(snapshot()).toEqual(before)
  })
})
