import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExportPayload } from '@/lib/exportData'
import { importLocalData } from '@/lib/importData'
import { DEFAULT_LOCATION_ID } from '@/types'
import { db } from './index'
import { deleteLocation } from './operations'

// Exercises the real v17 → v18 upgrade (`isDefault` on locations): a database is
// created at version 17, seeded, closed, then reopened through the app's `db`
// (version 18) so Dexie runs the upgrade fn.
//
// Why the flag exists: the default location stops being identified by its id.
// Cloud locations carry server-generated ids, so `id === DEFAULT_LOCATION_ID`
// cannot mark the default there — a flag on the row can, in both modes.
//
// The fixture carries THREE locations, not one. With only the default,
// "flag the default" and "flag every row" produce the same database and the
// assertions below would pass against either.

const V17_STORES = {
  items: 'id, name, createdAt, updatedAt',
  itemStocks: 'id, itemId, locationId, [itemId+locationId], updatedAt',
  tags: 'id, typeId, parentId, createdAt',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, locationId, occurredAt, createdAt',
  shoppingCarts: 'id',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name, lastCookedAt',
  shelves: 'id, name, type, order',
  locations: 'id, order, name',
}

const NOW = new Date('2026-03-01T00:00:00.000Z')

type Row = Record<string, unknown>

// v17-shaped location rows: no `isDefault` key at all.
async function seedV17Database(): Promise<void> {
  const v17 = new Dexie('Player1Inventory')
  v17.version(17).stores(V17_STORES)
  await v17.open()

  await v17.table('locations').bulkPut([
    { id: 'local', name: 'My Home', order: 0, createdAt: NOW, updatedAt: NOW },
    { id: 'office', name: 'Office', order: 1, createdAt: NOW, updatedAt: NOW },
    { id: 'cabin', name: 'Cabin', order: 2, createdAt: NOW, updatedAt: NOW },
  ])

  v17.close()
}

function emptyPayload(overrides: Partial<ExportPayload> = {}): ExportPayload {
  return {
    version: 1,
    exportedAt: NOW.toISOString(),
    items: [],
    tags: [],
    tagTypes: [],
    vendors: [],
    recipes: [],
    inventoryLogs: [],
    shoppingCarts: [],
    cartItems: [],
    shelves: [],
    itemStocks: [],
    locations: [],
    ...overrides,
  }
}

describe('v17 → v18 upgrade (isDefault on locations)', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
    await seedV17Database()
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  it('user’s three locations end up with exactly one flagged default', async () => {
    // Given a v17 database holding the default plus two other locations, none
    // of which carries an `isDefault` key
    // When the app opens it at version 18
    await db.open()

    // Then exactly one row is flagged, and it is the default one
    const locations = await db.locations.toArray()
    expect(locations).toHaveLength(3)
    const flagged = locations.filter((l) => l.isDefault)
    expect(flagged.map((l) => l.id)).toEqual([DEFAULT_LOCATION_ID])
  })

  it('user’s non-default locations are explicitly unflagged, not left unset', async () => {
    // Given the same v17 database
    // When the app opens it at version 18
    await db.open()

    // Then the other two rows carry `false`, not a missing key — the flag is a
    // required field on Location, so a read site can trust it
    for (const id of ['office', 'cabin']) {
      const row = (await db.locations.get(id)) as unknown as Row
      expect(row.isDefault).toBe(false)
    }
  })

  it('nothing but isDefault moves', async () => {
    // Given locations carrying names and ordering
    // When the app opens the database at version 18
    await db.open()

    // Then every other field is exactly as stored
    expect(await db.locations.get('office')).toMatchObject({
      id: 'office',
      name: 'Office',
      order: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })

  it('the upgrade is idempotent — a second open changes nothing', async () => {
    // Given a database already migrated to v18
    await db.open()
    expect((await db.locations.get(DEFAULT_LOCATION_ID))?.isDefault).toBe(true)
    db.close()

    // When it is opened again
    await db.open()

    // Then the same single row is flagged
    const flagged = (await db.locations.toArray()).filter((l) => l.isDefault)
    expect(flagged.map((l) => l.id)).toEqual([DEFAULT_LOCATION_ID])
  })

  // `on('populate')` runs INSTEAD of the upgrade fns on a brand-new database
  // (see db/CLAUDE.md), so "the migration is right" says nothing about a fresh
  // install. v18 seeds a flag, so `ensureDefaultLocation` — the function both
  // paths route through — has to write it.
  it('a fresh database seeds its default location already flagged', async () => {
    // Given no database at all (so Dexie opens straight at v18 and runs
    // `on('populate')`, not the upgrade fn)
    db.close()
    await Dexie.delete('Player1Inventory')

    // When the app creates it
    await db.open()

    // Then the seeded default carries the flag, and it is the only row
    const locations = await db.locations.toArray()
    expect(locations.map((l) => l.id)).toEqual([DEFAULT_LOCATION_ID])
    expect(locations[0]?.isDefault).toBe(true)
  })
})

describe('deleteLocation guards on the flag', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
    await seedV17Database()
    await db.open()
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  // NEGATIVE CONTROL, NOT COVERAGE. In local mode the default's id IS
  // DEFAULT_LOCATION_ID, so `location.isDefault` and `id === DEFAULT_LOCATION_ID`
  // are both true here: reverting the guard to the id comparison leaves this
  // green. The flag's real value is proven where the two predicates diverge —
  // a cloud default, whose id is a server cuid (PR 2, Task 5).
  it('user cannot delete the default location', async () => {
    // Given a migrated database whose default location carries the flag
    // When the user tries to delete it
    // Then it is refused and the row survives
    await expect(deleteLocation(DEFAULT_LOCATION_ID)).rejects.toThrow()
    expect(await db.locations.get(DEFAULT_LOCATION_ID)).toBeDefined()
  })

  it('user can delete a non-default location', async () => {
    // Given a migrated database holding two non-default locations
    // When the user deletes one
    await deleteLocation('office')

    // Then it is gone and the others are untouched
    expect(await db.locations.get('office')).toBeUndefined()
    expect((await db.locations.toArray()).map((l) => l.id).sort()).toEqual([
      'cabin',
      'local',
    ])
  })
})

// A restored backup may carry pre-v18 locations with no `isDefault` key, or
// name some other row as its default. The flag is derived on the way in
// (`deserializeLocation`), not trusted from the file.
describe('importing a pre-v18 backup', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
    await db.open()
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  it('user restoring a pre-v18 backup ends up with exactly one flagged location', async () => {
    // Given a backup whose location rows carry no `isDefault` key at all
    const payload = emptyPayload({
      locations: [
        { id: 'local', name: 'My Home', order: 0 },
        { id: 'office', name: 'Office', order: 1 },
        { id: 'cabin', name: 'Cabin', order: 2 },
      ],
    })

    // When the user restores it
    await importLocalData(payload, 'clear')

    // Then all three are restored and exactly one — the default — is flagged
    const locations = await db.locations.toArray()
    expect(locations).toHaveLength(3)
    expect(locations.filter((l) => l.isDefault).map((l) => l.id)).toEqual([
      DEFAULT_LOCATION_ID,
    ])
  })

  it('user restoring a backup that flags the wrong location does not import that flag', async () => {
    // Given a backup claiming a non-default location is the default (a payload
    // written elsewhere, or hand-edited)
    const payload = emptyPayload({
      locations: [
        { id: 'local', name: 'My Home', order: 0, isDefault: false },
        { id: 'office', name: 'Office', order: 1, isDefault: true },
      ],
    })

    // When the user restores it
    await importLocalData(payload, 'clear')

    // Then the imported non-default location did NOT arrive flagged, and the
    // local default is the one and only flagged row
    expect((await db.locations.get('office'))?.isDefault).toBe(false)
    expect(
      (await db.locations.toArray())
        .filter((l) => l.isDefault)
        .map((l) => l.id),
    ).toEqual([DEFAULT_LOCATION_ID])
  })

  it('user restoring a backup with no locations at all still gets a flagged default', async () => {
    // Given a legacy backup carrying no locations
    // When the user restores it with the destructive strategy that empties the
    // locations table first
    await importLocalData(emptyPayload(), 'clear')

    // Then `ensureDefaultLocationRow` re-creates the default, flagged
    const locations = await db.locations.toArray()
    expect(locations.map((l) => l.id)).toEqual([DEFAULT_LOCATION_ID])
    expect(locations[0]?.isDefault).toBe(true)
  })
})
