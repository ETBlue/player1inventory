import { describe, expect, it } from 'vitest'
import { cookingRecipe, nonConsumableItemIds } from './recipeConsumables'

describe('nonConsumableItemIds', () => {
  it('lists only items whose consumable value is false', () => {
    // A missing or null value means consumable (`isConsumable`)
    const ids = nonConsumableItemIds([
      { id: 'cup', consumable: false },
      { id: 'tea', consumable: true },
      { id: 'old', consumable: undefined },
      { id: 'imported', consumable: null },
    ])
    expect([...ids]).toEqual(['cup'])
  })
})

describe('cookingRecipe', () => {
  const recipe = {
    id: 'r1',
    name: 'Tea',
    items: [
      { itemId: 'tea', defaultAmount: 1 },
      { itemId: 'cup', defaultAmount: 1 },
      { itemId: 'deleted', defaultAmount: 1 },
    ],
  }

  it('leaves out the non-consumable items and keeps the others', () => {
    const result = cookingRecipe(recipe, new Set(['cup']))
    expect(result.items.map((ri) => ri.itemId)).toEqual(['tea', 'deleted'])
    // The stored recipe is not changed
    expect(recipe.items).toHaveLength(3)
    expect(result.name).toBe('Tea')
  })

  it('returns the same object when nothing is left out', () => {
    expect(cookingRecipe(recipe, new Set(['other']))).toBe(recipe)
  })
})
