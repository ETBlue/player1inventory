import type { Context } from '../context.js'
import { type ChangeEvent, type LiveEvents, liveEvents } from './liveEvents.js'
import { prisma } from './prisma.js'

/**
 * One location a mutation changed. Pass `householdId` when the resolver
 * already has it (for example `bootstrapCarts`, or `deleteVendor`, which read
 * the locations of one household). Leave it out and `publishChange` reads it,
 * with one query for all the locations that lack it.
 */
export type ChangedLocation = { locationId: string; householdId?: string }

/**
 * Publish one `ChangeEvent` per distinct location a mutation changed
 * (households H3c-1, task C.4).
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
 * someone else in the meantime) is skipped. Its own delete event covers it
 * in H3c-2.
 *
 * `bus` is for tests that want their own bus. Resolvers use the default.
 */
export async function publishChange(
  ctx: Context,
  kind: ChangeEvent['kind'],
  locations: Iterable<ChangedLocation>,
  bus: LiveEvents = liveEvents,
): Promise<void> {
  try {
    // One entry per location. A known household wins over an unknown one.
    const byLocation = new Map<string, string | undefined>()
    for (const { locationId, householdId } of locations) {
      if (!byLocation.has(locationId) || householdId !== undefined) {
        byLocation.set(locationId, householdId ?? byLocation.get(locationId))
      }
    }
    if (byLocation.size === 0) return

    const unknown = [...byLocation].filter(([, h]) => h === undefined).map(([id]) => id)
    if (unknown.length > 0) {
      const rows = await prisma.location.findMany({
        where: { id: { in: unknown } },
        select: { id: true, householdId: true },
      })
      for (const row of rows) byLocation.set(row.id, row.householdId)
    }

    for (const [locationId, householdId] of byLocation) {
      if (householdId === undefined) continue
      bus.publish({
        kind,
        householdId,
        locationId,
        ...(ctx.clientId === undefined ? {} : { sourceClientId: ctx.clientId }),
      })
    }
  } catch (err) {
    console.error(
      'publishChange: could not publish a change:',
      err instanceof Error ? err.name : 'unknown error',
    )
  }
}
