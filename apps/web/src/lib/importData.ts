import type { ApolloClient } from '@apollo/client'
import { db, ensureDefaultLocationRow } from '@/db'
import { bootstrapCarts } from '@/db/operations'
import {
  AllCartItemsDocument,
  type AllCartItemsQuery,
  BulkCreateCartItemsDocument,
  BulkCreateInventoryLogsDocument,
  BulkCreateItemsDocument,
  BulkCreateRecipesDocument,
  BulkCreateShelvesDocument,
  BulkCreateShoppingCartsDocument,
  BulkCreateTagsDocument,
  BulkCreateTagTypesDocument,
  BulkCreateVendorsDocument,
  BulkUpsertCartItemsDocument,
  BulkUpsertInventoryLogsDocument,
  BulkUpsertItemsDocument,
  BulkUpsertRecipesDocument,
  BulkUpsertShelvesDocument,
  BulkUpsertShoppingCartsDocument,
  BulkUpsertTagsDocument,
  BulkUpsertTagTypesDocument,
  BulkUpsertVendorsDocument,
  ClearAllDataDocument,
  GetItemsDocument,
  type GetItemsQuery,
  GetRecipesDocument,
  type GetRecipesQuery,
  GetShelvesDocument,
  type GetShelvesQuery,
  GetTagsDocument,
  type GetTagsQuery,
  GetTagTypesDocument,
  type GetTagTypesQuery,
  GetVendorsDocument,
  type GetVendorsQuery,
  InventoryLogsDocument,
  type InventoryLogsQuery,
  ShoppingCartsDocument,
  type ShoppingCartsQuery,
  UpdateRecipeDocument,
  type UpdateRecipeMutation,
  UpdateShelfDocument,
  type UpdateShelfMutation,
} from '@/generated/graphql'
import type {
  CartItem,
  InventoryLog,
  Item,
  ItemStock,
  Location,
  Recipe,
  Shelf,
  ShoppingCart,
  Tag,
  TagType,
  Vendor,
} from '@/types'
import { DEFAULT_LOCATION_ID } from '@/types'
import { deserializeRecipe, parseWireDate } from './deserialization'
import type { ExportPayload } from './exportData'

export type ImportStrategy = 'skip' | 'replace' | 'clear'

// The stock CONFIGURATION fields. Global to the item since v16 — a v15 backup
// carries them on the stock rows and the import collapses them back up.
const GLOBAL_STOCK_FIELD_KEYS = [
  'packageUnit',
  'measurementUnit',
  'amountPerPackage',
  'targetUnit',
  'consumeAmount',
  'estimatedDueDays',
  'expirationThreshold',
  'expirationMode',
] as const

// The per-(item x location) stock STATE fields.
const LOCAL_STOCK_FIELD_KEYS = [
  'targetQuantity',
  'refillThreshold',
  'packedQuantity',
  'unpackedQuantity',
  'dueDate',
] as const

// Every stock field, in either half. A pre-v15 backup (and a cloud payload,
// whose Item still carries stock inline) holds all of them on the item.
const STOCK_FIELD_KEYS = [
  ...GLOBAL_STOCK_FIELD_KEYS,
  ...LOCAL_STOCK_FIELD_KEYS,
] as const

const DATE_FIELD_KEYS = ['dueDate', 'createdAt', 'updatedAt'] as const

// createdAt/updatedAt are required on an ItemStock; dueDate is genuinely
// optional. An absent timestamp is not harmless: `addItemToLocation` picks its
// source row with `b.updatedAt.getTime()`, which throws on an undefined one.
const REQUIRED_STOCK_DATE_KEYS = ['createdAt', 'updatedAt'] as const

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string)
}

// Convert item date fields from ISO strings (as stored in JSON) to Date objects.
function deserializeItem(rawItem: Item): Item {
  return {
    ...rawItem,
    createdAt: toDate(rawItem.createdAt),
    updatedAt: toDate(rawItem.updatedAt),
  }
}

// Convert stock date fields from ISO strings to Date objects; drop nulls
// (JSON.stringify writes absent optional fields as null on cloud payloads).
// The required timestamps fall back to now for old backups that carry none —
// the same defence `toShelfInput` applies.
function deserializeItemStock(raw: Record<string, unknown>): ItemStock {
  const result = { ...raw } as Record<string, unknown>
  for (const key of DATE_FIELD_KEYS) {
    if (result[key] == null) delete result[key]
    else result[key] = toDate(result[key])
  }
  for (const key of REQUIRED_STOCK_DATE_KEYS) {
    if (result[key] == null) result[key] = new Date()
  }
  return result as unknown as ItemStock
}

function deserializeLocation(raw: Record<string, unknown>): Location {
  return {
    ...raw,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  } as unknown as Location
}

// Build the ItemStock described by a pre-v15 item's inline fields, placed in
// the target location. Only the STATE half moves onto the row — since v16 the
// configuration belongs to the Item and simply stays there.
function legacyStockFromItem(
  item: Record<string, unknown>,
  locationId: string,
): ItemStock {
  const stock: Record<string, unknown> = {
    id: crypto.randomUUID(),
    itemId: item.id,
    locationId,
    // Defaults, in case an old backup lacks some of the fields.
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
  for (const key of LOCAL_STOCK_FIELD_KEYS) {
    if (item[key] != null) stock[key] = item[key]
  }
  return deserializeItemStock(stock)
}

// True when an item row still carries per-location stock inline — the pre-v15
// (and cloud) shape. Tested on the STATE half only: since v16 a correctly split
// item legitimately carries the eight configuration fields, so testing those
// would read every v16 item as unsplit and synthesise a bogus stock row for
// every orphan.
function hasInlineStock(item: Record<string, unknown>): boolean {
  return LOCAL_STOCK_FIELD_KEYS.some((key) => item[key] != null)
}

// Strip the inline per-location state off one pre-v15 item, returning the split
// item (which keeps its global configuration) and the ItemStock the inline
// state describes.
function splitLegacyItem(
  raw: Record<string, unknown>,
  locationId: string,
): { item: Record<string, unknown>; stock: ItemStock } {
  const stock = legacyStockFromItem(raw, locationId)
  const item = { ...raw }
  for (const key of LOCAL_STOCK_FIELD_KEYS) delete item[key]
  return { item, stock }
}

// Collapse a v15-shaped payload — configuration on the per-location stock rows
// — into the v16 shape, applying exactly the rule the Dexie v16 upgrade uses:
//
//  1. the DEFAULT location's row wins, if the item is stocked there;
//  2. otherwise the OLDEST row by `createdAt`, tie-broken by `id`;
//  3. an item with no rows keeps whatever it already has.
//
// Shape-driven and idempotent: a v16 payload has nothing left on its stock rows
// to collapse, so it passes through untouched.
function collapseStockConfig(payload: ExportPayload): ExportPayload {
  const stocks = (payload.itemStocks ?? []) as Array<Record<string, unknown>>
  const carriesConfig = stocks.some((stock) =>
    GLOBAL_STOCK_FIELD_KEYS.some((key) => stock[key] !== undefined),
  )
  if (!carriesConfig) return payload

  const byItemId = new Map<string, Array<Record<string, unknown>>>()
  for (const stock of stocks) {
    const itemId = stock.itemId as string
    const rows = byItemId.get(itemId)
    if (rows) rows.push(stock)
    else byItemId.set(itemId, [stock])
  }

  const items = (payload.items as Array<Record<string, unknown>>).map((raw) => {
    const rows = byItemId.get(raw.id as string) ?? []
    const winner =
      rows.find((row) => row.locationId === DEFAULT_LOCATION_ID) ??
      [...rows].sort((a, b) => {
        const at = new Date(a.createdAt as string | Date).getTime() || 0
        const bt = new Date(b.createdAt as string | Date).getTime() || 0
        if (at !== bt) return at - bt
        return (a.id as string) < (b.id as string) ? -1 : 1
      })[0]
    if (!winner) return raw
    const item = { ...raw }
    for (const key of GLOBAL_STOCK_FIELD_KEYS) {
      // The item's own value only loses to a row that actually carries the key.
      if (winner[key] !== undefined) item[key] = winner[key]
    }
    return item
  })

  const itemStocks = stocks.map((stock) => {
    const row = { ...stock }
    for (const key of GLOBAL_STOCK_FIELD_KEYS) delete row[key]
    return row
  })

  return { ...payload, items, itemStocks }
}

// Upgrade a pre-v15 backup (or a cloud payload, which keeps stock inline on the
// Item) to the split shape the local database expects since v15:
//   - synthesise one ItemStock per item, in `locationId`, and strip the inline
//     stock fields
//   - re-key carts and cart items to `${locationId}:${vendorId|'no-vendor'}`
// A payload that already carries `itemStocks` is post-v15 — but only for the
// items it actually has stock rows for; see `upgradeUnsplitItems`.
//
// `locationId` is the location the import targets. It mirrors the outbound
// local → cloud rule (Ruling A: use the location ACTIVE at migration time) — a
// cloud → local copy must land where the user is looking, or the pantry, every
// group/detail view and the cart pages render empty after the reload with no
// explanation. It defaults to the default location for callers with no active
// location (boot-time and legacy paths).
function upgradeLegacyPayload(
  payload: ExportPayload,
  locationId: string,
): ExportPayload {
  if (payload.itemStocks !== undefined) {
    // Already split per location; it may still be v15-shaped (configuration on
    // the stock rows) and may still hold items that were never split at all.
    return upgradeUnsplitItems(collapseStockConfig(payload), locationId)
  }

  const itemStocks: ItemStock[] = []
  const items = (payload.items as Array<Record<string, unknown>>).map((raw) => {
    const split = splitLegacyItem(raw, locationId)
    itemStocks.push(split.stock)
    return split.item
  })

  const scopeCartId = (id: string) => `${locationId}:${id}`

  return {
    ...payload,
    items,
    itemStocks,
    shoppingCarts: (
      payload.shoppingCarts as Array<Record<string, unknown>>
    ).map((cart) => ({ ...cart, id: scopeCartId(cart.id as string) })),
    cartItems: (payload.cartItems as Array<Record<string, unknown>>).map(
      (cartItem) => ({
        ...cartItem,
        cartId: scopeCartId(cartItem.cartId as string),
      }),
    ),
  }
}

// Being pre-v15 is a property of each ITEM, not of the payload as a whole.
// `fetchLocalPayload` always writes an `itemStocks` key, empty or not, so a
// database whose items were never split (or only partly split) exports as
// `items: [ ...inline stock... ]` beside an `itemStocks` array that says nothing
// about them. Treating the mere presence of that key as "already split" drops
// the stock those items carry — and since the pantry lists only items that HAVE
// a stock row (`getStockedItems`), they vanish from every view. That is the
// local → local round trip in
// e2e/tests/settings/import-export-local.spec.ts.
//
// So upgrade the leftovers individually: an item that still carries inline stock
// and has no stock row ANYWHERE in the payload gets one synthesised in
// `locationId`. Keyed on "anywhere" so an item stocked only in some other
// location — which correctly carries no inline stock — never gains a duplicate
// row here.
//
// Carts are deliberately NOT re-keyed on this path: a payload that declares
// `itemStocks` already uses `${locationId}:${vendorId}` cart ids, and prefixing
// them again would produce `local:local:vendor`.
function upgradeUnsplitItems(
  payload: ExportPayload,
  locationId: string,
): ExportPayload {
  const stockedItemIds = new Set(
    (payload.itemStocks as Array<Record<string, unknown>>).map(
      (stock) => stock.itemId as string,
    ),
  )

  const synthesised: ItemStock[] = []
  const items = (payload.items as Array<Record<string, unknown>>).map((raw) => {
    if (stockedItemIds.has(raw.id as string) || !hasInlineStock(raw)) return raw
    const split = splitLegacyItem(raw, locationId)
    synthesised.push(split.stock)
    return split.item
  })

  if (synthesised.length === 0) return payload

  return {
    ...payload,
    items,
    itemStocks: [...(payload.itemStocks as unknown[]), ...synthesised],
  }
}

// Cloud has NO per-location ItemStock (deliberately deferred in PR D): a cloud
// Item still carries its stock inline and a cloud cart id is a bare
// `vendorId | 'no-vendor'`. Copying a local (post-v15) pantry up to cloud must
// therefore collapse the split shape back down — otherwise every stock field
// arrives as `undefined` (they are non-null in `ItemInput`, so the migration
// fails outright) and every cart id keeps a `${locationId}:` prefix no cloud
// query ever looks up.
//
// Ruling (user, 2026-08-16): send the stock of the location that is ACTIVE at
// migration time — it is what the user is looking at, and it is how the rest of
// the app reads stock (`useActiveLocation()`). Data in other locations is NOT
// migrated and is NOT preserved anywhere in cloud; the UI warns about that
// before the copy runs (see `MigrationLocationWarningDialog`).
//
// A payload with no `itemStocks` is already flat (cloud export, or a pre-v15
// backup) and passes through untouched.
export function flattenPayloadForCloud(
  payload: ExportPayload,
  locationId: string,
): ExportPayload {
  if (payload.itemStocks === undefined) return payload

  const stockByItemId = new Map<string, Record<string, unknown>>()
  for (const raw of payload.itemStocks as Array<Record<string, unknown>>) {
    if (raw.locationId === locationId) {
      stockByItemId.set(raw.itemId as string, raw)
    }
  }

  // Every item is sent, stocked here or not — recipes, shelves and cart items
  // reference item ids, so dropping an item would leave dangling references.
  // An item with no stock in this location gets the same zeroed values the app
  // itself displays for it (see ZERO_STOCK / joinItemStock in db/operations).
  const items = (payload.items as Array<Record<string, unknown>>).map((raw) => {
    const stock = stockByItemId.get(raw.id as string)
    // Only the per-location STATE is zeroed: the configuration is the item's
    // own since v16 and defaulting over it would send 'package'/1 for every
    // measurement-tracked item. `targetUnit`/`consumeAmount` are non-null in
    // the cloud input, so they fall back only when the item itself lacks them.
    const item: Record<string, unknown> = {
      ...raw,
      targetUnit: raw.targetUnit ?? 'package',
      consumeAmount: raw.consumeAmount ?? 1,
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
    }
    if (stock) {
      for (const key of STOCK_FIELD_KEYS) {
        if (stock[key] !== undefined) item[key] = stock[key]
      }
    }
    return item
  })

  // Carts: keep this location's carts only and strip the prefix. Another
  // location's cart would collide with it on the un-prefixed cloud id.
  const prefix = `${locationId}:`
  const keptCartIds = new Set<string>()
  const shoppingCarts = (
    payload.shoppingCarts as Array<Record<string, unknown>>
  )
    .filter((cart) => (cart.id as string).startsWith(prefix))
    .map((cart) => {
      const id = cart.id as string
      keptCartIds.add(id)
      return { ...cart, id: id.slice(prefix.length) }
    })
  const cartItems = (payload.cartItems as Array<Record<string, unknown>>)
    .filter((cartItem) => keptCartIds.has(cartItem.cartId as string))
    .map((cartItem) => ({
      ...cartItem,
      cartId: (cartItem.cartId as string).slice(prefix.length),
    }))

  // Logs: this location's, plus pre-Location logs that carry no locationId.
  const inventoryLogs = (
    payload.inventoryLogs as Array<Record<string, unknown>>
  ).filter((log) => log.locationId == null || log.locationId === locationId)

  // `itemStocks`/`locations` are local-only tables with no cloud counterpart —
  // dropping them also marks the result as a flat (cloud-shaped) payload.
  const { itemStocks, locations, ...rest } = payload
  void itemStocks
  void locations

  return { ...rest, items, shoppingCarts, cartItems, inventoryLogs }
}

// Which location a payload should be flattened by, for the FILE-IMPORT path
// only (`ImportCard` in cloud mode).
//
// The migration paths always flatten by the active location — Ruling A, and the
// data is this device's own, so the location is guaranteed to exist. A backup
// file is different: it was written on another device whose location ids need
// not exist here (a cloud-only device has just `'local'`). Flattening by an id
// the payload knows nothing about would upload every item with zeroed stock and
// drop every cart — silently, where the pre-split code failed loudly.
//
//   - the requested location has stock in the payload → use it (Ruling A)
//   - the payload's stock lives in exactly one other location → use that one:
//     it is the only reading that preserves the data, no guessing involved
//   - the payload's stock spans several locations, none of them the requested
//     one → `null`. There is no safe answer; the caller must refuse the import
//     rather than upload zeros.
//   - no stock to flatten (no `itemStocks` table, or an empty one) → the same
//     three rules are applied to the CART id prefixes instead. Zeroed stock is
//     correct when there is none, but the carts still carry a location and
//     flattening by one they do not use drops every cart and cart item silently.
//   - nothing at all to go on → the request passes through; nothing can be lost.
export function resolveFlattenLocationId(
  payload: ExportPayload,
  requestedLocationId: string,
): string | null {
  if (payload.itemStocks === undefined) return requestedLocationId

  const locationIds = new Set(
    (payload.itemStocks as Array<Record<string, unknown>>).map(
      (stock) => stock.locationId as string,
    ),
  )
  if (locationIds.size === 0) {
    return resolveByCartLocations(payload, requestedLocationId)
  }
  return pickLocationId(locationIds, requestedLocationId)
}

// The locations a payload's cart ids are scoped to. Ids with no `:` are bare
// (cloud-shaped or pre-v15) and name no location, so they are ignored.
function resolveByCartLocations(
  payload: ExportPayload,
  requestedLocationId: string,
): string | null {
  const cartLocationIds = new Set<string>()
  for (const cart of payload.shoppingCarts as Array<Record<string, unknown>>) {
    const id = cart.id as string
    const idx = id.indexOf(':')
    if (idx > 0) cartLocationIds.add(id.slice(0, idx))
  }
  if (cartLocationIds.size === 0) return requestedLocationId
  return pickLocationId(cartLocationIds, requestedLocationId)
}

// Iterating (rather than indexing) keeps the value typed as `string` under
// noUncheckedIndexedAccess.
function pickLocationId(
  locationIds: Set<string>,
  requestedLocationId: string,
): string | null {
  if (locationIds.has(requestedLocationId)) return requestedLocationId
  if (locationIds.size === 1) {
    for (const onlyLocationId of locationIds) return onlyLocationId
  }
  return null
}

// Normalize an imported permanent cart to the v13+ schema shape: keep only
// `id` and an optional `lastPurchasedAt` (as a Date). Legacy backup fields
// (status / createdAt / completedAt / vendorId) are dropped so they are never
// written back into the `shoppingCarts: 'id'` store.
function deserializeImportedCart(cart: Record<string, unknown>): ShoppingCart {
  const result: ShoppingCart = { id: cart.id as string }
  // `parseWireDate` handles both an ISO string and the epoch-millis
  // digit-string that cloud backups exported between Jun 10 2026 and the
  // restoration of the server's `Cart` type resolver still carry — plain
  // `new Date(digits)` makes an Invalid Date out of the latter.
  const lastPurchasedAt = parseWireDate(cart.lastPurchasedAt)
  if (lastPurchasedAt) result.lastPurchasedAt = lastPurchasedAt
  return result
}

// ---------------------------------------------------------------------------
// Batching helpers
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

export interface ImportProgress {
  completedBatches: number
  totalBatches: number
  currentEntity: string
}

export interface ImportSession {
  payload: ExportPayload
  strategy: ImportStrategy
  completedBatchKeys: Set<string> // key format: `${entityType}:${batchIndex}`
}

// ---------------------------------------------------------------------------
// GraphQL Input mappers — strip server-only fields (__typename, userId,
// familyId) and any other fields not accepted by the corresponding Input type.
// These are used before passing payload objects as GraphQL mutation variables.
// ---------------------------------------------------------------------------

export function toItemInput(item: Record<string, unknown>) {
  const createdAt =
    item.createdAt instanceof Date
      ? item.createdAt.toISOString()
      : (item.createdAt as string)
  const updatedAt =
    item.updatedAt instanceof Date
      ? item.updatedAt.toISOString()
      : (item.updatedAt as string)
  return {
    id: item.id as string,
    name: item.name as string,
    tagIds: (item.tagIds ?? []) as string[],
    vendorIds:
      item.vendorIds != null ? (item.vendorIds as string[]) : undefined,
    packageUnit: item.packageUnit as string | undefined,
    measurementUnit: item.measurementUnit as string | undefined,
    amountPerPackage: item.amountPerPackage as number | undefined,
    targetUnit: item.targetUnit as string,
    targetQuantity: item.targetQuantity as number,
    refillThreshold: item.refillThreshold as number,
    packedQuantity: item.packedQuantity as number,
    unpackedQuantity: item.unpackedQuantity as number,
    consumeAmount: item.consumeAmount as number,
    // A local ItemStock carries `dueDate` as a Date (cloud sends a string).
    dueDate:
      item.dueDate instanceof Date
        ? item.dueDate.toISOString()
        : (item.dueDate as string | undefined),
    estimatedDueDays: item.estimatedDueDays as number | undefined,
    expirationThreshold: item.expirationThreshold as number | undefined,
    expirationMode: item.expirationMode as string | undefined,
    createdAt,
    updatedAt,
  }
}

export function toTagInput(tag: Record<string, unknown>) {
  return {
    id: tag.id as string,
    name: tag.name as string,
    typeId: tag.typeId as string,
    parentId: tag.parentId as string | undefined,
  }
}

export function toTagTypeInput(tagType: Record<string, unknown>) {
  return {
    id: tagType.id as string,
    name: tagType.name as string,
    color: tagType.color as string,
  }
}

export function toVendorInput(vendor: Record<string, unknown>) {
  return {
    id: vendor.id as string,
    name: vendor.name as string,
  }
}

export function toRecipeInput(recipe: Record<string, unknown>) {
  return {
    id: recipe.id as string,
    name: recipe.name as string,
    items: ((recipe.items ?? []) as Array<Record<string, unknown>>).map(
      (ri) => ({
        itemId: ri.itemId as string,
        defaultAmount: ri.defaultAmount as number,
      }),
    ),
    lastCookedAt: recipe.lastCookedAt as string | undefined,
  }
}

export function toInventoryLogInput(log: Record<string, unknown>) {
  const occurredAt =
    log.occurredAt instanceof Date
      ? log.occurredAt.toISOString()
      : (log.occurredAt as string)
  return {
    id: log.id as string,
    itemId: log.itemId as string,
    delta: log.delta as number,
    quantity: log.quantity as number,
    occurredAt,
    note: log.note as string | undefined,
  }
}

// Permanent carts (v13+) carry only `id` (= vendorId or 'no-vendor') and an
// optional `lastPurchasedAt`. The legacy `status`/`createdAt`/`completedAt`
// fields no longer exist on the schema (Dexie `shoppingCarts: 'id'`) nor on the
// GraphQL `ShoppingCartInput` (id + lastPurchasedAt only), so they are dropped.
// Old backups that still carry those stale fields are tolerated — only the
// permitted fields are mapped through.
export function toShoppingCartInput(cart: Record<string, unknown>) {
  // Always normalize to ISO. A backup exported while the cloud shipped
  // `lastPurchasedAt` as epoch millis carries a digit-string, and passing that
  // through verbatim makes `bulkUpsertShoppingCarts` run `new Date(digits)` →
  // Invalid Date → Prisma write error. An unparseable value is dropped.
  const lastPurchasedAt = parseWireDate(cart.lastPurchasedAt)?.toISOString()
  return {
    id: cart.id as string,
    ...(lastPurchasedAt != null ? { lastPurchasedAt } : {}),
  }
}

export function toCartItemInput(cartItem: Record<string, unknown>) {
  return {
    id: cartItem.id as string,
    cartId: cartItem.cartId as string,
    itemId: cartItem.itemId as string,
    quantity: cartItem.quantity as number,
  }
}

export function toShelfInput(shelf: Record<string, unknown>) {
  const createdAt =
    shelf.createdAt instanceof Date
      ? shelf.createdAt.toISOString()
      : typeof shelf.createdAt === 'string' && shelf.createdAt
        ? shelf.createdAt
        : new Date().toISOString() // fallback for old backups without timestamps

  const updatedAt =
    shelf.updatedAt instanceof Date
      ? shelf.updatedAt.toISOString()
      : typeof shelf.updatedAt === 'string' && shelf.updatedAt
        ? shelf.updatedAt
        : new Date().toISOString() // fallback for old backups without timestamps

  // Strip __typename from filterConfig (Apollo adds it to cloud-fetched nested objects).
  // Also normalizes null array fields to undefined for consistency.
  const rawFilter = shelf.filterConfig as
    | Record<string, unknown>
    | null
    | undefined
  const filterConfig =
    rawFilter != null
      ? {
          tagIds: (rawFilter.tagIds as string[] | null) ?? undefined,
          vendorIds: (rawFilter.vendorIds as string[] | null) ?? undefined,
          recipeIds: (rawFilter.recipeIds as string[] | null) ?? undefined,
        }
      : undefined

  return {
    id: shelf.id as string,
    name: shelf.name as string,
    type: shelf.type as string,
    order: shelf.order as number,
    filterConfig,
    itemIds: shelf.itemIds as string[] | undefined,
    createdAt,
    updatedAt,
  }
}

export interface ConflictEntry {
  id: string
  name: string
  matchReasons: ('id' | 'name')[]
}

export interface ConflictSummary {
  items: ConflictEntry[]
  tags: ConflictEntry[]
  tagTypes: ConflictEntry[]
  vendors: ConflictEntry[]
  recipes: ConflictEntry[]
  inventoryLogs: ConflictEntry[]
  shoppingCarts: ConflictEntry[]
  cartItems: ConflictEntry[]
  shelves: ConflictEntry[]
}

export interface ExistingData {
  items: Item[]
  tags: Tag[]
  tagTypes: TagType[]
  vendors: Vendor[]
  recipes: Recipe[]
  inventoryLogs: InventoryLog[]
  shoppingCarts: ShoppingCart[]
  cartItems: CartItem[]
  shelves: Shelf[]
}

// Entities that have a meaningful "name" field for conflict detection
type NamedEntity = { id: string; name: string }
// Entities that only have an id (no name to match by)
type IdOnlyEntity = { id: string }

function detectNamedConflicts(
  incoming: NamedEntity[],
  existing: NamedEntity[],
): ConflictEntry[] {
  const existingById = new Map(existing.map((e) => [e.id, e]))
  const existingByName = new Map(existing.map((e) => [e.name.toLowerCase(), e]))

  const conflicts: ConflictEntry[] = []

  for (const entry of incoming) {
    const matchReasons: ('id' | 'name')[] = []

    if (existingById.has(entry.id)) {
      matchReasons.push('id')
    }
    if (existingByName.has(entry.name.toLowerCase())) {
      matchReasons.push('name')
    }

    if (matchReasons.length > 0) {
      conflicts.push({ id: entry.id, name: entry.name, matchReasons })
    }
  }

  return conflicts
}

// Tags have an additional conflict dimension: a changed parentId means the tag
// is being moved to a different parent. This function extends the standard
// id/name conflict check so that a tag whose parentId differs from the stored
// record is also flagged, even when id and name would not otherwise conflict.
function detectNamedTagConflicts(
  incoming: Tag[],
  existing: Tag[],
): ConflictEntry[] {
  const existingById = new Map(existing.map((e) => [e.id, e]))
  const existingByName = new Map(existing.map((e) => [e.name.toLowerCase(), e]))

  const conflicts: ConflictEntry[] = []

  for (const entry of incoming) {
    const matchReasons: ('id' | 'name')[] = []

    const existingRecord = existingById.get(entry.id)
    if (existingRecord) {
      matchReasons.push('id')
    }

    if (existingByName.has(entry.name.toLowerCase())) {
      matchReasons.push('name')
    }

    // A parentId change (tag reparented) is treated as a conflict even when
    // the id and name checks would not surface it on their own.
    if (
      existingRecord &&
      existingRecord.parentId !== entry.parentId &&
      !matchReasons.includes('id')
    ) {
      matchReasons.push('id')
    }

    if (matchReasons.length > 0) {
      conflicts.push({ id: entry.id, name: entry.name, matchReasons })
    }
  }

  return conflicts
}

function detectIdOnlyConflicts(
  incoming: IdOnlyEntity[],
  existing: IdOnlyEntity[],
  getLabel: (entry: IdOnlyEntity) => string,
): ConflictEntry[] {
  const existingIds = new Set(existing.map((e) => e.id))
  const conflicts: ConflictEntry[] = []

  for (const entry of incoming) {
    if (existingIds.has(entry.id)) {
      conflicts.push({
        id: entry.id,
        name: getLabel(entry),
        matchReasons: ['id'],
      })
    }
  }

  return conflicts
}

export function detectConflicts(
  payload: ExportPayload,
  existing: ExistingData,
): ConflictSummary {
  return {
    items: detectNamedConflicts(payload.items as NamedEntity[], existing.items),
    tags: detectNamedTagConflicts(payload.tags as Tag[], existing.tags),
    tagTypes: detectNamedConflicts(
      payload.tagTypes as NamedEntity[],
      existing.tagTypes,
    ),
    vendors: detectNamedConflicts(
      payload.vendors as NamedEntity[],
      existing.vendors,
    ),
    recipes: detectNamedConflicts(
      payload.recipes as NamedEntity[],
      existing.recipes,
    ),
    inventoryLogs: detectIdOnlyConflicts(
      payload.inventoryLogs as IdOnlyEntity[],
      existing.inventoryLogs,
      (e) => (e as InventoryLog).id,
    ),
    // Permanent carts (v13+) are id-only sentinels (vendorId or 'no-vendor')
    // that the app idempotently bootstraps on every boot. An imported cart will
    // therefore always collide with an auto-created cart of the same id — but a
    // cart carries no destructible user content, so re-importing it is a no-op
    // (other than refreshing `lastPurchasedAt`). Reporting these as conflicts
    // would needlessly halt an otherwise clean auto-import behind the conflict
    // dialog, so carts are never treated as conflicts and are always upserted.
    shoppingCarts: [],
    cartItems: detectIdOnlyConflicts(
      payload.cartItems as IdOnlyEntity[],
      existing.cartItems,
      (e) => (e as CartItem).id,
    ),
    shelves: detectIdOnlyConflicts(
      (payload.shelves ?? []) as IdOnlyEntity[],
      existing.shelves,
      (e) => (e as Shelf).id,
    ),
  }
}

export function hasConflicts(summary: ConflictSummary): boolean {
  return (
    summary.items.length > 0 ||
    summary.tags.length > 0 ||
    summary.tagTypes.length > 0 ||
    summary.vendors.length > 0 ||
    summary.recipes.length > 0 ||
    summary.inventoryLogs.length > 0 ||
    summary.shoppingCarts.length > 0 ||
    summary.cartItems.length > 0 ||
    summary.shelves.length > 0
  )
}

function emptyPayload(): ExportPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    items: [],
    tags: [],
    tagTypes: [],
    vendors: [],
    recipes: [],
    inventoryLogs: [],
    shoppingCarts: [],
    cartItems: [],
    shelves: [],
  }
}

function getConflictIds(entries: ConflictEntry[]): Set<string> {
  return new Set(entries.map((e) => e.id))
}

export function partitionPayload(
  payload: ExportPayload,
  conflicts: ConflictSummary,
  strategy: ImportStrategy,
): { toCreate: ExportPayload; toUpsert: ExportPayload } {
  if (strategy === 'clear') {
    // All entities go to toCreate; toUpsert is empty
    return {
      toCreate: { ...payload },
      toUpsert: emptyPayload(),
    }
  }

  if (strategy === 'skip') {
    // Non-conflicting entities go to toCreate; toUpsert is empty
    const conflictIdSets = {
      items: getConflictIds(conflicts.items),
      tags: getConflictIds(conflicts.tags),
      tagTypes: getConflictIds(conflicts.tagTypes),
      vendors: getConflictIds(conflicts.vendors),
      recipes: getConflictIds(conflicts.recipes),
      inventoryLogs: getConflictIds(conflicts.inventoryLogs),
      shoppingCarts: getConflictIds(conflicts.shoppingCarts),
      cartItems: getConflictIds(conflicts.cartItems),
      shelves: getConflictIds(conflicts.shelves),
    }

    return {
      toCreate: {
        ...payload,
        items: (payload.items as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.items.has(e.id),
        ),
        tags: (payload.tags as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.tags.has(e.id),
        ),
        tagTypes: (payload.tagTypes as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.tagTypes.has(e.id),
        ),
        vendors: (payload.vendors as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.vendors.has(e.id),
        ),
        recipes: (payload.recipes as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.recipes.has(e.id),
        ),
        inventoryLogs: (payload.inventoryLogs as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.inventoryLogs.has(e.id),
        ),
        shoppingCarts: (payload.shoppingCarts as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.shoppingCarts.has(e.id),
        ),
        cartItems: (payload.cartItems as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.cartItems.has(e.id),
        ),
        shelves: ((payload.shelves ?? []) as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.shelves.has(e.id),
        ),
      },
      toUpsert: emptyPayload(),
    }
  }

  // strategy === 'replace'
  // Non-conflicting -> toCreate, conflicting -> toUpsert
  const conflictIdSets = {
    items: getConflictIds(conflicts.items),
    tags: getConflictIds(conflicts.tags),
    tagTypes: getConflictIds(conflicts.tagTypes),
    vendors: getConflictIds(conflicts.vendors),
    recipes: getConflictIds(conflicts.recipes),
    inventoryLogs: getConflictIds(conflicts.inventoryLogs),
    shoppingCarts: getConflictIds(conflicts.shoppingCarts),
    cartItems: getConflictIds(conflicts.cartItems),
    shelves: getConflictIds(conflicts.shelves),
  }

  return {
    toCreate: {
      ...payload,
      items: (payload.items as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.items.has(e.id),
      ),
      tags: (payload.tags as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.tags.has(e.id),
      ),
      tagTypes: (payload.tagTypes as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.tagTypes.has(e.id),
      ),
      vendors: (payload.vendors as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.vendors.has(e.id),
      ),
      recipes: (payload.recipes as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.recipes.has(e.id),
      ),
      inventoryLogs: (payload.inventoryLogs as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.inventoryLogs.has(e.id),
      ),
      shoppingCarts: (payload.shoppingCarts as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.shoppingCarts.has(e.id),
      ),
      cartItems: (payload.cartItems as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.cartItems.has(e.id),
      ),
      shelves: ((payload.shelves ?? []) as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.shelves.has(e.id),
      ),
    },
    toUpsert: {
      ...payload,
      items: (payload.items as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.items.has(e.id),
      ),
      tags: (payload.tags as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.tags.has(e.id),
      ),
      tagTypes: (payload.tagTypes as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.tagTypes.has(e.id),
      ),
      vendors: (payload.vendors as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.vendors.has(e.id),
      ),
      recipes: (payload.recipes as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.recipes.has(e.id),
      ),
      inventoryLogs: (payload.inventoryLogs as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.inventoryLogs.has(e.id),
      ),
      shoppingCarts: (payload.shoppingCarts as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.shoppingCarts.has(e.id),
      ),
      cartItems: (payload.cartItems as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.cartItems.has(e.id),
      ),
      shelves: ((payload.shelves ?? []) as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.shelves.has(e.id),
      ),
    },
  }
}

export async function fetchExistingData(options: {
  mode: 'local' | 'cloud'
  client?: ApolloClient
}): Promise<ExistingData> {
  if (options.mode === 'cloud' && options.client) {
    return fetchCloudExistingData(options.client)
  }
  return fetchLocalExistingData()
}

async function fetchLocalExistingData(): Promise<ExistingData> {
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
  ] = await Promise.all([
    db.items.toArray(),
    db.tags.toArray(),
    db.tagTypes.toArray(),
    db.vendors.toArray(),
    db.recipes.toArray(),
    db.inventoryLogs.toArray(),
    db.shoppingCarts.toArray(),
    db.cartItems.toArray(),
    db.shelves.toArray(),
  ])

  return {
    items,
    tags,
    tagTypes,
    vendors,
    recipes,
    inventoryLogs,
    shoppingCarts,
    cartItems,
    shelves,
  }
}

// Restore the payload's locations. Locations carry no destructible user
// content, so (like carts) they are never reported as conflicts: `skip` adds
// the ones that are missing, the other strategies overwrite. The default
// location is re-ensured afterwards — it is undeletable, and `clear` empties
// the table while a legacy payload carries no locations at all.
async function importLocations(
  payload: ExportPayload,
  strategy: ImportStrategy,
): Promise<void> {
  const locations = (
    (payload.locations ?? []) as Array<Record<string, unknown>>
  ).map(deserializeLocation)

  if (strategy === 'skip') {
    const existingIds = new Set((await db.locations.toArray()).map((l) => l.id))
    const toAdd = locations.filter((l) => !existingIds.has(l.id))
    if (toAdd.length > 0) await db.locations.bulkAdd(toAdd)
  } else if (locations.length > 0) {
    await db.locations.bulkPut(locations)
  }

  await ensureDefaultLocationRow()
}

// Restore the payload's ItemStock rows. Stock follows its item: only stocks
// whose item was actually written are imported (so a skipped conflicting item
// keeps the stock it already has). Any existing row for the same
// (itemId, locationId) is dropped first — that pair is unique.
async function importItemStocks(
  payload: ExportPayload,
  writtenItemIds: Set<string>,
): Promise<void> {
  const incoming = (
    (payload.itemStocks ?? []) as Array<Record<string, unknown>>
  )
    .map(deserializeItemStock)
    .filter((stock) => writtenItemIds.has(stock.itemId))
  if (incoming.length === 0) return

  const staleIds: string[] = []
  for (const stock of incoming) {
    const existing = await db.itemStocks
      .where('[itemId+locationId]')
      .equals([stock.itemId, stock.locationId])
      .toArray()
    staleIds.push(...existing.filter((e) => e.id !== stock.id).map((e) => e.id))
  }
  if (staleIds.length > 0) await db.itemStocks.bulkDelete(staleIds)

  await db.itemStocks.bulkPut(incoming)
}

function itemIdsOf(entries: unknown[]): Set<string> {
  return new Set((entries as Array<{ id: string }>).map((e) => e.id))
}

// `getCart` is a pure read, so nothing recreates a missing sentinel cart on
// demand. Every import strategy can leave one missing:
//   - `clear` wipes the cart table, and the payload may carry no carts at all
//     (a backup taken before any shopping happened);
//   - `skip` / `replace` can introduce a **new vendor** whose cart is not in the
//     payload — cloud carts are created lazily, and a backup from another device
//     carries that device's location prefixes.
// Without a cart, `/shopping/<vendorId>` disables every add-to-cart control with
// no message, so re-bootstrap every location after any import.
async function bootstrapCartsForAllLocations(): Promise<void> {
  for (const location of await db.locations.toArray()) {
    await bootstrapCarts(location.id)
  }
}

export async function importLocalData(
  rawPayload: ExportPayload,
  strategy: ImportStrategy,
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<void> {
  // Pre-v15 backups (and cloud payloads) carry stock inline on the item and
  // unscoped cart ids — upgrade them to the split shape before writing, into
  // the caller's target location (the active one, for the UI paths).
  const payload = upgradeLegacyPayload(rawPayload, locationId)

  if (strategy === 'clear') {
    // Delete all tables in dependency order (children before parents)
    await db.shelves.clear()
    await db.cartItems.clear()
    await db.shoppingCarts.clear()
    await db.inventoryLogs.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.recipes.clear()
    await db.vendors.clear()
    await db.itemStocks.clear()
    await db.items.clear()
    await db.locations.clear()

    // Bulk add all entities in reverse order (parents before children)
    await importLocations(payload, strategy)
    await db.items.bulkAdd((payload.items as Item[]).map(deserializeItem))
    await importItemStocks(payload, itemIdsOf(payload.items))
    await db.vendors.bulkAdd(payload.vendors as Vendor[])
    await db.recipes.bulkAdd(
      (payload.recipes as Recipe[]).map((r) =>
        deserializeRecipe(r as unknown as Record<string, unknown>),
      ),
    )
    await db.tagTypes.bulkAdd(payload.tagTypes as TagType[])
    await db.tags.bulkAdd(payload.tags as Tag[])
    await db.inventoryLogs.bulkAdd(
      (payload.inventoryLogs as InventoryLog[]).map((log) => ({
        ...log,
        occurredAt:
          log.occurredAt instanceof Date
            ? log.occurredAt
            : new Date(log.occurredAt as unknown as string),
      })),
    )
    // Carts are id-only sentinels — always upsert (deserialize lastPurchasedAt
    // and drop any stale legacy fields from old backups).
    await db.shoppingCarts.bulkPut(
      (payload.shoppingCarts as Array<Record<string, unknown>>).map(
        deserializeImportedCart,
      ),
    )
    await db.cartItems.bulkAdd(payload.cartItems as CartItem[])
    await db.shelves.bulkAdd(
      ((payload.shelves ?? []) as Shelf[]).map((s) => ({
        ...s,
        createdAt:
          s.createdAt instanceof Date
            ? s.createdAt
            : new Date(s.createdAt as unknown as string),
        updatedAt:
          s.updatedAt instanceof Date
            ? s.updatedAt
            : new Date(s.updatedAt as unknown as string),
      })),
    )

    await bootstrapCartsForAllLocations()
    return
  }

  const existing = await fetchLocalExistingData()
  const conflicts = detectConflicts(payload, existing)

  if (strategy === 'skip') {
    const { toCreate } = partitionPayload(payload, conflicts, 'skip')

    await importLocations(payload, strategy)
    await db.items.bulkAdd((toCreate.items as Item[]).map(deserializeItem), {
      allKeys: false,
    })
    // Only the newly created items get their stock — conflicting items were
    // skipped, so the stock they already have stays as it is.
    await importItemStocks(payload, itemIdsOf(toCreate.items))
    await db.vendors.bulkAdd(toCreate.vendors as Vendor[], { allKeys: false })
    await db.recipes.bulkAdd(
      (toCreate.recipes as Recipe[]).map((r) =>
        deserializeRecipe(r as unknown as Record<string, unknown>),
      ),
      { allKeys: false },
    )
    await db.tagTypes.bulkAdd(toCreate.tagTypes as TagType[], {
      allKeys: false,
    })
    await db.tags.bulkAdd(toCreate.tags as Tag[], { allKeys: false })
    await db.inventoryLogs.bulkAdd(
      (toCreate.inventoryLogs as InventoryLog[]).map((log) => ({
        ...log,
        occurredAt:
          log.occurredAt instanceof Date
            ? log.occurredAt
            : new Date(log.occurredAt as unknown as string),
      })),
      { allKeys: false },
    )
    // Carts: upsert (never conflict — always go to toCreate) so a re-imported
    // sentinel cart cannot collide with the bootstrap-created cart of the same id.
    await db.shoppingCarts.bulkPut(
      (toCreate.shoppingCarts as Array<Record<string, unknown>>).map(
        deserializeImportedCart,
      ),
    )
    await db.cartItems.bulkAdd(toCreate.cartItems as CartItem[], {
      allKeys: false,
    })
    await db.shelves.bulkAdd(
      ((toCreate.shelves ?? []) as Shelf[]).map((s) => ({
        ...s,
        createdAt:
          s.createdAt instanceof Date
            ? s.createdAt
            : new Date(s.createdAt as unknown as string),
        updatedAt:
          s.updatedAt instanceof Date
            ? s.updatedAt
            : new Date(s.updatedAt as unknown as string),
      })),
      { allKeys: false },
    )

    // For conflicting shelves in "skip" mode: merge newly created item IDs
    const newItemIds = new Set(
      (toCreate.items as Array<{ id: string }>).map((i) => i.id),
    )
    const payloadShelvesMap = new Map(
      (
        (payload.shelves ?? []) as Array<{ id: string; itemIds?: string[] }>
      ).map((s) => [s.id, s]),
    )
    for (const conflictEntry of conflicts.shelves) {
      const payloadShelf = payloadShelvesMap.get(conflictEntry.id)
      if (!payloadShelf?.itemIds?.length) continue
      const addedIds = payloadShelf.itemIds.filter((id) => newItemIds.has(id))
      if (!addedIds.length) continue
      const existingShelf = await db.shelves.get(conflictEntry.id)
      if (!existingShelf) continue
      const existingItemIds = existingShelf.itemIds ?? []
      const mergedIds = [...new Set([...existingItemIds, ...addedIds])]
      await db.shelves.update(conflictEntry.id, { itemIds: mergedIds })
    }

    // For conflicting recipes in "skip" mode: merge newly added ingredient items
    const payloadRecipesMap = new Map(
      (
        payload.recipes as Array<{
          id: string
          items?: Array<{ itemId: string; defaultAmount: number }>
        }>
      ).map((r) => [r.id, r]),
    )
    for (const conflictEntry of conflicts.recipes) {
      const payloadRecipe = payloadRecipesMap.get(conflictEntry.id)
      if (!payloadRecipe?.items?.length) continue
      const newIngredients = payloadRecipe.items.filter((ri) =>
        newItemIds.has(ri.itemId),
      )
      if (!newIngredients.length) continue
      const existingRecipe = await db.recipes.get(conflictEntry.id)
      if (!existingRecipe) continue
      const existingItemIds = new Set(
        existingRecipe.items.map((ri) => ri.itemId),
      )
      const addedIngredients = newIngredients.filter(
        (ri) => !existingItemIds.has(ri.itemId),
      )
      if (!addedIngredients.length) continue
      const mergedItems = [...existingRecipe.items, ...addedIngredients]
      await db.recipes.update(conflictEntry.id, { items: mergedItems })
    }

    await bootstrapCartsForAllLocations()
    return
  }

  // strategy === 'replace'
  const { toCreate, toUpsert } = partitionPayload(payload, conflicts, 'replace')

  await importLocations(payload, strategy)
  await db.items.bulkAdd((toCreate.items as Item[]).map(deserializeItem), {
    allKeys: false,
  })
  await db.vendors.bulkAdd(toCreate.vendors as Vendor[], { allKeys: false })
  await db.recipes.bulkAdd(
    (toCreate.recipes as Recipe[]).map((r) =>
      deserializeRecipe(r as unknown as Record<string, unknown>),
    ),
    { allKeys: false },
  )
  await db.tagTypes.bulkAdd(toCreate.tagTypes as TagType[], { allKeys: false })
  await db.tags.bulkAdd(toCreate.tags as Tag[], { allKeys: false })
  await db.inventoryLogs.bulkAdd(
    (toCreate.inventoryLogs as InventoryLog[]).map((log) => ({
      ...log,
      occurredAt:
        log.occurredAt instanceof Date
          ? log.occurredAt
          : new Date(log.occurredAt as unknown as string),
    })),
    { allKeys: false },
  )
  // Carts: upsert (never conflict — always go to toCreate) so a re-imported
  // sentinel cart cannot collide with the bootstrap-created cart of the same id.
  await db.shoppingCarts.bulkPut(
    (toCreate.shoppingCarts as Array<Record<string, unknown>>).map(
      deserializeImportedCart,
    ),
  )
  await db.cartItems.bulkAdd(toCreate.cartItems as CartItem[], {
    allKeys: false,
  })
  await db.shelves.bulkAdd(
    ((toCreate.shelves ?? []) as Shelf[]).map((s) => ({
      ...s,
      createdAt:
        s.createdAt instanceof Date
          ? s.createdAt
          : new Date(s.createdAt as unknown as string),
      updatedAt:
        s.updatedAt instanceof Date
          ? s.updatedAt
          : new Date(s.updatedAt as unknown as string),
    })),
    { allKeys: false },
  )

  await db.items.bulkPut((toUpsert.items as Item[]).map(deserializeItem))
  // Every payload item was written (created or replaced), so all of the
  // payload's stock rows apply.
  await importItemStocks(payload, itemIdsOf(payload.items))
  await db.vendors.bulkPut(toUpsert.vendors as Vendor[])
  await db.recipes.bulkPut(
    (toUpsert.recipes as Recipe[]).map((r) =>
      deserializeRecipe(r as unknown as Record<string, unknown>),
    ),
  )
  await db.tagTypes.bulkPut(toUpsert.tagTypes as TagType[])
  await db.tags.bulkPut(toUpsert.tags as Tag[])
  await db.inventoryLogs.bulkPut(
    (toUpsert.inventoryLogs as InventoryLog[]).map((log) => ({
      ...log,
      occurredAt:
        log.occurredAt instanceof Date
          ? log.occurredAt
          : new Date(log.occurredAt as unknown as string),
    })),
  )
  await db.shoppingCarts.bulkPut(
    (toUpsert.shoppingCarts as Array<Record<string, unknown>>).map(
      deserializeImportedCart,
    ),
  )
  await db.cartItems.bulkPut(toUpsert.cartItems as CartItem[])
  await db.shelves.bulkPut(
    ((toUpsert.shelves ?? []) as Shelf[]).map((s) => ({
      ...s,
      createdAt:
        s.createdAt instanceof Date
          ? s.createdAt
          : new Date(s.createdAt as unknown as string),
      updatedAt:
        s.updatedAt instanceof Date
          ? s.updatedAt
          : new Date(s.updatedAt as unknown as string),
    })),
  )

  await bootstrapCartsForAllLocations()
}

async function fetchCloudExistingData(
  client: ApolloClient,
): Promise<ExistingData> {
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
  ] = await Promise.all([
    client.query<GetItemsQuery>({ query: GetItemsDocument, fetchPolicy }),
    client.query<GetTagsQuery>({ query: GetTagsDocument, fetchPolicy }),
    client.query<GetTagTypesQuery>({ query: GetTagTypesDocument, fetchPolicy }),
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
  ])

  return {
    items: (itemsResult.data?.items ?? []) as unknown as Item[],
    tags: (tagsResult.data?.tags ?? []) as unknown as Tag[],
    tagTypes: (tagTypesResult.data?.tagTypes ?? []) as unknown as TagType[],
    vendors: (vendorsResult.data?.vendors ?? []) as unknown as Vendor[],
    recipes: (recipesResult.data?.recipes ?? []) as unknown as Recipe[],
    inventoryLogs: (inventoryLogsResult.data?.inventoryLogs ??
      []) as unknown as InventoryLog[],
    shoppingCarts: (shoppingCartsResult.data?.allCarts ??
      []) as unknown as ShoppingCart[],
    cartItems: (allCartItemsResult.data?.allCartItems ??
      []) as unknown as CartItem[],
    shelves: (shelvesResult.data?.shelves ?? []) as unknown as Shelf[],
  }
}

// ---------------------------------------------------------------------------
// Batched bulk create — processes each entity array in chunks of BATCH_SIZE.
// Skips batches already recorded in session.completedBatchKeys.
// Calls onProgress after each successful batch.
// Entity order: tagTypes → tags → vendors → items → recipes → inventoryLogs →
//               shoppingCarts → cartItems
// ---------------------------------------------------------------------------

interface BatchedBulkArgs {
  client: ApolloClient
  data: ExportPayload
  session: ImportSession
  onProgress: (p: ImportProgress) => void
  startCompleted: number
  totalBatches: number
}

async function bulkCreate(args: BatchedBulkArgs): Promise<number> {
  const { client, data, session, onProgress, totalBatches } = args
  let completedBatches = args.startCompleted

  const entityGroups: Array<{
    entityType: string
    items: unknown[]
    mutate: (batch: unknown[]) => Promise<void>
  }> = [
    {
      entityType: 'tagTypes',
      items: data.tagTypes,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateTagTypesDocument,
            variables: {
              tagTypes: batch.map((t) =>
                toTagTypeInput(t as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'tags',
      items: data.tags,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateTagsDocument,
            variables: {
              tags: batch.map((t) => toTagInput(t as Record<string, unknown>)),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'vendors',
      items: data.vendors,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateVendorsDocument,
            variables: {
              vendors: batch.map((v) =>
                toVendorInput(v as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'items',
      items: data.items,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateItemsDocument,
            variables: {
              items: batch.map((i) =>
                toItemInput(i as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'recipes',
      items: data.recipes,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateRecipesDocument,
            variables: {
              recipes: batch.map((r) =>
                toRecipeInput(r as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'inventoryLogs',
      items: data.inventoryLogs,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateInventoryLogsDocument,
            variables: {
              logs: batch.map((l) =>
                toInventoryLogInput(l as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'shoppingCarts',
      items: data.shoppingCarts,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateShoppingCartsDocument,
            variables: {
              carts: batch.map((c) =>
                toShoppingCartInput(c as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'cartItems',
      items: data.cartItems,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateCartItemsDocument,
            variables: {
              cartItems: batch.map((ci) =>
                toCartItemInput(ci as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'shelves',
      items: data.shelves ?? [],
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateShelvesDocument,
            variables: {
              shelves: batch.map((s) =>
                toShelfInput(s as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
  ]

  for (const group of entityGroups) {
    const batches = chunk(group.items, BATCH_SIZE)
    for (const [i, batch] of batches.entries()) {
      const key = `${group.entityType}:${i}`
      if (session.completedBatchKeys.has(key)) {
        completedBatches++
        continue
      }
      await group.mutate(batch)
      session.completedBatchKeys.add(key)
      completedBatches++
      onProgress({
        completedBatches,
        totalBatches,
        currentEntity: group.entityType,
      })
    }
  }

  return completedBatches
}

// ---------------------------------------------------------------------------
// Batched bulk upsert — same structure as bulkCreate but uses Upsert mutations.
// ---------------------------------------------------------------------------

async function bulkUpsert(args: BatchedBulkArgs): Promise<number> {
  const { client, data, session, onProgress, totalBatches } = args
  let completedBatches = args.startCompleted

  const entityGroups: Array<{
    entityType: string
    items: unknown[]
    mutate: (batch: unknown[]) => Promise<void>
  }> = [
    {
      entityType: 'tagTypes',
      items: data.tagTypes,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertTagTypesDocument,
            variables: {
              tagTypes: batch.map((t) =>
                toTagTypeInput(t as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'tags',
      items: data.tags,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertTagsDocument,
            variables: {
              tags: batch.map((t) => toTagInput(t as Record<string, unknown>)),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'vendors',
      items: data.vendors,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertVendorsDocument,
            variables: {
              vendors: batch.map((v) =>
                toVendorInput(v as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'items',
      items: data.items,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertItemsDocument,
            variables: {
              items: batch.map((i) =>
                toItemInput(i as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'recipes',
      items: data.recipes,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertRecipesDocument,
            variables: {
              recipes: batch.map((r) =>
                toRecipeInput(r as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'inventoryLogs',
      items: data.inventoryLogs,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertInventoryLogsDocument,
            variables: {
              logs: batch.map((l) =>
                toInventoryLogInput(l as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'shoppingCarts',
      items: data.shoppingCarts,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertShoppingCartsDocument,
            variables: {
              carts: batch.map((c) =>
                toShoppingCartInput(c as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'cartItems',
      items: data.cartItems,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertCartItemsDocument,
            variables: {
              cartItems: batch.map((ci) =>
                toCartItemInput(ci as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'shelves',
      items: data.shelves ?? [],
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertShelvesDocument,
            variables: {
              shelves: batch.map((s) =>
                toShelfInput(s as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
  ]

  for (const group of entityGroups) {
    const batches = chunk(group.items, BATCH_SIZE)
    for (const [i, batch] of batches.entries()) {
      const key = `${group.entityType}:${i}`
      if (session.completedBatchKeys.has(key)) {
        completedBatches++
        continue
      }
      await group.mutate(batch)
      session.completedBatchKeys.add(key)
      completedBatches++
      onProgress({
        completedBatches,
        totalBatches,
        currentEntity: group.entityType,
      })
    }
  }

  return completedBatches
}

function computeTotalBatches(data: ExportPayload): number {
  return (
    chunk(data.tagTypes, BATCH_SIZE).length +
    chunk(data.tags, BATCH_SIZE).length +
    chunk(data.vendors, BATCH_SIZE).length +
    chunk(data.items, BATCH_SIZE).length +
    chunk(data.recipes, BATCH_SIZE).length +
    chunk(data.inventoryLogs, BATCH_SIZE).length +
    chunk(data.shoppingCarts, BATCH_SIZE).length +
    chunk(data.cartItems, BATCH_SIZE).length +
    chunk(data.shelves ?? [], BATCH_SIZE).length
  )
}

export async function importCloudData(
  rawPayload: ExportPayload,
  strategy: ImportStrategy,
  client: ApolloClient,
  options?: {
    onProgress?: (p: ImportProgress) => void
    session?: ImportSession
    // Which location's stock to send. Cloud has no per-location ItemStock, so a
    // local (post-v15) payload is collapsed onto this one location. Defaults to
    // the default location; callers thread `useActiveLocation().activeLocationId`.
    locationId?: string
  },
): Promise<void> {
  // Mirror of `importLocalData`'s `upgradeLegacyPayload`: collapse the local
  // split shape down to the flat shape cloud expects, before anything reads
  // the payload (conflict detection, partitioning and batching all see it).
  const payload = flattenPayloadForCloud(
    rawPayload,
    options?.locationId ?? DEFAULT_LOCATION_ID,
  )
  const onProgress = options?.onProgress ?? (() => undefined)
  const session: ImportSession = options?.session ?? {
    payload,
    strategy,
    completedBatchKeys: new Set(),
  }

  try {
    if (strategy === 'clear') {
      const totalBatches = computeTotalBatches(payload)
      onProgress({ completedBatches: 0, totalBatches, currentEntity: '' })
      await client.mutate({ mutation: ClearAllDataDocument })
      await bulkCreate({
        client,
        data: payload,
        session,
        onProgress,
        startCompleted: 0,
        totalBatches,
      })
      await client.resetStore()
      return
    }

    const existing = await fetchCloudExistingData(client)
    const conflicts = detectConflicts(payload, existing)

    if (strategy === 'skip') {
      const { toCreate } = partitionPayload(payload, conflicts, 'skip')
      const totalBatches = computeTotalBatches(toCreate)
      onProgress({ completedBatches: 0, totalBatches, currentEntity: '' })
      await bulkCreate({
        client,
        data: toCreate,
        session,
        onProgress,
        startCompleted: 0,
        totalBatches,
      })

      // For conflicting shelves in "skip" mode: merge newly created item IDs into cloud shelf
      const newItemIds = new Set(
        (toCreate.items as Array<{ id: string }>).map((i) => i.id),
      )
      const payloadShelvesMap = new Map(
        (
          (payload.shelves ?? []) as Array<{ id: string; itemIds?: string[] }>
        ).map((s) => [s.id, s]),
      )
      for (const conflictEntry of conflicts.shelves) {
        const payloadShelf = payloadShelvesMap.get(conflictEntry.id)
        if (!payloadShelf?.itemIds?.length) continue
        const addedIds = payloadShelf.itemIds.filter((id) => newItemIds.has(id))
        if (!addedIds.length) continue
        const existingShelf = existing.shelves.find(
          (s) => s.id === conflictEntry.id,
        )
        if (!existingShelf) continue
        const existingItemIds =
          (existingShelf.itemIds as string[] | null | undefined) ?? []
        const mergedIds = [...new Set([...existingItemIds, ...addedIds])]
        await client.mutate<UpdateShelfMutation>({
          mutation: UpdateShelfDocument,
          variables: { id: conflictEntry.id, itemIds: mergedIds },
        })
      }

      // For conflicting recipes in "skip" mode: merge newly added ingredient items into cloud recipe
      const payloadRecipesMap = new Map(
        (
          payload.recipes as Array<{
            id: string
            items?: Array<{ itemId: string; defaultAmount: number }>
          }>
        ).map((r) => [r.id, r]),
      )
      for (const conflictEntry of conflicts.recipes) {
        const payloadRecipe = payloadRecipesMap.get(conflictEntry.id)
        if (!payloadRecipe?.items?.length) continue
        const newIngredients = payloadRecipe.items.filter((ri) =>
          newItemIds.has(ri.itemId),
        )
        if (!newIngredients.length) continue
        const existingRecipe = existing.recipes.find(
          (r) => r.id === conflictEntry.id,
        )
        if (!existingRecipe) continue
        const existingItemIds = new Set(
          (
            (existingRecipe.items as
              | Array<{ itemId: string }>
              | null
              | undefined) ?? []
          ).map((ri) => ri.itemId),
        )
        const addedIngredients = newIngredients.filter(
          (ri) => !existingItemIds.has(ri.itemId),
        )
        if (!addedIngredients.length) continue
        const mergedItems = [
          ...((existingRecipe.items as
            | Array<{ itemId: string; defaultAmount: number }>
            | null
            | undefined) ?? []),
          ...addedIngredients,
        ]
        await client.mutate<UpdateRecipeMutation>({
          mutation: UpdateRecipeDocument,
          variables: { id: conflictEntry.id, items: mergedItems },
        })
      }

      await client.resetStore()
      return
    }

    // strategy === 'replace'
    const { toCreate, toUpsert } = partitionPayload(
      payload,
      conflicts,
      'replace',
    )
    const totalBatches =
      computeTotalBatches(toCreate) + computeTotalBatches(toUpsert)
    onProgress({ completedBatches: 0, totalBatches, currentEntity: '' })
    const afterCreate = await bulkCreate({
      client,
      data: toCreate,
      session,
      onProgress,
      startCompleted: 0,
      totalBatches,
    })
    await bulkUpsert({
      client,
      data: toUpsert,
      session,
      onProgress,
      startCompleted: afterCreate,
      totalBatches,
    })
    await client.resetStore()
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    ;(error as Error & { session: ImportSession }).session = session
    throw error
  }
}
