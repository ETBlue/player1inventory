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
    const item = await db.items.add({
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

    expect(item).toBeDefined()
  })

  it('allows creating item with simple tracking (no measurement unit)', async () => {
    const item = await db.items.add({
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

    expect(item).toBeDefined()
  })
})
