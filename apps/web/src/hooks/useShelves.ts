import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createShelf,
  deleteShelf,
  getShelf,
  listShelves,
  reorderShelfItems,
  reorderShelves,
  updateShelf,
} from '@/db/operations'
import type { Shelf } from '@/types'

export function useShelvesQuery() {
  return useQuery({
    queryKey: ['shelves'],
    queryFn: listShelves,
  })
}

export function useShelfQuery(id: string) {
  return useQuery({
    queryKey: ['shelves', id],
    queryFn: () => getShelf(id),
    enabled: !!id,
  })
}

export function useCreateShelfMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Shelf, 'id' | 'createdAt' | 'updatedAt'>) =>
      createShelf(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shelves'] })
    },
  })
}

export function useUpdateShelfMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Partial<Omit<Shelf, 'id' | 'createdAt'>>
    }) => updateShelf(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['shelves'] })
      queryClient.invalidateQueries({ queryKey: ['shelves', id] })
    },
  })
}

export function useDeleteShelfMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteShelf(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shelves'] })
    },
  })
}

export function useReorderShelvesMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderShelves(orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shelves'] })
    },
  })
}

export function useReorderShelfItemsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      shelfId,
      orderedItemIds,
    }: {
      shelfId: string
      orderedItemIds: string[]
    }) => reorderShelfItems(shelfId, orderedItemIds),
    onSuccess: (_, { shelfId }) => {
      queryClient.invalidateQueries({ queryKey: ['shelves', shelfId] })
    },
  })
}
