import { describe, expect, it } from 'vitest'
import type { Item } from '@/types'
import { calculateTagCount, filterItems } from './filterUtils'

describe('filterItems', () => {
  const items: Item[] = [
    {
      id: '1',
      name: 'Tomatoes',
      tagIds: ['tag-veg', 'tag-fridge'],
      targetQuantity: 5,
      refillThreshold: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      name: 'Apples',
      tagIds: ['tag-fruit', 'tag-fridge'],
      targetQuantity: 10,
      refillThreshold: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '3',
      name: 'Pasta',
      tagIds: ['tag-grain', 'tag-pantry'],
      targetQuantity: 3,
      refillThreshold: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '4',
      name: 'Bread',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  it('returns all items when no filters active', () => {
    const result = filterItems(items, {})
    expect(result).toHaveLength(4)
  })

  it('filters by single tag from one type', () => {
    const result = filterItems(items, {
      'type-category': ['tag-veg'],
    })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Tomatoes')
  })

  it('filters with OR logic within same tag type', () => {
    const result = filterItems(items, {
      'type-category': ['tag-veg', 'tag-fruit'],
    })
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.name).sort()).toEqual(['Apples', 'Tomatoes'])
  })

  it('filters with AND logic across different tag types', () => {
    const result = filterItems(items, {
      'type-category': ['tag-veg', 'tag-fruit'],
      'type-location': ['tag-fridge'],
    })
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.name).sort()).toEqual(['Apples', 'Tomatoes'])
  })

  it('filters out items with no tags when filters active', () => {
    const result = filterItems(items, {
      'type-location': ['tag-fridge'],
    })
    expect(result).toHaveLength(2)
    expect(result.every((i) => i.name !== 'Bread')).toBe(true)
  })

  it('returns empty array when no items match', () => {
    const result = filterItems(items, {
      'type-category': ['tag-nonexistent'],
    })
    expect(result).toHaveLength(0)
  })

  it('handles empty tag arrays in filter state', () => {
    const result = filterItems(items, {
      'type-category': [],
      'type-location': ['tag-fridge'],
    })
    expect(result).toHaveLength(2)
  })
})

describe('calculateTagCount', () => {
  const items: Item[] = [
    {
      id: '1',
      name: 'Tomatoes',
      tagIds: ['tag-veg', 'tag-fridge'],
      targetQuantity: 5,
      refillThreshold: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      name: 'Apples',
      tagIds: ['tag-fruit', 'tag-fridge'],
      targetQuantity: 10,
      refillThreshold: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '3',
      name: 'Pasta',
      tagIds: ['tag-grain', 'tag-pantry'],
      targetQuantity: 3,
      refillThreshold: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  it('calculates count with no other filters', () => {
    const count = calculateTagCount('tag-fridge', 'type-location', items, {})
    expect(count).toBe(2)
  })

  it('calculates count considering other active filters', () => {
    const count = calculateTagCount('tag-veg', 'type-category', items, {
      'type-location': ['tag-fridge'],
    })
    expect(count).toBe(1) // Only tomatoes (veg + fridge)
  })

  it('returns 0 when no items would match', () => {
    const count = calculateTagCount('tag-grain', 'type-category', items, {
      'type-location': ['tag-fridge'],
    })
    expect(count).toBe(0) // No grain in fridge
  })

  it('handles tag already selected in same type', () => {
    const count = calculateTagCount('tag-veg', 'type-category', items, {
      'type-category': ['tag-fruit'],
      'type-location': ['tag-fridge'],
    })
    expect(count).toBe(2) // Both veg and fruit in fridge (OR within type)
  })
})
