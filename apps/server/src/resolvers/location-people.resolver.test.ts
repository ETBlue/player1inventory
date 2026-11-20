import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { FakeLocation } from '../test/stockFake.js'
import type { UserRow } from '../test/userFake.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'

// The people of one location (households H5c, tasks H.2 and H.3; plan
// docs/global/permissions/2026-11-19-households-plan-h5c.md, decisions T39
// and T40, owner decisions O24-A and O28-A): the `locationPeople` query and
// `HouseholdPerson.hasLocationRole` (task H.2), and the three role writes
// `setLocationRole`, `removeLocationRole` and `leaveLocation` (task H.3,
// decisions T34–T38 and T42, owner decisions O25-A and O30-A).
//
// ── THE FIXTURE ──
//
// | Person     | Name | Households                 | Location roles                        |
// |------------|------|----------------------------|---------------------------------------|
// | OWEN       | Owen | hh_h owner                 | none (No access on LOC_K)             |
// | MIA        | Mia  | hh_h manager, hh_x member  | LOC_Z viewer only (another household) |
// | BEA        | Bea  | hh_h member, hh_x member   | LOC_K organizer, LOC_Z viewer         |
// | BOB        | Bob  | hh_h member                | LOC_K participant                     |
// | AAA        | Bob  | hh_h member                | LOC_K participant                     |
// | CARL       | Al   | hh_h member                | LOC_K participant                     |
// | VIC        | Vic  | hh_h member                | LOC_K viewer                          |
// | NOA        | Noa  | hh_h member                | LOC_G organizer, no role on LOC_K     |
// | PAM        | Pam  | hh_x member (removed from hh_h) | a LEFTOVER LOC_K participant row |
// | YUKI       | Yuki | hh_x owner                 | LOC_Z organizer                       |
//
// Everyone in hh_h acts in hh_h (`User.activeHouseholdId`).
//
// Why each one is there:
//
// - OWEN and MIA hold no role on LOC_K. Only their household role can let
//   them read it (O24-A). NOA is a household `member` with a role on ANOTHER
//   location of the same household, so "has some location role" is not
//   enough: NOA must be refused on LOC_K.
// - BEA holds a role on LOC_Z, which is in hh_x. So a resolver that looked the
//   location up by id alone, and then asked `locationRoleOf`, would let her
//   read LOC_Z from hh_h. It must not.
// - PAM's row on LOC_K is a leftover of a person no longer in hh_h. PAM is
//   still in ANOTHER household, so a filter that only asked "is this person
//   in some household" would let the row through (decision H18).
// - BOB and AAA have the same name and role, and CARL's name sorts before
//   theirs while his id sorts after AAA's. The store order is different from
//   the order the answer must have (T39: role, then name, then id).
// - MIA's only location role is in hh_x. So `hasLocationRole` without the
//   `location: { householdId }` filter would call her true.

// How many `$transaction` callbacks are running right now. The three role
// writes (task H.3) must read nothing through the global client while it is
// above 0, and must publish only when it is back to 0 (after the commit).
//
// `touched` holds every model a transaction callback reached through `tx`,
// and `unknownTouched` every model the world does not have (for example
// `cartItem`). Such a model gets a recording stub instead of `undefined`, so
// a resolver that writes one fails on an assertion about WHICH models it
// touched, not on a `TypeError`. Every test ends by checking that no unknown
// model was reached (the `afterEach` below).
const tx = vi.hoisted(() => ({
  depth: 0,
  touched: new Set<string>(),
  unknownTouched: new Set<string>(),
}))

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  // The global `prisma` gets its own copy of each model object over the same
  // stores, so a spy on `prisma.<model>` sees only the calls made through
  // the global client (the household-members test does the same).
  const copy = Object.fromEntries(
    Object.entries(world.client).map(([key, value]) => [
      key,
      value && typeof value === 'object' ? { ...value } : value,
    ]),
  )
  const worldTransaction = (world.client as unknown as { $transaction: (arg: unknown) => Promise<unknown> })
    .$transaction
  async function $transaction(arg: unknown) {
    if (typeof arg !== 'function') return worldTransaction(arg)
    // Count the depth INSIDE the callback, so a transaction that waits in
    // the `serialTransactions` queue is not counted as running.
    return worldTransaction(async (client: unknown) => {
      const real = client as Record<string, unknown>
      const recorded = new Proxy(real, {
        get(target, prop, receiver) {
          if (typeof prop !== 'string' || prop.startsWith('$') || prop === 'then') {
            return Reflect.get(target, prop, receiver)
          }
          tx.touched.add(prop)
          if (prop in target) return Reflect.get(target, prop, receiver)
          tx.unknownTouched.add(prop)
          // A stub whose every method resolves to an empty answer.
          return new Proxy({}, { get: () => async () => ({ count: 0 }) })
        },
      })
      tx.depth++
      try {
        return await (arg as (c: unknown) => Promise<unknown>)(recorded)
      } finally {
        tx.depth--
      }
    })
  }
  return { prisma: { ...copy, $transaction, $world: world } }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const OWEN = 'user_owen'
const MIA = 'user_mia'
const BEA = 'user_bea'
const BOB = 'user_bob'
const AAA = 'user_aaa'
const CARL = 'user_carl'
const VIC = 'user_vic'
const NOA = 'user_noa'
const PAM = 'user_pam'
const YUKI = 'user_yuki'

const LOC_K = 'loc_kitchen'
const LOC_G = 'loc_garage'
const LOC_Z = 'loc_z'

const T0 = new Date('2026-01-01T00:00:00.000Z')

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

function seed() {
  world.reset()
  world.stock.reset([loc(LOC_K, 'hh_h', 0), loc(LOC_G, 'hh_h', 1), loc(LOC_Z, 'hh_x', 0)], [])
  world.seedHouseholds({
    households: [householdRow('hh_h', OWEN), householdRow('hh_x', YUKI)],
    householdMembers: [
      householdMemberRow('hh_h', OWEN, 'owner'),
      householdMemberRow('hh_h', MIA, 'manager'),
      householdMemberRow('hh_h', BEA, 'member'),
      householdMemberRow('hh_h', BOB, 'member'),
      householdMemberRow('hh_h', AAA, 'member'),
      householdMemberRow('hh_h', CARL, 'member'),
      householdMemberRow('hh_h', VIC, 'member'),
      householdMemberRow('hh_h', NOA, 'member'),
      householdMemberRow('hh_x', YUKI, 'owner'),
      householdMemberRow('hh_x', MIA, 'member'),
      householdMemberRow('hh_x', BEA, 'member'),
      householdMemberRow('hh_x', PAM, 'member'),
    ],
    // Store order on purpose: not the order the answer must have.
    locationMembers: [
      locationMemberRow(LOC_K, VIC, 'viewer'),
      locationMemberRow(LOC_K, BOB, 'participant'),
      locationMemberRow(LOC_K, PAM, 'participant'),
      locationMemberRow(LOC_K, CARL, 'participant'),
      locationMemberRow(LOC_K, AAA, 'participant'),
      locationMemberRow(LOC_K, BEA, 'organizer'),
      locationMemberRow(LOC_G, NOA, 'organizer'),
      locationMemberRow(LOC_Z, YUKI, 'organizer'),
      locationMemberRow(LOC_Z, MIA, 'viewer'),
      locationMemberRow(LOC_Z, BEA, 'viewer'),
    ],
  })
  world.users.reset([
    user(OWEN, 'Owen', 'hh_h'),
    user(MIA, 'Mia', 'hh_h'),
    user(BEA, 'Bea', 'hh_h'),
    user(BOB, 'Bob', 'hh_h'),
    user(AAA, 'Bob', 'hh_h'),
    user(CARL, 'Al', 'hh_h'),
    user(VIC, 'Vic', 'hh_h'),
    user(NOA, 'Noa', 'hh_h'),
    user(PAM, 'Pam', 'hh_x'),
    user(YUKI, 'Yuki', 'hh_x'),
  ])
}

/** Every event on the bus, with the transaction depth when it was published. */
let seen: { event: ChangeEvent; depth: number }[] = []
let unsubscribe: () => void = () => undefined

beforeEach(() => {
  seed()
  seen = []
  unsubscribe = liveEvents.subscribe((event) => {
    seen.push({ event, depth: tx.depth })
  })
})

afterEach(() => {
  unsubscribe()
  vi.restoreAllMocks()
  // No resolver here may reach a model the world does not have.
  const unknown = [...tx.unknownTouched]
  tx.touched.clear()
  tx.unknownTouched.clear()
  expect(unknown).toEqual([])
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
): Promise<Result> {
  // A fresh `requestCache` per request, as `index.ts` gives one.
  const contextValue: Context = { userId, clientId: 'tab-1', language: 'en', requestCache: {} }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult as Result
}

const PEOPLE = `query P($locationId: ID!) { locationPeople(locationId: $locationId) { userId displayName role isMe } }`
const MEMBERS = `query { householdMembers { userId hasLocationRole } }`

const people = (actor: string, locationId: string) => run(PEOPLE, { locationId }, actor)

function code(res: Result) {
  return res.errors?.[0]?.extensions?.code
}

type Person = { userId: string; displayName: string; role: string; isMe: boolean }

function list(res: Result): Person[] {
  if (res.errors) throw new Error(`unexpected errors: ${JSON.stringify(res.errors)}`)
  return (res.data?.locationPeople ?? []) as Person[]
}

/** The people of LOC_K, in the order T39 asks for, as `userId:role`. */
const LOC_K_PEOPLE = [
  `${BEA}:organizer`,
  `${CARL}:participant`,
  `${AAA}:participant`,
  `${BOB}:participant`,
  `${VIC}:viewer`,
]

function short(rows: Person[]) {
  return rows.map((p) => `${p.userId}:${p.role}`)
}

// ─── locationPeople ──────────────────────────────────────────────────────────

describe('locationPeople (households H5c, decision T39, owner decision O24-A)', () => {
  it('user sees everyone with a role on the location, organizer first', async () => {
    // Given LOC_K with one organizer, three participants and one viewer
    // When its organizer, BEA, reads its people
    const rows = list(await people(BEA, LOC_K))

    // Then every counted role row is listed: by role, then by name, then by id
    expect(short(rows)).toEqual(LOC_K_PEOPLE)
    // And the names are the stored display names
    expect(rows.map((p) => p.displayName)).toEqual(['Bea', 'Al', 'Bob', 'Bob', 'Vic'])
    // And only BEA's own row is marked as hers
    expect(rows.filter((p) => p.isMe).map((p) => p.userId)).toEqual([BEA])
  })

  it('location participant may read the people of the location', async () => {
    // Given BOB, a participant on LOC_K
    // When BOB reads its people
    const rows = list(await people(BOB, LOC_K))

    // Then BOB gets the same list, with his own row marked
    expect(short(rows)).toEqual(LOC_K_PEOPLE)
    expect(rows.filter((p) => p.isMe).map((p) => p.userId)).toEqual([BOB])
  })

  it('location viewer may read the people of the location', async () => {
    // Given VIC, a viewer on LOC_K
    // When VIC reads its people
    const rows = list(await people(VIC, LOC_K))

    // Then VIC gets the list
    expect(short(rows)).toEqual(LOC_K_PEOPLE)
  })

  it('household owner with No access on the location gets the list', async () => {
    // Given OWEN, the household owner, with no role on LOC_K
    // When OWEN reads its people
    const rows = list(await people(OWEN, LOC_K))

    // Then OWEN gets the list, and is not on it
    expect(short(rows)).toEqual(LOC_K_PEOPLE)
    expect(rows.some((p) => p.isMe)).toBe(false)
  })

  it('household manager with No access on the location gets the list', async () => {
    // Given MIA, a household manager, with no role on LOC_K
    // When MIA reads its people
    const rows = list(await people(MIA, LOC_K))

    // Then MIA gets the list
    expect(short(rows)).toEqual(LOC_K_PEOPLE)
  })

  it('household member with no role on the location is FORBIDDEN', async () => {
    // Given NOA, a household member who organizes LOC_G but has no role on LOC_K
    // When NOA reads LOC_K's people
    const res = await people(NOA, LOC_K)

    // Then it is refused
    expect(code(res)).toBe('FORBIDDEN')
    expect(res.data).toBeNull()
    // And NOA may read LOC_G, where NOA has a role (a negative control)
    expect(short(list(await people(NOA, LOC_G)))).toEqual([`${NOA}:organizer`])
  })

  it('a leftover role row of a person removed from the household is not listed', async () => {
    // Given PAM's participant row on LOC_K, while PAM is a member of hh_x only
    expect(
      world.households.state.locationMembers.some(
        (m) => m.locationId === LOC_K && m.userId === PAM,
      ),
    ).toBe(true)

    // When the owner reads LOC_K's people
    const rows = list(await people(OWEN, LOC_K))

    // Then PAM is not on the list (decision H18)
    expect(rows.map((p) => p.userId)).not.toContain(PAM)
    expect(short(rows)).toEqual(LOC_K_PEOPLE)
  })

  it('another household\'s location is FORBIDDEN, even with a role there', async () => {
    // Given BEA acts in hh_h and is a viewer on LOC_Z, a location of hh_x
    // When BEA reads LOC_Z's people
    const res = await people(BEA, LOC_Z)

    // Then it is refused: the page lists the active household only (T35)
    expect(code(res)).toBe('FORBIDDEN')
    expect(res.data).toBeNull()
  })

  it('another household\'s location is FORBIDDEN for the household owner', async () => {
    // Given OWEN, the owner of hh_h
    // When OWEN reads LOC_Z's people, a location of hh_x
    const res = await people(OWEN, LOC_Z)

    // Then it is refused
    expect(code(res)).toBe('FORBIDDEN')
  })

  it('an unknown location id gets the same FORBIDDEN as another household\'s', async () => {
    // Given no location with this id
    // When the owner reads its people
    const unknown = await people(OWEN, 'loc_nope')
    const other = await people(OWEN, LOC_Z)

    // Then both answers are the same refusal
    expect(code(unknown)).toBe('FORBIDDEN')
    expect(unknown.errors?.[0]?.message).toBe(other.errors?.[0]?.message)
  })

  it('a person of the other household cannot read this household\'s location', async () => {
    // Given YUKI, the owner of hh_x
    // When YUKI reads LOC_K's people
    const res = await people(YUKI, LOC_K)

    // Then it is refused
    expect(code(res)).toBe('FORBIDDEN')
  })

  it('LocationPerson has no e-mail field at all', async () => {
    const res = await run(`query { __type(name: "LocationPerson") { fields { name } } }`, {}, BEA)
    const type = res.data?.__type as { fields: { name: string }[] } | null
    expect(type?.fields.map((f) => f.name).sort()).toEqual(
      ['displayName', 'isMe', 'role', 'userId'].sort(),
    )
  })

  it('reads the names with a select of id and displayName only, never the e-mail', async () => {
    // Given a spy on the name read
    const spy = vi.spyOn(prisma.user, 'findMany')

    // When the owner reads LOC_K's people
    list(await people(OWEN, LOC_K))

    // Then every user read selects the id and the display name, and nothing else
    expect(spy).toHaveBeenCalled()
    for (const [args] of spy.mock.calls) {
      expect((args as { select?: unknown }).select).toEqual({ id: true, displayName: true })
    }
  })
})

// ─── HouseholdPerson.hasLocationRole ────────────────────────────────────────

// ─── a deleted account (households H6b, task K.2, decision T61) ─────────────
//
// The pre-H6 shape (Y8 of the H6 plan): the account is deleted
// (`User.deletedAt` set), and the person's member row and role rows are
// still there. Each test deletes ONE person and keeps a live person beside
// them with the same role, so a filter that drops everyone, or no one, gives
// a different answer.

function markAccountDeleted(userId: string) {
  const row = world.users.state.rows.find((r) => r.id === userId)
  if (!row) throw new Error(`no User row for ${userId}`)
  row.deletedAt = T0
}

const LOCATIONS = `query { householdLocations { id hasOrganizer } }`

describe('a deleted account does not count (households H6b, task K.2, decision T61)', () => {
  it('user does not see a deleted account among the people of a location', async () => {
    // Given BOB deleted their account. AAA, also "Bob" and a participant, did not.
    markAccountDeleted(BOB)

    // When the organizer reads LOC_K's people
    const rows = list(await people(BEA, LOC_K))

    // Then BOB is left out, and everyone else is still listed in order
    expect(short(rows)).toEqual(LOC_K_PEOPLE.filter((p) => !p.startsWith(`${BOB}:`)))
    // And BOB's role row is still in the store: the read leaves it out
    expect(
      world.households.state.locationMembers.some((m) => m.locationId === LOC_K && m.userId === BOB),
    ).toBe(true)
  })

  it('user does not see a deleted account on the members list', async () => {
    // Given VIC deleted their account
    markAccountDeleted(VIC)

    // When the owner reads the household's members
    const res = await run(MEMBERS, {}, OWEN)
    if (res.errors) throw new Error(JSON.stringify(res.errors))
    const ids = (res.data?.householdMembers as { userId: string }[]).map((m) => m.userId)

    // Then VIC is left out, and the seven live members are listed
    expect(ids).not.toContain(VIC)
    expect([...ids].sort()).toEqual([OWEN, MIA, BEA, BOB, AAA, CARL, NOA].sort())
  })

  it('a location whose only organizer deleted their account shows No organizer', async () => {
    // Given BEA, the only organizer of LOC_K, deleted their account. NOA,
    // the organizer of LOC_G, did not.
    const before = await run(LOCATIONS, {}, OWEN)
    expect(before.data?.householdLocations).toEqual(
      expect.arrayContaining([
        { id: LOC_K, hasOrganizer: true },
        { id: LOC_G, hasOrganizer: true },
      ]),
    )
    markAccountDeleted(BEA)

    // When the owner reads the household's locations
    const res = await run(LOCATIONS, {}, OWEN)
    if (res.errors) throw new Error(JSON.stringify(res.errors))

    // Then LOC_K has no organizer, and LOC_G keeps NOA
    expect(res.data?.householdLocations).toEqual(
      expect.arrayContaining([
        { id: LOC_K, hasOrganizer: false },
        { id: LOC_G, hasOrganizer: true },
      ]),
    )
  })
})

describe('HouseholdPerson.hasLocationRole (households H5c, decision T40, owner decision O28-A)', () => {
  async function marks(actor: string) {
    const res = await run(MEMBERS, {}, actor)
    if (res.errors) throw new Error(`unexpected errors: ${JSON.stringify(res.errors)}`)
    const rows = res.data?.householdMembers as { userId: string; hasLocationRole: boolean }[]
    return Object.fromEntries(rows.map((r) => [r.userId, r.hasLocationRole]))
  }

  it('user sees which members have a location role in this household', async () => {
    // Given the fixture
    // When a household member reads the members list
    const byUser = await marks(VIC)

    // Then everyone with a role on a location of hh_h is marked
    expect(byUser).toEqual({
      [OWEN]: false,
      [MIA]: false,
      [BEA]: true,
      [BOB]: true,
      [AAA]: true,
      [CARL]: true,
      [VIC]: true,
      [NOA]: true,
    })
  })

  it('a person with location roles only in another household is false', async () => {
    // Given MIA, whose only location role is on LOC_Z in hh_x
    // When the owner reads the members list of hh_h
    const byUser = await marks(OWEN)

    // Then MIA is not marked
    expect(byUser[MIA]).toBe(false)
    // And BEA, who has roles in both households, is
    expect(byUser[BEA]).toBe(true)
  })

  it('a person with no location role at all is false', async () => {
    // Given OWEN, who holds no location role
    // When a manager reads the members list
    const byUser = await marks(MIA)

    // Then OWEN is not marked
    expect(byUser[OWEN]).toBe(false)
  })

  it('reads location roles ONCE for the whole list', async () => {
    // Given a spy on every LocationMember read through the global client
    const spy = vi.spyOn(prisma.locationMember, 'findMany')
    const first = vi.spyOn(prisma.locationMember, 'findFirst')

    // When the owner reads a list of eight people
    await marks(OWEN)

    // Then one read covers all of them
    expect(spy).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })
})

// ─── setLocationRole, removeLocationRole, leaveLocation (task H.3) ─────────

const SET = `mutation S($locationId: ID!, $userId: ID!, $role: LocationRole!) { setLocationRole(locationId: $locationId, userId: $userId, role: $role) { userId displayName role isMe } }`
const REMOVE = `mutation R($locationId: ID!, $userId: ID!) { removeLocationRole(locationId: $locationId, userId: $userId) }`
const LEAVE = `mutation L($locationId: ID!) { leaveLocation(locationId: $locationId) }`
const REMOVE_MEMBER = `mutation M($userId: ID!) { removeMember(userId: $userId) }`
const HOUSEHOLD_LOCATIONS = `query { householdLocations { id hasOrganizer } }`

type Role = 'organizer' | 'participant' | 'viewer'

const setRole = (actor: string, locationId: string, userId: string, role: Role) =>
  run(SET, { locationId, userId, role }, actor)
const removeRole = (actor: string, locationId: string, userId: string) =>
  run(REMOVE, { locationId, userId }, actor)
const leave = (actor: string, locationId: string) => run(LEAVE, { locationId }, actor)
const removeMember = (actor: string, userId: string) => run(REMOVE_MEMBER, { userId }, actor)

/** Every stored role row, as `location:user:role`, sorted. */
function roleRows() {
  return world.households.state.locationMembers
    .map((m) => `${m.locationId}:${m.userId}:${m.role}`)
    .sort()
}

/** The stored role of one person on one location, or null. */
function storedRole(locationId: string, userId: string) {
  return (
    world.households.state.locationMembers.find(
      (m) => m.locationId === locationId && m.userId === userId,
    )?.role ?? null
  )
}

function ok(res: Result, field: string) {
  if (res.errors) throw new Error(`unexpected errors: ${JSON.stringify(res.errors)}`)
  return res.data?.[field]
}

/** The household-level LOCATION event the three writes send (decision T36). */
function locationEvent(householdId: string): ChangeEvent {
  return { kind: 'LOCATION', householdId, locationId: null, sourceClientId: 'tab-1' }
}

function events() {
  return seen.map((s) => s.event)
}

describe('setLocationRole: who may do what (task H.3, through the resolver)', () => {
  it('location organizer can give 搬運工 to a household member with no role there', async () => {
    // Given NOA, a household member with no role on LOC_K
    // When BEA, its organizer, gives NOA the participant role
    const res = await setRole(BEA, LOC_K, NOA, 'participant')

    // Then the answer is NOA's new row
    expect(ok(res, 'setLocationRole')).toEqual({
      userId: NOA,
      displayName: 'Noa',
      role: 'participant',
      isMe: false,
    })
    // And it is stored
    expect(storedRole(LOC_K, NOA)).toBe('participant')
  })

  it('location organizer can change a participant to a viewer', async () => {
    // Given BOB, a participant on LOC_K
    // When BEA makes BOB a viewer
    const res = await setRole(BEA, LOC_K, BOB, 'viewer')

    // Then the same row now says viewer: no second row
    expect(ok(res, 'setLocationRole')).toMatchObject({ userId: BOB, role: 'viewer' })
    expect(roleRows().filter((r) => r.startsWith(`${LOC_K}:${BOB}:`))).toEqual([
      `${LOC_K}:${BOB}:viewer`,
    ])
  })

  it('location organizer cannot give the 據點王 role', async () => {
    // Given VIC, a viewer on LOC_K
    const before = roleRows()

    // When BEA, an organizer who is a household member, tries to make VIC an organizer
    const res = await setRole(BEA, LOC_K, VIC, 'organizer')

    // Then it is refused and nothing changes
    expect(code(res)).toBe('FORBIDDEN')
    expect(roleRows()).toEqual(before)
  })

  it('location organizer cannot change another organizer', async () => {
    // Given NOA made a second organizer of LOC_K by the owner
    ok(await setRole(OWEN, LOC_K, NOA, 'organizer'), 'setLocationRole')
    const before = roleRows()

    // When BEA tries to make NOA a viewer
    const res = await setRole(BEA, LOC_K, NOA, 'viewer')

    // Then it is refused
    expect(code(res)).toBe('FORBIDDEN')
    expect(roleRows()).toEqual(before)
  })

  it('location organizer cannot change their own organizer row (they use Leave)', async () => {
    const res = await setRole(BEA, LOC_K, BEA, 'participant')
    expect(code(res)).toBe('FORBIDDEN')
    expect(storedRole(LOC_K, BEA)).toBe('organizer')
  })

  it('location participant cannot give a role', async () => {
    // Given BOB, a participant on LOC_K, and VIC, a viewer there
    // When BOB tries to give NOA the viewer role
    const res = await setRole(BOB, LOC_K, NOA, 'viewer')

    // Then it is refused
    expect(code(res)).toBe('FORBIDDEN')
    expect(storedRole(LOC_K, NOA)).toBeNull()
  })

  it('location viewer cannot change a role', async () => {
    const res = await setRole(VIC, LOC_K, BOB, 'viewer')
    expect(code(res)).toBe('FORBIDDEN')
    expect(storedRole(LOC_K, BOB)).toBe('participant')
  })

  it('household member with no role on the location cannot give a role there', async () => {
    // Given NOA, who organizes LOC_G but has no role on LOC_K
    // When NOA tries to make VIC a participant on LOC_K
    const res = await setRole(NOA, LOC_K, VIC, 'participant')

    // Then it is refused
    expect(code(res)).toBe('FORBIDDEN')
    expect(storedRole(LOC_K, VIC)).toBe('viewer')
  })

  it('household owner with No access can give the 據點王 role', async () => {
    // Given OWEN, the owner, with no role on LOC_K
    // When OWEN makes VIC an organizer
    const res = await setRole(OWEN, LOC_K, VIC, 'organizer')

    // Then it is stored
    expect(ok(res, 'setLocationRole')).toMatchObject({ userId: VIC, role: 'organizer' })
    expect(storedRole(LOC_K, VIC)).toBe('organizer')
  })

  it('household manager with No access can give themselves 據點王, and is then listed', async () => {
    // Given MIA, a household manager with no role on LOC_K
    // When MIA gives herself the organizer role
    const res = await setRole(MIA, LOC_K, MIA, 'organizer')

    // Then the answer is her own row
    expect(ok(res, 'setLocationRole')).toEqual({
      userId: MIA,
      displayName: 'Mia',
      role: 'organizer',
      isMe: true,
    })
    // And locationPeople lists her as an organizer
    const rows = list(await people(MIA, LOC_K))
    expect(short(rows)).toContain(`${MIA}:organizer`)
  })
})

describe('removeLocationRole: who may do what (task H.3)', () => {
  it('location organizer can remove a participant', async () => {
    const res = await removeRole(BEA, LOC_K, BOB)
    expect(ok(res, 'removeLocationRole')).toBe(true)
    expect(storedRole(LOC_K, BOB)).toBeNull()
    // Only BOB's row on LOC_K is gone
    expect(storedRole(LOC_K, AAA)).toBe('participant')
  })

  it('location organizer cannot remove another organizer', async () => {
    // Given NOA made a second organizer of LOC_K by the owner
    ok(await setRole(OWEN, LOC_K, NOA, 'organizer'), 'setLocationRole')

    // When BEA tries to remove NOA
    const res = await removeRole(BEA, LOC_K, NOA)

    // Then it is refused, and NOA keeps the role
    expect(code(res)).toBe('FORBIDDEN')
    expect(storedRole(LOC_K, NOA)).toBe('organizer')
  })

  it('location organizer can remove the household owner’s 搬運工 role (O30-A)', async () => {
    // Given OWEN, the owner, gave himself the participant role on LOC_K
    ok(await setRole(OWEN, LOC_K, OWEN, 'participant'), 'setLocationRole')

    // When BEA, an organizer who is a household member, removes it
    const res = await removeRole(BEA, LOC_K, OWEN)

    // Then it is removed: the location rule looks at location roles only
    expect(ok(res, 'removeLocationRole')).toBe(true)
    expect(storedRole(LOC_K, OWEN)).toBeNull()
  })

  it('location participant cannot remove anyone', async () => {
    const res = await removeRole(BOB, LOC_K, VIC)
    expect(code(res)).toBe('FORBIDDEN')
    expect(storedRole(LOC_K, VIC)).toBe('viewer')
  })

  it('household manager with No access can remove the organizer', async () => {
    const res = await removeRole(MIA, LOC_K, BEA)
    expect(ok(res, 'removeLocationRole')).toBe(true)
    expect(storedRole(LOC_K, BEA)).toBeNull()
  })

  it('a person with no row gets false, not an error (a second press, T38)', async () => {
    // Given NOA has no role on LOC_K
    // When the owner removes NOA from LOC_K
    const res = await removeRole(OWEN, LOC_K, NOA)

    // Then the answer is false, and nothing is sent
    expect(ok(res, 'removeLocationRole')).toBe(false)
    expect(seen).toEqual([])
  })

  it('location organizer who is a household member gets false for a person with no row (a second press)', async () => {
    // Given NOA has no role on LOC_K, and BEA organizes LOC_K as a household member
    // When BEA removes NOA from LOC_K (for example a second press of Remove)
    const res = await removeRole(BEA, LOC_K, NOA)

    // Then the answer is false, not an error, and nothing is sent
    expect(ok(res, 'removeLocationRole')).toBe(false)
    expect(seen).toEqual([])
  })

  it('a caller who may not read the people gets FORBIDDEN for a person with no row', async () => {
    // Given NOA, a household member with no role on LOC_K, so no right to see who is there
    // When NOA asks to remove OWEN, who has no row on LOC_K
    const res = await removeRole(NOA, LOC_K, OWEN)

    // Then it is refused: a false would tell NOA that OWEN has no role there
    expect(code(res)).toBe('FORBIDDEN')
  })

  it('removing a role leaves the location’s carts, cart rows, stock and logs (T42)', async () => {
    // Given BOB's stock row, log, cart and "added by" cart row at LOC_K
    const stockRow = {
      id: 'stock_k',
      itemId: 'item_milk',
      locationId: LOC_K,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      dueDate: null,
      createdAt: T0,
      updatedAt: T0,
    }
    world.stock.state.itemStocks = [stockRow]
    const log = { id: 'log_k', locationId: LOC_K, userId: BOB }
    const cart = { id: `${LOC_K}:vendor_a`, locationId: LOC_K }
    const cartItem = { id: 'ci_k', cartId: cart.id, userId: BOB, itemId: 'item_milk' }
    world.contents.rows.inventoryLogs.push(log)
    world.contents.rows.carts.push(cart)
    world.contents.rows.cartItems.push(cartItem)
    const before = JSON.stringify({ stock: world.stock.state.itemStocks, rows: world.contents.rows })
    tx.touched.clear()

    // When the organizer removes BOB from LOC_K
    const res = await removeRole(BEA, LOC_K, BOB)

    // Then the transaction reached only the household, location and role
    // models, and the household activity log (households H6 task J.2): no
    // cart, cart row, stock row or inventory log model at all
    const touched = [...tx.touched].sort()
    tx.unknownTouched.clear()
    expect(touched).toEqual([
      'household',
      'householdActivity',
      'householdMember',
      'location',
      'locationMember',
    ])
    expect(ok(res, 'removeLocationRole')).toBe(true)
    // And only BOB's role row is gone
    expect(storedRole(LOC_K, BOB)).toBeNull()
    expect(JSON.stringify({ stock: world.stock.state.itemStocks, rows: world.contents.rows })).toBe(
      before,
    )
  })
})

describe('leaveLocation (task H.3, owner decision O25-A)', () => {
  it('location viewer can leave', async () => {
    const res = await leave(VIC, LOC_K)
    expect(ok(res, 'leaveLocation')).toBe(true)
    expect(storedRole(LOC_K, VIC)).toBeNull()
    // Only VIC's own row went
    expect(storedRole(LOC_K, BOB)).toBe('participant')
  })

  it('the only organizer can leave, and the location then has no organizer', async () => {
    // Given BEA, the only organizer of LOC_K
    // When BEA leaves
    const res = await leave(BEA, LOC_K)

    // Then it works
    expect(ok(res, 'leaveLocation')).toBe(true)
    expect(storedRole(LOC_K, BEA)).toBeNull()
    // And the owner's list says LOC_K has no organizer, while LOC_G still has one
    const locations = ok(await run(HOUSEHOLD_LOCATIONS, {}, OWEN), 'householdLocations') as {
      id: string
      hasOrganizer: boolean
    }[]
    expect(Object.fromEntries(locations.map((l) => [l.id, l.hasOrganizer]))).toEqual({
      [LOC_K]: false,
      [LOC_G]: true,
    })
  })

  it('leaving with no role gets false, not an error (a second press, T38)', async () => {
    const res = await leave(NOA, LOC_K)
    expect(ok(res, 'leaveLocation')).toBe(false)
    expect(seen).toEqual([])
  })

  it('leaving a location of the other household is FORBIDDEN, and the role stays (T35)', async () => {
    // Given BEA acts in hh_h and is a viewer on LOC_Z, a location of hh_x
    // When BEA leaves LOC_Z
    const res = await leave(BEA, LOC_Z)

    // Then it is refused: only the active household's locations
    expect(code(res)).toBe('FORBIDDEN')
    expect(storedRole(LOC_Z, BEA)).toBe('viewer')
  })
})

describe('the target must be a member of the household (decision H18)', () => {
  it('a target removed from the household is FORBIDDEN, and their leftover row stays as it was', async () => {
    // Given PAM, no longer in hh_h, with a leftover participant row on LOC_K
    const before = roleRows()

    // When the owner gives PAM a role on LOC_K, or removes it
    const set = await setRole(OWEN, LOC_K, PAM, 'viewer')
    const remove = await removeRole(OWEN, LOC_K, PAM)

    // Then both are refused, and no row is written
    expect(code(set)).toBe('FORBIDDEN')
    expect(code(remove)).toBe('FORBIDDEN')
    expect(roleRows()).toEqual(before)
  })

  it('a target in the other household only is FORBIDDEN, and no row is written', async () => {
    const before = roleRows()
    const res = await setRole(OWEN, LOC_K, YUKI, 'viewer')
    expect(code(res)).toBe('FORBIDDEN')
    expect(roleRows()).toEqual(before)
  })
})

describe('only a location of the household the caller acts in (decision T35)', () => {
  it('a manager acting in their other household cannot change a role here', async () => {
    // Given MIA, a manager of hh_h and a member of hh_x
    // When MIA acts in hh_h, she can make VIC a participant on LOC_K (a control)
    ok(await setRole(MIA, LOC_K, VIC, 'participant'), 'setLocationRole')

    // When MIA acts in hh_x and tries to make VIC a viewer again
    world.setActiveHousehold(MIA, 'hh_x')
    const res = await setRole(MIA, LOC_K, VIC, 'viewer')

    // Then it is refused, and VIC keeps the participant role
    expect(code(res)).toBe('FORBIDDEN')
    expect(storedRole(LOC_K, VIC)).toBe('participant')
  })

  it('another household’s location, and an unknown id, get the same FORBIDDEN', async () => {
    const before = roleRows()
    const other = await setRole(OWEN, LOC_Z, BEA, 'participant')
    const unknown = await setRole(OWEN, 'loc_nope', BEA, 'participant')
    const removed = await removeRole(OWEN, LOC_Z, BEA)
    expect(code(other)).toBe('FORBIDDEN')
    expect(code(unknown)).toBe('FORBIDDEN')
    expect(code(removed)).toBe('FORBIDDEN')
    expect(unknown.errors?.[0]?.message).toBe(other.errors?.[0]?.message)
    expect(roleRows()).toEqual(before)
  })
})

describe('the same role again, and nothing to remove (decision T38)', () => {
  it('the same role again writes nothing, sends nothing, and returns the row', async () => {
    // Given BOB, a participant on LOC_K, and spies on every role write
    const upsert = vi.spyOn(world.client.locationMember, 'upsert')
    const create = vi.spyOn(world.client.locationMember, 'create')
    const update = vi.spyOn(world.client.locationMember, 'update')

    // When BEA gives BOB the participant role again
    const res = await setRole(BEA, LOC_K, BOB, 'participant')

    // Then the answer is BOB's row, unchanged
    expect(ok(res, 'setLocationRole')).toEqual({
      userId: BOB,
      displayName: 'Bob',
      role: 'participant',
      isMe: false,
    })
    // And nothing was written or sent
    expect(upsert).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(seen).toEqual([])
  })
})

describe('the three writes lock the household first and read through tx (decision T34)', () => {
  /** Record the lock and every read the checks make, in call order, through tx. */
  function recordOrder() {
    const order: string[] = []
    const updateMany = world.client.household.updateMany
    vi.spyOn(world.client.household, 'updateMany').mockImplementation(async (args) => {
      order.push(`lock:${String((args.where as { id?: unknown } | undefined)?.id)}`)
      return updateMany(args)
    })
    const reads = [
      [world.client.location, 'findFirst'],
      [world.client.householdMember, 'findUnique'],
      [world.client.locationMember, 'findFirst'],
      [world.client.locationMember, 'findUnique'],
      [world.client.locationMember, 'findMany'],
    ] as const
    for (const [model, method] of reads) {
      const target = model as unknown as Record<string, (...args: unknown[]) => unknown>
      const real = target[method] as (...args: unknown[]) => unknown
      vi.spyOn(target, method).mockImplementation(async (...args: unknown[]) => {
        order.push('read')
        return real(...args)
      })
    }
    return order
  }

  const writes = [
    ['setLocationRole', () => setRole(BEA, LOC_K, NOA, 'participant')],
    ['removeLocationRole', () => removeRole(BEA, LOC_K, BOB)],
    ['leaveLocation', () => leave(VIC, LOC_K)],
  ] as const

  it.each(writes)('%s: the lock comes before every role read', async (_name, act) => {
    const order = recordOrder()
    const res = await act()
    expect(res.errors).toBeUndefined()
    expect(order[0]).toBe('lock:hh_h')
    expect(order.filter((x) => x.startsWith('lock:'))).toEqual(['lock:hh_h'])
    // The checks really read something after the lock
    expect(order.filter((x) => x === 'read').length).toBeGreaterThanOrEqual(3)
  })

  it.each(writes)(
    '%s: nothing is read through the global client while the transaction runs',
    async (_name, act) => {
      // The global client is a second pool connection on Postgres. Inside the
      // transaction every read must use `tx` (the H5b G.5 trap).
      const globalReads: string[] = []
      const models = ['location', 'householdMember', 'locationMember', 'household', 'user'] as const
      for (const model of models) {
        const client = prisma[model] as unknown as Record<string, unknown>
        for (const method of ['findFirst', 'findUnique', 'findMany', 'count']) {
          if (typeof client[method] !== 'function') continue
          const real = (client[method] as (...a: unknown[]) => unknown).bind(client)
          vi.spyOn(client as Record<string, (...a: unknown[]) => unknown>, method).mockImplementation(
            async (...args: unknown[]) => {
              if (tx.depth > 0) globalReads.push(`${model}.${method}`)
              return real(...args)
            },
          )
        }
      }
      const res = await act()
      expect(res.errors).toBeUndefined()
      expect(globalReads).toEqual([])
    },
  )

  it.each(writes)(
    '%s: a household deleted after it was looked up gives FORBIDDEN, not an internal error',
    async (_name, act) => {
      // Given hh_h is deleted between `requireHousehold` and the lock
      const updateMany = world.client.household.updateMany
      vi.spyOn(world.client.household, 'updateMany').mockImplementation(async (args) => {
        if ((args.where as { id?: unknown } | undefined)?.id === 'hh_h') return { count: 0 }
        return updateMany(args)
      })
      const before = roleRows()

      const res = await act()

      expect(code(res)).toBe('FORBIDDEN')
      expect(roleRows()).toEqual(before)
      expect(seen).toEqual([])
    },
  )
})

describe('a role given while the person is removed from the household (Review Focus 3)', () => {
  // `serialTransactions(true)` runs the transactions one after the other.
  // That is what the household lock does on Postgres, because BOTH writes
  // take it first. The queue does it here with or without the lock, so these
  // two tests prove only that each order ends with no role row. The ORDER
  // tests above ("the lock comes before every role read", and "nothing is
  // read through the global client") are what prove that the role write
  // takes the lock and then reads the membership inside it.

  /**
   * Start `first`, wait until its transaction has taken the household lock,
   * then start `second`. With the queue on, `second`'s transaction can then
   * only run after `first`'s has committed. Returns both answers, and which
   * of the two took the lock in which order.
   */
  async function oneWhileTheOtherHoldsTheLock(
    first: () => Promise<Result>,
    second: () => Promise<Result>,
  ) {
    world.serialTransactions(true)
    const locks: number[] = []
    let current = 1
    let lockTaken: () => void = () => undefined
    const firstLock = new Promise<void>((resolve) => {
      lockTaken = resolve
    })
    const updateMany = world.client.household.updateMany
    vi.spyOn(world.client.household, 'updateMany').mockImplementation(async (args) => {
      locks.push(current)
      lockTaken()
      return updateMany(args)
    })
    const a = first()
    await firstLock
    current = 2
    const b = second()
    const results = await Promise.all([a, b])
    return { results, locks }
  }

  it('removal first: the role write sees B is not a member and is refused', async () => {
    // Given BOB, a member of hh_h with a participant role on LOC_K
    // When the owner removes BOB, and while the removal holds the lock the
    // organizer makes BOB a viewer
    const {
      results: [removed, set],
      locks,
    } = await oneWhileTheOtherHoldsTheLock(
      () => removeMember(OWEN, BOB),
      () => setRole(BEA, LOC_K, BOB, 'viewer'),
    )

    // Then the removal took the lock first
    expect(locks).toEqual([1, 2])
    // And the removal worked, the role write was refused, and BOB has no role row
    expect(ok(removed, 'removeMember')).toBe(true)
    expect(code(set)).toBe('FORBIDDEN')
    expect(world.households.state.locationMembers.filter((m) => m.userId === BOB)).toEqual([])
    // And only the removal sent an event
    expect(events()).toEqual([locationEvent('hh_h')])
  })

  it('role write first: the removal then deletes the new row (T11)', async () => {
    // Given NOA, a member of hh_h with no role on LOC_K
    // When the organizer gives NOA a role, and while that write holds the
    // lock the owner removes NOA
    const {
      results: [set, removed],
      locks,
    } = await oneWhileTheOtherHoldsTheLock(
      () => setRole(BEA, LOC_K, NOA, 'participant'),
      () => removeMember(OWEN, NOA),
    )

    // Then both worked, in that order, and NOA has no role row left in hh_h
    expect(locks).toEqual([1, 2])
    expect(ok(set, 'setLocationRole')).toMatchObject({ userId: NOA, role: 'participant' })
    expect(ok(removed, 'removeMember')).toBe(true)
    expect(world.households.state.locationMembers.filter((m) => m.userId === NOA)).toEqual([])
  })
})

describe('the three writes publish household-level LOCATION (decision T36)', () => {
  it('setLocationRole: once, for the household, after the commit', async () => {
    ok(await setRole(BEA, LOC_K, NOA, 'participant'), 'setLocationRole')
    expect(events()).toEqual([locationEvent('hh_h')])
    expect(seen.map((s) => s.depth)).toEqual([0])
  })

  it('removeLocationRole: once, for the household, after the commit', async () => {
    ok(await removeRole(BEA, LOC_K, BOB), 'removeLocationRole')
    expect(events()).toEqual([locationEvent('hh_h')])
    expect(seen.map((s) => s.depth)).toEqual([0])
  })

  it('leaveLocation: once, for the household, after the commit', async () => {
    ok(await leave(VIC, LOC_K), 'leaveLocation')
    expect(events()).toEqual([locationEvent('hh_h')])
    expect(seen.map((s) => s.depth)).toEqual([0])
  })

  it('a refusal publishes nothing', async () => {
    await setRole(BEA, LOC_K, VIC, 'organizer')
    await setRole(BOB, LOC_K, NOA, 'viewer')
    await setRole(OWEN, LOC_K, PAM, 'viewer')
    await removeRole(BOB, LOC_K, VIC)
    await removeRole(OWEN, LOC_Z, BEA)
    await leave(BEA, LOC_Z)
    expect(seen).toEqual([])
  })
})
