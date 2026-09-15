import type { InMemoryCache } from '@apollo/client'
import { cacheDb, SNAPSHOT_ID } from './cacheDb'

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
 * Returns `true` when data was restored. If the stored copy belongs to a
 * different user, it is deleted and nothing is restored, so one account can
 * never see another account's pantry on a shared device.
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

/** Deletes everything this feature stored. Called on sign-out. */
export async function clearCache(): Promise<void> {
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
