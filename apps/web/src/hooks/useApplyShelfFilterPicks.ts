import { useMutation, useQueryClient } from '@tanstack/react-query'
import { applyShelfFilterPicksBatch } from '@/db/operations'
import {
  GetItemsDocument,
  GetRecipesDocument,
  useApplyShelfFilterPicksMutation,
} from '@/generated/graphql'
import type { PantryItem, RecipeItem } from '@/types'
import { useDataMode } from './useDataMode'

export interface ApplyShelfFilterPicksVars {
  item: PantryItem
  addTagIds: string[]
  addVendorIds: string[]
  recipe?: { id: string; items: RecipeItem[] }
}

/**
 * Applies a filter shelf's per-axis picks to one item.
 *
 * LOCAL is atomic — one Dexie transaction over `[db.items, db.recipes]`
 * (`applyShelfFilterPicksBatch`), which also re-reads both rows inside the transaction,
 * so `vars.item` / `vars.recipe` are ignored on this path.
 *
 * CLOUD is also atomic — a single `applyShelfFilterPicks` mutation whose resolver does
 * both writes inside one `prisma.$transaction`, reading the current `Item` and `Recipe`
 * rows and unioning the ids server-side.
 *
 * The local `onSuccess` RETURNS its invalidations, so `mutateAsync` resolves only once
 * both refetches have landed — see the "Awaited invalidation" paragraph in
 * `hooks/CLAUDE.md`. Two keys, not four: invalidation matches by PREFIX, so `['items']`
 * covers `useItems` and `useStockedItems` alike and `['recipes']` covers `['recipes', id]`.
 */
export function useApplyShelfFilterPicks() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

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

  const [cloudApply, { loading: cloudApplyLoading }] =
    useApplyShelfFilterPicksMutation()

  if (mode === 'cloud') {
    return {
      mutateAsync: async (vars: ApplyShelfFilterPicksVars) => {
        await cloudApply({
          variables: {
            input: {
              itemId: vars.item.id,
              addTagIds: vars.addTagIds,
              addVendorIds: vars.addVendorIds,
              addRecipeId: vars.recipe?.id ?? null,
            },
          },
          refetchQueries: [
            { query: GetItemsDocument },
            { query: GetRecipesDocument },
          ],
          awaitRefetchQueries: true,
        })
      },
      isPending: cloudApplyLoading,
    }
  }

  return localMutation
}
