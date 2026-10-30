import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PantryItem, Recipe } from '@/types'
import * as hooks from './index'
import { useRecipeItemCounts } from './useRecipeItemCounts'
import * as recipeHooks from './useRecipes'

vi.mock('./index', () => ({
  useItems: vi.fn(),
}))

vi.mock('./useRecipes', () => ({
  useRecipes: vi.fn(),
}))

// `useRecipeItemCounts` only needs each row's `id` — it counts recipe entries
// whose `itemId` is in the item list (`useRecipeItemCounts.ts`). `useItems()`
// hands back joined `PantryItem` rows, so the stock fields below are required
// by the type rather than by the hook.
function makeItem(id: string, name: string): PantryItem {
  return {
    id,
    name,
    tagIds: [],
    vendorIds: [],
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    targetUnit: 'package',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function makeRecipe(id: string, name: string, itemIds: string[]): Recipe {
  return {
    id,
    name,
    items: itemIds.map((itemId) => ({ itemId, defaultAmount: 1 })),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// Both mocked hooks are built field by field, not cast — `useItems()`'s local
// branch (`useItems.ts:431`) and `useRecipes()`'s local branch
// (`useRecipes.ts:64`).
function mockData(items: PantryItem[], recipes: Recipe[]) {
  vi.mocked(hooks.useItems).mockReturnValue({
    data: items,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  })
  vi.mocked(recipeHooks.useRecipes).mockReturnValue({
    data: recipes,
    isLoading: false,
    isError: false,
  })
}

describe('useRecipeItemCounts', () => {
  it('returns empty Map when there are no recipes', () => {
    // Given no recipes
    mockData([makeItem('1', 'Milk')], [])

    // When the hook runs
    const { result } = renderHook(() => useRecipeItemCounts())

    // Then the map is empty
    expect(result.current.size).toBe(0)
  })

  it('counts the items belonging to each recipe', () => {
    // Given two recipes sharing one item
    const items = [
      makeItem('1', 'Milk'),
      makeItem('2', 'Eggs'),
      makeItem('3', 'Flour'),
    ]
    const recipes = [
      makeRecipe('r1', 'Pancakes', ['1', '2', '3']),
      makeRecipe('r2', 'Omelette', ['2']),
    ]
    mockData(items, recipes)

    // When the hook runs
    const { result } = renderHook(() => useRecipeItemCounts())

    // Then each recipe reports its own membership count
    expect(result.current.get('r1')).toBe(3)
    expect(result.current.get('r2')).toBe(1)
  })

  it('reports 0 for a recipe with no items', () => {
    // Given an empty recipe
    mockData([makeItem('1', 'Milk')], [makeRecipe('r1', 'Water', [])])

    // When the hook runs
    const { result } = renderHook(() => useRecipeItemCounts())

    // Then it reports zero
    expect(result.current.get('r1')).toBe(0)
  })

  it('ignores recipe entries whose item no longer exists', () => {
    // Given a recipe referencing a deleted item
    mockData(
      [makeItem('1', 'Milk')],
      [makeRecipe('r1', 'Pancakes', ['1', 'deleted-item'])],
    )

    // When the hook runs
    const { result } = renderHook(() => useRecipeItemCounts())

    // Then only the surviving item counts
    expect(result.current.get('r1')).toBe(1)
  })
})
