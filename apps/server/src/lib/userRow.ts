import type { WebhookEvent } from '@clerk/express/webhooks'
import { prisma } from './prisma.js'

// The `User` row's values, built from what Clerk knows about a person.
// Households plan, tasks 2.3 and 2.4
// (docs/global/permissions/2026-10-31-households-plan.md).

/** Clerk's `UserJSON`, as the `user.created` / `user.updated` webhook sends it. */
type FullClerkUserJSON = Extract<WebhookEvent, { type: 'user.created' | 'user.updated' }>['data']

/**
 * Only the fields `userRowFromClerk` reads. A full `UserJSON` fits this type,
 * so the webhook can pass its payload as it is, and a test can build one with
 * only these fields.
 */
export type ClerkUserJSON = Pick<
  FullClerkUserJSON,
  'id' | 'first_name' | 'last_name' | 'primary_email_address_id'
> & {
  email_addresses: Array<Pick<FullClerkUserJSON['email_addresses'][number], 'id' | 'email_address'>>
}

/** The columns of a `User` row that come from Clerk. */
export type ClerkUserValues = {
  id: string
  displayName: string
  email: string | null
}

/** The display name when Clerk has no name and no email (plan P10). */
export const FALLBACK_DISPLAY_NAME = 'User'

/**
 * Turn a Clerk user into the values the `User` row stores.
 *
 * - `email` is the address named by `primary_email_address_id`. When no
 *   address has that id, `email` is `null`. It does not fall back to another
 *   address, because that one is not the address the person chose.
 * - `displayName` is the first and last name joined by one space. With no
 *   name, it is the part of the email before `@`. With no name and no email,
 *   it is `"User"` (plan P10). A name of only spaces counts as no name.
 */
export function userRowFromClerk(user: ClerkUserJSON): ClerkUserValues {
  const primary = user.email_addresses.find((a) => a.id === user.primary_email_address_id)
  const email = primary?.email_address ?? null

  const name = [user.first_name, user.last_name]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ')
  const emailLocalPart = email?.split('@')[0] ?? ''

  return {
    id: user.id,
    displayName: name || emailLocalPart || FALLBACK_DISPLAY_NAME,
    email,
  }
}

// ── The request-path safety net and `lastSeenAt` (task 2.4) ──
//
// The webhook (clerkWebhook.ts) is the main way a `User` row is written. A
// webhook can be late or lost, so every authenticated GraphQL request also
// calls `ensureUser`. It creates a missing row, records `lastSeenAt` once
// per day, and replaces a fallback name once Clerk answers.
//
// | Case | Queries |
// |---|---|
// | this process already saw the user today | 0 |
// | the row was last seen before today, or never (`lastSeenAt` null) | 1 (`updateManyAndReturn`) |
// | the same, and the row still has the fallback name and is not deleted | 1, plus one Clerk call, plus 1 (`updateMany`) when Clerk gives a real name |
// | the row was seen today by another process | 2 (`updateManyAndReturn`, `findUnique`), then 0 |
// | no row yet | 3 (`updateManyAndReturn`, `findUnique`, `create`), plus one Clerk call |
//
// Parallel calls for the same user in one process share one run, so a burst
// of first requests costs the same as one request. The Clerk call gives up
// after CLERK_LOOKUP_TIMEOUT_MS and uses the fallback values.
//
// "Today" is the UTC day. A day starts at 00:00:00.000 UTC. UTC is used so
// the answer does not depend on the server's time zone.
//
// It never un-deletes (plan P13). On an existing row it writes `lastSeenAt`,
// and nothing else, with ONE exception: a live row that still has the
// fallback name (`FALLBACK_DISPLAY_NAME`) gets Clerk's name, and Clerk's
// email when none is stored. See `refreshFallbackName`. A real name is never
// overwritten, and a deleted row is never renamed. It writes `lastSeenAt`
// for a deleted row too: the column records that a request arrived, and
// that is still true. Leaving `deletedAt` alone is what keeps the user
// deleted.
//
// Why the exception (bug 2026-11-24,
// docs/global/bugs/2026-11-24-bug-fallback-display-name-never-fixed.md): a
// row created while Clerk failed kept "User" for good. Only the webhook
// writes the name otherwise, and Clerk sends `user.created` once and
// `user.updated` only when the account changes.

/**
 * Look up a user in Clerk and return Clerk's raw user JSON, or `null`.
 * Production passes `async (id) => (await clerkClient.users.getUser(id)).raw`.
 * `User.raw` in `@clerk/backend` is typed `UserJSON | null`.
 */
export type ClerkUserLookup = (id: string) => Promise<ClerkUserJSON | null>

/**
 * Where a new row's name and email come from.
 * - `clerk`: ask Clerk. If Clerk fails, use the fallback values.
 * - `e2e`: E2E test mode has no Clerk. The display name is the user id.
 */
export type UserSource =
  | { kind: 'clerk'; lookup: ClerkUserLookup; timeoutMs?: number }
  | { kind: 'e2e' }

/**
 * How long a new user's first request waits for Clerk before it uses the
 * fallback values. `@clerk/backend` 2.33.0 passes no `signal` and no timeout
 * to `fetch`, so without this a slow Clerk would hold the request open. A
 * test passes a shorter `timeoutMs` in the source instead.
 */
export const CLERK_LOOKUP_TIMEOUT_MS = 3_000

// ── The per-process memory ──
//
// The users this process has already written or found today. It holds one
// UTC day only: when the day changes, the whole set is dropped. So it holds
// at most the users seen by this process since 00:00 UTC. As a second limit,
// it is also dropped when it reaches MEMORY_LIMIT entries. Dropping it costs
// one `updateMany` per user on their next request, nothing else.

export const MEMORY_LIMIT = 10_000
let memoryLimit = MEMORY_LIMIT
let memoryDay = ''
const seenToday = new Set<string>()

/**
 * The `ensureUser` calls that are running now, by user id. An entry lives
 * only while its call runs, so the map holds at most the users with a
 * request in progress in this process.
 */
const inFlight = new Map<string, Promise<void>>()

/**
 * Goes up by one each time `forgetSeenToday` (or `resetSeenTodayMemory`)
 * runs. A run reads it when it starts, and adds the user to the memory only
 * if it has not changed since.
 *
 * Without it, a run that found the row could finish AFTER `/e2e/cleanup`
 * deleted that row and called `forgetSeenToday`. The run would then add the
 * user back to the memory, for a row that no longer exists. The next request
 * would skip the check, and the row would not be created again that day.
 *
 * It is one number for all users, not one per user. A per-user counter needs
 * a map with one entry per user ever forgotten, and that map only grows. With
 * one number, a forget for one user also stops the runs in progress for
 * OTHER users from being remembered. That costs each of them one
 * `updateMany` on their next request, nothing else. Only `/e2e/cleanup`
 * calls `forgetSeenToday`, and it is mounted only in E2E test mode, so
 * production never pays it.
 */
let forgetGeneration = 0

/** The UTC day of `now`, as `YYYY-MM-DD`. */
function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** 00:00:00.000 UTC on the day of `now`. */
function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function wasSeenToday(userId: string, now: Date): boolean {
  return memoryDay === utcDayKey(now) && seenToday.has(userId)
}

function rememberSeenToday(userId: string, now: Date): void {
  const day = utcDayKey(now)
  // A run that started before midnight UTC can finish after a newer run has
  // already moved the memory to the new day. Its `now` is on the old day.
  // Without this line it would clear the new day's memory and move
  // `memoryDay` back. `YYYY-MM-DD` strings sort in date order, so `<`
  // compares days.
  if (day < memoryDay) return
  if (memoryDay !== day || seenToday.size >= memoryLimit) {
    seenToday.clear()
    memoryDay = day
  }
  seenToday.add(userId)
}

/**
 * Forget that this process saw `userId` today, so the next request checks the
 * database again. Call it AFTER the delete of a `User` row has committed
 * (task 2.6's `/e2e/cleanup`). Without it, a later request the same day would
 * skip the check, and the row would not be created again.
 *
 * It also cancels the runs in progress:
 * - It removes `userId`'s run from `inFlight`. A request that arrives after
 *   this call then starts a new run, instead of joining an old one that may
 *   have found the row before it was deleted.
 * - It bumps `forgetGeneration`, so no run that started before this call
 *   adds any user to the memory.
 */
export function forgetSeenToday(userId: string): void {
  forgetGeneration += 1
  inFlight.delete(userId)
  seenToday.delete(userId)
}

/**
 * Drop the whole memory, and forget the runs in progress. For tests. `limit`
 * lets a test reach the size limit with a few users instead of 10,000.
 * Forgetting the runs keeps a run that never finished in one test from being
 * shared with the next test.
 */
export function resetSeenTodayMemory(limit: number = MEMORY_LIMIT): void {
  forgetGeneration += 1
  inFlight.clear()
  seenToday.clear()
  memoryDay = ''
  memoryLimit = limit
}

/** What `touchLastSeen` returns about the row it changed. */
export type TouchedRow = { displayName: string; email: string | null; deletedAt: Date | null }

/**
 * Set `lastSeenAt` to `now` if the row was not seen yet today. One query
 * (`UPDATE ... RETURNING` in Postgres). Returns the changed row's name,
 * email and `deletedAt`, or `null` when there is no row or it was already
 * seen today. `ensureUser` reads the name to find a fallback row, so that
 * check costs no extra query.
 *
 * Both branches of the `OR` are needed. `{ lt }` is SQL `<`, and `NULL < x`
 * is not true, so `{ lt }` alone never matches a row that was never seen.
 */
export async function touchLastSeen(userId: string, now: Date): Promise<TouchedRow | null> {
  const rows = await prisma.user.updateManyAndReturn({
    where: {
      id: userId,
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: startOfUtcDay(now) } }],
    },
    data: { lastSeenAt: now },
    select: { displayName: true, email: true, deletedAt: true },
  })
  // `id` is the primary key, so there is at most one row.
  return rows[0] ?? null
}

/**
 * Call `lookup`, but give up after `timeoutMs`. On timeout it throws an
 * error named `ClerkLookupTimeout`, which the caller treats like any other
 * Clerk failure. The timer is always cleared, so a lookup that finishes in
 * time leaves no timer running. A lookup that is given up on keeps running
 * in the background; its result, or its error, is ignored.
 */
async function lookupWithTimeout(
  lookup: ClerkUserLookup,
  userId: string,
  timeoutMs: number,
): Promise<ClerkUserJSON | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Clerk lookup took longer than ${timeoutMs} ms`)
      err.name = 'ClerkLookupTimeout'
      reject(err)
    }, timeoutMs)
  })
  try {
    return await Promise.race([lookup(userId), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ask Clerk for a user's values. Never throws: a Clerk error, a timeout or
 * an empty reply gives the fallback values, and an error is logged by its
 * name only (its message may name the user).
 */
async function clerkValues(
  userId: string,
  source: Extract<UserSource, { kind: 'clerk' }>,
  logPrefix: string,
): Promise<ClerkUserValues> {
  const fallback = { id: userId, displayName: FALLBACK_DISPLAY_NAME, email: null }
  let json: ClerkUserJSON | null
  try {
    json = await lookupWithTimeout(
      source.lookup,
      userId,
      source.timeoutMs ?? CLERK_LOOKUP_TIMEOUT_MS,
    )
  } catch (err) {
    console.error(logPrefix, err instanceof Error ? err.name : 'unknown error')
    return fallback
  }
  if (!json) return fallback
  // The id is always the signed-in user's id, never the id in the reply.
  return { ...userRowFromClerk(json), id: userId }
}

/** The values for a new row. Never throws: a Clerk error gives the fallback. */
async function newRowValues(userId: string, source: UserSource): Promise<ClerkUserValues> {
  if (source.kind === 'e2e') {
    return { id: userId, displayName: userId, email: null }
  }
  return clerkValues(userId, source, 'ensureUser: Clerk lookup failed, using fallback values:')
}

/**
 * Replace a fallback name with Clerk's name (bug 2026-11-24). Called only
 * for a row `touchLastSeen` just changed, so at most once per user per UTC
 * day, across all processes: the touch matches a row once a day.
 *
 * - Only for the Clerk source. E2E mode has no Clerk.
 * - Only for a live row that still has `FALLBACK_DISPLAY_NAME`.
 * - When Clerk fails, times out, or also gives the fallback name, nothing is
 *   written, and the next day tries again.
 * - The write itself is guarded: `where` names the fallback name and
 *   `deletedAt: null`. So a webhook that wrote a real name, or deleted the
 *   account, while this call waited for Clerk is not overwritten.
 * - The email is written only when none is stored.
 *
 * A database error in the write is thrown, like every other database error
 * here; `ensureUserOrLog` catches it.
 */
async function refreshFallbackName(
  userId: string,
  source: UserSource,
  row: TouchedRow,
): Promise<void> {
  if (source.kind !== 'clerk') return
  if (row.displayName !== FALLBACK_DISPLAY_NAME || row.deletedAt !== null) return
  const values = await clerkValues(
    userId,
    source,
    'ensureUser: Clerk lookup failed, the fallback name stays:',
  )
  if (values.displayName === FALLBACK_DISPLAY_NAME) return
  await prisma.user.updateMany({
    where: { id: userId, displayName: FALLBACK_DISPLAY_NAME, deletedAt: null },
    data: {
      displayName: values.displayName,
      ...(row.email === null && values.email !== null ? { email: values.email } : {}),
    },
  })
}

function isUniqueViolation(err: unknown): boolean {
  // Checked by code, not with `instanceof PrismaClientKnownRequestError`.
  // The code is what Prisma documents, and the test double's error is a
  // plain Error with `code = 'P2002'`.
  return (err as { code?: unknown } | null)?.code === 'P2002'
}

/**
 * Make sure `userId` has a `User` row, and record `lastSeenAt` once per UTC
 * day. See the table above for what each case costs.
 *
 * Throws only when the database fails. A Clerk failure does not throw; it
 * gives the fallback values (plan P11), or leaves a fallback name as it is. The request path calls
 * `ensureUserOrLog`, which never throws.
 */
export async function ensureUser(
  userId: string,
  source: UserSource,
  now: Date = new Date(),
): Promise<void> {
  if (wasSeenToday(userId, now)) return

  // The web app sends several queries at once when a page loads. Without
  // this, a new user's first page would ask Clerk once per query and try one
  // `create` per query. Parallel calls for the same user share one run.
  const running = inFlight.get(userId)
  if (running) return running

  const run = checkAndCreate(userId, source, now).finally(() => {
    // Removed when the run settles, success or failure, so a failed run is
    // tried again on the next request instead of being shared forever.
    if (inFlight.get(userId) === run) inFlight.delete(userId)
  })
  inFlight.set(userId, run)
  return run
}

async function checkAndCreate(userId: string, source: UserSource, now: Date): Promise<void> {
  // If `forgetSeenToday` runs while this run waits on the database, the row
  // this run found may be gone. Then this run must not add the user to the
  // memory. See `forgetGeneration`.
  const generation = forgetGeneration
  const remember = () => {
    if (generation === forgetGeneration) rememberSeenToday(userId, now)
  }

  const touched = await touchLastSeen(userId, now)
  if (touched) {
    await refreshFallbackName(userId, source, touched)
    remember()
    return
  }

  // Nothing changed: either the row was already seen today, or there is no
  // row. A deleted row is found here too, and is left as it is.
  if (await prisma.user.findUnique({ where: { id: userId } })) {
    remember()
    return
  }

  const values = await newRowValues(userId, source)
  try {
    await prisma.user.create({ data: { ...values, lastSeenAt: now } })
  } catch (err) {
    // P2002: someone else created the row first. In this process the
    // `inFlight` map stops parallel requests from racing, so this comes from
    // another server process, or from the webhook. (One exception: after
    // `forgetSeenToday`, a new run and the old run it cancelled can both
    // reach `create` in this process.) `id` is the only unique
    // column, so P2002 itself proves the row exists, and no re-read is
    // needed. That request set `lastSeenAt`, and a `user.deleted` webhook
    // may have set `deletedAt` since, so the row is left as it is.
    if (!isUniqueViolation(err)) throw err
  }
  remember()
}

/**
 * `ensureUser` for the request path. It never throws: a failure is logged
 * and the request goes on (plan P11), because a failure here would fail
 * every GraphQL request. The log carries the error's name and code only. A
 * Prisma error's message prints the whole call, and that includes the email.
 */
export async function ensureUserOrLog(userId: string, source: UserSource): Promise<void> {
  try {
    await ensureUser(userId, source)
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code
    console.error(
      'ensureUser failed, the request goes on:',
      err instanceof Error ? err.name : 'unknown error',
      typeof code === 'string' ? code : '',
    )
  }
}
