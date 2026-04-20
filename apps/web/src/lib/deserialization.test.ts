import { describe, expect, it } from 'vitest'
import {
  deserializeCart,
  deserializeItem,
  deserializeRecipe,
  deserializeShelf,
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

describe('deserializeShelf', () => {
  it('normalizes null filterConfig array fields to empty arrays', () => {
    // Given a raw shelf with null filterConfig array fields (as returned by GraphQL)
    const raw = {
      id: '1',
      name: 'My Shelf',
      filterConfig: {
        tagIds: null,
        vendorIds: null,
        recipeIds: null,
      },
    }

    // When the shelf is deserialized
    const result = deserializeShelf(raw)

    // Then null array fields are normalized to empty arrays
    expect(result.filterConfig?.tagIds).toEqual([])
    expect(result.filterConfig?.vendorIds).toEqual([])
    expect(result.filterConfig?.recipeIds).toEqual([])
  })

  it('preserves non-null filterConfig array fields unchanged', () => {
    // Given a raw shelf with populated filterConfig arrays
    const raw = {
      id: '1',
      name: 'My Shelf',
      filterConfig: {
        tagIds: ['tag-1', 'tag-2'],
        vendorIds: ['vendor-1'],
        recipeIds: [],
      },
    }

    // When the shelf is deserialized
    const result = deserializeShelf(raw)

    // Then the arrays are passed through unchanged
    expect(result.filterConfig?.tagIds).toEqual(['tag-1', 'tag-2'])
    expect(result.filterConfig?.vendorIds).toEqual(['vendor-1'])
    expect(result.filterConfig?.recipeIds).toEqual([])
  })

  it('preserves sortBy and sortDir from filterConfig', () => {
    // Given a raw shelf from GraphQL with sortBy/sortDir in filterConfig
    const raw = {
      id: '1',
      name: 'My Shelf',
      filterConfig: {
        tagIds: [],
        vendorIds: [],
        recipeIds: [],
        sortBy: 'name',
        sortDir: 'asc',
      },
    }

    // When the shelf is deserialized
    const result = deserializeShelf(raw)

    // Then sortBy and sortDir are preserved
    expect(result.filterConfig?.sortBy).toBe('name')
    expect(result.filterConfig?.sortDir).toBe('asc')
  })

  it('uses epoch as fallback when createdAt/updatedAt are absent', () => {
    // Given a shelf without timestamps
    const raw = { id: '1', name: 'My Shelf' }

    // When deserialized
    const result = deserializeShelf(raw)

    // Then epoch is used as fallback
    expect(result.createdAt).toEqual(new Date(0))
    expect(result.updatedAt).toEqual(new Date(0))
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
