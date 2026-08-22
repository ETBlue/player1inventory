import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './index'
import { createItem, getItemStock } from './operations'

// Exercises the real v15 → v16 upgrade (global stock settings): the eight
// CONFIGURATION fields move off every per-location `ItemStock` row and onto the
// global `Item`. A database is created at version 15 with the split-but-
// per-location shape, seeded, closed, then reopened through the app's `db`
// (version 16) so Dexie runs the upgrade fn.

const V15_STORES = {
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

// The eight configuration fields that move onto Item in v16.
const GLOBAL_KEYS = [
  'packageUnit',
  'measurementUnit',
  'amountPerPackage',
  'targetUnit',
  'consumeAmount',
  'estimatedDueDays',
  'expirationThreshold',
  'expirationMode',
] as const

const NOW = new Date('2026-02-01T00:00:00.000Z')
const OLDER = new Date('2026-01-01T00:00:00.000Z')
const OLDEST = new Date('2025-12-01T00:00:00.000Z')

type Row = Record<string, unknown>

function makeItem(id: string, name: string): Row {
  return { id, name, tagIds: [], createdAt: NOW, updatedAt: NOW }
}

function makeStock(overrides: Row): Row {
  return {
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

async function seedV15Database(): Promise<void> {
  const v15 = new Dexie('Player1Inventory')
  v15.version(15).stores(V15_STORES)
  await v15.open()

  await v15.table('locations').bulkPut([
    { id: 'local', name: 'My Home', order: 0, createdAt: NOW, updatedAt: NOW },
    { id: 'cabin', name: 'Cabin', order: 1, createdAt: NOW, updatedAt: NOW },
    { id: 'office', name: 'Office', order: 2, createdAt: NOW, updatedAt: NOW },
  ])

  await v15
    .table('items')
    .bulkPut([
      makeItem('item-default', 'Milk'),
      makeItem('item-remote', 'Flour'),
      makeItem('item-orphan', 'Salt'),
      makeItem('item-single', 'Rice'),
    ])

  await v15.table('itemStocks').bulkPut([
    // item-default: stocked at the default location plus two others, each with
    // different configuration. The default location must win.
    makeStock({
      id: 'st-default-local',
      itemId: 'item-default',
      locationId: 'local',
      packageUnit: 'bottle',
      measurementUnit: 'ml',
      amountPerPackage: 1000,
      targetUnit: 'measurement',
      consumeAmount: 250,
      estimatedDueDays: 7,
      expirationThreshold: 2,
      expirationMode: 'days from purchase',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 500,
      // Deliberately the NEWEST row, so "oldest wins" would pick another one.
      createdAt: NOW,
    }),
    makeStock({
      id: 'st-default-cabin',
      itemId: 'item-default',
      locationId: 'cabin',
      packageUnit: 'carton',
      measurementUnit: 'l',
      amountPerPackage: 2,
      targetUnit: 'package',
      consumeAmount: 1,
      estimatedDueDays: 99,
      expirationThreshold: 30,
      expirationMode: 'date',
      targetQuantity: 2,
      packedQuantity: 1,
      createdAt: OLDEST,
    }),
    makeStock({
      id: 'st-default-office',
      itemId: 'item-default',
      locationId: 'office',
      packageUnit: 'cup',
      targetUnit: 'package',
      consumeAmount: 5,
      createdAt: OLDER,
    }),

    // item-remote: NOT stocked at the default location. The oldest row wins.
    makeStock({
      id: 'st-remote-office',
      itemId: 'item-remote',
      locationId: 'office',
      packageUnit: 'newer-bag',
      consumeAmount: 9,
      createdAt: NOW,
    }),
    makeStock({
      id: 'st-remote-cabin',
      itemId: 'item-remote',
      locationId: 'cabin',
      packageUnit: 'oldest-sack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'measurement',
      consumeAmount: 100,
      expirationMode: 'disabled',
      createdAt: OLDEST,
    }),

    // item-single: exactly one location, and not the default one.
    makeStock({
      id: 'st-single',
      itemId: 'item-single',
      locationId: 'cabin',
      packageUnit: 'bag',
      consumeAmount: 3,
      targetUnit: 'package',
      targetQuantity: 6,
    }),
  ])

  v15.close()
}

describe('v15 → v16 upgrade (global stock settings)', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
    await seedV15Database()
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  it("user's default-location settings win when an item is stocked in several locations", async () => {
    // Given a v15 database with three differing stock rows, one at the default
    // location
    // When the app opens it at version 16
    await db.open()

    // Then the default location's configuration is what the item carries
    const migrated = await db.items.get('item-default')
    expect(migrated).toMatchObject({
      packageUnit: 'bottle',
      measurementUnit: 'ml',
      amountPerPackage: 1000,
      targetUnit: 'measurement',
      consumeAmount: 250,
      estimatedDueDays: 7,
      expirationThreshold: 2,
      expirationMode: 'days from purchase',
    })
  })

  it("user's oldest stock row wins when the item is not stocked at the default location", async () => {
    // Given an item stocked only at 'office' (newer) and 'cabin' (oldest)
    // When the app opens the database at version 16
    await db.open()

    // Then the oldest row's configuration wins
    const migrated = await db.items.get('item-remote')
    expect(migrated).toMatchObject({
      packageUnit: 'oldest-sack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'measurement',
      consumeAmount: 100,
      expirationMode: 'disabled',
    })
  })

  it('user keeps a single-location item’s settings', async () => {
    // Given an item stocked at exactly one (non-default) location
    // When the app opens the database at version 16
    await db.open()

    // Then that row's configuration is the item's
    const migrated = await db.items.get('item-single')
    expect(migrated).toMatchObject({
      packageUnit: 'bag',
      consumeAmount: 3,
      targetUnit: 'package',
    })
  })

  it('user’s orphan item (stocked nowhere) takes the field defaults', async () => {
    // Given an item with no ItemStock rows at all
    // When the app opens the database at version 16
    await db.open()

    // Then it still carries valid required configuration
    const migrated = (await db.items.get('item-orphan')) as unknown as Row
    expect(migrated.targetUnit).toBe('package')
    expect(migrated.consumeAmount).toBe(1)
    expect(migrated.packageUnit).toBeUndefined()
    expect(migrated.expirationMode).toBeUndefined()
  })

  it('the eight configuration fields are gone from every ItemStock row', async () => {
    // Given a v15 database whose stock rows carry configuration
    // When the app opens it at version 16
    await db.open()

    // Then no stock row carries any of them any more
    const stocks = (await db.itemStocks.toArray()) as unknown as Row[]
    expect(stocks).toHaveLength(6)
    for (const row of stocks) {
      for (const key of GLOBAL_KEYS) {
        expect(row).not.toHaveProperty(key)
      }
    }
  })

  it('per-location state survives the move', async () => {
    // Given stock rows carrying quantities and targets
    // When the app opens the database at version 16
    await db.open()

    // Then the five state fields are untouched, per location
    const local = await db.itemStocks.get('st-default-local')
    expect(local).toMatchObject({
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 500,
    })
    const cabin = await db.itemStocks.get('st-default-cabin')
    expect(cabin).toMatchObject({ targetQuantity: 2, packedQuantity: 1 })
  })

  // `on('populate')` runs INSTEAD of the upgrade fns on a brand-new database
  // (see db/CLAUDE.md), so "the migration is right" says nothing about what a
  // fresh install looks like. Assert the two shapes agree rather than assume it.
  it('a fresh database ends up with the same shape as a migrated one', async () => {
    // Given a v15 database migrated to v16
    await db.open()
    const migratedVersion = db.verno
    const migratedItem = (await db.items.get('item-single')) as unknown as Row
    const migratedStock = (await db.itemStocks.get(
      'st-single',
    )) as unknown as Row
    const migratedItemKeys = Object.keys(migratedItem).sort()
    const migratedStockKeys = Object.keys(migratedStock).sort()

    // When an equivalent item is created in a database built from scratch
    db.close()
    await Dexie.delete('Player1Inventory')
    await db.open()
    const created = await createItem(
      {
        name: 'Rice',
        tagIds: [],
        packageUnit: 'bag',
        targetUnit: 'package',
        consumeAmount: 3,
        targetQuantity: 6,
      },
      'cabin',
    )
    const freshItem = (await db.items.get(created.id)) as unknown as Row
    const freshStock = (await getItemStock(created.id, 'cabin')) as unknown as
      | Row
      | undefined

    // Then both databases are at the same version and hold the same shape
    expect(db.verno).toBe(migratedVersion)
    expect(Object.keys(freshItem).sort()).toEqual(migratedItemKeys)
    expect(Object.keys(freshStock as Row).sort()).toEqual(migratedStockKeys)
  })

  it('the upgrade is idempotent — an already-migrated item is left alone', async () => {
    // Given an item that already carries its configuration and whose stock row
    // has already been stripped (what a repeat run of the upgrade would see)
    const v15 = new Dexie('Player1Inventory')
    v15.version(15).stores(V15_STORES)
    await v15.open()
    await v15.table('items').put({
      ...makeItem('item-done', 'Sugar'),
      packageUnit: 'jar',
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: 750,
      consumeAmount: 25,
      expirationMode: 'disabled',
    })
    await v15.table('itemStocks').put({
      id: 'st-done',
      itemId: 'item-done',
      locationId: 'local',
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
      createdAt: NOW,
      updatedAt: NOW,
    })
    v15.close()

    // When the app opens the database at version 16
    await db.open()

    // Then nothing about it changed
    expect(await db.items.get('item-done')).toMatchObject({
      packageUnit: 'jar',
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: 750,
      consumeAmount: 25,
      expirationMode: 'disabled',
    })
  })
})
