import type { ActivityAction, Prisma } from '@prisma/client'

// The household activity log (households H6, decisions T46, T47 and T51 of
// docs/global/permissions/2026-11-20-households-plan-h6.md).
//
// `recordActivity` is the ONLY code that writes a `HouseholdActivity` row.
//
// It takes the TRANSACTION client of the change it describes, never the
// global `prisma`. So the log row and the change commit together or roll
// back together: a row for a change that did not happen, or a change with no
// row, cannot exist (decision T47). Call it inside the `$transaction`
// callback, after the change and before the callback returns.
//
// It does not check any role. The resolver that makes the change has already
// done that. It does not read names either: person names are read when the
// log is shown (decision T53). Only a location's name is stored, in
// `details`, because the location may be deleted later.

/** One log row, as a resolver hands it in. */
export interface ActivityEntry {
  householdId: string
  /** Who acted. For a hand-over (H6b) it is the deleted person (decision T50). */
  actorId: string
  action: ActivityAction
  /** The person the change is about, when there is one. */
  targetUserId?: string | null
  /** The location the change is about, when there is one. */
  locationId?: string | null
  /** Extra facts for the Activity page. The shape per action is in decision T51. */
  details?: Prisma.InputJsonValue
}

/**
 * Write one activity row through `tx`, the transaction of the change.
 *
 * Throws when `householdId` or `actorId` is missing or empty. Prisma would
 * read `undefined` as "not given" and fail later with a less clear error, or,
 * in a `where` elsewhere, as "no filter". So the helper refuses it first.
 */
export async function recordActivity(
  tx: Prisma.TransactionClient,
  entry: ActivityEntry,
): Promise<void> {
  if (typeof entry.householdId !== 'string' || entry.householdId === '') {
    throw new Error('recordActivity: an activity row needs a householdId.')
  }
  if (typeof entry.actorId !== 'string' || entry.actorId === '') {
    throw new Error('recordActivity: an activity row needs an actorId.')
  }
  await tx.householdActivity.create({
    data: {
      householdId: entry.householdId,
      actorId: entry.actorId,
      action: entry.action,
      targetUserId: entry.targetUserId ?? null,
      locationId: entry.locationId ?? null,
      // Left out when not given, so Postgres stores NULL.
      ...(entry.details === undefined ? {} : { details: entry.details }),
    },
  })
}
