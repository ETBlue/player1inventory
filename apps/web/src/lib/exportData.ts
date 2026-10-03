import type { ApolloClient } from '@apollo/client'
import { db } from '@/db'
import type {
  AllCartItemsQuery,
  AllItemStocksQuery,
  GetItemsQuery,
  GetLocationsQuery,
  GetRecipesQuery,
  GetShelvesQuery,
  GetTagsQuery,
  GetTagTypesQuery,
  GetVendorsQuery,
  InventoryLogsQuery,
  ShoppingCartsQuery,
} from '@/generated/graphql'
import {
  AllCartItemsDocument,
  AllItemStocksDocument,
  GetItemsDocument,
  GetLocationsDocument,
  GetRecipesDocument,
  GetShelvesDocument,
  GetTagsDocument,
  GetTagTypesDocument,
  GetVendorsDocument,
  InventoryLogsDocument,
  ShoppingCartsDocument,
} from '@/generated/graphql'
import {
  toCartItemInput,
  toInventoryLogInput,
  toItemInput,
  toItemStockInput,
  toLocationInput,
  toRecipeInput,
  toShelfInput,
  toShoppingCartInput,
  toTagInput,
  toTagTypeInput,
  toVendorInput,
} from './importData'

export interface ExportPayload {
  version: number
  exportedAt: string
  items: unknown[]
  tags: unknown[]
  tagTypes: unknown[]
  vendors: unknown[]
  recipes: unknown[]
  inventoryLogs: unknown[]
  shoppingCarts: unknown[]
  cartItems: unknown[]
  shelves: unknown[]
  // The v15 Item/ItemStock split: per-location stock state, and the locations
  // it points at. `fetchLocalPayload` has populated both since v15 and
  // `fetchCloudPayload` populates both as of cloud locations PR 4b, so today
  // only a PRE-v15 backup can be missing them. Still optional for exactly that
  // reason — an old file must stay importable.
  //
  // THE ABSENCE OF THESE TWO KEYS USED TO BE A SIGNAL, AND IS NOT ANY MORE.
  // Until PR 4b a cloud export carried neither, so three readers in
  // lib/importData.ts treated "no itemStocks" as "this is a cloud payload,
  // already flat":
  //
  //   - `upgradeLegacyPayload` (importData.ts:263) — PR 4b task 5 handles it
  //   - `flattenPayloadForCloud` (importData.ts:365) — deleted by PR 4b task 3
  //   - `resolveFlattenLocationId` (importData.ts:460) — deleted by task 3
  //
  // A cloud export now carries both, so absence means "pre-v15 file" and
  // nothing else. Do not reintroduce a sniff test on these keys.
  itemStocks?: unknown[]
  locations?: unknown[]
}

export function buildExportPayload(
  data: Omit<ExportPayload, 'version' | 'exportedAt'>,
): ExportPayload {
  return { version: 1, exportedAt: new Date().toISOString(), ...data }
}

/**
 * Strip Apollo/server-only fields (__typename, userId, familyId) from a cloud
 * export payload. Reuses the same mapper functions used on the import side so
 * the allowed field sets stay in sync.
 */
export function sanitiseCloudPayload(payload: ExportPayload): ExportPayload {
  return {
    ...payload,
    items: payload.items.map((i) => toItemInput(i as Record<string, unknown>)),
    tags: payload.tags.map((t) => toTagInput(t as Record<string, unknown>)),
    tagTypes: payload.tagTypes.map((t) =>
      toTagTypeInput(t as Record<string, unknown>),
    ),
    vendors: payload.vendors.map((v) =>
      toVendorInput(v as Record<string, unknown>),
    ),
    recipes: payload.recipes.map((r) =>
      toRecipeInput(r as Record<string, unknown>),
    ),
    inventoryLogs: payload.inventoryLogs.map((l) =>
      toInventoryLogInput(l as Record<string, unknown>),
    ),
    shoppingCarts: payload.shoppingCarts.map((c) =>
      toShoppingCartInput(c as Record<string, unknown>),
    ),
    cartItems: payload.cartItems.map((ci) =>
      toCartItemInput(ci as Record<string, unknown>),
    ),
    shelves: payload.shelves.map((s) =>
      toShelfInput(s as Record<string, unknown>),
    ),
    // Both keys are optional on `ExportPayload`, so a pre-v15 payload has
    // neither. Leave the key absent in that case rather than writing `[]` —
    // the import side still has to tell "no stock rows" from "an old file".
    ...(payload.itemStocks != null
      ? {
          itemStocks: payload.itemStocks.map((st) =>
            toItemStockInput(st as Record<string, unknown>),
          ),
        }
      : {}),
    ...(payload.locations != null
      ? {
          locations: payload.locations.map((l) =>
            toLocationInput(l as Record<string, unknown>),
          ),
        }
      : {}),
  }
}

export async function fetchLocalPayload(): Promise<ExportPayload> {
  const [
    items,
    tags,
    tagTypes,
    vendors,
    recipes,
    inventoryLogs,
    shoppingCarts,
    cartItems,
    shelves,
    itemStocks,
    locations,
  ] = await Promise.all([
    db.items.toArray(),
    db.tags.toArray(),
    db.tagTypes.toArray(),
    db.vendors.toArray(),
    db.recipes.toArray(),
    db.inventoryLogs.toArray(),
    db.shoppingCarts.toArray(),
    db.cartItems.toArray(),
    db.shelves.where('type').notEqual('system').toArray(),
    // v15 split: quantities, units and expiration live on ItemStock, one row
    // per (item × location) — without these the backup carries no stock at all.
    db.itemStocks.toArray(),
    db.locations.toArray(),
  ])

  // Permanent carts (v13+): every cart is exported. Scope cartItems to existing
  // carts so orphaned items (cartId pointing at a deleted cart) are dropped.
  const cartIds = new Set(shoppingCarts.map((c) => c.id))
  const exportedCartItems = cartItems.filter((ci) => cartIds.has(ci.cartId))

  return buildExportPayload({
    items,
    tags,
    tagTypes,
    vendors,
    recipes,
    inventoryLogs,
    shoppingCarts,
    cartItems: exportedCartItems,
    shelves,
    itemStocks,
    locations,
  })
}

export async function exportAllData(): Promise<void> {
  const payload = await fetchLocalPayload()
  triggerDownload(payload)
}

function triggerDownload(payload: ExportPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `player1inventory-backup-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function fetchCloudPayload(
  client: ApolloClient,
): Promise<ExportPayload> {
  const fetchPolicy = 'network-only' as const

  const [
    itemsResult,
    tagsResult,
    tagTypesResult,
    vendorsResult,
    recipesResult,
    inventoryLogsResult,
    shoppingCartsResult,
    allCartItemsResult,
    shelvesResult,
    locationsResult,
    itemStocksResult,
  ] = await Promise.all([
    client.query<GetItemsQuery>({ query: GetItemsDocument, fetchPolicy }),
    client.query<GetTagsQuery>({ query: GetTagsDocument, fetchPolicy }),
    client.query<GetTagTypesQuery>({
      query: GetTagTypesDocument,
      fetchPolicy,
    }),
    client.query<GetVendorsQuery>({ query: GetVendorsDocument, fetchPolicy }),
    client.query<GetRecipesQuery>({ query: GetRecipesDocument, fetchPolicy }),
    client.query<InventoryLogsQuery>({
      query: InventoryLogsDocument,
      fetchPolicy,
    }),
    client.query<ShoppingCartsQuery>({
      query: ShoppingCartsDocument,
      fetchPolicy,
    }),
    client.query<AllCartItemsQuery>({
      query: AllCartItemsDocument,
      fetchPolicy,
    }),
    client.query<GetShelvesQuery>({ query: GetShelvesDocument, fetchPolicy }),
    // Reuses the pantry's own `GetLocations` — there is no second operation for
    // export. It already selects every column `LocationInput` needs plus
    // `isDefault`, which the backup records and `toLocationInput` drops on the
    // way back up (see its comment for why the server refuses that field).
    client.query<GetLocationsQuery>({
      query: GetLocationsDocument,
      fetchPolicy,
    }),
    // Every location's stock in ONE request. `itemStocks(locationId:)` would
    // cost one request per location and a backup needs them all.
    client.query<AllItemStocksQuery>({
      query: AllItemStocksDocument,
      fetchPolicy,
    }),
  ])

  // Permanent carts — all carts are active (no status, no filtering needed)
  const allShoppingCarts = (shoppingCartsResult.data?.allCarts ?? []) as Array<{
    id: string
    lastPurchasedAt?: string | null
  }>
  const allCartIdSet = new Set(allShoppingCarts.map((c) => c.id))
  const allCartItems = (allCartItemsResult.data?.allCartItems ?? []) as Array<{
    cartId: string
  }>
  const exportCartItems = allCartItems.filter((ci) =>
    allCartIdSet.has(ci.cartId),
  )

  const allShelves = (shelvesResult.data?.shelves ?? []) as Array<{
    type: string
  }>
  const userShelves = allShelves.filter((s) => s.type !== 'system')

  const payload = buildExportPayload({
    items: itemsResult.data?.items ?? [],
    tags: tagsResult.data?.tags ?? [],
    tagTypes: tagTypesResult.data?.tagTypes ?? [],
    vendors: vendorsResult.data?.vendors ?? [],
    recipes: recipesResult.data?.recipes ?? [],
    inventoryLogs: inventoryLogsResult.data?.inventoryLogs ?? [],
    shoppingCarts: allShoppingCarts,
    cartItems: exportCartItems,
    shelves: userShelves,
    // NEITHER OF THESE IS FILTERED, unlike `shelves` and `cartItems` above,
    // and the reasons differ:
    //
    //   - `locations`: there is no system-row equivalent to filter out. Every
    //     location is the user's own, the default one included — and the
    //     default must be IN the payload, because the import side remaps its
    //     id onto the destination account's default and cannot find it
    //     otherwise.
    //   - `itemStocks`: an orphan cannot exist. `ItemStock` has FK cascades to
    //     both `Item` and `Location` (schema.prisma:279-280), `allItemStocks`
    //     is scoped through the location (`{ location: { userId } }`), and
    //     `locations` is scoped by the same user — so every row returned here
    //     names a location that is also in `locations`. The `cartItems` filter
    //     above exists because `CartItem.userId` and `Cart.userId` are
    //     separate columns that CAN disagree (issue #327); `ItemStock` has no
    //     `userId` column at all, so it has nothing to disagree with.
    locations: locationsResult.data?.locations ?? [],
    itemStocks: itemStocksResult.data?.allItemStocks ?? [],
  })

  return sanitiseCloudPayload(payload)
}

export async function exportCloudData(client: ApolloClient): Promise<void> {
  const payload = await fetchCloudPayload(client)
  triggerDownload(payload)
}
