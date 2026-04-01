import { describe, expect, it } from 'vitest'
import type { Item } from '@/types'
import { computeExpiryDate } from './expiration'

type ItemSlice = Pick<Item, 'expirationMode' | 'dueDate' | 'estimatedDueDays'>

describe('computeExpiryDate', () => {
  const dueDate = new Date('2026-06-01')
  const lastPurchase = new Date('2026-01-01')

  it('returns undefined when mode is disabled', () => {
    const item: ItemSlice = {
      expirationMode: 'disabled',
      dueDate,
      estimatedDueDays: 30,
    }
    expect(computeExpiryDate(item, lastPurchase)).toBeUndefined()
  })

  it('returns undefined when mode is undefined (treats as disabled)', () => {
    const item: ItemSlice = {
      expirationMode: undefined,
      dueDate,
      estimatedDueDays: 30,
    }
    expect(computeExpiryDate(item, lastPurchase)).toBeUndefined()
  })

  it('returns dueDate when mode is date', () => {
    const item: ItemSlice = {
      expirationMode: 'date',
      dueDate,
      estimatedDueDays: undefined,
    }
    expect(computeExpiryDate(item)).toEqual(dueDate)
  })

  it('returns undefined when mode is date but dueDate is missing', () => {
    const item: ItemSlice = {
      expirationMode: 'date',
      dueDate: undefined,
      estimatedDueDays: undefined,
    }
    expect(computeExpiryDate(item)).toBeUndefined()
  })

  it('returns lastPurchase + estimatedDueDays when mode is days from purchase', () => {
    const item: ItemSlice = {
      expirationMode: 'days from purchase',
      dueDate: undefined,
      estimatedDueDays: 30,
    }
    const result = computeExpiryDate(item, lastPurchase)
    const expected = new Date(lastPurchase.getTime() + 30 * 24 * 60 * 60 * 1000)
    expect(result).toEqual(expected)
  })

  it('returns undefined when mode is days from purchase but lastPurchaseDate is missing', () => {
    const item: ItemSlice = {
      expirationMode: 'days from purchase',
      dueDate: undefined,
      estimatedDueDays: 30,
    }
    expect(computeExpiryDate(item, undefined)).toBeUndefined()
  })

  it('returns undefined when mode is days from purchase but estimatedDueDays is missing', () => {
    const item: ItemSlice = {
      expirationMode: 'days from purchase',
      dueDate: undefined,
      estimatedDueDays: undefined,
    }
    expect(computeExpiryDate(item, lastPurchase)).toBeUndefined()
  })
})
