import { isConsumable, type RecipeItem } from '@/types'

// Cooking is only for consumable items (owner decision 2026-11-26). A recipe
// may still link a non-consumable item: links made before this rule, or an
// item switched to non-consumable later. The link is kept, and cooking
// ignores it.

/** The ids of the items that are not consumable (`isConsumable` is false). */
export function nonConsumableItemIds(
  items: readonly { id: string; consumable?: boolean | null | undefined }[],
): Set<string> {
  return new Set(items.filter((i) => !isConsumable(i)).map((i) => i.id))
}

/**
 * The recipe as cooking sees it: the same recipe with its non-consumable
 * items left out. The cooking page reads every recipe through this, so its
 * list, its counts and its consume write all come from one filtered list
 * and cannot disagree.
 *
 * A link to an item that is not in `nonConsumableIds` stays, a deleted item
 * included: the page already skips a missing item when it renders.
 */
export function cookingRecipe<R extends { items: RecipeItem[] }>(
  recipe: R,
  nonConsumableIds: ReadonlySet<string>,
): R {
  if (!recipe.items.some((ri) => nonConsumableIds.has(ri.itemId))) {
    return recipe
  }
  return {
    ...recipe,
    items: recipe.items.filter((ri) => !nonConsumableIds.has(ri.itemId)),
  }
}
