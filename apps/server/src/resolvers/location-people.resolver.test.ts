import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { FakeLocation } from '../test/stockFake.js'
import type { UserRow } from '../test/userFake.js'

// The people of one location (households H5c, task H.2; plan
// docs/global/permissions/2026-11-19-households-plan-h5c.md, decisions T39
// and T40, owner decisions O24-A and O28-A): the `locationPeople` query and
// `HouseholdPerson.hasLocationRole`.
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
  return { prisma: { ...copy, $world: world } }
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

beforeEach(() => {
  seed()
})

afterEach(() => {
  vi.restoreAllMocks()
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
