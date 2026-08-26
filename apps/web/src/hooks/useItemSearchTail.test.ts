import type { UseQueryResult } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PantryItem } from '@/types'
import * as dataModeHooks from './useDataMode'
import { useItemSearchTail } from './useItemSearchTail'
import * as itemsHooks from './useItems'

vi.mock('./useItems', () => ({
  useItems: vi.fn(),
}))

vi.mock('./useDataMode', () => ({
  useDataMode: vi.fn(),
}))

function mockItems(items: Partial<PantryItem>[]) {
  vi.mocked(itemsHooks.useItems).mockReturnValue({
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
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
  consumeAmount: 1,
}

// THE FIXTURE IS THE TEST. `stockId: undefined` is the ONLY thing that
// distinguishes "exists globally, stocked at another location" from "stocked
// here". A fixture where every item carries a stockId passes against an
// implementation that ignores location entirely.
const milkHere = {
  id: 'milk',
  name: 'Milk',
  stockId: 'stock-milk',
  ...baseStock,
}
const milkPowderElsewhere = {
  id: 'milk-powder',
  name: 'Milk Powder',
  stockId: undefined,
  ...baseStock,
}
const breadHere = {
  id: 'bread',
  name: 'Bread',
  stockId: 'stock-bread',
  ...baseStock,
}

describe('useItemSearchTail (local mode)', () => {
  it('returns empty buckets when the query is blank', () => {
    // Given a catalog and no search
    mockMode('local')
    mockItems([milkHere, milkPowderElsewhere])

    // When the hook runs with an empty query
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(), query: '   ' }),
    )

    // Then nothing is offered — the tail exists only while searching
    expect(result.current.inLocation).toEqual([])
    expect(result.current.notStockedHere).toEqual([])
    expect(result.current.hasExactGlobalMatch).toBe(false)
  })

  it('user does not see items the page already renders', () => {
    // Given Milk is in the page's own list
    mockMode('local')
    mockItems([milkHere])

    // When the user searches for it
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(['milk']), query: 'milk' }),
    )

    // Then it appears in neither tail bucket — it is already above them
    expect(result.current.inLocation).toEqual([])
    expect(result.current.notStockedHere).toEqual([])
  })

  it('user sees an item stocked here but not in this list under in-location', () => {
    // Given Bread is stocked here but is not part of this page's list
    mockMode('local')
    mockItems([milkHere, breadHere])

    // When the user searches a term matching Bread
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(['milk']), query: 'bread' }),
    )

    // Then it lands in the in-location bucket, not the not-stocked-here one
    expect(result.current.inLocation.map((i) => i.id)).toEqual(['bread'])
    expect(result.current.notStockedHere).toEqual([])
  })

  it('user sees an item stocked only at ANOTHER location under not-stocked-here (the trap)', () => {
    // Given two items match the query: one stocked here, one stocked only
    // elsewhere (no stockId from the active-location join)
    mockMode('local')
    mockItems([milkHere, milkPowderElsewhere])

    // When the user searches a term matching both, with neither in the list
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(), query: 'milk' }),
    )

    // Then location decides which bucket each falls into
    expect(result.current.inLocation.map((i) => i.id)).toEqual(['milk'])
    expect(result.current.notStockedHere.map((i) => i.id)).toEqual([
      'milk-powder',
    ])
  })

  it('reports an exact global match even when that item is in the page list (the #245 guard)', () => {
    // Given an item named exactly like the query, already in the page's list
    mockMode('local')
    mockItems([milkHere])

    // When the user searches its exact name
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(['milk']), query: '  MILK ' }),
    )

    // Then create must be suppressed — the global catalog already has it
    expect(result.current.hasExactGlobalMatch).toBe(true)
  })

  it('reports an exact global match for an item stocked only at another location', () => {
    // Given the only "Milk Powder" lives at another location
    mockMode('local')
    mockItems([milkPowderElsewhere])

    // When the user types its exact name
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(), query: 'milk powder' }),
    )

    // Then create is suppressed — creating would mint a duplicate global Item
    expect(result.current.hasExactGlobalMatch).toBe(true)
  })

  it('reports no exact match for a partial match, so create stays available', () => {
    // Given only a partial name match exists
    mockMode('local')
    mockItems([milkHere])

    // When the user types a longer new name
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(), query: 'milk chocolate' }),
    )

    // Then create is offered
    expect(result.current.hasExactGlobalMatch).toBe(false)
  })

  it('sorts each bucket by name, case-insensitively', () => {
    // Given three unstocked matches in scrambled order
    mockMode('local')
    mockItems([
      { id: 'c', name: 'coconut milk', stockId: undefined, ...baseStock },
      { id: 'a', name: 'Almond Milk', stockId: undefined, ...baseStock },
      { id: 'b', name: 'buttermilk', stockId: undefined, ...baseStock },
    ])

    // When the user searches
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(), query: 'milk' }),
    )

    // Then they come back alphabetically regardless of stored casing
    expect(result.current.notStockedHere.map((i) => i.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})

describe('useItemSearchTail (cloud mode)', () => {
  it('puts every out-of-list match in the in-location bucket and leaves not-stocked-here empty', () => {
    // Given cloud mode, where no item carries a stockId at all
    mockMode('cloud')
    mockItems([
      { id: 'milk', name: 'Milk', stockId: undefined, ...baseStock },
      {
        id: 'milk-powder',
        name: 'Milk Powder',
        stockId: undefined,
        ...baseStock,
      },
    ])

    // When the user searches
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(['milk']), query: 'milk' }),
    )

    // Then the third section stays off — there is nothing to be "not stocked
    // here" from, and a naive stockId split would empty the tail entirely
    expect(result.current.inLocation.map((i) => i.id)).toEqual(['milk-powder'])
    expect(result.current.notStockedHere).toEqual([])
  })
})
