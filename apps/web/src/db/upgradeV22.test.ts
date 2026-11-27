import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_LOCATION_ID } from '@/types'
import { db } from './index'
import { createItem } from './operations'

// Exercises the real v21 → v22 upgrade (`ItemStock.isActive`, the "Active
// here" switch): a database is created at version 21, seeded, closed, then
// reopened through the app's `db` (version 22 or later) so Dexie runs the
// upgrade.
//
// The fixture has FIVE stock rows: target 0, target 5 and target 0.5 with no
// value, plus a stored `true` with target 0 and a stored `false` with target 5.
// The last two are what make the test able to fail: with only the first three,
// "derive where missing" and "derive everywhere" give the same database.

const V21_STORES = {
  items: 'id, name, createdAt, updatedAt',
  itemStocks: 'id, itemId, locationId, [itemId+locationId], updatedAt',
  tags: 'id, typeId, parentId, createdAt',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, locationId, occurredAt, createdAt',
  shoppingCarts: 'id',
  cartItems: 'id, cartId, itemId, &[cartId+itemId]',
  vendors: 'id, name',
  recipes: 'id, name, lastCookedAt',
  shelves: 'id, name, type, order',
  locations: 'id, order, name',
}

const NOW = new Date('2026-11-01T00:00:00.000Z')

function stockRow(
  id: string,
  targetQuantity: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    itemId: `item-${id}`,
    locationId: DEFAULT_LOCATION_ID,
    targetQuantity,
    refillThreshold: 0,
    packedQuantity: 1,
    unpackedQuantity: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  }
}

async function seedV21Database(): Promise<void> {
  const v21 = new Dexie('Player1Inventory')
  v21.version(21).stores(V21_STORES)
  await v21.open()
  await v21
    .table('itemStocks')
    .bulkPut([
      stockRow('no-target', 0),
      stockRow('target-five', 5),
      stockRow('target-half', 0.5),
      stockRow('kept-true', 0, { isActive: true }),
      stockRow('kept-false', 5, { isActive: false }),
    ])
  v21.close()
}

async function storedIsActive(id: string): Promise<unknown> {
  const row = (await db.itemStocks.get(id)) as
    | Record<string, unknown>
    | undefined
  return row?.isActive
}

describe('v21 → v22 upgrade (ItemStock.isActive)', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
    await seedV21Database()
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  it('user’s old stock rows keep their meaning: target 0 is off, any other target is on', async () => {
    // When the app opens the version-21 database
    await db.open()
    expect(db.verno).toBeGreaterThanOrEqual(22)

    // Then a row with no value gets the old rule, written out as a boolean
    expect(await storedIsActive('no-target')).toBe(false)
    expect(await storedIsActive('target-five')).toBe(true)
    expect(await storedIsActive('target-half')).toBe(true)
  })

  it('a stored value is kept, whatever the target is', async () => {
    await db.open()

    expect(await storedIsActive('kept-true')).toBe(true)
    expect(await storedIsActive('kept-false')).toBe(false)
  })

  it('the upgrade changes no other field', async () => {
    await db.open()

    const row = await db.itemStocks.get('target-five')
    expect(row).toMatchObject({
      targetQuantity: 5,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
    })
  })
})

describe('a fresh database at version 22', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  it('user’s new item with no target opens active', async () => {
    // A fresh database never runs the upgrade. It needs nothing from it:
    // it has no stock rows at populate time, and every writer writes a value.
    await db.open()
    expect(db.verno).toBeGreaterThanOrEqual(22)
    expect(await db.itemStocks.count()).toBe(0)

    const item = await createItem({ name: 'Tissue', tagIds: [] })

    const stock = await db.itemStocks
      .where('[itemId+locationId]')
      .equals([item.id, DEFAULT_LOCATION_ID])
      .first()
    expect(stock?.targetQuantity).toBe(0)
    expect(stock?.isActive).toBe(true)
  })
})
