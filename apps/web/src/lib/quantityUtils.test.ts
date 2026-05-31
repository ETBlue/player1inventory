import { describe, expect, it } from 'vitest'
import type { Item } from '@/types'
import {
  addItem,
  computeFillToFull,
  computePack,
  computeUnpack,
  consumeItem,
  getCurrentQuantity,
  getPackedTotal,
  getStockStatus,
  isInactive,
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
    // consumeAmount=0.001 preserves 3 decimal places; float drift is prevented
    const result = computeUnpack(
      { targetUnit: 'package', consumeAmount: 0.001 },
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
    // 0.2 + 1.1 = 1.2999999999999998 in JS; roundToStep snaps to 0.1 step → 1.3
    const result = computeUnpack(
      { targetUnit: 'measurement', amountPerPackage: 1.1, consumeAmount: 0.1 },
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
    // consumeAmount:0.5 — 2.5 - 1 = 1.5, stays exact at 0.5 step
    const result = computePack(
      { targetUnit: 'package', consumeAmount: 0.5 },
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
