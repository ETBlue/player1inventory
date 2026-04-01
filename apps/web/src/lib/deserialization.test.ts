import { describe, expect, it } from 'vitest'
import {
  deserializeCart,
  deserializeItem,
  deserializeRecipe,
  deserializeVendor,
} from './deserialization'

describe('deserializeItem', () => {
  it('converts ISO date strings to Date objects', () => {
    const raw = {
      id: '1',
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeItem(raw)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
    expect(result.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('converts dueDate ISO string to Date when present', () => {
    const raw = {
      id: '1',
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      dueDate: '2026-06-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeItem(raw)
    expect(result.dueDate).toBeInstanceOf(Date)
    expect(result.dueDate).toEqual(new Date('2026-06-01T00:00:00.000Z'))
  })

  it('leaves dueDate undefined when absent', () => {
    const raw = {
      id: '1',
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeItem(raw)
    expect(result.dueDate).toBeUndefined()
  })

  it('passes through expirationMode string as-is', () => {
    const raw = {
      id: '1',
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      expirationMode: 'days from purchase',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeItem(raw)
    expect(result.expirationMode).toBe('days from purchase')
  })
})

describe('deserializeVendor', () => {
  it('converts createdAt ISO string to Date', () => {
    const raw = {
      id: '1',
      name: 'Costco',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const result = deserializeVendor(raw)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })
})

describe('deserializeRecipe', () => {
  it('converts createdAt and updatedAt ISO strings to Date', () => {
    const raw = {
      id: '1',
      name: 'Pasta',
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeRecipe(raw)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('converts lastCookedAt when present', () => {
    const raw = {
      id: '1',
      name: 'Pasta',
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
      lastCookedAt: '2026-03-01T00:00:00.000Z',
    }
    const result = deserializeRecipe(raw)
    expect(result.lastCookedAt).toBeInstanceOf(Date)
    expect(result.lastCookedAt).toEqual(new Date('2026-03-01T00:00:00.000Z'))
  })

  it('leaves lastCookedAt undefined when absent', () => {
    const raw = {
      id: '1',
      name: 'Pasta',
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeRecipe(raw)
    expect(result.lastCookedAt).toBeUndefined()
  })
})

describe('deserializeCart', () => {
  it('converts createdAt ISO string to Date', () => {
    const raw = {
      id: '1',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const result = deserializeCart(raw)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('converts completedAt when present', () => {
    const raw = {
      id: '1',
      status: 'completed',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeCart(raw)
    expect(result.completedAt).toBeInstanceOf(Date)
    expect(result.completedAt).toEqual(new Date('2026-02-01T00:00:00.000Z'))
  })

  it('leaves completedAt undefined when absent', () => {
    const raw = {
      id: '1',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const result = deserializeCart(raw)
    expect(result.completedAt).toBeUndefined()
  })
})
