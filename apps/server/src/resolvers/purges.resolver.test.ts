import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { FakeLocation } from '../test/stockFake.js'
import { makeStock } from '../test/stockFake.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'

// The household purges and the lock order of the owner-only writes
// (households H6 task J.4; plan
// docs/global/permissions/2026-11-20-households-plan-h6.md, decisions T52,
// T55, T57 and T64, owner decisions O34-A and O38-A).
//
// ── THE LOCK ORDER (decision T52, Review Focus 2) ──
//
// Every write here takes the household lock FIRST (`lockHouseholdOrForbid`,
// lib/household.ts), and reads the caller's household role AFTER it, through
// `tx`. A role read before the lock can be stale by the time the write runs:
// an owner who hands the household over (H6b) at the same moment could still
// clear it. The ORDER tests below are what prove this. The Prisma fake has no
// row lock, so the race tests only show that each order ends right (the H5b
// G.5 trap).
//
// ── THE FIXTURE ──
//
// | Person | Households                | Location roles                       |
// |--------|---------------------------|--------------------------------------|
// | OWEN   | hh_1 owner, hh_2 member   | LOC_Z organizer (in hh_2) only       |
// | MIA    | hh_1 manager              | LOC_K organizer                      |
// | BOB    | hh_1 member               | LOC_K participant                    |
// | YUKI   | hh_2 owner                | LOC_Z organizer                      |
//
// OWEN acts in hh_1 unless a test moves him (`setActiveHousehold`). He is a
// plain `member` of hh_2, so a write that read his role in the wrong
// household would be told apart. He organizes LOC_Z, a location of hh_2, and
// holds no role on any location of hh_1: so a location write that skipped
// the "is it in the household you act in" check would let him empty LOC_Z
// from hh_1, and an owner gets no location right from the household role.
//
// hh_1 has two locations, LOC_K and LOC_P. hh_2 has LOC_Z, with the same kind
// of rows, so a write that is not scoped to one household or one location
// takes the other's rows too (Review Focus 1).
//
// ── THE STORES ──
//
// `householdWorld` holds households, members, role rows, locations, stock
// and the activity log. `InventoryLog`, `Cart` and `CartItem` get a small
// stateful store here (`extra`), with the `where` shapes the code uses and
// the ON DELETE CASCADE from a location (and from a cart to its rows). Any
// other `where` shape THROWS. The nine catalog models only record their
// `deleteMany`: `deleteHouseholdData.test.ts` proves those filters on rows.

const tx = vi.hoisted(() => ({ depth: 0 }))

type LogRow = { id: string; locationId: string }
type CartRow = { id: string; locationId: string; lastPurchasedAt: Date | null }
type CartItemRow = { id: string; cartId: string }

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()

  // One plain object, so `runInTransaction` can snapshot and restore it.
  const extra = {
    logs: [] as LogRow[],
    carts: [] as CartRow[],
    cartItems: [] as CartItemRow[],
  }
  const locationsOf = (householdId: unknown) =>
    world.stock.state.locations.filter((l) => l.householdId === householdId).map((l) => l.id)

  /** `{ locationId }` or `{ location: { householdId } }`, nothing else. */
  function byLocation(model: string, where: Record<string, unknown>): (locationId: string) => boolean {
    const keys = Object.keys(where)
    if (keys.length === 1 && typeof where.locationId === 'string') {
      return (id) => id === where.locationId
    }
    const nested = where.location as Record<string, unknown> | undefined
    if (keys.length === 1 && nested && Object.keys(nested).length === 1 && typeof nested.householdId === 'string') {
      const ids = locationsOf(nested.householdId)
      return (id) => ids.includes(id)
    }
    throw new Error(`purges test: ${model}.deleteMany does not model where ${JSON.stringify(where)}`)
  }

  function dropCarts(gone: (cart: CartRow) => boolean) {
    const cartIds = extra.carts.filter(gone).map((c) => c.id)
    extra.carts = extra.carts.filter((c) => !cartIds.includes(c.id))
    extra.cartItems = extra.cartItems.filter((ci) => !cartIds.includes(ci.cartId))
    return cartIds.length
  }

  /** ON DELETE CASCADE from a location to its logs, carts and cart rows. */
  function cascadeLocations(ids: string[]) {
    extra.logs = extra.logs.filter((l) => !ids.includes(l.locationId))
    dropCarts((c) => ids.includes(c.locationId))
  }

  const recorders: Record<string, unknown> = {}
  for (const model of ['item', 'tag', 'tagType', 'vendor', 'shelf', 'recipe', 'recipeItem', 'itemTag', 'itemVendor']) {
    recorders[model] = { deleteMany: vi.fn(async () => ({ count: 0 })) }
  }
  const baseLocation = world.client.location
  const baseHousehold = world.client.household

  world.extend(
    {
      ...recorders,
      inventoryLog: {
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
          const match = byLocation('inventoryLog', where)
          const before = extra.logs.length
          extra.logs = extra.logs.filter((l) => !match(l.locationId))
          return { count: before - extra.logs.length }
        },
      },
      cart: {
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
          const match = byLocation('cart', where)
          return { count: dropCarts((c) => match(c.locationId)) }
        },
      },
      cartItem: {
        // `{ cart: { locationId } }` or `{ cart: { location: { householdId } } }`.
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
          const cart = where.cart as Record<string, unknown> | undefined
          if (Object.keys(where).length !== 1 || !cart) {
            throw new Error(`purges test: cartItem.deleteMany does not model where ${JSON.stringify(where)}`)
          }
          const match = byLocation('cartItem', cart)
          const cartIds = extra.carts.filter((c) => match(c.locationId)).map((c) => c.id)
          const before = extra.cartItems.length
          extra.cartItems = extra.cartItems.filter((ci) => !cartIds.includes(ci.cartId))
          return { count: before - extra.cartItems.length }
        },
      },
      location: {
        ...baseLocation,
        delete: async (args: Parameters<typeof baseLocation.delete>[0]) => {
          const row = await baseLocation.delete(args)
          cascadeLocations([row.id])
          return row
        },
        deleteMany: async (args: Parameters<typeof baseLocation.deleteMany>[0]) => {
          const ids = (await baseLocation.findMany({ where: args?.where ?? {} })).map((l) => l.id)
          const result = await baseLocation.deleteMany(args)
          cascadeLocations(ids)
          return result
        },
      },
      household: {
        ...baseHousehold,
        deleteMany: async (args: Parameters<typeof baseHousehold.deleteMany>[0]) => {
          const before = new Set(world.households.state.households.map((h) => h.id))
          const owned = (id: string) => world.stock.state.locations.filter((l) => l.householdId === id).map((l) => l.id)
          const ids = [...before].flatMap(owned)
          const result = await baseHousehold.deleteMany(args)
          const after = new Set(world.households.state.households.map((h) => h.id))
          const goneLocations = ids.filter((id) => {
            const loc = world.stock.state.locations.find((l) => l.id === id)
            return !loc || !after.has(loc.householdId ?? '')
          })
          cascadeLocations(goneLocations)
          return result
        },
      },
    },
    [extra],
  )

  // The global `prisma` gets its own copy of each model object over the same
  // stores, so a spy on `world.client.<model>` sees only calls made through
  // `tx`, and a spy on `prisma.<model>` only calls made outside it.
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
    // Counted INSIDE the callback, so a transaction waiting in the
    // `serialTransactions` queue is not counted as running.
    return worldTransaction(async (client: unknown) => {
      tx.depth++
      try {
        return await (arg as (c: unknown) => Promise<unknown>)(client)
      } finally {
        tx.depth--
      }
    })
  }
  return { prisma: { ...copy, $transaction, $world: world, $extra: extra } }
})

import { prisma } from '../lib/prisma.js'
import { lockHouseholdOrForbid } from '../lib/household.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world
const extra = (
  prisma as unknown as { $extra: { logs: LogRow[]; carts: CartRow[]; cartItems: CartItemRow[] } }
).$extra

const OWEN = 'user_owen'
const MIA = 'user_mia'
const BOB = 'user_bob'
const YUKI = 'user_yuki'

const LOC_K = 'loc_kitchen'
const LOC_P = 'loc_pantry'
const LOC_Z = 'loc_z'

const T0 = new Date('2026-01-01T00:00:00.000Z')
const BOUGHT = new Date('2026-11-10T00:00:00.000Z')

function loc(id: string, householdId: string, order: number): FakeLocation {
  return { id, householdId, name: `${id} name`, order, createdAt: T0, updatedAt: T0 }
}

function activityRow(id: string, householdId: string, actorId: string) {
  return {
    id,
    householdId,
    actorId,
    action: 'MEMBER_JOINED' as const,
    targetUserId: null,
    locationId: null,
    details: null,
    createdAt: T0,
  }
}

function seed() {
  world.reset()
  world.stock.reset(
    [loc(LOC_K, 'hh_1', 0), loc(LOC_P, 'hh_1', 1), loc(LOC_Z, 'hh_2', 0)],
    [
      makeStock({ id: 's_k', itemId: 'item_1', locationId: LOC_K }),
      makeStock({ id: 's_p', itemId: 'item_1', locationId: LOC_P }),
      makeStock({ id: 's_z', itemId: 'item_9', locationId: LOC_Z }),
    ],
  )
  world.seedHouseholds({
    households: [householdRow('hh_1', OWEN), householdRow('hh_2', YUKI)],
    householdMembers: [
      householdMemberRow('hh_1', OWEN, 'owner'),
      householdMemberRow('hh_1', MIA, 'manager'),
      householdMemberRow('hh_1', BOB, 'member'),
      householdMemberRow('hh_2', YUKI, 'owner'),
      householdMemberRow('hh_2', OWEN, 'member'),
    ],
    locationMembers: [
      locationMemberRow(LOC_K, MIA, 'organizer'),
      locationMemberRow(LOC_K, BOB, 'participant'),
      locationMemberRow(LOC_Z, YUKI, 'organizer'),
      locationMemberRow(LOC_Z, OWEN, 'organizer'),
    ],
  })
  // One older activity row in each household, so a write that deletes or
  // keeps the log can be seen.
  world.households.state.householdActivities.push(
    activityRow('act_1', 'hh_1', MIA),
    activityRow('act_2', 'hh_2', YUKI),
  )
  for (const [id, hh] of [
    [OWEN, 'hh_1'],
    [MIA, 'hh_1'],
    [BOB, 'hh_1'],
    [YUKI, 'hh_2'],
  ] as const) {
    world.setActiveHousehold(id, hh)
  }
  extra.logs = [
    { id: 'log_k', locationId: LOC_K },
    { id: 'log_p', locationId: LOC_P },
    { id: 'log_z', locationId: LOC_Z },
  ]
  extra.carts = [
    { id: `${LOC_K}:no-vendor`, locationId: LOC_K, lastPurchasedAt: BOUGHT },
    { id: `${LOC_P}:no-vendor`, locationId: LOC_P, lastPurchasedAt: BOUGHT },
    { id: `${LOC_Z}:no-vendor`, locationId: LOC_Z, lastPurchasedAt: BOUGHT },
  ]
  extra.cartItems = [
    { id: 'ci_k', cartId: `${LOC_K}:no-vendor` },
    { id: 'ci_p', cartId: `${LOC_P}:no-vendor` },
    { id: 'ci_z', cartId: `${LOC_Z}:no-vendor` },
  ]
}

const server = new ApolloServer<Context>({ typeDefs, resolvers })

type Result = { data?: Record<string, unknown> | null; errors?: readonly { message: string; extensions?: Record<string, unknown> }[] }

async function run(query: string, userId: string, variables: Record<string, unknown> = {}): Promise<Result> {
  // A fresh `requestCache` per request, as `index.ts` gives one.
  const contextValue: Context = { userId, clientId: 'tab-1', language: 'en', requestCache: {} }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult as Result
}

function code(res: Result) {
  return res.errors?.[0]?.extensions?.code
}

function ok(res: Result, field: string) {
  if (res.errors) throw new Error(`unexpected errors: ${JSON.stringify(res.errors)}`)
  return res.data?.[field]
}

const clearAllData = (userId = OWEN) => run('mutation { clearAllData }', userId)
const renameHousehold = (userId = OWEN, name = 'Renamed') =>
  run('mutation ($name: String!) { renameHousehold(name: $name) { name } }', userId, { name })
const deleteLocation = (userId = MIA, id = LOC_P) =>
  run('mutation ($id: ID!) { deleteLocation(id: $id) }', userId, { id })
const deleteAllLocations = (userId = OWEN) => run('mutation { deleteAllLocations }', userId)
const removeAllLocationItems = (userId = MIA, locationId = LOC_K) =>
  run('mutation ($id: ID!) { removeAllLocationItems(locationId: $id) }', userId, { id: locationId })
const deleteHousehold = (userId = OWEN) => run('mutation { deleteHousehold }', userId)

/** Every event on the bus, with the transaction depth when it was published. */
let seen: { event: ChangeEvent; depth: number }[] = []
let unsubscribe: () => void = () => undefined

beforeEach(() => {
  vi.restoreAllMocks()
  seed()
  seen = []
  unsubscribe = liveEvents.subscribe((event) => {
    seen.push({ event, depth: tx.depth })
  })
})

afterEach(() => {
  unsubscribe()
  vi.restoreAllMocks()
})

/** A snapshot of every row a write here may change, to compare before and after. */
function snapshot() {
  return structuredClone({
    households: world.households.state.households.map((h) => ({ id: h.id, name: h.name })),
    members: world.households.state.householdMembers,
    locationMembers: world.households.state.locationMembers,
    locations: world.stock.state.locations.map((l) => l.id),
    stock: world.stock.state.itemStocks.map((s) => s.id),
    logs: extra.logs,
    carts: extra.carts,
    cartItems: extra.cartItems,
    activity: world.households.state.householdActivities.map((a) => a.id),
    active: world.users.state.rows.map((r) => [r.id, r.activeHouseholdId]),
  })
}

// The owner-only and manager writes this task moved onto the lock (T52).
// Each is called by a person who may make it.
const writes: [string, () => Promise<Result>][] = [
  ['clearAllData', () => clearAllData()],
  ['renameHousehold', () => renameHousehold()],
  ['deleteLocation', () => deleteLocation()],
  ['deleteAllLocations', () => deleteAllLocations()],
  ['deleteHousehold', () => deleteHousehold()],
]

describe('the household writes lock first and read the role after, through tx (decision T52)', () => {
  /** Record the lock and every household role read made through tx, in call order. */
  function recordOrder() {
    const order: string[] = []
    const updateMany = world.client.household.updateMany
    vi.spyOn(world.client.household, 'updateMany').mockImplementation(async (args) => {
      order.push(`lock:${String((args.where as { id?: unknown } | undefined)?.id)}`)
      return updateMany(args)
    })
    const findUnique = world.client.householdMember.findUnique
    vi.spyOn(world.client.householdMember, 'findUnique').mockImplementation(async (args) => {
      order.push('role')
      return findUnique(args)
    })
    return order
  }

  it.each(writes)('%s: the lock comes first, then the role read through tx', async (_name, act) => {
    const order = recordOrder()
    const res = await act()
    expect(res.errors).toBeUndefined()
    // The lock is the first thing the transaction does, once, on hh_1
    expect(order[0]).toBe('lock:hh_1')
    expect(order.filter((x) => x.startsWith('lock:'))).toEqual(['lock:hh_1'])
    // And the role is read after it, through tx. A role read on the global
    // client, before or outside the transaction, is not in this list at all.
    expect(order).toContain('role')
  })

  it.each(writes)('%s: no household role read on the global client, except the one early read of deleteHousehold', async (name, act) => {
    // `requireHousehold` reads the person's memberships through the global
    // client before the transaction, which is fine: it decides WHICH
    // household, not the role. The role read must be inside the lock.
    const globalRoleReads: string[] = []
    // Typed loosely: the global client's own type wants a Prisma promise.
    const client = prisma.householdMember as unknown as Record<string, (...args: unknown[]) => unknown>
    const real = (client.findUnique as (...args: unknown[]) => unknown).bind(client)
    vi.spyOn(client, 'findUnique').mockImplementation(async (...args: unknown[]) => {
      globalRoleReads.push(tx.depth > 0 ? 'inside' : 'outside')
      return real(...args)
    })
    const res = await act()
    expect(res.errors).toBeUndefined()
    // `deleteHousehold` makes ONE early owner read before its transaction,
    // so a manager or member never writes other people's `User` rows. It is
    // not the check that counts: the order test above proves the read
    // through tx after the lock, and the race test below that it refuses.
    expect(globalRoleReads).toEqual(name === 'deleteHousehold' ? ['outside'] : [])
  })

  it.each(writes)(
    '%s: a household deleted after it was looked up gives FORBIDDEN, not an internal error',
    async (_name, act) => {
      // Given hh_1 is deleted between `requireHousehold` and the lock
      const updateMany = world.client.household.updateMany
      vi.spyOn(world.client.household, 'updateMany').mockImplementation(async (args) => {
        if ((args.where as { id?: unknown } | undefined)?.id === 'hh_1') return { count: 0 }
        return updateMany(args)
      })
      const before = snapshot()

      const res = await act()

      expect(code(res)).toBe('FORBIDDEN')
      expect(snapshot()).toEqual(before)
      expect(seen).toEqual([])
    },
  )
})

describe('a write that races a demote (Review Focus 2)', () => {
  // `serialTransactions(true)` runs the transactions one after the other.
  // That is what the household lock does on Postgres, because both take it
  // first. The demote below pauses AFTER its lock, so a role read made
  // outside the lock would run while the person is still owner (or manager)
  // and see the old role. The ORDER tests above are what prove the lock; this
  // only shows that the order the lock gives ends with a refusal.
  //
  // H6b task K.3 repeats this with the real `acceptOwnershipOffer`. Here the
  // demote is a direct write inside a locked transaction.

  async function demoteThen(
    householdId: string,
    changes: { userId: string; role: 'owner' | 'manager' | 'member' }[],
    newOwner: string | null,
    write: () => Promise<Result>,
  ) {
    world.serialTransactions(true)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let locked: () => void = () => undefined
    const firstLock = new Promise<void>((resolve) => {
      locked = resolve
    })
    const demote = prisma.$transaction(async (t) => {
      await lockHouseholdOrForbid(t, householdId)
      locked()
      await gate
      for (const change of changes) {
        await t.householdMember.update({
          where: { householdId_userId: { householdId, userId: change.userId } },
          data: { role: change.role },
        })
      }
      if (newOwner !== null) {
        await t.household.update({ where: { id: householdId }, data: { ownerId: newOwner } })
      }
    })
    await firstLock
    const second = write()
    // Give a role read OUTSIDE the lock time to run while the demote waits.
    await new Promise((resolve) => setTimeout(resolve, 20))
    release()
    await demote
    return second
  }

  it('clearAllData by an owner who is demoted at the same moment is refused, and nothing is deleted', async () => {
    // Given OWEN hands hh_1 to MIA (OWEN → manager first, then MIA → owner;
    // the one-owner index allows no other order), and while that holds the
    // lock OWEN clears hh_1
    const before = snapshot()
    const res = await demoteThen(
      'hh_1',
      [
        { userId: OWEN, role: 'manager' },
        { userId: MIA, role: 'owner' },
      ],
      MIA,
      () => clearAllData(OWEN),
    )

    // Then the clear is refused, and every location, stock row, log and cart
    // of hh_1 is still there
    expect(code(res)).toBe('FORBIDDEN')
    const after = snapshot()
    expect(after.locations).toEqual(before.locations)
    expect(after.stock).toEqual(before.stock)
    expect(after.logs).toEqual(before.logs)
    expect(after.cartItems).toEqual(before.cartItems)
    expect(after.activity).toEqual(before.activity)
    expect(seen).toEqual([])
  })

  it('renameHousehold by an owner who is demoted at the same moment is refused', async () => {
    const res = await demoteThen(
      'hh_1',
      [
        { userId: OWEN, role: 'manager' },
        { userId: MIA, role: 'owner' },
      ],
      MIA,
      () => renameHousehold(OWEN, 'Too late'),
    )
    expect(code(res)).toBe('FORBIDDEN')
    expect(world.households.state.households.find((h) => h.id === 'hh_1')?.name).toBe('hh_1 name')
    expect(seen).toEqual([])
  })

  it('deleteAllLocations by an owner who is demoted at the same moment is refused', async () => {
    const res = await demoteThen(
      'hh_1',
      [
        { userId: OWEN, role: 'manager' },
        { userId: MIA, role: 'owner' },
      ],
      MIA,
      () => deleteAllLocations(OWEN),
    )
    expect(code(res)).toBe('FORBIDDEN')
    expect(world.stock.state.locations.map((l) => l.id)).toEqual([LOC_K, LOC_P, LOC_Z])
    expect(seen).toEqual([])
  })

  it('deleteHousehold by an owner who is demoted at the same moment is refused', async () => {
    const res = await demoteThen(
      'hh_1',
      [
        { userId: OWEN, role: 'manager' },
        { userId: MIA, role: 'owner' },
      ],
      MIA,
      () => deleteHousehold(OWEN),
    )
    expect(code(res)).toBe('FORBIDDEN')
    expect(world.households.state.households.map((h) => h.id)).toEqual(['hh_1', 'hh_2'])
    expect(world.stock.state.locations.map((l) => l.id)).toEqual([LOC_K, LOC_P, LOC_Z])
    expect(seen).toEqual([])
  })

  it('deleteLocation by a manager who is demoted at the same moment is refused', async () => {
    const res = await demoteThen('hh_1', [{ userId: MIA, role: 'member' }], null, () => deleteLocation(MIA, LOC_P))
    expect(code(res)).toBe('FORBIDDEN')
    expect(world.stock.state.locations.map((l) => l.id)).toContain(LOC_P)
    expect(seen).toEqual([])
  })
})

describe('a write that races the REAL acceptOwnershipOffer (Review Focus 2, households H6b task K.3)', () => {
  // The same idea as the block above, with the real transfer. OWEN offered
  // hh_1 to MIA. MIA's accept is held right after it took the household
  // lock (on its first offer read through tx). `serialTransactions(true)`
  // makes OWEN's write wait for it, as the lock does on Postgres.

  const accept = (userId: string, id: string) =>
    run('mutation ($id: ID!) { acceptOwnershipOffer(id: $id) { id role } }', userId, { id })

  beforeEach(() => {
    world.households.state.ownershipOffers.push({
      id: 'off_mia',
      householdId: 'hh_1',
      toUserId: MIA,
      fromUserId: OWEN,
      kind: 'transfer',
      createdAt: T0,
      dismissedAt: null,
    })
  })

  async function acceptThen(write: () => Promise<Result>) {
    world.serialTransactions(true)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let locked: () => void = () => undefined
    const firstRead = new Promise<void>((resolve) => {
      locked = resolve
    })
    const findFirst = world.client.ownershipOffer.findFirst
    let calls = 0
    vi.spyOn(world.client.ownershipOffer, 'findFirst').mockImplementation(async (args) => {
      if (++calls === 1) {
        locked()
        await gate
      }
      return findFirst(args)
    })
    const accepted = accept(MIA, 'off_mia')
    await firstRead
    const second = write()
    // Give a role read OUTSIDE the lock time to run while the accept waits.
    await new Promise((resolve) => setTimeout(resolve, 20))
    release()
    expect(ok(await accepted, 'acceptOwnershipOffer')).toEqual({ id: 'hh_1', role: 'owner' })
    return second
  }

  it('clearAllData by the old owner while the accept holds the lock is refused, and nothing is deleted', async () => {
    const before = snapshot()

    const res = await acceptThen(() => clearAllData(OWEN))

    expect(code(res)).toBe('FORBIDDEN')
    const after = snapshot()
    expect(after.locations).toEqual(before.locations)
    expect(after.stock).toEqual(before.stock)
    expect(after.logs).toEqual(before.logs)
    expect(after.cartItems).toEqual(before.cartItems)
    // Only the accept's own event
    expect(seen.map((s) => s.event.kind)).toEqual(['LOCATION'])
  })

  it('renameHousehold by the old owner while the accept holds the lock is refused', async () => {
    const res = await acceptThen(() => renameHousehold(OWEN, 'Too late'))
    expect(code(res)).toBe('FORBIDDEN')
    expect(world.households.state.households.find((h) => h.id === 'hh_1')?.name).toBe('hh_1 name')
  })

  it('the other order: the clear commits first, then the accept works on the cleared household', async () => {
    // Given OWEN clears hh_1 before MIA accepts
    ok(await clearAllData(OWEN), 'clearAllData')
    expect(world.stock.state.locations.map((l) => l.id)).not.toContain(LOC_K)

    // When MIA accepts
    expect(ok(await accept(MIA, 'off_mia'), 'acceptOwnershipOffer')).toEqual({ id: 'hh_1', role: 'owner' })

    // Then MIA owns the cleared household, and OWEN is a manager
    const roles = world.households.state.householdMembers
      .filter((m) => m.householdId === 'hh_1')
      .map((m) => `${m.userId}:${m.role}`)
      .sort()
    expect(roles).toEqual([`${BOB}:member`, `${MIA}:owner`, `${OWEN}:manager`])
    // And the "Home" that the clear made is still there, in hh_1
    expect(world.stock.state.locations.filter((l) => l.householdId === 'hh_1')).toHaveLength(1)
  })
})

describe('the role is read in the household the caller acts in', () => {
  // OWEN owns hh_1 and is a plain member of hh_2.
  it('household member cannot clear, rename or delete a location of the household they act in, even when they own another', async () => {
    // Given OWEN acts in hh_2, where he is a member
    world.setActiveHousehold(OWEN, 'hh_2')
    const before = snapshot()

    // When he clears, renames and deletes a location there
    const cleared = await clearAllData(OWEN)
    const renamed = await renameHousehold(OWEN)
    const deleted = await deleteLocation(OWEN, LOC_Z)

    // Then all three are refused, and nothing changed in either household
    expect([code(cleared), code(renamed), code(deleted)]).toEqual(['FORBIDDEN', 'FORBIDDEN', 'FORBIDDEN'])
    expect(snapshot()).toEqual(before)
  })

  it('household owner can rename the household they act in', async () => {
    expect(ok(await renameHousehold(OWEN, 'Lin home'), 'renameHousehold')).toEqual({ name: 'Lin home' })
    expect(world.households.state.households.map((h) => h.name)).toEqual(['Lin home', 'hh_2 name'])
  })

  it('household manager can delete a location, and the other location and household stay', async () => {
    expect(ok(await deleteLocation(MIA, LOC_P), 'deleteLocation')).toBe(true)
    expect(world.stock.state.locations.map((l) => l.id)).toEqual([LOC_K, LOC_Z])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The three new mutations (decision T55, owner decisions O34-A and O38-A)
// ─────────────────────────────────────────────────────────────────────────────

/** The activity rows written by this test, without the two seeded ones. */
function newLogRows() {
  return world.households.state.householdActivities
    .filter((a) => !['act_1', 'act_2'].includes(a.id))
    .map((a) => ({
      householdId: a.householdId,
      actorId: a.actorId,
      action: a.action,
      targetUserId: a.targetUserId,
      locationId: a.locationId,
      details: a.details,
    }))
}

function events() {
  return seen.map((s) => s.event)
}

/** The nine catalog models only record; none of them may be reached. */
function catalogDeletes() {
  const client = world.client as unknown as Record<string, { deleteMany?: ReturnType<typeof vi.fn> }>
  return ['item', 'tag', 'tagType', 'vendor', 'shelf', 'recipe', 'recipeItem', 'itemTag', 'itemVendor'].flatMap(
    (model) => (client[model]?.deleteMany?.mock.calls ?? []).map((call) => ({ model, arg: call[0] })),
  )
}

/** Fail the next activity write, once. */
function failTheLogWrite() {
  vi.spyOn(world.client.householdActivity, 'create').mockRejectedValueOnce(new Error('the log write failed'))
}

describe('deleteAllLocations (decision T55, owner decision O34-A)', () => {
  beforeEach(() => {
    for (const model of ['item', 'tag', 'tagType', 'vendor', 'shelf', 'recipe', 'recipeItem', 'itemTag', 'itemVendor']) {
      ;(world.client as unknown as Record<string, { deleteMany: ReturnType<typeof vi.fn> }>)[model]?.deleteMany.mockClear()
    }
  })

  it('household owner can delete every location of the household; the other household keeps all of its rows', async () => {
    // When the owner of hh_1 deletes all locations
    const res = await deleteAllLocations(OWEN)

    // Then it succeeds
    expect(ok(res, 'deleteAllLocations')).toBe(true)

    // And every location of hh_1 is gone, with its stock, logs, carts, cart
    // rows and role rows
    expect(world.stock.state.locations.map((l) => l.id)).toEqual([LOC_Z])
    expect(world.stock.state.itemStocks.map((s) => s.id)).toEqual(['s_z'])
    expect(extra.logs.map((l) => l.id)).toEqual(['log_z'])
    expect(extra.carts.map((c) => c.id)).toEqual([`${LOC_Z}:no-vendor`])
    expect(extra.cartItems.map((c) => c.id)).toEqual(['ci_z'])
    expect(world.households.state.locationMembers.map((m) => [m.locationId, m.userId])).toEqual([
      [LOC_Z, YUKI],
      [LOC_Z, OWEN],
    ])

    // And no new "Home" is made (owner decision O34-A)
    expect(world.stock.state.locations.filter((l) => l.householdId === 'hh_1')).toEqual([])

    // And the catalog stays: no catalog model is reached
    expect(catalogDeletes()).toEqual([])

    // And the household, its people and their household roles stay
    expect(world.households.state.households.map((h) => h.id)).toEqual(['hh_1', 'hh_2'])
    expect(world.households.state.householdMembers).toHaveLength(5)
  })

  it('writes one LOCATIONS_DELETED row with the count, and keeps the older log', async () => {
    ok(await deleteAllLocations(OWEN), 'deleteAllLocations')
    expect(newLogRows()).toEqual([
      {
        householdId: 'hh_1',
        actorId: OWEN,
        action: 'LOCATIONS_DELETED',
        targetUserId: null,
        locationId: null,
        details: { count: 2 },
      },
    ])
    expect(world.households.state.householdActivities.map((a) => a.id).slice(0, 2)).toEqual(['act_1', 'act_2'])
  })

  it('publishes one household-level LOCATION event, after the commit', async () => {
    ok(await deleteAllLocations(OWEN), 'deleteAllLocations')
    expect(events()).toEqual([{ kind: 'LOCATION', householdId: 'hh_1', locationId: null, sourceClientId: 'tab-1' }])
    expect(seen.map((s) => s.depth)).toEqual([0])
  })

  it('a household with no location gives false, with no row and no event', async () => {
    // Given hh_1 has no location left
    ok(await deleteAllLocations(OWEN), 'deleteAllLocations')
    seen = []
    const rowsBefore = world.households.state.householdActivities.length

    // When the owner deletes all locations again
    const res = await deleteAllLocations(OWEN)

    // Then nothing was deleted, logged or sent
    expect(ok(res, 'deleteAllLocations')).toBe(false)
    expect(world.households.state.householdActivities).toHaveLength(rowsBefore)
    expect(seen).toEqual([])
    expect(world.stock.state.locations.map((l) => l.id)).toEqual([LOC_Z])
  })

  for (const [who, userId] of [
    ['manager', MIA],
    ['member', BOB],
  ] as const) {
    it(`household ${who} cannot delete all locations, and nothing changes`, async () => {
      const before = snapshot()
      const res = await deleteAllLocations(userId)
      expect(code(res)).toBe('FORBIDDEN')
      expect(snapshot()).toEqual(before)
      expect(seen).toEqual([])
    })
  }

  it('the delete and its log row roll back together when the log write fails', async () => {
    const before = snapshot()
    failTheLogWrite()
    const res = await deleteAllLocations(OWEN)
    expect(res.errors).toBeDefined()
    expect(snapshot()).toEqual(before)
    expect(seen).toEqual([])
  })
})

describe('removeAllLocationItems (decision T55)', () => {
  it('location organizer can remove all items: the stock rows and cart rows of that one location go', async () => {
    // When MIA, organizer of LOC_K, removes all its items
    const res = await removeAllLocationItems(MIA, LOC_K)

    // Then it succeeds
    expect(ok(res, 'removeAllLocationItems')).toBe(true)

    // And LOC_K's stock row and cart row are gone
    expect(world.stock.state.itemStocks.map((s) => s.id)).toEqual(['s_p', 's_z'])
    expect(extra.cartItems.map((c) => c.id)).toEqual(['ci_p', 'ci_z'])
  })

  it('keeps the location, its carts with their last purchase date, its logs, its role rows and the catalog', async () => {
    ok(await removeAllLocationItems(MIA, LOC_K), 'removeAllLocationItems')

    expect(world.stock.state.locations.map((l) => l.id)).toEqual([LOC_K, LOC_P, LOC_Z])
    expect(extra.carts).toEqual([
      { id: `${LOC_K}:no-vendor`, locationId: LOC_K, lastPurchasedAt: BOUGHT },
      { id: `${LOC_P}:no-vendor`, locationId: LOC_P, lastPurchasedAt: BOUGHT },
      { id: `${LOC_Z}:no-vendor`, locationId: LOC_Z, lastPurchasedAt: BOUGHT },
    ])
    expect(extra.logs.map((l) => l.id)).toEqual(['log_k', 'log_p', 'log_z'])
    expect(
      world.households.state.locationMembers.filter((m) => m.locationId === LOC_K).map((m) => [m.userId, m.role]),
    ).toEqual([
      [MIA, 'organizer'],
      [BOB, 'participant'],
    ])
    expect(catalogDeletes()).toEqual([])
  })

  it('a second location of the same household keeps its stock rows and cart rows', async () => {
    ok(await removeAllLocationItems(MIA, LOC_K), 'removeAllLocationItems')
    expect(world.stock.state.itemStocks.map((s) => s.id)).toContain('s_p')
    expect(extra.cartItems.map((c) => c.id)).toContain('ci_p')
  })

  it('writes one LOCATION_ITEMS_REMOVED row with the location name', async () => {
    ok(await removeAllLocationItems(MIA, LOC_K), 'removeAllLocationItems')
    // `locationName` is what the Activity page shows ("removed all items
    // from {{location}}"); see the J.3 review row of the plan.
    expect(newLogRows()).toEqual([
      {
        householdId: 'hh_1',
        actorId: MIA,
        action: 'LOCATION_ITEMS_REMOVED',
        targetUserId: null,
        locationId: LOC_K,
        details: { locationName: `${LOC_K} name`, stockRows: 1, cartRows: 1 },
      },
    ])
  })

  it('publishes STOCK and CART at that location only, after the commit', async () => {
    ok(await removeAllLocationItems(MIA, LOC_K), 'removeAllLocationItems')
    expect(events()).toEqual([
      { kind: 'STOCK', householdId: 'hh_1', locationId: LOC_K, sourceClientId: 'tab-1' },
      { kind: 'CART', householdId: 'hh_1', locationId: LOC_K, sourceClientId: 'tab-1' },
    ])
    expect(seen.map((s) => s.depth)).toEqual([0, 0])
  })

  it('publishes only STOCK when the location had stock rows but no cart rows', async () => {
    extra.cartItems = extra.cartItems.filter((c) => c.id !== 'ci_k')
    ok(await removeAllLocationItems(MIA, LOC_K), 'removeAllLocationItems')
    expect(events().map((e) => e.kind)).toEqual(['STOCK'])
    expect(newLogRows()[0]?.details).toEqual({ locationName: `${LOC_K} name`, stockRows: 1, cartRows: 0 })
  })

  it('a location with nothing to remove gives false, with no row and no event', async () => {
    ok(await removeAllLocationItems(MIA, LOC_K), 'removeAllLocationItems')
    seen = []
    const rowsBefore = world.households.state.householdActivities.length

    expect(ok(await removeAllLocationItems(MIA, LOC_K), 'removeAllLocationItems')).toBe(false)
    expect(world.households.state.householdActivities).toHaveLength(rowsBefore)
    expect(seen).toEqual([])
  })

  for (const [who, userId] of [
    ['location participant', BOB],
    ['household owner with no role on the location', OWEN],
  ] as const) {
    it(`${who} cannot remove all items, and nothing changes`, async () => {
      const before = snapshot()
      const res = await removeAllLocationItems(userId, LOC_K)
      expect(code(res)).toBe('FORBIDDEN')
      expect(snapshot()).toEqual(before)
      expect(seen).toEqual([])
    })
  }

  it('location organizer of a location in another household cannot empty it from the household they act in', async () => {
    // Given OWEN acts in hh_1 and organizes LOC_Z, a location of hh_2
    const before = snapshot()

    // When he removes all items of LOC_Z
    const res = await removeAllLocationItems(OWEN, LOC_Z)

    // Then it is refused, and LOC_Z keeps its rows
    expect(code(res)).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
  })

  it('location organizer can empty that location once they act in its household', async () => {
    // The positive control for the test above: the same person, the same
    // location, acting in hh_2.
    world.setActiveHousehold(OWEN, 'hh_2')
    expect(ok(await removeAllLocationItems(OWEN, LOC_Z), 'removeAllLocationItems')).toBe(true)
    expect(world.stock.state.itemStocks.map((s) => s.id)).toEqual(['s_k', 's_p'])
    expect(extra.cartItems.map((c) => c.id)).toEqual(['ci_k', 'ci_p'])
  })

  it('an unknown location gives FORBIDDEN, the same as another household\'s', async () => {
    expect(code(await removeAllLocationItems(MIA, 'loc_nope'))).toBe('FORBIDDEN')
  })

  it('takes the household lock first, then reads the location and the role through tx', async () => {
    const order: string[] = []
    const updateMany = world.client.household.updateMany
    vi.spyOn(world.client.household, 'updateMany').mockImplementation(async (args) => {
      order.push('lock')
      return updateMany(args)
    })
    const findFirst = world.client.locationMember.findFirst
    vi.spyOn(world.client.locationMember, 'findFirst').mockImplementation(async (args) => {
      order.push('role')
      return findFirst(args)
    })
    ok(await removeAllLocationItems(MIA, LOC_K), 'removeAllLocationItems')
    expect(order).toEqual(['lock', 'role'])
  })

  it('the delete and its log row roll back together when the log write fails', async () => {
    const before = snapshot()
    failTheLogWrite()
    const res = await removeAllLocationItems(MIA, LOC_K)
    expect(res.errors).toBeDefined()
    expect(snapshot()).toEqual(before)
    expect(seen).toEqual([])
  })
})

describe('deleteHousehold (owner decision O38-A)', () => {
  const HOUSEHOLD = 'query { household { id } }'

  beforeEach(() => {
    for (const model of ['item', 'tag', 'tagType', 'vendor', 'shelf', 'recipe', 'recipeItem', 'itemTag', 'itemVendor']) {
      ;(world.client as unknown as Record<string, { deleteMany: ReturnType<typeof vi.fn> }>)[model]?.deleteMany.mockClear()
    }
  })

  it('household owner can delete the household with all its data; the other household keeps all of its rows', async () => {
    // When OWEN, owner of hh_1, deletes it
    const res = await deleteHousehold(OWEN)

    // Then it succeeds, and hh_1 is gone with its members, role rows,
    // locations, stock, logs, carts, cart rows and activity log
    expect(ok(res, 'deleteHousehold')).toBe(true)
    expect(world.households.state.households.map((h) => h.id)).toEqual(['hh_2'])
    expect(world.households.state.householdMembers.map((m) => [m.householdId, m.userId])).toEqual([
      ['hh_2', YUKI],
      ['hh_2', OWEN],
    ])
    expect(world.stock.state.locations.map((l) => l.id)).toEqual([LOC_Z])
    expect(world.stock.state.itemStocks.map((s) => s.id)).toEqual(['s_z'])
    expect(extra.logs.map((l) => l.id)).toEqual(['log_z'])
    expect(extra.carts.map((c) => c.id)).toEqual([`${LOC_Z}:no-vendor`])
    expect(extra.cartItems.map((c) => c.id)).toEqual(['ci_z'])
    expect(world.households.state.locationMembers.map((m) => m.locationId)).toEqual([LOC_Z, LOC_Z])
    expect(world.households.state.householdActivities.map((a) => a.id)).toEqual(['act_2'])
  })

  it('deletes the catalog through deleteHouseholdData, scoped to that household only', async () => {
    ok(await deleteHousehold(OWEN), 'deleteHousehold')
    // Every catalog delete names hh_1 and nothing else. The rows themselves
    // are proved in deleteHouseholdData.test.ts.
    const calls = catalogDeletes()
    expect(calls.map((c) => c.model).sort()).toEqual(
      ['item', 'itemTag', 'itemVendor', 'recipe', 'recipeItem', 'shelf', 'tag', 'tagType', 'vendor'],
    )
    expect(JSON.stringify(calls.map((c) => c.arg))).not.toContain('hh_2')
    for (const call of calls) expect(JSON.stringify(call.arg)).toContain('hh_1')
  })

  it('everyone loses access: a person with no other household gets NO_HOUSEHOLD, the owner acts in their other household', async () => {
    ok(await deleteHousehold(OWEN), 'deleteHousehold')

    // MIA and BOB were only in hh_1
    for (const userId of [MIA, BOB]) {
      const res = await run(HOUSEHOLD, userId)
      expect(code(res)).toBe('NO_HOUSEHOLD')
    }
    // OWEN is still a member of hh_2, so his next request acts there
    expect(ok(await run(HOUSEHOLD, OWEN), 'household')).toEqual({ id: 'hh_2' })
    // And nobody's active household names hh_1 any more
    expect(world.users.state.rows.filter((r) => r.activeHouseholdId === 'hh_1')).toEqual([])
    expect(world.users.state.rows.find((r) => r.id === YUKI)?.activeHouseholdId).toBe('hh_2')
  })

  it('writes the User rows that name the household BEFORE it takes the household lock (decision T16)', async () => {
    const order: string[] = []
    const userUpdateMany = world.client.user.updateMany
    vi.spyOn(world.client.user, 'updateMany').mockImplementation(async (args) => {
      order.push(`user:${String((args.where as { activeHouseholdId?: unknown }).activeHouseholdId)}`)
      return userUpdateMany(args)
    })
    const updateMany = world.client.household.updateMany
    vi.spyOn(world.client.household, 'updateMany').mockImplementation(async (args) => {
      order.push('lock')
      return updateMany(args)
    })
    ok(await deleteHousehold(OWEN), 'deleteHousehold')
    expect(order).toEqual(['user:hh_1', 'lock'])
  })

  it('publishes nothing: the members went with the household, so no tab could receive it', async () => {
    ok(await deleteHousehold(OWEN), 'deleteHousehold')
    expect(seen).toEqual([])
  })

  for (const [who, userId] of [
    ['manager', MIA],
    ['member', BOB],
  ] as const) {
    it(`household ${who} cannot delete the household, and nothing changes`, async () => {
      const before = snapshot()
      const res = await deleteHousehold(userId)
      expect(code(res)).toBe('FORBIDDEN')
      expect(snapshot()).toEqual(before)
    })
  }

  for (const [who, userId] of [
    ['manager', MIA],
    ['member', BOB],
  ] as const) {
    it(`household ${who} is refused before any transaction, so no User row is ever written`, async () => {
      // Step 1 of deleteHousehold writes OTHER people's `User` rows. A
      // refusal after it rolls back, but the row locks are still taken, and a
      // join that holds one of those rows can be pushed into P2034. So a
      // person who is not the owner must be refused before step 1 runs.
      const transaction = vi.spyOn(prisma, '$transaction')
      const userUpdateMany = vi.spyOn(world.client.user, 'updateMany')

      const res = await deleteHousehold(userId)

      expect(code(res)).toBe('FORBIDDEN')
      expect(transaction).not.toHaveBeenCalled()
      expect(userUpdateMany).not.toHaveBeenCalled()
    })
  }

  it('household member cannot delete the household they act in, even when they own another', async () => {
    world.setActiveHousehold(OWEN, 'hh_2')
    const before = snapshot()
    expect(code(await deleteHousehold(OWEN))).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
  })

  it('runs its whole transaction once more on P2034, a deadlock or write conflict (decision T16)', async () => {
    // Given the first attempt fails at its household delete with P2034
    const transaction = vi.spyOn(prisma, '$transaction')
    vi.spyOn(world.client.household, 'deleteMany').mockRejectedValueOnce(
      Object.assign(new Error('write conflict'), { code: 'P2034' }),
    )

    // When the owner deletes the household
    const res = await deleteHousehold(OWEN)

    // Then the second attempt deletes it
    expect(ok(res, 'deleteHousehold')).toBe(true)
    expect(transaction).toHaveBeenCalledTimes(2)
    expect(world.households.state.households.map((h) => h.id)).toEqual(['hh_2'])
  })

  it('a second P2034 is not retried again, and nothing is deleted', async () => {
    const transaction = vi.spyOn(prisma, '$transaction')
    const conflict = () => Object.assign(new Error('write conflict'), { code: 'P2034' })
    vi.spyOn(world.client.household, 'deleteMany')
      .mockRejectedValueOnce(conflict())
      .mockRejectedValueOnce(conflict())
    const before = snapshot()

    const res = await deleteHousehold(OWEN)

    expect(res.errors).toBeDefined()
    expect(transaction).toHaveBeenCalledTimes(2)
    expect(snapshot()).toEqual(before)
  })
})
