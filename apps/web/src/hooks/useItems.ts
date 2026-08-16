import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addItemToLocation,
  createItem,
  deleteItem,
  getAllItems,
  getCartItemCountByItem,
  getInventoryLogCountByItem,
  getItem,
  getLastPurchaseDate,
  getStockedItems,
  updateItem,
} from '@/db/operations'
import type { CreateItemInput, UpdateItemInput } from '@/generated/graphql'
import {
  GetItemsDocument,
  GetRecipesDocument,
  ItemCountByTagDocument,
  ItemCountByVendorDocument,
  useCreateItemMutation,
  useDeleteItemMutation,
  useGetItemQuery,
  useGetItemsQuery,
  useLastPurchaseDatesQuery,
  useUpdateItemMutation,
} from '@/generated/graphql'
import { deserializeItem } from '@/lib/deserialization'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { Item, StockFields } from '@/types'
import { useActiveLocation } from './useActiveLocation'
import { useDataMode } from './useDataMode'

// In local mode, item create/update accept the global Item fields plus stock
// fields (split into the active-location ItemStock by the operations layer).
type ItemMutationInput = Omit<Item, 'id' | 'createdAt' | 'updatedAt'> &
  Partial<StockFields>

// Map frontend Item (without id/timestamps) to the GraphQL CreateItemInput shape.
// Converts dueDate from Date to ISO string; passes all other fields through.
function toCreateItemInput(input: ItemMutationInput): CreateItemInput {
  const { dueDate, ...rest } = input
  return {
    ...rest,
    dueDate: dueDate instanceof Date ? dueDate.toISOString() : null,
  } as CreateItemInput
}

// Map frontend Item partial to the GraphQL UpdateItemInput shape.
// Strips non-updatable fields and converts dueDate from Date to ISO string.
//
// Semantics:
//   - Field absent from `updates` → omitted from output → server leaves it alone
//   - Field present with undefined/null value → sent as null → server clears it
//
// This means partial updates (quantity buttons, tag assignment, etc.) safely
// omit expiration and measurement fields, leaving them untouched in MongoDB.
// The full ItemForm explicitly sets these fields (to a value or undefined) so
// it still controls their DB state.
export function toUpdateItemInput(
  updates: Partial<Item> & Partial<StockFields>,
): UpdateItemInput {
  const { id: _id, createdAt: _c, updatedAt: _u, dueDate, ...rest } = updates
  return {
    // Non-clearable fields (name, tagIds, quantities, etc.) pass through unchanged.
    // Guard assignments below MUST come after ...rest — they coerce optional fields that
    // rest may have written as undefined into explicit null for MongoDB $set.
    ...rest,
    ...('packageUnit' in rest && { packageUnit: rest.packageUnit ?? null }),
    ...('measurementUnit' in rest && {
      measurementUnit: rest.measurementUnit ?? null,
    }),
    ...('amountPerPackage' in rest && {
      amountPerPackage: rest.amountPerPackage ?? null,
    }),
    ...('estimatedDueDays' in rest && {
      estimatedDueDays: rest.estimatedDueDays ?? null,
    }),
    ...('expirationThreshold' in rest && {
      expirationThreshold: rest.expirationThreshold ?? null,
    }),
    ...('expirationMode' in rest && {
      expirationMode: rest.expirationMode ?? null,
    }),
    ...('dueDate' in updates && {
      dueDate: dueDate instanceof Date ? dueDate.toISOString() : null,
    }),
  }
}

export function useItems() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  const local = useQuery({
    queryKey: ['items', { locationId: activeLocationId }],
    queryFn: () => getAllItems(activeLocationId),
    enabled: !isCloud,
  })

  const cloud = useGetItemsQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.items.map((i) =>
        deserializeItem(i as Record<string, unknown>),
      ),
      isLoading: cloud.loading,
      isFetching: cloud.networkStatus < 7, // 7 = NetworkStatus.ready
      isError: !!cloud.error,
      refetch: cloud.refetch,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isFetching: local.isFetching,
    isError: local.isError,
    refetch: local.refetch,
  }
}

// Items stocked in the active location (have an ItemStock row there), joined
// with that location's stock. This is the pantry's data source — items not
// stocked in the active location are absent. Switching the active location
// re-scopes the result (activeLocationId is part of the query key).
//
// Cloud mode: ItemStock has no GraphQL backend yet, so this falls back to the
// full cloud item list (cloud TODO: per-location stock + catalog).
export function useStockedItems() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  const local = useQuery({
    queryKey: ['items', 'stocked', { locationId: activeLocationId }],
    queryFn: () => getStockedItems(activeLocationId),
    enabled: !isCloud,
  })

  const cloud = useGetItemsQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.items.map((i) =>
        deserializeItem(i as Record<string, unknown>),
      ),
      isLoading: cloud.loading,
      isFetching: cloud.networkStatus < 7, // 7 = NetworkStatus.ready
      isError: !!cloud.error,
      refetch: cloud.refetch,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isFetching: local.isFetching,
    isError: local.isError,
    refetch: local.refetch,
  }
}

export function useItem(id: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  const local = useQuery({
    queryKey: ['items', id, { locationId: activeLocationId }],
    queryFn: () => getItem(id, activeLocationId),
    enabled: !!id && !isCloud,
  })

  const cloud = useGetItemQuery({ variables: { id }, skip: !isCloud || !id })

  if (isCloud) {
    return {
      data: cloud.data?.item
        ? deserializeItem(cloud.data.item as Record<string, unknown>)
        : undefined,
      isLoading: cloud.loading,
      isError: !!cloud.error,
    }
  }

  return {
    data: local.data,
    isLoading: local.isLoading,
    isError: local.isError,
  }
}

export function useItemWithQuantity(id: string) {
  const { activeLocationId } = useActiveLocation()
  const itemQuery = useItem(id)
  const lastPurchaseQuery = useQuery({
    queryKey: ['items', id, 'lastPurchase', { locationId: activeLocationId }],
    queryFn: () => getLastPurchaseDate(id, activeLocationId),
    enabled: !!id,
  })

  return {
    item: itemQuery.data,
    quantity: itemQuery.data ? getCurrentQuantity(itemQuery.data) : 0,
    lastPurchaseDate: lastPurchaseQuery.data,
    isLoading: itemQuery.isLoading,
  }
}

export function useLastPurchaseDate(itemId: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  // Cloud: use Apollo batch query (local logs are stale in cloud mode)
  const { data: cloudData, loading: cloudLoading } = useLastPurchaseDatesQuery({
    variables: { itemIds: [itemId] },
    skip: !isCloud || !itemId,
  })
  const cloudDate = cloudData?.lastPurchaseDates.find(
    (r) => r.itemId === itemId,
  )?.date

  // Local: TanStack Query + Dexie, scoped to the active location
  const localQuery = useQuery({
    queryKey: [
      'items',
      itemId,
      'lastPurchase',
      { locationId: activeLocationId },
    ],
    queryFn: () => getLastPurchaseDate(itemId, activeLocationId),
    enabled: !isCloud && !!itemId,
  })

  if (isCloud) {
    return {
      data: cloudDate ? new Date(cloudDate) : undefined,
      isLoading: cloudLoading,
      isError: false,
    }
  }

  return localQuery
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { activeLocationId } = useActiveLocation()

  const localMutation = useMutation({
    mutationFn: (input: ItemMutationInput) =>
      createItem(input, activeLocationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })

  const [cloudCreate, { loading: cloudCreateLoading }] = useCreateItemMutation({
    refetchQueries: [{ query: GetItemsDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        input: ItemMutationInput,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCreate({ variables: { input: toCreateItemInput(input) } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (input: ItemMutationInput) =>
        cloudCreate({ variables: { input: toCreateItemInput(input) } }).then(
          (r) => r.data?.createItem,
        ),
      isPending: cloudCreateLoading,
    }
  }

  return localMutation
}

// Stock an existing global item in the active location via copy-on-add
// (inherits all stock fields except packed/unpacked → 0). No-op if the item is
// already stocked there. Local-first only — ItemStock has no cloud backend yet.
export function useAddItemToLocation() {
  const queryClient = useQueryClient()
  const { activeLocationId } = useActiveLocation()

  return useMutation({
    mutationFn: (itemId: string) => addItemToLocation(itemId, activeLocationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['itemStocks'] })
    },
  })
}

type ItemUpdateVars = {
  id: string
  updates: Partial<Item> & Partial<StockFields>
}

export function useUpdateItem() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { activeLocationId } = useActiveLocation()

  const localMutation = useMutation({
    mutationFn: ({ id, updates }: ItemUpdateVars) =>
      updateItem(id, updates, activeLocationId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['items', id] })
      queryClient.invalidateQueries({ queryKey: ['items', 'countByTag'] })
      queryClient.invalidateQueries({ queryKey: ['items', 'countByVendor'] })
    },
  })

  const [cloudUpdate, { loading: cloudUpdateLoading }] = useUpdateItemMutation({
    refetchQueries: [{ query: GetItemsDocument }],
  })

  if (mode === 'cloud') {
    // Cloud mode: serializes updates to GraphQL input via toUpdateItemInput().
    // Absent fields are omitted (server leaves them alone); fields present
    // with undefined/null are sent as null (server clears them).
    return {
      mutate: (
        { id, updates }: ItemUpdateVars,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudUpdate({
          variables: { id, input: toUpdateItemInput(updates) },
        }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: ({ id, updates }: ItemUpdateVars) =>
        cloudUpdate({
          variables: { id, input: toUpdateItemInput(updates) },
        }).then((r) => r.data?.updateItem),
      isPending: cloudUpdateLoading,
    }
  }

  return localMutation
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: ({ id }: { id: string; vendorIds?: string[] }) =>
      deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] }) // cascade invalidation
    },
  })

  const [cloudDelete, { loading: cloudDeleteLoading }] = useDeleteItemMutation()

  if (mode === 'cloud') {
    const buildRefetchQueries = (vendorIds?: string[], tagIds?: string[]) => [
      { query: GetItemsDocument },
      { query: GetRecipesDocument },
      ...(vendorIds ?? []).map((vendorId) => ({
        query: ItemCountByVendorDocument,
        variables: { vendorId },
      })),
      ...(tagIds ?? []).map((tagId) => ({
        query: ItemCountByTagDocument,
        variables: { tagId },
      })),
    ]

    return {
      mutate: (
        {
          id,
          vendorIds,
          tagIds,
        }: { id: string; vendorIds?: string[]; tagIds?: string[] },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudDelete({
          variables: { id },
          refetchQueries: buildRefetchQueries(vendorIds, tagIds),
        }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: ({
        id,
        vendorIds,
        tagIds,
      }: {
        id: string
        vendorIds?: string[]
        tagIds?: string[]
      }) =>
        cloudDelete({
          variables: { id },
          refetchQueries: buildRefetchQueries(vendorIds, tagIds),
        }).then((r) => r.data?.deleteItem),
      isPending: cloudDeleteLoading,
    }
  }

  return localMutation
}

export function useInventoryLogCountByItem(itemId: string) {
  return useQuery({
    queryKey: ['inventoryLogs', 'countByItem', itemId],
    queryFn: () => getInventoryLogCountByItem(itemId),
    enabled: !!itemId,
  })
}

export function useCartItemCountByItem(itemId: string) {
  return useQuery({
    queryKey: ['cartItems', 'countByItem', itemId],
    queryFn: () => getCartItemCountByItem(itemId),
    enabled: !!itemId,
  })
}
