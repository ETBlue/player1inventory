import { describe, expect, it } from 'vitest'
import type { Item } from '@/types'
import {
  addItem,
  consumeItem,
  getCurrentQuantity,
  getDisplayQuantity,
  isInactive,
  normalizeUnpacked,
} from './quantityUtils'

describe('getCurrentQuantity', () => {
  it('calculates total for dual-unit item', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 2,
      unpackedQuantity: 0.5,
    }

    expect(getCurrentQuantity(item as Item)).toBe(2.5)
  })

  it('returns packed quantity for simple tracking', () => {
    const item: Partial<Item> = {
      packageUnit: 'dozen',
      packedQuantity: 3,
      unpackedQuantity: 0,
    }

    expect(getCurrentQuantity(item as Item)).toBe(3)
  })

  it('handles zero quantities', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
    }

    expect(getCurrentQuantity(item as Item)).toBe(0)
  })
})

describe('normalizeUnpacked', () => {
  it('converts excess unpacked to packed', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 1,
      unpackedQuantity: 1.5,
    }

    normalizeUnpacked(item as Item)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(0.5)
  })

  it('handles exact package conversion', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 0,
      unpackedQuantity: 2,
    }

    normalizeUnpacked(item as Item)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(0)
  })

  it('does nothing when unpacked < amountPerPackage', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 1,
      unpackedQuantity: 0.5,
    }

    normalizeUnpacked(item as Item)

    expect(item.packedQuantity).toBe(1)
    expect(item.unpackedQuantity).toBe(0.5)
  })

  it('does nothing for simple tracking', () => {
    const item: Partial<Item> = {
      packageUnit: 'dozen',
      packedQuantity: 3,
      unpackedQuantity: 0,
    }

    normalizeUnpacked(item as Item)

    expect(item.packedQuantity).toBe(3)
    expect(item.unpackedQuantity).toBe(0)
  })
})

describe('consumeItem', () => {
  it('consumes from unpacked first', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 2,
      unpackedQuantity: 0.5,
    }

    consumeItem(item as Item, 0.25)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(0.25)
  })

  it('breaks package when unpacked insufficient', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 2,
      unpackedQuantity: 0.3,
    }

    consumeItem(item as Item, 0.5)

    expect(item.packedQuantity).toBe(1)
    expect(item.unpackedQuantity).toBe(0.8)
  })

  it('handles consuming exactly unpacked amount', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 2,
      unpackedQuantity: 0.5,
    }

    consumeItem(item as Item, 0.5)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(0)
  })

  it('consumes from packed in simple mode', () => {
    const item: Partial<Item> = {
      packageUnit: 'dozen',
      packedQuantity: 3,
      unpackedQuantity: 0,
    }

    consumeItem(item as Item, 1)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(0)
  })

  it('clears expiration date when quantity reaches 0', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 0,
      unpackedQuantity: 0.5,
      dueDate: new Date('2026-02-20'),
      estimatedDueDays: 7,
    }

    consumeItem(item as Item, 0.5)

    expect(item.packedQuantity).toBe(0)
    expect(item.unpackedQuantity).toBe(0)
    expect(item.dueDate).toBeUndefined()
    expect(item.estimatedDueDays).toBe(7) // Kept as config
  })

  it('prevents negative quantities', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 0,
      unpackedQuantity: 0.3,
    }

    consumeItem(item as Item, 1)

    expect(item.packedQuantity).toBe(0)
    expect(item.unpackedQuantity).toBe(0)
  })
})

describe('addItem', () => {
  it('adds to unpacked quantity when tracking in measurement', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      packedQuantity: 2,
      unpackedQuantity: 0.5,
    }

    addItem(item as Item, 0.25)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(0.75)
  })

  it('adds to packed quantity when tracking in packages', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'package',
      packedQuantity: 2,
      unpackedQuantity: 0.5,
    }

    addItem(item as Item, 1)

    expect(item.packedQuantity).toBe(3)
    expect(item.unpackedQuantity).toBe(0.5)
  })

  it('adds to packed quantity in simple mode', () => {
    const item: Partial<Item> = {
      packageUnit: 'dozen',
      targetUnit: 'package',
      packedQuantity: 3,
      unpackedQuantity: 0,
    }

    addItem(item as Item, 1)

    expect(item.packedQuantity).toBe(4)
  })

  it('recalculates dueDate when adding to empty item with estimatedDueDays', () => {
    const now = new Date('2026-02-14')
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
      estimatedDueDays: 7,
    }

    addItem(item as Item, 1, now)

    expect(item.packedQuantity).toBe(1)
    expect(item.dueDate).toEqual(new Date('2026-02-21'))
  })

  it('does not set dueDate when no estimatedDueDays', () => {
    const now = new Date('2026-02-14')
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
    }

    addItem(item as Item, 1, now)

    expect(item.packedQuantity).toBe(1)
    expect(item.dueDate).toBeUndefined()
  })

  it('does not overwrite existing dueDate', () => {
    const now = new Date('2026-02-14')
    const existingDate = new Date('2026-02-20')
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      targetUnit: 'package',
      packedQuantity: 1,
      unpackedQuantity: 0,
      dueDate: existingDate,
      estimatedDueDays: 7,
    }

    addItem(item as Item, 1, now)

    expect(item.packedQuantity).toBe(2)
    expect(item.dueDate).toEqual(existingDate) // Unchanged
  })
})

describe('isInactive', () => {
  it('returns true when both target and current are 0', () => {
    const item: Partial<Item> = {
      targetQuantity: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
    }

    expect(isInactive(item as Item)).toBe(true)
  })

  it('returns false when target > 0', () => {
    const item: Partial<Item> = {
      targetQuantity: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
    }

    expect(isInactive(item as Item)).toBe(false)
  })

  it('returns false when current > 0', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetQuantity: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
    }

    expect(isInactive(item as Item)).toBe(false)
  })

  it('returns false when unpacked > 0', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetQuantity: 0,
      packedQuantity: 0,
      unpackedQuantity: 0.5,
    }

    expect(isInactive(item as Item)).toBe(false)
  })
})

describe('getDisplayQuantity', () => {
  it('returns packed quantity when tracking in packages', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'package',
      packedQuantity: 3,
      unpackedQuantity: 0.5,
    }

    expect(getDisplayQuantity(item as Item)).toBe(3)
  })

  it('returns total measurement when tracking in measurement units', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      packedQuantity: 2,
      unpackedQuantity: 0.5,
    }

    expect(getDisplayQuantity(item as Item)).toBe(2.5)
  })

  it('returns packed quantity for simple mode', () => {
    const item: Partial<Item> = {
      packageUnit: 'pack',
      targetUnit: 'package',
      packedQuantity: 5,
      unpackedQuantity: 0,
    }

    expect(getDisplayQuantity(item as Item)).toBe(5)
  })
})
