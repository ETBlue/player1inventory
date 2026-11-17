import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import {
  createLocation,
  deleteLocation,
  getLocations,
  reorderLocations,
  updateLocation,
} from '@/db/operations'
import {
  GetHouseholdLocationsDocument,
  type GetHouseholdLocationsQuery,
  GetLocationsDocument,
  type GetLocationsQuery,
  type LocationRole,
  useCreateLocationMutation as useCreateLocationMutationGql,
  useDeleteLocationMutation as useDeleteLocationMutationGql,
  useGetHouseholdLocationsQuery,
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
      // `&& !cloud.data` — with `cache-and-network` Apollo keeps
      // `loading: true` over cached data. Reporting that as loading puts a
      // spinner in front of a list the user can already read. See `useItems`.
      isLoading: cloud.loading && !cloud.data,
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

/**
 * A row of the settings locations list (households H5 task F.3).
 *
 * `myRole` is the caller's location role there; `null` means "No access".
 * `hasOrganizer` is false when nobody who still counts organizes it. Both are
 * cloud data; local mode fills them with `'organizer'` and `true`, and the
 * list shows no role there.
 */
export type SettingsLocation = Location & {
  myRole: LocationRole | null
  hasOrganizer: boolean
}

/**
 * The settings locations list (households H5 task F.3).
 *
 * Cloud: `householdLocations`. An owner or manager gets EVERY location of the
 * household, `myRole: null` where they have no role, so the list can show
 * "No access" and send every id to `reorderLocations` (the server refuses a
 * subset since task F.2). A household member gets the same list as
 * `useLocations()`. The switcher keeps `useLocations()`: it lists only
 * locations with a role.
 *
 * Local: `useLocations()`'s rows, each `'organizer'` with an organizer.
 *
 * The same fetch policy and `isLoading` / `isError` rules as `useLocations`.
 */
export function useHouseholdLocations(): {
  data: SettingsLocation[] | undefined
  isLoading: boolean
  isError: boolean
} {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const local = useLocations()

  const cloud = useGetHouseholdLocationsQuery({
    skip: !isCloud,
    fetchPolicy: 'cache-and-network',
  })

  if (isCloud) {
    return {
      data: cloud.data?.householdLocations.map((l) => ({
        // The query selects no dates; the list does not show them.
        ...deserializeLocation(l as Record<string, unknown>),
        myRole: l.myRole ?? null,
        hasOrganizer: l.hasOrganizer,
      })),
      isLoading: cloud.loading && !cloud.data,
      isError: !!cloud.error && !cloud.data,
    }
  }

  return {
    data: local.data?.map((l) => ({
      ...l,
      myRole: 'organizer' as const,
      hasOrganizer: true,
    })),
    isLoading: local.isLoading,
    isError: local.isError,
  }
}

/**
 * The settings list (`GetHouseholdLocations`) is refetched after a create,
 * a rename and a delete, by NAME, so only a mounted list asks the server.
 * These mutations run from the settings page, where it is mounted.
 */
const HOUSEHOLD_LOCATIONS_REFETCH = 'GetHouseholdLocations'

/** The two lists a refused reorder reloads, by name (only mounted ones ask). */
const LOCATION_LISTS_AFTER_REFUSAL = [
  HOUSEHOLD_LOCATIONS_REFETCH,
  'GetLocations',
] as const

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
      refetchQueries: [
        { query: GetLocationsDocument },
        HOUSEHOLD_LOCATIONS_REFETCH,
      ],
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
      refetchQueries: [
        { query: GetLocationsDocument },
        HOUSEHOLD_LOCATIONS_REFETCH,
      ],
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
  // Only the two location lists are refetched: `GetLocations`, and
  // `GetHouseholdLocations` by name (H5 task F.3). The server cascade DOES take the
  // location's carts and inventory logs — `Cart.locationId` and
  // `InventoryLog.locationId` both carry `onDelete: Cascade` since PR 3a — so
  // `AllCarts`, `AllCartItems` and `ItemLogs` observers can hold rows that are
  // already gone.
  //
  // **Those stale rows are not reachable, so they are not refetched.** This
  // comment claimed the opposite — "adding them to this refetch list is an open
  // gap" — until it was checked on 2026-10-07. Each of the three is narrowed by
  // location before anything renders it:
  //
  //   - `AllCarts` has exactly two readers, `useAllActiveCarts` and
  //     `useLastPurchasedByVendor` (both hooks/useShoppingCart.ts), and both
  //     filter to `activeLocationId` via `parseCartId`. The export/import paths
  //     read `ShoppingCarts`, not this query.
  //   - `AllCartItems` has one observer, `routes/shopping/index.tsx`. It groups
  //     by `cartId`, but `cartItemsMap` is built from `useAllActiveCarts()` —
  //     the already-narrowed list — so an entry whose `cartId` names a deleted
  //     location is never looked up. `lib/exportData.ts` and
  //     `lib/importData.ts` read it with `fetchPolicy: 'network-only'`, so they
  //     do not touch the cache at all.
  //   - `ItemLogs` is keyed by `{ itemId, locationId }`. Deleting the ACTIVE
  //     location moves `activeLocationId` (`useActiveLocation`), which changes
  //     the variables and fetches a different cache entry; deleting any other
  //     location leaves a stale entry nobody is viewing.
  //
  // **What would make it reachable** — the narrowing above is by LOCATION, and
  // that is the only reason this holds:
  //
  //   - any surface that reads `allCarts` / `allCartItems` WITHOUT filtering to
  //     the active location (a cross-location shopping summary), or `itemLogs`
  //     for a location other than the active one (an all-locations history, the
  //     way the Stock tab already pages stock across locations);
  //   - **households.** The design flags "a household switch must not show the
  //     previous household's cached data" — see
  //     `docs/global/permissions/2026-10-04-households-design.md`, which lives
  //     on branch `feature/households`. A switch changes the ACCOUNT, not the
  //     location, so a filter on `activeLocationId` does not catch it: while
  //     that id still names the previous household's location, both `allCarts`
  //     and `allCartItems` pass the filter and the previous household's cart
  //     renders. The protection here is incidental to location scoping and does
  //     not carry over.
  //
  // `PantryData` and `ItemStocksForItem` DO exist since Task 7 of this PR and
  // ARE invalidated by the cascade, but are deliberately left out: the only
  // rows the cascade deletes belong to the location being deleted, and once it
  // is gone nothing renders them. `PantryData` is keyed by `locationId`, so the
  // stale entry is the deleted location's own and is unreachable; the Stock-tab
  // pager pages over `useLocations()`, which this list does refetch, so a stale
  // `ItemStocksForItem` row for a deleted location has no page to render on.
  // Deleting the ACTIVE location additionally moves `activeLocationId` to the
  // first location in cloud, the default in local (`useActiveLocation`),
  // which changes `PantryData`'s variables and
  // fetches afresh. Recorded rather than assumed — if a surface ever reads
  // stock across locations without consulting the location list, its refetch
  // belongs here.
  const [cloudDelete, { loading: cloudDeleteLoading }] =
    useDeleteLocationMutationGql({
      refetchQueries: [
        { query: GetLocationsDocument },
        HOUSEHOLD_LOCATIONS_REFETCH,
      ],
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
  const [cloudReorder, { loading: cloudReorderLoading, client }] =
    useReorderLocationsMutationGql({
      update: (cache, { data }, { variables }) => {
        if (!data?.reorderLocations) return
        cache.writeQuery<GetLocationsQuery>({
          query: GetLocationsDocument,
          data: { locations: data.reorderLocations },
        })
        // The answer holds only the locations the caller has a role on, so it
        // cannot replace the settings list (`householdLocations`), which also
        // holds the "No access" rows. That list is put in the order that was
        // sent instead. The server accepts only the FULL list (task F.2), so
        // every cached row has its place.
        const settings = cache.readQuery<GetHouseholdLocationsQuery>({
          query: GetHouseholdLocationsDocument,
        })
        // `orderedIds` is `[ID!]!`, but the generated variables type allows
        // a single id too (GraphQL list coercion), so it is narrowed here.
        const sent = variables?.orderedIds
        const orderedIds = typeof sent === 'string' ? [sent] : sent
        if (!settings || !orderedIds) return
        const byId = new Map(settings.householdLocations.map((l) => [l.id, l]))
        const reordered = orderedIds.flatMap((id, order) => {
          const row = byId.get(id)
          return row ? [{ ...row, order }] : []
        })
        if (reordered.length !== settings.householdLocations.length) return
        cache.writeQuery<GetHouseholdLocationsQuery>({
          query: GetHouseholdLocationsDocument,
          data: { householdLocations: reordered },
        })
      },
    })

  // A refused reorder reloads both lists. Since H5 task F.2 the server refuses
  // any list that is not exactly the household's full set. So when another
  // member created or deleted a location while this tab's list was out of
  // date, the next drag would be refused again. The reload gives the next drag
  // the right set. Offline there is nothing to reload from, so it is skipped.
  const reloadAfterRefusal = (err: unknown) => {
    if (err instanceof OfflineWriteError) return
    client
      ?.refetchQueries({ include: [...LOCATION_LISTS_AFTER_REFUSAL] })
      // A failed reload leaves the old list; the next refusal tries again.
      .catch(() => {})
  }

  if (mode === 'cloud') {
    return {
      mutate: (
        orderedIds: string[],
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudReorder({ variables: { orderedIds } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            reloadAfterRefusal(err)
            options?.onError?.(err)
          },
        ),
      mutateAsync: (orderedIds: string[]) =>
        cloudReorder({ variables: { orderedIds } }).then(
          (r) => r.data?.reorderLocations,
          (err) => {
            reloadAfterRefusal(err)
            throw err
          },
        ),
      isPending: cloudReorderLoading,
    }
  }

  return localMutation
}
