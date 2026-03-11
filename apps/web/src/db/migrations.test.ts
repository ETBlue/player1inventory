import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './index'

describe('Item schema migration', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  it('allows creating item with dual-unit fields', async () => {
    const itemId = await db.items.add({
      id: crypto.randomUUID(),
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0.5,
      consumeAmount: 0.25,
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(itemId).toBeDefined()

    const item = await db.items.get(itemId)
    expect(item).toBeDefined()
    expect(item?.packageUnit).toBe('bottle')
    expect(item?.measurementUnit).toBe('L')
    expect(item?.packedQuantity).toBe(1)
    expect(item?.unpackedQuantity).toBe(0.5)
  })

  it('allows creating item with simple tracking (no measurement unit)', async () => {
    const itemId = await db.items.add({
      id: crypto.randomUUID(),
      name: 'Eggs',
      packageUnit: 'dozen',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(itemId).toBeDefined()

    const item = await db.items.get(itemId)
    expect(item).toBeDefined()
    expect(item?.packageUnit).toBe('dozen')
    expect(item?.measurementUnit).toBeUndefined()
    expect(item?.packedQuantity).toBe(1)
    expect(item?.unpackedQuantity).toBe(0)
  })
})
