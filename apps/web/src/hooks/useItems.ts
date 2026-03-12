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
import { useCreateItemMutation, useGetItemsQuery } from '@/generated/graphql'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { Item } from '@/types'
import { useDataMode } from './useDataMode'

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

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Item> }) =>
      updateItem(id, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['items', id] })
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] }) // cascade invalidation
    },
  })
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
