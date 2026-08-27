import { useMutation, useQueryClient } from '@tanstack/react-query'
import { applyShelfFilterPicksBatch } from '@/db/operations'
import type { PantryItem, RecipeItem } from '@/types'
import { useDataMode } from './useDataMode'
import { useUpdateItem } from './useItems'
import { useUpdateRecipe } from './useRecipes'

export interface ApplyShelfFilterPicksVars {
  /** The item being added. Cloud merges from its arrays; local re-reads the row instead. */
  item: PantryItem
  addTagIds: string[]
  addVendorIds: string[]
  /** Current recipe row, when the recipe axis was unmet. Cloud needs `items` to merge. */
  recipe?: { id: string; items: RecipeItem[] }
}

/**
 * Applies a filter shelf's per-axis picks to one item.
 *
 * LOCAL is atomic — one Dexie transaction over `[db.items, db.recipes]`
 * (`applyShelfFilterPicksBatch`), which also re-reads both rows inside the transaction,
 * so `vars.item` / `vars.recipe` are ignored on this path.
 *
 * CLOUD is NOT atomic: Apollo has no client-side transaction, so it does two sequential
 * round-trips and the second can fail alone. This is the same asymmetry `useApplyUnitSwitch`
 * already ships (which throws in cloud; here we degrade rather than refuse, because a
 * filter shelf's tags/vendors/recipes all exist in cloud and withholding the feature would
 * be gratuitous). A cloud half-write is benign and self-healing — nothing WRONG is
 * persisted, only something incomplete, and the dialog recomputes which axes are met so a
 * retry writes only what is still missing. PR D-1 replaces this branch with a single
 * `prisma.$transaction` resolver — see
 * `docs/features/items/2026-08-28-unified-item-search-plan-d1-cloud-transaction.md`.
 *
 * The local `onSuccess` RETURNS its invalidations, so `mutateAsync` resolves only once
 * both refetches have landed — see the "Awaited invalidation" paragraph in
 * `hooks/CLAUDE.md`. Two keys, not four: invalidation matches by PREFIX, so `['items']`
 * covers `useItems` and `useStockedItems` alike and `['recipes']` covers `['recipes', id]`.
 */
export function useApplyShelfFilterPicks() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const updateItem = useUpdateItem()
  const updateRecipe = useUpdateRecipe()

  const localMutation = useMutation({
    mutationFn: async (vars: ApplyShelfFilterPicksVars) => {
      await applyShelfFilterPicksBatch({
        itemId: vars.item.id,
        addTagIds: vars.addTagIds,
        addVendorIds: vars.addVendorIds,
        ...(vars.recipe ? { addRecipeId: vars.recipe.id } : {}),
      })
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['recipes'] }),
      ]),
  })

  if (mode === 'cloud') {
    return {
      mutateAsync: async (vars: ApplyShelfFilterPicksVars) => {
        if (vars.addTagIds.length > 0 || vars.addVendorIds.length > 0) {
          await updateItem.mutateAsync({
            id: vars.item.id,
            updates: {
              tagIds: [...new Set([...vars.item.tagIds, ...vars.addTagIds])],
              vendorIds: [
                ...new Set([
                  ...(vars.item.vendorIds ?? []),
                  ...vars.addVendorIds,
                ]),
              ],
            },
          })
        }
        if (
          vars.recipe &&
          !vars.recipe.items.some((ri) => ri.itemId === vars.item.id)
        ) {
          await updateRecipe.mutateAsync({
            id: vars.recipe.id,
            updates: {
              items: [
                ...vars.recipe.items,
                // `|| 1`, not `?? 1` — see applyShelfFilterPicksBatch: a stored
                // `0` means "optional, unchecked" in cooking, not "no default".
                {
                  itemId: vars.item.id,
                  defaultAmount: vars.item.consumeAmount || 1,
                },
              ],
            },
          })
        }
      },
      isPending: updateItem.isPending || updateRecipe.isPending,
    }
  }

  return localMutation
}
