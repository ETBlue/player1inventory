import type { ApolloCache } from '@apollo/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
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
import type {
  CreateItemInput,
  ItemStockInput,
  PantryDataQuery,
  UpdateItemInput,
} from '@/generated/graphql'
import {
  GetItemsDocument,
  GetRecipesDocument,
  ItemCountByTagDocument,
  ItemCountByVendorDocument,
  useAddItemToLocationMutation,
  useCreateItemMutation,
  useDeleteItemMutation,
  useGetItemQuery,
  useItemStocksForItemQuery,
  useLastPurchaseDatesQuery,
  usePantryDataQuery,
  useRemoveItemFromLocationMutation,
  useUpdateItemMutation,
  useUpsertItemStockMutation,
} from '@/generated/graphql'
import { deserializeItem, deserializeItemStock } from '@/lib/deserialization'
import {
  joinItemStock,
  pickStockFields,
  STOCK_FIELD_KEYS,
  stripStockFields,
} from '@/lib/itemStock'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { Item, ItemStock, PantryItem, StockFields } from '@/types'
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

// The five per-location state fields, as the cloud `ItemStockInput` wants them.
//
// Cloud mode routes these to `upsertItemStock(itemId, locationId)` instead of
// leaving them inline on `updateItem`, so the write lands where PR 2's reads
// come from. Mirrors `pickStockFields`, with two deliberate differences:
//
//   - only keys PRESENT in `updates` are emitted. The server's `toData` merges
//     rather than replaces, so an absent key means "leave it alone"; zeroing
//     the four quantities the way `pickStockFields` does would turn a tag edit
//     into a stock wipe.
//   - `dueDate` is emitted whenever the KEY is present, even when the value is
//     undefined, because that is how the form clears an expiry. The server
//     tests `'dueDate' in input`, so a present-but-null value clears the date
//     and an absent key preserves it.
export function toStockInput(
  updates: Partial<Item> & Partial<StockFields>,
): ItemStockInput {
  const { dueDate } = updates
  return {
    ...('targetQuantity' in updates && {
      targetQuantity: updates.targetQuantity,
    }),
    ...('refillThreshold' in updates && {
      refillThreshold: updates.refillThreshold,
    }),
    ...('packedQuantity' in updates && {
      packedQuantity: updates.packedQuantity,
    }),
    ...('unpackedQuantity' in updates && {
      unpackedQuantity: updates.unpackedQuantity,
    }),
    ...('dueDate' in updates && {
      dueDate: dueDate instanceof Date ? dueDate.toISOString() : null,
    }),
  }
}

// The new item's opening stock row. Unlike `toStockInput` this fills the four
// quantities in whether or not the caller supplied them: a create has no
// existing row whose values an absent key could preserve, and `pickStockFields`
// already defaults them to `ZERO_STOCK` — the same values `db/operations.ts`'s
// `createItem` writes.
function toCreateStockInput(input: ItemMutationInput): ItemStockInput {
  const fields = pickStockFields(input as unknown as Record<string, unknown>)
  return {
    targetQuantity: fields.targetQuantity,
    refillThreshold: fields.refillThreshold,
    packedQuantity: fields.packedQuantity,
    unpackedQuantity: fields.unpackedQuantity,
    ...(fields.dueDate instanceof Date
      ? { dueDate: fields.dueDate.toISOString() }
      : {}),
  }
}

// Does this update touch per-location state at all? Used to skip the stock
// mutation entirely for a pure configuration edit (a rename, a tag change),
// which must not create an ItemStock row where none existed.
function touchesStock(updates: Partial<Item> & Partial<StockFields>): boolean {
  return STOCK_FIELD_KEYS.some((key) => key in updates)
}

// The same input with every stock key removed, so `updateItem` receives only
// the global Item's own fields. Until PR 5 the cloud `Item` still HAS those
// five columns, and the server still dual-writes anything it receives in them
// — sending them here as well as to `upsertItemStock` would be two writers for
// one value.
function toConfigInput(
  updates: Partial<Item> & Partial<StockFields>,
): UpdateItemInput {
  const input = toUpdateItemInput(updates) as Record<string, unknown>
  for (const key of STOCK_FIELD_KEYS) delete input[key]
  return input as UpdateItemInput
}

// One `PantryData` result -> the pantry's PantryItem list.
//
// `PantryData` asks for the global catalog and the ACTIVE LOCATION's stock rows
// in a single operation, so the join below costs no extra round trip. The join
// itself is `joinItemStock` — the very same function the Dexie path calls, not
// a cloud copy of it (that is why it was moved to `lib/itemStock.ts`).
//
// The cloud `Item` still declares the five stock STATE fields until PR 5, so
// each row goes through `stripStockFields` FIRST. Without it the item's own
// inline `dueDate` would survive the join for an item that has no row here —
// `ZERO_STOCK` carries no `dueDate` key to overwrite it with — and an item
// stocked nowhere near this location would still render an expiry.
//
// `stockedOnly` selects the two consumers: the pantry's "stocked here" list
// (`useStockedItems`) keeps only items with a row in this location, while the
// full catalog (`useItems`) keeps every item and lets the ones with no row here
// come back with `stockId: undefined` and zeroed quantities — exactly the shape
// local mode produces, which is what lets `isStockedHere` work in both modes.
function joinPantryData(
  data: PantryDataQuery | undefined,
  locationId: string,
  stockedOnly: boolean,
): PantryItem[] | undefined {
  if (!data) return undefined
  const stockByItemId = new Map<string, ItemStock>(
    data.itemStocks.map((stock) => [
      stock.itemId,
      deserializeItemStock(stock as Record<string, unknown>),
    ]),
  )
  const items = stockedOnly
    ? data.items.filter((item) => stockByItemId.has(item.id))
    : data.items
  return items.map((item) =>
    joinItemStock(
      stripStockFields(deserializeItem(item as Record<string, unknown>)),
      stockByItemId.get(item.id),
      locationId,
    ),
  )
}

// The whole item catalog, each entry joined with the active location's stock.
// Items not stocked here are PRESENT, with `stockId: undefined` — the search
// tail's third bucket ("exists globally, not stocked here") is built from that
// difference, so this list must not be filtered.
export function useItems() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  const local = useQuery({
    queryKey: ['items', { locationId: activeLocationId }],
    queryFn: () => getAllItems(activeLocationId),
    enabled: !isCloud,
  })

  const cloud = usePantryDataQuery({
    variables: { locationId: activeLocationId },
    skip: !isCloud,
  })

  const cloudData = useMemo(
    () => joinPantryData(cloud.data, activeLocationId, false),
    [cloud.data, activeLocationId],
  )

  if (isCloud) {
    return {
      data: cloudData,
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
// re-scopes the result: it is part of the query key in local mode, and a query
// VARIABLE in cloud mode.
//
// Cloud mode derives this from the SAME `PantryData` result `useItems` reads,
// filtered to the items that have a row in `itemStocks`. It deliberately issues
// no second request — Apollo serves both hooks from the one result.
export function useStockedItems() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  const local = useQuery({
    queryKey: ['items', 'stocked', { locationId: activeLocationId }],
    queryFn: () => getStockedItems(activeLocationId),
    enabled: !isCloud,
  })

  const cloud = usePantryDataQuery({
    variables: { locationId: activeLocationId },
    skip: !isCloud,
  })

  const cloudData = useMemo(
    () => joinPantryData(cloud.data, activeLocationId, true),
    [cloud.data, activeLocationId],
  )

  if (isCloud) {
    return {
      data: cloudData,
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

// One item, joined with the active location's stock.
//
// Cloud pairs `GetItem` with `ItemStocksForItem` rather than reusing
// `PantryData`, and the choice is between two costs. `PantryData` would be a
// cache hit when the user arrived from the pantry, but a cold deep link to
// /items/$id would pull the entire catalog to render one row. These two ask
// only for what the page shows, and `ItemStocksForItem` is the query the Stock
// tab's all-locations pager reads as well — so the pager shares this exact
// cache entry instead of adding a request of its own. Switching the active
// location then costs no request at all: every location's row is already here
// and the active one is picked out of the set.
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
  const cloudStocks = useItemStocksForItemQuery({
    variables: { itemId: id },
    skip: !isCloud || !id,
  })

  const cloudData = useMemo(() => {
    const raw = cloud.data?.item
    if (!raw) return undefined
    const stock = cloudStocks.data?.itemStocksForItem.find(
      (row) => row.locationId === activeLocationId,
    )
    return joinItemStock(
      stripStockFields(deserializeItem(raw as Record<string, unknown>)),
      stock
        ? deserializeItemStock(stock as Record<string, unknown>)
        : undefined,
      activeLocationId,
    )
  }, [cloud.data, cloudStocks.data, activeLocationId])

  if (isCloud) {
    return {
      data: cloudData,
      isLoading: cloud.loading || cloudStocks.loading,
      isError: !!cloud.error || !!cloudStocks.error,
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
 * Honoured in BOTH modes: cloud follows the create with an
 * `upsertItemStock` in the active location unless this is set.
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

  // The second half of a cloud create: the new item's ItemStock in the active
  // location. `GetItems` alone would not refresh the pantry — `itemStocks` is
  // a different root field — so this one carries the stock-list refetches, the
  // same pair `useAddItemToLocation` uses.
  const [cloudStockNewItem, { loading: cloudStockLoading }] =
    useUpsertItemStockMutation({
      update: (cache) => evictStockLists(cache),
      refetchQueries: STOCK_LIST_QUERIES,
      awaitRefetchQueries: true,
    })

  if (mode === 'cloud') {
    // Create, then stock — the same two steps `db/operations.ts`'s `createItem`
    // takes, in the same order, honouring the same `catalogOnly` opt-out.
    // `pickStockFields` (not `toStockInput`) because a brand-new row genuinely
    // starts at zero for anything the form did not supply; there is no existing
    // row whose values an absent key should preserve.
    const runCloudCreate = async (input: ItemMutationInput) => {
      const created = (
        await cloudCreate({ variables: { input: toCreateItemInput(input) } })
      ).data?.createItem
      if (!created) return undefined
      // Stripped, for the same reason the PantryData join strips: until PR 5
      // the cloud `Item` still carries the five state columns, and leaving them
      // on would let the Item's inline values show through the join.
      const item = stripStockFields(
        deserializeItem(created as Record<string, unknown>),
      )
      if (catalogOnly) return joinItemStock(item, undefined, activeLocationId)

      const stockRow = (
        await cloudStockNewItem({
          variables: {
            itemId: created.id,
            locationId: activeLocationId,
            input: toCreateStockInput(input),
          },
        })
      ).data?.upsertItemStock
      // Joined, so callers reading `stockId` / the stock fields off the result
      // (NewItemDialog's `onSuccess`, and through it the recipe-items dialog)
      // see the row that was just written rather than the Item's inline
      // columns, which PR 5 removes.
      return joinItemStock(
        item,
        stockRow
          ? deserializeItemStock(stockRow as Record<string, unknown>)
          : undefined,
        activeLocationId,
      )
    }

    return {
      mutate: (
        input: ItemMutationInput,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        runCloudCreate(input).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: runCloudCreate,
      isPending: cloudCreateLoading || cloudStockLoading,
    }
  }

  return localMutation
}

// What both cloud location mutations do about the cache, in one place.
//
// The mutation result is a normalized `ItemStock` entity, and that can never
// teach Apollo that the `itemStocks(locationId:)` / `itemStocksForItem(itemId:)`
// ROOT FIELDS gained or lost an entry — the same reasoning `useCreateLocation`
// records for `Query.locations`. So:
//
//   `update` evicts both root fields, covering the lists that are NOT mounted.
//   The Stock tab can stock an item while the pantry is off screen; without the
//   eviction the pantry's next mount would be served the pre-mutation list from
//   the cache under the default cache-first policy.
//
//   `refetchQueries` by NAME refills whatever IS mounted. Names rather than
//   `{ query, variables }` descriptors because both queries are variable-scoped
//   (a location id / an item id) and this hook cannot know every mounted
//   variant; `useCheckout` already refetches `'VendorCart'` the same way.
//   Apollo's query deduplication merges this with the refetch the eviction
//   itself triggers on those same observers.
//
//   `awaitRefetchQueries` so `mutateAsync` resolves only once the lists have
//   landed — the search tail's bucket-3 row re-enables in a `finally` after
//   that await, and the local branches return their invalidations from
//   `onSuccess` for exactly the same reason.
//
// `GetItems` is deliberately absent: an item's own row is untouched by stocking
// it somewhere. `PantryData` does have to be listed even though it shares
// `ROOT_QUERY.items` with `GetItems`, because `itemStocks` is a different root
// field that a `GetItems` refetch never reaches.
const STOCK_LIST_QUERIES = ['PantryData', 'ItemStocksForItem']

const CLOUD_ADD_RETURNED_NO_STOCK =
  'addItemToLocation resolved without an ItemStock — the item was not stocked.'

function evictStockLists(cache: ApolloCache) {
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'itemStocks' })
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'itemStocksForItem' })
  cache.gc()
}

type AddToLocationVars = {
  itemId: string
  // The Stock-tab pager adds to the location on the page being viewed, which
  // is not necessarily the active one; defaults to the active location.
  locationId?: string
}

// Stock an existing global item in a location via copy-on-add (inherits all
// stock fields except packed/unpacked -> 0). No-op if the item is already
// stocked there. Both modes: local writes the ItemStock row through Dexie,
// cloud sends `addItemToLocation`, whose resolver performs the same
// copy-on-add server-side.
export function useAddItemToLocation() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { activeLocationId } = useActiveLocation()

  const localMutation = useMutation({
    mutationFn: ({ itemId, locationId }: AddToLocationVars) =>
      addItemToLocation(itemId, locationId ?? activeLocationId),
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

  const [cloudAdd, { loading: cloudAddLoading }] = useAddItemToLocationMutation(
    {
      update: (cache) => evictStockLists(cache),
      refetchQueries: STOCK_LIST_QUERIES,
      awaitRefetchQueries: true,
    },
  )

  if (mode === 'cloud') {
    // `sourceLocationId` is left out, so the resolver copies from the item's
    // most recently updated row. The two modes' defaults are NOT identical:
    // local's parameter defaults to `DEFAULT_LOCATION_ID` and only falls back
    // to the most-recent row when the item is not stocked there. No call site
    // passes one in either mode, and nothing today depends on which row is
    // copied — the difference is recorded rather than papered over.
    //
    // The Stock-tab pager passes the location of the page being viewed as
    // `locationId`, exactly as in local mode.
    return {
      mutate: (
        { itemId, locationId }: AddToLocationVars,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudAdd({
          variables: { itemId, locationId: locationId ?? activeLocationId },
        }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      // Returns a deserialized `ItemStock`, the same type the local branch
      // resolves to — `NewItemDialog` reads the freshly copied row's fields off
      // it rather than off the stale pre-add item, and a union of "Dexie row |
      // wire row | undefined" would not let it. A resolved mutation with no row
      // is a broken response, not an empty result, so it throws.
      mutateAsync: ({ itemId, locationId }: AddToLocationVars) =>
        cloudAdd({
          variables: { itemId, locationId: locationId ?? activeLocationId },
        }).then((r) => {
          const row = r.data?.addItemToLocation
          if (!row) throw new Error(CLOUD_ADD_RETURNED_NO_STOCK)
          return deserializeItemStock(row as Record<string, unknown>)
        }),
      isPending: cloudAddLoading,
    }
  }

  return localMutation
}

type RemoveFromLocationVars = {
  itemId: string
  // The Stock-tab pager removes from the location on the page being viewed,
  // which is not necessarily the active one; defaults to the active location.
  locationId?: string
}

// Un-stock an item from a location. The global Item survives, so the item stays
// in the Add combobox catalog and can be re-added.
//
// The LOCAL branch also cascades that location's inventory logs and cart
// entries (see `removeItemFromLocation`), so it invalidates every query family
// the cascade touches and removing from the ACTIVE location leaves the UI
// consistent without a reload: `['items']` (the pantry `getStockedItems` list,
// single-item reads and the item's logs, which are keyed
// `['items', id, 'logs', ...]`), `['itemStocks']`, `['cart']` (the deleted cart
// entries) and `['sort']` (expiry/purchase dates derived from the deleted logs).
//
// The CLOUD branch has no cascade to mirror yet: `removeItemFromLocation`'s
// resolver deletes the stock row only, because cloud carts and inventory logs
// gain a `locationId` in PR 3. When they do, their queries belong in the
// refetch list next to the two stock lists.
export function useRemoveItemFromLocation() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { activeLocationId } = useActiveLocation()

  const localMutation = useMutation({
    mutationFn: ({ itemId, locationId }: RemoveFromLocationVars) =>
      removeItemFromLocation(itemId, locationId ?? activeLocationId),
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

  const [cloudRemove, { loading: cloudRemoveLoading }] =
    useRemoveItemFromLocationMutation({
      update: (cache) => evictStockLists(cache),
      refetchQueries: STOCK_LIST_QUERIES,
      awaitRefetchQueries: true,
    })

  if (mode === 'cloud') {
    return {
      mutate: (
        { itemId, locationId }: RemoveFromLocationVars,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudRemove({
          variables: { itemId, locationId: locationId ?? activeLocationId },
        }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      // Resolves to void, like the local branch: the resolver's `Boolean!` is
      // always `true` (it throws on failure), so returning it would invite a
      // caller to test a flag that can never be false.
      mutateAsync: async ({ itemId, locationId }: RemoveFromLocationVars) => {
        await cloudRemove({
          variables: { itemId, locationId: locationId ?? activeLocationId },
        })
      },
      isPending: cloudRemoveLoading,
    }
  }

  return localMutation
}

type ItemUpdateVars = {
  id: string
  updates: Partial<Item> & Partial<StockFields>
  // Which location's ItemStock the stock fields are written to, in BOTH modes.
  // The Stock-tab pager saves to the location on the page being viewed;
  // everything else omits it and writes to the active location.
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
    // Two keys, not the five this replaced: invalidation matches by PREFIX,
    // so `['items']` already covers `['items', id]`, the two count keys, and
    // BOTH item list queries — `useItems` (`['items', {locationId}]`) and
    // `useStockedItems` (`['items', 'stocked', {locationId}]`).
    // `['itemStocks']` is a separate family and must be awaited alongside:
    // stock fields are written to an ItemStock row, which the raw-stock
    // readers (`useItemStock` / `useItemStocks`, behind the Stock pager)
    // read back.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['itemStocks'] }),
      ]),
  })

  const [cloudUpdate, { loading: cloudUpdateLoading }] = useUpdateItemMutation({
    refetchQueries: [{ query: GetItemsDocument }],
  })

  // The stock half of a cloud update. Separate from `cloudUpdate` because the
  // two touch different root fields: `updateItem` changes `ROOT_QUERY.items`,
  // which `GetItems` and `PantryData` share, while `upsertItemStock` changes
  // `itemStocks` / `itemStocksForItem`, which a `GetItems` refetch never
  // reaches. Same cache handling as `useAddItemToLocation` — see the
  // STOCK_LIST_QUERIES comment for why an eviction AND a named refetch.
  const [cloudUpsertStock, { loading: cloudStockLoading }] =
    useUpsertItemStockMutation({
      update: (cache) => evictStockLists(cache),
      refetchQueries: STOCK_LIST_QUERIES,
      awaitRefetchQueries: true,
    })

  if (mode === 'cloud') {
    // Cloud mode splits the input the way local mode's `updateItem` does:
    // configuration fields go to the global Item, the five state fields go to
    // ONE location's ItemStock — `locationId` when the Stock-tab pager passes
    // one, the active location otherwise.
    //
    // Absent fields are omitted (server leaves them alone); fields present with
    // undefined/null are sent as null (server clears them).
    const runCloudUpdate = async ({
      id,
      updates,
      locationId,
    }: ItemUpdateVars) => {
      const config = toConfigInput(updates)
      // A pure stock edit (the quantity buttons, the Stock tab) sends no
      // `updateItem` at all, and a pure configuration edit (a rename, a tag
      // change) creates no ItemStock row where none existed.
      const itemResult =
        Object.keys(config).length > 0
          ? await cloudUpdate({ variables: { id, input: config } })
          : undefined
      if (touchesStock(updates)) {
        await cloudUpsertStock({
          variables: {
            itemId: id,
            locationId: locationId ?? activeLocationId,
            input: toStockInput(updates),
          },
        })
      }
      return itemResult?.data?.updateItem
    }

    return {
      mutate: (
        vars: ItemUpdateVars,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        runCloudUpdate(vars).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: runCloudUpdate,
      isPending: cloudUpdateLoading || cloudStockLoading,
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
// The LAST local-mode-only mutation in this file, and not for want of an
// ItemStock backend: the schema has no `applyUnitSwitch` mutation to call. The
// design names one as a requirement — it has to be a single server-side
// `prisma.$transaction`, since Apollo has no client-side transaction to borrow
// — but PR 1 did not ship it, so the Info tab keeps its sequential path in
// cloud rather than faking atomicity. It throws rather than no-op'ing so a
// wiring mistake fails loudly instead of reporting a switch that never happened.
const LOCAL_ONLY_UNIT_SWITCH =
  'applyUnitSwitch is local-mode only: the cloud schema has no transactional unit-switch mutation.'

export function useApplyUnitSwitch() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { activeLocationId } = useActiveLocation()

  return useMutation({
    mutationFn: (input: UnitSwitchBatchInput) => {
      if (mode !== 'local') throw new Error(LOCAL_ONLY_UNIT_SWITCH)
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
