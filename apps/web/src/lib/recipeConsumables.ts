import { hasGraphQLErrorReason } from '@/lib/graphqlErrorCode'
import { isConsumable, type RecipeItem } from '@/types'

// Cooking is only for consumable items (owner decision 2026-11-26), and only
// consumable items can be in a recipe. Since the follow-up the same day, no
// write adds one and turning an item non-consumable deletes its links, in
// both modes. A link can still exist from before that change; the read-side
// filters below hide it, as a safety net.

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

/** `extensions.reason` the server sends with a refusal (`apps/server/src/lib/consumable.ts`). */
export const NOT_CONSUMABLE = 'NOT_CONSUMABLE'

/**
 * Local mode's refusal: a write tried to put a non-consumable item in a
 * recipe, or to cook one. The same rule as the server's `NOT_CONSUMABLE`
 * (`db/operations.ts`).
 */
export class NotConsumableError extends Error {
  readonly itemIds: readonly string[]
  constructor(itemIds: readonly string[]) {
    super(
      `Only consumable items can be in a recipe or be cooked. Not consumable: ${itemIds.join(', ')}`,
    )
    this.name = 'NotConsumableError'
    this.itemIds = itemIds
  }
}

/** Whether a failed write was refused because an item is not consumable, in either mode. */
export function isNotConsumableError(err: unknown): boolean {
  return (
    err instanceof NotConsumableError ||
    hasGraphQLErrorReason(err, NOT_CONSUMABLE)
  )
}
