import { GraphQLError } from 'graphql'
import { prisma } from './prisma.js'

// ── Only consumable items can be in a recipe (owner decision 2026-11-26) ──
//
// Cooking is only for consumable items, so a recipe must not hold a
// non-consumable one. The server enforces it:
//
// | Write | What happens to a non-consumable item |
// |---|---|
// | `createRecipe`, `updateRecipe`, `applyShelfFilterPicks`, the recipe lists of `applyUnitSwitch` | refused, `BAD_USER_INPUT` with `extensions.reason` `NOT_CONSUMABLE`, nothing written |
// | `consumeRecipes` | refused the same way |
// | `bulkCreateRecipes`, `bulkUpsertRecipes` (imports) | that recipe item is SKIPPED, the recipe still lands (the import rule: a row that does not resolve is skipped) |
// | `updateItem`, `applyUnitSwitch`, `bulkUpsertItems` that make an item non-consumable | the item's `RecipeItem` rows are deleted |
//
// "Attach" means a NEW link. `updateRecipe` and `applyUnitSwitch` replace a
// recipe's whole item list, so a list that repeats a link the recipe already
// holds is not refused for it: only a link made before this rule can be one,
// and refusing it would stop every later edit of that recipe.

/** `extensions.reason` of every refusal above. */
export const NOT_CONSUMABLE = 'NOT_CONSUMABLE'

export function notConsumableError(itemIds: readonly string[]): GraphQLError {
  return new GraphQLError(
    `Only consumable items can be in a recipe or be cooked. Not consumable: ${itemIds.join(', ')}`,
    { extensions: { code: 'BAD_USER_INPUT', reason: NOT_CONSUMABLE, itemIds: [...itemIds] } },
  )
}

/** Any client that can read items: the global `prisma` or a transaction's `tx`. */
type ItemReader = {
  item: {
    findMany: (args: {
      where: { id: { in: string[] }; householdId: string }
      select: { id: true; consumable: true }
    }) => Promise<{ id: string; consumable: boolean }[]>
  }
}

/**
 * The ids among `itemIds` that name a non-consumable item of `householdId`.
 * An id of another household or of no row is not in the answer: the caller
 * checks those with `requireCatalogIds` first.
 *
 * `=== false`, not `!consumable`: the column is NOT NULL, so a real row always
 * holds a boolean.
 */
export async function nonConsumableItemIds(
  householdId: string,
  itemIds: readonly string[],
  db: ItemReader = prisma as unknown as ItemReader,
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set()
  const rows = await db.item.findMany({
    where: { id: { in: [...new Set(itemIds)] }, householdId },
    select: { id: true, consumable: true },
  })
  return new Set(rows.filter((r) => r.consumable === false).map((r) => r.id))
}

/**
 * Refuse when the write would attach a non-consumable item to a recipe.
 *
 * `alreadyLinked` is read only when some item is non-consumable, so the
 * common case costs one query. It answers the item ids the recipe holds
 * today; those are not "attached" by this write (see the table above).
 */
export async function requireConsumableAttachments(
  householdId: string,
  itemIds: readonly string[],
  alreadyLinked: () => Promise<ReadonlySet<string>>,
  db?: ItemReader,
): Promise<void> {
  const blocked = await nonConsumableItemIds(householdId, itemIds, db)
  if (blocked.size === 0) return
  const linked = await alreadyLinked()
  const attached = [...blocked].filter((id) => !linked.has(id))
  if (attached.length > 0) throw notConsumableError(attached)
}
