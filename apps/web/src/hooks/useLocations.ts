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

  // `cache-and-network`, matching every other cloud list hook
  // (`useInventoryLogs`, `useRecipes`, `useShoppingCart`, `useTags`,
  // `useVendors`). Apollo's default is `cache-first`, and the cloud cache is
  // PERSISTED to IndexedDB and restored before React mounts
  // (`apollo/persistence.ts`, which has no TTL and no schema version). A
  // complete `ROOT_QUERY.locations` array in that snapshot satisfied
  // `cache-first` outright, so no `GetLocations` request was sent at all and a
  // location created on another device never appeared on this one. The three
  // mutations' `refetchQueries` only ever helped the device that made the
  // change.
  //
  // NO `errorPolicy` here, on purpose — measured, not assumed. With
  // `cache-and-network` the network leg runs on every mount, and offline it
  // fails. Under the DEFAULT policy (`'none'`) Apollo keeps serving the cached
  // result: `data` still holds the locations and only `error` is set. Setting
  // `errorPolicy: 'all'` does the opposite here — it moves the cached list into
  // `previousData` and leaves `data` undefined, which would empty the location
  // switcher and the settings list for an offline user whose cache is fine.
  // Pinned by "user offline still sees the cached locations and no error" in
  // `useLocations.test.tsx`.
  const cloud = useGetLocationsQuery({
    skip: !isCloud,
    fetchPolicy: 'cache-and-network',
  })

  if (isCloud) {
    return {
      data: cloud.data?.locations.map((l) =>
        deserializeLocation(l as Record<string, unknown>),
      ),
      isLoading: cloud.loading,
      // Report an error only when there is nothing to show. Offline, the
      // `cache-and-network` network leg fails on every mount while `data`
      // still holds the cached locations; calling that an error would let a
      // consumer put an error state in front of a list the user can read.
      isError: !!cloud.error && !cloud.data,
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
  // Only `GetLocations` is refetched. The server cascade DOES take the
  // location's carts and inventory logs — `Cart.locationId` and
  // `InventoryLog.locationId` both carry `onDelete: Cascade` since PR 3a — so
  // `AllCarts`, `AllCartItems` and `ItemLogs` observers can hold rows that are
  // already gone. Adding them to this refetch list is an open gap.
  //
  // `PantryData` and `ItemStocksForItem` DO exist since Task 7 of this PR and
  // ARE invalidated by the cascade, but are deliberately left out: the only
  // rows the cascade deletes belong to the location being deleted, and once it
  // is gone nothing renders them. `PantryData` is keyed by `locationId`, so the
  // stale entry is the deleted location's own and is unreachable; the Stock-tab
  // pager pages over `useLocations()`, which this list does refetch, so a stale
  // `ItemStocksForItem` row for a deleted location has no page to render on.
  // Deleting the ACTIVE location additionally moves `activeLocationId` to the
  // default (`useActiveLocation`), which changes `PantryData`'s variables and
  // fetches afresh. Recorded rather than assumed — if a surface ever reads
  // stock across locations without consulting the location list, its refetch
  // belongs here.
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
