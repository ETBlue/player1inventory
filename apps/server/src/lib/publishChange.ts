import type { Context } from '../context.js'
import { type ChangeKind, type LiveEvents, liveEvents } from './liveEvents.js'
import { prisma } from './prisma.js'

/**
 * One location a mutation changed. Pass `householdId` when the resolver
 * already has it (for example `bootstrapCarts`, or `deleteVendor`, which read
 * the locations of one household). Leave it out and `publishChange` reads it,
 * with one query for all the locations that lack it.
 */
export type ChangedLocation = { locationId: string; householdId?: string }

/**
 * Publish one `ChangeEvent` per distinct (kind, location) a mutation changed
 * (households H3c-1 task C.4; several kinds since H3c-2 task D.1).
 *
 * `kinds` lists every kind the mutation changed at these locations (decision
 * Q1 of the H3c-2 plan: events stay honest). A kind named twice, or a
 * location named twice, still gives one event. The events go out kind by
 * kind, and inside one kind in the order the locations were first named.
 *
 * Call it AFTER the write has committed: after `await prisma.x.create(...)`,
 * or after `await prisma.$transaction(...)` has resolved. Never inside the
 * transaction callback. A transaction that throws, or a call refused by a
 * role check, must reach no subscriber, because nothing changed.
 *
 * `householdId` is the household of the LOCATION, not the caller's household
 * (`requireHousehold`). Until H5 the two are the same for every write a role
 * check lets through, but `HouseholdMember` allows a person in two
 * households, and `shouldDeliver` (resolvers/live.resolver.ts) reads the
 * event's location, not the writer.
 *
 * NEVER THROWS. When it runs, the mutation has already committed. A failure
 * here (the household lookup, or a bug) must not turn a saved change into an
 * error for the user, who would then retry and add it twice. The error is
 * logged by name only, like `liveEvents`' own listener errors. The cost: the
 * other tabs miss this one event and catch up on their next refetch.
 *
 * A location whose row is gone when the household is read (deleted by
 * someone else in the meantime) is skipped. Its own `LOCATION` event covers
 * it (decision Q4 of the H3c-2 plan).
 *
 * For a household-level change (`LOCATION`, `CATALOG`), use
 * `publishHouseholdChange` instead.
 *
 * SETS `Location.dataUpdatedAt` (households H7b, decision T79). When `kinds`
 * holds `STOCK`, `CART` or `LOG`, every location named gets
 * `dataUpdatedAt = now`, in ONE `location.updateMany`, after the events have
 * gone out. The web's "Last updated" sort reads it. `LOCATION` and `CATALOG`
 * do not set it. Every writer of a location's stock, carts or logs already
 * calls this function, and `live-publish.guard.test.ts` makes every mutation
 * say what it publishes, so there is no second list of writers to keep.
 *
 * The write runs outside the mutation's transaction, on purpose: it must not
 * hold a lock on the `Location` row inside every stock write. If it fails,
 * the events have still gone out, the error is logged by name only, and the
 * only cost is a sort that is a little out of date. Prisma's `updateMany`
 * also moves `Location.updatedAt` (an `@updatedAt` column).
 *
 * `bus` is for tests that want their own bus. Resolvers use the default.
 */
export async function publishChange(
  ctx: Context,
  kinds: readonly ChangeKind[],
  locations: Iterable<ChangedLocation>,
  bus: LiveEvents = liveEvents,
): Promise<void> {
  // The locations whose `dataUpdatedAt` moves. Filled before anything can
  // fail, so a failed household lookup still sets it.
  let dataChanged: string[] = []
  try {
    const distinctKinds = [...new Set(kinds)]
    if (distinctKinds.length === 0) return

    // One entry per location. A known household wins over an unknown one.
    const byLocation = new Map<string, string | undefined>()
    for (const { locationId, householdId } of locations) {
      if (!byLocation.has(locationId) || householdId !== undefined) {
        byLocation.set(locationId, householdId ?? byLocation.get(locationId))
      }
    }
    if (byLocation.size === 0) return
    if (distinctKinds.some((kind) => DATA_KINDS.has(kind))) dataChanged = [...byLocation.keys()]

    const unknown = [...byLocation].filter(([, h]) => h === undefined).map(([id]) => id)
    if (unknown.length > 0) {
      const rows = await prisma.location.findMany({
        where: { id: { in: unknown } },
        select: { id: true, householdId: true },
      })
      for (const row of rows) byLocation.set(row.id, row.householdId)
    }

    for (const kind of distinctKinds) {
      for (const [locationId, householdId] of byLocation) {
        if (householdId === undefined) continue
        bus.publish({
          kind,
          householdId,
          locationId,
          ...(ctx.clientId === undefined ? {} : { sourceClientId: ctx.clientId }),
        })
      }
    }
  } catch (err) {
    logPublishError(err)
  } finally {
    if (dataChanged.length > 0) await markDataUpdated(dataChanged)
  }
}

/** The kinds that change a location's own data (decision T79). */
const DATA_KINDS: ReadonlySet<ChangeKind> = new Set<ChangeKind>(['STOCK', 'CART', 'LOG'])

/**
 * `dataUpdatedAt = now` on these locations, in one query. Never throws: a
 * location deleted in the meantime matches no row, and any other failure is
 * logged by name only (a Prisma message can carry data).
 */
async function markDataUpdated(locationIds: string[]): Promise<void> {
  try {
    await prisma.location.updateMany({
      where: { id: { in: locationIds } },
      data: { dataUpdatedAt: new Date() },
    })
  } catch (err) {
    console.error(
      'publishChange: could not set dataUpdatedAt:',
      err instanceof Error ? err.name : 'unknown error',
    )
  }
}

/**
 * Publish one household-level `ChangeEvent` per distinct kind, with
 * `locationId: null` (households H3c-2, decision Q2).
 *
 * For `LOCATION` and `CATALOG`. `shouldDeliver` checks household MEMBERSHIP
 * for such an event, not a location role. That is why a `LOCATION` event
 * about a deleted location still reaches the members: a deleted location
 * can pass no `requireLocationRole` check.
 *
 * `householdId` is the household whose data changed. A resolver gets it from
 * `requireCatalogRole` or from the location it wrote, never from the event
 * reader.
 *
 * The same rules as `publishChange`: call it after the write has committed,
 * it never throws, and it carries `ctx.clientId` as `sourceClientId` (left
 * out when the request had none).
 *
 * Only `ctx.clientId` is read. The Clerk webhook's account hand-over
 * (households H6b task K.4) is not a request from a tab or a person, so it
 * passes `{ userId: null }`, and its events carry no `sourceClientId`: every
 * open tab hears them.
 */
export async function publishHouseholdChange(
  ctx: Context,
  kinds: readonly ChangeKind[],
  householdId: string,
  bus: LiveEvents = liveEvents,
): Promise<void> {
  try {
    for (const kind of new Set(kinds)) {
      bus.publish({
        kind,
        householdId,
        locationId: null,
        ...(ctx.clientId === undefined ? {} : { sourceClientId: ctx.clientId }),
      })
    }
  } catch (err) {
    logPublishError(err)
  }
}

function logPublishError(err: unknown): void {
  console.error(
    'publishChange: could not publish a change:',
    err instanceof Error ? err.name : 'unknown error',
  )
}
