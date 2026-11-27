import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isConsumable } from '@/types'
import { db } from './index'
import { createItem } from './operations'

// Exercises the real v20 → v21 upgrade (`Item.consumable`): a database is
// created at version 20, seeded, closed, then reopened through the app's `db`
// (version 21) so Dexie runs the upgrade.
//
// The fixture has THREE items: one with no key, one already `false` and one
// already `true`. With only the first, "set true where missing" and "set true
// everywhere" give the same database, and the test could not tell them apart.

const V20_STORES = {
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

function itemRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    tagIds: [],
    targetUnit: 'package',
    consumeAmount: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  }
}

async function seedV20Database(): Promise<void> {
  const v20 = new Dexie('Player1Inventory')
  v20.version(20).stores(V20_STORES)
  await v20.open()
  await v20
    .table('items')
    .bulkPut([
      itemRow('tissue'),
      itemRow('cups', { consumable: false }),
      itemRow('milk', { consumable: true }),
    ])
  v20.close()
}

describe('v20 → v21 upgrade (Item.consumable)', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
    await seedV20Database()
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  it('user’s old items become consumable, and an item already marked not consumable stays so', async () => {
    // When the app opens the version-20 database
    await db.open()
    expect(db.verno).toBe(21)

    // Then the item with no value is consumable
    expect((await db.items.get('tissue'))?.consumable).toBe(true)
    // And the stored false and true are kept
    expect((await db.items.get('cups'))?.consumable).toBe(false)
    expect((await db.items.get('milk'))?.consumable).toBe(true)
  })
})

describe('a fresh database at version 21', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  it('user’s new item is consumable unless they say otherwise', async () => {
    await db.open()
    expect(db.verno).toBe(21)

    const plain = await createItem({ name: 'Tissue', tagIds: [] })
    const cups = await createItem({
      name: 'Cups',
      tagIds: [],
      consumable: false,
    })

    expect((await db.items.get(plain.id))?.consumable).toBe(true)
    expect((await db.items.get(cups.id))?.consumable).toBe(false)
  })
})

describe('isConsumable', () => {
  it('reads a missing or null value as consumable', () => {
    expect(isConsumable({})).toBe(true)
    expect(isConsumable({ consumable: undefined })).toBe(true)
    expect(isConsumable({ consumable: null })).toBe(true)
    expect(isConsumable({ consumable: true })).toBe(true)
    expect(isConsumable({ consumable: false })).toBe(false)
  })
})
