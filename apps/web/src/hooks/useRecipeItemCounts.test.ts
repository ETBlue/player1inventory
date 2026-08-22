import type { UseQueryResult } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Item, Recipe } from '@/types'
import * as hooks from './index'
import { useRecipeItemCounts } from './useRecipeItemCounts'
import * as recipeHooks from './useRecipes'

vi.mock('./index', () => ({
  useItems: vi.fn(),
}))

vi.mock('./useRecipes', () => ({
  useRecipes: vi.fn(),
}))

function makeItem(id: string, name: string): Item {
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
    targetUnit: 'package' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Item
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

function mockData(items: Item[], recipes: Recipe[]) {
  vi.mocked(hooks.useItems).mockReturnValue({
    data: items,
  } as Partial<UseQueryResult<Item[]>> as UseQueryResult<Item[]>)
  vi.mocked(recipeHooks.useRecipes).mockReturnValue({
    data: recipes,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof recipeHooks.useRecipes>)
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
