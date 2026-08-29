import { describe, expect, it } from 'vitest'
import type { Item } from '@/types'
import {
  addItem,
  computeFillToFull,
  computePack,
  computeUnpack,
  consumeItem,
  convertTrackedQuantities,
  getCurrentQuantity,
  getItemPackUnits,
  getPackedTotal,
  getStockPreview,
  getStockStatus,
  isEmptyStock,
  isInactive,
  isInactiveHere,
  isLowStock,
  isStockedHere,
  roundToStep,
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

  it('returns packed + unpacked for simple tracking with unpacked', () => {
    const item: Partial<Item> = {
      packageUnit: 'pack',
      packedQuantity: 3,
      unpackedQuantity: 0.5,
    }

    expect(getCurrentQuantity(item as Item)).toBe(3.5)
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

  it('calculates total for measurement-only mode (no packageUnit)', () => {
    const item: Partial<Item> = {
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: 100,
      packedQuantity: 3,
      unpackedQuantity: 50,
    }

    // 3 * 100 + 50 = 350g
    expect(getCurrentQuantity(item as Item)).toBe(350)
  })
})

describe('getPackedTotal', () => {
  it('returns packed + unpacked for package-only item', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      packedQuantity: 3,
      unpackedQuantity: 0,
    }

    expect(getPackedTotal(item as Item)).toBe(3)
  })

  it('returns packed + unpacked for package-only item with fractional unpacked', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      packedQuantity: 3,
      unpackedQuantity: 0.5,
    }

    expect(getPackedTotal(item as Item)).toBe(3.5)
  })

  it('converts unpacked measurement to fractional packs for dual-unit item', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'g',
      amountPerPackage: 100,
      packedQuantity: 2,
      unpackedQuantity: 50,
    }

    // 2 + 50/100 = 2.5 packages
    expect(getPackedTotal(item as Item)).toBe(2.5)
  })

  it('returns packed quantity when unpacked is zero for dual-unit item', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'g',
      amountPerPackage: 100,
      packedQuantity: 3,
      unpackedQuantity: 0,
    }

    expect(getPackedTotal(item as Item)).toBe(3)
  })

  it('returns 0 when all quantities are zero', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      packedQuantity: 0,
      unpackedQuantity: 0,
    }

    expect(getPackedTotal(item as Item)).toBe(0)
  })
})

describe('consumeItem', () => {
  it('consumes from unpacked first in measurement mode', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      packedQuantity: 2,
      unpackedQuantity: 0.5,
    }

    consumeItem(item as Item, 0.25)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(0.25)
  })

  it('breaks package when unpacked insufficient in measurement mode', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      packedQuantity: 2,
      unpackedQuantity: 0.3,
    }

    consumeItem(item as Item, 0.5)

    expect(item.packedQuantity).toBe(1)
    expect(item.unpackedQuantity).toBe(0.8)
  })

  it('handles consuming exactly unpacked amount in measurement mode', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
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
      targetUnit: 'package',
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
      targetUnit: 'measurement',
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
      targetUnit: 'measurement',
      packedQuantity: 0,
      unpackedQuantity: 0.3,
    }

    consumeItem(item as Item, 1)

    expect(item.packedQuantity).toBe(0)
    expect(item.unpackedQuantity).toBe(0)
  })

  it('breaks package in measurement-only mode', () => {
    const item: Partial<Item> = {
      measurementUnit: 'g',
      amountPerPackage: 100,
      targetUnit: 'measurement',
      packedQuantity: 3,
      unpackedQuantity: 50,
    }

    // Consume 80g (50 from unpacked + 30 from breaking a packed unit)
    consumeItem(item as Item, 80)

    expect(item.packedQuantity).toBe(2)
    expect(item.unpackedQuantity).toBe(70) // 100g - 30g = 70g leftover
  })

  it('consumes in package mode with conversion', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'g',
      amountPerPackage: 100,
      targetUnit: 'package',
      packedQuantity: 1,
      unpackedQuantity: 0.5, // 0.5 packages when tracking in packages
    }

    // Consume 0.2 packages
    consumeItem(item as Item, 0.2)

    expect(item.packedQuantity).toBe(1)
    expect(item.unpackedQuantity).toBe(0.3) // 0.5 - 0.2 = 0.3 packages
  })

  it('opens full package when consuming with insufficient unpacked', () => {
    const item: Partial<Item> = {
      packedQuantity: 3,
      unpackedQuantity: 0.2,
      targetUnit: 'measurement',
      measurementUnit: 'L',
      amountPerPackage: 1.0,
      consumeAmount: 0.5,
    }

    consumeItem(item as Item, 0.5)

    // Should open 1 full package (1.0L)
    expect(item.packedQuantity).toBe(2) // One package opened
    expect(item.unpackedQuantity).toBe(0.7) // 0.2 + 1.0 - 0.5 = 0.7
  })

  it('opens full package when consuming with insufficient unpacked in package mode', () => {
    const item: Partial<Item> = {
      packedQuantity: 3,
      unpackedQuantity: 0.2,
      targetUnit: 'package',
      packageUnit: 'bottle',
      consumeAmount: 0.5,
    }

    consumeItem(item as Item, 0.5)

    // Should open 1 full package
    expect(item.packedQuantity).toBe(2) // One package opened
    expect(item.unpackedQuantity).toBe(0.7) // 0.2 + 1.0 - 0.5 = 0.7
  })

  it('opens multiple packages when consuming exceeds one package in package mode', () => {
    const item: Partial<Item> = {
      packedQuantity: 5,
      unpackedQuantity: 0.2,
      targetUnit: 'package',
      packageUnit: 'bottle',
      consumeAmount: 2.5,
    }

    consumeItem(item as Item, 2.5)

    expect(item.packedQuantity).toBe(2) // Opened 3 packages (ceil(2.3) = 3), 5 - 3 = 2
    expect(item.unpackedQuantity).toBe(0.7) // 0.2 + 3 - 2.5 = 0.7
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

    expect(item.packedQuantity).toBe(2) // Stays same - now adds to unpacked
    expect(item.unpackedQuantity).toBe(1.5) // Increased from 0.5 to 1.5
  })

  it('adds to packed quantity in simple mode', () => {
    const item: Partial<Item> = {
      packageUnit: 'dozen',
      targetUnit: 'package',
      packedQuantity: 3,
      unpackedQuantity: 0,
    }

    addItem(item as Item, 1)

    expect(item.packedQuantity).toBe(3) // Stays same - now adds to unpacked
    expect(item.unpackedQuantity).toBe(1) // Increased from 0 to 1
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

    expect(item.packedQuantity).toBe(0) // Stays 0 - added to unpacked
    expect(item.unpackedQuantity).toBe(1) // Increased from 0 to 1
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

    expect(item.packedQuantity).toBe(0) // Stays 0 - added to unpacked
    expect(item.unpackedQuantity).toBe(1) // Increased from 0 to 1
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

    expect(item.packedQuantity).toBe(1) // Stays same - added to unpacked
    expect(item.unpackedQuantity).toBe(1) // Increased from 0 to 1
    expect(item.dueDate).toEqual(existingDate) // Unchanged
  })

  it('adds to unpacked in package mode', () => {
    const item: Partial<Item> = {
      packedQuantity: 5,
      unpackedQuantity: 0.5,
      targetUnit: 'package',
      packageUnit: 'bottle',
      consumeAmount: 1,
    }

    addItem(item as Item, 2)

    expect(item.packedQuantity).toBe(5) // Should stay same
    expect(item.unpackedQuantity).toBe(2.5) // Should add to unpacked
  })
})

describe('isInactive', () => {
  it('returns true when targetQuantity is 0 (refillThreshold also 0)', () => {
    const item: Partial<Item> = {
      targetQuantity: 0,
      refillThreshold: 0,
    }

    expect(isInactive(item as Item)).toBe(true)
  })

  it('returns false when targetQuantity > 0', () => {
    const item: Partial<Item> = {
      targetQuantity: 2,
      refillThreshold: 0,
    }

    expect(isInactive(item as Item)).toBe(false)
  })

  it('returns true when targetQuantity is 0 and refillThreshold > 0', () => {
    const item: Partial<Item> = {
      targetQuantity: 0,
      refillThreshold: 1,
    }

    expect(isInactive(item as Item)).toBe(true)
  })

  it('returns true even when item has stock', () => {
    const item: Partial<Item> = {
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 3,
      unpackedQuantity: 0.5,
    }

    expect(isInactive(item as Item)).toBe(true)
  })
})

describe('isStockedHere', () => {
  it('returns true when item carries a stockId', () => {
    const item = { stockId: 'stock-1' }

    expect(isStockedHere(item)).toBe(true)
  })

  it('returns false when item has no stockId (not stocked in the active location)', () => {
    // This is the ZERO_STOCK join shape returned by joinItemStock() for an item
    // with no ItemStock row in the active location — stockId is undefined even
    // though the item exists globally.
    const item = { stockId: undefined }

    expect(isStockedHere(item)).toBe(false)
  })
})

describe('isInactiveHere', () => {
  it('returns true when stocked here and targetQuantity is 0', () => {
    const item: Partial<Item> & { stockId?: string } = {
      stockId: 'stock-1',
      targetQuantity: 0,
      refillThreshold: 0,
    }

    expect(isInactiveHere(item as Item & { stockId?: string })).toBe(true)
  })

  it('returns false when stocked here and targetQuantity > 0', () => {
    const item: Partial<Item> & { stockId?: string } = {
      stockId: 'stock-1',
      targetQuantity: 2,
      refillThreshold: 1,
    }

    expect(isInactiveHere(item as Item & { stockId?: string })).toBe(false)
  })

  it('returns false when NOT stocked here even though targetQuantity is 0 (the ZERO_STOCK trap)', () => {
    // joinItemStock() returns ZERO_STOCK (targetQuantity: 0, no stockId) for an
    // item with no ItemStock row in the active location. isInactive() alone
    // would wrongly report this merely-unstocked item as inactive; isInactiveHere
    // must guard on stockId to avoid the trap.
    const item: Partial<Item> & { stockId?: string } = {
      stockId: undefined,
      targetQuantity: 0,
      refillThreshold: 0,
    }

    expect(isInactiveHere(item as Item & { stockId?: string })).toBe(false)
  })
})

describe('isEmptyStock', () => {
  const base: Partial<Item> = {
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 2,
    packedQuantity: 0,
    unpackedQuantity: 0,
  }

  it('returns true when quantity is below the refill threshold', () => {
    expect(isEmptyStock({ ...base, packedQuantity: 1 } as Item)).toBe(true)
  })

  it('returns false when quantity sits exactly at the refill threshold', () => {
    expect(isEmptyStock({ ...base, packedQuantity: 2 } as Item)).toBe(false)
  })

  it('returns false when quantity is above the refill threshold', () => {
    expect(isEmptyStock({ ...base, packedQuantity: 3 } as Item)).toBe(false)
  })

  it('returns false for an inactive item even when it has no stock', () => {
    const item = { ...base, targetQuantity: 0, refillThreshold: 2 }

    expect(isEmptyStock(item as Item)).toBe(false)
  })

  it('counts unpacked measurement quantity towards the threshold', () => {
    const item = {
      ...base,
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetQuantity: 2000,
      refillThreshold: 500,
      packedQuantity: 0,
      unpackedQuantity: 600,
    }

    expect(isEmptyStock(item as Item)).toBe(false)
  })
})

describe('isLowStock', () => {
  const base: Partial<Item> = {
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 2,
    packedQuantity: 2,
    unpackedQuantity: 0,
  }

  it('returns true when quantity sits exactly at the refill threshold', () => {
    expect(isLowStock(base as Item)).toBe(true)
  })

  it('returns false when quantity is below the refill threshold', () => {
    expect(isLowStock({ ...base, packedQuantity: 1 } as Item)).toBe(false)
  })

  it('returns false when quantity is above the refill threshold', () => {
    expect(isLowStock({ ...base, packedQuantity: 3 } as Item)).toBe(false)
  })

  it('returns false when the refill threshold is 0 and quantity is 0', () => {
    const item = { ...base, refillThreshold: 0, packedQuantity: 0 }

    expect(isLowStock(item as Item)).toBe(false)
  })

  it('returns false for an inactive item sitting at its refill threshold', () => {
    const item = { ...base, targetQuantity: 0 }

    expect(isLowStock(item as Item)).toBe(false)
  })
})

describe('getStockStatus', () => {
  it('returns error when quantity is below threshold', () => {
    expect(getStockStatus(1, 3)).toBe('error')
  })

  it('returns warning when quantity equals threshold', () => {
    expect(getStockStatus(3, 3)).toBe('warning')
  })

  it('returns ok when quantity is above threshold', () => {
    expect(getStockStatus(5, 3)).toBe('ok')
  })

  it('returns ok when threshold is zero (no tracking)', () => {
    expect(getStockStatus(0, 0)).toBe('ok')
  })
})

describe('roundToStep', () => {
  it('rounds to integer when step is whole number', () => {
    expect(roundToStep(3.0000000000000004, 1)).toBe(3)
  })

  it('rounds to 1 decimal place when step is 0.1', () => {
    expect(roundToStep(0.30000000000000004, 0.1)).toBe(0.3)
  })

  it('rounds to 2 decimal places when step is 0.01', () => {
    expect(roundToStep(0.010000000000000002, 0.01)).toBe(0.01)
  })

  it('handles step with trailing zeros (e.g. 0.10)', () => {
    expect(roundToStep(0.30000000000000004, 0.1)).toBe(0.3)
  })
})

describe('addItem float precision', () => {
  it('user can add 0.1 three times without float drift', () => {
    // Given item with consumeAmount 0.1 and unpackedQuantity 0
    const item: Partial<Item> = {
      targetUnit: 'package',
      packedQuantity: 5,
      unpackedQuantity: 0,
      consumeAmount: 0.1,
    }

    // When adding 0.1 three times
    addItem(item as Item, 0.1)
    addItem(item as Item, 0.1)
    addItem(item as Item, 0.1)

    // Then unpackedQuantity is exactly 0.3 (not 0.30000000000000004)
    expect(item.unpackedQuantity).toBe(0.3)
  })
})

describe('consumeItem float precision', () => {
  it('user can consume 0.1 without float drift', () => {
    // Given item with consumeAmount 0.1 and unpackedQuantity 0.5
    const item: Partial<Item> = {
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0.5,
      consumeAmount: 0.1,
    }

    // When consuming 0.1
    consumeItem(item as Item, 0.1)

    // Then unpackedQuantity is exactly 0.4 (not 0.4000000000000001)
    expect(item.unpackedQuantity).toBe(0.4)
  })
})

describe('computeUnpack', () => {
  it('package item: moves 1 unit from packed to unpacked', () => {
    const result = computeUnpack(
      { targetUnit: 'package', consumeAmount: 1 },
      { packedQuantity: 3, unpackedQuantity: 0 },
    )
    expect(result.packedQuantity).toBe(2)
    expect(result.unpackedQuantity).toBe(1)
  })

  it('package item with amountPerPackage set: still moves only 1 unit to unpacked, not amountPerPackage', () => {
    // Confirms the bug fix: even with amountPerPackage=6, unpacked gets +1 (not +6) for package targetUnit
    const result = computeUnpack(
      { targetUnit: 'package', amountPerPackage: 6, consumeAmount: 1 },
      { packedQuantity: 3, unpackedQuantity: 0 },
    )
    expect(result.packedQuantity).toBe(2)
    expect(result.unpackedQuantity).toBe(1)
  })

  it('package item: rounds unpacked to consumeAmount precision', () => {
    // consumeAmount=1 (integer); 3-decimal rounding preserves fractional unpacked
    const result = computeUnpack(
      { targetUnit: 'package', consumeAmount: 1 },
      { packedQuantity: 2, unpackedQuantity: 0.001 },
    )
    expect(result.packedQuantity).toBe(1)
    expect(result.unpackedQuantity).toBe(1.001)
  })

  it('measurement item: adds amountPerPackage to unpacked', () => {
    const result = computeUnpack(
      { targetUnit: 'measurement', amountPerPackage: 500, consumeAmount: 1 },
      { packedQuantity: 2, unpackedQuantity: 100 },
    )
    expect(result.packedQuantity).toBe(1)
    expect(result.unpackedQuantity).toBe(600)
  })

  it('measurement item: rounds float addition to consumeAmount precision', () => {
    // 0.2 + 1.1 = 1.2999999999999998 in JS; Math.round(x*1000)/1000 → 1.3
    const result = computeUnpack(
      { targetUnit: 'measurement', amountPerPackage: 1.1, consumeAmount: 0.25 },
      { packedQuantity: 2, unpackedQuantity: 0.2 },
    )
    expect(result.packedQuantity).toBe(1)
    expect(result.unpackedQuantity).toBe(1.3)
  })

  it('returns unchanged state when packed < 1', () => {
    const state = { packedQuantity: 0, unpackedQuantity: 5 }
    const result = computeUnpack(
      { targetUnit: 'package', consumeAmount: 1 },
      state,
    )
    expect(result).toBe(state)
  })

  it('returns unchanged state when targetUnit is measurement but amountPerPackage is missing', () => {
    const state = { packedQuantity: 3, unpackedQuantity: 0 }
    const result = computeUnpack(
      { targetUnit: 'measurement', consumeAmount: 1 },
      state,
    )
    expect(result).toBe(state)
  })
})

describe('computeFillToFull', () => {
  it('package item: sets packed = targetQuantity, unpacked = 0', () => {
    const result = computeFillToFull({
      targetUnit: 'package',
      targetQuantity: 5,
      consumeAmount: 1,
    })
    expect(result.packedQuantity).toBe(5)
    expect(result.unpackedQuantity).toBe(0)
  })

  it('measurement item: calculates packed in package units, not measurement units', () => {
    // 2 L ÷ 0.5 L/bottle = 4 bottles
    const result = computeFillToFull({
      targetUnit: 'measurement',
      targetQuantity: 2,
      amountPerPackage: 0.5,
      consumeAmount: 0.25,
    })
    expect(result.packedQuantity).toBe(4)
    expect(result.unpackedQuantity).toBe(0)
  })

  it('measurement item: puts remainder in unpacked when not evenly divisible', () => {
    // 2.5 L ÷ 1 L/bottle = 2 bottles + 0.5 L remainder
    const result = computeFillToFull({
      targetUnit: 'measurement',
      targetQuantity: 2.5,
      amountPerPackage: 1,
      consumeAmount: 0.5,
    })
    expect(result.packedQuantity).toBe(2)
    expect(result.unpackedQuantity).toBe(0.5)
  })

  it('measurement item without amountPerPackage: falls back to package behavior', () => {
    const result = computeFillToFull({
      targetUnit: 'measurement',
      targetQuantity: 3,
      consumeAmount: 1,
    })
    expect(result.packedQuantity).toBe(3)
    expect(result.unpackedQuantity).toBe(0)
  })

  it('measurement item: rounds unpacked remainder to consumeAmount precision', () => {
    // 1 L ÷ 0.3 L/bottle = floor(3.333…) = 3 bottles, remainder = 1 - 3×0.3 = 0.09999…
    // roundToStep(0.09999…, 0.1) = 0.1
    const result = computeFillToFull({
      targetUnit: 'measurement',
      targetQuantity: 1,
      amountPerPackage: 0.3,
      consumeAmount: 0.1,
    })
    expect(result.packedQuantity).toBe(3)
    expect(result.unpackedQuantity).toBe(0.1)
  })
})

describe('computePack', () => {
  it('package item: moves exactly 1 unit from unpacked to packed per click', () => {
    // consumeAmount:0.5 — result 2.5 stays exact at 0.5 precision
    const result = computePack(
      { targetUnit: 'package', consumeAmount: 0.5 },
      { packedQuantity: 1, unpackedQuantity: 3.5 },
    )
    expect(result.packedQuantity).toBe(2) // only 1 moved, not Math.floor(3.5)=3
    expect(result.unpackedQuantity).toBe(2.5)
  })

  it('package item: no change when unpacked < 1', () => {
    const state = { packedQuantity: 2, unpackedQuantity: 0.7 }
    const result = computePack(
      { targetUnit: 'package', consumeAmount: 1 },
      state,
    )
    expect(result).toBe(state)
  })

  it('package item: rounds remaining unpacked to consumeAmount precision', () => {
    // consumeAmount:1 (integer) — 2.5 - 1 = 1.5; Math.round(1.5*1000)/1000 = 1.5
    const result = computePack(
      { targetUnit: 'package', consumeAmount: 1 },
      { packedQuantity: 0, unpackedQuantity: 2.5 },
    )
    expect(result.packedQuantity).toBe(1) // moves 1, not all
    expect(result.unpackedQuantity).toBe(1.5)
  })

  it('measurement item: consolidates whole packages based on amountPerPackage', () => {
    const result = computePack(
      { targetUnit: 'measurement', amountPerPackage: 500, consumeAmount: 1 },
      { packedQuantity: 1, unpackedQuantity: 1200 },
    )
    expect(result.packedQuantity).toBe(3) // 1 + floor(1200/500) = 3
    expect(result.unpackedQuantity).toBe(200) // 1200 - 2*500 = 200
  })

  it('measurement item: no change when unpacked < amountPerPackage', () => {
    const state = { packedQuantity: 2, unpackedQuantity: 300 }
    const result = computePack(
      { targetUnit: 'measurement', amountPerPackage: 500, consumeAmount: 1 },
      state,
    )
    expect(result).toBe(state)
  })

  it('returns unchanged state when unpacked is 0', () => {
    const state = { packedQuantity: 3, unpackedQuantity: 0 }
    const result = computePack(
      { targetUnit: 'package', consumeAmount: 1 },
      state,
    )
    expect(result).toBe(state)
  })

  it('returns unchanged state when targetUnit is measurement but amountPerPackage is missing', () => {
    const state = { packedQuantity: 2, unpackedQuantity: 1200 }
    const result = computePack(
      { targetUnit: 'measurement', consumeAmount: 1 },
      state,
    )
    expect(result).toBe(state)
  })
})

describe('getItemPackUnits', () => {
  const base: Item = {
    id: 'i1',
    name: 'test',
    tagIds: [],
    vendorIds: [],
    packedQuantity: 3,
    unpackedQuantity: 0,
    targetQuantity: 6,
    refillThreshold: 2,
    consumeAmount: 1,
    targetUnit: 'package',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('returns pack units as-is for package-unit item', () => {
    const result = getItemPackUnits(base)
    expect(result).toEqual({ packed: 3, target: 6, refill: 2 })
  })

  it('converts measurement item to pack units using amountPerPackage', () => {
    const item: Item = {
      ...base,
      targetUnit: 'measurement',
      amountPerPackage: 500,
      targetQuantity: 1500,
      refillThreshold: 500,
    }
    const result = getItemPackUnits(item)
    expect(result).toEqual({ packed: 3, target: 3, refill: 1 })
  })

  it('returns packed 0, target 0 and refill 0 for measurement item without amountPerPackage', () => {
    const item: Item = {
      ...base,
      targetUnit: 'measurement',
      targetQuantity: 10,
      refillThreshold: 3,
    }
    const result = getItemPackUnits(item)
    expect(result).toEqual({ packed: 0, target: 0, refill: 0 })
  })

  it('returns packed 0, target 0 and refill 0 for measurement item with amountPerPackage of 0', () => {
    const item: Item = {
      ...base,
      targetUnit: 'measurement',
      amountPerPackage: 0,
      targetQuantity: 10,
      refillThreshold: 3,
    }
    const result = getItemPackUnits(item)
    expect(result).toEqual({ packed: 0, target: 0, refill: 0 })
  })

  it('user does not see a raw measurement amount counted as packs on a group card', () => {
    // Given a 750 ml bottle tracked in measurement units with NO
    // amountPerPackage — nothing to convert millilitres into packs with
    const item: Item = {
      ...base,
      targetUnit: 'measurement',
      measurementUnit: 'ml',
      packedQuantity: 0,
      unpackedQuantity: 750,
      targetQuantity: 1000,
      refillThreshold: 250,
    }

    // When the group views total it up in pack units
    const result = getItemPackUnits(item)

    // Then it contributes 0 packs, not 750 — the raw millilitre reading must
    // never be summed into a pack total (it used to render "750 / 20 pack")
    expect(result.packed).toBe(0)
    expect(result.packed).not.toBe(750)
  })

  it('a row with no targetUnit at all keeps the packed + unpacked fallback sum', () => {
    // Given a legacy row that carries no targetUnit — the OTHER way into the
    // fallback branch, which the measurement zeroing must not capture
    const item = {
      ...base,
      packedQuantity: 2,
      unpackedQuantity: 1,
      targetUnit: undefined,
    } as unknown as Item

    // When it is totalled in pack units
    const result = getItemPackUnits(item)

    // Then its existing behaviour is unchanged
    expect(result).toEqual({ packed: 3, target: 0, refill: 0 })
  })

  it('packed reflects total of packedQuantity and unpackedQuantity', () => {
    const item: Item = { ...base, packedQuantity: 7 }
    expect(getItemPackUnits(item).packed).toBe(7)
  })

  it('package mode: packed includes unpackedQuantity as pack units', () => {
    // In package mode, 1 unpack removes 1 packed and adds 1 unpacked — both are in package units
    const item: Item = {
      ...base,
      packedQuantity: 3,
      unpackedQuantity: 2,
      targetUnit: 'package',
    }
    expect(getItemPackUnits(item).packed).toBe(5)
  })

  it('measurement mode: packed converts unpackedQuantity to pack units via amountPerPackage', () => {
    const item: Item = {
      ...base,
      targetUnit: 'measurement',
      amountPerPackage: 500,
      targetQuantity: 1500,
      refillThreshold: 500,
      packedQuantity: 3,
      unpackedQuantity: 250,
    }
    // packed = 3 + 250 / 500 = 3.5
    expect(getItemPackUnits(item).packed).toBe(3.5)
  })
})

describe('convertTrackedQuantities', () => {
  it('package → measurement multiplies by amountPerPackage', () => {
    // Given a row tracked in packages, 500 g per package
    const before = {
      unpackedQuantity: 0.5,
      targetQuantity: 4,
      refillThreshold: 1,
    }

    // When the item switches to measurement tracking
    const after = convertTrackedQuantities(before, 500, 'measurement')

    // Then every tracked quantity is expressed in grams
    expect(after).toEqual({
      unpackedQuantity: 250,
      targetQuantity: 2000,
      refillThreshold: 500,
    })
  })

  it('measurement → package divides by amountPerPackage', () => {
    // Given a row tracked in grams, 1000 g per package
    const before = {
      unpackedQuantity: 500,
      targetQuantity: 3000,
      refillThreshold: 250,
    }

    // When the item switches to package tracking
    const after = convertTrackedQuantities(before, 1000, 'package')

    // Then 500 g is half a package — NOT rounded up to 1
    expect(after).toEqual({
      unpackedQuantity: 0.5,
      targetQuantity: 3,
      refillThreshold: 0.25,
    })
  })

  it('round trip package → measurement → package returns the original values exactly', () => {
    // Given values that a naive float conversion would corrupt
    // (0.3 * 3 === 0.8999999999999999, / 3 === 0.29999999999999993)
    const original = {
      unpackedQuantity: 0.3,
      targetQuantity: 2.7,
      refillThreshold: 1.1,
    }

    // When converted to measurement and straight back
    const measurement = convertTrackedQuantities(original, 3, 'measurement')
    expect(measurement).not.toBeNull()
    const roundTripped = convertTrackedQuantities(
      measurement as typeof original,
      3,
      'package',
    )

    // Then nothing has drifted
    expect(roundTripped).toEqual(original)
  })

  it('round trip survives a fractional amountPerPackage', () => {
    const original = {
      unpackedQuantity: 1.25,
      targetQuantity: 10,
      refillThreshold: 2.5,
    }
    const measurement = convertTrackedQuantities(original, 0.7, 'measurement')
    expect(measurement).not.toBeNull()
    expect(
      convertTrackedQuantities(measurement as typeof original, 0.7, 'package'),
    ).toEqual(original)
  })

  it('does not round to integers — a sub-package amount stays fractional', () => {
    // 500 g of a 1000 g package is 0.5 packages; rounding to 1 would invent
    // half a package of inventory.
    const after = convertTrackedQuantities(
      { unpackedQuantity: 500, targetQuantity: 500, refillThreshold: 500 },
      1000,
      'package',
    )
    expect(after?.unpackedQuantity).toBe(0.5)
  })

  it('keeps zero at zero in both directions', () => {
    const zero = {
      unpackedQuantity: 0,
      targetQuantity: 0,
      refillThreshold: 0,
    }
    expect(convertTrackedQuantities(zero, 250, 'measurement')).toEqual(zero)
    expect(convertTrackedQuantities(zero, 250, 'package')).toEqual(zero)
  })

  it('returns null when amountPerPackage is missing, zero or negative', () => {
    const q = { unpackedQuantity: 2, targetQuantity: 4, refillThreshold: 1 }
    expect(convertTrackedQuantities(q, undefined, 'measurement')).toBeNull()
    expect(convertTrackedQuantities(q, 0, 'measurement')).toBeNull()
    expect(convertTrackedQuantities(q, -500, 'measurement')).toBeNull()
    expect(convertTrackedQuantities(q, Number.NaN, 'package')).toBeNull()
  })
})

describe('getStockPreview', () => {
  it('package mode: current is packed + unpacked, displayPacked equals packed', () => {
    const result = getStockPreview(
      { targetUnit: 'package', packageUnit: 'pack', consumeAmount: 1 },
      {
        packedQuantity: 5,
        unpackedQuantity: 1,
        targetQuantity: 8,
        refillThreshold: 2,
      },
    )
    expect(result.current).toBe(6)
    expect(result.displayPacked).toBe(5)
    expect(result.unitLabel).toBe('pack')
    expect(result.status).toBe('ok')
  })

  it('measurement mode: current and displayPacked convert packed via amountPerPackage', () => {
    // 2 packages * 500 g/package + 100 g unpacked = 1100 g; displayPacked = 1000 g
    const result = getStockPreview(
      {
        targetUnit: 'measurement',
        measurementUnit: 'g',
        amountPerPackage: 500,
        consumeAmount: 10,
      },
      {
        packedQuantity: 2,
        unpackedQuantity: 100,
        targetQuantity: 2000,
        refillThreshold: 200,
      },
    )
    expect(result.current).toBe(1100)
    expect(result.displayPacked).toBe(1000)
    expect(result.unitLabel).toBe('g')
  })

  it('measurement mode with amountPerPackage 0 treats it as "no conversion rate" and sums packed + unpacked', () => {
    // amountPerPackage: 0 is reachable from ItemForm's string field ('0'
    // passes its validation, which only rejects empty). 0 must not be read
    // as a real conversion rate — see computeFillToFull's matching
    // `amountPerPackage && amountPerPackage > 0` convention.
    const result = getStockPreview(
      {
        targetUnit: 'measurement',
        measurementUnit: 'g',
        amountPerPackage: 0,
        consumeAmount: 1,
      },
      {
        packedQuantity: 3,
        unpackedQuantity: 2,
        targetQuantity: 10,
        refillThreshold: 1,
      },
    )
    expect(result.current).toBe(5)
    expect(result.displayPacked).toBe(3)
  })

  it('measurement mode with a negative amountPerPackage also falls back to no conversion rate', () => {
    // A negative rate is truthy (bare `amountPerPackage &&` would accept it)
    // but not `> 0` — this is the fixture that actually distinguishes the
    // two guard forms, since 0 is falsy under both and can't.
    const result = getStockPreview(
      {
        targetUnit: 'measurement',
        measurementUnit: 'g',
        amountPerPackage: -5,
        consumeAmount: 1,
      },
      {
        packedQuantity: 3,
        unpackedQuantity: 2,
        targetQuantity: 10,
        refillThreshold: 1,
      },
    )
    expect(result.current).toBe(5)
    expect(result.displayPacked).toBe(3)
  })

  it('quantityLabel shows the "packed (+unpacked) / target" form when unpacked > 0', () => {
    const result = getStockPreview(
      {
        targetUnit: 'measurement',
        measurementUnit: 'g',
        amountPerPackage: 500,
        consumeAmount: 10,
      },
      {
        packedQuantity: 2,
        unpackedQuantity: 100,
        targetQuantity: 2000,
        refillThreshold: 200,
      },
    )
    expect(result.quantityLabel).toBe('1000 (+100) / 2000')
  })

  it('quantityLabel collapses to "current / target" when unpacked is 0', () => {
    const result = getStockPreview(
      { targetUnit: 'package', packageUnit: 'pack', consumeAmount: 1 },
      {
        packedQuantity: 5,
        unpackedQuantity: 0,
        targetQuantity: 8,
        refillThreshold: 2,
      },
    )
    expect(result.quantityLabel).toBe('5 / 8')
  })

  it('status is "inactive" when targetQuantity is 0, overriding an otherwise-error quantity', () => {
    const result = getStockPreview(
      { targetUnit: 'package', packageUnit: 'pack', consumeAmount: 1 },
      {
        packedQuantity: 0,
        unpackedQuantity: 0,
        targetQuantity: 0,
        refillThreshold: 3,
      },
    )
    expect(result.status).toBe('inactive')
  })

  it('isAtFull is true for a measurement item exactly at its converted Fill-to-Full state', () => {
    // Fill to Full for target 2.5 L @ 1 L/bottle = 2 bottles packed + 0.5 L unpacked
    const atFull = getStockPreview(
      {
        targetUnit: 'measurement',
        measurementUnit: 'L',
        amountPerPackage: 1,
        consumeAmount: 0.5,
      },
      {
        packedQuantity: 2,
        unpackedQuantity: 0.5,
        targetQuantity: 2.5,
        refillThreshold: 1,
      },
    )
    expect(atFull.isAtFull).toBe(true)

    // A different unpacked value is not the Fill-to-Full state
    const notAtFull = getStockPreview(
      {
        targetUnit: 'measurement',
        measurementUnit: 'L',
        amountPerPackage: 1,
        consumeAmount: 0.5,
      },
      {
        packedQuantity: 2,
        unpackedQuantity: 0.3,
        targetQuantity: 2.5,
        refillThreshold: 1,
      },
    )
    expect(notAtFull.isAtFull).toBe(false)
  })

  it('isAtZero is true only when both packed and unpacked are zero', () => {
    const zero = getStockPreview(
      { targetUnit: 'package', packageUnit: 'pack', consumeAmount: 1 },
      {
        packedQuantity: 0,
        unpackedQuantity: 0,
        targetQuantity: 8,
        refillThreshold: 2,
      },
    )
    expect(zero.isAtZero).toBe(true)

    const notZero = getStockPreview(
      { targetUnit: 'package', packageUnit: 'pack', consumeAmount: 1 },
      {
        packedQuantity: 0,
        unpackedQuantity: 1,
        targetQuantity: 8,
        refillThreshold: 2,
      },
    )
    expect(notZero.isAtZero).toBe(false)
  })
})
