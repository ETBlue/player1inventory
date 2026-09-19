import Dexie, { type EntityTable } from 'dexie'

/**
 * Stores the saved Apollo cache for cloud mode.
 *
 * This is a separate database from the app's `Player1Inventory`. That one is
 * at v18 and holds local-mode data. The cache is not app data, so it does not
 * belong there and must not force a v19 migration. A separate database also
 * makes the sign-out cleanup a single delete.
 */
export interface CachedSnapshot {
  id: string
  userId: string
  data: string
  savedAt: number
}

export const cacheDb = new Dexie('Player1InventoryCloudCache') as Dexie & {
  snapshots: EntityTable<CachedSnapshot, 'id'>
}

cacheDb.version(1).stores({
  snapshots: 'id, userId',
})

/** There is only ever one row. The user id is checked before it is used. */
export const SNAPSHOT_ID = 'apollo-cache'
