import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UnitSwitchBatchInput } from '@/db/operations'
import {
  addItemToLocation,
  applyUnitSwitchBatch,
  createItem,
  deleteItem,
  getAllItems,
  getCartItemCountByItem,
  getInventoryLogCountByItem,
  getItem,
  getLastPurchaseDate,
  getStockedItems,
  removeItemFromLocation,
  updateItem,
} from '@/db/operations'
import type { CreateItemInput, UpdateItemInput } from '@/generated/graphql'
import {
  GetItemsDocument,
  GetRecipesDocument,
  ItemCountByTagDocument,
  ItemCountByVendorDocument,
  useCreateItemMutation,
  useDeleteItemMutation,
  useGetItemQuery,
  useGetItemsQuery,
  useLastPurchaseDatesQuery,
  useUpdateItemMutation,
} from '@/generated/graphql'
import { deserializeItem } from '@/lib/deserialization'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { Item, StockFields } from '@/types'
import { useActiveLocation } from './useActiveLocation'
import { useDataMode } from './useDataMode'

// In local mode, item create/update accept the global Item fields plus stock
// fields (split into the active-location ItemStock by the operations layer).
//
// `consumeAmount` is optional here even though it is required on an `Item`,
// mirroring the operations layer's own `CreateItemInput`: no interactive create
// path supplies it, so the single default (0, in both `db/operations.ts` and the
// cloud `createItem` resolver) decides it. GraphQL's `CreateItemInput` already
// has it optional, so the cloud branch needs no change.
type ItemMutationInput = Omit<
  Item,
  'id' | 'createdAt' | 'updatedAt' | 'consumeAmount'
> &
  Partial<Pick<Item, 'consumeAmount'>> &
  Partial<StockFields>

// Map frontend Item (without id/timestamps) to the GraphQL CreateItemInput shape.
// Converts dueDate from Date to ISO string; passes all other fields through.
function toCreateItemInput(input: ItemMutationInput): CreateItemInput {
  const { dueDate, ...rest } = input
  return {
    ...rest,
    dueDate: dueDate instanceof Date ? dueDate.toISOString() : null,
  } as CreateItemInput
}

// Map frontend Item partial to the GraphQL UpdateItemInput shape.
// Strips non-updatable fields and converts dueDate from Date to ISO string.
//
// Semantics:
//   - Field absent from `updates` → omitted from output → server leaves it alone
//   - Field present with undefined/null value → sent as null → server clears it
//
// This means partial updates (quantity buttons, tag assignment, etc.) safely
// omit expiration and measurement fields, leaving them untouched in the database.
// The full ItemForm explicitly sets these fields (to a value or undefined) so
// it still controls their DB state.
export function toUpdateItemInput(
  updates: Partial<Item> & Partial<StockFields>,
): UpdateItemInput {
  const { id: _id, createdAt: _c, updatedAt: _u, dueDate, ...rest } = updates
  return {
    // Non-clearable fields (name, tagIds, quantities, etc.) pass through unchanged.
    // Guard assignments below MUST come after ...rest — they coerce optional fields that
    // rest may have written as undefined into explicit null, which the server reads as
    // an instruction to clear the field.
    ...rest,
    ...('packageUnit' in rest && { packageUnit: rest.packageUnit ?? null }),
    ...('measurementUnit' in rest && {
      measurementUnit: rest.measurementUnit ?? null,
    }),
    ...('amountPerPackage' in rest && {
      amountPerPackage: rest.amountPerPackage ?? null,
    }),
    ...('estimatedDueDays' in rest && {
      estimatedDueDays: rest.estimatedDueDays ?? null,
    }),
    ...('expirationThreshold' in rest && {
      expirationThreshold: rest.expirationThreshold ?? null,
    }),
    ...('expirationMode' in rest && {
      expirationMode: rest.expirationMode ?? null,
    }),
    ...('dueDate' in updates && {
      dueDate: dueDate instanceof Date ? dueDate.toISOString() : null,
    }),
  }
}

export function useItems() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  const local = useQuery({
    queryKey: ['items', { locationId: activeLocationId }],
    queryFn: () => getAllItems(activeLocationId),
    enabled: !isCloud,
  })

  const cloud = useGetItemsQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.items.map((i) =>
        deserializeItem(i as Record<string, unknown>),
      ),
      isLoading: cloud.loading,
      isFetching: cloud.networkStatus < 7, // 7 = NetworkStatus.ready
      isError: !!cloud.error,
      refetch: cloud.refetch,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isFetching: local.isFetching,
    isError: local.isError,
    refetch: local.refetch,
  }
}

// Items stocked in the active location (have an ItemStock row there), joined
// with that location's stock. This is the pantry's data source — items not
// stocked in the active location are absent. Switching the active location
// re-scopes the result (activeLocationId is part of the query key).
//
// Cloud mode: ItemStock has no GraphQL backend yet, so this falls back to the
// full cloud item list (cloud TODO: per-location stock + catalog).
export function useStockedItems() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  const local = useQuery({
    queryKey: ['items', 'stocked', { locationId: activeLocationId }],
    queryFn: () => getStockedItems(activeLocationId),
    enabled: !isCloud,
  })

  const cloud = useGetItemsQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.items.map((i) =>
        deserializeItem(i as Record<string, unknown>),
      ),
      isLoading: cloud.loading,
      isFetching: cloud.networkStatus < 7, // 7 = NetworkStatus.ready
      isError: !!cloud.error,
      refetch: cloud.refetch,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isFetching: local.isFetching,
    isError: local.isError,
    refetch: local.refetch,
  }
}

export function useItem(id: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  const local = useQuery({
    queryKey: ['items', id, { locationId: activeLocationId }],
    queryFn: () => getItem(id, activeLocationId),
    enabled: !!id && !isCloud,
  })

  const cloud = useGetItemQuery({ variables: { id }, skip: !isCloud || !id })

  if (isCloud) {
    return {
      data: cloud.data?.item
        ? deserializeItem(cloud.data.item as Record<string, unknown>)
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
  const { activeLocationId } = useActiveLocation()
  const itemQuery = useItem(id)
  const lastPurchaseQuery = useQuery({
    queryKey: ['items', id, 'lastPurchase', { locationId: activeLocationId }],
    queryFn: () => getLastPurchaseDate(id, activeLocationId),
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
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  // Cloud: use Apollo batch query (local logs are stale in cloud mode)
  const { data: cloudData, loading: cloudLoading } = useLastPurchaseDatesQuery({
    variables: { itemIds: [itemId] },
    skip: !isCloud || !itemId,
  })
  const cloudDate = cloudData?.lastPurchaseDates.find(
    (r) => r.itemId === itemId,
  )?.date

  // Local: TanStack Query + Dexie, scoped to the active location
  const localQuery = useQuery({
    queryKey: [
      'items',
      itemId,
      'lastPurchase',
      { locationId: activeLocationId },
    ],
    queryFn: () => getLastPurchaseDate(itemId, activeLocationId),
    enabled: !isCloud && !!itemId,
  })

  if (isCloud) {
    return {
      data: cloudDate ? new Date(cloudDate) : undefined,
      isLoading: cloudLoading,
      isError: false,
    }
  }

  return localQuery
}

/**
 * @param options.catalogOnly Create the item in the global catalog only,
 * without writing an `ItemStock` in the active location. Opt-in — omitting it
 * keeps the historic behaviour (stock the new item here), which is what the
 * pantry's Add flow needs. Only the Settings assignment tabs pass `true`.
 * No-op in cloud mode, which has no `ItemStock` backend.
 */
export function useCreateItem(options?: { catalogOnly?: boolean }) {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { activeLocationId } = useActiveLocation()
  const catalogOnly = options?.catalogOnly ?? false

  const localMutation = useMutation({
    mutationFn: (input: ItemMutationInput) =>
      createItem(input, activeLocationId, { catalogOnly }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })

  const [cloudCreate, { loading: cloudCreateLoading }] = useCreateItemMutation({
    refetchQueries: [{ query: GetItemsDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        input: ItemMutationInput,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCreate({ variables: { input: toCreateItemInput(input) } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (input: ItemMutationInput) =>
        cloudCreate({ variables: { input: toCreateItemInput(input) } }).then(
          (r) => r.data?.createItem,
        ),
      isPending: cloudCreateLoading,
    }
  }

  return localMutation
}

// Both location mutations below are Dexie-only: cloud mode has no locations and
// no ItemStock backend (deferred in PR D), so running them there would write to
// local rows the cloud UI never reads and report success for something that did
// not happen. They throw instead of no-op'ing so a wiring mistake fails loudly
// in dev rather than silently — false success is exactly the PR D trap. This is
// a safety net under the component-level `mode === 'local'` guard (the
// NewItemDialog pattern), not a replacement for it.
const LOCAL_ONLY_LOCATION_MUTATION =
  'Location stock mutations are local-mode only: cloud mode has no locations or ItemStock.'

type AddToLocationVars = {
  itemId: string
  // The Stock-tab pager adds to the location on the page being viewed, which
  // is not necessarily the active one; defaults to the active location.
  locationId?: string
}

// Stock an existing global item in a location via copy-on-add (inherits all
// stock fields except packed/unpacked → 0). No-op if the item is already
// stocked there. Local-first only — ItemStock has no cloud backend yet.
export function useAddItemToLocation() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { activeLocationId } = useActiveLocation()

  return useMutation({
    mutationFn: ({ itemId, locationId }: AddToLocationVars) => {
      if (mode !== 'local') throw new Error(LOCAL_ONLY_LOCATION_MUTATION)
      return addItemToLocation(itemId, locationId ?? activeLocationId)
    },
    // RETURNED, not fire-and-forget, for the same reason as `useUpdateItem`
    // below: `mutateAsync` awaits what `onSuccess` returns, and the search
    // tail's bucket-3 "Add to <location>" action re-enables every row in a
    // `finally` after that await (`useItemSearchTailWiring`). Without this the
    // row re-enables while the just-stocked item is still absent from the
    // refetched lists, so it has not yet been promoted out of bucket 3.
    // `['items']` covers every `['items', …]` key by PREFIX; `['itemStocks']`
    // is a separate family.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['itemStocks'] }),
      ]),
  })
}

type RemoveFromLocationVars = {
  itemId: string
  // The Stock-tab pager removes from the location on the page being viewed,
  // which is not necessarily the active one; defaults to the active location.
  locationId?: string
}

// Un-stock an item from a location, cascading that location's inventory logs
// and cart entries (see `removeItemFromLocation`). The global Item survives, so
// the item stays in the Add combobox catalog and can be re-added.
//
// Invalidates every query family the cascade touches so removing from the
// ACTIVE location leaves the UI consistent without a reload: `['items']` (the
// pantry `getStockedItems` list, single-item reads and the item's logs, which
// are keyed `['items', id, 'logs', …]`), `['itemStocks']`, `['cart']` (the
// deleted cart entries) and `['sort']` (expiry/purchase dates derived from the
// deleted logs).
//
// Local-first only, and it refuses to run in cloud mode (see
// LOCAL_ONLY_LOCATION_MUTATION above). This one is destructive and
// irreversible — it deletes every inventory log for the pair — so a stray
// cloud-mode call would silently destroy local history the cloud UI never
// shows.
export function useRemoveItemFromLocation() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { activeLocationId } = useActiveLocation()

  return useMutation({
    mutationFn: ({ itemId, locationId }: RemoveFromLocationVars) => {
      if (mode !== 'local') throw new Error(LOCAL_ONLY_LOCATION_MUTATION)
      return removeItemFromLocation(itemId, locationId ?? activeLocationId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['itemStocks'] })
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      queryClient.invalidateQueries({ queryKey: ['sort'] })
      // The two per-item counts the cascade changes. No UI consumer today, but
      // Task 2's confirmation dialog is specified to name what gets deleted.
      queryClient.invalidateQueries({ queryKey: ['inventoryLogs'] })
      queryClient.invalidateQueries({ queryKey: ['cartItems'] })
    },
  })
}

type ItemUpdateVars = {
  id: string
  updates: Partial<Item> & Partial<StockFields>
  // Local mode only: which location's ItemStock the stock fields are written
  // to. The Stock-tab pager saves to the location on the page being viewed;
  // everything else omits it and writes to the active location. Cloud mode
  // ignores it — cloud items carry inline stock and have no locations.
  locationId?: string
}

export function useUpdateItem() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { activeLocationId } = useActiveLocation()

  const localMutation = useMutation({
    mutationFn: ({ id, updates, locationId }: ItemUpdateVars) =>
      updateItem(id, updates, locationId ?? activeLocationId),
    // RETURNED, not fire-and-forget: `mutateAsync` awaits what `onSuccess`
    // returns, so returning the invalidations makes the caller's `await`
    // resolve only once both refetches have landed. The search tail's group
    // action re-enables every row in a `finally` after that await
    // (`useItemSearchTailWiring`) while appending to an `item.vendorIds` array
    // captured from the render closure — re-enabling against a stale array
    // drops one of two quick presses.
    //
    // Two keys, not six: invalidation matches by PREFIX, so `['items']`
    // already covers `['items', id]`, the two count keys, and BOTH item list
    // queries — `useItems` (`['items', {locationId}]`) and `useStockedItems`
    // (`['items', 'stocked', {locationId}]`). `['itemStocks']` is a separate
    // family and must be awaited alongside: stock fields are written to an
    // ItemStock row, which the raw-stock readers (`useItemStock` /
    // `useItemStocks`, behind the Stock pager) read back.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['itemStocks'] }),
      ]),
  })

  const [cloudUpdate, { loading: cloudUpdateLoading }] = useUpdateItemMutation({
    refetchQueries: [{ query: GetItemsDocument }],
  })

  if (mode === 'cloud') {
    // Cloud mode: serializes updates to GraphQL input via toUpdateItemInput().
    // Absent fields are omitted (server leaves them alone); fields present
    // with undefined/null are sent as null (server clears them).
    return {
      mutate: (
        { id, updates }: ItemUpdateVars,
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
      mutateAsync: ({ id, updates }: ItemUpdateVars) =>
        cloudUpdate({
          variables: { id, input: toUpdateItemInput(updates) },
        }).then((r) => r.data?.updateItem),
      isPending: cloudUpdateLoading,
    }
  }

  return localMutation
}

// Commit a unit switch — the Item's configuration, every location's converted
// quantities, and every recipe amount expressed in the old unit — as ONE Dexie
// transaction (`applyUnitSwitchBatch`). Doing it as 1 + N + M separate
// mutations can leave the item on the new unit while some rows still hold
// old-unit numbers.
//
// Local-mode only, like the other location-aware mutations: cloud has no
// Location or ItemStock, and Apollo has no client-side transaction to borrow.
// The Info tab keeps its sequential path there rather than fake atomicity.
export function useApplyUnitSwitch() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { activeLocationId } = useActiveLocation()

  return useMutation({
    mutationFn: (input: UnitSwitchBatchInput) => {
      if (mode !== 'local') throw new Error(LOCAL_ONLY_LOCATION_MUTATION)
      return applyUnitSwitchBatch({
        ...input,
        locationId: input.locationId ?? activeLocationId,
      })
    },
    // One pass over every family the transaction touched. Listed in full rather
    // than relying on prefix matching so a reader can see the coverage: missing
    // one shows up as a stale screen after a successful save, not as an error.
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['items', itemId] })
      queryClient.invalidateQueries({ queryKey: ['items', 'countByTag'] })
      queryClient.invalidateQueries({ queryKey: ['items', 'countByVendor'] })
      queryClient.invalidateQueries({ queryKey: ['itemStocks'] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      queryClient.invalidateQueries({ queryKey: ['recipes', 'itemCount'] })
    },
  })
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

  const [cloudDelete, { loading: cloudDeleteLoading }] = useDeleteItemMutation()

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
      isPending: cloudDeleteLoading,
    }
  }

  return localMutation
}

// Both counts accept an optional locationId that scopes them to the rows
// `removeItemFromLocation` would delete for that (item, location) pair — the
// Stock tab's remove confirmation names one location, so an item-global count
// would over-report. Omitting it keeps the item-global count. The location is
// part of the query key so the two scopes never share a cache entry; the
// remove mutation invalidates the whole `['inventoryLogs']` / `['cartItems']`
// families, so both re-resolve after a removal.
export function useInventoryLogCountByItem(
  itemId: string,
  locationId?: string,
) {
  return useQuery({
    queryKey: ['inventoryLogs', 'countByItem', itemId, { locationId }],
    queryFn: () => getInventoryLogCountByItem(itemId, locationId),
    enabled: !!itemId,
  })
}

export function useCartItemCountByItem(itemId: string, locationId?: string) {
  return useQuery({
    queryKey: ['cartItems', 'countByItem', itemId, { locationId }],
    queryFn: () => getCartItemCountByItem(itemId, locationId),
    enabled: !!itemId,
  })
}
