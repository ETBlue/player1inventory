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
// | OWEN   | hh_1 owner, hh_2 member   | none                                 |
// | MIA    | hh_1 manager              | LOC_K organizer                      |
// | BOB    | hh_1 member               | LOC_K participant                    |
// | YUKI   | hh_2 owner                | LOC_Z organizer                      |
//
// OWEN acts in hh_1 unless a test moves him (`setActiveHousehold`). He is a
// plain `member` of hh_2, so a write that read his role in the wrong
// household would be told apart.
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
    ],
  })
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
    activity: world.households.state.householdActivities.map((a) => a.action),
  })
}

// The owner-only and manager writes this task moved onto the lock (T52).
// Each is called by a person who may make it.
const writes: [string, () => Promise<Result>][] = [
  ['clearAllData', () => clearAllData()],
  ['renameHousehold', () => renameHousehold()],
  ['deleteLocation', () => deleteLocation()],
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

  it.each(writes)('%s: nothing reads the household role through the global client', async (_name, act) => {
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
    expect(globalRoleReads).toEqual([])
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
    expect(after.activity).toEqual([])
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

  it('deleteLocation by a manager who is demoted at the same moment is refused', async () => {
    const res = await demoteThen('hh_1', [{ userId: MIA, role: 'member' }], null, () => deleteLocation(MIA, LOC_P))
    expect(code(res)).toBe('FORBIDDEN')
    expect(world.stock.state.locations.map((l) => l.id)).toContain(LOC_P)
    expect(seen).toEqual([])
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
