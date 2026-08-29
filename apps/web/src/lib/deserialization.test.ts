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
  it('converts createdAt ISO string to Date (local-backup shape)', () => {
    // Given a vendor as a *local* backup carries it — IndexedDB stores a
    // createdAt, and export serializes it as ISO 8601. The cloud never sends
    // this field at all; see the next test for that shape.
    const raw = {
      id: '1',
      name: 'Costco',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const result = deserializeVendor(raw)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('falls back to epoch for the cloud wire shape, which has no createdAt', () => {
    // Given a vendor exactly as GetVendors returns it — `Vendor { id, name,
    // userId }` in vendor.graphql, with no createdAt in the SDL, in Prisma, or
    // in the selection set
    const raw = { id: '1', name: 'Costco', userId: 'user-1' }

    // When deserializing
    const result = deserializeVendor(raw)

    // Then createdAt is a valid Date at the epoch — never an Invalid Date,
    // whose NaN getTime() silently no-ops every comparator that touches it
    expect(Number.isNaN(result.createdAt.getTime())).toBe(false)
    expect(result.createdAt).toEqual(new Date(0))
  })

  it('falls back to epoch rather than an Invalid Date for an unparseable createdAt', () => {
    const result = deserializeVendor({
      id: '1',
      name: 'Costco',
      createdAt: 'nope',
    })
    expect(Number.isNaN(result.createdAt.getTime())).toBe(false)
    expect(result.createdAt).toEqual(new Date(0))
  })
})

describe('deserializeRecipe', () => {
  it('converts createdAt and updatedAt ISO strings to Date (local-backup shape)', () => {
    // Given a recipe as a *local* backup carries it — ISO 8601 timestamps. The
    // cloud sends neither field; see the next test.
    const raw = {
      id: '1',
      name: 'Pasta',
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const result = deserializeRecipe(raw)
    expect(result.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2026-02-01T00:00:00.000Z'))
  })

  it('falls back to epoch for the cloud wire shape, which has no timestamps', () => {
    // Given a recipe exactly as GetRecipes returns it — `Recipe { id, name,
    // items, lastCookedAt, userId }` in recipe.graphql, with no
    // createdAt/updatedAt in the SDL, in Prisma, or in the selection set
    const raw = {
      id: '1',
      name: 'Pasta',
      items: [],
      userId: 'user-1',
      lastCookedAt: null,
    }

    // When deserializing
    const result = deserializeRecipe(raw)

    // Then both timestamps are valid Dates at the epoch, never Invalid Dates
    expect(Number.isNaN(result.createdAt.getTime())).toBe(false)
    expect(Number.isNaN(result.updatedAt.getTime())).toBe(false)
    expect(result.createdAt).toEqual(new Date(0))
    expect(result.updatedAt).toEqual(new Date(0))
  })

  it('falls back to epoch rather than an Invalid Date for unparseable timestamps', () => {
    const result = deserializeRecipe({
      id: '1',
      name: 'Pasta',
      items: [],
      createdAt: 'nope',
      updatedAt: 'nope',
    })
    expect(Number.isNaN(result.createdAt.getTime())).toBe(false)
    expect(Number.isNaN(result.updatedAt.getTime())).toBe(false)
    expect(result.createdAt).toEqual(new Date(0))
    expect(result.updatedAt).toEqual(new Date(0))
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

  it('uses epoch as fallback when createdAt/updatedAt are absent', () => {
    // Given a shelf without timestamps
    const raw = { id: '1', name: 'My Shelf' }

    // When deserialized
    const result = deserializeShelf(raw)

    // Then epoch is used as fallback
    expect(result.createdAt).toEqual(new Date(0))
    expect(result.updatedAt).toEqual(new Date(0))
  })

  it('falls back to epoch rather than an Invalid Date for unparseable timestamps', () => {
    // Given a shelf whose timestamps are present but unparseable — the guard
    // `raw.createdAt ? new Date(...) : new Date(0)` passes this through as an
    // Invalid Date; `parseWireDate` does not
    const raw = {
      id: '1',
      name: 'My Shelf',
      createdAt: 'nope',
      updatedAt: 'nope',
    }

    // When deserialized
    const result = deserializeShelf(raw)

    // Then epoch is used, and neither field is an Invalid Date
    expect(Number.isNaN(result.createdAt.getTime())).toBe(false)
    expect(Number.isNaN(result.updatedAt.getTime())).toBe(false)
    expect(result.createdAt).toEqual(new Date(0))
    expect(result.updatedAt).toEqual(new Date(0))
  })
})

describe('deserializeCart', () => {
  it('converts lastPurchasedAt ISO string to Date', () => {
    const raw = { id: 'vendor-1', lastPurchasedAt: '2026-01-01T00:00:00.000Z' }
    const result = deserializeCart(raw)
    expect(result.lastPurchasedAt).toBeInstanceOf(Date)
    expect(result.lastPurchasedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('converts an epoch-millis lastPurchasedAt string to Date', () => {
    // Given a cart as the cloud shipped it while `Cart.lastPurchasedAt` had no
    // type resolver: epoch millis as a digit-string, not ISO 8601. Every backup
    // exported in that window still carries this shape.
    const raw = { id: 'vendor-1', lastPurchasedAt: '1787827334343' }

    // When deserializing
    const result = deserializeCart(raw)

    // Then it is a valid Date at that instant — never an Invalid Date, whose
    // NaN getTime() silently defeats the shopping page's last-purchased sort
    expect(result.lastPurchasedAt).toBeInstanceOf(Date)
    expect(Number.isNaN((result.lastPurchasedAt as Date).getTime())).toBe(false)
    expect((result.lastPurchasedAt as Date).getTime()).toBe(1787827334343)
  })

  it('passes an existing Date through unchanged', () => {
    const date = new Date('2026-01-01T00:00:00.000Z')
    const result = deserializeCart({ id: 'vendor-1', lastPurchasedAt: date })
    expect(result.lastPurchasedAt).toEqual(date)
  })

  it('never emits an Invalid Date for an unparseable lastPurchasedAt', () => {
    const result = deserializeCart({ id: 'vendor-1', lastPurchasedAt: 'nope' })
    expect(result.lastPurchasedAt).toBeUndefined()
  })

  it('leaves lastPurchasedAt undefined when absent', () => {
    const raw = { id: 'vendor-1' }
    const result = deserializeCart(raw)
    expect(result.lastPurchasedAt).toBeUndefined()
  })
})
