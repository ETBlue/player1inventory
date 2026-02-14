import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './index'
import { migrateItemsToV2 } from './migrate'

describe('migrateItemsToV2', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  it('migrates old items with unit field', async () => {
    // Manually add old-style item (simulating v1 data) using put() to specify ID
    await db.items.put({
      id: '1',
      name: 'Old Item',
      unit: 'bottle',
      tagIds: [],
      targetQuantity: 5,
      refillThreshold: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      // biome-ignore lint/suspicious/noExplicitAny: Testing migration of old schema data
    } as any)

    await migrateItemsToV2()

    const item = await db.items.get('1')
    expect(item).toBeDefined()
    expect(item?.packageUnit).toBe('bottle')
    expect(item?.measurementUnit).toBeUndefined()
    expect(item?.targetUnit).toBe('package')
    expect(item?.packedQuantity).toBe(5)
    expect(item?.unpackedQuantity).toBe(0)
    expect(item?.consumeAmount).toBe(1)
  })

  it('does not modify already migrated items', async () => {
    const itemId = '2'
    await db.items.add({
      id: itemId,
      name: 'New Item',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 2,
      refillThreshold: 0.5,
      packedQuantity: 1,
      unpackedQuantity: 0.5,
      consumeAmount: 0.25,
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await migrateItemsToV2()

    const item = await db.items.get(itemId)
    expect(item?.packageUnit).toBe('bottle')
    expect(item?.packedQuantity).toBe(1)
    expect(item?.unpackedQuantity).toBe(0.5)
  })
})
