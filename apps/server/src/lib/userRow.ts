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
// calls `ensureUser`. It creates a missing row and records `lastSeenAt` once
// per day.
//
// | Case | Queries |
// |---|---|
// | this process already saw the user today | 0 |
// | the row was last seen before today, or never (`lastSeenAt` null) | 1 (`updateMany`) |
// | the row was seen today by another process | 2 (`updateMany`, `findUnique`), then 0 |
// | no row yet | 3 (`updateMany`, `findUnique`, `create`), plus one Clerk call |
//
// "Today" is the UTC day. A day starts at 00:00:00.000 UTC. UTC is used so
// the answer does not depend on the server's time zone.
//
// It never un-deletes and never renames (plan P13). The only column it
// writes on an existing row is `lastSeenAt`. It writes `lastSeenAt` for a
// deleted row too: the column records that a request arrived, and that is
// still true. Leaving `deletedAt` and the name alone is what keeps the user
// deleted.

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
export type UserSource = { kind: 'clerk'; lookup: ClerkUserLookup } | { kind: 'e2e' }

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
  if (memoryDay !== day || seenToday.size >= memoryLimit) {
    seenToday.clear()
    memoryDay = day
  }
  seenToday.add(userId)
}

/**
 * Forget that this process saw `userId` today, so the next request checks the
 * database again. Call it after deleting a `User` row (task 2.6's
 * `/e2e/cleanup`). Without it, a later request the same day would skip the
 * check, and the row would not be created again.
 */
export function forgetSeenToday(userId: string): void {
  seenToday.delete(userId)
}

/**
 * Drop the whole memory. For tests. `limit` lets a test reach the size limit
 * with a few users instead of 10,000.
 */
export function resetSeenTodayMemory(limit: number = MEMORY_LIMIT): void {
  seenToday.clear()
  memoryDay = ''
  memoryLimit = limit
}

/**
 * Set `lastSeenAt` to `now` if the row was not seen yet today. One query.
 * Returns how many rows changed: 1, or 0 when there is no row or it was
 * already seen today.
 *
 * Both branches of the `OR` are needed. `{ lt }` is SQL `<`, and `NULL < x`
 * is not true, so `{ lt }` alone never matches a row that was never seen.
 */
export async function touchLastSeen(userId: string, now: Date): Promise<number> {
  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: startOfUtcDay(now) } }],
    },
    data: { lastSeenAt: now },
  })
  return count
}

/** The values for a new row. Never throws: a Clerk error gives the fallback. */
async function newRowValues(userId: string, source: UserSource): Promise<ClerkUserValues> {
  if (source.kind === 'e2e') {
    return { id: userId, displayName: userId, email: null }
  }
  const fallback = { id: userId, displayName: FALLBACK_DISPLAY_NAME, email: null }
  let json: ClerkUserJSON | null
  try {
    json = await source.lookup(userId)
  } catch (err) {
    // The error's name only. Its message may name the user.
    console.error(
      'ensureUser: Clerk lookup failed, using fallback values:',
      err instanceof Error ? err.name : 'unknown error',
    )
    return fallback
  }
  if (!json) return fallback
  // The id is always the signed-in user's id, never the id in the reply.
  return { ...userRowFromClerk(json), id: userId }
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
 * gives the fallback values (plan P11). The request path calls
 * `ensureUserOrLog`, which never throws.
 */
export async function ensureUser(
  userId: string,
  source: UserSource,
  now: Date = new Date(),
): Promise<void> {
  if (wasSeenToday(userId, now)) return

  if ((await touchLastSeen(userId, now)) > 0) {
    rememberSeenToday(userId, now)
    return
  }

  // Nothing changed: either the row was already seen today, or there is no
  // row. A deleted row is found here too, and is left as it is.
  if (await prisma.user.findUnique({ where: { id: userId } })) {
    rememberSeenToday(userId, now)
    return
  }

  const values = await newRowValues(userId, source)
  try {
    await prisma.user.create({ data: { ...values, lastSeenAt: now } })
  } catch (err) {
    // P2002: another request created the row first. `id` is the only unique
    // column, so P2002 itself proves the row exists, and no re-read is
    // needed. That request set `lastSeenAt`, and a `user.deleted` webhook
    // may have set `deletedAt` since, so the row is left as it is.
    if (!isUniqueViolation(err)) throw err
  }
  rememberSeenToday(userId, now)
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
