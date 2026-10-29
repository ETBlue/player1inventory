import { describe, expect, it } from 'vitest'
import type { PantryItem, Recipe, Tag } from '@/types'
import {
  calculateTagCount,
  filterItems,
  filterItemsByRecipes,
  filterItemsByVendors,
} from './filterUtils'

// The three functions here are generic over `T extends Item` and the app calls
// all of them with `PantryItem[]`, so that is what these fixtures are. They
// used to be typed `Item[]` while carrying `targetQuantity` and
// `refillThreshold`, which predates the v15/v16 split — those two live on
// `ItemStock` now and a joined `PantryItem` is the shape that has both halves.
//
// NONE of the four defaults below is read by anything in `filterUtils.ts`:
// `filterItems` and `calculateTagCount` read `tagIds` only,
// `filterItemsByVendors` reads `vendorIds`, and `filterItemsByRecipes` reads
// the recipes argument. `targetQuantity` and `refillThreshold` stay REQUIRED so
// each fixture keeps the value it was written with.
const makePantryItem = (
  overrides: Pick<
    PantryItem,
    'id' | 'name' | 'tagIds' | 'targetQuantity' | 'refillThreshold'
  > &
    Partial<PantryItem>,
): PantryItem => ({
  targetUnit: 'package',
  consumeAmount: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('filterItems', () => {
  const items: PantryItem[] = [
    makePantryItem({
      id: '1',
      name: 'Tomatoes',
      tagIds: ['tag-veg', 'tag-fridge'],
      targetQuantity: 5,
      refillThreshold: 2,
    }),
    makePantryItem({
      id: '2',
      name: 'Apples',
      tagIds: ['tag-fruit', 'tag-fridge'],
      targetQuantity: 10,
      refillThreshold: 3,
    }),
    makePantryItem({
      id: '3',
      name: 'Pasta',
      tagIds: ['tag-grain', 'tag-pantry'],
      targetQuantity: 3,
      refillThreshold: 1,
    }),
    makePantryItem({
      id: '4',
      name: 'Bread',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    }),
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
    expect(result[0]?.name).toBe('Tomatoes')
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

describe('filterItems with descendant expansion', () => {
  // Tag hierarchy:
  //   Food (tag-food)
  //     Produce (tag-produce)
  //       Vegetables (tag-veg)
  //       Fruits (tag-fruit)
  //     Dairy (tag-dairy)
  //   Other (tag-other)
  const allTags: Tag[] = [
    { id: 'tag-food', typeId: 'type-1', name: 'Food' },
    {
      id: 'tag-produce',
      typeId: 'type-1',
      name: 'Produce',
      parentId: 'tag-food',
    },
    {
      id: 'tag-veg',
      typeId: 'type-1',
      name: 'Vegetables',
      parentId: 'tag-produce',
    },
    {
      id: 'tag-fruit',
      typeId: 'type-1',
      name: 'Fruits',
      parentId: 'tag-produce',
    },
    { id: 'tag-dairy', typeId: 'type-1', name: 'Dairy', parentId: 'tag-food' },
    { id: 'tag-other', typeId: 'type-1', name: 'Other' },
  ]

  const items: PantryItem[] = [
    makePantryItem({
      id: '1',
      name: 'Tomatoes',
      tagIds: ['tag-veg'],
      targetQuantity: 5,
      refillThreshold: 2,
    }),
    makePantryItem({
      id: '2',
      name: 'Apples',
      tagIds: ['tag-fruit'],
      targetQuantity: 10,
      refillThreshold: 3,
    }),
    makePantryItem({
      id: '3',
      name: 'Milk',
      tagIds: ['tag-dairy'],
      targetQuantity: 2,
      refillThreshold: 1,
    }),
    makePantryItem({
      id: '4',
      name: 'Widget',
      tagIds: ['tag-other'],
      targetQuantity: 1,
      refillThreshold: 0,
    }),
  ]

  it('filterItems returns items tagged with a parent tag when parent is directly on item', () => {
    // Given an item directly tagged with the parent tag
    const itemWithParentTag = makePantryItem({
      id: '5',
      name: 'Mystery Food',
      tagIds: ['tag-food'],
      targetQuantity: 1,
      refillThreshold: 0,
    })
    const result = filterItems(
      [...items, itemWithParentTag],
      { 'type-1': ['tag-food'] },
      allTags,
    )
    // Should match item with tag-food directly, plus all descendants
    expect(result.map((i) => i.name).sort()).toEqual([
      'Apples',
      'Milk',
      'Mystery Food',
      'Tomatoes',
    ])
    expect(result.every((i) => i.name !== 'Widget')).toBe(true)
  })

  it('filterItems returns items tagged with a child tag when parent is selected', () => {
    // Given: select the top-level "Food" tag
    const result = filterItems(items, { 'type-1': ['tag-food'] }, allTags)
    // Then: items tagged with Food's descendants (Vegetables, Fruits, Dairy) should match
    expect(result.map((i) => i.name).sort()).toEqual([
      'Apples',
      'Milk',
      'Tomatoes',
    ])
    expect(result.every((i) => i.name !== 'Widget')).toBe(true)
  })

  it('filterItems returns items tagged with a grandchild when grandparent is selected', () => {
    // Select "Produce" (child of Food, parent of Vegetables and Fruits)
    const result = filterItems(items, { 'type-1': ['tag-produce'] }, allTags)
    expect(result.map((i) => i.name).sort()).toEqual(['Apples', 'Tomatoes'])
    expect(result.every((i) => i.name !== 'Milk' && i.name !== 'Widget')).toBe(
      true,
    )
  })

  it('filterItems returns items matching any of multiple selected tags (OR logic with descendants)', () => {
    // Select "Produce" and "Dairy" — both are children of Food
    const result = filterItems(
      items,
      { 'type-1': ['tag-produce', 'tag-dairy'] },
      allTags,
    )
    expect(result.map((i) => i.name).sort()).toEqual([
      'Apples',
      'Milk',
      'Tomatoes',
    ])
  })

  it('filterItems without allTags does NOT expand descendants (backward compat)', () => {
    // Without allTags, selecting parent tag only matches items directly tagged with it
    const result = filterItems(items, { 'type-1': ['tag-food'] })
    // None of the test items have tag-food directly — all have leaf tags
    expect(result).toHaveLength(0)
  })
})

describe('calculateTagCount', () => {
  const items: PantryItem[] = [
    makePantryItem({
      id: '1',
      name: 'Tomatoes',
      tagIds: ['tag-veg', 'tag-fridge'],
      targetQuantity: 5,
      refillThreshold: 2,
    }),
    makePantryItem({
      id: '2',
      name: 'Apples',
      tagIds: ['tag-fruit', 'tag-fridge'],
      targetQuantity: 10,
      refillThreshold: 3,
    }),
    makePantryItem({
      id: '3',
      name: 'Pasta',
      tagIds: ['tag-grain', 'tag-pantry'],
      targetQuantity: 3,
      refillThreshold: 1,
    }),
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

  it('returns independent count for tag when another tag in same type is already selected', () => {
    // The count reflects how many items match THIS tag (given cross-type filters),
    // independent of what else is selected within the same tag type.
    const count = calculateTagCount('tag-veg', 'type-category', items, {
      'type-category': ['tag-fruit'],
      'type-location': ['tag-fridge'],
    })
    expect(count).toBe(1) // Only Tomatoes (veg + fridge); tag-fruit selection is replaced, not appended
  })
})

describe('calculateTagCount with nested tags', () => {
  // Tag hierarchy:
  //   Food (tag-food) — type-1
  //     Vegetables (tag-veg) — type-1
  //     Fruits (tag-fruit) — type-1
  const allTags: Tag[] = [
    { id: 'tag-food', typeId: 'type-1', name: 'Food' },
    {
      id: 'tag-veg',
      typeId: 'type-1',
      name: 'Vegetables',
      parentId: 'tag-food',
    },
    {
      id: 'tag-fruit',
      typeId: 'type-1',
      name: 'Fruits',
      parentId: 'tag-food',
    },
  ]

  // 5 items tagged Vegetables, 4 tagged Fruits (all items carry only their leaf tag)
  const items: PantryItem[] = [
    ...Array.from({ length: 5 }, (_, i) =>
      makePantryItem({
        id: `veg-${i}`,
        name: `Vegetable ${i}`,
        tagIds: ['tag-veg'],
        targetQuantity: 1,
        refillThreshold: 0,
      }),
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      makePantryItem({
        id: `fruit-${i}`,
        name: `Fruit ${i}`,
        tagIds: ['tag-fruit'],
        targetQuantity: 1,
        refillThreshold: 0,
      }),
    ),
  ]

  it('returns correct count for subtag when parent tag is selected', () => {
    // Given Food is already selected in currentFilters
    const currentFilters = { 'type-1': ['tag-food'] }

    // When calculating count for Vegetables
    const count = calculateTagCount(
      'tag-veg',
      'type-1',
      items,
      currentFilters,
      allTags,
    )

    // Then count should be 5, not 9 (the parent tag's expanded count)
    expect(count).toBe(5)
  })

  it('returns correct count for sibling subtag when parent tag is selected', () => {
    // Given Food is already selected in currentFilters
    const currentFilters = { 'type-1': ['tag-food'] }

    // When calculating count for Fruits
    const count = calculateTagCount(
      'tag-fruit',
      'type-1',
      items,
      currentFilters,
      allTags,
    )

    // Then count should be 4, not 9
    expect(count).toBe(4)
  })
})

describe('filterItemsByVendors', () => {
  const items: PantryItem[] = [
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
    expect(result[0]?.name).toBe('Milk')
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
  const items: PantryItem[] = [
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
