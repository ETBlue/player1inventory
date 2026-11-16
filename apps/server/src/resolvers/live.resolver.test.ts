import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSchema, type ExecutionResult, parse, subscribe } from 'graphql'
import type { Context } from '../context.js'
import { type ChangeEvent, createLiveEvents, type LiveEvents, liveEvents } from '../lib/liveEvents.js'
import type { HouseholdWorld } from '../test/householdWorld.js'

// The `householdChanged` subscription and its delivery rules (households
// H3c-1, task C.2). No socket: the tests read the async iterator the
// resolver returns, the same object graphql-ws reads in task C.3.
//
// ── THE FIXTURE ──
//
// | Person   | Household | Location roles                         |
// |----------|-----------|----------------------------------------|
// | OWEN     | hh_home   | LOC_A organizer, LOC_B organizer       |
// | VERA     | hh_home   | LOC_A viewer (no role at LOC_B)        |
// | STRANGER | hh_other  | LOC_OTHER organizer                    |
//
// LOC_B is in VERA's OWN household. A check by household instead of by
// location role would wrongly send her its events.
//
// ── HOW "GETS NOTHING" IS TESTED ──
//
// An iterator that gets nothing just waits, and a test cannot wait for
// "never". So each test publishes the event that must be skipped FIRST, then
// an event the subscriber may get (a "marker"). The first value out of the
// iterator must be the marker. If the skipped event leaked, it would come
// out first, because the queue keeps the order.

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  return { prisma: { ...world.client, $world: world } }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import {
  type HouseholdChangedPayload,
  householdChangedIterator,
  liveResolvers,
  shouldDeliver,
} from './live.resolver.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const OWEN = 'user_owen'
const VERA = 'user_vera'
const STRANGER = 'user_stranger'

const HH_HOME = 'hh_home'
const HH_OTHER = 'hh_other'

const LOC_A = 'loc_a'
const LOC_B = 'loc_b'
const LOC_OTHER = 'loc_other'

function seed() {
  world.reset()
  world.stock.reset(
    [
      { id: LOC_A, householdId: HH_HOME },
      { id: LOC_B, householdId: HH_HOME },
      { id: LOC_OTHER, householdId: HH_OTHER },
    ],
    [],
  )
  world.seedHouseholds({
    households: [householdRow(HH_HOME, OWEN), householdRow(HH_OTHER, STRANGER)],
    householdMembers: [
      householdMemberRow(HH_HOME, OWEN, 'owner'),
      householdMemberRow(HH_HOME, VERA, 'member'),
      householdMemberRow(HH_OTHER, STRANGER, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_A, OWEN, 'organizer'),
      locationMemberRow(LOC_B, OWEN, 'organizer'),
      locationMemberRow(LOC_A, VERA, 'viewer'),
      locationMemberRow(LOC_OTHER, STRANGER, 'organizer'),
    ],
  })
}

/** A cart event at a location of `householdId`. */
function cartAt(
  householdId: string,
  locationId: string | null,
  sourceClientId?: string,
): ChangeEvent {
  return sourceClientId === undefined
    ? { kind: 'CART', householdId, locationId }
    : { kind: 'CART', householdId, locationId, sourceClientId }
}

function ctx(userId: string | null, clientId?: string): Context {
  return clientId === undefined ? { userId } : { userId, clientId }
}

/** The location of the next event the iterator yields. */
async function nextLocation(
  iterator: AsyncIterator<HouseholdChangedPayload>,
): Promise<string | null | undefined> {
  const result = await iterator.next()
  if (result.done) throw new Error('the iterator ended; expected an event')
  return result.value.householdChanged.locationId
}

let bus: LiveEvents
const open: AsyncIterator<HouseholdChangedPayload>[] = []

/** A subscriber on this test's own bus. Closed in `afterEach`. */
function subscriber(context: Context) {
  const iterator = householdChangedIterator(context, { bus, shouldDeliver })
  open.push(iterator)
  return iterator
}

beforeEach(() => {
  seed()
  bus = createLiveEvents()
})

afterEach(async () => {
  for (const iterator of open.splice(0)) await iterator.return?.()
})

// ─── Location role ───────────────────────────────────────────────────────────

describe('householdChanged sends a location event only to people with a role there', () => {
  it('location viewer gets an event at their location, and not at another location of the household', async () => {
    // Given VERA is a viewer at LOC_A and has no role at LOC_B
    const vera = subscriber(ctx(VERA, 'tab_vera'))

    // When a change at LOC_B is published, then one at LOC_A
    bus.publish(cartAt(HH_HOME, LOC_B))
    bus.publish(cartAt(HH_HOME, LOC_A))

    // Then the first event VERA gets is the one at LOC_A
    expect(await nextLocation(vera)).toBe(LOC_A)
  })

  it('a user in another household gets no event of this household', async () => {
    // Given STRANGER is in another household
    const stranger = subscriber(ctx(STRANGER, 'tab_stranger'))

    // When changes at both home locations and a home catalog change are
    // published, then one at STRANGER's own location
    bus.publish(cartAt(HH_HOME, LOC_A))
    bus.publish(cartAt(HH_HOME, LOC_B))
    bus.publish(cartAt(HH_HOME, null))
    bus.publish(cartAt(HH_OTHER, LOC_OTHER))

    // Then the first event STRANGER gets is the one at his own location
    expect(await nextLocation(stranger)).toBe(LOC_OTHER)
  })

  it('a role removed between two events stops the second event', async () => {
    // Given VERA is subscribed and gets a first event at LOC_A
    const vera = subscriber(ctx(VERA, 'tab_vera'))
    bus.publish(cartAt(HH_HOME, LOC_A))
    expect(await nextLocation(vera)).toBe(LOC_A)

    // When her role at LOC_A is removed (she stays in the household)
    world.households.state.locationMembers = world.households.state.locationMembers.filter(
      (m) => !(m.locationId === LOC_A && m.userId === VERA),
    )
    // and a second change at LOC_A is published, then a catalog change
    bus.publish(cartAt(HH_HOME, LOC_A))
    bus.publish(cartAt(HH_HOME, null))

    // Then the next event she gets is the catalog change, not LOC_A
    expect(await nextLocation(vera)).toBeNull()
  })
})

// ─── The source tab ──────────────────────────────────────────────────────────

describe('householdChanged does not send a change back to the tab that made it', () => {
  it('user does not get their own change back in the same tab, but gets it in another tab', async () => {
    // Given OWEN has two tabs open
    const tab1 = subscriber(ctx(OWEN, 'tab_1'))
    const tab2 = subscriber(ctx(OWEN, 'tab_2'))

    // When tab_1 changes LOC_A, and then a change at LOC_B comes from no tab
    bus.publish(cartAt(HH_HOME, LOC_A, 'tab_1'))
    bus.publish(cartAt(HH_HOME, LOC_B))

    // Then tab_1 first gets LOC_B (its own change was skipped)
    expect(await nextLocation(tab1)).toBe(LOC_B)
    // And tab_2 gets LOC_A first, then LOC_B
    expect(await nextLocation(tab2)).toBe(LOC_A)
    expect(await nextLocation(tab2)).toBe(LOC_B)
  })

  it('an event with no source tab reaches every subscriber allowed to see it', async () => {
    // Given OWEN, VERA and STRANGER are subscribed
    const owen = subscriber(ctx(OWEN, 'tab_owen'))
    const vera = subscriber(ctx(VERA, 'tab_vera'))
    const stranger = subscriber(ctx(STRANGER, 'tab_stranger'))

    // When a change at LOC_A is published with no source tab (for example
    // from `makeGql` in E2E), then one at STRANGER's location
    bus.publish(cartAt(HH_HOME, LOC_A))
    bus.publish(cartAt(HH_OTHER, LOC_OTHER))

    // Then OWEN and VERA both get LOC_A, and STRANGER gets only his own
    expect(await nextLocation(owen)).toBe(LOC_A)
    expect(await nextLocation(vera)).toBe(LOC_A)
    expect(await nextLocation(stranger)).toBe(LOC_OTHER)
  })

  it('a subscriber with no tab id still gets an event that has a source tab', async () => {
    // Given a subscriber context with no clientId (C.3 refuses such a
    // socket, but the rule must not depend on that)
    const owen = subscriber(ctx(OWEN))

    // When a tab publishes a change at LOC_A, then a change at LOC_B comes
    // from no tab
    bus.publish(cartAt(HH_HOME, LOC_A, 'tab_1'))
    bus.publish(cartAt(HH_HOME, LOC_B))

    // Then the subscriber gets LOC_A first: undefined never equals a tab id
    expect(await nextLocation(owen)).toBe(LOC_A)
  })
})

// ─── shouldDeliver, the catalog branch ───────────────────────────────────────

describe('shouldDeliver for a catalog event (locationId null)', () => {
  it('is true for a member of the event household, with no location role needed', async () => {
    // VERA is a `member`, the weakest household role
    expect(await shouldDeliver(ctx(VERA, 't'), cartAt(HH_HOME, null))).toBe(true)
  })

  it('is false for a person outside the event household', async () => {
    expect(await shouldDeliver(ctx(STRANGER, 't'), cartAt(HH_HOME, null))).toBe(false)
  })

  it('is false with no signed-in user', async () => {
    expect(await shouldDeliver(ctx(null), cartAt(HH_HOME, null))).toBe(false)
  })
})

// ─── Order ───────────────────────────────────────────────────────────────────

describe('householdChanged keeps the order of events', () => {
  // A delivery check that is slow for LOC_A and fast for the rest, so a
  // later event's check could finish first.
  const slowAtA = async (context: Context, event: ChangeEvent) => {
    if (event.locationId === LOC_A) await new Promise((r) => setTimeout(r, 20))
    return shouldDeliver(context, event)
  }

  it('an event published while an earlier check is still running is neither lost nor sent first', async () => {
    // Given OWEN reads one event at a time, as graphql-ws does
    const owen = householdChangedIterator(ctx(OWEN, 'tab_owen'), { bus, shouldDeliver: slowAtA })
    open.push(owen)

    // When LOC_A is published, its check starts, and LOC_B and a catalog
    // change arrive during it
    bus.publish(cartAt(HH_HOME, LOC_A))
    const first = nextLocation(owen)
    bus.publish(cartAt(HH_HOME, LOC_B))
    bus.publish(cartAt(HH_HOME, null))

    // Then the events come out in the order they were published
    expect(await first).toBe(LOC_A)
    expect(await nextLocation(owen)).toBe(LOC_B)
    expect(await nextLocation(owen)).toBeNull()
  })

  it('two next() calls at once get the events in published order', async () => {
    // Given OWEN asks for two events before any has arrived
    const owen = householdChangedIterator(ctx(OWEN, 'tab_owen'), { bus, shouldDeliver: slowAtA })
    open.push(owen)
    const seen: (string | null | undefined)[] = []
    const first = nextLocation(owen).then((l) => seen.push(l))
    const second = nextLocation(owen).then((l) => seen.push(l))

    // When LOC_A (slow check) and then LOC_B (fast check) are published
    bus.publish(cartAt(HH_HOME, LOC_A))
    bus.publish(cartAt(HH_HOME, LOC_B))
    await Promise.all([first, second])

    // Then the first call resolves with LOC_A, before the second with LOC_B
    expect(seen).toEqual([LOC_A, LOC_B])
  })
})

// ─── Unsubscribe ─────────────────────────────────────────────────────────────

describe('householdChanged cleans up when the subscriber stops', () => {
  it('return() removes the bus listener and ends a waiting next()', async () => {
    // Given a subscriber waiting for an event
    const owen = householdChangedIterator(ctx(OWEN, 'tab_owen'), { bus, shouldDeliver })
    expect(bus.listenerCount()).toBe(1)
    const waiting = owen.next()

    // When it stops
    await owen.return?.()

    // Then the bus has no listener, and the waiting next() ends
    expect(bus.listenerCount()).toBe(0)
    expect(await waiting).toEqual({ value: undefined, done: true })
    // And an event published after that is not delivered
    bus.publish(cartAt(HH_HOME, LOC_A))
    expect(await owen.next()).toEqual({ value: undefined, done: true })
  })
})

// ─── The resolver, and the schema ────────────────────────────────────────────

type SubscribeFn = (
  parent: unknown,
  args: unknown,
  context: Context,
  info: unknown,
) => AsyncIterator<HouseholdChangedPayload>

const resolverSubscribe = (
  liveResolvers.Subscription.householdChanged as unknown as { subscribe: SubscribeFn }
).subscribe

describe('the householdChanged resolver', () => {
  it('refuses a subscriber who is not signed in, and adds no bus listener', () => {
    // Given no signed-in user
    const before = liveEvents.listenerCount()

    // When the subscription starts, Then it is refused with UNAUTHENTICATED
    let caught: unknown
    try {
      resolverSubscribe(undefined, {}, ctx(null), undefined)
    } catch (err) {
      caught = err
    }
    expect((caught as { extensions?: { code?: string } }).extensions?.code).toBe('UNAUTHENTICATED')
    expect(liveEvents.listenerCount()).toBe(before)
  })

  it('delivers an event through the schema with graphql-js, as C.3 will run it', async () => {
    // Given the server schema, with the resolver attached by hand
    const { typeDefs } = await import('../schema/index.js')
    const schema = buildSchema(typeDefs.join('\n'))
    const field = schema.getSubscriptionType()?.getFields().householdChanged
    if (!field) throw new Error('Subscription.householdChanged is missing from the schema')
    field.subscribe = resolverSubscribe as never

    // When OWEN subscribes and a change at LOC_A is published on the bus
    const stream = await subscribe({
      schema,
      document: parse('subscription { householdChanged { kind locationId } }'),
      contextValue: ctx(OWEN, 'tab_owen'),
    })
    if (!(Symbol.asyncIterator in stream)) throw new Error('expected a stream')
    liveEvents.publish(cartAt(HH_HOME, LOC_A))

    // Then the stream yields it as GraphQL data
    const result = await stream.next()
    expect((result.value as ExecutionResult).data).toEqual({
      householdChanged: { kind: 'CART', locationId: LOC_A },
    })

    // And stopping the stream removes its bus listener
    await stream.return?.()
    expect(liveEvents.listenerCount()).toBe(0)
  })

  it('a signed-out subscription through the schema gets an UNAUTHENTICATED error', async () => {
    const { typeDefs } = await import('../schema/index.js')
    const schema = buildSchema(typeDefs.join('\n'))
    const field = schema.getSubscriptionType()?.getFields().householdChanged
    if (!field) throw new Error('Subscription.householdChanged is missing from the schema')
    field.subscribe = resolverSubscribe as never

    const result = await subscribe({
      schema,
      document: parse('subscription { householdChanged { kind } }'),
      contextValue: ctx(null),
    })

    expect(Symbol.asyncIterator in result).toBe(false)
    expect((result as ExecutionResult).errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED')
  })
})
