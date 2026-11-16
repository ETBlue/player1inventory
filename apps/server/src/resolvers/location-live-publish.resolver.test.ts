import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { FakeLocation } from '../test/stockFake.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'
import { shouldDeliver } from './live.resolver.js'

// The household-level `LOCATION` (and, for `clearAllData`, `CATALOG`) events
// of the location mutations, the two location imports and `clearAllData`
// (households H3c-2, task D.3).
//
// ── HOW THE BUS IS WATCHED ──
//
// The same way as `stock-live-publish.resolver.test.ts`: a recording listener
// on the DEFAULT bus (`liveEvents`), removed after each test. For each event
// it notes whether a `$transaction` callback was still running
// (`inTransaction`) and which location ids were stored at that moment, which
// is how "published after commit" is checked.
//
// ── THE FIXTURE ──
//
// | Person   | Households                      | Location roles                        |
// |----------|---------------------------------|---------------------------------------|
// | ALICE    | hh_home owner, hh_second member | LOC_HOME, LOC_GARAGE, LOC_SECOND      |
// |          |                                 | organizer                             |
// | BOB      | hh_home member                  | NONE                                  |
// | CAROL    | hh_second owner                 | LOC_SECOND organizer                  |
// | STRANGER | hh_other owner                  | LOC_STRANGER organizer                |
//
// ALICE's hh_home row comes FIRST, so `requireHousehold(ALICE)` answers
// hh_home. She organizes LOC_SECOND, which belongs to hh_second, so
// `updateLocation` and `bulkUpsertLocations` can write a location of a
// household that is NOT her default one. An event that carried the caller's
// household would say hh_home for that change.
//
// BOB is a household member with no location role at all. That is the person
// decision Q2 is about: he cannot pass `requireLocationRole` for any
// location, deleted or not, and must still hear about the locations list.
//
// `createLocation`, `deleteLocation`, `reorderLocations`, `clearAllData` and
// the CREATE branch of the two imports all write in the caller's
// `requireHousehold` household. They cannot reach another household, so for
// them the household test is "hh_home, not something else" only.

const hooks: {
  /** How many `$transaction` callbacks are running right now. */
  transactionDepth: number
  /** Throws from `location.delete` (deleteLocation's last write). */
  failLocationDelete?: boolean
  /** The `location.create` call number (1-based) that throws. */
  failLocationCreateNumber?: number
  locationCreates: number
} = { transactionDepth: 0, locationCreates: 0 }

// Hoisted, because the `vi.mock` factory below reads it when it runs.
const RECORDED = vi.hoisted(
  () =>
    [
      'inventoryLog',
      'cartItem',
      'cart',
      'recipeItem',
      'recipe',
      'itemTag',
      'itemVendor',
      'item',
      'tag',
      'tagType',
      'vendor',
      'shelf',
    ] as const,
)

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  const baseLocation = world.client.location
  const worldTransaction = world.client.$transaction
  // `clearAllData` deletes twelve models this file does not store. They only
  // answer `{ count: 0 }`; `clearAllData.resolver.test.ts` pins their filters.
  const recorders: Record<string, unknown> = {}
  for (const model of RECORDED) {
    recorders[model] = { deleteMany: async () => ({ count: 0 }) }
  }
  world.extend({
    ...recorders,
    location: {
      ...baseLocation,
      delete: async (args: Parameters<typeof baseLocation.delete>[0]) => {
        if (hooks.failLocationDelete) throw new Error('location.delete failed on purpose')
        return baseLocation.delete(args)
      },
      create: async (args: Parameters<typeof baseLocation.create>[0]) => {
        hooks.locationCreates += 1
        if (hooks.locationCreates === hooks.failLocationCreateNumber) {
          throw new Error('location.create failed on purpose')
        }
        return baseLocation.create(args)
      },
    },
    // Counts the open callbacks, so a listener can see whether it was called
    // while a transaction was still running.
    $transaction: async (arg: unknown) => {
      hooks.transactionDepth += 1
      try {
        return await worldTransaction(arg)
      } finally {
        hooks.transactionDepth -= 1
      }
    },
  })
  return { prisma: { ...world.client, $world: world } }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const ALICE = 'user_alice'
const BOB = 'user_bob'
const CAROL = 'user_carol'
const STRANGER = 'user_stranger'

const LOC_HOME = 'loc_home'
const LOC_GARAGE = 'loc_garage'
const LOC_SECOND = 'loc_second'
const LOC_STRANGER = 'loc_stranger'

const TAB = 'tab-alice-1'
const T0 = new Date('2026-01-01T00:00:00.000Z')

function loc(id: string, householdId: string, order: number): FakeLocation {
  return { id, householdId, name: id, order, createdAt: T0, updatedAt: T0 }
}

function seed() {
  hooks.transactionDepth = 0
  hooks.failLocationDelete = undefined
  hooks.failLocationCreateNumber = undefined
  hooks.locationCreates = 0
  world.reset()
  world.stock.reset(
    [
      loc(LOC_HOME, 'hh_home', 0),
      loc(LOC_GARAGE, 'hh_home', 1),
      loc(LOC_SECOND, 'hh_second', 0),
      loc(LOC_STRANGER, 'hh_other', 0),
    ],
    [],
  )
  world.seedHouseholds({
    households: [
      householdRow('hh_home', ALICE),
      householdRow('hh_second', CAROL),
      householdRow('hh_other', STRANGER),
    ],
    householdMembers: [
      // ALICE's hh_home row FIRST, so `requireHousehold(ALICE)` is hh_home.
      householdMemberRow('hh_home', ALICE, 'owner'),
      householdMemberRow('hh_home', BOB, 'member'),
      householdMemberRow('hh_second', CAROL, 'owner'),
      householdMemberRow('hh_second', ALICE, 'member'),
      householdMemberRow('hh_other', STRANGER, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_HOME, ALICE, 'organizer'),
      locationMemberRow(LOC_GARAGE, ALICE, 'organizer'),
      locationMemberRow(LOC_SECOND, ALICE, 'organizer'),
      locationMemberRow(LOC_SECOND, CAROL, 'organizer'),
      locationMemberRow(LOC_STRANGER, STRANGER, 'organizer'),
    ],
  })
}

// ─── the recording listener ──────────────────────────────────────────────────

type Seen = { event: ChangeEvent; inTransaction: boolean; locationIds: string[] }
let seen: Seen[] = []
let unsubscribe: () => void = () => undefined

beforeEach(() => {
  seed()
  seen = []
  unsubscribe = liveEvents.subscribe((event) => {
    seen.push({
      event,
      inTransaction: hooks.transactionDepth > 0,
      locationIds: world.stock.state.locations.map((l) => l.id).sort(),
    })
  })
})

afterEach(() => {
  unsubscribe()
})

function events(): ChangeEvent[] {
  return seen.map((s) => s.event)
}

/** Sorted by kind, then household, so the order inside a batch does not matter. */
function sortedEvents(): ChangeEvent[] {
  return events().sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.householdId.localeCompare(b.householdId),
  )
}

function household(kind: ChangeEvent['kind'], householdId: string): ChangeEvent {
  return { kind, householdId, locationId: null, sourceClientId: TAB }
}

// ─── running a mutation ──────────────────────────────────────────────────────

const server = new ApolloServer<Context>({ typeDefs, resolvers })

/**
 * `householdId`, when given, pins the caller's household through
 * `ctx.requestCache` (H4 plan rule 16). An import writes into that household.
 * Without the pin, `ensureHousehold` picks one of ALICE's two households in
 * no fixed order.
 */
async function run(query: string, variables: Record<string, unknown>, userId: string, householdId?: string) {
  const contextValue: Context = {
    userId,
    clientId: TAB,
    ...(householdId === undefined ? {} : { requestCache: { householdId: Promise.resolve(householdId) } }),
  }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

function code(res: { errors?: ReadonlyArray<{ extensions?: Record<string, unknown> }> }) {
  return res.errors?.[0]?.extensions?.code
}

const CREATE = `mutation M($name: String!) { createLocation(name: $name) { id } }`
const UPDATE = `mutation M($id: ID!, $name: String) { updateLocation(id: $id, input: { name: $name }) { id } }`
const DELETE = `mutation M($id: ID!) { deleteLocation(id: $id) }`
const REORDER = `mutation M($ids: [ID!]!) { reorderLocations(orderedIds: $ids) { id } }`
const BULK_CREATE = `mutation M($rows: [LocationInput!]!) { bulkCreateLocations(locations: $rows) { id } }`
const BULK_UPSERT = `mutation M($rows: [LocationInput!]!) { bulkUpsertLocations(locations: $rows) { id } }`
const CLEAR = `mutation { clearAllData }`

function importRow(id: string, name = id) {
  return {
    id,
    name,
    order: 5,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  }
}

// ─── createLocation / updateLocation ─────────────────────────────────────────

describe('createLocation and updateLocation publish LOCATION for the household', () => {
  it('createLocation publishes one household-level LOCATION, after the commit', async () => {
    const res = await run(CREATE, { name: 'Cellar' }, ALICE)
    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([household('LOCATION', 'hh_home')])
    expect(seen[0]?.inTransaction).toBe(false)
  })

  it('createLocation rolled back publishes nothing', async () => {
    // The location create throws inside the transaction.
    hooks.failLocationCreateNumber = 1
    const res = await run(CREATE, { name: 'Cellar' }, ALICE)
    expect(res.errors).toBeDefined()
    expect(events()).toEqual([])
  })

  it("updateLocation publishes for the LOCATION's household, not the caller's", async () => {
    // LOC_SECOND is in hh_second; ALICE's default household is hh_home.
    const res = await run(UPDATE, { id: LOC_SECOND, name: 'Shed' }, ALICE)
    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([household('LOCATION', 'hh_second')])
  })

  it('updateLocation of a home location publishes for hh_home', async () => {
    const res = await run(UPDATE, { id: LOC_GARAGE, name: 'Shed' }, ALICE)
    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([household('LOCATION', 'hh_home')])
  })

  it('updateLocation refused publishes nothing', async () => {
    // BOB has no role on LOC_HOME.
    const res = await run(UPDATE, { id: LOC_HOME, name: 'Mine' }, BOB)
    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })
})

// ─── deleteLocation ──────────────────────────────────────────────────────────

describe('deleteLocation publishes one household-level LOCATION', () => {
  it('publishes LOCATION with locationId null, after the commit, and no CART/STOCK/LOG', async () => {
    const res = await run(DELETE, { id: LOC_GARAGE }, ALICE)
    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([household('LOCATION', 'hh_home')])
    // After the commit: no transaction running, and the location is gone.
    expect(seen[0]?.inTransaction).toBe(false)
    expect(seen[0]?.locationIds).not.toContain(LOC_GARAGE)
  })

  it('refused (a household member, not a manager) publishes nothing', async () => {
    const res = await run(DELETE, { id: LOC_GARAGE }, BOB)
    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })

  it("refused for the household's last location publishes nothing", async () => {
    const res = await run(DELETE, { id: LOC_SECOND }, CAROL)
    expect(code(res)).toBe('LAST_LOCATION')
    expect(events()).toEqual([])
  })

  it('rolled back publishes nothing', async () => {
    hooks.failLocationDelete = true
    const res = await run(DELETE, { id: LOC_GARAGE }, ALICE)
    expect(res.errors).toBeDefined()
    expect(world.stock.state.locations.map((l) => l.id)).toContain(LOC_GARAGE)
    expect(events()).toEqual([])
  })
})

describe('the deleteLocation event reaches the right people', () => {
  async function deletedEvent(): Promise<ChangeEvent> {
    const res = await run(DELETE, { id: LOC_GARAGE }, ALICE)
    expect(res.errors).toBeUndefined()
    const [event] = events()
    if (!event) throw new Error('deleteLocation published no event')
    return event
  }

  it('a household member with no role at the deleted location still gets it', async () => {
    const event = await deletedEvent()
    // BOB holds no location role anywhere.
    expect(await shouldDeliver({ userId: BOB, clientId: 'tab-bob' }, event)).toBe(true)
  })

  it('a person of another household does not get it', async () => {
    const event = await deletedEvent()
    expect(await shouldDeliver({ userId: STRANGER, clientId: 'tab-stranger' }, event)).toBe(false)
    expect(await shouldDeliver({ userId: CAROL, clientId: 'tab-carol' }, event)).toBe(false)
  })
})

// ─── reorderLocations ────────────────────────────────────────────────────────

describe('reorderLocations', () => {
  it('publishes one LOCATION for the household, after the commit', async () => {
    const res = await run(REORDER, { ids: [LOC_GARAGE, LOC_HOME] }, ALICE)
    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([household('LOCATION', 'hh_home')])
    expect(seen[0]?.inTransaction).toBe(false)
  })

  it('an empty list writes nothing and publishes nothing', async () => {
    const res = await run(REORDER, { ids: [] }, ALICE)
    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([])
  })

  it('refused (an id of another household) publishes nothing', async () => {
    const res = await run(REORDER, { ids: [LOC_HOME, LOC_STRANGER] }, ALICE)
    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })
})

// ─── the two imports ─────────────────────────────────────────────────────────

describe('bulkCreateLocations', () => {
  it('publishes one LOCATION when it created locations; a skipped row adds nothing', async () => {
    const res = await run(BULK_CREATE, { rows: [importRow('loc_new_1'), importRow('loc_new_2'), importRow(LOC_HOME)] }, ALICE)
    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([household('LOCATION', 'hh_home')])
    expect(seen[0]?.inTransaction).toBe(false)
  })

  it('publishes nothing when every row was skipped', async () => {
    // (This named LOC_SECOND, of ALICE's other household, until households
    // H4 task E.3. That location is now refused: see the next test.)
    const res = await run(BULK_CREATE, { rows: [importRow(LOC_HOME), importRow(LOC_GARAGE)] }, ALICE, 'hh_home')
    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([])
  })

  it("refused (a location of the caller's other household) publishes nothing", async () => {
    // ALICE organizes LOC_SECOND, in hh_second, but the import writes into
    // hh_home (pinned). A new row is in the batch first, so "refused as a
    // whole" differs from "refused row by row".
    const res = await run(BULK_CREATE, { rows: [importRow('loc_new_1'), importRow(LOC_SECOND)] }, ALICE, 'hh_home')
    expect(code(res)).toBe('FORBIDDEN')
    expect(world.stock.state.locations.map((l) => l.id)).not.toContain('loc_new_1')
    expect(events()).toEqual([])
  })

  it('a batch that fails part-way still publishes for the rows it saved', async () => {
    hooks.failLocationCreateNumber = 2
    const res = await run(BULK_CREATE, { rows: [importRow('loc_new_1'), importRow('loc_new_2')] }, ALICE)
    expect(res.errors).toBeDefined()
    expect(world.stock.state.locations.map((l) => l.id)).toContain('loc_new_1')
    expect(events()).toEqual([household('LOCATION', 'hh_home')])
  })

  it('refused (an id of another household) publishes nothing', async () => {
    const res = await run(BULK_CREATE, { rows: [importRow('loc_new_1'), importRow(LOC_STRANGER)] }, ALICE)
    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })
})

describe('bulkUpsertLocations', () => {
  it('publishes once for the household, for a create and an update together', async () => {
    // loc_new is created in hh_home; LOC_GARAGE, in hh_home too, is updated.
    // (Until households H4 task E.3 the update was LOC_SECOND, of ALICE's
    // other household, and the test expected an event for hh_second too. An
    // import can no longer write into a household it is not aimed at.)
    const res = await run(BULK_UPSERT, { rows: [importRow('loc_new'), importRow(LOC_GARAGE, 'Shed')] }, ALICE, 'hh_home')
    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([household('LOCATION', 'hh_home')])
  })

  it("refused (an update of a location in the caller's other household) publishes nothing and renames nothing", async () => {
    // ALICE organizes LOC_SECOND (hh_second); the import writes into hh_home
    // (pinned). This is the two-household test the comment in
    // `bulkUpsertLocations` said H5 owed: a location of household B must not
    // be renamed by an import into household A.
    const before = world.stock.state.locations.find((l) => l.id === LOC_SECOND)?.name
    const res = await run(BULK_UPSERT, { rows: [importRow('loc_new'), importRow(LOC_SECOND, 'Shed')] }, ALICE, 'hh_home')
    expect(code(res)).toBe('FORBIDDEN')
    expect(world.stock.state.locations.find((l) => l.id === LOC_SECOND)?.name).toBe(before)
    expect(world.stock.state.locations.map((l) => l.id)).not.toContain('loc_new')
    expect(events()).toEqual([])
  })

  it('refused (no organizer role on an existing id) publishes nothing', async () => {
    const res = await run(BULK_UPSERT, { rows: [importRow('loc_new'), importRow(LOC_STRANGER)] }, ALICE)
    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })
})

// ─── clearAllData ────────────────────────────────────────────────────────────

describe('clearAllData', () => {
  it('publishes LOCATION and CATALOG for the household, after the commit', async () => {
    const res = await run(CLEAR, {}, ALICE)
    expect(res.errors).toBeUndefined()
    expect(sortedEvents()).toEqual([
      household('CATALOG', 'hh_home'),
      household('LOCATION', 'hh_home'),
    ])
    for (const s of seen) {
      expect(s.inTransaction).toBe(false)
      // The old locations are gone; "Home" was made again.
      expect(s.locationIds).not.toContain(LOC_GARAGE)
    }
  })

  it('refused (not the owner) publishes nothing', async () => {
    const res = await run(CLEAR, {}, BOB)
    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })

  it('rolled back publishes nothing', async () => {
    // The "Home" it makes again is the transaction's last write.
    hooks.failLocationCreateNumber = 1
    const res = await run(CLEAR, {}, ALICE)
    expect(res.errors).toBeDefined()
    expect(world.stock.state.locations.map((l) => l.id)).toContain(LOC_GARAGE)
    expect(events()).toEqual([])
  })

  it('the CATALOG event reaches a member with no location role, not another household', async () => {
    await run(CLEAR, {}, ALICE)
    const catalog = events().find((e) => e.kind === 'CATALOG')
    if (!catalog) throw new Error('clearAllData published no CATALOG event')
    expect(await shouldDeliver({ userId: BOB, clientId: 'tab-bob' }, catalog)).toBe(true)
    expect(await shouldDeliver({ userId: STRANGER, clientId: 'tab-stranger' }, catalog)).toBe(false)
  })
})
