import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './index'

// Exercises the real v14 → v15 upgrade (the Item/ItemStock split): a database
// is created at version 14 with the pre-split schema, seeded, closed, then
// reopened through the app's `db` (version 15) so Dexie runs the upgrade fn.

const V14_STORES = {
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, typeId, parentId, createdAt',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name, lastCookedAt',
  shelves: 'id, name, type, order',
  locations: 'id, order, name',
}

const NOW = new Date('2026-02-01T00:00:00.000Z')

async function seedV14Database(): Promise<void> {
  const v14 = new Dexie('Player1Inventory')
  v14.version(14).stores(V14_STORES)
  await v14.open()

  // A pre-split item: stock, units and expiration all inline on the item row.
  await v14.table('items').add({
    id: 'item-1',
    name: 'Milk',
    tagIds: [],
    packageUnit: 'bottle',
    measurementUnit: 'ml',
    amountPerPackage: 1000,
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 3,
    unpackedQuantity: 0.5,
    consumeAmount: 250,
    dueDate: new Date('2026-03-01T00:00:00.000Z'),
    expirationMode: 'date',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await v14.table('inventoryLogs').add({
    id: 'log-1',
    itemId: 'item-1',
    delta: 1,
    quantity: 3,
    occurredAt: NOW,
    createdAt: NOW,
  })
  // Pre-v15 carts are keyed by vendor id / the 'no-vendor' sentinel.
  await v14
    .table('shoppingCarts')
    .bulkPut([{ id: 'no-vendor' }, { id: 'vendor-1', lastPurchasedAt: NOW }])
  await v14.table('cartItems').bulkPut([
    { id: 'ci-1', cartId: 'no-vendor', itemId: 'item-1', quantity: 2 },
    { id: 'ci-2', cartId: 'vendor-1', itemId: 'item-1', quantity: 1 },
  ])

  v14.close()
}

describe('v14 → v15 upgrade (Item/ItemStock split)', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
    await seedV14Database()
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  it('user keeps their stock — it moves onto a local ItemStock row', async () => {
    // Given a v14 database with an item carrying inline stock
    // When the app opens it at version 15
    await db.open()

    // Then the per-location STATE lives on an ItemStock row for the default
    // location. (Opening the app's `db` runs v15 and then v16, so the
    // configuration half has already moved back onto the Item — see
    // upgradeV16.test.ts.)
    const stocks = await db.itemStocks.toArray()
    expect(stocks).toHaveLength(1)
    expect(stocks[0]).toMatchObject({
      itemId: 'item-1',
      locationId: 'local',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0.5,
    })
    expect(stocks[0]?.dueDate?.toISOString()).toBe('2026-03-01T00:00:00.000Z')

    // And the item row keeps its identity plus the global configuration
    const item = (await db.items.get('item-1')) as Record<string, unknown>
    expect(item.name).toBe('Milk')
    expect(item).toMatchObject({
      packageUnit: 'bottle',
      measurementUnit: 'ml',
      amountPerPackage: 1000,
      targetUnit: 'package',
      consumeAmount: 250,
      expirationMode: 'date',
    })
    expect(item.packedQuantity).toBeUndefined()
    expect(item.targetQuantity).toBeUndefined()
    expect(item.dueDate).toBeUndefined()

    // And the default location exists
    expect(await db.locations.get('local')).toBeDefined()
  })

  it('user keeps their history — logs are stamped with the default location', async () => {
    // Given a v14 database with an inventory log
    // When the app opens it at version 15
    await db.open()

    // Then the log is attributed to the default location
    const log = await db.inventoryLogs.get('log-1')
    expect(log?.locationId).toBe('local')
  })

  it('user keeps their carts — cart ids are re-keyed to the default location', async () => {
    // Given a v14 database with a no-vendor cart and a vendor cart
    // When the app opens it at version 15
    await db.open()

    // Then every cart id is scoped to the default location
    const carts = await db.shoppingCarts.toArray()
    expect(carts.map((c) => c.id).sort()).toEqual([
      'local:no-vendor',
      'local:vendor-1',
    ])
    expect(
      (await db.shoppingCarts.get('local:vendor-1'))?.lastPurchasedAt,
    ).toBeInstanceOf(Date)

    // And their cart items follow them
    const cartItems = await db.cartItems.toArray()
    expect(cartItems.find((ci) => ci.id === 'ci-1')?.cartId).toBe(
      'local:no-vendor',
    )
    expect(cartItems.find((ci) => ci.id === 'ci-2')?.cartId).toBe(
      'local:vendor-1',
    )
  })
})
