import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem } from '@/db/operations'
import {
  addItem,
  consumeItem,
  getCurrentQuantity,
  isInactive,
} from './quantityUtils'

describe('Dual-unit tracking integration', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('handles complete workflow: add, consume, inactive', async () => {
    // Create item
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 2,
      refillThreshold: 0.5,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0.25,
      estimatedDueDays: 7,
      tagIds: [],
    })

    // Add 2 bottles
    addItem(item)
    addItem(item)
    expect(item.packedQuantity).toBe(2)
    expect(getCurrentQuantity(item)).toBe(2)
    expect(item.dueDate).toBeDefined()

    // Consume 0.25L (breaks first package)
    consumeItem(item, 0.25)
    expect(item.packedQuantity).toBe(1)
    expect(item.unpackedQuantity).toBe(0.75)

    // Consume 1.75L more (empties all)
    consumeItem(item, 1.75)
    expect(item.packedQuantity).toBe(0)
    expect(item.unpackedQuantity).toBe(0)
    expect(item.dueDate).toBeUndefined() // Cleared

    // Set target to 0 → becomes inactive
    item.targetQuantity = 0
    expect(isInactive(item)).toBe(true)
  })
})
