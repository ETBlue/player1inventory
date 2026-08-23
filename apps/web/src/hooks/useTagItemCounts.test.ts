import type { UseQueryResult } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Item, Tag } from '@/types'
import * as hooks from './index'
import { useTagItemCounts } from './useTagItemCounts'

vi.mock('./index', () => ({
  useItems: vi.fn(),
  useTags: vi.fn(),
}))

function makeItem(id: string, name: string, tagIds: string[]): Item {
  return {
    id,
    name,
    tagIds,
    vendorIds: [],
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    targetUnit: 'package' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Item
}

function makeTag(id: string, name: string, parentId?: string): Tag {
  return { id, name, typeId: 'type1', parentId } as Tag
}

function mockData(items: Item[], tags: Tag[]) {
  vi.mocked(hooks.useItems).mockReturnValue({
    data: items,
  } as Partial<UseQueryResult<Item[]>> as UseQueryResult<Item[]>)
  vi.mocked(hooks.useTags).mockReturnValue({
    data: tags,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof hooks.useTags>)
}

describe('useTagItemCounts', () => {
  it('returns empty Map when there are no tags', () => {
    // Given no tags and no items
    mockData([], [])

    // When the hook runs
    const { result } = renderHook(() => useTagItemCounts())

    // Then the map is empty
    expect(result.current.size).toBe(0)
  })

  it('counts items carrying a tag directly', () => {
    // Given two items carrying 'dairy' and one carrying nothing
    const tags = [makeTag('dairy', 'Dairy')]
    const items = [
      makeItem('1', 'Milk', ['dairy']),
      makeItem('2', 'Cheese', ['dairy']),
      makeItem('3', 'Bread', []),
    ]
    mockData(items, tags)

    // When the hook runs
    const { result } = renderHook(() => useTagItemCounts())

    // Then the tag counts both items
    expect(result.current.get('dairy')).toBe(2)
  })

  it('reports 0 for a tag no item carries', () => {
    // Given a tag with no items assigned
    const tags = [makeTag('frozen', 'Frozen')]
    mockData([makeItem('1', 'Milk', [])], tags)

    // When the hook runs
    const { result } = renderHook(() => useTagItemCounts())

    // Then the tag reports zero
    expect(result.current.get('frozen')).toBe(0)
  })

  it("counts a parent tag's items even when they only carry a child tag", () => {
    // Given a parent tag whose ONLY matching items carry the CHILD tag
    const tags = [makeTag('food', 'Food'), makeTag('dairy', 'Dairy', 'food')]
    const items = [
      makeItem('1', 'Milk', ['dairy']),
      makeItem('2', 'Cheese', ['dairy']),
      makeItem('3', 'Bread', []),
    ]
    mockData(items, tags)

    // When the hook runs
    const { result } = renderHook(() => useTagItemCounts())

    // Then the parent count includes the child's items — no item carries
    // 'food' directly, so a direct-only count would report 0 here
    expect(result.current.get('food')).toBe(2)
    expect(result.current.get('dairy')).toBe(2)
  })

  it('expands grandchildren too, not just one level', () => {
    // Given a three-level hierarchy where only the grandchild is assigned
    const tags = [
      makeTag('food', 'Food'),
      makeTag('dairy', 'Dairy', 'food'),
      makeTag('cheese', 'Cheese', 'dairy'),
    ]
    const items = [makeItem('1', 'Brie', ['cheese'])]
    mockData(items, tags)

    // When the hook runs
    const { result } = renderHook(() => useTagItemCounts())

    // Then the grandparent count includes the grandchild's item
    expect(result.current.get('food')).toBe(1)
    expect(result.current.get('dairy')).toBe(1)
    expect(result.current.get('cheese')).toBe(1)
  })

  it('counts an item once when it carries both a parent and its child', () => {
    // Given one item carrying both the parent and the child tag
    const tags = [makeTag('food', 'Food'), makeTag('dairy', 'Dairy', 'food')]
    mockData([makeItem('1', 'Milk', ['food', 'dairy'])], tags)

    // When the hook runs
    const { result } = renderHook(() => useTagItemCounts())

    // Then the parent counts the item once, not twice
    expect(result.current.get('food')).toBe(1)
  })

  it('counts globally — items are never filtered by location stock', () => {
    // Given an item with no stockId (stocked in no location at all)
    const tags = [makeTag('dairy', 'Dairy')]
    const orphan = makeItem('1', 'Milk', ['dairy'])
    mockData([orphan], tags)

    // When the hook runs
    const { result } = renderHook(() => useTagItemCounts())

    // Then it still counts
    expect(result.current.get('dairy')).toBe(1)
  })
})
