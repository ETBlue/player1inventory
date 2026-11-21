import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { FakeLocation } from '../test/stockFake.js'

// Households H7b, task M.2 (decisions T79, T80, T82 of
// docs/global/permissions/2026-11-21-households-plan-h7.md):
// `Location.dataUpdatedAt`, `Location.lastVisitedAt` and
// `markLocationVisited`. Task M.3 adds the personal order to this file.
//
// How `publishChange` sets `dataUpdatedAt` is tested in
// `lib/publishChange.test.ts`, and through five writers in
// `stock-live-publish.resolver.test.ts`.
//
// ── THE FIXTURE ──
//
// | Person | Households                          | Location roles                  |
// |--------|-------------------------------------|---------------------------------|
// | MIA    | hh-1 owner (active), hh-2 member    | loc-k organizer, loc-x organizer |
// | BEA    | hh-1 member                         | loc-k viewer                    |
// | NOEL   | hh-1 member                         | loc-g participant (none on loc-k) |
// | SAM    | hh-2 owner                          | loc-x organizer                 |
//
// MIA joined hh-2 FIRST, so hh-2 is her oldest membership. She acts in hh-1
// only because it is her active household. A visit to loc-x (hh-2), where
// she is an organizer, must still be refused: it is not the household she
// acts in.

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  return { prisma: { ...world.client, $world: world } }
})

import { prisma } from '../lib/prisma.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const MIA = 'user_mia'
const BEA = 'user_bea'
const NOEL = 'user_noel'
const SAM = 'user_sam'

const T = new Date('2026-11-01T00:00:00.000Z')
const DATA_TIME = new Date('2026-11-10T08:00:00.000Z')

const server = new ApolloServer<Context>({ typeDefs, resolvers })

function seed() {
  world.reset()
  const loc = (id: string, householdId: string, order: number, dataUpdatedAt: Date | null): FakeLocation => ({
    id,
    householdId,
    name: `${id} name`,
    order,
    createdAt: T,
    updatedAt: T,
    dataUpdatedAt,
  })
  world.stock.reset(
    [loc('loc-k', 'hh-1', 0, DATA_TIME), loc('loc-g', 'hh-1', 1, null), loc('loc-x', 'hh-2', 0, null)],
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
  world.seedHouseholds({
    households: [household('hh-1', MIA), household('hh-2', SAM)],
    householdMembers: [
      { householdId: 'hh-1', userId: MIA, role: 'owner', joinedAt: T },
      { householdId: 'hh-1', userId: BEA, role: 'member', joinedAt: T },
      { householdId: 'hh-1', userId: NOEL, role: 'member', joinedAt: T },
      { householdId: 'hh-2', userId: SAM, role: 'owner', joinedAt: T },
      { householdId: 'hh-2', userId: MIA, role: 'member', joinedAt: new Date(T.getTime() - 86_400_000) },
    ],
    locationMembers: [
      { locationId: 'loc-k', userId: MIA, role: 'organizer', createdAt: T },
      { locationId: 'loc-k', userId: BEA, role: 'viewer', createdAt: T },
      { locationId: 'loc-g', userId: NOEL, role: 'participant', createdAt: T },
      { locationId: 'loc-x', userId: MIA, role: 'organizer', createdAt: T },
      { locationId: 'loc-x', userId: SAM, role: 'organizer', createdAt: T },
    ],
  })
  world.setActiveHousehold(MIA, 'hh-1')
}

async function run(query: string, userId: string, variables: Record<string, unknown> = {}) {
  const res = await server.executeOperation(
    { query, variables },
    // A new cache per request, as `graphqlContext.ts` makes.
    { contextValue: { userId, clientId: 'tab-1', requestCache: {} } },
  )
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

function code(res: { errors?: ReadonlyArray<{ extensions?: Record<string, unknown> }> }) {
  return res.errors?.[0]?.extensions?.code
}

const VISIT = `mutation M($id: ID!) { markLocationVisited(locationId: $id) }`
const LOCATIONS = `query { locations { id dataUpdatedAt lastVisitedAt } }`

function savedVisit(userId: string, locationId: string): Date | null | undefined {
  return world.locationPreferences.state.rows.find((r) => r.userId === userId && r.locationId === locationId)
    ?.lastVisitedAt
}

let seen: ChangeEvent[] = []
let unsubscribe: () => void = () => undefined

beforeEach(() => {
  seed()
  seen = []
  unsubscribe = liveEvents.subscribe((event) => {
    seen.push(event)
  })
})

afterEach(() => {
  unsubscribe()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Location.dataUpdatedAt', () => {
  it('is the stored value as an ISO date, or null, and the same for everyone', async () => {
    const mia = await run(`query { householdLocations { id dataUpdatedAt } }`, MIA)
    const bea = await run(LOCATIONS, BEA)

    expect(mia.errors).toBeUndefined()
    expect(mia.data?.householdLocations).toEqual([
      { id: 'loc-k', dataUpdatedAt: DATA_TIME.toISOString() },
      { id: 'loc-g', dataUpdatedAt: null },
    ])
    expect(bea.data?.locations).toEqual([
      { id: 'loc-k', dataUpdatedAt: DATA_TIME.toISOString(), lastVisitedAt: null },
    ])
  })
})

describe('Location.lastVisitedAt', () => {
  it("is the CALLER's own value: two people, two values", async () => {
    const miaTime = new Date('2026-11-20T09:00:00.000Z')
    const beaTime = new Date('2026-11-21T18:30:00.000Z')
    world.locationPreferences.reset([
      { userId: MIA, locationId: 'loc-k', customOrder: null, lastVisitedAt: miaTime, updatedAt: T },
      { userId: BEA, locationId: 'loc-k', customOrder: null, lastVisitedAt: beaTime, updatedAt: T },
      // NOEL visited loc-g. Nobody else may see it as their own.
      {
        userId: NOEL,
        locationId: 'loc-g',
        customOrder: null,
        lastVisitedAt: new Date('2026-11-22T00:00:00.000Z'),
        updatedAt: T,
      },
    ])

    const mia = await run(`query { householdLocations { id lastVisitedAt } }`, MIA)
    const bea = await run(LOCATIONS, BEA)

    expect(mia.errors).toBeUndefined()
    expect(mia.data?.householdLocations).toEqual([
      { id: 'loc-k', lastVisitedAt: miaTime.toISOString() },
      { id: 'loc-g', lastVisitedAt: null },
    ])
    expect(bea.data?.locations).toEqual([
      { id: 'loc-k', dataUpdatedAt: DATA_TIME.toISOString(), lastVisitedAt: beaTime.toISOString() },
    ])
  })

  it('reads the preferences once for a whole list', async () => {
    const findMany = vi.spyOn(world.locationPreferences.client, 'findMany')

    const res = await run(`query { householdLocations { id lastVisitedAt } }`, MIA)

    expect(res.errors).toBeUndefined()
    expect(findMany).toHaveBeenCalledTimes(1)
  })
})

describe('markLocationVisited (decision T80)', () => {
  it('a location viewer saves their visit, and reads it back', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = new Date('2026-11-22T10:00:00.000Z')
    vi.setSystemTime(now)

    const res = await run(VISIT, BEA, { id: 'loc-k' })

    expect(res.errors).toBeUndefined()
    expect(res.data).toEqual({ markLocationVisited: true })
    expect(savedVisit(BEA, 'loc-k')).toEqual(now)
    // Only BEA's row: MIA has a role on loc-k too, and gets nothing.
    expect(world.locationPreferences.state.rows).toHaveLength(1)
    const read = await run(LOCATIONS, BEA)
    expect(read.data?.locations).toEqual([
      { id: 'loc-k', dataUpdatedAt: DATA_TIME.toISOString(), lastVisitedAt: now.toISOString() },
    ])
  })

  it('a second visit within 60 seconds writes nothing and answers false; after 60 seconds it writes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const first = new Date('2026-11-22T10:00:00.000Z')
    vi.setSystemTime(first)
    await run(VISIT, BEA, { id: 'loc-k' })

    vi.setSystemTime(new Date(first.getTime() + 59_000))
    const soon = await run(VISIT, BEA, { id: 'loc-k' })

    expect(soon.errors).toBeUndefined()
    expect(soon.data).toEqual({ markLocationVisited: false })
    expect(savedVisit(BEA, 'loc-k')).toEqual(first)

    const later = new Date(first.getTime() + 60_000)
    vi.setSystemTime(later)
    const after = await run(VISIT, BEA, { id: 'loc-k' })

    expect(after.data).toEqual({ markLocationVisited: true })
    expect(savedVisit(BEA, 'loc-k')).toEqual(later)
  })

  it('keeps the custom order of an existing row', async () => {
    world.locationPreferences.reset([
      { userId: MIA, locationId: 'loc-k', customOrder: 3, lastVisitedAt: null, updatedAt: T },
    ])

    const res = await run(VISIT, MIA, { id: 'loc-k' })

    expect(res.data).toEqual({ markLocationVisited: true })
    expect(world.locationPreferences.state.rows).toEqual([
      expect.objectContaining({ userId: MIA, locationId: 'loc-k', customOrder: 3, lastVisitedAt: expect.any(Date) }),
    ])
  })

  it('a household member with no role on the location is FORBIDDEN, and nothing is written', async () => {
    const res = await run(VISIT, NOEL, { id: 'loc-k' })

    expect(code(res)).toBe('FORBIDDEN')
    expect(world.locationPreferences.state.rows).toEqual([])
  })

  it("a location of the person's OTHER household is FORBIDDEN, though they organize it", async () => {
    const res = await run(VISIT, MIA, { id: 'loc-x' })

    expect(code(res)).toBe('FORBIDDEN')
    expect(world.locationPreferences.state.rows).toEqual([])
  })

  it('an unknown id is FORBIDDEN, the same answer', async () => {
    const res = await run(VISIT, MIA, { id: 'loc-nope' })

    expect(code(res)).toBe('FORBIDDEN')
    expect(world.locationPreferences.state.rows).toEqual([])
  })

  it('sends no live event, and does not move dataUpdatedAt', async () => {
    const res = await run(VISIT, MIA, { id: 'loc-k' })

    expect(res.data).toEqual({ markLocationVisited: true })
    expect(seen).toEqual([])
    expect(world.stock.state.locations.find((l) => l.id === 'loc-k')?.dataUpdatedAt).toEqual(DATA_TIME)
  })
})
