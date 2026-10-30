import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PantryItem } from '@/types'
import * as hooks from './index'
import { useVendorItemCounts } from './useVendorItemCounts'

vi.mock('./index', () => ({
  useItems: vi.fn(),
}))

// `useVendorItemCounts` reads exactly ONE field off each row — `item.vendorIds`
// (`useVendorItemCounts.ts:11`). Everything else below is required by
// `PantryItem` and only defaulted so each fixture is a real joined row rather
// than a `Partial`.
const makePantryItem = (
  overrides: Pick<PantryItem, 'id' | 'name'> & Partial<PantryItem>,
): PantryItem => ({
  tagIds: [],
  targetUnit: 'package',
  consumeAmount: 1,
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

// `useItems()` returns the LOCAL branch shape here (`useItems.ts:431`). Built
// field by field rather than cast, so a change to that shape fails this file.
function mockItems(data: PantryItem[]) {
  vi.mocked(hooks.useItems).mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  })
}

describe('useVendorItemCounts', () => {
  it('returns empty Map when no items', () => {
    mockItems([])
    const { result } = renderHook(() => useVendorItemCounts())
    expect(result.current.size).toBe(0)
  })

  it('counts items for single vendor', () => {
    mockItems([
      makePantryItem({ id: '1', name: 'Milk', vendorIds: ['v1'] }),
      makePantryItem({ id: '2', name: 'Eggs', vendorIds: ['v1'] }),
    ])
    const { result } = renderHook(() => useVendorItemCounts())
    expect(result.current.get('v1')).toBe(2)
  })

  it('counts items for multiple vendors', () => {
    mockItems([
      makePantryItem({ id: '1', name: 'Milk', vendorIds: ['v1'] }),
      makePantryItem({ id: '2', name: 'Eggs', vendorIds: ['v2'] }),
    ])
    const { result } = renderHook(() => useVendorItemCounts())
    expect(result.current.get('v1')).toBe(1)
    expect(result.current.get('v2')).toBe(1)
  })

  it('handles items with multiple vendors', () => {
    mockItems([
      makePantryItem({ id: '1', name: 'Milk', vendorIds: ['v1', 'v2'] }),
    ])
    const { result } = renderHook(() => useVendorItemCounts())
    expect(result.current.get('v1')).toBe(1)
    expect(result.current.get('v2')).toBe(1)
  })

  it('handles items without vendorIds', () => {
    // No `vendorIds` key at all — the field is optional on `Item`.
    mockItems([makePantryItem({ id: '1', name: 'Milk' })])
    const { result } = renderHook(() => useVendorItemCounts())
    expect(result.current.size).toBe(0)
  })
})
