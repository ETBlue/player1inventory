import { describe, expect, it } from 'vitest'
import type { Item } from '@/types'

describe('ItemCard - Unit Display Logic', () => {
  it('returns package unit when tracking in packages', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      targetUnit: 'package',
    }

    const displayUnit =
      item.targetUnit === 'measurement' && item.measurementUnit
        ? item.measurementUnit
        : (item.packageUnit ?? 'units')

    expect(displayUnit).toBe('bottle')
  })

  it('returns measurement unit when tracking in measurement', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      targetUnit: 'measurement',
    }

    const displayUnit =
      item.targetUnit === 'measurement' && item.measurementUnit
        ? item.measurementUnit
        : (item.packageUnit ?? 'units')

    expect(displayUnit).toBe('L')
  })

  it('returns package unit as fallback when tracking in measurement but no measurementUnit', () => {
    const item: Partial<Item> = {
      packageUnit: 'pack',
      targetUnit: 'measurement',
    }

    const displayUnit =
      item.targetUnit === 'measurement' && item.measurementUnit
        ? item.measurementUnit
        : (item.packageUnit ?? 'units')

    expect(displayUnit).toBe('pack')
  })

  it('returns "units" when no package unit defined', () => {
    const item: Partial<Item> = {
      targetUnit: 'package',
    }

    const displayUnit =
      item.targetUnit === 'measurement' && item.measurementUnit
        ? item.measurementUnit
        : (item.packageUnit ?? 'units')

    expect(displayUnit).toBe('units')
  })
})
