import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createLocation,
  deleteLocation,
  getLocations,
  reorderLocations,
  updateLocation,
} from '@/db/operations'
import {
  GetLocationsDocument,
  type GetLocationsQuery,
  useCreateLocationMutation as useCreateLocationMutationGql,
  useDeleteLocationMutation as useDeleteLocationMutationGql,
  useGetLocationsQuery,
  useReorderLocationsMutation as useReorderLocationsMutationGql,
  useUpdateLocationMutation as useUpdateLocationMutationGql,
} from '@/generated/graphql'
import { deserializeLocation } from '@/lib/deserialization'
import type { Location } from '@/types'
import { useDataMode } from './useDataMode'

export function useLocations() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['locations'],
    queryFn: getLocations,
    enabled: !isCloud,
  })

  const cloud = useGetLocationsQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.locations.map((l) =>
        deserializeLocation(l as Record<string, unknown>),
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

export function useCreateLocation() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (name: string) => createLocation(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
  })

  // `createLocation` returns the new Location, but a mutation result can never
  // teach Apollo that the `Query.locations` ROOT FIELD grew an entry — only the
  // entity itself is normalized. Refetching `GetLocations` is the cloud
  // equivalent of the local `invalidateQueries(['locations'])`.
  const [cloudCreate, { loading: cloudCreateLoading }] =
    useCreateLocationMutationGql({
      refetchQueries: [{ query: GetLocationsDocument }],
    })

  if (mode === 'cloud') {
    return {
      mutate: (
        name: string,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCreate({ variables: { name } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (name: string) =>
        cloudCreate({ variables: { name } }).then(
          (r) => r.data?.createLocation,
        ),
      isPending: cloudCreateLoading,
    }
  }

  return localMutation
}

export const CLOUD_LOCATION_ORDER_NOT_UPDATABLE =
  'updateLocation cannot change `order` in cloud mode — UpdateLocationInput is name-only; use useReorderLocations()'

// `UpdateLocationInput` carries ONLY `name` (apps/server/src/schema/location.graphql)
// — unlike `updateShelf`, which this hook otherwise mirrors, there is no `order`
// field to write. Ordering goes through `reorderLocations`. Silently dropping an
// `order` would let a caller believe a reorder had been persisted, so refuse it
// loudly instead.
function toUpdateLocationInput(
  updates: Partial<Omit<Location, 'id' | 'createdAt'>>,
): { name?: string } {
  if (updates.order !== undefined) {
    throw new Error(CLOUD_LOCATION_ORDER_NOT_UPDATABLE)
  }
  return updates.name !== undefined ? { name: updates.name } : {}
}

export function useUpdateLocation() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<Omit<Location, 'id' | 'createdAt'>>
    }) => updateLocation(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
  })

  // A rename returns the whole Location, so Apollo's normalized cache already
  // holds the new name; the refetch keeps this branch shaped like the other
  // four (at one request on a rare action) rather than depending on
  // normalization holding for every field the type may grow.
  const [cloudUpdate, { loading: cloudUpdateLoading }] =
    useUpdateLocationMutationGql({
      refetchQueries: [{ query: GetLocationsDocument }],
    })

  if (mode === 'cloud') {
    return {
      mutate: (
        {
          id,
          updates,
        }: {
          id: string
          updates: Partial<Omit<Location, 'id' | 'createdAt'>>
        },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudUpdate({
          variables: { id, input: toUpdateLocationInput(updates) },
        }).then(
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
        updates: Partial<Omit<Location, 'id' | 'createdAt'>>
      }) =>
        cloudUpdate({
          variables: { id, input: toUpdateLocationInput(updates) },
        }).then((r) => r.data?.updateLocation),
      isPending: cloudUpdateLoading,
    }
  }

  return localMutation
}

export function useDeleteLocation() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (id: string) => deleteLocation(id),
    onSuccess: () => {
      // Deleting a location cascades its ItemStock rows, carts/cart-items, and
      // logs — invalidate anything that might have read them.
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['itemStocks'] })
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      queryClient.invalidateQueries({ queryKey: ['sort'] })
    },
  })

  // The server cascade matches the local one, but Apollo has no prefix-keyed
  // invalidation to mirror those five keys with — it refetches named queries.
  // `GetLocations` is the only query cloud mode reads today that the cascade
  // can touch: cloud carts and inventory logs are not location-scoped until
  // PR 3, and `PantryData` (the cloud ItemStock read) does not exist until
  // Task 7 of this PR. When it lands, its refetch belongs in this list.
  const [cloudDelete, { loading: cloudDeleteLoading }] =
    useDeleteLocationMutationGql({
      refetchQueries: [{ query: GetLocationsDocument }],
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
        cloudDelete({ variables: { id } }).then((r) => r.data?.deleteLocation),
      isPending: cloudDeleteLoading,
    }
  }

  return localMutation
}

export function useReorderLocations() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (orderedIds: string[]) => reorderLocations(orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
  })

  // `reorderLocations` returns `[Location!]!` — NOT `Boolean`, as
  // `reorderShelves` does — so the freshly ordered list is already in hand.
  // Write it straight into the `GetLocations` result instead of paying a
  // refetch to re-read what the mutation just returned. This is the cloud
  // equivalent of the local `invalidateQueries(['locations'])`; a drag settles
  // in one round trip, which is what keeps reordering feeling immediate.
  const [cloudReorder, { loading: cloudReorderLoading }] =
    useReorderLocationsMutationGql({
      update: (cache, { data }) => {
        if (!data?.reorderLocations) return
        cache.writeQuery<GetLocationsQuery>({
          query: GetLocationsDocument,
          data: { locations: data.reorderLocations },
        })
      },
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
          (r) => r.data?.reorderLocations,
        ),
      isPending: cloudReorderLoading,
    }
  }

  return localMutation
}
