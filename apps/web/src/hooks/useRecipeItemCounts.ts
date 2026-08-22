import { useMemo } from 'react'
import { useItems } from './index'
import { useRecipes } from './useRecipes'

/**
 * Global item count per recipe, keyed by recipe id — every recipe gets an
 * entry, including recipes with zero items.
 *
 * Map-shaped and memoized (like `useVendorItemCounts`) because a badge list
 * needs one count per id and hooks cannot be called in a loop; the per-id
 * `useItemCountByRecipe` is one async query each.
 *
 * Recipes have no hierarchy, so membership is plain — mirroring the recipe
 * branch of `lib/shelfUtils.ts`: an item matches when the recipe lists it.
 * Counting from the item side (rather than `recipe.items.length`) also drops
 * entries pointing at items that no longer exist.
 *
 * Location-unaware by design: these are global item↔recipe relations.
 */
export function useRecipeItemCounts(): Map<string, number> {
  const { data: items = [] } = useItems()
  const { data: recipes = [] } = useRecipes()

  return useMemo(() => {
    const counts = new Map<string, number>()

    for (const recipe of recipes) {
      const memberIds = new Set(recipe.items.map((ri) => ri.itemId))
      counts.set(
        recipe.id,
        items.filter((item) => memberIds.has(item.id)).length,
      )
    }

    return counts
  }, [items, recipes])
}
