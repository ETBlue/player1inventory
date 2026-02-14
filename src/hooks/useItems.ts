import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createItem,
  deleteItem,
  getAllItems,
  getItem,
  getLastPurchaseDate,
  updateItem,
} from '@/db/operations'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { Item } from '@/types'

export function useItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: getAllItems,
  })
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

export function useCreateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>) =>
      createItem(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
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
    },
  })
}
