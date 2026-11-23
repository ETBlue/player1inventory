import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { OwnershipOfferRow } from '../test/householdFake.js'
import type { FakeLocation } from '../test/stockFake.js'
import type { UserRow } from '../test/userFake.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'

// Transfer and hand-over: the ownership offers (households H6b, task K.3;
// plan docs/global/permissions/2026-11-20-households-plan-h6.md, decisions
// T52, T58, T59, T62 and T65, owner decision O37-A).
//
// ── THE FIXTURE ──
//
// | Person | hh_1                        | hh_2    | hh_3     | Acts in | Location roles           |
// |--------|-----------------------------|---------|----------|---------|--------------------------|
// | OWEN   | owner                       | —       | —        | hh_1    | none                     |
// | MIA    | manager                     | —       | —        | hh_1    | LOC_1 organizer          |
// | BOB    | member                      | —       | —        | hh_1    | LOC_1 participant        |
// | BEA    | member                      | manager | —        | hh_1    | LOC_2 organizer, LOC_Z viewer |
// | DEX    | member, ACCOUNT DELETED     | —       | member, DELETED | hh_1 | LOC_2 organizer     |
// | YUKI   | —                           | owner   | —        | hh_2    | LOC_Z organizer          |
// | PAT    | —                           | —       | manager  | hh_3    | LOC_3 organizer          |
//
// hh_2 has an open transfer offer from YUKI to BEA from the start. So a
// write in hh_1 that is not scoped to one household would touch it.
//
// BEA is in two households and acts in hh_1, so accepting the hh_2 offer
// must change hh_2, not the household she acts in.
//
// DEX's account is deleted. DEX organizes LOC_2, so the hand-over table
// would offer hh_1 to DEX if it counted deleted accounts.
//
// hh_3 has NO owner, from the start: a hand-over nobody accepted. PAT is the
// only live person there; DEX is a member with a deleted account.
//
// `ownerless()` turns hh_1 into a household with no owner (what task K.4's
// hand-over leaves), with the offers a test asks for.

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  // `deleteHouseholdData` (the last person's leave, O37-A) deletes models
  // the world does not own. They only RECORD their `deleteMany` here;
  // `deleteHouseholdData.test.ts` and `purges.resolver.test.ts` prove those
  // filters on rows. A test reads the recorded `where` to see the scope.
  const recorders: Record<string, unknown> = {}
  for (const model of [
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
  ]) {
    recorders[model] = { deleteMany: vi.fn(async () => ({ count: 0 })) }
  }
  world.extend(recorders)
  // The global `prisma` gets its OWN copy of each model object, over the
  // same stores. A `$transaction` callback receives `world.client` as `tx`,
  // so a spy on `prisma.<model>` sees only reads made OUTSIDE a transaction,
  // and a spy on `world.client.<model>` only reads through `tx`.
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
const BOB = 'user_bob'
const BEA = 'user_bea'
const DEX = 'user_dex'
const YUKI = 'user_yuki'
const PAT = 'user_pat'

const LOC_1 = 'loc_1'
const LOC_2 = 'loc_2'
const LOC_Z = 'loc_z'
const LOC_3 = 'loc_3'

const TAB = 'tab-1'
const T0 = new Date('2026-01-01T00:00:00.000Z')
const NOW = new Date('2026-11-20T12:00:00.000Z')
const GONE = new Date('2026-11-19T00:00:00.000Z')

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
    locationSort: null,
    createdAt: T0,
    updatedAt: T0,
  }
}

function offer(
  id: string,
  householdId: string,
  toUserId: string,
  kind: 'transfer' | 'handover',
  fromUserId: string | null = null,
  createdAt: Date = T0,
): OwnershipOfferRow {
  return { id, householdId, toUserId, fromUserId, kind, createdAt, dismissedAt: null }
}

function seed() {
  world.reset()
  world.stock.reset(
    [loc(LOC_1, 'hh_1', 0), loc(LOC_2, 'hh_1', 1), loc(LOC_Z, 'hh_2', 0), loc(LOC_3, 'hh_3', 0)],
    [],
  )
  world.seedHouseholds({
    households: [
      householdRow('hh_1', OWEN),
      householdRow('hh_2', YUKI),
      { ...householdRow('hh_3', PAT), ownerId: null, ownerGoneAt: GONE },
    ],
    householdMembers: [
      householdMemberRow('hh_1', OWEN, 'owner'),
      householdMemberRow('hh_1', MIA, 'manager'),
      householdMemberRow('hh_1', BOB, 'member'),
      householdMemberRow('hh_1', BEA, 'member'),
      householdMemberRow('hh_1', DEX, 'member'),
      householdMemberRow('hh_2', YUKI, 'owner'),
      householdMemberRow('hh_2', BEA, 'manager'),
      householdMemberRow('hh_3', PAT, 'manager'),
      householdMemberRow('hh_3', DEX, 'member'),
    ],
    locationMembers: [
      locationMemberRow(LOC_1, MIA, 'organizer'),
      locationMemberRow(LOC_1, BOB, 'participant'),
      locationMemberRow(LOC_2, BEA, 'organizer'),
      locationMemberRow(LOC_2, DEX, 'organizer'),
      locationMemberRow(LOC_Z, YUKI, 'organizer'),
      locationMemberRow(LOC_Z, BEA, 'viewer'),
      locationMemberRow(LOC_3, PAT, 'organizer'),
    ],
    ownershipOffers: [
      offer('off_hh2', 'hh_2', BEA, 'transfer', YUKI),
      offer('off_hh3', 'hh_3', PAT, 'handover'),
    ],
  })
  world.users.reset([
    user(OWEN, 'Owen', 'hh_1'),
    user(MIA, 'Mia', 'hh_1'),
    user(BOB, 'Bob', 'hh_1'),
    user(BEA, 'Bea', 'hh_1'),
    { ...user(DEX, 'Dex', 'hh_1'), deletedAt: GONE },
    user(YUKI, 'Yuki', 'hh_2'),
    user(PAT, 'Pat', 'hh_3'),
  ])
}

/**
 * Make hh_1 a household with no owner, as task K.4's hand-over leaves it:
 * OWEN's rows are gone, `ownerId` is null, `ownerGoneAt` is set, and the
 * given people have hand-over offers.
 */
function ownerless(offeredTo: string[]) {
  const s = world.households.state
  s.householdMembers = s.householdMembers.filter((m) => !(m.householdId === 'hh_1' && m.userId === OWEN))
  const hh = s.households.find((h) => h.id === 'hh_1')
  if (!hh) throw new Error('no hh_1')
  hh.ownerId = null
  hh.ownerGoneAt = GONE
  for (const id of offeredTo) s.ownershipOffers.push(offer(`off_${id}`, 'hh_1', id, 'handover'))
}

let seen: ChangeEvent[] = []
let unsubscribe: () => void = () => undefined

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seed()
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

// ─── running an operation ────────────────────────────────────────────────────

const server = new ApolloServer<Context>({ typeDefs, resolvers })

type Result = {
  data?: Record<string, unknown> | null
  errors?: ReadonlyArray<{ message: string; extensions?: Record<string, unknown> }>
}

async function run(query: string, variables: Record<string, unknown>, userId: string): Promise<Result> {
  // A fresh `requestCache` per request, as `index.ts` gives one.
  const contextValue: Context = { userId, clientId: TAB, language: 'en', requestCache: {} }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult as Result
}

const OFFER = 'id householdId householdName kind toUserId toName fromName createdAt dismissedAt'

const offerTo = (actor: string, userId: string) =>
  run(`mutation O($userId: ID!) { offerOwnership(userId: $userId) { ${OFFER} } }`, { userId }, actor)
const cancel = (actor: string) => run('mutation { cancelOwnershipOffer }', {}, actor)
const accept = (actor: string, id: string) =>
  run(
    'mutation A($id: ID!) { acceptOwnershipOffer(id: $id) { id name role hasOwner } }',
    { id },
    actor,
  )
const decline = (actor: string, id: string) =>
  run('mutation D($id: ID!) { declineOwnershipOffer(id: $id) }', { id }, actor)
const dismiss = (actor: string, id: string) =>
  run('mutation D($id: ID!) { dismissOwnershipOffer(id: $id) }', { id }, actor)
const myOffers = (actor: string) => run(`query { myOwnershipOffers { ${OFFER} } }`, {}, actor)
const household = (actor: string) =>
  run(`query { household { id role hasOwner pendingTransfer { ${OFFER} } } }`, {}, actor)
const leave = (actor: string) => run('mutation { leaveHousehold }', {}, actor)
const remove = (actor: string, userId: string) =>
  run('mutation R($userId: ID!) { removeMember(userId: $userId) }', { userId }, actor)
const setRole = (actor: string, userId: string, role: string) =>
  run(
    'mutation S($userId: ID!, $role: HouseholdRole!) { setHouseholdRole(userId: $userId, role: $role) { role } }',
    { userId, role },
    actor,
  )

function code(res: Result) {
  return res.errors?.[0]?.extensions?.code
}

function reason(res: Result) {
  return res.errors?.[0]?.extensions?.reason
}

function ok<T = unknown>(res: Result, field: string): T {
  if (res.errors) throw new Error(`unexpected errors: ${JSON.stringify(res.errors)}`)
  return res.data?.[field] as T
}

/** Every offer as `household:to:kind:from`, sorted. */
function offers() {
  return world.households.state.ownershipOffers
    .map((o) => `${o.householdId}:${o.toUserId}:${o.kind}:${o.fromUserId ?? '-'}`)
    .sort()
}

function offerRow(householdId: string, toUserId: string) {
  return world.households.state.ownershipOffers.find(
    (o) => o.householdId === householdId && o.toUserId === toUserId,
  )
}

function rolesIn(householdId: string) {
  return world.households.state.householdMembers
    .filter((m) => m.householdId === householdId)
    .map((m) => `${m.userId}:${m.role}`)
    .sort()
}

function householdState(id: string) {
  const h = world.households.state.households.find((x) => x.id === id)
  return h ? { ownerId: h.ownerId, ownerGoneAt: h.ownerGoneAt } : null
}

/** The activity rows written since the seed (the seed writes none). */
function activity() {
  return world.households.state.householdActivities.map((a) => ({
    householdId: a.householdId,
    actorId: a.actorId,
    action: a.action,
    targetUserId: a.targetUserId,
    details: a.details,
  }))
}

/** Everything a refused call must leave as it was. */
function snapshot() {
  const s = world.households.state
  return structuredClone({
    households: s.households.map((h) => ({ id: h.id, ownerId: h.ownerId, ownerGoneAt: h.ownerGoneAt })),
    members: s.householdMembers,
    locationMembers: s.locationMembers,
    offers: s.ownershipOffers,
    activity: s.householdActivities,
    locations: world.stock.state.locations.map((l) => l.id),
    users: world.users.state.rows.map((r) => [r.id, r.activeHouseholdId]),
  })
}

function locationEvent(householdId: string): ChangeEvent {
  return { kind: 'LOCATION', householdId, locationId: null, sourceClientId: TAB }
}

// ─── offerOwnership ──────────────────────────────────────────────────────────

describe('offerOwnership (decision T59)', () => {
  it('household owner can offer the household to a member', async () => {
    // When OWEN offers hh_1 to BOB
    const answer = ok<Record<string, unknown>>(await offerTo(OWEN, BOB), 'offerOwnership')

    // Then BOB has one transfer offer from OWEN; hh_2's offer is untouched
    expect(offers()).toEqual([
      `hh_1:${BOB}:transfer:${OWEN}`,
      `hh_2:${BEA}:transfer:${YUKI}`,
      `hh_3:${PAT}:handover:-`,
    ])
    expect(answer).toMatchObject({
      householdId: 'hh_1',
      householdName: 'hh_1 name',
      kind: 'transfer',
      toUserId: BOB,
      toName: 'Bob',
      fromName: 'Owen',
      createdAt: NOW.toISOString(),
      dismissedAt: null,
    })
    // And one log row, and one event for hh_1
    expect(activity()).toEqual([
      {
        householdId: 'hh_1',
        actorId: OWEN,
        action: 'OWNERSHIP_OFFERED',
        targetUserId: BOB,
        details: { kind: 'transfer' },
      },
    ])
    expect(seen).toEqual([locationEvent('hh_1')])
    // And nobody's role changed yet: nobody becomes owner without agreeing
    expect(rolesIn('hh_1')).toContain(`${OWEN}:owner`)
    expect(rolesIn('hh_1')).toContain(`${BOB}:member`)
  })

  it('a second offer to someone else REPLACES the first: at most one at a time', async () => {
    ok(await offerTo(OWEN, BOB), 'offerOwnership')
    ok(await offerTo(OWEN, MIA), 'offerOwnership')

    expect(offers().filter((o) => o.startsWith('hh_1:'))).toEqual([`hh_1:${MIA}:transfer:${OWEN}`])
    // The other household's transfer offer stays: the replace is scoped
    expect(offers()).toContain(`hh_2:${BEA}:transfer:${YUKI}`)
    expect(activity().map((a) => `${a.action}:${a.targetUserId}`)).toEqual([
      `OWNERSHIP_OFFERED:${BOB}`,
      `OWNERSHIP_OFFERED:${MIA}`,
    ])
  })

  it('the same person again changes nothing: the same offer, no row, no event', async () => {
    const first = ok<{ id: string }>(await offerTo(OWEN, BOB), 'offerOwnership')
    seen = []
    const again = ok<{ id: string }>(await offerTo(OWEN, BOB), 'offerOwnership')

    expect(again.id).toBe(first.id)
    expect(activity()).toHaveLength(1)
    expect(seen).toEqual([])
  })

  it('an offer to the owner themself is BAD_USER_INPUT, and nothing changes', async () => {
    const before = snapshot()
    const res = await offerTo(OWEN, OWEN)
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(snapshot()).toEqual(before)
    expect(seen).toEqual([])
  })

  it.each([
    ['a person of another household', YUKI],
    ['a member whose account is deleted (decision T61)', DEX],
    ['an id nobody has', 'user_nobody'],
  ])('an offer to %s is FORBIDDEN, and nothing changes', async (_name, target) => {
    const before = snapshot()
    const res = await offerTo(OWEN, target)
    expect(code(res)).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
    expect(seen).toEqual([])
  })

  it.each([
    ['manager', MIA],
    ['member', BOB],
  ])('household %s cannot offer the household, and nothing changes', async (_name, actor) => {
    const before = snapshot()
    const res = await offerTo(actor, BEA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(snapshot()).toEqual(before)
  })

  it('BEA, a manager of hh_2 who acts in hh_1, cannot offer either household', async () => {
    expect(code(await offerTo(BEA, BOB))).toBe('FORBIDDEN')
    expect(offers()).toEqual([`hh_2:${BEA}:transfer:${YUKI}`, `hh_3:${PAT}:handover:-`])
  })
})

// ─── cancelOwnershipOffer ────────────────────────────────────────────────────

describe('cancelOwnershipOffer', () => {
  it('household owner can cancel the open offer', async () => {
    ok(await offerTo(OWEN, BOB), 'offerOwnership')
    seen = []

    expect(ok(await cancel(OWEN), 'cancelOwnershipOffer')).toBe(true)

    expect(offers()).toEqual([`hh_2:${BEA}:transfer:${YUKI}`, `hh_3:${PAT}:handover:-`])
    expect(activity().map((a) => `${a.action}:${a.targetUserId}`)).toEqual([
      `OWNERSHIP_OFFERED:${BOB}`,
      `OWNERSHIP_OFFER_CANCELLED:${BOB}`,
    ])
    expect(seen).toEqual([locationEvent('hh_1')])
  })

  it('with no open offer it answers false, with no row and no event; another household\'s offer stays', async () => {
    const before = snapshot()
    expect(ok(await cancel(OWEN), 'cancelOwnershipOffer')).toBe(false)
    expect(snapshot()).toEqual(before)
    expect(seen).toEqual([])
  })

  it('household manager cannot cancel', async () => {
    ok(await offerTo(OWEN, BOB), 'offerOwnership')
    expect(code(await cancel(MIA))).toBe('FORBIDDEN')
    expect(offers()).toContain(`hh_1:${BOB}:transfer:${OWEN}`)
  })
})

// ─── acceptOwnershipOffer ────────────────────────────────────────────────────

describe('acceptOwnershipOffer: a transfer', () => {
  async function offerToBob() {
    return ok<{ id: string }>(await offerTo(OWEN, BOB), 'offerOwnership').id
  }

  it('user can accept the household', async () => {
    // Given OWEN offered hh_1 to BOB
    const id = await offerToBob()
    // And hh_1 has a second offer (a hand-over offer would never sit beside
    // a transfer; this one is here only to see "every offer goes")
    world.households.state.ownershipOffers.push(offer('off_extra', 'hh_1', MIA, 'handover'))
    const locationRolesBefore = structuredClone(world.households.state.locationMembers)
    seen = []

    // When BOB accepts
    const answer = ok(await accept(BOB, id), 'acceptOwnershipOffer')

    // Then BOB owns hh_1, and OWEN is a manager
    expect(answer).toEqual({ id: 'hh_1', name: 'hh_1 name', role: 'owner', hasOwner: true })
    expect(rolesIn('hh_1')).toEqual([
      `${BEA}:member`,
      `${BOB}:owner`,
      `${DEX}:member`,
      `${MIA}:manager`,
      `${OWEN}:manager`,
    ])
    expect(householdState('hh_1')).toEqual({ ownerId: BOB, ownerGoneAt: null })
    // And every offer of hh_1 is gone; hh_2's stays
    expect(offers()).toEqual([`hh_2:${BEA}:transfer:${YUKI}`, `hh_3:${PAT}:handover:-`])
    // And location roles do not change
    expect(world.households.state.locationMembers).toEqual(locationRolesBefore)
    // And one log row, and one event
    expect(activity().slice(1)).toEqual([
      {
        householdId: 'hh_1',
        actorId: BOB,
        action: 'OWNERSHIP_ACCEPTED',
        targetUserId: OWEN,
        details: { kind: 'transfer' },
      },
    ])
    expect(seen).toEqual([locationEvent('hh_1')])
  })

  it('the old owner is demoted BEFORE the new owner is promoted (the one-owner index)', async () => {
    // The fake raises P2002 on a second owner row in one household, as the
    // partial unique index HouseholdMember_one_owner_key does. The other
    // order fails here, and in Postgres.
    const id = await offerToBob()
    const order: string[] = []
    const update = world.client.householdMember.update
    vi.spyOn(world.client.householdMember, 'update').mockImplementation(async (args) => {
      const where = args.where as { householdId_userId: { userId: string } }
      order.push(`${where.householdId_userId.userId}:${String((args.data as { role: unknown }).role)}`)
      return update(args)
    })

    ok(await accept(BOB, id), 'acceptOwnershipOffer')

    expect(order).toEqual([`${OWEN}:manager`, `${BOB}:owner`])
  })

  it('after the transfer the old owner cannot clear, rename or offer the household', async () => {
    const id = await offerToBob()
    ok(await accept(BOB, id), 'acceptOwnershipOffer')

    expect(code(await offerTo(OWEN, MIA))).toBe('FORBIDDEN')
    expect(code(await run('mutation { renameHousehold(name: "x") { id } }', {}, OWEN))).toBe('FORBIDDEN')
  })

  it.each([
    ['the owner who made it', OWEN],
    ['a manager of the household', MIA],
    ['a member of another household', YUKI],
  ])('%s cannot accept, decline or dismiss it: the same FORBIDDEN as an unknown id', async (_name, actor) => {
    const id = await offerToBob()
    const before = snapshot()
    seen = []

    const results = [
      await accept(actor, id),
      await decline(actor, id),
      await dismiss(actor, id),
    ]
    const unknown = [
      await accept(actor, 'off_unknown'),
      await decline(actor, 'off_unknown'),
      await dismiss(actor, 'off_unknown'),
    ]

    for (const res of [...results, ...unknown]) {
      expect(code(res)).toBe('FORBIDDEN')
      expect(res.errors?.[0]?.message).toBe('Forbidden')
    }
    expect(snapshot()).toEqual(before)
    expect(seen).toEqual([])
  })

  it('user can accept an offer of their OTHER household, and the household they act in does not change', async () => {
    // Given BEA acts in hh_1, and YUKI offered hh_2 to her
    expect(world.users.state.rows.find((r) => r.id === BEA)?.activeHouseholdId).toBe('hh_1')
    const hh1Before = rolesIn('hh_1')

    const answer = ok(await accept(BEA, 'off_hh2'), 'acceptOwnershipOffer')

    // Then BEA owns hh_2, and YUKI is a manager there
    expect(answer).toMatchObject({ id: 'hh_2', role: 'owner' })
    expect(rolesIn('hh_2')).toEqual([`${BEA}:owner`, `${YUKI}:manager`])
    expect(householdState('hh_2')).toEqual({ ownerId: BEA, ownerGoneAt: null })
    // And hh_1 is as it was, and BEA still acts in hh_1
    expect(rolesIn('hh_1')).toEqual(hh1Before)
    expect(householdState('hh_1')).toEqual({ ownerId: OWEN, ownerGoneAt: null })
    expect(world.users.state.rows.find((r) => r.id === BEA)?.activeHouseholdId).toBe('hh_1')
    expect(seen).toEqual([locationEvent('hh_2')])
  })
})

describe('acceptOwnershipOffer: a hand-over', () => {
  it('user can accept a hand-over: ownerGoneAt goes back to null, and every offer goes', async () => {
    // Given hh_1 has no owner, and MIA and BEA have hand-over offers
    ownerless([MIA, BEA])

    const answer = ok(await accept(BEA, `off_${BEA}`), 'acceptOwnershipOffer')

    expect(answer).toMatchObject({ id: 'hh_1', role: 'owner', hasOwner: true })
    expect(rolesIn('hh_1')).toEqual([`${BEA}:owner`, `${BOB}:member`, `${DEX}:member`, `${MIA}:manager`])
    expect(householdState('hh_1')).toEqual({ ownerId: BEA, ownerGoneAt: null })
    expect(offers().filter((o) => o.startsWith('hh_1:'))).toEqual([])
    expect(activity()).toEqual([
      {
        householdId: 'hh_1',
        actorId: BEA,
        action: 'OWNERSHIP_ACCEPTED',
        targetUserId: null,
        details: { kind: 'handover' },
      },
    ])
  })

  it('the first accept wins; the second gets OFFER_GONE and nothing changes', async () => {
    // Given hh_1 has no owner, and MIA and BEA have hand-over offers
    ownerless([MIA, BEA])
    // Both accept at the same moment. `serialTransactions` runs the two
    // transactions one after the other, as the household lock does on
    // Postgres. MIA's transaction is held at its lock, so BEA's request has
    // read her offer (outside the transaction) and waits for the lock.
    world.serialTransactions(true)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let locked: () => void = () => undefined
    const firstLock = new Promise<void>((resolve) => {
      locked = resolve
    })
    const updateMany = world.client.household.updateMany
    let calls = 0
    vi.spyOn(world.client.household, 'updateMany').mockImplementation(async (args) => {
      const result = await updateMany(args)
      if (++calls === 1) {
        locked()
        await gate
      }
      return result
    })

    const first = accept(MIA, `off_${MIA}`)
    await firstLock
    const second = accept(BEA, `off_${BEA}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
    release()

    // Then MIA owns hh_1
    ok(await first, 'acceptOwnershipOffer')
    // And BEA is told the offer is gone, and is not a second owner
    const res = await second
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(reason(res)).toBe('OFFER_GONE')
    expect(rolesIn('hh_1')).toEqual([`${BEA}:member`, `${BOB}:member`, `${DEX}:member`, `${MIA}:owner`])
    expect(householdState('hh_1')).toEqual({ ownerId: MIA, ownerGoneAt: null })
    expect(activity().map((a) => `${a.actorId}:${a.action}`)).toEqual([`${MIA}:OWNERSHIP_ACCEPTED`])
    expect(seen).toEqual([locationEvent('hh_1')])
  })

  it('a later accept of a deleted offer is FORBIDDEN, like an unknown id', async () => {
    ownerless([MIA, BEA])
    ok(await accept(MIA, `off_${MIA}`), 'acceptOwnershipOffer')
    expect(code(await accept(BEA, `off_${BEA}`))).toBe('FORBIDDEN')
  })
})

// ─── declineOwnershipOffer and dismissOwnershipOffer ─────────────────────────

describe('declineOwnershipOffer', () => {
  it('user can decline a transfer: the offer goes, OWNERSHIP_DECLINED, and the owner stays', async () => {
    const { id } = ok<{ id: string }>(await offerTo(OWEN, BOB), 'offerOwnership')
    seen = []

    expect(ok(await decline(BOB, id), 'declineOwnershipOffer')).toBe(true)

    expect(offers().filter((o) => o.startsWith('hh_1:'))).toEqual([])
    expect(activity().slice(1)).toEqual([
      {
        householdId: 'hh_1',
        actorId: BOB,
        action: 'OWNERSHIP_DECLINED',
        targetUserId: OWEN,
        details: { kind: 'transfer' },
      },
    ])
    expect(rolesIn('hh_1')).toContain(`${OWEN}:owner`)
    expect(seen).toEqual([locationEvent('hh_1')])
  })

  it('declining one of two hand-over offers leaves the other, and starts nothing new', async () => {
    ownerless([MIA, BEA])
    ok(await decline(MIA, `off_${MIA}`), 'declineOwnershipOffer')
    expect(offers().filter((o) => o.startsWith('hh_1:'))).toEqual([`hh_1:${BEA}:handover:-`])
    expect(activity().map((a) => a.action)).toEqual(['OWNERSHIP_DECLINED'])
  })

  it('declining the LAST hand-over offer offers the household to the next people of the table (T62)', async () => {
    // Given hh_1 has no owner, and only MIA, its one manager, has an offer
    ownerless([MIA])

    // When MIA declines
    ok(await decline(MIA, `off_${MIA}`), 'declineOwnershipOffer')

    // Then the table runs again WITHOUT MIA: no other manager, so the
    // members who organize a location get it. BEA organizes LOC_2. DEX
    // organizes it too, but DEX's account is deleted. BOB organizes nothing.
    expect(offers().filter((o) => o.startsWith('hh_1:'))).toEqual([`hh_1:${BEA}:handover:-`])
    expect(offerRow('hh_1', BEA)?.dismissedAt).toBeNull()
    expect(activity()).toEqual([
      {
        householdId: 'hh_1',
        actorId: MIA,
        action: 'OWNERSHIP_DECLINED',
        targetUserId: null,
        details: { kind: 'handover' },
      },
      {
        householdId: 'hh_1',
        actorId: MIA,
        action: 'HANDOVER_STARTED',
        targetUserId: null,
        details: { offeredTo: [BEA] },
      },
    ])
  })

  it('with no other manager and no organizer here, every other live member gets the offer (the table\'s last row)', async () => {
    // Given hh_1 has no owner, and only MIA, its one manager, has an offer
    ownerless([MIA])
    // And no live member organizes a location of hh_1: BEA's organizer row
    // moves from LOC_2 (hh_1) to LOC_Z (hh_2). DEX still organizes LOC_2,
    // but DEX's account is deleted. So an organizer read that is not scoped
    // to hh_1 would pick BEA alone.
    const s = world.households.state
    s.locationMembers = s.locationMembers.filter(
      (m) => !(m.userId === BEA && (m.locationId === LOC_2 || m.locationId === LOC_Z)),
    )
    s.locationMembers.push(locationMemberRow(LOC_Z, BEA, 'organizer'))

    // When MIA declines
    ok(await decline(MIA, `off_${MIA}`), 'declineOwnershipOffer')

    // Then every other live member gets an offer: BEA and BOB, not DEX
    expect(offers().filter((o) => o.startsWith('hh_1:'))).toEqual([
      `hh_1:${BEA}:handover:-`,
      `hh_1:${BOB}:handover:-`,
    ])
    expect(activity().map((a) => a.details)).toEqual([
      { kind: 'handover' },
      { offeredTo: [BEA, BOB] },
    ])
  })

  it('when nobody else is left, the person who declined gets the offer back, already dismissed', async () => {
    // hh_3: PAT is the only live person; DEX's account is deleted
    ok(await decline(PAT, 'off_hh3'), 'declineOwnershipOffer')

    expect(offers().filter((o) => o.startsWith('hh_3:'))).toEqual([`hh_3:${PAT}:handover:-`])
    expect(offerRow('hh_3', PAT)?.dismissedAt).toEqual(NOW)
  })

  it('an offer already gone answers false, with no row and no event', async () => {
    ownerless([MIA, BEA])
    // MIA's offer is deleted between her read and her lock: the accept by
    // BEA ran in between. Modelled by deleting it on the transaction's read.
    const findFirst = world.client.ownershipOffer.findFirst
    vi.spyOn(world.client.ownershipOffer, 'findFirst').mockImplementation(async (args) => {
      world.households.state.ownershipOffers = world.households.state.ownershipOffers.filter(
        (o) => o.id !== `off_${MIA}`,
      )
      return findFirst(args)
    })
    const before = activity()

    expect(ok(await decline(MIA, `off_${MIA}`), 'declineOwnershipOffer')).toBe(false)
    expect(activity()).toEqual(before)
    expect(seen).toEqual([])
  })
})

describe('dismissOwnershipOffer', () => {
  it('user can dismiss an offer: it stays, with dismissedAt set, and nothing is published', async () => {
    ownerless([MIA, BEA])

    expect(ok(await dismiss(BEA, `off_${BEA}`), 'dismissOwnershipOffer')).toBe(true)

    expect(offerRow('hh_1', BEA)?.dismissedAt).toEqual(NOW)
    expect(offerRow('hh_1', MIA)?.dismissedAt).toBeNull()
    expect(activity()).toEqual([])
    expect(seen).toEqual([])
  })

  it('a second dismiss keeps the first date', async () => {
    ownerless([BEA])
    ok(await dismiss(BEA, `off_${BEA}`), 'dismissOwnershipOffer')
    vi.setSystemTime(new Date('2026-11-21T00:00:00.000Z'))
    ok(await dismiss(BEA, `off_${BEA}`), 'dismissOwnershipOffer')
    expect(offerRow('hh_1', BEA)?.dismissedAt).toEqual(NOW)
  })

  it('a dismissed offer can still be accepted', async () => {
    ownerless([BEA])
    ok(await dismiss(BEA, `off_${BEA}`), 'dismissOwnershipOffer')
    ok(await accept(BEA, `off_${BEA}`), 'acceptOwnershipOffer')
    expect(householdState('hh_1')).toEqual({ ownerId: BEA, ownerGoneAt: null })
  })
})

// ─── the leave rule, removal and the last person ─────────────────────────────

describe('leaving, removing and the role change, with offers (task K.3)', () => {
  it('household owner cannot leave: "Transfer ownership first."', async () => {
    const res = await leave(OWEN)
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(res.errors?.[0]?.message).toBe('Transfer ownership first.')
  })

  it('setHouseholdRole to owner stays BAD_USER_INPUT: "Use Transfer ownership."', async () => {
    const res = await setRole(OWEN, MIA, 'owner')
    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(res.errors?.[0]?.message).toBe('Use Transfer ownership.')
    expect(rolesIn('hh_1')).toContain(`${OWEN}:owner`)
  })

  it('a person who leaves loses the offers to them in that household only', async () => {
    // Given OWEN offered hh_1 to BEA, and BEA has YUKI's offer of hh_2
    ok(await offerTo(OWEN, BEA), 'offerOwnership')

    ok(await leave(BEA), 'leaveHousehold')

    expect(offers()).toEqual([`hh_2:${BEA}:transfer:${YUKI}`, `hh_3:${PAT}:handover:-`])
  })

  it('a person who is removed loses the offers to them in that household', async () => {
    ok(await offerTo(OWEN, BOB), 'offerOwnership')
    ok(await remove(OWEN, BOB), 'removeMember')
    expect(offers().filter((o) => o.startsWith('hh_1:'))).toEqual([])
    // A transfer offer leaves a household WITH an owner: no hand-over starts
    expect(activity().map((a) => a.action)).toEqual(['OWNERSHIP_OFFERED', 'MEMBER_REMOVED'])
  })

  it('when the last hand-over recipient leaves, the people who remain get offers (T62)', async () => {
    // Given hh_1 has no owner, and only MIA, its one manager, has an offer
    ownerless([MIA])

    ok(await leave(MIA), 'leaveHousehold')

    // Then no manager is left; BEA organizes LOC_2, so BEA gets it
    expect(offers().filter((o) => o.startsWith('hh_1:'))).toEqual([`hh_1:${BEA}:handover:-`])
    expect(activity().map((a) => `${a.actorId}:${a.action}`)).toEqual([
      `${MIA}:HANDOVER_STARTED`,
      `${MIA}:MEMBER_LEFT`,
    ])
  })

  it('when the last hand-over recipient is removed, the people who remain get offers (T62)', async () => {
    // Given hh_1 has no owner, and only BEA has an offer
    ownerless([BEA])

    // When MIA, a manager, removes BEA... MIA may remove only a member
    ok(await remove(MIA, BEA), 'removeMember')

    // Then the table runs: MIA is a manager, so MIA gets the offer
    expect(offers().filter((o) => o.startsWith('hh_1:'))).toEqual([`hh_1:${MIA}:handover:-`])
  })

  it('a leave that leaves other offers open starts nothing new', async () => {
    ownerless([MIA, BEA])
    ok(await leave(MIA), 'leaveHousehold')
    expect(offers().filter((o) => o.startsWith('hh_1:'))).toEqual([`hh_1:${BEA}:handover:-`])
    expect(activity().map((a) => a.action)).toEqual(['MEMBER_LEFT'])
  })
})

describe('the last person leaves a household with no owner (owner decision O37-A)', () => {
  it('household manager who is the last live person deletes it by leaving, with all its data', async () => {
    // Given hh_3 has no owner; PAT is its only live person (DEX's account is
    // deleted)
    const res = await leave(PAT)

    // Then hh_3 is gone, with its location and its role rows and its offers
    expect(ok(res, 'leaveHousehold')).toBe(true)
    expect(world.households.state.households.map((h) => h.id).sort()).toEqual(['hh_1', 'hh_2'])
    expect(world.stock.state.locations.map((l) => l.id).sort()).toEqual([LOC_1, LOC_2, LOC_Z])
    expect(world.households.state.locationMembers.some((m) => m.locationId === LOC_3)).toBe(false)
    expect(offers()).toEqual([`hh_2:${BEA}:transfer:${YUKI}`])
    // And PAT no longer names it as the active household
    expect(world.users.state.rows.find((r) => r.id === PAT)?.activeHouseholdId).toBeNull()
    // And DEX keeps hh_1
    expect(rolesIn('hh_1')).toContain(`${DEX}:member`)
    // And the data delete is scoped to hh_3 (deleteHouseholdData)
    const itemDelete = (world.client as unknown as { item: { deleteMany: ReturnType<typeof vi.fn> } })
      .item.deleteMany
    expect(itemDelete.mock.calls).toEqual([[{ where: { householdId: 'hh_3' } }]])
    // And nothing is published: nobody is left to hear it
    expect(seen).toEqual([])
    // And PAT's next request finds no household
    expect(code(await run('query { household { id } }', {}, PAT))).toBe('NO_HOUSEHOLD')
  })

  it('a leave with another live person left keeps the household', async () => {
    // Given hh_1 has no owner: MIA leaves, BEA, BOB (and deleted DEX) stay
    ownerless([BEA])
    ok(await leave(MIA), 'leaveHousehold')
    expect(world.households.state.households.map((h) => h.id)).toContain('hh_1')
    expect(seen).toEqual([locationEvent('hh_1')])
  })
})

// ─── the lock order ──────────────────────────────────────────────────────────

describe('every offer write takes the household lock first, and reads through tx (decision T52)', () => {
  /** Record the lock, and every role or offer read through tx, in call order. */
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
    const findFirst = world.client.householdMember.findFirst
    vi.spyOn(world.client.householdMember, 'findFirst').mockImplementation(async (args) => {
      order.push('role')
      return findFirst(args)
    })
    const offerRead = world.client.ownershipOffer.findFirst
    vi.spyOn(world.client.ownershipOffer, 'findFirst').mockImplementation(async (args) => {
      order.push('offer')
      return offerRead(args)
    })
    return order
  }

  const writes: [string, () => Promise<Result>, string][] = [
    ['offerOwnership', () => offerTo(OWEN, BOB), 'hh_1'],
    ['cancelOwnershipOffer', () => cancel(OWEN), 'hh_1'],
    ['acceptOwnershipOffer', () => accept(BEA, 'off_hh2'), 'hh_2'],
    ['declineOwnershipOffer', () => decline(BEA, 'off_hh2'), 'hh_2'],
    ['dismissOwnershipOffer', () => dismiss(BEA, 'off_hh2'), 'hh_2'],
  ]

  it.each(writes)('%s: the lock comes first, once, then the reads', async (_name, act, hh) => {
    const order = recordOrder()
    const res = await act()
    expect(res.errors).toBeUndefined()
    expect(order[0]).toBe(`lock:${hh}`)
    expect(order.filter((x) => x.startsWith('lock:'))).toEqual([`lock:${hh}`])
    expect(order.length).toBeGreaterThan(1)
  })

  it.each(writes)('%s: no role read on the global client', async (_name, act) => {
    const outside = [
      vi.spyOn(prisma.householdMember, 'findUnique'),
      vi.spyOn(prisma.householdMember, 'findFirst'),
    ]
    const res = await act()
    expect(res.errors).toBeUndefined()
    for (const spy of outside) expect(spy).not.toHaveBeenCalled()
  })

  it.each(writes)(
    '%s: a household deleted after it was found gives FORBIDDEN, not an internal error',
    async (_name, act, hh) => {
      const updateMany = world.client.household.updateMany
      vi.spyOn(world.client.household, 'updateMany').mockImplementation(async (args) => {
        if ((args.where as { id?: unknown } | undefined)?.id === hh) return { count: 0 }
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

// ─── the reads ───────────────────────────────────────────────────────────────

describe('Household.hasOwner and Household.pendingTransfer (decision T65)', () => {
  it('household owner sees the open transfer offer', async () => {
    ok(await offerTo(OWEN, BOB), 'offerOwnership')
    const hh = ok<Record<string, unknown>>(await household(OWEN), 'household')
    expect(hh).toMatchObject({ id: 'hh_1', hasOwner: true })
    expect(hh.pendingTransfer).toMatchObject({ toUserId: BOB, toName: 'Bob', kind: 'transfer' })
  })

  it.each([
    ['manager', MIA],
    ['member, the person the offer is for', BOB],
  ])('household %s gets null for pendingTransfer', async (_name, actor) => {
    ok(await offerTo(OWEN, BOB), 'offerOwnership')
    const hh = ok<Record<string, unknown>>(await household(actor), 'household')
    expect(hh.pendingTransfer).toBeNull()
  })

  it('the owner gets null when there is no transfer offer, even when another household has one', async () => {
    const hh = ok<Record<string, unknown>>(await household(OWEN), 'household')
    expect(hh.pendingTransfer).toBeNull()
  })

  it('hasOwner is false for a household with no owner', async () => {
    ownerless([MIA])
    const hh = ok<Record<string, unknown>>(await household(BOB), 'household')
    expect(hh).toMatchObject({ id: 'hh_1', role: 'member', hasOwner: false })
  })
})

describe('myOwnershipOffers (decision T65)', () => {
  it('user sees the offers to them in every household, oldest first, dismissed ones too', async () => {
    // Given BEA has YUKI's offer of hh_2 (from T0) and OWEN's offer of hh_1
    // (from NOW), and she dismissed the hh_2 one
    ok(await dismiss(BEA, 'off_hh2'), 'dismissOwnershipOffer')
    ok(await offerTo(OWEN, BEA), 'offerOwnership')

    const list = ok<Record<string, unknown>[]>(await myOffers(BEA), 'myOwnershipOffers')

    expect(list).toEqual([
      {
        id: 'off_hh2',
        householdId: 'hh_2',
        householdName: 'hh_2 name',
        kind: 'transfer',
        toUserId: BEA,
        toName: 'Bea',
        fromName: 'Yuki',
        createdAt: T0.toISOString(),
        dismissedAt: NOW.toISOString(),
      },
      expect.objectContaining({ householdId: 'hh_1', fromName: 'Owen', dismissedAt: null }),
    ])
  })

  it('another person\'s offers are never in the list', async () => {
    ok(await offerTo(OWEN, BEA), 'offerOwnership')
    expect(ok(await myOffers(BOB), 'myOwnershipOffers')).toEqual([])
    expect(ok(await myOffers(YUKI), 'myOwnershipOffers')).toEqual([])
    expect(ok(await myOffers(OWEN), 'myOwnershipOffers')).toEqual([])
  })

  it('a hand-over offer has no fromName', async () => {
    const list = ok<Record<string, unknown>[]>(await myOffers(PAT), 'myOwnershipOffers')
    expect(list).toEqual([expect.objectContaining({ kind: 'handover', fromName: null, householdName: 'hh_3 name' })])
  })
})
