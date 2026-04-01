import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createItem,
  deleteItem,
  getAllItems,
  getCartItemCountByItem,
  getInventoryLogCountByItem,
  getItem,
  getLastPurchaseDate,
  updateItem,
} from '@/db/operations'
import type { UpdateItemInput } from '@/generated/graphql'
import {
  GetItemsDocument,
  GetRecipesDocument,
  ItemCountByTagDocument,
  ItemCountByVendorDocument,
  useCreateItemMutation,
  useDeleteItemMutation,
  useGetItemQuery,
  useGetItemsQuery,
  useUpdateItemMutation,
} from '@/generated/graphql'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { Item } from '@/types'
import { useDataMode } from './useDataMode'

// GraphQL returns dueDate/createdAt/updatedAt as ISO strings; convert to Date.
function deserializeCloudItem(item: Record<string, unknown>): Item {
  return {
    ...item,
    dueDate: item.dueDate ? new Date(item.dueDate as string) : undefined,
    createdAt: new Date(item.createdAt as string),
    updatedAt: new Date(item.updatedAt as string),
  } as Item
}

// Map frontend Item partial to the GraphQL UpdateItemInput shape.
// Strips non-updatable fields and converts dueDate from Date to ISO string.
// Optional clearable fields are sent as explicit null when absent so that
// MongoDB $set clears them; absent = deleted via buildUpdates() = user cleared.
function toUpdateItemInput(updates: Partial<Item>): UpdateItemInput {
  const { id: _id, createdAt: _c, updatedAt: _u, dueDate, ...rest } = updates
  return {
    ...rest,
    packageUnit: rest.packageUnit ?? null,
    measurementUnit: rest.measurementUnit ?? null,
    amountPerPackage: rest.amountPerPackage ?? null,
    estimatedDueDays: rest.estimatedDueDays ?? null,
    expirationThreshold: rest.expirationThreshold ?? null,
    dueDate: dueDate instanceof Date ? dueDate.toISOString() : null,
  }
}

export function useItems() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['items'],
    queryFn: getAllItems,
    enabled: !isCloud,
  })

  const cloud = useGetItemsQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.items.map((i) =>
        deserializeCloudItem(i as Record<string, unknown>),
      ),
      isLoading: cloud.loading,
      isError: !!cloud.error,
      refetch: cloud.refetch,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
    refetch: local.refetch,
  }
}

export function useItem(id: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['items', id],
    queryFn: () => getItem(id),
    enabled: !!id && !isCloud,
  })

  const cloud = useGetItemQuery({ variables: { id }, skip: !isCloud || !id })

  if (isCloud) {
    return {
      data: cloud.data?.item
        ? deserializeCloudItem(cloud.data.item as Record<string, unknown>)
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
  const itemQuery = useItem(id)
  const lastPurchaseQuery = useQuery({
    queryKey: ['items', id, 'lastPurchase'],
    queryFn: () => getLastPurchaseDate(id),
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
  return useQuery({
    queryKey: ['items', itemId, 'lastPurchase'],
    queryFn: () => getLastPurchaseDate(itemId),
    enabled: !!itemId,
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (input: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>) =>
      createItem(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })

  const [cloudCreate] = useCreateItemMutation({
    refetchQueries: [{ query: GetItemsDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        input: { name: string },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCreate({ variables: { name: input.name } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (input: { name: string }) =>
        cloudCreate({ variables: { name: input.name } }).then(
          (r) => r.data?.createItem,
        ),
      isPending: false,
    }
  }

  return localMutation
}

export function useUpdateItem() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Item> }) =>
      updateItem(id, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['items', id] })
      queryClient.invalidateQueries({ queryKey: ['items', 'countByTag'] })
      queryClient.invalidateQueries({ queryKey: ['items', 'countByVendor'] })
    },
  })

  const [cloudUpdate] = useUpdateItemMutation({
    refetchQueries: [{ query: GetItemsDocument }],
  })

  if (mode === 'cloud') {
    // Cloud mode: updates must be a complete item payload (as produced by buildUpdates),
    // not a true partial. Absent optional fields are sent as null to MongoDB $set,
    // which clears them. A partial update with absent fields would silently clear them.
    return {
      mutate: (
        { id, updates }: { id: string; updates: Partial<Item> },
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
      mutateAsync: ({ id, updates }: { id: string; updates: Partial<Item> }) =>
        cloudUpdate({
          variables: { id, input: toUpdateItemInput(updates) },
        }).then((r) => r.data?.updateItem),
      isPending: false,
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

  const [cloudDelete] = useDeleteItemMutation()

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
      isPending: false,
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
