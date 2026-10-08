import type { ApolloClient } from '@apollo/client'
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
  InventoryLogsDocument,
  type InventoryLogsQuery,
  type ItemInput,
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
// Why ONLY the default remaps: a cloud -> local -> cloud round trip then
// preserves every id, and carts keep upserting by their composite
// `${locationId}:${vendorId}` id. Only a FIRST copy between modes rewrites
// anything, and only one location's worth.
// ---------------------------------------------------------------------------

// Which location the payload itself calls its default.
//
// `isDefault` is the primary answer. Dexie v18 carries it on every local row,
// and a cloud backup records it too — `sanitiseCloudPayload`
// (lib/exportData.ts) keeps the flag in the FILE even though `toLocationInput`
// drops it on the way back up, because this function is the only reader that
// can tell which row to remap.
//
// The `DEFAULT_LOCATION_ID` fallback is for a PRE-v18 local backup, which has
// no `isDefault` key at all: in local mode the default has always been that
// one id.
//
// `null` means the payload names no default — a pre-v15 file with no
// `locations` array. Nothing is remapped then, which is right: such a payload
// carries no per-location ids to rewrite either.
function findPayloadDefaultLocationId(payload: ExportPayload): string | null {
  const locations = (payload.locations ?? []) as Array<Record<string, unknown>>
  const flagged = locations.find((row) => row.isDefault === true)
  if (flagged !== undefined) return flagged.id as string
  const legacyDefault = locations.find((row) => row.id === DEFAULT_LOCATION_ID)
  return legacyDefault !== undefined ? (legacyDefault.id as string) : null
}

// Build the payload-id -> destination-id map. It holds AT MOST ONE
// non-identity entry, by design; any id absent from the map is kept verbatim.
export function buildLocationRemap(
  payload: ExportPayload,
  destinationDefaultLocationId: string | null,
): Map<string, string> {
  const remap = new Map<string, string>()
  if (destinationDefaultLocationId === null) return remap
  const payloadDefaultLocationId = findPayloadDefaultLocationId(payload)
  if (payloadDefaultLocationId === null) return remap
  if (payloadDefaultLocationId === destinationDefaultLocationId) return remap

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
// apps/server/src/lib/cartId.test.ts pins 16 cases including that one. A BARE
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
    // A pre-Location log carries no `locationId`. Leave it absent rather than
    // inventing one — the server falls back to the caller's default for it.
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

// The destination account's default location id, or `null` when it has none.
//
// ── READ THIS AFTER `clearAllData`, NEVER BEFORE ──
//
// `clearAllData` deletes every `Location` row, and `ensureDefaultLocation`
// re-creates a default LAZILY, on the next `locations` read. So an id read
// before the clear names a row that no longer exists by the time the remap
// uses it. PR 4a shipped exactly that bug — a location id that was valid when
// read and gone when used — and it cost a full E2E gate run to find, because
// no test fake models the deletion.
async function fetchCloudDefaultLocationId(
  client: ApolloClient,
): Promise<string | null> {
  const result = await client.query<GetLocationsQuery>({
    query: GetLocationsDocument,
    fetchPolicy: 'network-only',
  })
  const locations = result.data?.locations ?? []
  return locations.find((location) => location.isDefault)?.id ?? null
}

// A PRE-v15 backup carries its stock INLINE on each item, has no `itemStocks`
// key at all, and uses BARE cart ids. `importLocalData` has always upgraded
// such a payload (`upgradeLegacyPayload`). The cloud path never did, because
// two now-deleted pieces covered for it:
//
//   - `flattenPayloadForCloud` (deleted in PR 4b task 3) returned early on a
//     payload with no `itemStocks`, sending the items up with their inline
//     stock columns intact;
//   - `mirrorStockToDefaultLocation` (deleted server-side in PR 4b task 6)
//     then wrote one `ItemStock` row per imported item at the caller's default
//     location, which is what made the item visible in the cloud pantry.
//
// With both gone and nothing put in their place, a pre-v15 file imported into
// cloud mode would land every item in the catalog stocked NOWHERE — invisible
// in the pantry, with no error anywhere — and would keep writing bare cart
// ids, the ownership leak of issue #327 that task 3 closed for every other
// payload shape.
//
// Measured on this branch before this function existed: a pre-v15 payload sent
// `["BulkCreateItems", "BulkCreateShoppingCarts"]` and nothing else — no
// `itemStocks` variable in any mutation — with the cart id still `vendor_1`.
//
// THE GUARD IS THE ABSENT KEY AND NOTHING ELSE, on purpose. A payload that
// already carries `itemStocks` must reach the server exactly as it does today.
// Running the whole of `upgradeLegacyPayload` on a post-v15 payload would also
// run `upgradeUnsplitItems`, which reads the payload's items for inline stock
// and invents an `itemStocks` row from whatever it finds. On a post-v15 payload
// that is wrong whatever the item rows happen to hold: the real per-location
// rows are already in `payload.itemStocks`, so a second, synthesised set at the
// default location would collide with them. That is a different bug, not a fix.
//
// (Until cloud locations PR 5 this paragraph gave a narrower reason — a cloud
// export's items carried the legacy stock columns as 0 rather than null, so
// `hasInlineStock` answered true for every catalog-only cloud item. PR 5
// removed those columns from the cloud `Item`, so that particular symptom is
// gone. The guard is still right, for the reason above.)
//
// `null` means the destination account reports no default location, which
// `ensureDefaultLocation` makes impossible after a `locations` read. There is
// no location to synthesise stock into then, so the payload is left alone.
function upgradeLegacyPayloadForCloud(
  payload: ExportPayload,
  destinationDefaultLocationId: string | null,
): ExportPayload {
  if (payload.itemStocks !== undefined) return payload
  if (destinationDefaultLocationId === null) return payload
  return upgradeLegacyPayload(payload, destinationDefaultLocationId)
}

// Read the destination's default, upgrade a legacy payload onto it, then apply
// the remap rule — in that order. Every caller is in `importCloudData`, and the
// ORDER of this call matters on the `clear` strategy — see
// `fetchCloudDefaultLocationId`.
//
// The upgrade runs BEFORE the remap, exactly as it does in `importLocalData`:
// it can invent location ids of its own, and remapping afterwards is what keeps
// an id it created inside the rule. In practice the remap is a no-op for a
// pre-v15 payload — such a file names no default location, so
// `findPayloadDefaultLocationId` returns null — and the upgrade has already
// placed its rows on the destination's own default id.
async function prepareCloudPayload(
  payload: ExportPayload,
  client: ApolloClient,
): Promise<ExportPayload> {
  const destinationDefaultLocationId = await fetchCloudDefaultLocationId(client)
  const upgraded = upgradeLegacyPayloadForCloud(
    payload,
    destinationDefaultLocationId,
  )
  return applyLocationRemap(
    upgraded,
    buildLocationRemap(upgraded, destinationDefaultLocationId),
  )
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
// items, and `upgradeLegacyPayloadForCloud` has already turned them into real
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

// `LocationInput` (schema/import.graphql:81-115) has NO `isDefault` FIELD, so
// this mapper must drop it. The payload's default location is never uploaded as
// a row at all — the client rewrites its id onto the destination account's
// existing `isDefault` row — and the database would REJECT a second default
// rather than accept one: `Location_one_default_per_user_key` is a unique
// partial index on `("userId") WHERE "isDefault"`. Sending the flag would make
// the import die on an unhandled P2002 AFTER `clearAllData` had already run.
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
//   - A LOCATION would conflict on EVERY cloud import. The remap rewrites the
//     payload's default location id to the destination account's default
//     (`applyLocationRemap`), and that row always exists, so an id check here
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
// `requireOwnItemStockRefs` (apps/server/src/resolvers/import.resolver.ts:376)
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
        cartItems: (payload.cartItems as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.cartItems.has(e.id),
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
      cartItems: (payload.cartItems as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.cartItems.has(e.id),
      ),
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
      cartItems: (payload.cartItems as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.cartItems.has(e.id),
      ),
      shelves: ((payload.shelves ?? []) as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.shelves.has(e.id),
      ),
      // Already sent by the create pass above; sending them again would be a
      // second batch under the same key.
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
  // Pre-v15 backups carry stock inline on the item and unscoped cart ids —
  // upgrade them to the split shape before writing, into the caller's target
  // location (the active one, for the UI paths). Since PR 4b task 2 a cloud
  // export is already split, so this is a no-op for one.
  const upgraded = upgradeLegacyPayload(rawPayload, locationId)

  // THE REMAP RULE, cloud -> local direction (design §1): the payload's own
  // default location maps onto THIS database's default, and every other
  // location keeps its id. Without it a cloud backup's locations all arrive
  // under their server cuids, no row matches DEFAULT_LOCATION_ID, and
  // `ensureDefaultLocationRow` adds a stray empty "local" default beside the
  // restored ones.
  //
  // NO ORDERING HAZARD ON THIS SIDE, unlike `prepareCloudPayload`. There the
  // destination's default has to be read over the network, and reading it
  // before `clearAllData` returns an id that no longer exists. Here the
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
  const payload = applyLocationRemap(
    upgraded,
    buildLocationRemap(upgraded, DEFAULT_LOCATION_ID),
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
//     `resolveCartLocations` (apps/server/src/resolvers/import.resolver.ts:205)
//     sends a cart to the CALLER'S DEFAULT location when the cart id names a
//     location that no row holds. A cart uploaded before its location exists
//     therefore lands in the wrong location, with no error and nothing in the
//     response to show it. `resolveLogLocations` does the same for logs.
//   - `itemStocks` must come AFTER `items` and after `locations`. It is a
//     child of both, and `requireOwnItemStockRefs` (import.resolver.ts:376)
//     refuses an unknown item or location with `Forbidden`. On the `clear`
//     strategy that error arrives AFTER `clearAllData` has run, which leaves
//     the account empty and the import dead.
// ---------------------------------------------------------------------------

interface EntitySpec {
  // Also the prefix of the batch key recorded in
  // `ImportSession.completedBatchKeys`, so renaming one makes a resumed
  // session re-send that entity's batches.
  entityType: string
  select: (data: ExportPayload) => unknown[]
  create: (client: ApolloClient, batch: unknown[]) => Promise<void>
  upsert: (client: ApolloClient, batch: unknown[]) => Promise<void>
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
    const batches = chunk(spec.select(data), BATCH_SIZE)
    for (const [i, batch] of batches.entries()) {
      // The key does NOT carry `mode`, which is a PRE-EXISTING BUG and not
      // this function's to fix: on the `replace` strategy `bulkCreate` and
      // `bulkUpsert` share one session, so when both passes have rows for the
      // same entity the upsert pass finds the create pass's key and skips its
      // own batch. Neither entity added by PR 4b can hit it — `partitionPayload`
      // sends `locations` only to `toCreate` and `itemStocks` only to
      // `toUpsert`, so each has zero batches on the other pass.
      const key = `${spec.entityType}:${i}`
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
    (total, spec) => total + chunk(spec.select(data), BATCH_SIZE).length,
    0,
  )
}

export async function importCloudData(
  rawPayload: ExportPayload,
  strategy: ImportStrategy,
  client: ApolloClient,
  options?: {
    onProgress?: (p: ImportProgress) => void
    session?: ImportSession
    // NO `locationId` HERE, AND NONE IS COMING BACK. Until PR 4b this option
    // picked the one location whose stock went up, because the cloud import
    // surface was flat. The remap rule (PR 4 design §1) keeps every location
    // now, so there is nothing to pick: the destination's default is read
    // inside this function by `prepareCloudPayload`.
  },
): Promise<void> {
  const onProgress = options?.onProgress ?? (() => undefined)
  // The session records the payload AS GIVEN, because on the `clear` path
  // `prepareCloudPayload` cannot run until the clear has. A resumed import
  // re-derives its batch keys by running `prepareCloudPayload` again. The keys
  // are `${entityType}:${i}`, so what has to match the first attempt is the
  // row COUNT and ORDER per entity, and both are fixed: the remap rewrites ids
  // only, and the legacy upgrade synthesises exactly one stock row per item,
  // in item order. (Those synthesised rows get fresh `crypto.randomUUID()`
  // ids on a resume. That is harmless — a batch with a new id is one that was
  // never sent, since every sent batch is skipped by key.)
  const session: ImportSession = options?.session ?? {
    payload: rawPayload,
    strategy,
    completedBatchKeys: new Set(),
  }

  try {
    if (strategy === 'clear') {
      // The FIRST total is the raw payload's, because the destination's
      // default location cannot be read until the clear has run. The remap
      // changes no array's length, but `upgradeLegacyPayloadForCloud` does: a
      // pre-v15 file has no `itemStocks` key and gains one row per item. So
      // the total is recomputed from the prepared payload below, and this one
      // only opens the progress bar.
      onProgress({
        completedBatches: 0,
        totalBatches: computeTotalBatches(rawPayload),
        currentEntity: '',
      })
      await client.mutate({ mutation: ClearAllDataDocument })
      // AFTER the clear, never before. `clearAllData` deletes every Location
      // row and `ensureDefaultLocation` re-creates a default lazily on the
      // next `locations` read, so an id read first names a row that is gone by
      // the time the remap uses it. PR 4a shipped that exact bug and it cost a
      // full E2E gate run to find. See `fetchCloudDefaultLocationId`.
      const payload = await prepareCloudPayload(rawPayload, client)
      await bulkCreate({
        client,
        data: payload,
        session,
        onProgress,
        startCompleted: 0,
        totalBatches: computeTotalBatches(payload),
      })
      await client.resetStore()
      return
    }

    // `skip` and `replace` delete nothing, so the destination's locations are
    // the same before and after. Remapping first is required all the same:
    // conflict detection, partitioning and batching all read the payload.
    const payload = await prepareCloudPayload(rawPayload, client)
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
