import type { UseQueryResult } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PantryItem } from '@/types'
import * as hooks from './index'
import * as dataModeHooks from './useDataMode'
import { useVendorCartCounts } from './useVendorCartCounts'

vi.mock('./index', () => ({
  useItems: vi.fn(),
}))

vi.mock('./useDataMode', () => ({
  useDataMode: vi.fn(),
}))

function mockItems(items: Partial<PantryItem>[]) {
  vi.mocked(hooks.useItems).mockReturnValue({
    data: items,
  } as Partial<UseQueryResult<PantryItem[]>> as UseQueryResult<PantryItem[]>)
}

function mockMode(mode: 'local' | 'cloud') {
  vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
    mode,
    setMode: vi.fn(),
  })
}

const baseStock = {
  targetUnit: 'package' as const,
  refillThreshold: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
  consumeAmount: 1,
}

describe('useVendorCartCounts (local mode)', () => {
  it('returns empty Map when no items', () => {
    mockMode('local')
    mockItems([])

    const { result } = renderHook(() => useVendorCartCounts())

    expect(result.current.size).toBe(0)
  })

  it('counts only items stocked in the active location, not every item carrying the vendor id (the trap)', () => {
    mockMode('local')
    // Two items carry vendor v1: one stocked in the active location, one NOT
    // stocked here at all (ZERO_STOCK join — no stockId). Only the stocked one
    // should count toward "in vendor".
    mockItems([
      {
        id: '1',
        vendorIds: ['v1'],
        stockId: 'stock-1',
        targetQuantity: 4,
        ...baseStock,
      },
      {
        id: '2',
        vendorIds: ['v1'],
        stockId: undefined,
        targetQuantity: 0,
        ...baseStock,
      },
    ])

    const { result } = renderHook(() => useVendorCartCounts())

    expect(result.current.get('v1')?.count).toBe(1)
    expect(result.current.get('v1')?.inactiveCount).toBe(0)
  })

  it('counts an item stocked here with targetQuantity 0 as inactive', () => {
    mockMode('local')
    mockItems([
      {
        id: '1',
        vendorIds: ['v1'],
        stockId: 'stock-1',
        targetQuantity: 0,
        ...baseStock,
      },
    ])

    const { result } = renderHook(() => useVendorCartCounts())

    expect(result.current.get('v1')?.count).toBe(1)
    expect(result.current.get('v1')?.inactiveCount).toBe(1)
  })

  it('handles items without vendorIds', () => {
    mockMode('local')
    mockItems([
      {
        id: '1',
        stockId: 'stock-1',
        targetQuantity: 2,
        ...baseStock,
      },
    ])

    const { result } = renderHook(() => useVendorCartCounts())

    expect(result.current.size).toBe(0)
  })

  it('handles items with multiple vendors', () => {
    mockMode('local')
    mockItems([
      {
        id: '1',
        vendorIds: ['v1', 'v2'],
        stockId: 'stock-1',
        targetQuantity: 2,
        ...baseStock,
      },
    ])

    const { result } = renderHook(() => useVendorCartCounts())

    expect(result.current.get('v1')?.count).toBe(1)
    expect(result.current.get('v2')?.count).toBe(1)
  })
})

describe('useVendorCartCounts (cloud mode)', () => {
  it('keeps the global count and reports zero inactive, even for a targetQuantity: 0 item', () => {
    mockMode('cloud')
    // Cloud items never carry a stockId. A naive stockId guard would zero this
    // out; cloud must keep the pre-existing global count.
    mockItems([
      {
        id: '1',
        vendorIds: ['v1'],
        stockId: undefined,
        targetQuantity: 0,
        ...baseStock,
      },
      {
        id: '2',
        vendorIds: ['v1'],
        stockId: undefined,
        targetQuantity: 3,
        ...baseStock,
      },
    ])

    const { result } = renderHook(() => useVendorCartCounts())

    expect(result.current.get('v1')?.count).toBe(2)
    expect(result.current.get('v1')?.inactiveCount).toBe(0)
  })
})
