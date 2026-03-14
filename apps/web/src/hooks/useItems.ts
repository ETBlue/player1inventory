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
  useCreateItemMutation,
  useDeleteItemMutation,
  useGetItemsQuery,
  useUpdateItemMutation,
} from '@/generated/graphql'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { Item } from '@/types'
import { useDataMode } from './useDataMode'

// Map frontend Item partial to the GraphQL UpdateItemInput shape.
// Strips non-updatable fields and converts dueDate from Date to ISO string.
function toUpdateItemInput(updates: Partial<Item>): UpdateItemInput {
  const { id: _id, createdAt: _c, updatedAt: _u, dueDate, ...rest } = updates
  return {
    ...rest,
    ...(dueDate instanceof Date ? { dueDate: dueDate.toISOString() } : {}),
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
      data: cloud.data?.items as Item[] | undefined,
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
  return useQuery({
    queryKey: ['items', id],
    queryFn: () => getItem(id),
    enabled: !!id,
  })
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

  const [cloudCreate] = useCreateItemMutation()

  if (mode === 'cloud') {
    return {
      mutate: (input: { name: string }) =>
        cloudCreate({ variables: { name: input.name } }),
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
    },
  })

  const [cloudUpdate] = useUpdateItemMutation({
    refetchQueries: [{ query: GetItemsDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: ({ id, updates }: { id: string; updates: Partial<Item> }) =>
        cloudUpdate({ variables: { id, input: toUpdateItemInput(updates) } }),
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
    mutationFn: deleteItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] }) // cascade invalidation
    },
  })

  const [cloudDelete] = useDeleteItemMutation({
    refetchQueries: [{ query: GetItemsDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (id: string) => cloudDelete({ variables: { id } }),
      mutateAsync: (id: string) =>
        cloudDelete({ variables: { id } }).then((r) => r.data?.deleteItem),
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
