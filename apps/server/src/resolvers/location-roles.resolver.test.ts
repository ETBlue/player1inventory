import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
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
