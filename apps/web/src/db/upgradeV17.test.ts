import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './index'
import { createItem } from './operations'

// Exercises the real v16 → v17 upgrade (the `consumeAmount: 0` backfill): a
// database is created at version 16 with the global-stock-settings shape,
// seeded, closed, then reopened through the app's `db` (version 17) so Dexie
// runs the upgrade fn.
//
// The rows being repaired are the items created during the ~24h window
// (6302ee97 → 9e323fa6) when both create paths defaulted `consumeAmount` to 0.
// ItemForm still refuses to save `consumeAmount <= 0`, so those items open on
// "Must be greater than 0." forever unless something backfills them.

const V16_STORES = {
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

const NOW = new Date('2026-02-01T00:00:00.000Z')

type Row = Record<string, unknown>

function makeItem(id: string, name: string, overrides: Row = {}): Row {
  return {
    id,
    name,
    tagIds: [],
    packageUnit: 'bottle',
    measurementUnit: 'ml',
    amountPerPackage: 1000,
    targetUnit: 'measurement',
    estimatedDueDays: 7,
    expirationThreshold: 2,
    expirationMode: 'date',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

async function seedV16Database(): Promise<void> {
  const v16 = new Dexie('Player1Inventory')
  v16.version(16).stores(V16_STORES)
  await v16.open()

  await v16.table('locations').put({
    id: 'local',
    name: 'My Home',
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
  })

  await v16.table('items').bulkPut([
    // Created during the 0-default window: unconfigured, and unfixable in the
    // Info tab without editing it by hand.
    makeItem('item-zero', 'Milk', { consumeAmount: 0 }),
    // Configured whole step — must survive untouched.
    makeItem('item-two', 'Eggs', { consumeAmount: 2 }),
    // Configured FRACTIONAL step — 0.5 is a legitimate value, not a marker.
    makeItem('item-half', 'Flour', { consumeAmount: 0.5 }),
    // A restored backup can leave the key unset entirely: neither the item nor
    // its winning stock row carried it (lib/importData.ts).
    makeItem('item-missing', 'Salt'),
  ])

  await v16.table('itemStocks').bulkPut([
    {
      id: 'st-zero',
      itemId: 'item-zero',
      locationId: 'local',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 500,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ])

  v16.close()
}

describe('v16 → v17 upgrade (consumeAmount 0 backfill)', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
    await seedV16Database()
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  it('user’s item created with consumeAmount 0 is backfilled to 1', async () => {
    // Given a v16 database holding an item stuck on consumeAmount 0
    // When the app opens it at version 17
    await db.open()

    // Then the item carries the canonical step of 1 and is valid again
    const migrated = await db.items.get('item-zero')
    expect(migrated?.consumeAmount).toBe(1)
  })

  it('user’s configured step of 2 is left at 2', async () => {
    // Given an item with a deliberately configured whole step size
    // When the app opens the database at version 17
    await db.open()

    // Then the migration has not touched it
    const migrated = await db.items.get('item-two')
    expect(migrated?.consumeAmount).toBe(2)
  })

  it('user’s fractional step of 0.5 is left at 0.5', async () => {
    // Given an item with a fractional step size — a valid configuration, since
    // only exactly 0 is the "unconfigured" marker
    // When the app opens the database at version 17
    await db.open()

    // Then the migration has not rounded or replaced it
    const migrated = await db.items.get('item-half')
    expect(migrated?.consumeAmount).toBe(0.5)
  })

  it('user’s item with no consumeAmount at all gets 1', async () => {
    // Given an item row that never carried the key (a restored old backup)
    // When the app opens the database at version 17
    await db.open()

    // Then it is given the same canonical step of 1
    const migrated = (await db.items.get('item-missing')) as unknown as Row
    expect(migrated.consumeAmount).toBe(1)
  })

  it('nothing but consumeAmount moves', async () => {
    // Given items carrying the full v16 configuration and a stock row carrying
    // per-location state
    // When the app opens the database at version 17
    await db.open()

    // Then every other field is exactly as stored
    const migrated = (await db.items.get('item-zero')) as unknown as Row
    expect(migrated).toMatchObject({
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'ml',
      amountPerPackage: 1000,
      targetUnit: 'measurement',
      estimatedDueDays: 7,
      expirationThreshold: 2,
      expirationMode: 'date',
    })
    expect(await db.itemStocks.get('st-zero')).toMatchObject({
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 500,
    })
  })

  it('the upgrade is idempotent — an already-backfilled item is left alone', async () => {
    // Given a database already migrated to v17
    await db.open()
    expect((await db.items.get('item-zero'))?.consumeAmount).toBe(1)
    db.close()

    // When it is opened again (the upgrade fn does not re-run, and would be a
    // no-op if it did — it sees 1, not 0)
    await db.open()

    // Then every value is still what the first pass produced
    expect((await db.items.get('item-zero'))?.consumeAmount).toBe(1)
    expect((await db.items.get('item-two'))?.consumeAmount).toBe(2)
    expect((await db.items.get('item-half'))?.consumeAmount).toBe(0.5)
  })

  // `on('populate')` runs INSTEAD of the upgrade fns on a brand-new database
  // (see db/CLAUDE.md), so "the migration is right" says nothing about a fresh
  // install. v17 seeds nothing, so populate needed no change — but assert that
  // a fresh DB is correct rather than assume it.
  it('a fresh database needs no backfill at all', async () => {
    // Given a v16 database migrated to v17
    await db.open()
    const migratedVersion = db.verno
    const migratedKeys = Object.keys(
      (await db.items.get('item-two')) as unknown as Row,
    ).sort()

    // When a database is built from scratch at the latest version
    db.close()
    await Dexie.delete('Player1Inventory')
    await db.open()
    // (the same fields `item-two` carries, so the key sets are comparable —
    // `consumeAmount` deliberately omitted so the create default supplies it)
    const created = await createItem(
      {
        name: 'Eggs',
        tagIds: [],
        packageUnit: 'bottle',
        measurementUnit: 'ml',
        amountPerPackage: 1000,
        targetUnit: 'measurement',
        estimatedDueDays: 7,
        expirationThreshold: 2,
        expirationMode: 'date',
      },
      'local',
    )

    // Then it is at the same version, no item needs backfilling, and the row
    // shape agrees with a migrated one
    expect(db.verno).toBe(migratedVersion)
    const freshItems = await db.items.toArray()
    expect(freshItems.length).toBeGreaterThan(0)
    for (const item of freshItems) {
      expect(item.consumeAmount).toBeGreaterThan(0)
    }
    expect((await db.items.get(created.id))?.consumeAmount).toBe(1)
    const freshKeys = Object.keys(
      (await db.items.get(created.id)) as unknown as Row,
    ).sort()
    expect(freshKeys).toEqual(migratedKeys)
  })
})
