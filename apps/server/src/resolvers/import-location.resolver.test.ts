import { ApolloServer } from '@apollo/server'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── Why this file is separate from import.resolver.test.ts ──────────────────
//
// `import.resolver.test.ts` mocks every Prisma model as a plain `vi.fn()` call
// recorder, which answers "yes, that location is yours" for ANY id, a
// stranger's included. An ownership check written against that file's stubs
// therefore cannot fail, and a recorder cannot show which columns were
// stored. Root CLAUDE.md, "Write test doubles to model the constraint, not
// the happy path". `vi.mock` is per FILE, so the stateful fake cannot be mixed
// into that file without rewriting its existing tests. Tasks 3 and 4 each
// wrote their own file for the same reason; this is the third.
//
// `src/test/householdWorld.ts` is the whole mock here: `location` (its
// `stockFake`), and the `Household`, `HouseholdMember`, `LocationMember` and
// `User` rows, under one `$transaction`. Five things about it carry these
// tests:
//
//   - every `where` is checked ONCE by `checkWhere` (src/test/whereKeys.ts),
//     then applied key by key, so an unknown key throws and a dropped filter
//     returns MORE rows.
//   - `location.create` HONOURS `data.id`, so "the payload's ids are
//     preserved" is an assertion that can fail, and keeps `householdId`.
//   - `location.create` enforces `Location.id`'s primary key with P2002, and
//     refuses a `userId` or an `isDefault` (columns dropped in households H3a
//     task 3.14) and a missing `householdId`.
//   - `locationMember.create` checks the foreign key to the location, the
//     role enum and the composite primary key, with P2002.
//   - `$transaction` rolls back every store, so "the location is not left
//     without its organizer row" is an assertion that can fail.
//
// Every role is a row `beforeEach` seeds, or a row the resolver under test
// writes. Households H3a task 3.9 removed `derivedRoles`, which invented an
// `organizer` row for every location from its `userId`. With it, a resolver
// that wrote no role row for a location it imported still passed here.
vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  return {
    prisma: {
      ...world.client,
      location: {
        ...world.client.location,
        // Wrapped so a test can count HOW MANY authorization checks ran, on
        // top of the fake's real row matching.
        findUnique: vi.fn(world.client.location.findUnique),
        findFirst: vi.fn(world.client.location.findFirst),
      },
      // A handle onto the fake, hung off the mocked client because a `vi.mock`
      // factory is hoisted above every import and cannot close over a
      // module-scope binding.
      $world: world,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'

const mockPrisma = prisma as unknown as { $world: HouseholdWorld }
const world = mockPrisma.$world

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
// Three people in two households (plan H3a, rule 10):
//
// | Person   | Household  | Household role | Location roles                                    |
// |----------|------------|----------------|---------------------------------------------------|
// | USER     | hh_user    | owner          | LOC_DEFAULT, LOC_OTHER: organizer; LOC_SHARED: participant |
// | MEMBER   | hh_user    | member         | LOC_SHARED, LOC_HIDDEN: organizer                 |
// | STRANGER | hh_stranger| owner          | LOC_STRANGER: organizer                           |
//
// USER also has a STALE `LocationMember` row on LOC_STRANGER, with no
// `HouseholdMember` row in hh_stranger (what H5 leaves behind when a person is
// removed from a household). It must not count (decision H18).
//
// The default is one of USER's locations. A fixture where the caller had no
// default could not tell "the import left my default alone" from "there was
// nothing to leave alone". LOC_HIDDEN is in USER's OWN household, and USER
// holds no role on it, so "in my household" and "a location I hold a role
// on" give different answers.

const USER = 'user_import_location_test'
const MEMBER = 'user_member'
const STRANGER = 'user_stranger'

const HH_USER = 'hh_user'
const HH_STRANGER = 'hh_stranger'

const LOC_DEFAULT = 'loc_kitchen' // USER's default — must survive untouched
const LOC_OTHER = 'loc_garage' // USER's, NOT default
const LOC_SHARED = 'loc_shared' // MEMBER organizes, USER is a participant
const LOC_HIDDEN = 'loc_hidden' // in hh_user, USER holds no role on it
const LOC_STRANGER = 'loc_theirs' // STRANGER's — must be refused

const TS = new Date('2026-01-01T00:00:00.000Z')
const PAYLOAD_CREATED = '2026-02-03T04:05:06.000Z'
const PAYLOAD_UPDATED = '2026-03-04T05:06:07.000Z'

beforeEach(() => {
  vi.clearAllMocks()
  world.stock.reset([
    { id: LOC_DEFAULT, householdId: HH_USER, name: 'Kitchen', order: 0, createdAt: TS, updatedAt: TS },
    { id: LOC_OTHER, householdId: HH_USER, name: 'Garage', order: 1, createdAt: TS, updatedAt: TS },
    { id: LOC_SHARED, householdId: HH_USER, name: 'Shared', order: 2, createdAt: TS, updatedAt: TS },
    { id: LOC_HIDDEN, householdId: HH_USER, name: 'Hidden', order: 3, createdAt: TS, updatedAt: TS },
    { id: LOC_STRANGER, householdId: HH_STRANGER, name: 'Theirs', order: 0, createdAt: TS, updatedAt: TS },
  ])
  world.seedHouseholds({
    households: [householdRow(HH_USER, USER), householdRow(HH_STRANGER, STRANGER)],
    householdMembers: [
      householdMemberRow(HH_USER, USER, 'owner'),
      householdMemberRow(HH_USER, MEMBER, 'member'),
      householdMemberRow(HH_STRANGER, STRANGER, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_DEFAULT, USER, 'organizer'),
      locationMemberRow(LOC_OTHER, USER, 'organizer'),
      locationMemberRow(LOC_SHARED, MEMBER, 'organizer'),
      locationMemberRow(LOC_SHARED, USER, 'participant'),
      locationMemberRow(LOC_HIDDEN, MEMBER, 'organizer'),
      locationMemberRow(LOC_STRANGER, STRANGER, 'organizer'),
      // STALE: USER is not a member of hh_stranger.
      locationMemberRow(LOC_STRANGER, USER, 'organizer'),
    ],
  })
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTEXT: Context = { userId: USER }

const FIELDS = '{ id name order createdAt updatedAt }'

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
  return world.stock.state.locations
}

function storedRow(id: string) {
  return stored().find((l) => l.id === id)
}

/** The role rows of one location, as `{ userId, role }`, sorted by user. */
function rolesOn(locationId: string) {
  return world.households.state.locationMembers
    .filter((m) => m.locationId === locationId)
    .map((m) => ({ userId: m.userId, role: m.role }))
    .sort((a, b) => a.userId.localeCompare(b.userId))
}

const locationFindUnique = (
  prisma as unknown as { location: { findUnique: ReturnType<typeof vi.fn> } }
).location.findUnique

// ─── Both mutations: what a CREATED location gets ────────────────────────────

for (const [label, query] of [
  ['bulkCreateLocations', BULK_CREATE],
  ['bulkUpsertLocations', BULK_UPSERT],
] as const) {
  describe(`${label}: a created location`, () => {
    it('user importing a location gets it in their own household', async () => {
      // Given an id no row holds
      // When the import runs
      const result = await exec(query, [input('loc_new')])

      // Then the row is in the caller's household. Without `householdId` it
      // belongs to no household, so no role on it can ever count (decision
      // H18) and nobody sees it. The fake refuses a `userId` or an
      // `isDefault` in the write (both columns were dropped in households H3a
      // task 3.14), so a resolver that still sent one fails here.
      expect(result.errors).toBeUndefined()
      expect(storedRow('loc_new')).toMatchObject({ householdId: HH_USER })
    })

    it('user importing a location becomes its organizer, and nobody else gets a role', async () => {
      // When the import runs
      const result = await exec(query, [input('loc_new')])

      // Then exactly one role row exists on it: the caller's, `organizer`.
      // Without it the location is missing from `locations`, the switcher and
      // a cloud export, and the stock imported next is refused.
      expect(result.errors).toBeUndefined()
      expect(rolesOn('loc_new')).toEqual([{ userId: USER, role: 'organizer' }])
    })

    it("user importing a location keeps the payload's order, even when it repeats one in the household", async () => {
      // Given a payload order of 1, which LOC_OTHER already has. A backup
      // carries the user's own order, and an import restores it rather than
      // counting `max + 1` the way `createLocation` does.
      const result = await exec(query, [input('loc_new', { order: 1 })])

      // Then the order is stored as given
      expect(result.errors).toBeUndefined()
      expect(storedRow('loc_new')?.order).toBe(1)
    })

    it('user importing a location never leaves it without its organizer row', async () => {
      // Given a role row that makes the organizer write fail with P2002.
      // A `LocationMember` row whose location does not exist cannot exist in
      // Postgres (the foreign key cascades); it is seeded here only as a way
      // to make the SECOND write of the transaction fail.
      world.households.state.locationMembers.push(locationMemberRow('loc_new', USER, 'viewer'))

      // When the import runs
      const result = await exec(query, [input('loc_new')])

      // Then the import fails, and the location write was rolled back with it
      expect(result.errors).toBeDefined()
      expect(storedRow('loc_new')).toBeUndefined()
    })
  })

  describe(`${label}: an id the caller may not use`, () => {
    it("user cannot import a location whose id belongs to another household", async () => {
      // When a payload names STRANGER's location id
      const result = await exec(query, [input(LOC_STRANGER, { name: 'Stolen', order: 42 })])

      // Then it is refused, the same as "not found". USER's STALE role row on
      // it does not count: USER is not a member of hh_stranger.
      expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
      expect(storedRow(LOC_STRANGER)).toMatchObject({
        householdId: HH_STRANGER,
        name: 'Theirs',
        order: 0,
      })
    })

    it('user cannot import over a location of their own household on which they hold no role', async () => {
      // When a payload names LOC_HIDDEN: in USER's own household, no role
      const result = await exec(query, [input(LOC_HIDDEN, { name: 'Taken', order: 42 })])

      // Then it is refused. An existing id is never "free to create" just
      // because it is in the caller's household.
      expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
      expect(storedRow(LOC_HIDDEN)).toMatchObject({ name: 'Hidden', order: 3 })
      expect(rolesOn(LOC_HIDDEN)).toEqual([{ userId: MEMBER, role: 'organizer' }])
    })

    it('user importing a batch with one forbidden location gets no rows written at all', async () => {
      // Given an allowed row AHEAD of the forbidden one. These bulk resolvers
      // are not transactional across rows, so a check inside the write loop
      // would leave the earlier row on disk.
      const result = await exec(query, [input('loc_allowed_first'), input(LOC_STRANGER)])

      // Then nothing was written, not even the row the caller was allowed
      expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
      expect(storedRow('loc_allowed_first')).toBeUndefined()
      expect(rolesOn('loc_allowed_first')).toEqual([])
      expect(stored()).toHaveLength(5)
    })

    it('returns [] for an empty payload without touching the database', async () => {
      const result = await exec(query, [])
      expect(result.errors).toBeUndefined()
      expect(result.data?.[label]).toEqual([])
      expect(locationFindUnique).not.toHaveBeenCalled()
    })
  })
}

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
      householdId: HH_USER,
    })
    expect(storedRow('loc_from_backup_b')).toMatchObject({
      name: 'Cellar',
      order: 4,
      householdId: HH_USER,
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
    expect(returned?.createdAt).toBe(PAYLOAD_CREATED)
    expect(returned?.updatedAt).toBe(PAYLOAD_UPDATED)
  })

  it('user re-importing a location they already have keeps the stored row and its roles unchanged', async () => {
    // Given the caller already organizes LOC_OTHER, named "Garage" at order 1
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
    // And the stored row is what comes back
    expect(result.data?.bulkCreateLocations).toEqual([
      expect.objectContaining({ id: LOC_OTHER, name: 'Garage' }),
    ])
    // And nothing was added, no role row either
    expect(stored()).toHaveLength(5)
    expect(rolesOn(LOC_OTHER)).toEqual([{ userId: USER, role: 'organizer' }])
  })

  it('user who is only a participant of a location can still name it in a "skip" import', async () => {
    // Given USER is a `participant` of LOC_SHARED. A skip writes nothing to
    // an existing row, so `participant` is enough.
    const result = await exec(BULK_CREATE, [input(LOC_SHARED, { name: 'Renamed' })])

    // Then it is skipped, not refused, and nothing about it changes
    expect(result.errors).toBeUndefined()
    expect(storedRow(LOC_SHARED)).toMatchObject({ name: 'Shared', order: 2 })
    expect(rolesOn(LOC_SHARED)).toEqual([
      { userId: USER, role: 'participant' },
      { userId: MEMBER, role: 'organizer' },
    ])
  })

  it('user naming one new id twice gets one location, not an error', async () => {
    // When the same new id appears twice in one payload
    const result = await exec(BULK_CREATE, [
      input('loc_twice', { name: 'First' }),
      input('loc_twice', { name: 'Second' }),
    ])

    // Then the first row wins and the second is a skip
    expect(result.errors).toBeUndefined()
    expect(stored().filter((l) => l.id === 'loc_twice')).toHaveLength(1)
    expect(storedRow('loc_twice')?.name).toBe('First')
    expect(rolesOn('loc_twice')).toEqual([{ userId: USER, role: 'organizer' }])
  })

  it("user importing locations keeps their household's first location untouched", async () => {
    // Given the caller's first location is LOC_DEFAULT, named "Kitchen"
    expect(storedRow(LOC_DEFAULT)).toMatchObject({ name: 'Kitchen', order: 0 })

    // When two more locations are imported
    const result = await exec(BULK_CREATE, [input('loc_new_1'), input('loc_new_2')])

    // Then the import succeeded
    expect(result.errors).toBeUndefined()
    expect(storedRow('loc_new_1')).toBeDefined()
    expect(storedRow('loc_new_2')).toBeDefined()

    // And LOC_DEFAULT is unrenamed, still first
    expect(storedRow(LOC_DEFAULT)).toMatchObject({ name: 'Kitchen', order: 0 })
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
    // id. The pre-check is the only `findUnique` that passes a `select`.
    const precheckCalls = locationFindUnique.mock.calls.filter(
      (call) => (call[0] as { select?: unknown }).select !== undefined,
    )
    expect(precheckCalls).toHaveLength(2)
  })
})

// ─── Upserting ───────────────────────────────────────────────────────────────

describe('bulkUpsertLocations', () => {
  it('user re-importing a location they organize with "replace conflicts" gets its name and order updated, and no role changes', async () => {
    // Given the caller organizes LOC_OTHER, named "Garage" at order 1
    const payload = [input(LOC_OTHER, { name: 'Garage Shelf', order: 5 })]

    // When a replace-conflicts import names it
    const result = await exec(BULK_UPSERT, payload)

    // Then the stored row carries the payload's name and order, and stays in
    // its household
    expect(result.errors).toBeUndefined()
    expect(storedRow(LOC_OTHER)).toMatchObject({
      name: 'Garage Shelf',
      order: 5,
      householdId: HH_USER,
    })
    expect(stored()).toHaveLength(5)
    // And an update grants and changes no role: the role rows are as seeded
    expect(rolesOn(LOC_OTHER)).toEqual([{ userId: USER, role: 'organizer' }])
    expect(world.households.state.locationMembers).toHaveLength(7)
  })

  it('user importing a new location by upsert gets it created under the payload id', async () => {
    // Given an id no row holds
    const payload = [input('loc_upsert_new', { name: 'Loft', order: 8 })]

    // When the upsert import runs
    const result = await exec(BULK_UPSERT, payload)

    // Then it is created, under the payload's id, in the caller's household
    expect(result.errors).toBeUndefined()
    expect(storedRow('loc_upsert_new')).toMatchObject({
      name: 'Loft',
      order: 8,
      householdId: HH_USER,
    })
  })

  it('user naming one new id twice gets it created, then updated', async () => {
    // When the same new id appears twice in one payload
    const result = await exec(BULK_UPSERT, [
      input('loc_twice', { name: 'First' }),
      input('loc_twice', { name: 'Second' }),
    ])

    // Then the second row replaces the first, as `bulkPut` does locally, and
    // there is still one organizer row
    expect(result.errors).toBeUndefined()
    expect(stored().filter((l) => l.id === 'loc_twice')).toHaveLength(1)
    expect(storedRow('loc_twice')?.name).toBe('Second')
    expect(rolesOn('loc_twice')).toEqual([{ userId: USER, role: 'organizer' }])
  })

  it('user who is only a participant of a location cannot rename it through an import', async () => {
    // Given USER is a `participant` of LOC_SHARED. Renaming a location needs
    // `organizer` on the settings page (`updateLocation`), and an import that
    // replaces a location renames it.
    const result = await exec(BULK_UPSERT, [input(LOC_SHARED, { name: 'Renamed', order: 9 })])

    // Then it is refused, and the row is unchanged
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(storedRow(LOC_SHARED)).toMatchObject({ name: 'Shared', order: 2 })
  })

  it("user re-importing their household's first location keeps it in the household", async () => {
    // Given a payload naming the caller's first location. The client's remap
    // rewrites the payload's first location id to the destination's own, so
    // this is the shape a replace-conflicts import really produces.
    const payload = [input(LOC_DEFAULT, { name: 'Kitchen Renamed', order: 2 })]

    // When the upsert import runs
    const result = await exec(BULK_UPSERT, payload)

    // Then the name and order change, and the row stays in its household
    expect(result.errors).toBeUndefined()
    expect(storedRow(LOC_DEFAULT)).toMatchObject({
      name: 'Kitchen Renamed',
      order: 2,
      householdId: HH_USER,
    })
  })
})

// ─── The input shape itself ──────────────────────────────────────────────────

describe('LocationInput carries no isDefault', () => {
  it('rejects a payload that tries to set isDefault', async () => {
    // Given a hand-edited payload carrying the flag. The schema is the guard:
    // GraphQL refuses an input field the type does not declare, so the
    // resolver never sees it. Cloud locations have had no `isDefault` column
    // since households H3a task 3.14 (`LocationInput` in
    // schema/import.graphql).
    const result = await exec(BULK_CREATE, [input('loc_sneaky', { isDefault: true })])

    // Then the mutation does not run at all
    expect(result.errors?.[0]?.message).toContain('isDefault')
    expect(storedRow('loc_sneaky')).toBeUndefined()
  })
})
