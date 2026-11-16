import { GraphQLError } from 'graphql'
import { type Context, requireAuth } from '../context.js'
import type { ChangeEvent as GqlChangeEvent, SubscriptionResolvers } from '../generated/graphql.js'
import { requireHouseholdRole, requireLocationRole } from '../lib/authz.js'
import { type ChangeEvent, type LiveEvents, liveEvents } from '../lib/liveEvents.js'

// The `householdChanged` subscription (households H3c-1, task C.2).
//
// A tab subscribes once. Each event a mutation publishes on the bus
// (`lib/liveEvents.ts`) goes through `shouldDeliver` for THIS subscriber,
// and only an event that passes is sent. The event carries no data, only the
// kind and the location, so a tab that gets it refetches through the normal,
// role-checked queries.
//
// ── THE ORDER OF THE CHECKS (design, *Before each delivery*) ──
//
//   1. The tab that made the change does not get it back.
//   2. The event's household must be one the subscriber may see.
//   3. A role check in the database, for every event, with a new context.
//
// Step 2 has no code of its own. For a location event, step 3 asks for
// `viewer` on the location through `requireLocationRole`, and a location role
// counts only while the person is a member of the LOCATION's household
// (decision H18). So a person outside that household is refused there. For
// a catalog event, step 3 asks for membership of `event.householdId` itself.
// What step 3 does not check is that `event.householdId` matches the
// location's household: that is the publisher's job (task C.4), and the
// event sends no household id to the tab anyway.
//
// ── WHY THE ROLE IS CHECKED AGAIN FOR EVERY EVENT ──
//
// A subscription can stay open for an hour. A role removed during that hour
// must stop the next event, so nothing about the role is kept between
// events. Each check gets a new context with an empty `requestCache`. Today
// `requireLocationRole` and `requireHouseholdRole` read no cache at all, so
// this is a guard against a future cache, not a fix of a present one.

/** What the subscription yields. graphql-js reads the field by its name. */
export type HouseholdChangedPayload = { householdChanged: GqlChangeEvent }

/**
 * May this subscriber get this event? Never throws: a failed or refused
 * check gives `false`, and the subscription stays open.
 */
export async function shouldDeliver(ctx: Context, event: ChangeEvent): Promise<boolean> {
  if (!ctx.userId) return false

  // 1. The source tab. An event with no `sourceClientId` reaches every tab.
  if (event.sourceClientId !== undefined && event.sourceClientId === ctx.clientId) return false

  // A new context per event, so no answer is reused from an earlier event.
  const fresh: Context = {
    userId: ctx.userId,
    language: ctx.language,
    clientId: ctx.clientId,
    requestCache: {},
  }

  try {
    if (event.locationId !== null) {
      // 2 and 3 for a location event. See the file comment.
      await requireLocationRole(fresh, event.locationId, 'viewer')
    } else {
      // 2 and 3 for a catalog event (none is published in H3c-1). Membership
      // of the event's own household, which also works once a person can be
      // in two households (H5).
      await requireHouseholdRole(fresh, event.householdId, 'member')
    }
    return true
  } catch (err) {
    // `FORBIDDEN` is the normal "not for you" answer and is not logged.
    // Anything else (a database error) is logged by name only: a Prisma
    // message can print an email.
    const isForbidden = err instanceof GraphQLError && err.extensions.code === 'FORBIDDEN'
    if (!isForbidden) {
      console.error(
        'householdChanged: a delivery check failed:',
        err instanceof Error ? err.name : 'unknown error',
      )
    }
    return false
  }
}

export interface HouseholdChangedDeps {
  bus: LiveEvents
  shouldDeliver: (ctx: Context, event: ChangeEvent) => Promise<boolean>
}

const defaultDeps: HouseholdChangedDeps = { bus: liveEvents, shouldDeliver }

/**
 * The bus as an async iterator, for one subscriber.
 *
 * - The bus listener only puts the event in a queue. It does no async work,
 *   so events are queued in the order they were published.
 * - `next()` takes events from the queue one at a time and runs
 *   `shouldDeliver` on each. An event that arrives while an earlier one is
 *   still being checked waits in the queue, so none is lost and the order
 *   stays the same. Calls to `next()` are chained, so two calls at once also
 *   keep the order.
 * - `return()` (the client stops, or the socket closes) removes the bus
 *   listener and ends every waiting `next()`.
 *
 * The bus listener is added at once, before the first `next()`, so an event
 * published right after subscribing is not missed.
 */
export function householdChangedIterator(
  ctx: Context,
  deps: HouseholdChangedDeps = defaultDeps,
): AsyncIterableIterator<HouseholdChangedPayload> {
  const queue: ChangeEvent[] = []
  let wake: (() => void) | null = null
  let finished = false

  const unsubscribe = deps.bus.subscribe((event) => {
    if (finished) return
    queue.push(event)
    wake?.()
    wake = null
  })

  function finish() {
    if (finished) return
    finished = true
    unsubscribe()
    queue.length = 0
    wake?.()
    wake = null
  }

  const DONE: IteratorReturnResult<undefined> = { value: undefined, done: true }

  async function pull(): Promise<IteratorResult<HouseholdChangedPayload>> {
    while (!finished) {
      const event = queue.shift()
      if (!event) {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
        continue
      }
      if (!(await deps.shouldDeliver(ctx, event))) continue
      if (finished) break
      return {
        value: { householdChanged: { kind: event.kind, locationId: event.locationId } },
        done: false,
      }
    }
    return DONE
  }

  let chain: Promise<unknown> = Promise.resolve()

  const iterator: AsyncIterableIterator<HouseholdChangedPayload> = {
    next() {
      const result = chain.then(pull)
      chain = result.catch(() => undefined)
      return result
    },
    async return() {
      finish()
      return DONE
    },
    async throw(err?: unknown) {
      finish()
      throw err
    },
    [Symbol.asyncIterator]() {
      return iterator
    },
  }
  return iterator
}

export const liveResolvers: { Subscription: SubscriptionResolvers } = {
  Subscription: {
    householdChanged: {
      subscribe: (_parent, _args, ctx) => {
        // Before the bus listener is added, so a refused subscribe leaves
        // nothing behind.
        requireAuth(ctx)
        return householdChangedIterator(ctx)
      },
    },
  },
}
