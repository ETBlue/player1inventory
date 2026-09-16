import type { InMemoryCache } from '@apollo/client'
import { cacheDb, SNAPSHOT_ID } from './cacheDb'
import { cloudCache } from './cloudCache'

const LAST_SYNCED_AT_KEY = 'cloud-cache-last-synced-at'
const LAST_USER_ID_KEY = 'cloud-cache-user-id'

/** Saves the current cache for one user. There is only ever one stored copy. */
export async function saveCache(
  cache: InMemoryCache,
  userId: string,
): Promise<void> {
  await cacheDb.snapshots.put({
    id: SNAPSHOT_ID,
    userId,
    data: JSON.stringify(cache.extract()),
    savedAt: Date.now(),
  })
}

/**
 * Loads the stored cache into `cache`.
 *
 * Returns `true` when data was restored. Nothing is restored when `userId` is
 * `null`, or when the stored copy carries a different id. In both cases the
 * stored copy is deleted.
 *
 * This check is NOT the cross-account protection, and must not be read as one.
 * The only production call site is `main.tsx`, which passes
 * `getLastSignedInUserId()`. That value and `snapshot.userId` are written by
 * the same code, in the same effect, from the same variable, so at startup they
 * always match. The check only defends against a stored id that does not match
 * the id passed in — for example a snapshot left by an older build, or a
 * `null` id after sign-out.
 *
 * The real cross-account protection is the purge in `ApolloWrapper`: when Clerk
 * reports a user id that differs from the stored one, it calls `clearCache()`
 * before this account saves anything.
 *
 * The caller MUST await this before mounting Apollo. If the first queries run
 * first, they write empty results and destroy the stored copy.
 */
export async function restoreCache(
  cache: InMemoryCache,
  userId: string | null,
): Promise<boolean> {
  const snapshot = await cacheDb.snapshots.get(SNAPSHOT_ID)
  if (!snapshot) return false

  if (userId === null || snapshot.userId !== userId) {
    await cacheDb.snapshots.clear()
    return false
  }

  cache.restore(JSON.parse(snapshot.data))
  return true
}

/**
 * Deletes everything this feature stored. Called on sign-out, and when a
 * different account signs in during the same page session.
 *
 * The in-memory reset is part of the job, not an extra. `cloudCache` is a
 * module-level singleton that lives for the whole page lifetime. Emptying only
 * IndexedDB would leave the previous account's rows in memory, and the default
 * `cache-first` policy would then serve them to the next account.
 */
export async function clearCache(): Promise<void> {
  // In-memory rows first, or user B reads user A's data.
  await cloudCache.reset()
  await cacheDb.snapshots.clear()
  localStorage.removeItem(LAST_SYNCED_AT_KEY)
  localStorage.removeItem(LAST_USER_ID_KEY)
}

export async function setLastSyncedAt(date: Date): Promise<void> {
  localStorage.setItem(LAST_SYNCED_AT_KEY, String(date.getTime()))
}

export async function getLastSyncedAt(): Promise<Date | null> {
  const raw = localStorage.getItem(LAST_SYNCED_AT_KEY)
  if (!raw) return null
  const value = Number(raw)
  return Number.isNaN(value) ? null : new Date(value)
}

/**
 * The user id saved while the app was last online.
 *
 * Offline, Clerk may not be able to tell us who is signed in. This value is
 * how we still pick the right stored cache.
 */
export function getLastSignedInUserId(): string | null {
  return localStorage.getItem(LAST_USER_ID_KEY)
}

export function setLastSignedInUserId(userId: string): void {
  localStorage.setItem(LAST_USER_ID_KEY, userId)
}
