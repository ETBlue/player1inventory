import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { HouseholdInviteRow, OwnershipOfferRow } from '../test/householdFake.js'
import { type FakeLocation, makeStock } from '../test/stockFake.js'
import type { UserRow } from '../test/userFake.js'
import { type ChangeEvent, liveEvents } from './liveEvents.js'

// The hand-over when a Clerk account is deleted (households H6b, task K.4;
// decisions T50, T60, T61, T62 and T63 of
// docs/global/permissions/2026-11-20-households-plan-h6.md).
//
// ── THE FIXTURE ──
//
// hh_2 is the household that must NOT change in most tests:
//
// | Person | hh_2    | Location roles   |
// |--------|---------|------------------|
// | YUKI   | owner   | LOC_Z organizer  |
// | BEA    | manager | LOC_Z viewer     |
//
// hh_2 has an open transfer offer from YUKI to BEA and an open invite made
// by BEA. A write that is not scoped to one household would touch them.
//
// hh_1 is built by each test (`hh1`), with OWEN as its owner. DEX is always
// a member of hh_1 whose account is ALREADY deleted, and who organizes
// LOC_1: the hand-over must not count DEX (decision T61, Y12).
//
// The world does not own the catalog models that `deleteHouseholdData`
// deletes. They are stateful here over `world.contents` and also RECORD each
// `deleteMany`, so a test can see that the ordered delete ran, and with
// which scope.

const calls = vi.hoisted(() => ({
  log: [] as string[],
  deletes: [] as { model: string; where: unknown }[],
  /** When set, the next `$transaction` runs through it once. */
  nextTransaction: null as null | ((run: (fn: unknown) => Promise<unknown>, fn: unknown) => Promise<unknown>),
}))

vi.mock('./prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()

  const locationsOf = (householdId: unknown) =>
    world.stock.state.locations.filter((l) => l.householdId === householdId).map((l) => l.id)

  /** `{ householdId }` and the nested `{ <rel>: { householdId } }` shapes only. */
  function householdOf(model: string, where: Record<string, unknown>, path: string[]): string {
    let node: unknown = where
    for (const key of path) {
      const obj = node as Record<string, unknown>
      if (!obj || Object.keys(obj).length !== 1 || !(key in obj)) {
        throw new Error(`handover test: ${model}.deleteMany does not model where ${JSON.stringify(where)}`)
      }
      node = obj[key]
    }
    const last = node as Record<string, unknown>
    if (!last || Object.keys(last).length !== 1 || typeof last.householdId !== 'string') {
      throw new Error(`handover test: ${model}.deleteMany does not model where ${JSON.stringify(where)}`)
    }
    return last.householdId
  }

  function model(name: string, path: string[], drop?: (householdId: string) => number) {
    return {
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const householdId = householdOf(name, where, path)
        calls.deletes.push({ model: name, where })
        return { count: drop ? drop(householdId) : 0 }
      },
    }
  }

  const c = () => world.contents.rows
  function dropBy<K extends 'items' | 'tags' | 'tagTypes' | 'vendors' | 'recipes' | 'shelves'>(key: K) {
    return (householdId: string) => {
      const before = c()[key].length
      ;(c()[key] as { householdId: string }[]) = (c()[key] as { householdId: string }[]).filter(
        (r) => r.householdId !== householdId,
      )
      return before - c()[key].length
    }
  }

  world.extend({
    inventoryLog: model('inventoryLog', ['location'], (hh) => {
      const ids = locationsOf(hh)
      const before = c().inventoryLogs.length
      c().inventoryLogs = c().inventoryLogs.filter((r) => !ids.includes(r.locationId))
      return before - c().inventoryLogs.length
    }),
    cartItem: model('cartItem', ['cart', 'location'], (hh) => {
      const ids = locationsOf(hh)
      const cartIds = c().carts.filter((r) => ids.includes(r.locationId)).map((r) => r.id)
      const before = c().cartItems.length
      c().cartItems = c().cartItems.filter((r) => !cartIds.includes(r.cartId))
      return before - c().cartItems.length
    }),
    cart: model('cart', ['location'], (hh) => {
      const ids = locationsOf(hh)
      const before = c().carts.length
      c().carts = c().carts.filter((r) => !ids.includes(r.locationId))
      return before - c().carts.length
    }),
    recipeItem: model('recipeItem', ['recipe']),
    recipe: model('recipe', [], dropBy('recipes')),
    itemTag: model('itemTag', ['item']),
    itemVendor: model('itemVendor', ['item']),
    item: model('item', [], dropBy('items')),
    tag: model('tag', [], dropBy('tags')),
    tagType: model('tagType', [], dropBy('tagTypes')),
    vendor: model('vendor', [], dropBy('vendors')),
    shelf: model('shelf', [], dropBy('shelves')),
  })

  // The lock order: every `User` write and every household lock, in order.
  const client = world.client as unknown as Record<string, Record<string, (...a: unknown[]) => unknown>>
  const userUpsert = client.user.upsert
  client.user.upsert = (...args: unknown[]) => {
    calls.log.push(`user:${(args[0] as { where: { id: string } }).where.id}`)
    return userUpsert(...args)
  }
  const householdUpdateMany = client.household.updateMany
  client.household.updateMany = (...args: unknown[]) => {
    calls.log.push(`lock:${(args[0] as { where: { id: string } }).where.id}`)
    return householdUpdateMany(...args)
  }

  const worldTransaction = client.$transaction as unknown as (arg: unknown) => Promise<unknown>
  async function $transaction(arg: unknown, _options?: unknown) {
    const override = calls.nextTransaction
    if (override) {
      calls.nextTransaction = null
      return override((fn) => worldTransaction(fn), arg)
    }
    return worldTransaction(arg)
  }
  return { prisma: { ...world.client, $transaction, $world: world } }
})

import { prisma } from './prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import { handleClerkEvent } from './clerkWebhook.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const OWEN = 'user_owen'
const MIA = 'user_mia'
const KAI = 'user_kai'
const BOB = 'user_bob'
const CAL = 'user_cal'
const BEA = 'user_bea'
const DEX = 'user_dex'
const YUKI = 'user_yuki'
const PAT = 'user_pat'

const LOC_1 = 'loc_1'
const LOC_2 = 'loc_2'
const LOC_Z = 'loc_z'
const LOC_3 = 'loc_3'

const T0 = new Date('2026-01-01T00:00:00.000Z')
const GONE = new Date('2026-11-19T00:00:00.000Z')
const NOW = new Date('2026-11-20T12:00:00.000Z')

function loc(id: string, householdId: string, order: number): FakeLocation {
  return { id, householdId, name: `${id} name`, order, createdAt: T0, updatedAt: T0 }
}

function user(id: string, extra: Partial<UserRow> = {}): UserRow {
  return {
    id,
    displayName: id.replace('user_', ''),
    email: null,
    lastSeenAt: null,
    deletedAt: null,
    householdSetupAt: T0,
    activeHouseholdId: null,
    locationSort: null,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  }
}

function offer(
  id: string,
  householdId: string,
  toUserId: string,
  kind: 'transfer' | 'handover',
  fromUserId: string | null = null,
): OwnershipOfferRow {
  return { id, householdId, toUserId, fromUserId, kind, createdAt: T0, dismissedAt: null }
}

function invite(id: string, householdId: string, createdById: string): HouseholdInviteRow {
  return {
    id,
    householdId,
    token: `tok_${id}`,
    householdRole: 'member',
    locationRoles: [],
    createdById,
    createdAt: T0,
    expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    usedAt: null,
    usedById: null,
    revokedAt: null,
  }
}

type Hh1 = {
  /** hh_1's people besides OWEN (owner) and DEX (deleted member). */
  members?: { userId: string; role: 'manager' | 'member' }[]
  /** Extra location role rows. */
  roles?: { locationId: string; userId: string; role: 'organizer' | 'participant' | 'viewer' }[]
  offers?: OwnershipOfferRow[]
  invites?: HouseholdInviteRow[]
  /** Extra households, members and users (for the "two households" tests). */
  extraHouseholds?: ReturnType<typeof householdRow>[]
  extraMembers?: ReturnType<typeof householdMemberRow>[]
  extraUsers?: UserRow[]
  /** Leave DEX out of hh_1. */
  noDex?: boolean
}

function seed(opts: Hh1 = {}) {
  world.reset()
  world.stock.reset(
    [loc(LOC_1, 'hh_1', 0), loc(LOC_2, 'hh_1', 1), loc(LOC_Z, 'hh_2', 0), loc(LOC_3, 'hh_3', 0)],
    [],
  )
  const members = opts.members ?? []
  world.seedHouseholds({
    households: [householdRow('hh_1', OWEN), householdRow('hh_2', YUKI), ...(opts.extraHouseholds ?? [])],
    householdMembers: [
      // Seeded with hh_2 first, so a lock in "membership order" is not sorted.
      householdMemberRow('hh_2', YUKI, 'owner'),
      householdMemberRow('hh_2', BEA, 'manager'),
      ...(opts.extraMembers ?? []),
      householdMemberRow('hh_1', OWEN, 'owner'),
      ...members.map((m) => householdMemberRow('hh_1', m.userId, m.role)),
      ...(opts.noDex ? [] : [householdMemberRow('hh_1', DEX, 'member')]),
    ],
    locationMembers: [
      locationMemberRow(LOC_1, OWEN, 'organizer'),
      ...(opts.noDex ? [] : [locationMemberRow(LOC_1, DEX, 'organizer')]),
      locationMemberRow(LOC_Z, YUKI, 'organizer'),
      locationMemberRow(LOC_Z, BEA, 'viewer'),
      ...(opts.roles ?? []).map((r) => locationMemberRow(r.locationId, r.userId, r.role)),
    ],
    householdInvites: [invite('inv_bea', 'hh_2', BEA), ...(opts.invites ?? [])],
    ownershipOffers: [offer('off_hh2', 'hh_2', BEA, 'transfer', YUKI), ...(opts.offers ?? [])],
  })
  world.users.reset([
    user(OWEN, { activeHouseholdId: 'hh_1' }),
    user(YUKI, { activeHouseholdId: 'hh_2' }),
    user(BEA, { activeHouseholdId: 'hh_2' }),
    user(DEX, { deletedAt: GONE }),
    ...members.map((m) => user(m.userId, { activeHouseholdId: 'hh_1' })),
    ...(opts.extraUsers ?? []),
  ])
}

/** The rows of one household, for "this household did not change". */
function rowsOf(householdId: string) {
  const s = world.households.state
  const locs = world.stock.state.locations.filter((l) => l.householdId === householdId).map((l) => l.id)
  return structuredClone({
    household: s.households.find((h) => h.id === householdId),
    members: s.householdMembers.filter((m) => m.householdId === householdId),
    roles: s.locationMembers.filter((m) => locs.includes(m.locationId)),
    invites: s.householdInvites.filter((i) => i.householdId === householdId),
    offers: s.ownershipOffers.filter((o) => o.householdId === householdId),
    activity: s.householdActivities.filter((a) => a.householdId === householdId),
    locations: world.stock.state.locations.filter((l) => l.householdId === householdId),
  })
}

/** Every store, for "nothing changed at all". */
function everything() {
  return structuredClone({
    users: world.users.state.rows,
    households: world.households.state,
    stock: world.stock.state,
    contents: world.contents.rows,
  })
}

/** `householdId:toUserId:kind:dismissed`, sorted. */
function offersOf(householdId: string): string[] {
  return world.households.state.ownershipOffers
    .filter((o) => o.householdId === householdId)
    .map((o) => `${o.householdId}:${o.toUserId}:${o.kind}:${o.dismissedAt ? 'd' : '-'}`)
    .sort()
}

function activityOf(householdId: string) {
  return world.households.state.householdActivities
    .filter((a) => a.householdId === householdId)
    .map((a) => ({ action: a.action, actorId: a.actorId, targetUserId: a.targetUserId, details: a.details }))
}

const deleteAccount = (id: string) => handleClerkEvent({ type: 'user.deleted', data: { id } })

const conflict = () => Object.assign(new Error('write conflict'), { code: 'P2034' })

let seen: ChangeEvent[] = []
let unsubscribe: () => void = () => undefined

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  calls.log = []
  calls.deletes = []
  calls.nextTransaction = null
  seen = []
  unsubscribe = liveEvents.subscribe((event) => {
    seen.push(event)
  })
})

afterEach(() => {
  unsubscribe()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the owner was the only person', () => {
  it('the household and all its data are deleted; the other household is untouched', async () => {
    // Given OWEN alone in hh_1 (no DEX), with a tag, a tag type, an item,
    // stock, a log and a cart row at LOC_1, and the same kinds of rows in hh_2
    seed({ noDex: true })
    world.stock.state.itemStocks.push(
      makeStock({ id: 'st_1', itemId: 'item_1', locationId: LOC_1 }),
      makeStock({ id: 'st_z', itemId: 'item_z', locationId: LOC_Z }),
    )
    world.contents.rows.items.push({ householdId: 'hh_1' }, { householdId: 'hh_2' })
    world.contents.rows.tags.push({ householdId: 'hh_1' }, { householdId: 'hh_2' })
    world.contents.rows.tagTypes.push({ householdId: 'hh_1' }, { householdId: 'hh_2' })
    world.contents.rows.inventoryLogs.push({ locationId: LOC_1 }, { locationId: LOC_Z })
    world.contents.rows.carts.push({ id: 'cart_1', locationId: LOC_1 }, { id: 'cart_z', locationId: LOC_Z })
    world.contents.rows.cartItems.push({ cartId: 'cart_1' }, { cartId: 'cart_z' })
    const hh2 = rowsOf('hh_2')

    // When OWEN's account is deleted
    await deleteAccount(OWEN)

    // Then hh_1 and every row of it are gone
    expect(world.households.state.households.map((h) => h.id)).toEqual(['hh_2'])
    expect(world.stock.state.locations.map((l) => l.id).sort()).toEqual([LOC_3, LOC_Z])
    expect(world.stock.state.itemStocks.map((s) => s.locationId)).toEqual([LOC_Z])
    expect(world.contents.rows.items).toEqual([{ householdId: 'hh_2' }])
    expect(world.contents.rows.tags).toEqual([{ householdId: 'hh_2' }])
    expect(world.contents.rows.tagTypes).toEqual([{ householdId: 'hh_2' }])
    expect(world.contents.rows.inventoryLogs).toEqual([{ locationId: LOC_Z }])
    expect(world.contents.rows.carts).toEqual([{ id: 'cart_z', locationId: LOC_Z }])
    expect(world.contents.rows.cartItems).toEqual([{ cartId: 'cart_z' }])
    // And it went through the ordered delete (decision T64), scoped to hh_1:
    // the tag before the tag type (`Tag.type` is NoAction)
    const models = calls.deletes.map((d) => d.model)
    expect(models).toEqual(expect.arrayContaining(['inventoryLog', 'cartItem', 'cart', 'item', 'tag', 'tagType']))
    expect(models.indexOf('tag')).toBeLessThan(models.indexOf('tagType'))
    expect(JSON.stringify(calls.deletes)).not.toContain('hh_2')
    // And hh_2 is untouched
    expect(rowsOf('hh_2')).toEqual(hh2)
    // And OWEN's row is kept, marked deleted
    expect(world.users.state.rows.find((u) => u.id === OWEN)?.deletedAt).toEqual(NOW)
    // And no event: hh_1 no longer exists, and hh_2 did not change
    expect(seen).toEqual([])
  })

  it('the owner was the only LIVE person (the other member is a deleted account): the same (Y12)', async () => {
    // Given OWEN and DEX in hh_1; DEX's account is already deleted
    seed()
    const hh2 = rowsOf('hh_2')

    // When OWEN's account is deleted
    await deleteAccount(OWEN)

    // Then hh_1 is deleted, with DEX's leftover rows, and no offer goes to DEX
    expect(world.households.state.households.map((h) => h.id)).toEqual(['hh_2'])
    expect(world.households.state.householdMembers.some((m) => m.householdId === 'hh_1')).toBe(false)
    expect(world.households.state.ownershipOffers.some((o) => o.toUserId === DEX)).toBe(false)
    expect(rowsOf('hh_2')).toEqual(hh2)
    expect(seen).toEqual([])
  })
})

describe('the owner leaves other people', () => {
  it('with managers: every manager gets a hand-over offer, members get none', async () => {
    // Given hh_1 with two managers (KAI, MIA) and a member (BOB) who
    // organizes LOC_2
    seed({
      members: [
        { userId: MIA, role: 'manager' },
        { userId: KAI, role: 'manager' },
        { userId: BOB, role: 'member' },
      ],
      roles: [{ locationId: LOC_2, userId: BOB, role: 'organizer' }],
    })
    const hh2 = rowsOf('hh_2')

    // When OWEN's account is deleted
    await deleteAccount(OWEN)

    // Then hh_1 has no owner, since now
    const hh1 = world.households.state.households.find((h) => h.id === 'hh_1')
    expect(hh1).toMatchObject({ ownerId: null, ownerGoneAt: NOW })
    // And each manager has a hand-over offer; BOB and DEX have none
    expect(offersOf('hh_1')).toEqual(['hh_1:user_kai:handover:-', 'hh_1:user_mia:handover:-'])
    // And one HANDOVER_STARTED row names them, with OWEN as the actor (T50)
    expect(activityOf('hh_1')).toEqual([
      { action: 'HANDOVER_STARTED', actorId: OWEN, targetUserId: null, details: { offeredTo: [KAI, MIA] } },
    ])
    // And OWEN's member row and role rows in hh_1 are gone
    expect(world.households.state.householdMembers.some((m) => m.userId === OWEN)).toBe(false)
    expect(world.households.state.locationMembers.some((m) => m.userId === OWEN)).toBe(false)
    // And hh_2 is untouched
    expect(rowsOf('hh_2')).toEqual(hh2)
    // And one household-level LOCATION for hh_1, with no sourceClientId
    expect(seen).toEqual([{ kind: 'LOCATION', householdId: 'hh_1', locationId: null }])
  })

  it('no managers, some members organize a location: only those members get an offer', async () => {
    // Given BOB organizes LOC_2 of hh_1. CAL organizes LOC_Z, but LOC_Z is in
    // hh_2 (CAL is a member there too), so it does not count for hh_1. DEX
    // (deleted) organizes LOC_1
    seed({
      members: [
        { userId: BOB, role: 'member' },
        { userId: CAL, role: 'member' },
      ],
      roles: [
        { locationId: LOC_2, userId: BOB, role: 'organizer' },
        { locationId: LOC_Z, userId: CAL, role: 'organizer' },
      ],
      extraMembers: [householdMemberRow('hh_2', CAL, 'member')],
    })

    // When OWEN's account is deleted
    await deleteAccount(OWEN)

    // Then only BOB gets an offer
    expect(offersOf('hh_1')).toEqual(['hh_1:user_bob:handover:-'])
  })

  it('no managers, nobody here organizes: every live member gets an offer', async () => {
    // Given BOB and CAL, neither organizes a location of hh_1 (CAL organizes
    // LOC_Z of hh_2); DEX (deleted) organizes LOC_1
    seed({
      members: [
        { userId: BOB, role: 'member' },
        { userId: CAL, role: 'member' },
      ],
      roles: [{ locationId: LOC_Z, userId: CAL, role: 'organizer' }],
      extraMembers: [householdMemberRow('hh_2', CAL, 'member')],
    })

    // When OWEN's account is deleted
    await deleteAccount(OWEN)

    // Then BOB and CAL get offers; DEX does not
    expect(offersOf('hh_1')).toEqual(['hh_1:user_bob:handover:-', 'hh_1:user_cal:handover:-'])
  })

  it('a pending transfer offer is dropped (T63); the table decides who gets an offer', async () => {
    // Given OWEN had offered hh_1 to BOB (a member); MIA is a manager
    seed({
      members: [
        { userId: MIA, role: 'manager' },
        { userId: BOB, role: 'member' },
      ],
      offers: [offer('off_bob', 'hh_1', BOB, 'transfer', OWEN)],
    })

    // When OWEN's account is deleted
    await deleteAccount(OWEN)

    // Then the transfer offer is gone, and only MIA (the manager) has an offer
    expect(offersOf('hh_1')).toEqual(['hh_1:user_mia:handover:-'])
  })

  it('the person who had the transfer offer gets a hand-over offer when the table names them', async () => {
    // Given OWEN had offered hh_1 to BOB; no managers, nobody organizes
    seed({
      members: [{ userId: BOB, role: 'member' }],
      offers: [offer('off_bob', 'hh_1', BOB, 'transfer', OWEN)],
    })

    // When OWEN's account is deleted
    await deleteAccount(OWEN)

    // Then BOB has one offer, of kind handover
    expect(offersOf('hh_1')).toEqual(['hh_1:user_bob:handover:-'])
  })
})

// Owner decision O43 (households H6b task K.4b): a deleted OWNER's open
// invites are revoked, the same as a removed manager's (O20) and a deleted
// manager's or member's (task K.4, through `removeFromHousehold`).
describe("a deleted owner's invites (O43)", () => {
  const USED = new Date('2026-11-10T00:00:00.000Z')

  function ownerInvites() {
    return [
      // OWEN's open invite of hh_1: revoked
      invite('inv_owen', 'hh_1', OWEN),
      // MIA's open invite of hh_1: stays open
      invite('inv_mia', 'hh_1', MIA),
      // OWEN's used invite of hh_1: unchanged
      { ...invite('inv_owen_used', 'hh_1', OWEN), usedAt: USED, usedById: BOB },
      // OWEN's invite of hh_1 revoked earlier: keeps its first date
      { ...invite('inv_owen_revoked', 'hh_1', OWEN), revokedAt: GONE },
      // OWEN's open invite of hh_2, where OWEN is only a manager: revoked
      // through `removeFromHousehold` (task K.4)
      invite('inv_owen_hh2', 'hh_2', OWEN),
      // OWEN's open invite of hh_3, a household OWEN is no longer in: a write
      // for hh_1 must not reach it
      invite('inv_owen_hh3', 'hh_3', OWEN),
    ]
  }

  function seedOwnerWithInvites() {
    seed({
      members: [
        { userId: MIA, role: 'manager' },
        { userId: BOB, role: 'member' },
      ],
      extraHouseholds: [householdRow('hh_3', PAT)],
      extraMembers: [householdMemberRow('hh_2', OWEN, 'manager'), householdMemberRow('hh_3', PAT, 'owner')],
      extraUsers: [user(PAT)],
      invites: ownerInvites(),
    })
  }

  const revokedAtOf = (id: string) => world.households.state.householdInvites.find((i) => i.id === id)?.revokedAt

  it('the household is handed over: only the open invites the owner made in it are revoked', async () => {
    // Given OWEN owns hh_1 (with MIA and BOB), is a manager of hh_2, and made
    // the invites above
    seedOwnerWithInvites()
    const before = structuredClone(world.households.state.householdInvites)

    // When OWEN's account is deleted
    await deleteAccount(OWEN)

    // Then hh_1 is handed over (the owner branch ran)
    expect(offersOf('hh_1')).toEqual(['hh_1:user_mia:handover:-'])
    // And OWEN's open invites of hh_1 and hh_2 are revoked, now
    expect(revokedAtOf('inv_owen')).toEqual(NOW)
    expect(revokedAtOf('inv_owen_hh2')).toEqual(NOW)
    // And every other invite is exactly as it was: MIA's and BEA's stay
    // open, the used one is not revoked, the revoked one keeps its date,
    // and hh_3's stays open
    const changed = new Set(['inv_owen', 'inv_owen_hh2'])
    expect(world.households.state.householdInvites.filter((i) => !changed.has(i.id))).toEqual(
      before.filter((i) => !changed.has(i.id)),
    )
    expect(revokedAtOf('inv_mia')).toBeNull()
    expect(revokedAtOf('inv_bea')).toBeNull()
    expect(revokedAtOf('inv_owen_used')).toBeNull()
    expect(revokedAtOf('inv_owen_revoked')).toEqual(GONE)
    expect(revokedAtOf('inv_owen_hh3')).toBeNull()
  })

  it('a repeat delivery keeps the first revokedAt', async () => {
    // Given the hand-over already ran at NOW
    seedOwnerWithInvites()
    await deleteAccount(OWEN)

    // When the event arrives again an hour later
    vi.setSystemTime(new Date(NOW.getTime() + 3_600_000))
    await deleteAccount(OWEN)

    // Then the revoked invites keep the first date, and the open ones stay open
    expect(revokedAtOf('inv_owen')).toEqual(NOW)
    expect(revokedAtOf('inv_owen_hh2')).toEqual(NOW)
    expect(revokedAtOf('inv_mia')).toBeNull()
    expect(revokedAtOf('inv_owen_hh3')).toBeNull()
  })

  it('the household is deleted: its invites go with it (cascade), other households keep theirs', async () => {
    // Given OWEN alone in hh_1 (no DEX), with an open invite there, and a
    // manager of hh_2 with an open invite there
    seed({
      noDex: true,
      extraMembers: [householdMemberRow('hh_2', OWEN, 'manager')],
      invites: [invite('inv_owen', 'hh_1', OWEN), invite('inv_owen_hh2', 'hh_2', OWEN)],
    })

    // When OWEN's account is deleted
    await deleteAccount(OWEN)

    // Then hh_1's invite is gone with hh_1, and OWEN's hh_2 invite is revoked
    expect(world.households.state.householdInvites.map((i) => i.id).sort()).toEqual(['inv_bea', 'inv_owen_hh2'])
    expect(revokedAtOf('inv_owen_hh2')).toEqual(NOW)
    expect(revokedAtOf('inv_bea')).toBeNull()
  })
})

describe('a deleted manager or member', () => {
  it("their member row, location roles, open invites and offers go; ACCOUNT_DELETED; the owner's household is otherwise unchanged", async () => {
    // Given MIA, a manager of hh_1 who organizes LOC_2 and made an open invite
    seed({
      members: [
        { userId: MIA, role: 'manager' },
        { userId: BOB, role: 'member' },
      ],
      roles: [{ locationId: LOC_2, userId: MIA, role: 'organizer' }],
      invites: [invite('inv_mia', 'hh_1', MIA), invite('inv_owen', 'hh_1', OWEN)],
    })
    const hh2 = rowsOf('hh_2')
    const before = rowsOf('hh_1')

    // When MIA's account is deleted
    await deleteAccount(MIA)

    // Then MIA's rows in hh_1 are gone, and only hers
    const after = rowsOf('hh_1')
    expect(after.household).toEqual({ ...before.household, updatedAt: NOW })
    expect(after.members).toEqual(before.members.filter((m) => m.userId !== MIA))
    expect(after.roles).toEqual(before.roles.filter((m) => m.userId !== MIA))
    // And her invite is revoked; OWEN's stays open
    expect(after.invites.find((i) => i.id === 'inv_mia')?.revokedAt).toEqual(NOW)
    expect(after.invites.find((i) => i.id === 'inv_owen')?.revokedAt).toBeNull()
    // And one ACCOUNT_DELETED row, with MIA as the actor (T50)
    expect(activityOf('hh_1')).toEqual([
      { action: 'ACCOUNT_DELETED', actorId: MIA, targetUserId: null, details: null },
    ])
    expect(rowsOf('hh_2')).toEqual(hh2)
    expect(seen).toEqual([{ kind: 'LOCATION', householdId: 'hh_1', locationId: null }])
  })

  it('a deleted person who had the last hand-over offer: the hand-over starts again (T62)', async () => {
    // Given hh_3 has no owner; MIA (manager) has its only offer; PAT is a member
    seed({
      extraHouseholds: [{ ...householdRow('hh_3', PAT), ownerId: null, ownerGoneAt: GONE }],
      extraMembers: [householdMemberRow('hh_3', MIA, 'manager'), householdMemberRow('hh_3', PAT, 'member')],
      extraUsers: [user(MIA), user(PAT)],
      offers: [offer('off_mia', 'hh_3', MIA, 'handover')],
    })

    // When MIA's account is deleted
    await deleteAccount(MIA)

    // Then PAT gets a hand-over offer, and the log has both rows
    expect(offersOf('hh_3')).toEqual(['hh_3:user_pat:handover:-'])
    expect(activityOf('hh_3').map((a) => a.action).sort()).toEqual(['ACCOUNT_DELETED', 'HANDOVER_STARTED'])
    expect(seen).toEqual([{ kind: 'LOCATION', householdId: 'hh_3', locationId: null }])
  })
})

// Owner decision O37-A: the last LIVE person of a household that has no live
// owner takes the household with them. `leaveHousehold` deletes it; an
// account deletion must too, or the household stays with nobody who can ever
// reach its data (O37 option C, which the owner rejected).
describe('a deleted manager or member who was the last live person', () => {
  it('a household with no owner: it is deleted with its data, and gets no event', async () => {
    // Given hh_3 has no owner (a hand-over nobody accepted); MIA (manager)
    // has its only offer; DEX is a member whose account is already deleted;
    // LOC_3 holds stock
    seed({
      extraHouseholds: [{ ...householdRow('hh_3', PAT), ownerId: null, ownerGoneAt: GONE }],
      extraMembers: [householdMemberRow('hh_3', MIA, 'manager'), householdMemberRow('hh_3', DEX, 'member')],
      extraUsers: [user(MIA, { activeHouseholdId: 'hh_3' })],
      offers: [offer('off_mia', 'hh_3', MIA, 'handover')],
    })
    world.stock.state.itemStocks.push(makeStock({ id: 'st_3', itemId: 'item_3', locationId: LOC_3 }))
    world.contents.rows.items.push({ householdId: 'hh_3' })
    const hh2 = rowsOf('hh_2')

    // When MIA's account is deleted
    await deleteAccount(MIA)

    // Then hh_3 and its data are gone, through the ordered delete
    expect(world.households.state.households.map((h) => h.id).sort()).toEqual(['hh_1', 'hh_2'])
    expect(world.stock.state.locations.some((l) => l.id === LOC_3)).toBe(false)
    expect(world.stock.state.itemStocks.some((s) => s.locationId === LOC_3)).toBe(false)
    expect(world.contents.rows.items).toEqual([])
    expect(calls.deletes.map((d) => d.model)).toContain('item')
    // And no offer to DEX, and hh_2 is untouched
    expect(world.households.state.ownershipOffers.some((o) => o.toUserId === DEX)).toBe(false)
    expect(rowsOf('hh_2')).toEqual(hh2)
    // And no event: hh_3 no longer exists
    expect(seen).toEqual([])
  })

  it('a household whose owner account was deleted before the hand-over existed: the same', async () => {
    // Given hh_3 still names PAT as owner, but PAT's account is deleted (an
    // account deleted before H6, so no hand-over ran); MIA is the only live member
    seed({
      extraHouseholds: [householdRow('hh_3', PAT)],
      extraMembers: [householdMemberRow('hh_3', PAT, 'owner'), householdMemberRow('hh_3', MIA, 'member')],
      extraUsers: [user(PAT, { deletedAt: GONE }), user(MIA)],
    })

    // When MIA's account is deleted
    await deleteAccount(MIA)

    // Then hh_3 is gone, and nothing is sent
    expect(world.households.state.households.map((h) => h.id).sort()).toEqual(['hh_1', 'hh_2'])
    expect(seen).toEqual([])
  })
})

describe('a person in two households', () => {
  it('owner of one and manager of another: both handled in one transaction, User row first, households sorted', async () => {
    // Given OWEN owns hh_1 (with MIA, a manager) and is a manager of hh_2
    seed({
      members: [{ userId: MIA, role: 'manager' }],
      extraMembers: [householdMemberRow('hh_2', OWEN, 'manager')],
    })
    const transaction = vi.spyOn(prisma, '$transaction')

    // When OWEN's account is deleted
    await deleteAccount(OWEN)

    // Then one transaction; the User row is written first, then the
    // households are locked in sorted order (decision T16)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(calls.log.slice(0, 3)).toEqual([`user:${OWEN}`, 'lock:hh_1', 'lock:hh_2'])
    // And hh_1 is handed over, and OWEN left hh_2
    expect(offersOf('hh_1')).toEqual(['hh_1:user_mia:handover:-'])
    expect(world.households.state.householdMembers.some((m) => m.userId === OWEN)).toBe(false)
    expect(activityOf('hh_2')).toEqual([
      { action: 'ACCOUNT_DELETED', actorId: OWEN, targetUserId: null, details: null },
    ])
    // And hh_2's owner is unchanged
    expect(world.households.state.households.find((h) => h.id === 'hh_2')?.ownerId).toBe(YUKI)
    // And one LOCATION per household
    expect(seen).toEqual([
      { kind: 'LOCATION', householdId: 'hh_1', locationId: null },
      { kind: 'LOCATION', householdId: 'hh_2', locationId: null },
    ])
  })

  it('the only person of one household and a manager of another: one is deleted, the other gets an event', async () => {
    // Given OWEN alone in hh_1 and a manager of hh_2
    seed({ noDex: true, extraMembers: [householdMemberRow('hh_2', OWEN, 'manager')] })

    // When OWEN's account is deleted
    await deleteAccount(OWEN)

    // Then hh_1 is gone, and only hh_2 gets an event
    expect(world.households.state.households.map((h) => h.id)).toEqual(['hh_2'])
    expect(seen).toEqual([{ kind: 'LOCATION', householdId: 'hh_2', locationId: null }])
  })
})

describe('safe to repeat (Svix retries)', () => {
  it('the same event twice: the second run changes nothing and writes no row', async () => {
    // Given the hand-over already ran once
    seed({ members: [{ userId: MIA, role: 'manager' }] })
    await deleteAccount(OWEN)
    const after = everything()
    seen = []

    // When the same event arrives again
    await deleteAccount(OWEN)

    // Then nothing changed, the first deletedAt included, and nothing is sent
    expect(everything()).toEqual(after)
    expect(seen).toEqual([])
  })

  it('a later delivery keeps the first deletedAt', async () => {
    // Given OWEN was deleted at NOW
    seed({ noDex: true })
    await deleteAccount(OWEN)

    // When the event arrives again an hour later
    vi.setSystemTime(new Date(NOW.getTime() + 3_600_000))
    await deleteAccount(OWEN)

    // Then deletedAt is still the first one
    expect(world.users.state.rows.find((u) => u.id === OWEN)?.deletedAt).toEqual(NOW)
  })

  it('an id with no User row: the row is created deleted, and nothing else changes', async () => {
    // Given no row for this id
    seed()
    const before = everything()

    // When user.deleted arrives for it
    await deleteAccount('user_unknown')

    // Then one new row, deleted, named "Deleted user"
    const created = world.users.state.rows.find((u) => u.id === 'user_unknown')
    expect(created).toMatchObject({ displayName: 'Deleted user', deletedAt: NOW })
    // And nothing else changed
    expect({ ...everything(), users: before.users }).toEqual(before)
    expect(world.users.state.rows.filter((u) => u.id !== 'user_unknown')).toEqual(before.users)
    expect(seen).toEqual([])
  })
})

describe('P2034 (a deadlock or a write conflict)', () => {
  it('on the first try: one retry, one set of rows', async () => {
    // Given the first transaction does all its writes, then fails with P2034
    seed({ members: [{ userId: MIA, role: 'manager' }] })
    calls.nextTransaction = (run, fn) =>
      run(async (tx: unknown) => {
        await (fn as (t: unknown) => Promise<unknown>)(tx)
        throw conflict()
      })

    // When OWEN's account is deleted
    await deleteAccount(OWEN)

    // Then the work ran again, and its rows are there once
    expect(offersOf('hh_1')).toEqual(['hh_1:user_mia:handover:-'])
    expect(activityOf('hh_1')).toHaveLength(1)
    expect(seen).toEqual([{ kind: 'LOCATION', householdId: 'hh_1', locationId: null }])
  })

  it('on both tries: the error reaches the caller, nothing is written, nothing is sent', async () => {
    // Given every transaction fails with P2034 after its writes
    seed({ members: [{ userId: MIA, role: 'manager' }] })
    const before = everything()
    const failing = (run: (fn: unknown) => Promise<unknown>, fn: unknown) =>
      run(async (tx: unknown) => {
        await (fn as (t: unknown) => Promise<unknown>)(tx)
        throw conflict()
      })
    calls.nextTransaction = (run, fn) => {
      calls.nextTransaction = failing
      return failing(run, fn)
    }

    // When OWEN's account is deleted, Then it throws P2034 (the route answers
    // 500, and Svix tries again later)
    await expect(deleteAccount(OWEN)).rejects.toMatchObject({ code: 'P2034' })
    expect(everything()).toEqual(before)
    expect(seen).toEqual([])
  })

  it('another error is not retried', async () => {
    seed({ members: [{ userId: MIA, role: 'manager' }] })
    const transaction = vi.spyOn(prisma, '$transaction')
    calls.nextTransaction = () => Promise.reject(new Error('boom'))

    await expect(deleteAccount(OWEN)).rejects.toThrow('boom')
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([])
  })
})
