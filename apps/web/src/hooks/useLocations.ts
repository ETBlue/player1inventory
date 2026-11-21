import { NetworkStatus } from '@apollo/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
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
import { hasGraphQLErrorCode } from '@/lib/graphqlErrorCode'
import { expectLocationLoss } from '@/lib/seenLocations'
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

  // `isFromServer`: `true` once the server has answered `GetLocations` in this
  // mount (households H5c task H.7, decision T45). Until then `data` can be
  // only the cache restored from IndexedDB, which can name a location the
  // person lost since their last visit. `ActiveLocationProvider` counts a
  // list as "seen" only when this is `true`.
  //
  // The rule: a `ready` status that comes right after `loading` or `refetch`
  // in this mount. That is the end of a network read of `GetLocations`, and
  // it answered.
  //
  // `ready` alone is not enough (measured on Apollo 4.1.6, review of H.7):
  // - with `cache-and-network` the first status is `loading` over the
  //   restored cache, and a FAILED first leg (offline) gives `error` (1 → 8)
  //   with the cached list still in `data`;
  // - after that `error`, a cache write by ANOTHER answer (for example
  //   `GetHouseholdLocations` writing `Location.myRole`) makes Apollo read
  //   the cache again (`reobserveCacheFirst`) and give `ready` (8 → 7) with
  //   the RESTORED list. That write is server data for the entity's fields,
  //   not for the `locations` list.
  // So a `ready` that follows `error` (or follows `ready`) does not count.
  //
  // If React ever skipped the render with `refetch` and went straight from
  // `error` to `ready`, the read would not count. That only costs a toast,
  // never shows a wrong one. The flag never goes back to `false`: a later
  // failed refetch keeps a list the server already sent.
  //
  // Refs written during render: `serverAnsweredRef` only goes from `false` to
  // `true`, and both refs record statuses Apollo really gave.
  const serverAnsweredRef = useRef(false)
  const lastStatusRef = useRef<NetworkStatus | undefined>(undefined)
  if (isCloud) {
    const before = lastStatusRef.current
    if (
      !!cloud.data &&
      cloud.networkStatus === NetworkStatus.ready &&
      (before === NetworkStatus.loading || before === NetworkStatus.refetch)
    ) {
      serverAnsweredRef.current = true
    }
    lastStatusRef.current = cloud.networkStatus
  }

  if (isCloud) {
    return {
      // `order` is the row's place in THIS list, not the cached field. Since
      // households H7b (decision T77) the server answers the caller's own
      // order, as a position in the list it returns. `GetLocations` and
      // `GetHouseholdLocations` share one normalized `Location` entity, and
      // their positions differ when the settings list holds "No access"
      // rows. A single `Location` from `createLocation`, `updateLocation` or
      // an import even carries the stored SHARED order. Each of these writes
      // `order` over the other in the cache. The array itself keeps the
      // order the server sent, so the index is always right for this list.
      data: cloud.data?.locations.map((l, index) => ({
        ...deserializeLocation(l as Record<string, unknown>),
        order: index,
      })),
      // `&& !cloud.data` — with `cache-and-network` Apollo keeps
      // `loading: true` over cached data. Reporting that as loading puts a
      // spinner in front of a list the user can already read. See `useItems`.
      isLoading: cloud.loading && !cloud.data,
      // Report an error only when there is nothing to show. Offline, the
      // `cache-and-network` network leg fails on every mount while `data`
      // still holds the cached locations; calling that an error would let a
      // consumer put an error state in front of a list the user can read.
      isError: !!cloud.error && !cloud.data,
      isFromServer: serverAnsweredRef.current,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
    // Local data is read from Dexie, the only source there is.
    isFromServer: true,
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
      data: cloud.data?.householdLocations.map((l, index) => ({
        // The query selects no `createdAt` / `updatedAt`; the list does not
        // show them.
        ...deserializeLocation(l as Record<string, unknown>),
        // The row's place in THIS list; see `useLocations` for why the
        // cached `order` field cannot be trusted (households H7b).
        order: index,
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

/** The caller's household role, reloaded after a `FORBIDDEN` reorder. */
const HOUSEHOLD_ROLE_REFETCH = 'GetHousehold'

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

  // The person deletes this location themselves, so its loss shows no
  // "You no longer have access" toast (households H5c task H.7, review). The
  // mark is set BEFORE the write. The `GetLocations` read in `refetchQueries`
  // starts when the server answers, and `awaitRefetchQueries` is off, so it
  // can land before or after the mutation's promise resolves; marking first
  // covers both. A refused delete takes the mark back, so a later removal by
  // someone else still shows the toast.
  const deleteExpectingLoss = (id: string) => {
    const takeBack = expectLocationLoss([id])
    return cloudDelete({ variables: { id } }).catch((err: unknown) => {
      takeBack()
      throw err
    })
  }

  if (mode === 'cloud') {
    return {
      mutate: (
        id: string,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        deleteExpectingLoss(id).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (id: string) =>
        deleteExpectingLoss(id).then((r) => r.data?.deleteLocation),
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

  // A refused reorder reloads only what can explain the refusal:
  //
  // - `BAD_USER_INPUT`: both location lists. The server refuses a list that
  //   is not exactly the caller's settings list (H5 task F.2, and per person
  //   since households H7b, decision T78). Another member created or
  //   deleted a location while this tab's list was out of date. The reload
  //   gives the next drag the right set.
  // - `FORBIDDEN`: both location lists AND the household role
  //   (`GetHousehold`). Since H7b every household role may reorder its own
  //   list, so `FORBIDDEN` means the list held an id that is not in the
  //   caller's settings list any more: they lost a role on a location, or
  //   their household role went down and the "No access" rows left their
  //   list. (Until H7b it meant "no longer an owner or manager", and only
  //   the role was reloaded.)
  // - offline (`OfflineWriteError`), a network error, anything else: nothing.
  //   The lists are not wrong, and offline there is nothing to reload from.
  //   An `OfflineWriteError` carries no GraphQL code, so it needs no check of
  //   its own here.
  //
  // `mutate` and `mutateAsync` both use it. Only the settings page calls the
  // hook today, through `mutate`; the hook tests call `mutateAsync`.
  const reloadAfterRefusal = (err: unknown) => {
    const include = hasGraphQLErrorCode(err, 'BAD_USER_INPUT')
      ? [...LOCATION_LISTS_AFTER_REFUSAL]
      : hasGraphQLErrorCode(err, 'FORBIDDEN')
        ? [...LOCATION_LISTS_AFTER_REFUSAL, HOUSEHOLD_ROLE_REFETCH]
        : null
    if (!include) return
    client
      ?.refetchQueries({ include })
      // A failed reload leaves the old data; the next refusal tries again.
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
