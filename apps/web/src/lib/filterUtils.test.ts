import { describe, expect, it } from 'vitest'
import type { Item, Recipe } from '@/types'
import {
  calculateTagCount,
  filterItems,
  filterItemsByRecipes,
  filterItemsByVendors,
} from './filterUtils'

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

describe('filterItemsByVendors', () => {
  const items: Item[] = [
    {
      id: '1',
      name: 'Milk',
      tagIds: [],
      vendorIds: ['v-costco', 'v-safeway'],
      targetQuantity: 2,
      refillThreshold: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    },
    {
      id: '2',
      name: 'Eggs',
      tagIds: [],
      vendorIds: ['v-costco'],
      targetQuantity: 12,
      refillThreshold: 6,
      createdAt: new Date(),
      updatedAt: new Date(),
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    },
    {
      id: '3',
      name: 'Bread',
      tagIds: [],
      vendorIds: [],
      targetQuantity: 1,
      refillThreshold: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    },
    {
      id: '4',
      name: 'Butter',
      tagIds: [],
      targetQuantity: 1,
      refillThreshold: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    },
  ]

  it('returns all items when vendorIds is empty', () => {
    expect(filterItemsByVendors(items, [])).toHaveLength(4)
  })

  it('filters by single vendor', () => {
    const result = filterItemsByVendors(items, ['v-safeway'])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Milk')
  })

  it('filters by multiple vendors with OR logic', () => {
    const result = filterItemsByVendors(items, ['v-costco', 'v-safeway'])
    expect(result.map((i) => i.name).sort()).toEqual(['Eggs', 'Milk'])
  })

  it('excludes items with no vendorIds when vendor filter is active', () => {
    const result = filterItemsByVendors(items, ['v-costco'])
    expect(result.every((i) => i.name !== 'Bread' && i.name !== 'Butter')).toBe(
      true,
    )
  })
})

describe('filterItemsByRecipes', () => {
  const items: Item[] = [
    {
      id: '1',
      name: 'Eggs',
      tagIds: [],
      targetQuantity: 12,
      refillThreshold: 6,
      createdAt: new Date(),
      updatedAt: new Date(),
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    },
    {
      id: '2',
      name: 'Flour',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    },
    {
      id: '3',
      name: 'Sugar',
      tagIds: [],
      targetQuantity: 1,
      refillThreshold: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    },
  ]

  const recipes: Recipe[] = [
    {
      id: 'r1',
      name: 'Pancakes',
      items: [
        { itemId: '1', defaultAmount: 3 },
        { itemId: '2', defaultAmount: 1 },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'r2',
      name: 'Cake',
      items: [
        { itemId: '2', defaultAmount: 2 },
        { itemId: '3', defaultAmount: 0.5 },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  it('returns all items when recipeIds is empty', () => {
    expect(filterItemsByRecipes(items, [], recipes)).toHaveLength(3)
  })

  it('filters by single recipe', () => {
    const result = filterItemsByRecipes(items, ['r1'], recipes)
    expect(result.map((i) => i.name).sort()).toEqual(['Eggs', 'Flour'])
  })

  it('filters by multiple recipes with OR logic', () => {
    const result = filterItemsByRecipes(items, ['r1', 'r2'], recipes)
    expect(result.map((i) => i.name).sort()).toEqual(['Eggs', 'Flour', 'Sugar'])
  })

  it('excludes items not in any selected recipe', () => {
    const result = filterItemsByRecipes(items, ['r2'], recipes)
    expect(result.every((i) => i.name !== 'Eggs')).toBe(true)
  })
})
