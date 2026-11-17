import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import { locationResolvers } from './location.resolver.js'
import type { Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { FakeLocation } from '../test/stockFake.js'

// Households H5 task F.1: `Location.myRole`, `Location.hasOrganizer` and the
// `householdLocations` query, on `householdWorld` (real role rows, the
// decision H18 filter modelled by `householdFake`).
vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  return { prisma: { ...world.client, $world: world } }
})

import { prisma } from '../lib/prisma.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const T = new Date('2026-11-01T00:00:00.000Z')

const server = new ApolloServer<Context>({ typeDefs, resolvers })

// ── The fixture (plan H5, task F.1) ──
//
// | Person   | hh-1 role | hh-2 role | Location roles                               |
// |----------|-----------|-----------|----------------------------------------------|
// | owner    | owner     | member    | loc-k organizer; loc-x (hh-2) organizer      |
// | manager  | manager   | —         | loc-k viewer                                 |
// | member   | member    | —         | loc-g participant                            |
// | stranger | —         | owner     | —                                            |
//
// - hh-1 holds loc-k (order 0) and loc-g (order 1). Nobody organizes loc-g.
// - The owner has NO role on loc-g, so an owner list that read only role rows
//   would leave it out.
// - loc-x is in hh-2, has order 0, and the owner organizes it. A list that
//   forgot the household filter would show it.
// - The owner is in TWO households. Every request pins hh-1 through
//   `requestCache.householdId` (the H4 pattern), because `ensureHousehold`
//   picks one of two households with no order.
function seed() {
  world.reset()
  const loc = (id: string, householdId: string, order: number): FakeLocation => ({
    id,
    householdId,
    name: `${id} name`,
    order,
    createdAt: T,
    updatedAt: T,
  })
  world.stock.reset([loc('loc-x', 'hh-2', 0), loc('loc-g', 'hh-1', 1), loc('loc-k', 'hh-1', 0)], [])
  const household = (id: string, ownerId: string) => ({
    id,
    name: `${id} name`,
    ownerId,
    ownerGoneAt: null,
    createdAt: T,
    updatedAt: T,
  })
  world.seedHouseholds({
    households: [household('hh-1', 'owner'), household('hh-2', 'stranger')],
    householdMembers: [
      { householdId: 'hh-1', userId: 'owner', role: 'owner', joinedAt: T },
      { householdId: 'hh-1', userId: 'manager', role: 'manager', joinedAt: T },
      { householdId: 'hh-1', userId: 'member', role: 'member', joinedAt: T },
      { householdId: 'hh-2', userId: 'stranger', role: 'owner', joinedAt: T },
      { householdId: 'hh-2', userId: 'owner', role: 'member', joinedAt: T },
    ],
    locationMembers: [
      { locationId: 'loc-k', userId: 'owner', role: 'organizer', createdAt: T },
      { locationId: 'loc-k', userId: 'manager', role: 'viewer', createdAt: T },
      { locationId: 'loc-g', userId: 'member', role: 'participant', createdAt: T },
      { locationId: 'loc-x', userId: 'owner', role: 'organizer', createdAt: T },
    ],
  })
}

async function run(query: string, userId: string) {
  const res = await server.executeOperation(
    { query },
    {
      contextValue: {
        userId,
        // A new cache per request, as `graphqlContext.ts` makes, with the
        // household pinned.
        requestCache: { householdId: Promise.resolve('hh-1') },
      },
    },
  )
  if (res.body.kind !== 'single') throw new Error('expected single result')
  return res.body.singleResult
}

const HOUSEHOLD_LOCATIONS = `query { householdLocations { id myRole hasOrganizer } }`
const LOCATIONS = `query { locations { id myRole hasOrganizer } }`

beforeEach(() => seed())

afterEach(() => {
  vi.restoreAllMocks()
})

describe('householdLocations', () => {
  it('household owner sees every location of the household on householdLocations, with myRole null where they have no role', async () => {
    // When the owner lists the household's locations
    const res = await run(HOUSEHOLD_LOCATIONS, 'owner')

    // Then loc-k (organizer) and loc-g (no role), by order. Never loc-x, which
    // is in hh-2, though the owner organizes it.
    expect(res.errors).toBeUndefined()
    expect(res.data?.householdLocations).toEqual([
      { id: 'loc-k', myRole: 'organizer', hasOrganizer: true },
      { id: 'loc-g', myRole: null, hasOrganizer: false },
    ])
  })

  it('household manager sees every location of the household, with their own role', async () => {
    // When the manager lists the household's locations
    const res = await run(HOUSEHOLD_LOCATIONS, 'manager')

    // Then both, with the MANAGER's role (viewer), not the owner's (organizer)
    expect(res.errors).toBeUndefined()
    expect(res.data?.householdLocations).toEqual([
      { id: 'loc-k', myRole: 'viewer', hasOrganizer: true },
      { id: 'loc-g', myRole: null, hasOrganizer: false },
    ])
  })

  it('household member sees only their own locations on householdLocations', async () => {
    // When the member lists the household's locations
    const res = await run(HOUSEHOLD_LOCATIONS, 'member')

    // Then only loc-g, where the member is a participant
    expect(res.errors).toBeUndefined()
    expect(res.data?.householdLocations).toEqual([
      { id: 'loc-g', myRole: 'participant', hasOrganizer: false },
    ])
  })

  it('hasOrganizer is false for a location whose only organizer left the household', async () => {
    // Given the owner, loc-k's only organizer, is removed from hh-1. Their
    // LocationMember row is left behind (decision H18 hides it).
    await world.households.client.householdMember.delete({
      where: { householdId_userId: { householdId: 'hh-1', userId: 'owner' } },
    })

    // When the manager lists the household's locations
    const res = await run(HOUSEHOLD_LOCATIONS, 'manager')

    // Then loc-k has no organizer that counts. The manager is still in hh-1,
    // so a check of the CALLER's membership would wrongly say true.
    expect(res.errors).toBeUndefined()
    expect(res.data?.householdLocations).toEqual([
      { id: 'loc-k', myRole: 'viewer', hasOrganizer: false },
      { id: 'loc-g', myRole: null, hasOrganizer: false },
    ])
  })

  it('a person in no household is refused', async () => {
    // Given a person with no HouseholdMember row, whose household id is pinned
    const res = await run(HOUSEHOLD_LOCATIONS, 'nobody')

    // Then FORBIDDEN, and no location list
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(res.data).toBeNull()
  })

  it('myRole and hasOrganizer cost one membership read per request', async () => {
    // Given a spy on the role table
    const spy = vi.spyOn(prisma.locationMember, 'findMany')

    // When the owner lists two locations with both fields
    const res = await run(HOUSEHOLD_LOCATIONS, 'owner')

    // Then two reads in all (one for the caller's roles, one for the
    // organizers), not two per location
    expect(res.errors).toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('locations', () => {
  it('locations still lists only locations with a role', async () => {
    // When the owner lists the switcher's locations
    const res = await run(LOCATIONS, 'owner')

    // Then only loc-k. Not loc-g (no role), not loc-x (hh-2).
    expect(res.errors).toBeUndefined()
    expect(res.data?.locations).toEqual([{ id: 'loc-k', myRole: 'organizer', hasOrganizer: true }])
  })

  it('a location viewer sees their role on the switcher list', async () => {
    const res = await run(LOCATIONS, 'manager')
    expect(res.errors).toBeUndefined()
    expect(res.data?.locations).toEqual([{ id: 'loc-k', myRole: 'viewer', hasOrganizer: true }])
  })
})

describe('Location fields on a location of a second household', () => {
  it("myRole and hasOrganizer read the LOCATION's household, not the caller's", async () => {
    // Given the owner is in hh-1 (pinned for this request) and in hh-2, and
    // organizes loc-x in hh-2. `updateLocation` checks only the location
    // role, so it can rename loc-x and return it.
    const res = await server.executeOperation(
      {
        query: `mutation { updateLocation(id: "loc-x", input: { name: "Shed" }) { id name myRole hasOrganizer } }`,
      },
      { contextValue: { userId: 'owner', requestCache: { householdId: Promise.resolve('hh-1') } } },
    )
    if (res.body.kind !== 'single') throw new Error('expected single result')

    // Then the role is read in hh-2, where the owner organizes loc-x. Read in
    // the caller's pinned household (hh-1), loc-x would have no role and no
    // organizer.
    expect(res.body.singleResult.errors).toBeUndefined()
    expect(res.body.singleResult.data?.updateLocation).toEqual({
      id: 'loc-x',
      name: 'Shed',
      myRole: 'organizer',
      hasOrganizer: true,
    })
  })
})

// Review of task F.1: `locationRolesByLocation` and `locationIdsWithOrganizer`
// keep their answer for the whole request. The root fields of a mutation run
// one after another, and the cache is shared, so a write that adds or removes
// a role row must forget the cached answer, or a later field reads it stale.
describe('the role cache inside one request', () => {
  it('household owner sees their organizer role on a second location created in the same request', async () => {
    // When the owner creates two locations in ONE document
    const res = await run(
      `mutation {
        a: createLocation(name: "A") { name myRole hasOrganizer }
        b: createLocation(name: "B") { name myRole hasOrganizer }
      }`,
      'owner',
    )

    // Then both show the owner as organizer. With a stale cache, b read the
    // map that a built before b's role row existed: myRole null, no organizer.
    expect(res.errors).toBeUndefined()
    expect(res.data).toEqual({
      a: { name: 'A', myRole: 'organizer', hasOrganizer: true },
      b: { name: 'B', myRole: 'organizer', hasOrganizer: true },
    })
  })

  it('household manager with a viewer role sees the organizer role on a location they create after reading a list', async () => {
    // Given the manager (viewer of loc-k, no role on loc-g) first reorders
    // the locations and reads their fields, which fills the cache, and then
    // creates a location in the same document
    const res = await run(
      `mutation {
        a: reorderLocations(orderedIds: ["loc-k", "loc-g"]) { id myRole hasOrganizer }
        b: createLocation(name: "B") { name myRole hasOrganizer }
      }`,
      'manager',
    )

    // Then the new location shows the manager as its organizer
    expect(res.errors).toBeUndefined()
    expect(res.data?.b).toEqual({ name: 'B', myRole: 'organizer', hasOrganizer: true })
  })

  it('household owner sees their organizer role on a location imported after creating one in the same request', async () => {
    // When the owner creates a location, then imports a new one, in ONE
    // document. The import adds an organizer row through
    // `createImportedLocation`.
    const res = await run(
      `mutation {
        a: createLocation(name: "A") { myRole }
        b: bulkCreateLocations(locations: [{
          id: "loc-new", name: "New", order: 5,
          createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z"
        }]) { id myRole hasOrganizer }
      }`,
      'owner',
    )

    // Then the imported location shows the owner as its organizer
    expect(res.errors).toBeUndefined()
    expect(res.data?.b).toEqual([{ id: 'loc-new', myRole: 'organizer', hasOrganizer: true }])
  })

  // Review of task F.2: no resolver forgets the cache any more. The wrapper
  // around every root Mutation field does (lib/mutationRoleCache.ts). These
  // tests go through the real resolver map, so they pin the wrapper.
  it('household owner sees their roles read fresh after a reorder and a delete in the same request', async () => {
    // Given the owner (organizer of loc-k, no role on loc-g) reorders and
    // reads the roles, which fills the cache with loc-k only; then deletes
    // loc-g; then creates a location
    const res = await run(
      `mutation {
        a: reorderLocations(orderedIds: ["loc-g", "loc-k"]) { id myRole hasOrganizer }
        b: deleteLocation(id: "loc-g")
        c: createLocation(name: "C") { name myRole hasOrganizer }
      }`,
      'owner',
    )

    // Then the reorder showed the owner's one role, and the new location
    // shows the owner as organizer. A cache kept from `a` gives `c` myRole
    // null.
    expect(res.errors).toBeUndefined()
    expect(res.data?.a).toEqual([{ id: 'loc-k', myRole: 'organizer', hasOrganizer: true }])
    expect(res.data?.b).toBe(true)
    expect(res.data?.c).toEqual({ name: 'C', myRole: 'organizer', hasOrganizer: true })
  })

  it('a refused mutation keeps its error code and writes nothing through the wrapper', async () => {
    // A field that throws stops the whole document (every Mutation field is
    // non-null), so no later field of the SAME document can show what the
    // throw left behind. That case is pinned in lib/mutationRoleCache.test.ts
    // ("forgets both role caches when the field throws"). Here: the error
    // still reaches the client with its code, and nothing is deleted.
    const refused = await run(`mutation { deleteLocation(id: "loc-x") }`, 'manager')
    expect(refused.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(refused.data).toBeNull()
    expect(world.stock.state.locations.map((l) => l.id).sort()).toEqual(['loc-g', 'loc-k', 'loc-x'])
  })
})

// `householdIdOf` (location.resolver.ts) reads the household from the parent
// row. Every path that returns a `Location` today builds it with `toGraphQL`,
// which spreads the Prisma row, so the column is there and no GraphQL query
// can reach the fallback. These tests call the field resolvers directly with
// a parent that has NO `householdId`, as a future path might return, to pin
// that the fallback reads the row instead of giving a wrong answer.
describe('Location fields on a parent row with no householdId', () => {
  const ctx = (): Context => ({ userId: 'manager', requestCache: { householdId: Promise.resolve('hh-1') } })
  const bare = (id: string) => ({ id, name: `${id} name`, order: 0, createdAt: '', updatedAt: '' })
  const fields = locationResolvers.Location as unknown as Record<
    'myRole' | 'hasOrganizer',
    (parent: unknown, args: unknown, ctx: Context) => Promise<unknown>
  >

  it("location viewer gets their role on a location read again from its row", async () => {
    // Given a parent with no householdId; the manager is viewer of loc-k and
    // has no role on loc-g
    // When myRole and hasOrganizer are resolved
    // Then the household is read from the row: viewer on loc-k, none on loc-g
    expect(await fields.myRole(bare('loc-k'), {}, ctx())).toBe('viewer')
    expect(await fields.hasOrganizer(bare('loc-k'), {}, ctx())).toBe(true)
    expect(await fields.myRole(bare('loc-g'), {}, ctx())).toBeNull()
    expect(await fields.hasOrganizer(bare('loc-g'), {}, ctx())).toBe(false)
  })

  it('a location id that has no row gives no role and no organizer', async () => {
    expect(await fields.myRole(bare('loc-gone'), {}, ctx())).toBeNull()
    expect(await fields.hasOrganizer(bare('loc-gone'), {}, ctx())).toBe(false)
  })
})

// ── OLD-BUNDLE SHIM: `Location.isDefault` ──
//
// Remove with the field, in the release after households (see
// `location.graphql` and `src/test/oldBundleCompat.test.ts`). `main`'s web
// bundle picks its active location, its import target and the location it may
// not delete by `isDefault`. The value must be the first row of the CALLER's
// `locations` list, by `order` then `id`.
describe('Location.isDefault for an old web bundle', () => {
  it("is true only for the first location of the caller's list", async () => {
    // Given the owner has a role on loc-k (order 0) only, and none on loc-g
    const res = await run(`query { locations { id isDefault } householdLocations { id isDefault } }`, 'owner')

    // Then loc-k is the default, and loc-g, where the owner has no role, is not
    expect(res.errors).toBeUndefined()
    expect(res.data?.locations).toEqual([{ id: 'loc-k', isDefault: true }])
    expect(res.data?.householdLocations).toEqual([
      { id: 'loc-k', isDefault: true },
      { id: 'loc-g', isDefault: false },
    ])
  })

  it("is the caller's own first location, not the household's first", async () => {
    // Given the member has a role on loc-g (order 1) only. loc-k (order 0) is
    // the household's first location, but not in the member's list.
    const res = await run(`query { locations { id isDefault } }`, 'member')

    // Then loc-g is the member's default: their list must have one, or the old
    // bundle has no active location and no import target
    expect(res.errors).toBeUndefined()
    expect(res.data?.locations).toEqual([{ id: 'loc-g', isDefault: true }])
  })

  it('follows the order: after a reorder the new first location is the default', async () => {
    // Given the owner creates a location. It goes last.
    const created = await run(`mutation { createLocation(name: "Garage") { id isDefault } }`, 'owner')
    expect(created.errors).toBeUndefined()
    const garage = created.data?.createLocation as { id: string; isDefault: boolean }
    expect(garage.isDefault).toBe(false)

    // When the owner moves it first, as an old bundle's settings page would
    const res = await run(
      `mutation { reorderLocations(orderedIds: ["${garage.id}", "loc-k", "loc-g"]) { id isDefault } }`,
      'owner',
    )

    // Then the reorder's answer already names it the default, and loc-k is not
    // any more
    expect(res.errors).toBeUndefined()
    expect(res.data?.reorderLocations).toEqual([
      { id: garage.id, isDefault: true },
      { id: 'loc-k', isDefault: false },
    ])
  })
})
