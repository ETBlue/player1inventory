import type { ApolloClient } from '@apollo/client'
import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { db, ensureDefaultLocationRow } from '@/db'
import { bootstrapCarts } from '@/db/operations'
import {
  AllCartItemsDocument,
  type AllCartItemsQuery,
  BulkCreateCartItemsDocument,
  BulkCreateInventoryLogsDocument,
  BulkCreateItemStocksDocument,
  BulkCreateItemsDocument,
  BulkCreateLocationsDocument,
  BulkCreateRecipesDocument,
  BulkCreateShelvesDocument,
  BulkCreateShoppingCartsDocument,
  BulkCreateTagsDocument,
  BulkCreateTagTypesDocument,
  BulkCreateVendorsDocument,
  BulkUpsertCartItemsDocument,
  BulkUpsertInventoryLogsDocument,
  BulkUpsertItemStocksDocument,
  BulkUpsertItemsDocument,
  BulkUpsertLocationsDocument,
  BulkUpsertRecipesDocument,
  BulkUpsertShelvesDocument,
  BulkUpsertShoppingCartsDocument,
  BulkUpsertTagsDocument,
  BulkUpsertTagTypesDocument,
  BulkUpsertVendorsDocument,
  ClearAllDataDocument,
  CreateLocationDocument,
  type CreateLocationMutation,
  DeleteLocationDocument,
  GetItemsDocument,
  type GetItemsQuery,
  GetLocationsDocument,
  type GetLocationsQuery,
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
  ImportCheckDocument,
  type ImportCheckInput,
  type ImportCheckQuery,
  type ImportCheckQueryVariables,
  InventoryLogsDocument,
  type InventoryLogsQuery,
  type ItemInput,
  ItemStockIdsAtLocationDocument,
  type ItemStockIdsAtLocationQuery,
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
import { cartIdFor, DEFAULT_LOCATION_ID, parseCartId } from '@/types'
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

const DATE_FIELD_KEYS = ['dueDate', 'createdAt', 'updatedAt'] as const

// createdAt/updatedAt are required on an ItemStock; dueDate is genuinely
// optional. An absent timestamp is not harmless: `addItemToLocation` picks its
// source row with `b.updatedAt.getTime()`, which throws on an undefined one.
const REQUIRED_STOCK_DATE_KEYS = ['createdAt', 'updatedAt'] as const

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string)
}

// The OPTIONAL half of the item's global stock configuration.
//
// `JSON.stringify` writes an absent optional field as `null` on a cloud
// payload, and `Item` declares each of these as `number | string | undefined` —
// never `null`. So a `null` in the file has to become an ABSENT KEY, not a
// stored `null`, or the row in Dexie contradicts its own type.
//
// `targetUnit` and `consumeAmount` are deliberately NOT here even though they
// are part of `GLOBAL_STOCK_FIELD_KEYS`: both are REQUIRED on `Item`, so
// deleting them would replace one invalid row with another.
const NULLABLE_ITEM_CONFIG_KEYS = [
  'packageUnit',
  'measurementUnit',
  'amountPerPackage',
  'estimatedDueDays',
  'expirationThreshold',
  'expirationMode',
] as const

// Convert item date fields from ISO strings (as stored in JSON) to Date objects,
// and drop a `null` on any optional configuration field — see above. The stock
// rows get the same treatment for their date fields in `deserializeItemStock`.
function deserializeItem(rawItem: Item): Item {
  const item: Item & Record<string, unknown> = {
    ...rawItem,
    createdAt: toDate(rawItem.createdAt),
    updatedAt: toDate(rawItem.updatedAt),
  }
  for (const key of NULLABLE_ITEM_CONFIG_KEYS) {
    if (item[key] === null) delete item[key]
  }
  return item
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

// `isDefault` (Dexie v18) is DERIVED here, not copied from the file.
//
// WHY THIS IS CORRECT, AND WHY IT DIFFERS FROM THE SHARED COPY IN
// lib/deserialization.ts (which keeps `isDefault` exactly as given).
//
// Locally the flag and the id are the same fact: the v18 upgrade fn sets
// `isDefault = (id === DEFAULT_LOCATION_ID)` (db/index.ts) and
// `ensureDefaultLocation` only ever creates that one id. So in this database
// `isDefault` is true for exactly the row whose id is DEFAULT_LOCATION_ID,
// and deriving it keeps that invariant whatever the file says.
//
// THE FILE'S OWN FLAG IS NOT IGNORED — it is read one step earlier, by
// `findPayloadDefaultLocationId`, and the remap in `importLocalData` has
// already rewritten the payload default's id to DEFAULT_LOCATION_ID by the
// time this function sees the row. Deriving then flags exactly that row. Two
// cases need the derive rather than the flag:
//   - a PRE-v18 backup carries no `isDefault` key at all, so copying it would
//     leave zero rows flagged (`ensureDefaultLocationRow` returns early when
//     the `local` row already exists, so it would not repair it);
//   - a hand-edited file naming two defaults cannot produce two flagged rows.
//
// The shared copy in lib/deserialization.ts reads CLOUD rows, where the
// default's id is a server cuid and the flag is the only way to know. Do not
// merge the two.
function deserializeLocation(raw: Record<string, unknown>): Location {
  return {
    ...raw,
    isDefault: raw.id === DEFAULT_LOCATION_ID,
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

// Upgrade a pre-v15 backup to the split shape the local database expects
// since v15:
//   - synthesise one ItemStock per item, in `locationId`, and strip the inline
//     stock fields
//   - re-key carts and cart items to `${locationId}:${vendorId|'no-vendor'}`
//
// This header used to say "a pre-v15 backup (or a cloud payload, which keeps
// stock inline on the Item)". That stopped being true in PR 4b task 2: a cloud
// export now carries `itemStocks` and `locations` of its own, so it takes the
// already-split branch below. Absence of `itemStocks` now means "pre-v15 file"
// and nothing else.
//
// A payload that already carries `itemStocks` is post-v15 — but only for the
// items it actually has stock rows for; see `upgradeUnsplitItems`.
//
// `locationId` is where a PRE-v15 payload's synthesised stock and re-keyed
// carts are placed, because such a payload names no location of its own. It
// defaults to the default location for callers with no active location
// (boot-time and legacy paths); the two UI call sites pass the active one
// (components/settings/DataModeCard and ImportCard).
//
// IT NO LONGER DECIDES WHERE A CLOUD BACKUP LANDS. This paragraph used to
// quote the outbound rule "use the location ACTIVE at migration time", because
// a cloud payload carried no locations and had to be collapsed onto one. Since
// PR 4b a cloud backup carries its own `locations` and `itemStocks`, and
// `importLocalData`'s remap places them — so for any post-v15 payload this
// parameter only affects items that still carry inline stock.
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

// ---------------------------------------------------------------------------
// THE REMAP RULE — cloud locations PR 4 design §1.
//
//   Preserve payload location ids verbatim, except the payload's default,
//   which maps onto the destination's default.
//
// One rule, used in both directions. It replaces three separate location
// decisions: `flattenPayloadForCloud`'s chosen location and
// `resolveFlattenLocationId`'s fallback (both deleted in PR 4b task 3), and
// the import resolvers' hardcoded `ensureDefaultLocation` (PR 4a).
//
// In cloud, "the destination's default" is the household's FIRST location:
// a household has no default location since households task 3.12.
//
// Why ONLY the default remaps: a cloud -> local -> cloud round trip then
// preserves every id, and carts keep upserting by their composite
// `${locationId}:${vendorId}` id. Only a FIRST copy between modes rewrites
// anything, and only one location's worth.
// ---------------------------------------------------------------------------

// Which location the payload itself calls its default.
//
// Three answers, in this order:
//
//   1. The row flagged `isDefault: true`. Dexie v18 carries the flag on every
//      local row. Cloud backups made BEFORE households task 3.12 carry it too:
//      `sanitiseCloudPayload` (lib/exportData.ts) kept it in the file.
//   2. The row whose id is `DEFAULT_LOCATION_ID`. This is for a PRE-v18 local
//      backup, which has no `isDefault` key at all: in local mode the default
//      has always been that one id.
//   3. The location with the lowest `order`, but ONLY when no row carries an
//      `isDefault` key at all. That is the shape of a cloud backup made since
//      task 3.12. A household has no default location, so cloud rows carry no
//      flag, and the cloud side treats the FIRST location as the fallback
//      everywhere else (`useActiveLocation`).
//      Without this answer, a cloud backup restored into local mode would keep
//      its "Home" as an extra location next to "My Home", and the
//      cloud -> local copy would do the same.
//
//      A file whose rows carry the key but none is `true` gets NO default.
//      Every local (v18+) export flags exactly one row, so only a hand-edited
//      file looks like that, and guessing would rename a location the user
//      did not choose.
//
// `null` means no default was found. Nothing is remapped then. A pre-v15
// file with no `locations` array always lands here, which is right: such a
// payload carries no per-location ids to rewrite either.
function findPayloadDefaultLocationId(payload: ExportPayload): string | null {
  const locations = (payload.locations ?? []) as Array<Record<string, unknown>>
  const flagged = locations.find((row) => row.isDefault === true)
  if (flagged !== undefined) return flagged.id as string
  const legacyDefault = locations.find((row) => row.id === DEFAULT_LOCATION_ID)
  if (legacyDefault !== undefined) return legacyDefault.id as string
  if (locations.some((row) => 'isDefault' in row)) return null
  let first: Record<string, unknown> | undefined
  for (const row of locations) {
    if (first === undefined || (row.order as number) < (first.order as number))
      first = row
  }
  return first !== undefined ? (first.id as string) : null
}

// Build the payload-id -> destination-id map. It holds AT MOST ONE
// non-identity entry, by design; any id absent from the map is kept verbatim.
//
// SINCE HOUSEHOLDS H4 TASK E.4 ONLY THE LOCAL SIDE CALLS THIS. The cloud side
// uses `placeDefaultLocation` (the new id rule). The paragraphs below about
// the cloud destination describe the cloud path before E.4. They are kept as
// history: task E.5 kept this function for the local side and only added the
// `payloadDefaultLocationId` parameter, so the cloud -> local copy can name
// the cloud ACTIVE location.
//
// `destinationLocationIds` is EVERY location id the destination holds now, not
// only its default. When the payload's default is one of them, nothing is
// remapped: the backup is going back into the household it came from, and its
// default location still exists there under its own id.
//
// Why this matters since households task 3.12: in cloud the "destination
// default" is the household's FIRST location by `order`, and that can be a
// location the backup does not contain. Back up a household with Home (order
// 0) and Garage, later add Attic and drag it to the top, then restore with
// `skip` or `replace`. Without this check the remap is Home -> Attic. What
// that does in cloud (read from apps/server/src/resolvers/import.resolver.ts):
//
//   - Attic is NOT renamed. Both strategies send `locations` on the create
//     pass only (`partitionPayload`), and `bulkCreateLocations` skips an id
//     that exists. The payload's Home row now carries Attic's id, so it is
//     skipped and Attic keeps its name.
//   - Every row the import CREATES lands under Attic: a stock row, log or
//     cart item whose id the destination no longer holds, and a new
//     `Attic:<vendor>` cart for each of Home's carts.
//   - A row that EXISTS mostly stays at Home. `bulkUpsertItemStocks` updates
//     the quantities only, and `bulkUpsertInventoryLogs` writes `locationId`
//     in `create` only. A cart item under `replace` stays at Home too, since
//     households H3b task B.7: `bulkUpsertCartItems` writes by
//     `(cartId, itemId)` and never moves a row, so the existing row is left
//     alone and the Attic cart gets the amount (a new row, or its own row's
//     amount set). Before B.7 it wrote `cartId` in `update`, and the existing
//     cart item moved into the Attic cart.
//
// The rename IS real in local mode, where `replace` and `clear` write
// locations with `bulkPut` (`importLocations`). But the local side never
// reaches this check (see the last paragraph), so this paragraph is about
// cloud only. Before task 3.12 the cloud destination default was the
// `isDefault` row, which had the backup's default id, so the remap was the
// identity and none of this could happen.
//
// A FIRST copy between modes or accounts is unchanged: there the payload's
// default id is not in the destination, so it still lands on the destination
// default. After a `clear` the destination holds only the new "Home", so the
// same is true.
//
// The local side passes no set. Its destination default is always
// DEFAULT_LOCATION_ID, and a local backup always flags that same id, so a
// local -> local restore is already the identity.
export function buildLocationRemap(
  payload: ExportPayload,
  destinationDefaultLocationId: string | null,
  destinationLocationIds: ReadonlySet<string> = new Set(),
  // The payload location to map onto the destination default. Left out, the
  // file's own default (`findPayloadDefaultLocationId`). `importLocalData`
  // passes the cloud ACTIVE location here for the cloud -> local copy
  // (households H4 task E.5).
  payloadDefaultLocationId: string | null = findPayloadDefaultLocationId(
    payload,
  ),
): Map<string, string> {
  const remap = new Map<string, string>()
  if (destinationDefaultLocationId === null) return remap
  if (payloadDefaultLocationId === null) return remap
  if (payloadDefaultLocationId === destinationDefaultLocationId) return remap
  if (destinationLocationIds.has(payloadDefaultLocationId)) return remap

  // The destination's default id is already held by a DIFFERENT row in this
  // payload. Remapping would give two payload rows the same id, and the write
  // that follows keeps only one of them — a location would simply disappear.
  // So keep every id verbatim instead.
  //
  // Nothing is lost by doing so. The remap exists only to stop a SECOND,
  // stray default row appearing beside the destination's own, and that cannot
  // happen when the destination's default id is in the payload already: that
  // row is written, and on the local side `deserializeLocation` flags it.
  //
  // Only a hand-edited file reaches this branch. Neither exporter can write a
  // payload whose default is one row while another row holds the destination's
  // default id.
  const locations = (payload.locations ?? []) as Array<Record<string, unknown>>
  if (locations.some((row) => row.id === destinationDefaultLocationId)) {
    return remap
  }

  remap.set(payloadDefaultLocationId, destinationDefaultLocationId)
  return remap
}

// Rewrite every location id the payload carries, through `remap`.
//
// FIVE fields carry one, not the four the plan lists. `locations[].id` is
// remapped as well, so the payload's default row lands ON the destination's
// existing default instead of creating a second, stray location beside it.
// `bulkCreateLocations` then finds that id already held by the caller's own row
// and skips it (apps/server/src/resolvers/import.resolver.ts), which is what
// the design means by "the payload's default is never uploaded as a row". On
// the cloud -> local side the same rewrite puts that row on
// DEFAULT_LOCATION_ID, where `deserializeLocation` flags it and
// `ensureDefaultLocationRow` therefore adds nothing.
//
// Cart ids go through `parseCartId` / `cartIdFor`, never `split(':')`: a vendor
// id may itself contain a colon, because `bulkCreateVendors` stores
// `VendorInput.id` verbatim with no format check, and
// apps/server/src/lib/cartIdRules.test.ts pins 16 cases including that one. A BARE
// cart id (no colon at all) parses as `{ locationId: <the whole id> }`, which
// no real location matches, so it is left alone — a legacy payload keeps its
// legacy ids.
export function applyLocationRemap(
  payload: ExportPayload,
  remap: Map<string, string>,
): ExportPayload {
  if (remap.size === 0) return payload

  const remapId = (id: string) => remap.get(id) ?? id
  const remapCartId = (cartId: string) => {
    const { locationId, vendorId } = parseCartId(cartId)
    const mapped = remap.get(locationId)
    return mapped === undefined ? cartId : cartIdFor(mapped, vendorId)
  }

  return {
    ...payload,
    ...(payload.locations !== undefined
      ? {
          locations: (payload.locations as Array<Record<string, unknown>>).map(
            (row) => ({ ...row, id: remapId(row.id as string) }),
          ),
        }
      : {}),
    ...(payload.itemStocks !== undefined
      ? {
          itemStocks: (
            payload.itemStocks as Array<Record<string, unknown>>
          ).map((row) => ({
            ...row,
            locationId: remapId(row.locationId as string),
          })),
        }
      : {}),
    // A pre-Location log carries no `locationId`, and it is left absent here.
    // Since households H4 task E.3 the server REFUSES such a log with
    // IMPORT_NEEDS_LOCATION (it used to send it to the caller's first
    // location). H4 task E.4 replaces this function and must give such a
    // log the location the user picks.
    inventoryLogs: (
      payload.inventoryLogs as Array<Record<string, unknown>>
    ).map((log) =>
      log.locationId == null
        ? log
        : { ...log, locationId: remapId(log.locationId as string) },
    ),
    shoppingCarts: (
      payload.shoppingCarts as Array<Record<string, unknown>>
    ).map((cart) => ({ ...cart, id: remapCartId(cart.id as string) })),
    cartItems: (payload.cartItems as Array<Record<string, unknown>>).map(
      (cartItem) => ({
        ...cartItem,
        cartId: remapCartId(cartItem.cartId as string),
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// THE ID RULE FOR A CLOUD IMPORT (households design, "The new id rule";
// households H4 decision T16). It replaced PR 4b's remap rule on the cloud
// side in task E.4.
//
//   1. Keep every id of the file.
//   2. Except the local default location, id `'local'`
//      (DEFAULT_LOCATION_ID). Its rows go to the location the user picks in
//      the "Import into which location?" dialog, or, on `clear`, to the new
//      "Home" that `clearAllData` creates (decision O2).
//   3. A file with no locations, or with no stock rows (a backup made before
//      locations or before the v15 split), is upgraded into that location
//      too.
//
// The cloud never has a location with the id `'local'`: both location imports
// refuse it (decision T12). So the `'local'` row can never be uploaded as it
// is, and its rows must always go somewhere the user chose.
//
// The local side (`importLocalData`) still uses PR 4b's remap rule
// (`buildLocationRemap`), with one change since households H4 task E.5: the
// cloud -> local copy names the payload location that becomes local "My Home"
// (`homeLocationId`, the cloud active location, decision T18). A backup file
// imported in local mode does not, and keeps the old rule (decision O4).
// ---------------------------------------------------------------------------

/**
 * Whether a cloud import of this file needs the user to pick a location
 * (households design rule 3). True when the file has:
 *
 * - the local default location (`'local'`), or
 * - no `locations` key (a backup made before locations), or
 * - no `itemStocks` key (a backup made before the v15 split: its stock is
 *   inline on the items and is put into the picked location), or
 * - a log with no `locationId` (the server refuses such a log with
 *   `IMPORT_NEEDS_LOCATION` since households H4 task E.3).
 *
 * The `clear` strategy never asks (decision O2): after the clear the
 * household has one location, the new "Home".
 */
export function needsImportLocation(payload: ExportPayload): boolean {
  if (payload.locations === undefined) return true
  if (payload.itemStocks === undefined) return true
  const locations = payload.locations as Array<Record<string, unknown>>
  if (locations.some((row) => row.id === DEFAULT_LOCATION_ID)) return true
  const logs = payload.inventoryLogs as Array<Record<string, unknown>>
  return logs.some((log) => log.locationId == null)
}

/**
 * Put the file's local default location (`'local'`) at `targetLocationId`
 * (households H4 decision T16). Every other id is kept.
 *
 * In this order:
 *
 * 1. A backup with no `itemStocks` key (made before the v15 split) is
 *    upgraded: one stock row per item at `targetLocationId`, and its bare
 *    cart ids get the `${targetLocationId}:` prefix (`upgradeLegacyPayload`).
 *    A payload that HAS `itemStocks` is not touched by this step, on purpose:
 *    `upgradeUnsplitItems` would make a second stock row for an item whose
 *    real rows are already in the file.
 * 2. Every log with no `locationId` gets `targetLocationId`. The server
 *    refuses such a log (`IMPORT_NEEDS_LOCATION`, households H4 task E.3).
 * 3. The id `'local'` becomes `targetLocationId` in five fields: the location
 *    row, stock rows, logs, cart ids and the cart ids of cart items
 *    (`applyLocationRemap`). When the file already has a location row with
 *    the id `targetLocationId`, the `'local'` row is dropped instead, so no
 *    two rows share one id. Its rows still move there.
 *
 * When the `'local'` row lands on a location the household already has,
 * `bulkCreateLocations` skips it, so that location keeps its own name.
 *
 * Calling it a second time with another target moves `'local'` only if it is
 * still there. So `placeDefaultLocation(placeDefaultLocation(p, 'local'), id)`
 * gives the same rows as `placeDefaultLocation(p, id)`, with the same ids.
 * `importCloudData` uses that on `clear` and for a new location, where the
 * real id is known only after the check.
 */
export function placeDefaultLocation(
  payload: ExportPayload,
  targetLocationId: string,
): ExportPayload {
  const upgraded =
    payload.itemStocks === undefined
      ? upgradeLegacyPayload(payload, targetLocationId)
      : payload
  const withLogLocations: ExportPayload = {
    ...upgraded,
    inventoryLogs: (
      upgraded.inventoryLogs as Array<Record<string, unknown>>
    ).map((log) =>
      log.locationId == null ? { ...log, locationId: targetLocationId } : log,
    ),
  }
  if (targetLocationId === DEFAULT_LOCATION_ID) return withLogLocations
  const locations = withLogLocations.locations as
    | Array<Record<string, unknown>>
    | undefined
  const deduped =
    locations?.some((row) => row.id === targetLocationId) === true
      ? {
          ...withLogLocations,
          locations: locations.filter((row) => row.id !== DEFAULT_LOCATION_ID),
        }
      : withLogLocations
  return applyLocationRemap(
    deduped,
    new Map([[DEFAULT_LOCATION_ID, targetLocationId]]),
  )
}

/** What a cloud import left out, for the line the import card shows (decision O5). */
export interface ImportSkipped {
  /**
   * Names of the locations the file has a row for, where the caller cannot
   * write. Every row the file puts there was left out. In file order.
   */
  locationNames: string[]
  /**
   * How many other rows were left out: rows at a location the file has no
   * row for, rows at a location that does not exist, stock rows of an item
   * that does not exist, and rows stored at a location the caller cannot
   * write. The web does not ask the server for those location names: the
   * caller may have no role there.
   */
  rowCount: number
}

/** The answer of a finished cloud import. */
export interface CloudImportResult {
  skipped: ImportSkipped
  // The location the caller should make active now (owner decision of
  // 2026-11-17, option B; see `locationToShowAfterImport`). The key is
  // absent when the active location should stay as it is.
  switchToLocationId?: string
}

/**
 * Leave out every row `checkImportIds` says the import cannot write
 * (households H4 task E.4, step 2.3). Without this, the mutation that sends
 * such a row refuses its whole batch, after the batches before it were
 * written.
 *
 * - a location the caller cannot write (`blockedLocationIds`): its location
 *   row, and every stock row, log and cart at it;
 * - a location no row will hold (`missingLocationIds`): every stock row, log
 *   and cart that points at it;
 * - an item no row will hold (`missingItemIds`): its stock rows;
 * - exactly the rows in `blockedRows`;
 * - every cart item in a cart that is left out, or whose cart id names a
 *   left-out location.
 *
 * `renameBlockedLocationIds` needs nothing here: the web never sends a
 * location to `bulkUpsertLocations` (`partitionPayload` puts every location
 * on the create pass, which asks `participant` only).
 */
export function withoutRefusedRows(
  payload: ExportPayload,
  check: ImportIdCheck,
): { payload: ExportPayload; skipped: ImportSkipped } {
  const blocked = new Set(check.blockedLocationIds)
  const refused = new Set([
    ...check.blockedLocationIds,
    ...check.missingLocationIds,
  ])
  const missingItems = new Set(check.missingItemIds)
  const blockedRows = {
    inventoryLogs: new Set(check.blockedRows.inventoryLogs),
    itemStocks: new Set(check.blockedRows.itemStocks),
    carts: new Set(check.blockedRows.carts),
    cartItems: new Set(check.blockedRows.cartItems),
  }
  const locationRows = (payload.locations ?? []) as Array<
    Record<string, unknown>
  >
  const namedBlocked = new Set(
    locationRows.map((row) => row.id as string).filter((id) => blocked.has(id)),
  )
  let rowCount = 0
  // A row left out because its location is a blocked location the file has
  // a row for is counted under that location's name, not in `rowCount`.
  const leaveOut = (locationId: string | undefined, other: boolean) => {
    const atNamed = locationId !== undefined && namedBlocked.has(locationId)
    const out = (locationId !== undefined && refused.has(locationId)) || other
    if (out && !atNamed) rowCount++
    return out
  }
  const prefixOf = (cartId: unknown) =>
    typeof cartId === 'string' && cartId.includes(':')
      ? parseCartId(cartId).locationId
      : undefined

  const itemStocks = (
    (payload.itemStocks ?? []) as Array<Record<string, unknown>>
  ).filter(
    (row) =>
      !leaveOut(
        row.locationId as string,
        missingItems.has(row.itemId as string) ||
          blockedRows.itemStocks.has(row.id as string),
      ),
  )
  const inventoryLogs = (
    payload.inventoryLogs as Array<Record<string, unknown>>
  ).filter(
    (row) =>
      !leaveOut(
        row.locationId as string | undefined,
        blockedRows.inventoryLogs.has(row.id as string),
      ),
  )
  const droppedCarts = new Set<string>()
  const shoppingCarts = (
    payload.shoppingCarts as Array<Record<string, unknown>>
  ).filter((row) => {
    const out = leaveOut(
      prefixOf(row.id),
      blockedRows.carts.has(row.id as string),
    )
    if (out) droppedCarts.add(row.id as string)
    return !out
  })
  const cartItems = (
    payload.cartItems as Array<Record<string, unknown>>
  ).filter(
    (row) =>
      !leaveOut(
        prefixOf(row.cartId),
        droppedCarts.has(row.cartId as string) ||
          blockedRows.cartItems.has(row.id as string),
      ),
  )

  return {
    payload: {
      ...payload,
      ...(payload.locations !== undefined
        ? {
            locations: locationRows.filter(
              (row) => !blocked.has(row.id as string),
            ),
          }
        : {}),
      ...(payload.itemStocks !== undefined ? { itemStocks } : {}),
      inventoryLogs,
      shoppingCarts,
      cartItems,
    },
    skipped: {
      locationNames: locationRows
        .filter((row) => namedBlocked.has(row.id as string))
        .map((row) => row.name as string),
      rowCount,
    },
  }
}

/** A location the import may put the file's default location into. */
export interface ImportTargetLocation {
  id: string
  name: string
}

/**
 * The locations the "Import into which location?" dialog offers: the
 * household's locations where the caller is `participant` or higher, by
 * `order` (households H4 task E.4, step 3).
 *
 * It asks `importCheck` with every listed location as a `locationRefs` id,
 * and leaves out the ones it reports in `blockedLocationIds` (viewer) or
 * `missingLocationIds` (deleted since the list was read). When this was
 * written (H4) the web did not know location roles. Since households H5
 * task F.1 `GetLocations` carries `myRole`, but the server's answer is still
 * used: it also finds a location deleted since the list was read. This adds no new GraphQL field, so a new web bundle
 * against an old server breaks only the import, which needs `importCheck`
 * anyway (decision T9). A field on `Location` would break `GetLocations`,
 * and with it the whole app, in that window.
 *
 * Needs the household role `manager`, the same as the import.
 */
export async function fetchImportTargetLocations(
  client: ApolloClient,
): Promise<ImportTargetLocation[]> {
  const result = await client.query<GetLocationsQuery>({
    query: GetLocationsDocument,
    fetchPolicy: 'network-only',
  })
  const locations = result.data?.locations ?? []
  if (locations.length === 0) return []
  const check = await client.query<ImportCheckQuery, ImportCheckQueryVariables>(
    {
      query: ImportCheckDocument,
      variables: {
        ids: { locationRefs: locations.map((location) => location.id) },
        forClear: false,
      },
      fetchPolicy: 'no-cache',
    },
  )
  const answer = check.data?.importCheck
  if (!answer) throw new Error('importCheck returned no data')
  const unusable = new Set([
    ...answer.blockedLocationIds,
    ...answer.missingLocationIds,
  ])
  return locations
    .filter((location) => !unusable.has(location.id))
    .map((location) => ({ id: location.id, name: location.name }))
}

/**
 * The name the dialog's "New location" field starts with (decision O6): the
 * name of the file's local default location, or `''` when the file has none.
 */
export function defaultImportLocationName(payload: ExportPayload): string {
  const row = (
    (payload.locations ?? []) as Array<Record<string, unknown>>
  ).find((location) => location.id === DEFAULT_LOCATION_ID)
  return typeof row?.name === 'string' ? row.name : ''
}

/** Where `importCloudData` puts the file's local default location. */
export type ImportTarget = { locationId: string } | { newLocationName: string }

/**
 * A cloud import refused before anything was written, by `importCheck`
 * (households H4 decision T17):
 *
 * - `anotherHousehold`: the file holds a row or location of another
 *   household. The card says `settings.import.importErrorForbidden`.
 * - `role`: the caller is not an owner or a manager (or not the owner, for
 *   `clear`). The card says `settings.import.importErrorRole`.
 *
 * A `FORBIDDEN` from a BULK mutation is not this error. It comes after some
 * batches were written (a race with another import or a role change), and
 * `isForbiddenImportError` reports it.
 */
export class ImportRefusedError extends Error {
  readonly reason: 'anotherHousehold' | 'role'
  constructor(reason: 'anotherHousehold' | 'role') {
    super(
      reason === 'role'
        ? 'Only the owner or a manager can import data.'
        : 'Some rows in this file belong to another household.',
    )
    this.name = 'ImportRefusedError'
    this.reason = reason
  }
}

/**
 * Which message a failed cloud import shows (households H4 decision T17).
 * `strategy` matters only for a `FORBIDDEN` from a bulk mutation: on `clear`
 * that refusal came after the household was cleared.
 */
export type ImportErrorKind =
  | 'role'
  | 'forbidden'
  | 'forbiddenAfterClear'
  | 'other'

export function importErrorKind(
  err: unknown,
  strategy: ImportStrategy,
): ImportErrorKind {
  if (err instanceof ImportRefusedError) {
    return err.reason === 'role' ? 'role' : 'forbidden'
  }
  if (isForbiddenImportError(err)) {
    return strategy === 'clear' ? 'forbiddenAfterClear' : 'forbidden'
  }
  return 'other'
}

// The household's first location id, after `clearAllData`. The server returns
// the list by `order`; after a clear the only location is the new "Home".
//
// ── READ THIS AFTER `clearAllData`, NEVER BEFORE ──
//
// `clearAllData` deletes every `Location` row of the household, then creates
// a new "Home" location in the same transaction, with a NEW id. So an id read
// before the clear names a row that no longer exists by the time it is used.
// PR 4a shipped exactly that bug, and it cost a full E2E gate run to find,
// because no test fake models the deletion.
async function fetchHomeAfterClear(client: ApolloClient): Promise<string> {
  const result = await client.query<GetLocationsQuery>({
    query: GetLocationsDocument,
    fetchPolicy: 'network-only',
  })
  const id = result.data?.locations[0]?.id
  if (id === undefined) throw new Error('No location after clearing the data')
  return id
}

/**
 * Whether the import put anything into `locationId`: its location row, or a
 * stock row, log or cart there. Cart items go with their cart.
 */
function payloadUsesLocation(
  payload: ExportPayload,
  locationId: string,
): boolean {
  const at = (rows: readonly unknown[] | undefined, key: string) =>
    (rows ?? []).some((row) => stringField(row, key) === locationId)
  return (
    at(payload.locations, 'id') ||
    at(payload.itemStocks, 'locationId') ||
    at(payload.inventoryLogs, 'locationId') ||
    payload.shoppingCarts.some((row) => {
      const id = stringField(row, 'id')
      return (
        id?.includes(':') === true && parseCartId(id).locationId === locationId
      )
    })
  )
}

// Owner decision 6 of task E.4 (2026-11-16, choice A). `clearAllData` makes
// a fresh "Home". A cloud backup brings its own locations and puts nothing
// there, which used to leave an extra, empty "Home". So after a FINISHED
// `clear` import, delete it with the normal `deleteLocation` mutation (it
// sends the household's LOCATION live event as usual), when:
//
// - the import put no location row, stock row, log or cart there, and
// - the import created at least one location of its own, so the fresh Home
//   is not the household's last location. Until households H5 task F.7 the
//   server refused that delete (LAST_LOCATION). It allows it now, but this
//   check stays: a `clear` import of a backup with no locations must not
//   leave the household with none.
//
// A local backup always puts "My Home" there (`placeDefaultLocation`), so it
// is never deleted then.
//
// A failed delete does NOT fail the import: every row is written by then,
// and saying "import failed" would make the user retry a `clear` for an
// empty location. The extra "Home" stays, as before this decision, and the
// user can delete it on the locations page.
async function deleteHomeIfUnused(
  client: ApolloClient,
  payload: ExportPayload,
  home: string,
): Promise<void> {
  if (payloadUsesLocation(payload, home)) return
  if ((payload.locations ?? []).length === 0) return
  try {
    await client.mutate({
      mutation: DeleteLocationDocument,
      variables: { id: home },
    })
  } catch {
    // See the comment above: the import itself finished.
  }
}

// Owner decision of 2026-11-17 (option B). A `skip` or `replace` restore of
// a cloud backup into a new household writes the backup's locations beside
// the household's fresh "Home" (decision T16). The active location stays on
// that "Home", which holds nothing, so the pantry looks empty. So after a
// FINISHED `skip` or `replace` import, return the location to show instead:
//
// - only when the import did not ask "Import into which location?". There the
//   user picked where the rows go, so the import does not move them
//   somewhere else (the caller checks this);
// - only when the file brought at least one location (after the refused ones
//   were left out). Its first by `order` is the answer; a tie keeps the
//   file's order;
// - only when that is not already the active location;
// - only when the active location is EMPTY: it holds no `ItemStock` row,
//   read from the server AFTER the last write. The pantry lists stock rows
//   only, so "no stock row" is exactly "the pantry shows nothing". It is read
//   after the import, not before, so a same-household restore that put rows
//   back on the active location keeps it. A location with only logs or carts
//   still shows an empty pantry, so they do not count.
//
// Nothing is deleted (`clear` has decision 6 for that). A failed read does
// NOT fail the import, for the same reason as `deleteHomeIfUnused`: every row
// is written by then. The user stays where they are, as before this decision.
async function locationToShowAfterImport(
  client: ApolloClient,
  payload: ExportPayload,
  activeLocationId: string | undefined,
): Promise<string | undefined> {
  if (activeLocationId === undefined) return undefined
  const locations = (payload.locations ?? []) as Array<Record<string, unknown>>
  const first = [...locations].sort(
    (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
  )[0]
  const firstId = stringField(first, 'id')
  if (firstId === undefined || firstId === activeLocationId) return undefined
  try {
    const result = await client.query<ItemStockIdsAtLocationQuery>({
      query: ItemStockIdsAtLocationDocument,
      variables: { locationId: activeLocationId },
      fetchPolicy: 'no-cache',
    })
    const stocks = result.data?.itemStocks
    if (stocks === undefined || stocks.length > 0) return undefined
    return firstId
  } catch {
    // See the comment above: the import itself finished.
    return undefined
  }
}

// Create the location the user named in the dialog (decision O6), with the
// same `createLocation` mutation the locations page uses. The caller becomes
// its organizer.
async function createImportLocation(
  client: ApolloClient,
  name: string,
): Promise<string> {
  const result = await client.mutate<CreateLocationMutation>({
    mutation: CreateLocationDocument,
    variables: { name },
  })
  const id = result.data?.createLocation.id
  if (id === undefined) throw new Error('createLocation returned no data')
  return id
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

// Cart items in batches of about `size`, with every row of one
// `(cartId, itemId)` pair in the SAME batch (households H3b, found in task
// B.8, fixed in task B.9).
//
// Why. The server merges the rows of one pair only inside one call
// (`mergeCartItemRows` in apps/server/src/resolvers/import.resolver.ts). With
// plain `chunk`, an old backup's two rows for one pair could land in two
// batches. Under `replace`, `bulkUpsertCartItems` SETS the pair's amount, so
// the second batch set only its own part of the sum and the first part was
// lost.
//
// Why not merge the rows here instead. The server needs every id of a pair:
// `bulkCreateCartItems` skips a pair when ANY of its ids is already in the
// cloud, and a new row takes the lowest id no row holds. A merged row would
// hide the other ids from both rules.
//
// A batch can hold more than `size` rows only when one pair alone has more
// rows than that. Pairs keep the order in which they first appear, so the
// batches are the same on a resumed import (the batch keys are by index).
function chunkCartItemsByPair(rows: unknown[], size: number): unknown[][] {
  const groups = new Map<string, unknown[]>()
  for (const row of rows) {
    const { cartId, itemId } = row as { cartId: string; itemId: string }
    // NUL as the separator: no id contains it.
    const key = `${cartId}\u0000${itemId}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  const result: unknown[][] = []
  let current: unknown[] = []
  for (const group of groups.values()) {
    if (current.length > 0 && current.length + group.length > size) {
      result.push(current)
      current = []
    }
    current.push(...group)
  }
  if (current.length > 0) result.push(current)
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
  // Key format: `${mode}:${entityType}:${batchIndex}`, where `mode` is
  // `create` or `upsert`. The `mode` term is required — see `runBulkBatches`
  // and issue #330.
  completedBatchKeys: Set<string>
  // Where the file's local default location goes (households H4 task E.4).
  // Kept on the session so a retry does not ask again, and does not create a
  // second "New location": once that location is created, `importCloudData`
  // replaces `{ newLocationName }` here with its `{ locationId }`.
  target?: ImportTarget
}

// ---------------------------------------------------------------------------
// GraphQL Input mappers — strip server-only fields (__typename, familyId) and
// any other fields not accepted by the corresponding Input type. These are
// used before passing payload objects as GraphQL mutation variables.
//
// They are ALLOW-LISTS: each names the keys it forwards, so anything else is
// dropped by omission. `userId` was the headline example until issue #359
// stopped every web document selecting it; the unit tests still feed it in,
// where it now stands for any unexpected key rather than for that one field.
// ---------------------------------------------------------------------------

// `ItemInput` is CONFIGURATION only since cloud locations PR 5 dropped the five
// per-location state fields from it, so this mapper must not forward them —
// they would be rejected by GraphQL validation, failing the whole mutation.
//
// THE RETURN TYPE ANNOTATION IS THE GUARD AGAINST AN EXTRA KEY, and it is the
// only one. Nothing else in the repo catches an extra key here: `tsc` does not
// excess-property-check a function RESULT assigned to a typed parameter, every
// test mocks the Apollo client rather than validating against the schema, and
// the cloud E2E import spec would be the first thing to see it — after the
// whole mutation failed. Measured during PR 5 task 4: with the five put back
// and no annotation, the root `pnpm build` passed and all 2283 web tests
// passed. With the annotation the build fails with
//   TS2561: Object literal may only specify known properties, but
//   'targetQuantity' does not exist in type 'ItemInputShape'.
// Do not remove it, and do not widen it to `Record<string, unknown>`.
//
// WHAT IT DOES NOT CATCH: an OPTIONAL key going missing. `ItemInputShape` is a
// mapped type over `keyof ItemInput`, and a mapped type keeps an optional key
// optional, so dropping one is still a valid value of the type. Measured
// 2026-10-08 (issue #335): with the `note` line below deleted,
// `npx tsc -p tsconfig.app.json --noEmit` exits **0 with zero errors**. The
// annotation catches an extra key and a missing REQUIRED key. For `wikidataUrl`
// and `note` — both optional on `ItemInput` — UNIT TESTS ARE THE ONLY GUARD:
// `user can restore a cloud backup that keeps an item's note and wikidata URL`
// and `toItemInput leaves note and wikidataUrl undefined when the backup has
// neither`, in importData.test.ts. The same mutation turns both of those RED.
// Issue #335 and the #332 PR description both say this annotation means a key
// cannot silently go missing. For an optional key that is wrong.
//
// Dropping them loses nothing. A pre-v15 payload carries the five inline on its
// items, and `placeDefaultLocation` has already turned them into real
// `itemStocks` rows before any mutation runs, each row naming a location. A
// post-v15 payload carries its own `itemStocks` array. Either way the stock
// travels in `ItemStockImportInput`, never here.
//
// `ItemInputShape` rather than `ItemInput` itself for one reason:
// `exactOptionalPropertyTypes: true` is on, and codegen types an optional input
// field as `T | null` with no `| undefined`, so the plain type rejects the
// `undefined`s this mapper emits for an absent optional (TS2375). The mapped
// type allows `undefined` as a value while still rejecting a key that
// `ItemInput` does not declare — which is the half that catches an extra
// field. It does NOT make the key set exact in the other direction; see above.
type ItemInputShape = { [K in keyof ItemInput]: ItemInput[K] | undefined }

export function toItemInput(item: Record<string, unknown>): ItemInputShape {
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
    // Both are optional on `ItemInput`, so the return-type annotation below
    // does NOT catch them going missing — a mapped type keeps an optional key
    // optional. `toItemInput` keeps them from one unit test instead:
    // `user can restore a cloud backup that keeps an item's note and wikidata
    // URL` in importData.test.ts. Issue #335.
    wikidataUrl: item.wikidataUrl as string | undefined,
    note: item.note as string | undefined,
    tagIds: (item.tagIds ?? []) as string[],
    vendorIds:
      item.vendorIds != null ? (item.vendorIds as string[]) : undefined,
    packageUnit: item.packageUnit as string | undefined,
    measurementUnit: item.measurementUnit as string | undefined,
    amountPerPackage: item.amountPerPackage as number | undefined,
    targetUnit: item.targetUnit as string,
    consumeAmount: item.consumeAmount as number,
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

// `locationId`, `logKey` and `logParams` are all three passed through, and all
// three are OPTIONAL on `InventoryLogInput` (schema/import.graphql:49-67).
//
// `locationId` is what cloud locations PR 4b needs: without it every imported
// log lands in the caller's default location, which is the server's documented
// fallback for an absent field. `logKey` and `logParams` carry the log's
// MESSAGE — this mapper dropped them from the day it was written, so every
// cloud backup lost every log message. The export query lost them too
// (operations/export.graphql); both halves were fixed together in PR 4b.
//
// This mapper is shared: `sanitiseCloudPayload` (lib/exportData.ts) calls it on
// the way OUT and the bulk import calls it on the way IN, so one change fixes
// both directions.
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
    logKey: log.logKey as string | undefined,
    logParams: log.logParams as Record<string, unknown> | undefined,
    locationId: log.locationId as string | undefined,
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

// `LocationInput` (schema/import.graphql) has NO `isDefault` FIELD, so this
// mapper must drop it: GraphQL validation refuses an unknown input field. A
// household has no default location (households task 3.12). The file's local
// default location (`'local'`) is never uploaded with that id: the client
// rewrites it onto the location the user picked (`placeDefaultLocation`).
export function toLocationInput(location: Record<string, unknown>) {
  const createdAt =
    location.createdAt instanceof Date
      ? location.createdAt.toISOString()
      : (location.createdAt as string)
  const updatedAt =
    location.updatedAt instanceof Date
      ? location.updatedAt.toISOString()
      : (location.updatedAt as string)
  return {
    id: location.id as string,
    name: location.name as string,
    order: location.order as number,
    createdAt,
    updatedAt,
  }
}

// `ItemStockImportInput` (schema/import.graphql:142-153) is a REPLACE input:
// every field is required except `dueDate`. It is a second input beside
// `ItemStockInput` on purpose — that one is a partial merge where a missing key
// means "leave the column alone", and one input cannot mean both.
//
// A LOCAL ItemStock row carries extra columns that the cloud keeps on `Item`
// instead (`targetUnit`, `packageUnit`, `consumeAmount`, ...). They are dropped
// here, like every other mapper drops what its Input does not accept.
export function toItemStockInput(stock: Record<string, unknown>) {
  const createdAt =
    stock.createdAt instanceof Date
      ? stock.createdAt.toISOString()
      : (stock.createdAt as string)
  const updatedAt =
    stock.updatedAt instanceof Date
      ? stock.updatedAt.toISOString()
      : (stock.updatedAt as string)
  // A local row holds `dueDate` as a Date; cloud sends an ISO string; an
  // unexpired row has none. Only the field is optional, so `null` and
  // `undefined` both have to become "no due date".
  const dueDate =
    stock.dueDate instanceof Date
      ? stock.dueDate.toISOString()
      : ((stock.dueDate ?? undefined) as string | undefined)
  return {
    id: stock.id as string,
    itemId: stock.itemId as string,
    locationId: stock.locationId as string,
    targetQuantity: stock.targetQuantity as number,
    refillThreshold: stock.refillThreshold as number,
    packedQuantity: stock.packedQuantity as number,
    unpackedQuantity: stock.unpackedQuantity as number,
    dueDate,
    createdAt,
    updatedAt,
  }
}

export interface ConflictEntry {
  id: string
  name: string
  matchReasons: ('id' | 'name')[]
}

// NINE entities, not the eleven an `ExportPayload` carries. `locations` and
// `itemStocks` are deliberately absent, for two different reasons:
//
//   - A LOCATION would conflict on many cloud imports. The file's local
//     default location is put onto a location the household already has
//     (`placeDefaultLocation`), so an id check here
//     would always match and `hasConflicts` would always be true — every
//     import, including a clean one, would stop at the conflict dialog. A
//     location row also holds no destructible content: only a name and an
//     order. Carts are left out for the same second reason.
//   - A STOCK row's conflict is never the user's decision to make. It is
//     always decided by its item, and the item is already in this summary.
//     `partitionPayload` routes stock by strategy instead, matching what the
//     local import does in `importItemStocks`.
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
    // `locations` and `itemStocks` are not checked at all. See the comment on
    // `ConflictSummary` for why, and `partitionPayload` for where they go
    // instead.
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

// Stock follows its ITEM, which is the rule the local import already applies
// (`importItemStocks`) and the rule the server enforces:
// `requireOwnItemStockRefs` (apps/server/src/resolvers/import.resolver.ts:434)
// answers `Forbidden` for an `itemId` the account does not hold. On `skip` a
// payload item that conflicts BY NAME ONLY keeps an id no cloud row has, so
// sending its stock would end the whole import with that error.
function stocksForItems(
  payload: ExportPayload,
  writtenItemIds: Set<string>,
): unknown[] {
  return ((payload.itemStocks ?? []) as Array<{ itemId: string }>).filter((s) =>
    writtenItemIds.has(s.itemId),
  )
}

// WHERE `locations` AND `itemStocks` GO, AND WHY THEY ARE NOT PARTITIONED BY
// CONFLICT LIKE THE OTHER NINE.
//
// Neither is ever reported as a conflict (see `detectConflicts`), so there is
// no conflict set to split them on. Each strategy sends all of its rows to
// exactly ONE of the two passes, which also keeps them clear of the shared
// batch-key bug noted in `runBulkBatches`:
//
// | strategy  | locations | itemStocks                        |
// |-----------|-----------|-----------------------------------|
// | `clear`   | toCreate  | toCreate (all rows)               |
// | `skip`    | toCreate  | toCreate, only newly added items  |
// | `replace` | toCreate  | toUpsert (all rows)               |
//
// `locations` always goes to the CREATE pass, on every strategy, because the
// create pass is where `shoppingCarts` and `inventoryLogs` go on `skip` and
// `replace` — and a cart whose location does not exist yet is written to the
// account default instead, with no error. The cost is that `replace` does not
// rename an existing location to the name in the backup, where the local
// import does; a location row holds only a name and an order, so this loses no
// user data.
//
// `itemStocks` goes to the UPSERT pass on `replace` because that is the only
// pass that overwrites: `bulkCreateItemStocks` SKIPS a row whose
// `(itemId, locationId)` pair is already taken, so sending stock to the create
// pass on `replace` would silently discard the quantities in the file the user
// chose to restore.

// The cart items `skip` may send to `bulkCreateCartItems`: every row of a
// `(cartId, itemId)` pair in which NO id is a conflict.
//
// By pair, not by id, because the server skips by pair. `bulkCreateCartItems`
// skips a whole pair when any of its ids is already the caller's, and adds
// the rest of the pair to the stored row. An old backup holds a merged pair
// under several ids, and the merge kept only the lowest. If the web dropped
// just the conflicting id, the server would never see it, would not know the
// pair was imported before, and would ADD the other rows' amounts again on
// every re-import. The local import applies the same rule
// (`importLocalCartItems`).
function cartItemsOutsideConflictingPairs(
  rows: readonly CartItem[],
  conflictIds: Set<string>,
): CartItem[] {
  const pairOf = (row: CartItem) => `${row.cartId}\u0000${row.itemId}`
  const conflictingPairs = new Set(
    rows.filter((row) => conflictIds.has(row.id)).map(pairOf),
  )
  return rows.filter((row) => !conflictingPairs.has(pairOf(row)))
}

export function partitionPayload(
  payload: ExportPayload,
  conflicts: ConflictSummary,
  strategy: ImportStrategy,
): { toCreate: ExportPayload; toUpsert: ExportPayload } {
  if (strategy === 'clear') {
    // All entities go to toCreate; toUpsert is empty. The spread carries
    // `locations` and `itemStocks` with everything else — nothing exists to
    // conflict with after a clear.
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

    // Hoisted because `itemStocks` is filtered by it too: on `skip` only a
    // newly added item's stock goes up.
    const itemsToCreate = (payload.items as IdOnlyEntity[]).filter(
      (e) => !conflictIdSets.items.has(e.id),
    )

    return {
      toCreate: {
        ...payload,
        items: itemsToCreate,
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
        // By PAIR, not by id. See `cartItemsOutsideConflictingPairs`.
        cartItems: cartItemsOutsideConflictingPairs(
          payload.cartItems as CartItem[],
          conflictIdSets.cartItems,
        ),
        shelves: ((payload.shelves ?? []) as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.shelves.has(e.id),
        ),
        locations: payload.locations ?? [],
        itemStocks: stocksForItems(payload, itemIdsOf(itemsToCreate)),
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
      // No cart item on the create pass under `replace`: `bulkCreateCartItems`
      // ADDS to a pair that already has a row, and `replace` must SET it
      // (households H3b decision P3). They all go to `toUpsert`, the same as
      // `itemStocks` below.
      cartItems: [],
      shelves: ((payload.shelves ?? []) as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.shelves.has(e.id),
      ),
      // Every location, on the create pass — `bulkCreateLocations` keeps the
      // row the account already has and creates the rest. It must happen here
      // and not on the upsert pass, because the carts and logs below name
      // these locations and are sent on this same pass.
      locations: payload.locations ?? [],
      // No stock on the create pass under `replace`: `bulkCreateItemStocks`
      // skips an existing `(itemId, locationId)` pair, which would drop the
      // quantities the user asked to restore. It all goes to `toUpsert`.
      itemStocks: [],
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
      // Every cart item, not only the conflicting ids. `bulkUpsertCartItems`
      // writes by PAIR, never by id: a pair with a cloud row gets the amount
      // SET, a pair with none gets a new row under its lowest free id. Before
      // households H3b task B.8 a new id went to the create pass, so a new id
      // whose pair already had a cloud row was ADDED to it, not set.
      cartItems: payload.cartItems,
      shelves: ((payload.shelves ?? []) as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.shelves.has(e.id),
      ),
      // Already sent by the create pass above. Sending them again would be a
      // second, pointless round trip for rows the create pass already wrote.
      // (Before issue #330 was fixed the two passes shared one key space, so
      // the second send would also have collided with the first pass's key.
      // The keys now carry `mode`, so the reason is the wasted work alone.)
      locations: [],
      // Every stock row, so the payload's quantities win. The upsert pass
      // runs after the create pass, so both a brand-new item and a
      // conflicting one exist by the time this is sent.
      itemStocks: payload.itemStocks ?? [],
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

/** The payload rows of one `(cartId, itemId)` pair, merged. */
interface MergedCartItem {
  cartId: string
  itemId: string
  /** The sum of the rows' amounts. */
  quantity: number
  /** Every payload id of the pair, lowest first, without repeats. */
  ids: string[]
}

// Rows of one `(cartId, itemId)` pair, summed. The same rule as
// `mergeCartItemRows` in apps/server/src/resolvers/import.resolver.ts. An old
// backup can hold two rows for one item in one cart: one made before Dexie
// version 19 or the cloud migration of households H3b task B.3 merged them.
// Groups keep the order in which their pair first appears.
function mergeCartItemRows(rows: readonly CartItem[]): MergedCartItem[] {
  const groups = new Map<string, MergedCartItem>()
  for (const { id, cartId, itemId, quantity } of rows) {
    // NUL as the separator: no id contains it.
    const key = `${cartId}\u0000${itemId}`
    const group = groups.get(key)
    if (group) {
      group.quantity += quantity
      if (!group.ids.includes(id)) group.ids.push(id)
    } else {
      groups.set(key, { cartId, itemId, quantity, ids: [id] })
    }
  }
  for (const group of groups.values()) group.ids.sort()
  return [...groups.values()]
}

// Write the payload's cart items into Dexie, one row per `(cartId, itemId)`
// (households H3b task B.8, decision P3 of the H3b plan). Since Dexie version
// 20 the unique index `&[cartId+itemId]` refuses a second row for a pair, so
// a plain `bulkAdd` / `bulkPut` of a backup that holds one would throw a
// `ConstraintError` and fail the import.
//
// The rules are the cloud's (`bulkCreateCartItems` and `bulkUpsertCartItems`):
//
// | `mode` | strategy        | a pair with a stored row | a pair with none |
// |--------|-----------------|--------------------------|------------------|
// | `add`  | `skip`, `clear` | the amount is ADDED      | a new row        |
// | `set`  | `replace`       | the amount is SET        | a new row        |
//
// - Rows of one pair in the payload are summed first.
// - `add` SKIPS a whole pair when any of its ids is already stored: that row
//   was imported before. Skipping only the stored id would add the other
//   rows' amounts again on every re-import of an old backup. (`clear` empties
//   the table first, so for it nothing is skipped.)
// - A write never moves a row. Under `set`, a payload id that is stored under
//   ANOTHER pair leaves that row where it is, and the pair the payload names
//   gets the amount. Until task B.8 local `replace` used `bulkPut`, which
//   moved the row.
// - A new row takes the lowest id of its pair that no row holds and no
//   earlier pair took; none left gives a new random id. The lowest id is what
//   version 19 and the cloud migration keep, so a backup made before the merge
//   finds its row under the same id after it.
// - Only `id`, `cartId`, `itemId` and `quantity` are written, the four
//   fields of `CartItem`.
//
// One `rw` transaction on `cartItems`, so an `addToCart` cannot run between
// the read and the write. Only Dexie promises are awaited inside it.
async function importLocalCartItems(
  rows: readonly CartItem[],
  mode: 'add' | 'set',
): Promise<void> {
  if (rows.length === 0) return
  await db.transaction('rw', db.cartItems, async () => {
    const stored = await db.cartItems.toArray()
    const storedIds = new Set(stored.map((row) => row.id))
    const storedByPair = new Map(
      stored.map((row) => [`${row.cartId}\u0000${row.itemId}`, row]),
    )
    const taken = new Set(storedIds)

    for (const group of mergeCartItemRows(rows)) {
      const { cartId, itemId, quantity } = group
      if (mode === 'add' && group.ids.some((id) => storedIds.has(id))) continue

      const existing = storedByPair.get(`${cartId}\u0000${itemId}`)
      if (existing) {
        await db.cartItems.update(existing.id, {
          quantity: mode === 'add' ? existing.quantity + quantity : quantity,
        })
        continue
      }

      const id =
        group.ids.find((candidate) => !taken.has(candidate)) ??
        crypto.randomUUID()
      taken.add(id)
      await db.cartItems.add({ id, cartId, itemId, quantity })
    }
  })
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

export interface ImportLocalOptions {
  /**
   * The LOCAL location a pre-v15 backup's inline stock and bare cart ids go
   * into (`upgradeLegacyPayload`). The UI passes the local active location.
   * A file with `itemStocks` (every cloud export since PR 4b task 2, every
   * local export since v15) does not use it.
   */
  activeLocationId?: string
  /**
   * The PAYLOAD location that becomes local "My Home" (`'local'`). Households
   * H4 task E.5, decision T18: the cloud -> local copy passes the cloud ACTIVE
   * location, as the design's "Copying between local and cloud" says. Every
   * other location keeps its id.
   *
   * Left out for a backup FILE imported in local mode: the file does not
   * record which location was active, so the old rule picks it
   * (`findPayloadDefaultLocationId`, decision O4). Also ignored when no
   * location row of the payload has this id, for the same reason: the old
   * rule is the best answer left.
   */
  homeLocationId?: string
}

export async function importLocalData(
  rawPayload: ExportPayload,
  strategy: ImportStrategy,
  {
    activeLocationId = DEFAULT_LOCATION_ID,
    homeLocationId,
  }: ImportLocalOptions = {},
): Promise<void> {
  // Pre-v15 backups carry stock inline on the item and unscoped cart ids —
  // upgrade them to the split shape before writing, into the caller's target
  // location (the active one, for the UI paths). Since PR 4b task 2 a cloud
  // export is already split, so this is a no-op for one.
  const upgraded = upgradeLegacyPayload(rawPayload, activeLocationId)

  // THE REMAP RULE, cloud -> local direction (design §1): the payload's own
  // default location maps onto THIS database's default, and every other
  // location keeps its id. Without it a cloud backup's locations all arrive
  // under their server cuids, no row matches DEFAULT_LOCATION_ID, and
  // `ensureDefaultLocationRow` adds a stray empty "local" default beside the
  // restored ones.
  //
  // NO ORDERING HAZARD ON THIS SIDE, unlike the cloud `clear` path. There the
  // new "Home" has to be read over the network, and reading it before
  // `clearAllData` returns an id that no longer exists (`fetchHomeAfterClear`). Here the
  // destination's default is the module constant DEFAULT_LOCATION_ID: the v18
  // upgrade fn and `ensureDefaultLocation` (db/index.ts) between them
  // guarantee the local default is always that id. So nothing is read from the
  // database, and the position of this line relative to `db.locations.clear()`
  // below cannot matter. Do not "improve" it into a `db.locations` read.
  //
  // AFTER `upgradeLegacyPayload`, not before: that function can invent
  // location ids of its own (it places a legacy payload's synthesised stock
  // and cart prefixes in `locationId`), so remapping afterwards is what stops
  // an id it created from escaping the rule.
  //
  // One call covers all three strategies, because each one hands the whole
  // payload to `importLocations` / `importItemStocks`.
  //
  // WHICH payload location is "its own default" (households H4 task E.5):
  // `homeLocationId` when the caller names one AND the payload holds that
  // location row (the cloud -> local copy names the cloud active location);
  // otherwise the old rule in `findPayloadDefaultLocationId` (decision O4).
  const payloadLocationIds = new Set(
    ((upgraded.locations ?? []) as Array<Record<string, unknown>>).map(
      (row) => row.id as string,
    ),
  )
  const payloadHome =
    homeLocationId !== undefined && payloadLocationIds.has(homeLocationId)
      ? homeLocationId
      : findPayloadDefaultLocationId(upgraded)
  const payload = applyLocationRemap(
    upgraded,
    buildLocationRemap(upgraded, DEFAULT_LOCATION_ID, new Set(), payloadHome),
  )

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
    // The table was cleared above, so nothing is skipped: only the payload's
    // own duplicate pairs are merged. See `importLocalCartItems`.
    await importLocalCartItems(payload.cartItems as CartItem[], 'add')
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
    // The WHOLE payload, not `toCreate.cartItems`: `importLocalCartItems`
    // decides what to skip itself, against the database and by PAIR. A list
    // already cut down by id would hide that a pair was imported before.
    await importLocalCartItems(payload.cartItems as CartItem[], 'add')
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
  // Every cart item, in one pass that SETS each pair's amount. See
  // `importLocalCartItems`. The payload is read directly, not `toCreate` /
  // `toUpsert`, so the local rule does not depend on how `partitionPayload`
  // splits the cloud upload.
  await importLocalCartItems(payload.cartItems as CartItem[], 'set')
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
// The cloud upload table
//
// ONE list, read by three callers: the create pass, the upsert pass, and
// `computeTotalBatches`. Those were three separate hardcoded arrays until
// cloud locations PR 4b, and nothing checked that they matched. Missing the
// third made the progress bar overrun with no error; missing the second left
// an entity that `replace` never updated. Neither mistake is possible now.
//
// THE ORDER MATTERS, AND A WRONG ORDER PRODUCES NO ERROR AT ALL:
//
//   - `locations` must come BEFORE `items` and before `shoppingCarts`.
//     `resolveCartLocations` (apps/server/src/resolvers/import.resolver.ts)
//     refuses a cart whose id names a location that no row holds, with
//     `Forbidden`, and `resolveLogLocations` does the same for logs. Until
//     households H4 task E.3 both sent such a row to the caller's first
//     location instead, silently.
//   - `itemStocks` must come AFTER `items` and after `locations`. It is a
//     child of both, and `requireOwnItemStockRefs` (import.resolver.ts:434)
//     refuses an unknown item or location with `Forbidden`.
//
// A `Forbidden` NO LONGER COMES FROM `itemStocks` ALONE. Since the import
// ownership guard (issue #327) every bulk mutation in `import.resolver.ts`
// answers `Forbidden` for a payload id that names ANOTHER ACCOUNT'S row.
// Measured on 2026-10-28: 22 of these mutations are guarded — 18 through
// `requireOwnRowOrUnclaimed` (lib/authz.ts:134), 2 through
// `requireOwnLocationIdsOrUnclaimed` (import.resolver.ts:312) and 2 through
// `requireOwnItemStockRefs` (:434) — and 13 cross-model reference lookups
// across 9 of them are scoped by `userId` as well. So ANY entity in this list
// can now end the import, not just the last one.
//
// ON THE `clear` STRATEGY THAT ERROR STILL ARRIVES AFTER `clearAllData` HAS
// RUN, which leaves the account empty and the import dead. Accepted, with a
// client-side mitigation, in design decision 6 of
// docs/features/settings/2026-10-28-design-import-ownership-guard.md: the
// window is narrow, because after the clear the caller owns no rows, so a
// `Forbidden` on `clear` means the file really does carry another household's
// row ids and cannot be triggered by the user's own data. (This said "another
// account" until households H4 decision O8.)
//
// What the user is told, instead of the old bare word `Forbidden`:
// `settings.import.importErrorForbiddenAfterClear` — some rows in this file
// belong to another household, so the import was refused; the cloud data was
// already cleared before that happened; the backup file is unchanged.
// `ImportCard` picks that key over `settings.import.importErrorForbidden` from
// the session's own strategy, and `isForbiddenImportError` below is what tells
// the two sentences apart from every other failure.
//
// SINCE HOUSEHOLDS H4 TASK E.4 THIS IS RARE. `importCloudData` runs
// `checkImportIds` before `clearAllData` and before the first batch. A file
// with another household's id is refused there, before anything is written
// (`ImportRefusedError`, `importErrorForbidden`). A `Forbidden` from a bulk
// mutation can still happen when something changes between the check and the
// write (another import, a role change). Then the message above is still the
// right one.
// ---------------------------------------------------------------------------

interface EntitySpec {
  // Also the MIDDLE term of the batch key recorded in
  // `ImportSession.completedBatchKeys` (`${mode}:${entityType}:${batchIndex}`),
  // so renaming one makes a resumed session re-send that entity's batches.
  entityType: string
  select: (data: ExportPayload) => unknown[]
  create: (client: ApolloClient, batch: unknown[]) => Promise<void>
  upsert: (client: ApolloClient, batch: unknown[]) => Promise<void>
  // How the rows are split into batches. `chunk` by BATCH_SIZE when absent.
  // Both passes and `computeTotalBatches` read it through `batchesOf`.
  batch?: (rows: unknown[]) => unknown[][]
}

function batchesOf(spec: EntitySpec, data: ExportPayload): unknown[][] {
  const rows = spec.select(data)
  return spec.batch ? spec.batch(rows) : chunk(rows, BATCH_SIZE)
}

const ENTITY_SPECS: EntitySpec[] = [
  {
    entityType: 'tagTypes',
    select: (data) => data.tagTypes,
    create: (client, batch) =>
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
    upsert: (client, batch) =>
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
    select: (data) => data.tags,
    create: (client, batch) =>
      client
        .mutate({
          mutation: BulkCreateTagsDocument,
          variables: {
            tags: batch.map((t) => toTagInput(t as Record<string, unknown>)),
          },
        })
        .then(() => undefined),
    upsert: (client, batch) =>
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
    select: (data) => data.vendors,
    create: (client, batch) =>
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
    upsert: (client, batch) =>
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
  // BEFORE `items`, and so before `shoppingCarts` and `inventoryLogs` too.
  // See the block comment above for what breaks if this moves down.
  {
    entityType: 'locations',
    select: (data) => data.locations ?? [],
    create: (client, batch) =>
      client
        .mutate({
          mutation: BulkCreateLocationsDocument,
          variables: {
            locations: batch.map((l) =>
              toLocationInput(l as Record<string, unknown>),
            ),
          },
        })
        .then(() => undefined),
    upsert: (client, batch) =>
      client
        .mutate({
          mutation: BulkUpsertLocationsDocument,
          variables: {
            locations: batch.map((l) =>
              toLocationInput(l as Record<string, unknown>),
            ),
          },
        })
        .then(() => undefined),
  },
  {
    entityType: 'items',
    select: (data) => data.items,
    create: (client, batch) =>
      client
        .mutate({
          mutation: BulkCreateItemsDocument,
          variables: {
            items: batch.map((i) => toItemInput(i as Record<string, unknown>)),
          },
        })
        .then(() => undefined),
    upsert: (client, batch) =>
      client
        .mutate({
          mutation: BulkUpsertItemsDocument,
          variables: {
            items: batch.map((i) => toItemInput(i as Record<string, unknown>)),
          },
        })
        .then(() => undefined),
  },
  // AFTER `items` and after `locations` — it is a child of both.
  {
    entityType: 'itemStocks',
    select: (data) => data.itemStocks ?? [],
    create: (client, batch) =>
      client
        .mutate({
          mutation: BulkCreateItemStocksDocument,
          variables: {
            itemStocks: batch.map((s) =>
              toItemStockInput(s as Record<string, unknown>),
            ),
          },
        })
        .then(() => undefined),
    upsert: (client, batch) =>
      client
        .mutate({
          mutation: BulkUpsertItemStocksDocument,
          variables: {
            itemStocks: batch.map((s) =>
              toItemStockInput(s as Record<string, unknown>),
            ),
          },
        })
        .then(() => undefined),
  },
  {
    entityType: 'recipes',
    select: (data) => data.recipes,
    create: (client, batch) =>
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
    upsert: (client, batch) =>
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
    select: (data) => data.inventoryLogs,
    create: (client, batch) =>
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
    upsert: (client, batch) =>
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
    select: (data) => data.shoppingCarts,
    create: (client, batch) =>
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
    upsert: (client, batch) =>
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
    select: (data) => data.cartItems,
    // One pair never spans two batches. See `chunkCartItemsByPair`.
    batch: (rows) => chunkCartItemsByPair(rows, BATCH_SIZE),
    create: (client, batch) =>
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
    upsert: (client, batch) =>
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
    select: (data) => data.shelves ?? [],
    create: (client, batch) =>
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
    upsert: (client, batch) =>
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

interface BatchedBulkArgs {
  client: ApolloClient
  data: ExportPayload
  session: ImportSession
  onProgress: (p: ImportProgress) => void
  startCompleted: number
  totalBatches: number
}

// Walk `ENTITY_SPECS` in order, send each entity's rows in chunks of
// BATCH_SIZE, skip chunks the session already recorded, and report progress
// after every chunk that was actually sent.
async function runBulkBatches(
  args: BatchedBulkArgs,
  mode: 'create' | 'upsert',
): Promise<number> {
  const { client, data, session, onProgress, totalBatches } = args
  let completedBatches = args.startCompleted

  for (const spec of ENTITY_SPECS) {
    const batches = batchesOf(spec, data)
    for (const [i, batch] of batches.entries()) {
      // `mode` MUST stay in the key. On the `replace` strategy `bulkCreate` and
      // `bulkUpsert` share one `ImportSession`, so without it the two passes
      // share one key space: when an entity has rows on both passes, the create
      // pass records `items:0` and the upsert pass then finds that key and skips
      // its own batch. `bulkUpsertItems` was never called and the rows the user
      // asked to overwrite kept the destination's values. That was issue #330,
      // fixed on 2026-10-12.
      //
      // The two entities PR 4b added could not hit it — `partitionPayload` sends
      // `locations` only to `toCreate` and `itemStocks` only to `toUpsert`, so
      // each has zero batches on the other pass. `items` could, and did.
      // `e2e/tests/settings/import-strategies.spec.ts` imports a backup holding
      // one colliding item and one new one, so `items` has a batch on each pass.
      // That spec is the regression guard: dropping `mode` from this key makes
      // its cloud run read `Stale Name` where it wants `Fixture Item`.
      const key = `${mode}:${spec.entityType}:${i}`
      if (session.completedBatchKeys.has(key)) {
        completedBatches++
        continue
      }
      await (mode === 'create' ? spec.create : spec.upsert)(client, batch)
      session.completedBatchKeys.add(key)
      completedBatches++
      onProgress({
        completedBatches,
        totalBatches,
        currentEntity: spec.entityType,
      })
    }
  }

  return completedBatches
}

function bulkCreate(args: BatchedBulkArgs): Promise<number> {
  return runBulkBatches(args, 'create')
}

function bulkUpsert(args: BatchedBulkArgs): Promise<number> {
  return runBulkBatches(args, 'upsert')
}

// Derived from the SAME list the two passes walk, so a new entity can never be
// counted in one place and sent in another.
function computeTotalBatches(data: ExportPayload): number {
  return ENTITY_SPECS.reduce(
    (total, spec) => total + batchesOf(spec, data).length,
    0,
  )
}

/**
 * Whether an import error is the server refusing a row that belongs to another
 * household — `FORBIDDEN`, raised by `requireOwnRowOrUnclaimed`,
 * `requireLocationRole` or `requireOwnItemStockRefs`.
 *
 * READS `extensions.code`, NOT the message text, and must keep doing so.
 * Apollo's `message` for this is the bare word `Forbidden`, which is also what
 * the server sends for "row does not exist" ON PURPOSE, so that "not yours"
 * and "not there" stay indistinguishable. A string match would therefore break
 * the day that copy changes, and it would also treat any other error whose
 * message happens to read `Forbidden` as a cross-account refusal.
 *
 * `CombinedGraphQLErrors.is` is a brand check on `Symbol.for('apollo.error')`,
 * so it holds across module copies, and the class extends `Error`, so
 * `importCloudData`'s catch (:2484) rethrows the same object with the class
 * intact. Both were measured out of process on 2026-10-28 against
 * `@apollo/client` 4.1.6.
 */
export function isForbiddenImportError(err: unknown): boolean {
  return (
    CombinedGraphQLErrors.is(err) &&
    err.errors.some((e) => e.extensions?.code === 'FORBIDDEN')
  )
}

/**
 * The most ids one `importCheck` call takes. The server refuses more with
 * `BAD_USER_INPUT` (`IMPORT_CHECK_MAX_IDS` in
 * apps/server/src/resolvers/importCheck.resolver.ts, households H4 decision
 * T3).
 */
export const IMPORT_CHECK_CHUNK_SIZE = 1000

/** Ids of rows the file holds that the import must leave out, by model. */
export interface ImportCheckRowIds {
  inventoryLogs: string[]
  itemStocks: string[]
  carts: string[]
  cartItems: string[]
}

/** The answer of `checkImportIds`: the answers of every call, joined. */
export interface ImportIdCheck {
  /** True when any call found a row or location of another household. */
  anotherHousehold: boolean
  /**
   * Locations the file names (rows, references, cart ids) in the target
   * household where the caller is below `participant`, sorted. Drop every row
   * the file puts there.
   */
  blockedLocationIds: string[]
  /**
   * Location ROWS of the file that already exist, where the caller may write
   * but not rename (`participant`, not `organizer`), sorted. On `replace`,
   * leave them out of `bulkUpsertLocations`, which asks `organizer`; keep the
   * rows at them.
   */
  renameBlockedLocationIds: string[]
  /**
   * Locations the file's rows point at that no location will hold when the
   * import writes, sorted. Drop every row that points at one.
   */
  missingLocationIds: string[]
  /** Items stock rows point at that no item will hold, sorted. Drop those stock rows. */
  missingItemIds: string[]
  /**
   * Rows the file holds that already exist at a location the caller cannot
   * write (or, for a cart, away from the location its id names). Drop exactly
   * these rows.
   */
  blockedRows: ImportCheckRowIds
}

type ImportCheckKey = keyof ImportCheckInput

/** The `key` column of a payload row, when it is a string. */
function stringField(row: unknown, key: string): string | undefined {
  const value = (row as Record<string, unknown> | null | undefined)?.[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Every id of the payload, as `[model key, id]` pairs, in a fixed order, each
 * pair once.
 *
 * Rows and references go in different lists, and only this function can tell
 * them apart, because it sees the whole file and the server sees one chunk:
 *
 * - `locations`: the ids of the file's location ROWS. The import creates a
 *   free one, so the server never reports it missing.
 * - `locationRefs`: the `locationId` of stock rows and logs, and the location
 *   each cart id names, when the file has no location row with that id. The
 *   bulk stock, log and cart mutations refuse a location that does not exist,
 *   so the server reports these as missing when no row holds them.
 * - `itemRefs`: the `itemId` of stock rows that is not an item of the file.
 *   `requireOwnItemStockRefs` refuses an item outside the household.
 *
 * Not sent: the `itemId` of logs and cart items, and a cart item's `cartId`.
 * Those mutations SKIP a row whose item or cart they cannot use; they do not
 * refuse the batch. A cart id with no colon names no location; it is sent in
 * `carts`, and the server refuses it with `BAD_USER_INPUT`.
 */
function importCheckPairs(
  payload: ExportPayload,
  omitLocationIds: ReadonlySet<string> = new Set(),
): [ImportCheckKey, string][] {
  const pairs: [ImportCheckKey, string][] = []
  const seen = new Set<string>()
  const add = (key: ImportCheckKey, id: string | undefined) => {
    if (id === undefined) return
    const mark = `${key}\u0000${id}`
    if (seen.has(mark)) return
    seen.add(mark)
    pairs.push([key, id])
  }
  const ids = (key: ImportCheckKey, rows: readonly unknown[] | undefined) => {
    for (const row of rows ?? []) add(key, stringField(row, 'id'))
  }
  const rowIds = (rows: readonly unknown[] | undefined) =>
    new Set((rows ?? []).map((row) => stringField(row, 'id')))

  const locationRows = rowIds(payload.locations)
  const locationRef = (id: string | undefined) => {
    if (id === undefined || omitLocationIds.has(id)) return
    if (!locationRows.has(id)) add('locationRefs', id)
  }
  const itemRows = rowIds(payload.items)

  ids('items', payload.items)
  ids('tags', payload.tags)
  ids('tagTypes', payload.tagTypes)
  ids('vendors', payload.vendors)
  ids('recipes', payload.recipes)
  ids('shelves', payload.shelves)
  ids(
    'locations',
    (payload.locations ?? []).filter(
      (row) => !omitLocationIds.has(stringField(row, 'id') ?? ''),
    ),
  )
  for (const row of payload.itemStocks ?? []) {
    locationRef(stringField(row, 'locationId'))
    const itemId = stringField(row, 'itemId')
    if (itemId !== undefined && !itemRows.has(itemId)) add('itemRefs', itemId)
  }
  for (const row of payload.inventoryLogs) {
    locationRef(stringField(row, 'locationId'))
  }
  for (const row of payload.shoppingCarts) {
    const id = stringField(row, 'id')
    if (id?.includes(':')) locationRef(parseCartId(id).locationId)
  }
  ids('itemStocks', payload.itemStocks)
  ids('inventoryLogs', payload.inventoryLogs)
  // A cart id whose prefix is an omitted location is not sent either. The
  // cart is written under the real location's id later, so checking the
  // placeholder id proves nothing; and if some cloud location had the id
  // 'local' (possible before decision T12), the check would call the file
  // "another household" (E.4 review finding 3). Its cart items are still
  // sent by their own ids.
  ids(
    'carts',
    payload.shoppingCarts.filter((row) => {
      const id = stringField(row, 'id')
      return !(
        id?.includes(':') && omitLocationIds.has(parseCartId(id).locationId)
      )
    }),
  )
  ids('cartItems', payload.cartItems)
  return pairs
}

/**
 * Ask the server, before the first write of a cloud import, whether the file
 * holds rows of another household, and which of its rows the import must
 * leave out (households H4 task E.2, decision T1, and the E.2 review fixes).
 *
 * The ids go in calls of at most `IMPORT_CHECK_CHUNK_SIZE`, one after the
 * other. The answers are joined: `anotherHousehold` is true when any call
 * says so, and every list holds each id once, sorted.
 *
 * An empty file still makes ONE call, because the call is also the household
 * role check (`manager`, or `owner` with `forClear`). A refusal is thrown as
 * the client throws it (a `CombinedGraphQLErrors` with `FORBIDDEN` or
 * `BAD_USER_INPUT`).
 *
 * Send the payload as it will be written: after `placeDefaultLocation` (task
 * E.4). Cloud mode only; local mode has no household.
 *
 * `omitLocationIds` are locations whose real id is not known yet: the
 * `'local'` placeholder on `clear` (the new "Home" is made by the clear) and
 * for a "New location" (made after the check). They are left out of
 * `locations` and `locationRefs`; every ROW at them is still sent by its own
 * id, so a row id of another household is still found.
 *
 * `importCloudData` calls it before its first write and drops the rows the
 * answer names (`withoutRefusedRows`).
 */
export async function checkImportIds(
  client: ApolloClient,
  payload: ExportPayload,
  options: { forClear?: boolean; omitLocationIds?: ReadonlySet<string> } = {},
): Promise<ImportIdCheck> {
  const pairs = importCheckPairs(payload, options.omitLocationIds)
  const chunks: [ImportCheckKey, string][][] = []
  for (let i = 0; i < pairs.length; i += IMPORT_CHECK_CHUNK_SIZE) {
    chunks.push(pairs.slice(i, i + IMPORT_CHECK_CHUNK_SIZE))
  }
  if (chunks.length === 0) chunks.push([])

  let anotherHousehold = false
  const joined = {
    blockedLocationIds: new Set<string>(),
    renameBlockedLocationIds: new Set<string>(),
    missingLocationIds: new Set<string>(),
    missingItemIds: new Set<string>(),
    inventoryLogs: new Set<string>(),
    itemStocks: new Set<string>(),
    carts: new Set<string>(),
    cartItems: new Set<string>(),
  }
  const join = (into: Set<string>, ids: readonly string[]) => {
    for (const id of ids) into.add(id)
  }
  for (const chunk of chunks) {
    const ids: Partial<Record<ImportCheckKey, string[]>> = {}
    for (const [key, id] of chunk) {
      const list = ids[key] ?? []
      list.push(id)
      ids[key] = list
    }
    const result = await client.query<
      ImportCheckQuery,
      ImportCheckQueryVariables
    >({
      query: ImportCheckDocument,
      variables: { ids, forClear: options.forClear ?? false },
      // Never from the cache: the answer depends on rows that may have
      // changed since the last call.
      fetchPolicy: 'no-cache',
    })
    const answer = result.data?.importCheck
    if (!answer) throw new Error('importCheck returned no data')
    if (answer.anotherHousehold) anotherHousehold = true
    join(joined.blockedLocationIds, answer.blockedLocationIds)
    join(joined.renameBlockedLocationIds, answer.renameBlockedLocationIds)
    join(joined.missingLocationIds, answer.missingLocationIds)
    join(joined.missingItemIds, answer.missingItemIds)
    join(joined.inventoryLogs, answer.blockedRows.inventoryLogs)
    join(joined.itemStocks, answer.blockedRows.itemStocks)
    join(joined.carts, answer.blockedRows.carts)
    join(joined.cartItems, answer.blockedRows.cartItems)
  }
  const sorted = (set: Set<string>) => [...set].sort()
  return {
    anotherHousehold,
    blockedLocationIds: sorted(joined.blockedLocationIds),
    renameBlockedLocationIds: sorted(joined.renameBlockedLocationIds),
    missingLocationIds: sorted(joined.missingLocationIds),
    missingItemIds: sorted(joined.missingItemIds),
    blockedRows: {
      inventoryLogs: sorted(joined.inventoryLogs),
      itemStocks: sorted(joined.itemStocks),
      carts: sorted(joined.carts),
      cartItems: sorted(joined.cartItems),
    },
  }
}

// The result, with `switchToLocationId` only when there is one: a key set to
// `undefined` would read as "switch" to a caller that checks `in`.
function withSwitch(
  skipped: ImportSkipped,
  switchToLocationId: string | undefined,
): CloudImportResult {
  return switchToLocationId === undefined
    ? { skipped }
    : { skipped, switchToLocationId }
}

/**
 * Refresh the Apollo cache after a cloud import, and ignore an `AbortError`.
 *
 * `resetStore()` clears the cache, then refetches every active query and
 * returns `Promise.all` of those refetches. On the pantry the cleared cache
 * makes `PantryListView` show its loading spinner, which unmounts the views
 * below it. Apollo then tears down their queries, and the refetch of each one
 * rejects with `DOMException("The operation was aborted.", "AbortError")`
 * (`@apollo/client` 4.1.6). By then every row has been written, so that
 * rejection must not fail the import. The views that mount again make their
 * own queries.
 *
 * Only `AbortError` is ignored. Any other rejection is rethrown.
 * Bug doc: `docs/global/bugs/2026-10-31-bug-cloud-copy-aborted-on-pantry.md`.
 */
async function resetStoreAfterImport(client: ApolloClient): Promise<void> {
  try {
    await client.resetStore()
  } catch (err) {
    if ((err as { name?: unknown } | null)?.name === 'AbortError') return
    throw err
  }
}

export async function importCloudData(
  rawPayload: ExportPayload,
  strategy: ImportStrategy,
  client: ApolloClient,
  options?: {
    onProgress?: (p: ImportProgress) => void
    session?: ImportSession
    // Where the file's local default location goes: the answer of the
    // "Import into which location?" dialog (households H4 task E.4). Needed
    // when `needsImportLocation(rawPayload)` is true and the strategy is not
    // `clear`; ignored otherwise. A retry passes the session instead, which
    // holds it.
    target?: ImportTarget
    // The cloud active location when the import starts. With it, a `skip` or
    // `replace` import may return `switchToLocationId` (owner decision of
    // 2026-11-17, `locationToShowAfterImport`). Without it, never.
    activeLocationId?: string
  },
): Promise<CloudImportResult> {
  const onProgress = options?.onProgress ?? (() => undefined)
  // The session records the payload AS GIVEN. A resumed import runs
  // `placeDefaultLocation` again. The batch keys are
  // `${mode}:${entityType}:${i}`, so what has to match the first attempt is
  // the row COUNT and ORDER per entity, and both are fixed: the placement
  // rewrites ids only, and the legacy upgrade makes exactly one stock row per
  // item, in item order. (Those rows get fresh `crypto.randomUUID()` ids on a
  // resume. That is harmless: a batch with a new id is one that was never
  // sent, since every sent batch is skipped by key.)
  const session: ImportSession = options?.session ?? {
    payload: rawPayload,
    strategy,
    completedBatchKeys: new Set(),
    ...(options?.target !== undefined ? { target: options.target } : {}),
  }

  try {
    // ── 1. Place the default location, as far as it is known now ──
    //
    // On `clear` the new "Home" does not exist until the clear has run, and a
    // "New location" is created only after the check has passed (so a
    // refused import creates nothing). In both cases the rows stay at the
    // placeholder `'local'` for the check, and are moved after.
    const needsTarget = strategy !== 'clear' && needsImportLocation(rawPayload)
    const target = session.target
    if (needsTarget && target === undefined) {
      throw new Error(
        'importCloudData: this file needs a target location (ImportLocationDialog)',
      )
    }
    const knownTarget =
      needsTarget && target !== undefined && 'locationId' in target
        ? target.locationId
        : undefined
    const placed = placeDefaultLocation(
      rawPayload,
      knownTarget ?? DEFAULT_LOCATION_ID,
    )

    // ── 2. Check every id BEFORE the first write (decision T1) ──
    //
    // This must stay before `clearAllData` and before every bulk mutation.
    // It is what makes "Nothing was imported" true: the bulk mutations
    // check one batch at a time, so a refusal there comes after the earlier
    // batches were written.
    let check: ImportIdCheck
    try {
      check = await checkImportIds(client, placed, {
        forClear: strategy === 'clear',
        ...(knownTarget === undefined
          ? { omitLocationIds: new Set([DEFAULT_LOCATION_ID]) }
          : {}),
      })
    } catch (err) {
      // A FORBIDDEN from `importCheck` is the household role check: it runs
      // before any read (decision T17).
      if (isForbiddenImportError(err)) throw new ImportRefusedError('role')
      throw err
    }
    if (check.anotherHousehold) throw new ImportRefusedError('anotherHousehold')

    if (strategy === 'clear') {
      // The FIRST total is the placed payload's; the rows dropped below can
      // only make it smaller. It only opens the progress bar, and the real
      // total is computed again from what is sent.
      onProgress({
        completedBatches: 0,
        totalBatches: computeTotalBatches(placed),
        currentEntity: '',
      })
      // A retry of a failed `clear` passes the same session. Its batch keys
      // name batches the first attempt sent, but the clear below deletes
      // those rows again. So every batch must be sent again: forget the keys
      // (E.4 review finding 1; the bug is older than H4).
      session.completedBatchKeys.clear()
      await client.mutate({ mutation: ClearAllDataDocument })
      // AFTER the clear, never before: see `fetchHomeAfterClear`.
      const home = await fetchHomeAfterClear(client)
      const { payload, skipped } = withoutRefusedRows(
        placeDefaultLocation(placed, home),
        check,
      )
      await bulkCreate({
        client,
        data: payload,
        session,
        onProgress,
        startCompleted: 0,
        totalBatches: computeTotalBatches(payload),
      })
      await deleteHomeIfUnused(client, payload, home)
      await resetStoreAfterImport(client)
      return { skipped }
    }

    // ── 3. A "New location": create it now that the check has passed ──
    let finalTarget = knownTarget
    if (needsTarget && target !== undefined && 'newLocationName' in target) {
      finalTarget = await createImportLocation(client, target.newLocationName)
      session.target = { locationId: finalTarget }
    }
    const placedFinal =
      finalTarget === undefined || finalTarget === knownTarget
        ? placed
        : placeDefaultLocation(placed, finalTarget)

    // ── 4. Leave out the rows the check refused (step 2.3) ──
    const { payload, skipped } = withoutRefusedRows(placedFinal, check)

    // Run after the last write of `skip` or `replace`. A file that asked
    // "Import into which location?" never switches: the user chose there.
    const showAfter = () =>
      needsTarget
        ? Promise.resolve(undefined)
        : locationToShowAfterImport(client, payload, options?.activeLocationId)

    // `skip` and `replace` delete nothing.
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

      const switchTo = await showAfter()
      await resetStoreAfterImport(client)
      return withSwitch(skipped, switchTo)
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
    const switchTo = await showAfter()
    await resetStoreAfterImport(client)
    return withSwitch(skipped, switchTo)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    ;(error as Error & { session: ImportSession }).session = session
    throw error
  }
}
