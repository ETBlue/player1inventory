import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as hooks from './index'
import { useVendorItemCounts } from './useVendorItemCounts'

vi.mock('./index', () => ({
  useItems: vi.fn(),
}))

describe('useVendorItemCounts', () => {
  it('returns empty Map when no items', () => {
    vi.mocked(hooks.useItems).mockReturnValue({ data: [] } as any)
    const { result } = renderHook(() => useVendorItemCounts())
    expect(result.current.size).toBe(0)
  })

  it('counts items for single vendor', () => {
    const items = [
      {
        id: '1',
        name: 'Milk',
        vendorIds: ['v1'],
        tagIds: [],
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        targetUnit: 'package' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        name: 'Eggs',
        vendorIds: ['v1'],
        tagIds: [],
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        targetUnit: 'package' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]
    vi.mocked(hooks.useItems).mockReturnValue({ data: items } as any)
    const { result } = renderHook(() => useVendorItemCounts())
    expect(result.current.get('v1')).toBe(2)
  })

  it('counts items for multiple vendors', () => {
    const items = [
      {
        id: '1',
        name: 'Milk',
        vendorIds: ['v1'],
        tagIds: [],
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        targetUnit: 'package' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        name: 'Eggs',
        vendorIds: ['v2'],
        tagIds: [],
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        targetUnit: 'package' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]
    vi.mocked(hooks.useItems).mockReturnValue({ data: items } as any)
    const { result } = renderHook(() => useVendorItemCounts())
    expect(result.current.get('v1')).toBe(1)
    expect(result.current.get('v2')).toBe(1)
  })

  it('handles items with multiple vendors', () => {
    const items = [
      {
        id: '1',
        name: 'Milk',
        vendorIds: ['v1', 'v2'],
        tagIds: [],
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        targetUnit: 'package' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]
    vi.mocked(hooks.useItems).mockReturnValue({ data: items } as any)
    const { result } = renderHook(() => useVendorItemCounts())
    expect(result.current.get('v1')).toBe(1)
    expect(result.current.get('v2')).toBe(1)
  })

  it('handles items without vendorIds', () => {
    const items = [
      {
        id: '1',
        name: 'Milk',
        tagIds: [],
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        targetUnit: 'package' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]
    vi.mocked(hooks.useItems).mockReturnValue({ data: items } as any)
    const { result } = renderHook(() => useVendorItemCounts())
    expect(result.current.size).toBe(0)
  })
})
