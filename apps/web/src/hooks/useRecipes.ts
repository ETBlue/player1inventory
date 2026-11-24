import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRefetchAfterWrite } from '@/apollo/refetchAfterWrite'
import {
  consumeRecipesBatch,
  createRecipe,
  deleteRecipe,
  getItemCountByRecipe,
  getRecipe,
  getRecipes,
  updateRecipe,
  updateRecipeLastCookedAt,
} from '@/db/operations'
import {
  GetRecipeDocument,
  GetRecipesDocument,
  useConsumeRecipesMutation,
  useCreateRecipeMutation,
  useDeleteRecipeMutation,
  useGetRecipeQuery,
  useGetRecipesQuery,
  useItemCountByRecipeQuery,
  useUpdateRecipeLastCookedAtMutation,
  useUpdateRecipeMutation,
} from '@/generated/graphql'
import { deserializeRecipe } from '@/lib/deserialization'
import { consumeItem, getPackedTotal } from '@/lib/quantityUtils'
import type { Recipe, RecipeItem } from '@/types'
import { useActiveLocation } from './useActiveLocation'
import { useRequiredCloudLocationId } from './useCloudLocationId'
import { useDataMode } from './useDataMode'
import { stockListRefetches } from './useItems'

export function useRecipes() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['recipes'],
    queryFn: getRecipes,
    enabled: !isCloud,
  })

  // `cache-and-network` — Apollo's default `cache-first` never refreshes the
  // IndexedDB snapshot the cloud cache is restored from. See the comment on
  // `useItems` in `hooks/useItems.ts` and
  // `docs/global/bugs/2026-09-22-bug-cloud-queries-cache-first.md`.
  const cloud = useGetRecipesQuery({
    skip: !isCloud,
    fetchPolicy: 'cache-and-network',
  })

  if (isCloud) {
    return {
      data: cloud.data?.recipes.map((r) =>
        deserializeRecipe(r as Record<string, unknown>),
      ),
      // `&& !cloud.data` — with `cache-and-network` Apollo keeps
      // `loading: true` over cached data. Reporting that as loading puts a
      // spinner in front of a list the user can already read. See `useItems`.
      isLoading: cloud.loading && !cloud.data,
      // Offline the network leg fails on every mount while the cached data
      // is still good — an error only when there is nothing to show.
      isError: !!cloud.error && !cloud.data,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}

export function useRecipe(id: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['recipes', id],
    queryFn: () => getRecipe(id),
    enabled: !!id && !isCloud,
  })

  // `cache-and-network` — Apollo's default `cache-first` never refreshes the
  // IndexedDB snapshot the cloud cache is restored from. See the comment on
  // `useItems` in `hooks/useItems.ts` and
  // `docs/global/bugs/2026-09-22-bug-cloud-queries-cache-first.md`.
  const cloud = useGetRecipeQuery({
    variables: { id },
    skip: !isCloud || !id,
    fetchPolicy: 'cache-and-network',
  })

  if (isCloud) {
    return {
      data: cloud.data?.recipe
        ? deserializeRecipe(cloud.data.recipe as Record<string, unknown>)
        : (cloud.data?.recipe as null | undefined),
      // `&& !cloud.data` — with `cache-and-network` Apollo keeps
      // `loading: true` over cached data. Reporting that as loading puts a
      // spinner in front of a list the user can already read. See `useItems`.
      isLoading: cloud.loading && !cloud.data,
      // Offline the network leg fails on every mount while the cached data
      // is still good — an error only when there is nothing to show.
      isError: !!cloud.error && !cloud.data,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}

export function useCreateRecipe() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (input: { name: string; items?: RecipeItem[] }) =>
      createRecipe(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })

  const [cloudCreate, { loading: cloudCreateLoading }] =
    useCreateRecipeMutation({
      refetchQueries: [{ query: GetRecipesDocument }],
    })

  if (mode === 'cloud') {
    const toVars = (input: { name: string; items?: RecipeItem[] }) => {
      const vars: { name: string; items?: RecipeItem[] } = { name: input.name }
      if (input.items !== undefined) {
        vars.items = input.items.map(({ itemId, defaultAmount }) => ({
          itemId,
          defaultAmount,
        }))
      }
      return vars
    }
    return {
      mutate: (
        input: { name: string; items?: RecipeItem[] },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCreate({ variables: toVars(input) }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (input: { name: string; items?: RecipeItem[] }) =>
        cloudCreate({ variables: toVars(input) }).then(
          (r) => r.data?.createRecipe,
        ),
      isPending: cloudCreateLoading,
    }
  }

  return localMutation
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { refetchAfterWrite, isRefetching } = useRefetchAfterWrite()

  const localMutation = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>
    }) => updateRecipe(id, updates),
    // RETURNED, not fire-and-forget (almost every other `onSuccess` in
    // `hooks/` still is): `mutateAsync` awaits what `onSuccess` returns, so
    // returning the invalidation makes the caller's `await` resolve only once
    // the refetch has landed. The search tail's group action re-enables every
    // row in a `finally` after that await (`useItemSearchTailWiring`) while
    // appending to a `recipe.items` array captured from the render closure —
    // re-enabling against a stale array drops one of two quick presses.
    // One key is enough: invalidation matches by PREFIX, so `['recipes']`
    // already covers `['recipes', id]` and `['recipes', 'itemCount']`.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
  })

  const [cloudUpdate, { loading: cloudUpdateLoading }] =
    useUpdateRecipeMutation({})

  if (mode === 'cloud') {
    const toVars = (
      id: string,
      updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>,
    ) => {
      const vars: { id: string; name?: string; items?: RecipeItem[] } = { id }
      if (updates.name !== undefined) vars.name = updates.name
      if (updates.items !== undefined) {
        vars.items = updates.items.map(({ itemId, defaultAmount }) => ({
          itemId,
          defaultAmount,
        }))
      }
      return vars
    }
    // Write, then read the recipe lists again and WAIT for them, the cloud
    // counterpart of the local branch's returned invalidation. A failed read
    // does not reject: the write worked (`refetchAfterWrite`). Both `{ query }`
    // entries are read even when nothing is mounted, as they were under the
    // old `refetchQueries` + `awaitRefetchQueries: true`, which rejected the
    // save when a read failed (docs/global/bugs/
    // 2026-11-18-bug-failed-refetch-rejects-saved-write.md).
    const runCloudUpdate = async (
      id: string,
      updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>,
    ) => {
      const result = await cloudUpdate({ variables: toVars(id, updates) })
      await refetchAfterWrite([
        { query: GetRecipesDocument },
        { query: GetRecipeDocument, variables: { id } },
      ])
      return result.data?.updateRecipe
    }
    return {
      mutate: (
        {
          id,
          updates,
        }: {
          id: string
          updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>
        },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        runCloudUpdate(id, updates).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: ({
        id,
        updates,
      }: {
        id: string
        updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>
      }) => runCloudUpdate(id, updates),
      isPending: cloudUpdateLoading || isRefetching,
    }
  }

  return localMutation
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: deleteRecipe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })

  const [cloudDelete, { loading: cloudDeleteLoading }] =
    useDeleteRecipeMutation({
      refetchQueries: [{ query: GetRecipesDocument }],
    })

  if (mode === 'cloud') {
    return {
      mutate: (
        id: string,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudDelete({ variables: { id } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (id: string) =>
        cloudDelete({ variables: { id } }).then((r) => r.data?.deleteRecipe),
      isPending: cloudDeleteLoading,
    }
  }

  return localMutation
}

export function useUpdateRecipeLastCookedAt() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (id: string) => updateRecipeLastCookedAt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })

  const [cloudUpdate, { loading: cloudUpdateLoading }] =
    useUpdateRecipeLastCookedAtMutation({
      refetchQueries: [{ query: GetRecipesDocument }],
    })

  if (mode === 'cloud') {
    return {
      mutate: (
        id: string,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudUpdate({ variables: { id } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (id: string) =>
        cloudUpdate({ variables: { id } }).then(
          (r) => r.data?.updateRecipeLastCookedAt,
        ),
      isPending: cloudUpdateLoading,
    }
  }

  return localMutation
}

/**
 * One item a cook uses. The same shape in both modes.
 *
 * `delta` is the inventory log's signed change: minus the amount used, in the
 * unit `consumeItem` takes (measurement units when the item tracks in
 * measurement, otherwise packages).
 */
export interface ConsumeRecipeItem {
  itemId: string
  delta: number
  note?: string
  logKey?: string
  logParams?: Record<string, string>
}

export interface ConsumeRecipesArgs {
  occurredAt: Date
  recipeIds: string[]
  items: ConsumeRecipeItem[]
  /**
   * The stock the page shows at the active location. LOCAL mode only: it
   * computes the new numbers from these rows, as the cooking page did before
   * households H3b task B.6. The cloud branch never reads it, because the
   * server reads its own stock row inside a transaction.
   */
  localStock: ReadonlyArray<Parameters<typeof consumeItem>[0] & { id: string }>
}

export function useConsumeRecipes() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { activeLocationId } = useActiveLocation()
  const [cloudConsumeRecipes] = useConsumeRecipesMutation()
  // Resolved at CALL time, not render time — `ConsumeRecipesInput.locationId`
  // is `ID!` since PR 3b Task 4 and the server asks for the `participant` location role on it,
  // so the `'local'` sentinel of a fresh cloud session would lose the whole
  // cook to FORBIDDEN. See `useCloudLocationId`.
  const resolveCloudLocationId = useRequiredCloudLocationId()
  const { refetchAfterWrite } = useRefetchAfterWrite()

  return useMutation({
    mutationFn: async (input: ConsumeRecipesArgs) => {
      if (mode === 'cloud') {
        // Households H3b task B.6: only the amounts used. The server reads
        // the stock row, applies `consumeItem` and computes the log total
        // itself, in one transaction. Until B.6 this sent the final
        // `packedQuantity` / `unpackedQuantity` and the log `quantity`,
        // computed from the stock this screen had loaded, so two people
        // cooking the same item from the same screen lost one use.
        const locationId = await resolveCloudLocationId()
        const result = await cloudConsumeRecipes({
          variables: {
            input: {
              occurredAt: input.occurredAt.toISOString(),
              locationId,
              recipeIds: input.recipeIds,
              items: input.items.map((item) => ({
                itemId: item.itemId,
                delta: item.delta,
                ...(item.note !== undefined ? { note: item.note } : {}),
                ...(item.logKey !== undefined ? { logKey: item.logKey } : {}),
                ...(item.logParams !== undefined
                  ? { logParams: item.logParams }
                  : {}),
              })),
            },
          },
        })
        // Issue #404: read again what the cook changed. `ConsumeRecipes`
        // returns no `ItemStock` and no `Recipe`, the `onSuccess`
        // invalidations below are TanStack keys that no cloud query uses, and
        // the server sends the live `STOCK` event to OTHER tabs only. Without
        // this the cooking page kept the old quantities and `lastCookedAt`
        // until it mounted again.
        //
        // `PantryData` goes by `{ query, variables }` for the location the
        // cook was SENT for, never by name: by name Apollo also reads a
        // `PantryData` observer that `skip` parked on the `'local'` sentinel,
        // which the server refuses (`stockListRefetches` in `useItems.ts`).
        // Not the mutation's own `refetchQueries` with `awaitRefetchQueries`:
        // one failed read would reject a cook the server saved
        // (`apollo/refetchAfterWrite.ts`). A failed read does not reject
        // here, and a failed write rejects before this line.
        //
        // Awaited, so `mutateAsync` resolves, and `isPending` turns false,
        // only once the lists have landed. The Done dialog stays busy until
        // then, the same as the other stock writes.
        await refetchAfterWrite([
          ...stockListRefetches(locationId),
          { query: GetRecipesDocument },
        ])
        return result
      }
      // Local mode is single-user, so computing here from the page's stock is
      // safe. This is the computation `cooking.tsx` did itself before B.6,
      // moved here unchanged: `-delta` is exactly the amount the page used.
      return consumeRecipesBatch({
        occurredAt: input.occurredAt,
        recipeIds: input.recipeIds,
        locationId: activeLocationId,
        items: input.items.flatMap((item) => {
          const stock = input.localStock.find((s) => s.id === item.itemId)
          if (!stock) return []
          const updated = { ...stock }
          consumeItem(updated, -item.delta)
          return [
            {
              itemId: item.itemId,
              packedQuantity: updated.packedQuantity,
              unpackedQuantity: updated.unpackedQuantity,
              delta: item.delta,
              quantity: getPackedTotal(updated),
              ...(item.note !== undefined ? { note: item.note } : {}),
              ...(item.logKey !== undefined ? { logKey: item.logKey } : {}),
              ...(item.logParams !== undefined
                ? { logParams: item.logParams }
                : {}),
            },
          ]
        }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export function useItemCountByRecipe(recipeId: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['recipes', 'itemCount', recipeId],
    queryFn: () => getItemCountByRecipe(recipeId),
    enabled: !!recipeId && !isCloud,
  })

  const cloud = useItemCountByRecipeQuery({
    variables: { recipeId },
    fetchPolicy: 'cache-and-network',
    skip: !isCloud || !recipeId,
  })

  if (isCloud) {
    return {
      data: cloud.data?.itemCountByRecipe as number | undefined,
      // `&& !cloud.data` — with `cache-and-network` Apollo keeps
      // `loading: true` over cached data. Reporting that as loading puts a
      // spinner in front of a list the user can already read. See `useItems`.
      isLoading: cloud.loading && !cloud.data,
      // Offline the network leg fails on every mount while the cached data
      // is still good — an error only when there is nothing to show.
      isError: !!cloud.error && !cloud.data,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}
