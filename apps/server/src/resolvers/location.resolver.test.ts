import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { HouseholdRole, LocationRole } from '../lib/authz.js'
import type { HouseholdWorld } from '../test/householdWorld.js'

// The location resolvers run on `householdWorld` (src/test/householdWorld.ts):
// `User`, `Household`, `HouseholdMember`, `LocationMember`, `Location` and
// `ItemStock` in one mocked client with one `$transaction`. Every role here is
// a real row the test seeded or the resolver wrote. Nothing is derived from a
// location's `userId` (households H3a task 3.6 removed `derivedRoles` from
// this file), so a resolver that forgets to write a role row fails here.
vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  return { prisma: { ...world.client, $world: world } }
})

import { prisma } from '../lib/prisma.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const T = new Date('2026-11-01T00:00:00.000Z')

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(
  query: string,
  variables: Record<string, unknown> = {},
  userId: string | null = 'caller',
) {
  const res = await server.executeOperation(
    { query, variables },
    { contextValue: { userId } },
  )
  if (res.body.kind !== 'single') throw new Error('expected single result')
  return res.body.singleResult
}

function errorCode(res: Awaited<ReturnType<typeof run>>): unknown {
  return res.errors?.[0]?.extensions?.code
}

const location = (id: string) => world.stock.state.locations.find((l) => l.id === id)

// ── The three-person fixture (plan H3a rule 10) ──
//
// | Person   | Household | Household role                 | Location roles                                  |
// |----------|-----------|--------------------------------|-------------------------------------------------|
// | caller   | hh-1      | set by each test               | loc-kitchen: set by each test; loc-pantry: organizer       |
// | other    | hh-1      | manager (member if caller is   | loc-kitchen: organizer (viewer if caller organizes);  |
// |          |           | manager), so it always differs | loc-garage and loc-pantry: organizer                      |
// | stranger | hh-2      | owner                          | loc-theirs: organizer                                |
//
// - `loc-garage` is in the caller's household, but the caller has no role on it.
// - `other` always holds a DIFFERENT role from the caller, so a check that
//   reads the wrong person's row, or ignores the role, gives a different
//   answer.
// - The orders are picked so a wrong scope shows: the highest order in hh-1
//   is loc-garage's 3, on a location the caller cannot see, and loc-theirs in hh-2 has
//   9.
//
// `onlyOneLocation` leaves hh-1 with loc-kitchen alone (decision H13 tests). hh-2
// still has loc-theirs, so a count that is not scoped to the household sees 2.
function seed(
  options: {
    callerHouseholdRole?: HouseholdRole | null
    callerLocationRole?: LocationRole | null
    onlyOneLocation?: boolean
  } = {},
) {
  const {
    callerHouseholdRole = 'owner',
    callerLocationRole = 'organizer',
    onlyOneLocation = false,
  } = options
  world.reset()
  const loc = (id: string, householdId: string, userId: string, order: number, isDefault = false) => ({
    id,
    userId,
    householdId,
    isDefault,
    name: `${id} name`,
    order,
    createdAt: T,
    updatedAt: T,
  })
  world.stock.reset(
    [
      loc('loc-kitchen', 'hh-1', 'caller', 1, true),
      ...(onlyOneLocation
        ? []
        : [loc('loc-garage', 'hh-1', 'other', 3), loc('loc-pantry', 'hh-1', 'caller', 0)]),
      loc('loc-theirs', 'hh-2', 'stranger', 9, true),
    ],
    [],
  )
  const household = (id: string, ownerId: string) => ({
    id,
    name: `${id} name`,
    ownerId,
    ownerGoneAt: null,
    createdAt: T,
    updatedAt: T,
  })
  const otherHouseholdRole: HouseholdRole = callerHouseholdRole === 'manager' ? 'member' : 'manager'
  const otherLoc1Role: LocationRole = callerLocationRole === 'organizer' ? 'viewer' : 'organizer'
  world.seedHouseholds({
    households: [household('hh-1', 'caller'), household('hh-2', 'stranger')],
    householdMembers: [
      ...(callerHouseholdRole
        ? [{ householdId: 'hh-1', userId: 'caller', role: callerHouseholdRole, joinedAt: T }]
        : []),
      { householdId: 'hh-1', userId: 'other', role: otherHouseholdRole, joinedAt: T },
      { householdId: 'hh-2', userId: 'stranger', role: 'owner' as const, joinedAt: T },
    ],
    locationMembers: [
      ...(callerLocationRole
        ? [{ locationId: 'loc-kitchen', userId: 'caller', role: callerLocationRole, createdAt: T }]
        : []),
      { locationId: 'loc-kitchen', userId: 'other', role: otherLoc1Role, createdAt: T },
      ...(onlyOneLocation
        ? []
        : [
            { locationId: 'loc-garage', userId: 'other', role: 'organizer' as const, createdAt: T },
            { locationId: 'loc-pantry', userId: 'caller', role: 'organizer' as const, createdAt: T },
            { locationId: 'loc-pantry', userId: 'other', role: 'organizer' as const, createdAt: T },
          ]),
      { locationId: 'loc-theirs', userId: 'stranger', role: 'organizer' as const, createdAt: T },
    ],
  })
}

const CREATE = `mutation Create($name: String!) { createLocation(name: $name) { id name order isDefault } }`
const UPDATE = `mutation Update($id: ID!, $input: UpdateLocationInput!) { updateLocation(id: $id, input: $input) { name } }`
const DELETE = `mutation Delete($id: ID!) { deleteLocation(id: $id) }`
const REORDER = `mutation Reorder($ids: [ID!]!) { reorderLocations(orderedIds: $ids) { id order } }`

beforeEach(() => {
  seed()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('locations', () => {
  it('user sees only the locations they have a role on, in order', async () => {
    // Given the caller organizes loc-kitchen (order 1) and loc-pantry (order 0), has no
    // role on loc-garage in their own household, and loc-theirs is a stranger's

    // When the caller lists locations
    const res = await run(`query { locations { id order } }`)

    // Then only loc-pantry and loc-kitchen come back, by order. loc-garage is left out until
    // H5 lets an owner or manager see every location of the household.
    expect(res.errors).toBeUndefined()
    expect(res.data?.locations).toEqual([
      { id: 'loc-pantry', order: 0 },
      { id: 'loc-kitchen', order: 1 },
    ])
  })

  it('a location role counts only while the person is in that household (decision H18)', async () => {
    // Given the caller moved to hh-2 (a member there, organizer of loc-theirs), but
    // their old LocationMember rows on loc-kitchen and loc-pantry in hh-1 were left behind
    seed()
    const members = world.households.state.householdMembers
    world.households.state.householdMembers = [
      ...members.filter((m) => m.userId !== 'caller'),
      { householdId: 'hh-2', userId: 'caller', role: 'member', joinedAt: T },
    ]
    world.households.state.locationMembers.push({
      locationId: 'loc-theirs',
      userId: 'caller',
      role: 'organizer',
      createdAt: T,
    })

    // When the caller lists locations
    const res = await run(`query { locations { id } }`)

    // Then only loc-theirs comes back. The stale rows in hh-1 do not count.
    expect(res.errors).toBeUndefined()
    expect(res.data?.locations).toEqual([{ id: 'loc-theirs' }])
  })

  it('user can read createdAt/updatedAt as real ISO-8601 strings, not epoch ms', async () => {
    // When the caller lists locations
    const res = await run(`query { locations { id createdAt updatedAt } }`)

    // Then createdAt/updatedAt come back as the row's ISO string, not
    // Date.valueOf()'s epoch milliseconds. `singleResult.data` is untyped, so
    // narrow it before using array methods.
    const locations = res.data?.locations as
      | Array<{ id: string; createdAt: string; updatedAt: string }>
      | undefined
    const loc = locations?.find((l) => l.id === 'loc-kitchen')
    expect(loc?.createdAt).toBe(T.toISOString())
    expect(loc?.updatedAt).toBe(T.toISOString())
  })

  it('user signing in for the first time gets a Home location', async () => {
    // Given a new person: a User row that was never set up, and no household
    world.users.reset([
      {
        id: 'user-new',
        displayName: 'New',
        email: null,
        lastSeenAt: null,
        deletedAt: null,
        householdSetupAt: null,
        createdAt: T,
        updatedAt: T,
      },
    ])

    // When they list locations
    const res = await run(`query { locations { name isDefault order } }`, {}, 'user-new')

    // Then first sign-in made one location for them (lib/household.ts), and
    // they see it through the organizer row it wrote. `isDefault` stays true
    // until task 3.12 stops the web app reading it.
    expect(res.errors).toBeUndefined()
    expect(res.data?.locations).toEqual([{ name: 'Home', isDefault: true, order: 0 }])
  })
})

describe('createLocation', () => {
  it('user can create a location, after the highest order in their household', async () => {
    // Given hh-1's highest order is 3 (loc-garage, which the caller cannot see) and
    // hh-2 has a 9

    // When a household member creates a location
    seed({ callerHouseholdRole: 'member' })
    const res = await run(CREATE, { name: '  Cellar  ' })

    // Then it goes after loc-garage: max + 1 within the household, not within the
    // caller's own locations (2) and not across households (10)
    expect(res.errors).toBeUndefined()
    expect(res.data?.createLocation).toMatchObject({ name: 'Cellar', order: 4, isDefault: false })
  })

  it('the new location is in the household, and the creator organizes it', async () => {
    // When the caller creates a location
    const res = await run(CREATE, { name: 'Cellar' })
    const id = (res.data?.createLocation as { id: string }).id

    // Then the row carries both scope columns (userId until task 3.14)
    expect(location(id)).toMatchObject({ householdId: 'hh-1', userId: 'caller', isDefault: false })
    // And exactly one role row was written: the caller's organizer row
    expect(world.households.state.locationMembers.filter((m) => m.locationId === id)).toEqual([
      expect.objectContaining({ userId: 'caller', role: 'organizer' }),
    ])
  })

  it('a failed role row leaves no location behind (one transaction)', async () => {
    // Given writing the role row fails
    vi.spyOn(world.households.client.locationMember, 'create').mockRejectedValueOnce(
      new Error('boom'),
    )
    const before = world.stock.state.locations.length

    // When the caller creates a location
    const res = await run(CREATE, { name: 'Cellar' })

    // Then the error comes back and the location row was rolled back
    expect(res.errors).toBeDefined()
    expect(world.stock.state.locations).toHaveLength(before)
  })

  it('user can create a location and then rename it, using only rows the resolvers wrote', async () => {
    // Given a household member with no role on any new location yet
    seed({ callerHouseholdRole: 'member' })

    // When they create a location and then rename it
    const created = await run(CREATE, { name: 'Cellar' })
    const id = (created.data?.createLocation as { id: string }).id
    const renamed = await run(UPDATE, { id, input: { name: 'Wine cellar' } })

    // Then the rename passes the organizer check through the role row
    // `createLocation` wrote
    expect(renamed.errors).toBeUndefined()
    expect(renamed.data?.updateLocation).toEqual({ name: 'Wine cellar' })
  })

  it('user can create a location and then stock it, using only rows the resolvers wrote', async () => {
    seed({ callerHouseholdRole: 'member' })

    // When they create a location and write stock into it
    const created = await run(CREATE, { name: 'Cellar' })
    const id = (created.data?.createLocation as { id: string }).id
    const stocked = await run(
      `mutation Stock($locationId: ID!) {
        upsertItemStock(itemId: "item-1", locationId: $locationId, input: { packedQuantity: 3 }) {
          packedQuantity
        }
      }`,
      { locationId: id },
    )

    // Then the write passes the participant check, and the row is there
    expect(stocked.errors).toBeUndefined()
    expect(stocked.data?.upsertItemStock).toEqual({ packedQuantity: 3 })
    expect(world.stock.state.itemStocks).toEqual([
      expect.objectContaining({ itemId: 'item-1', locationId: id, packedQuantity: 3 }),
    ])
  })
})

describe('updateLocation', () => {
  it('location organizer can rename it', async () => {
    const res = await run(UPDATE, { id: 'loc-kitchen', input: { name: 'Pantry' } })
    expect(res.errors).toBeUndefined()
    expect(res.data?.updateLocation).toEqual({ name: 'Pantry' })
  })

  it('location participant cannot rename it', async () => {
    // Given the caller is a participant on loc-kitchen, and `other` organizes it
    seed({ callerLocationRole: 'participant' })

    const res = await run(UPDATE, { id: 'loc-kitchen', input: { name: 'Pantry' } })

    expect(errorCode(res)).toBe('FORBIDDEN')
    expect(location('loc-kitchen')?.name).toBe('loc-kitchen name')
  })

  it('household owner with no role on a location cannot rename it', async () => {
    // Given the caller owns hh-1 but has no role on loc-garage
    const res = await run(UPDATE, { id: 'loc-garage', input: { name: 'Mine' } })

    expect(errorCode(res)).toBe('FORBIDDEN')
    expect(location('loc-garage')?.name).toBe('loc-garage name')
  })

  it("user cannot rename another household's location", async () => {
    const res = await run(UPDATE, { id: 'loc-theirs', input: { name: 'Hijacked' } })

    expect(errorCode(res)).toBe('FORBIDDEN')
    expect(location('loc-theirs')?.name).toBe('loc-theirs name')
  })
})

describe('deleteLocation', () => {
  it('household manager can delete a location, with its stock and role rows', async () => {
    // Given the caller manages hh-1 and is only a viewer on loc-kitchen, and loc-kitchen
    // has a stock row
    seed({ callerHouseholdRole: 'manager', callerLocationRole: 'viewer' })
    world.stock.state.itemStocks.push({
      id: 'st-1',
      itemId: 'item-1',
      locationId: 'loc-kitchen',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
      dueDate: null,
      createdAt: T,
      updatedAt: T,
    })

    // When the caller deletes loc-kitchen
    const res = await run(DELETE, { id: 'loc-kitchen' })

    // Then it is gone, and so are its stock row and its role rows. The
    // household role decides, not the location role.
    expect(res.errors).toBeUndefined()
    expect(res.data?.deleteLocation).toBe(true)
    expect(location('loc-kitchen')).toBeUndefined()
    expect(world.stock.state.itemStocks).toHaveLength(0)
    expect(world.households.state.locationMembers.some((m) => m.locationId === 'loc-kitchen')).toBe(
      false,
    )
  })

  it('household manager can delete a location they have no role on', async () => {
    seed({ callerHouseholdRole: 'manager' })

    const res = await run(DELETE, { id: 'loc-garage' })

    expect(res.data?.deleteLocation).toBe(true)
    expect(location('loc-garage')).toBeUndefined()
  })

  it('household owner can delete a location', async () => {
    const res = await run(DELETE, { id: 'loc-pantry' })

    expect(res.data?.deleteLocation).toBe(true)
    expect(location('loc-pantry')).toBeUndefined()
  })

  it.each([['participant'], ['organizer']] as const)(
    'household member who is a location %s cannot delete it',
    async (locationRole) => {
      // Given the caller is a household member, and `other` manages hh-1
      seed({ callerHouseholdRole: 'member', callerLocationRole: locationRole })

      const res = await run(DELETE, { id: 'loc-kitchen' })

      expect(errorCode(res)).toBe('FORBIDDEN')
      expect(location('loc-kitchen')).toBeDefined()
    },
  )

  it("user cannot delete another household's location", async () => {
    // Given the caller owns hh-1, and loc-theirs is in hh-2
    const res = await run(DELETE, { id: 'loc-theirs' })

    expect(errorCode(res)).toBe('FORBIDDEN')
    expect(location('loc-theirs')).toBeDefined()
  })

  it('user cannot delete a location that does not exist', async () => {
    const res = await run(DELETE, { id: 'loc-missing' })
    expect(errorCode(res)).toBe('FORBIDDEN')
  })

  it("user cannot delete the household's last location (decision H13)", async () => {
    // Given hh-1 has only loc-kitchen, while hh-2 still has loc-theirs
    seed({ onlyOneLocation: true })

    const res = await run(DELETE, { id: 'loc-kitchen' })

    expect(errorCode(res)).toBe('LAST_LOCATION')
    expect(location('loc-kitchen')).toBeDefined()
  })

  it('the old default location can be deleted while another location is left', async () => {
    // Given loc-kitchen still carries isDefault: true (the column stays until task
    // 3.14), and hh-1 has two more locations
    expect(location('loc-kitchen')?.isDefault).toBe(true)

    const res = await run(DELETE, { id: 'loc-kitchen' })

    // Then isDefault no longer protects it: only "last location" does
    expect(res.errors).toBeUndefined()
    expect(location('loc-kitchen')).toBeUndefined()
  })
})

describe('reorderLocations', () => {
  it('household manager can reorder every location of the household', async () => {
    // Given the caller manages hh-1, and has no role on loc-garage
    seed({ callerHouseholdRole: 'manager' })

    // When they reorder all three
    const res = await run(REORDER, { ids: ['loc-garage', 'loc-kitchen', 'loc-pantry'] })

    // Then every order is written, loc-garage's too
    expect(res.errors).toBeUndefined()
    expect([location('loc-garage')?.order, location('loc-kitchen')?.order, location('loc-pantry')?.order]).toEqual(
      [0, 1, 2],
    )
    // And the answer is what `locations` returns: the caller's, by order
    expect(res.data?.reorderLocations).toEqual([
      { id: 'loc-kitchen', order: 1 },
      { id: 'loc-pantry', order: 2 },
    ])
  })

  it('household member cannot reorder, and nothing is written', async () => {
    seed({ callerHouseholdRole: 'member' })

    const res = await run(REORDER, { ids: ['loc-kitchen', 'loc-pantry'] })

    expect(errorCode(res)).toBe('FORBIDDEN')
    expect(location('loc-kitchen')?.order).toBe(1)
    expect(location('loc-pantry')?.order).toBe(0)
  })

  it("a batch with another household's location changes nothing", async () => {
    // Given the caller owns hh-1, and loc-theirs is in hh-2
    const res = await run(REORDER, { ids: ['loc-kitchen', 'loc-theirs'] })

    // Then the whole batch is refused: loc-kitchen keeps its order too
    expect(errorCode(res)).toBe('FORBIDDEN')
    expect(location('loc-kitchen')?.order).toBe(1)
    expect(location('loc-theirs')?.order).toBe(9)
  })

  it('a batch with an id that does not exist changes nothing', async () => {
    const res = await run(REORDER, { ids: ['loc-kitchen', 'loc-missing'] })

    expect(errorCode(res)).toBe('FORBIDDEN')
    expect(location('loc-kitchen')?.order).toBe(1)
  })
})
