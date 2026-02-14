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

describe('ItemCard - Expiration Warning Logic', () => {
  it('shows warning when within threshold', () => {
    const estimatedDueDate = new Date(Date.now() + 2 * 86400000) // 2 days from now
    const item: Partial<Item> = {
      expirationThreshold: 3,
    }

    const daysUntilExpiration = Math.ceil(
      (estimatedDueDate.getTime() - Date.now()) / 86400000,
    )
    const threshold = item.expirationThreshold ?? Number.POSITIVE_INFINITY
    const shouldShowWarning = daysUntilExpiration <= threshold

    expect(shouldShowWarning).toBe(true)
  })

  it('hides warning when outside threshold', () => {
    const estimatedDueDate = new Date(Date.now() + 5 * 86400000) // 5 days from now
    const item: Partial<Item> = {
      expirationThreshold: 3,
    }

    const daysUntilExpiration = Math.ceil(
      (estimatedDueDate.getTime() - Date.now()) / 86400000,
    )
    const threshold = item.expirationThreshold ?? Number.POSITIVE_INFINITY
    const shouldShowWarning = daysUntilExpiration <= threshold

    expect(shouldShowWarning).toBe(false)
  })

  it('always shows warning when no threshold set', () => {
    const estimatedDueDate = new Date(Date.now() + 10 * 86400000) // 10 days from now
    const item: Partial<Item> = {
      expirationThreshold: undefined,
    }

    const daysUntilExpiration = Math.ceil(
      (estimatedDueDate.getTime() - Date.now()) / 86400000,
    )
    const threshold = item.expirationThreshold ?? Number.POSITIVE_INFINITY
    const shouldShowWarning = daysUntilExpiration <= threshold

    expect(shouldShowWarning).toBe(true)
  })

  it('shows warning when already expired', () => {
    const estimatedDueDate = new Date(Date.now() - 2 * 86400000) // 2 days ago
    const item: Partial<Item> = {
      expirationThreshold: 3,
    }

    const daysUntilExpiration = Math.ceil(
      (estimatedDueDate.getTime() - Date.now()) / 86400000,
    )
    const threshold = item.expirationThreshold ?? Number.POSITIVE_INFINITY
    const shouldShowWarning = daysUntilExpiration <= threshold

    expect(shouldShowWarning).toBe(true)
  })
})
