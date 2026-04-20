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
import {
  GetShelvesDocument,
  useCreateShelfMutation as useCreateShelfMutationGql,
  useDeleteShelfMutation as useDeleteShelfMutationGql,
  useGetShelfQuery,
  useGetShelvesQuery,
  useReorderShelfItemsMutation as useReorderShelfItemsMutationGql,
  useReorderShelvesMutation as useReorderShelvesMutationGql,
  useUpdateShelfMutation as useUpdateShelfMutationGql,
} from '@/generated/graphql'
import { deserializeShelf } from '@/lib/deserialization'
import type { FilterConfig, Shelf } from '@/types'
import { useDataMode } from './useDataMode'

export function useShelvesQuery() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['shelves'],
    queryFn: listShelves,
    enabled: !isCloud,
  })

  const cloud = useGetShelvesQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.shelves.map((s) =>
        deserializeShelf(s as Record<string, unknown>),
      ),
      isLoading: cloud.loading,
      isError: !!cloud.error,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}

export function useShelfQuery(id: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['shelves', id],
    queryFn: () => getShelf(id),
    enabled: !!id && !isCloud,
  })

  const cloud = useGetShelfQuery({
    variables: { id },
    skip: !isCloud || !id,
  })

  if (isCloud) {
    return {
      data: cloud.data?.shelf
        ? deserializeShelf(cloud.data.shelf as Record<string, unknown>)
        : undefined,
      isLoading: cloud.loading,
      isError: !!cloud.error,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}

// Strip sortBy/sortDir from FilterConfig before sending to GraphQL —
// the server schema only accepts tagIds, vendorIds, recipeIds.
function toGqlFilterConfig(filterConfig: FilterConfig): {
  tagIds?: string[]
  vendorIds?: string[]
  recipeIds?: string[]
} {
  const gql: { tagIds?: string[]; vendorIds?: string[]; recipeIds?: string[] } =
    {}
  if (filterConfig.tagIds) gql.tagIds = filterConfig.tagIds
  if (filterConfig.vendorIds) gql.vendorIds = filterConfig.vendorIds
  if (filterConfig.recipeIds) gql.recipeIds = filterConfig.recipeIds
  return gql
}

export function useCreateShelfMutation() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (data: Omit<Shelf, 'id' | 'createdAt' | 'updatedAt'>) =>
      createShelf(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shelves'] })
    },
  })

  const [cloudCreate] = useCreateShelfMutationGql({
    refetchQueries: [{ query: GetShelvesDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        data: Omit<Shelf, 'id' | 'createdAt' | 'updatedAt'>,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCreate({
          variables: {
            name: data.name,
            type: data.type,
            ...(data.filterConfig
              ? { filterConfig: toGqlFilterConfig(data.filterConfig) }
              : {}),
            ...(data.itemIds ? { itemIds: data.itemIds } : {}),
          },
        }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (data: Omit<Shelf, 'id' | 'createdAt' | 'updatedAt'>) =>
        cloudCreate({
          variables: {
            name: data.name,
            type: data.type,
            ...(data.filterConfig
              ? { filterConfig: toGqlFilterConfig(data.filterConfig) }
              : {}),
            ...(data.itemIds ? { itemIds: data.itemIds } : {}),
          },
        }).then((r) => r.data?.createShelf),
      isPending: false,
    }
  }

  return localMutation
}

export function useUpdateShelfMutation() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
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

  const [cloudUpdate] = useUpdateShelfMutationGql({
    refetchQueries: [{ query: GetShelvesDocument }],
  })

  if (mode === 'cloud') {
    const toVars = (
      id: string,
      data: Partial<Omit<Shelf, 'id' | 'createdAt'>>,
    ) => {
      const vars: {
        id: string
        name?: string
        type?: string
        order?: number
        filterConfig?: {
          tagIds?: string[]
          vendorIds?: string[]
          recipeIds?: string[]
        }
        itemIds?: string[]
      } = { id }
      if (data.name !== undefined) vars.name = data.name
      if (data.type !== undefined) vars.type = data.type
      if (data.order !== undefined) vars.order = data.order
      if (data.filterConfig !== undefined) {
        vars.filterConfig = toGqlFilterConfig(data.filterConfig)
      }
      if (data.itemIds !== undefined) vars.itemIds = data.itemIds
      return vars
    }
    return {
      mutate: (
        {
          id,
          data,
        }: { id: string; data: Partial<Omit<Shelf, 'id' | 'createdAt'>> },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudUpdate({ variables: toVars(id, data) }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: ({
        id,
        data,
      }: {
        id: string
        data: Partial<Omit<Shelf, 'id' | 'createdAt'>>
      }) =>
        cloudUpdate({ variables: toVars(id, data) }).then(
          (r) => r.data?.updateShelf,
        ),
      isPending: false,
    }
  }

  return localMutation
}

export function useDeleteShelfMutation() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (id: string) => deleteShelf(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shelves'] })
    },
  })

  const [cloudDelete] = useDeleteShelfMutationGql({
    refetchQueries: [{ query: GetShelvesDocument }],
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
        cloudDelete({ variables: { id } }).then((r) => r.data?.deleteShelf),
      isPending: false,
    }
  }

  return localMutation
}

export function useReorderShelvesMutation() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (orderedIds: string[]) => reorderShelves(orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shelves'] })
    },
  })

  const [cloudReorder] = useReorderShelvesMutationGql({
    refetchQueries: [{ query: GetShelvesDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        orderedIds: string[],
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudReorder({ variables: { orderedIds } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (orderedIds: string[]) =>
        cloudReorder({ variables: { orderedIds } }).then(
          (r) => r.data?.reorderShelves,
        ),
      isPending: false,
    }
  }

  return localMutation
}

export function useReorderShelfItemsMutation() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
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

  const [cloudReorderItems] = useReorderShelfItemsMutationGql({
    refetchQueries: [{ query: GetShelvesDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        {
          shelfId,
          orderedItemIds,
        }: { shelfId: string; orderedItemIds: string[] },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudReorderItems({ variables: { shelfId, orderedItemIds } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: ({
        shelfId,
        orderedItemIds,
      }: {
        shelfId: string
        orderedItemIds: string[]
      }) =>
        cloudReorderItems({ variables: { shelfId, orderedItemIds } }).then(
          (r) => r.data?.reorderShelfItems,
        ),
      isPending: false,
    }
  }

  return localMutation
}
