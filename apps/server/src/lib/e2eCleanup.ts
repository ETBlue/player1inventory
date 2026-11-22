import { Prisma } from '@prisma/client'
import type { Request, Response } from 'express'
import { E2E_CLEANUP_INSTALL_SQL } from './e2eCleanupSql.js'
import { prisma } from './prisma.js'
import { forgetSeenToday } from './userRow.js'

// `DELETE /e2e/cleanup`: delete one test user's households and account, so
// each E2E test starts clean. `index.ts` mounts it ONLY inside its
// `if (E2E_TEST_MODE)` block; `src/webhookRouteOrder.test.ts` guards that.
//
// It lived inline in `index.ts` until households task 2.6. It moved here so
// a unit test can call it: `index.ts` starts a server when it loads, so no
// test can import it.
//
// ── ONE ROUND TRIP (E2E speed plan, task S.2) ──
//
// The deletes are SQL statements in ONE Postgres function, `e2e_cleanup`
// (lib/e2eCleanupSql.ts), and this handler calls it with ONE query. Until
// task S.2 it sent a read and then 22 `deleteMany` in the array form of
// `$transaction`: about 25 round trips, about 1.33 s on the Neon test branch.
// The E2E server creates the function at start (`installE2eCleanupFunction`
// below, called from the `if (E2E_TEST_MODE)` block of `index.ts`).
// `e2eCleanup.test.ts` pins the one query, the bound user ids, the counts, the
// order of the deletes in the SQL text, and that `forgetSeenToday` runs after
// the query. `purge-coverage.test.ts` pins the WHERE of each statement.
//
// ── EVERY E2E USER AT ONCE (E2E speed plan, task S.3) ──
//
// A body `{ "allE2eUsers": true }`, with no header, cleans every user whose
// id starts with `e2e-` and every household with no member outside them, in
// ONE query to `e2e_cleanup_all()`. `e2e/global-setup.ts` calls it once
// before a cloud run, to delete what a killed run left behind. The answer
// adds `userIds`, the users it deleted; each one is forgotten by
// `forgetSeenToday`.
//
// ── WHAT IT DELETES (households H3a, task 3.10) ──
//
// 1. Every household the user OWNS (a `HouseholdMember` row with role
//    `owner`), with everything in it: its catalog, its locations and what is
//    in them, every member's role rows in it, and the household row.
// 2. The user's OWN role rows in households they do not own: their
//    `HouseholdMember` row there, and their `LocationMember` rows. Both have
//    a RESTRICT foreign key to `User`, so the `User` row cannot go while
//    they exist.
// 3. Every invite of an owned household, and every invite the user MADE in
//    a household they do not own (households H5b, task G.6).
//    `HouseholdInvite.createdById` is RESTRICT too (decision T26), so an
//    invite the user made as a manager of another household would block the
//    `User` delete. An invite the user only USED is not deleted: its
//    `usedById` is SET NULL, so Postgres clears it when the `User` row goes.
// 4. Every activity log row of an owned household (households H6, task
//    J.1). A log row in a household the user does NOT own stays, even when
//    it names the user: `actorId` and `targetUserId` have no foreign key
//    (decision T46), so it does not block the `User` delete.
// 5. Every ownership offer of an owned household, and every offer made TO
//    the user in any household (households H6b, task K.1, decision T58).
//    `toUserId` is ON DELETE CASCADE, so the `User` delete would remove the
//    second half anyway; deleting them here makes the count show them. An
//    offer the user MADE in a household they do not own stays: `fromUserId`
//    has no foreign key, so it does not block the `User` delete.
// 6. Every location preference row on the owned households' locations, and
//    the user's OWN preference rows on any other location (households H7b,
//    task M.1, decision T75). Both foreign keys are ON DELETE CASCADE, so the
//    `location` and `User` deletes would remove them anyway; deleting them
//    here makes the count show them. Other people's rows on locations of a
//    household the user does not own stay.
// 7. The `User` row, last.
//
// The SQL function does each point with one or more `DELETE` statements. The
// reason for each statement, and for its place in the order, is written next
// to it there.
//
// **It never deletes a household the user only belongs to.** Two-user specs
// run this route once for each user. If the first call emptied a household
// the user was only a member of, it would delete the OTHER user's data
// before that user's own cleanup ran, and the other user's test would see
// it. Only the membership rows go (point 2). Rows the user wrote in such a
// household (logs, carts) stay with it: "no path deletes rows because of who
// created them" (design *Purge*).

/**
 * The one key per model in the `deleted` object this route returns, in the
 * order the SQL function deletes them. 22 models (19 until households H6
 * task J.1 added `householdActivities`, 20 until households H6b task K.1
 * added `ownershipOffers`, 21 until households H7b task M.1 added
 * `locationPreferences`). The names match
 * `CLEANUP_MODEL_KEYS` in e2e/helpers/cloudTeardown.ts, which checks that
 * every one of them is present in the body.
 */
export const CLEANUP_MODEL_KEYS = [
  'inventoryLogs',
  'cartItems',
  'carts',
  'itemTags',
  'itemVendors',
  'recipeItems',
  'itemStocks',
  'items',
  'tags',
  'tagTypes',
  'vendors',
  'recipes',
  'shelves',
  'locationMembers',
  'locationPreferences',
  'locations',
  'householdInvites',
  'householdActivities',
  'ownershipOffers',
  'householdMembers',
  'households',
  'users',
] as const

export type CleanupModelKey = (typeof CLEANUP_MODEL_KEYS)[number]

/**
 * Creates or replaces the three cleanup SQL functions (`e2e_cleanup_rows`,
 * `e2e_cleanup`, `e2e_cleanup_all`), one statement each. The E2E server calls
 * it once at start, before it listens (decision D4). It throws on any
 * failure; `index.ts` then logs `errorCodeOf(err)` and stops.
 */
export async function installE2eCleanupFunction(): Promise<void> {
  for (const sql of E2E_CLEANUP_INSTALL_SQL) await prisma.$executeRawUnsafe(sql)
}

/**
 * The error's class and codes, for a log line: for a Prisma raw query error
 * that is `PrismaClientKnownRequestError P2010 <Postgres code>`. NEVER the
 * message: a Prisma or Postgres message can hold the database host.
 */
export function errorCodeOf(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown error'
  const parts: string[] = [err.name]
  const { code, meta } = err as { code?: unknown; meta?: { code?: unknown } }
  if (typeof code === 'string') parts.push(code)
  if (typeof meta?.code === 'string') parts.push(meta.code)
  return parts.join(' ')
}

/**
 * The function's JSON as the 22 counts, in the order of `CLEANUP_MODEL_KEYS`,
 * or the first key that is missing, unknown or not a whole number.
 */
function countsFrom(
  value: unknown,
): { deleted: Record<CleanupModelKey, number> } | { badKey: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { badKey: '(not an object)' }
  }
  const json = value as Record<string, unknown>
  const known: readonly string[] = CLEANUP_MODEL_KEYS
  const unknownKey = Object.keys(json).find((key) => !known.includes(key))
  if (unknownKey !== undefined) return { badKey: unknownKey }
  const deleted = {} as Record<CleanupModelKey, number>
  for (const key of CLEANUP_MODEL_KEYS) {
    const count = json[key]
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return { badKey: key }
    deleted[key] = count
  }
  return { deleted }
}

export async function e2eCleanupHandler(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body
  const bodyKeys =
    typeof body === 'object' && body !== null && !Array.isArray(body) ? Object.keys(body) : []
  const userId = req.headers['x-e2e-user-id'] as string | undefined

  // `{ "allE2eUsers": true }`: every E2E user at once (task S.3, decision D8).
  // Only on its own: with a header or any other key it is a 400, so a caller
  // cannot mean one user and clean them all.
  if (bodyKeys.includes('allE2eUsers')) {
    const flag = (body as Record<string, unknown>).allE2eUsers
    if (flag !== true || bodyKeys.length !== 1 || userId !== undefined) {
      res.status(400).json({
        error: 'allE2eUsers must be true, alone, and without the x-e2e-user-id header',
      })
      return
    }
    await cleanupAllE2eUsers(res)
    return
  }

  if (!userId) {
    res.status(400).json({ error: 'Missing x-e2e-user-id header' })
    return
  }
  const userIds = [userId]

  // ONE query. The ids are a bound value (`$1`), never text in the SQL. The
  // function is one statement, so it is one transaction: every delete
  // happens, or none.
  const rows = await prisma.$queryRaw<{ deleted: unknown }[]>(
    Prisma.sql`SELECT e2e_cleanup(${userIds}::text[]) AS deleted`,
  )

  // AFTER the query has resolved, so after the commit, never before.
  // `ensureUser` (lib/userRow.ts) remembers, per process, the users it saw
  // today, and skips the database for them. Without this call, the next
  // request today would skip the check and the User row would not be created
  // again. Called before the commit, a request arriving in between could find
  // the row that is about to go, and remember it again. If the query throws,
  // this line is not reached, and nothing was deleted, so the memory is still
  // right. It runs before the counts are checked below: the rows are gone
  // even when the answer has a wrong key.
  for (const id of userIds) forgetSeenToday(id)

  // The counts are returned, so a WRONG filter is visible:
  // `e2e/tests/cleanup-endpoint.spec.ts` seeds one row of every model and
  // asserts each count is at least 1. A count missing here means the
  // function and `CLEANUP_MODEL_KEYS` disagree.
  const counts = countsFrom(rows[0]?.deleted)
  if ('badKey' in counts) {
    res.status(500).json({ error: `e2e_cleanup answered a bad count: ${counts.badKey}` })
    return
  }
  res.json({ ok: true, deleted: counts.deleted })
}

/**
 * `DELETE /e2e/cleanup` with `{ "allE2eUsers": true }`, for
 * `e2e/global-setup.ts`: ONE query to `e2e_cleanup_all()`, which deletes
 * every user whose id starts with `e2e-` and every household with no member
 * outside them (lib/e2eCleanupSql.ts). It answers the same 22 counts as the
 * one-user form, plus `userIds`, the ids it deleted.
 */
async function cleanupAllE2eUsers(res: Response): Promise<void> {
  const rows = await prisma.$queryRaw<{ result: unknown }[]>(
    Prisma.sql`SELECT e2e_cleanup_all() AS result`,
  )
  const result = rows[0]?.result
  const { deleted, userIds } =
    typeof result === 'object' && result !== null
      ? (result as { deleted?: unknown; userIds?: unknown })
      : { deleted: undefined, userIds: undefined }

  if (!Array.isArray(userIds) || !userIds.every((id) => typeof id === 'string')) {
    res.status(500).json({ error: 'e2e_cleanup_all answered no list of user ids' })
    return
  }
  // After the query, for the same reason as in the one-user form above.
  for (const id of userIds) forgetSeenToday(id)

  const counts = countsFrom(deleted)
  if ('badKey' in counts) {
    res.status(500).json({ error: `e2e_cleanup_all answered a bad count: ${counts.badKey}` })
    return
  }
  res.json({ ok: true, deleted: counts.deleted, userIds })
}
