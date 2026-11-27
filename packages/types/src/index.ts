export const DEFAULT_PACKAGE_UNIT = 'pack'

export type ExpirationMode = 'disabled' | 'date' | 'days from purchase'

// Global item identity AND stock CONFIGURATION — how the item is packaged,
// measured, expires and is consumed. None of that varies by location, so it
// lives here (moved off ItemStock in v16, "global stock settings"). What is
// genuinely per-location — how much is here, when THIS one expires — stays on
// ItemStock.
export interface Item {
  id: string
  name: string
  // Full URL to the Wikidata entity (e.g. https://www.wikidata.org/wiki/Q...);
  // future source for name internationalization. Optional, non-indexed.
  wikidataUrl?: string
  // Free-text notes / links about the item. Optional, non-indexed.
  note?: string
  tagIds: string[]
  vendorIds?: string[]

  // Dual-unit tracking (global configuration)
  packageUnit?: string
  measurementUnit?: string
  amountPerPackage?: number

  // Which unit quantities are tracked in (global configuration)
  targetUnit: 'package' | 'measurement'

  // Consumption step size (global configuration)
  consumeAmount: number

  // Expiration configuration (the due DATE itself is per-location)
  estimatedDueDays?: number
  expirationThreshold?: number // Days before expiration to show warning
  expirationMode?: ExpirationMode

  // `false` for an item that is not used up (cups, slippers). It counts whole
  // packages only, and the card shows one square per piece. Optional, because
  // an item stored before this field existed has no value: a missing value
  // means consumable. Read it through `isConsumable`, never as a bare truthy
  // check, or a missing value reads as "not consumable".
  consumable?: boolean

  // Metadata
  createdAt: Date
  updatedAt: Date
}

/**
 * Is this item used up (tissue paper), or not (cups)? A missing or `null`
 * value means consumable: Dexie rows and backup files from before the field
 * existed carry none.
 */
export function isConsumable(item: {
  consumable?: boolean | null | undefined
}): boolean {
  return item.consumable !== false
}

/**
 * Is this item active at this location? A boolean `isActive` decides, whatever
 * the target is (an active row with target 0 has "no target"). A missing or
 * `null` value is old data: a Dexie row, a backup file or a test fixture
 * written before the field existed. It keeps the old rule, so target 0 reads
 * as inactive. Every writer writes the value; this fallback is only for rows
 * nobody wrote since then.
 *
 * The parameter is structural on purpose, so a caller can pass a live form
 * value or a GraphQL row as well as an `ItemStock`.
 */
export function isStockActive(stock: {
  isActive?: boolean | null | undefined
  targetQuantity: number
}): boolean {
  return typeof stock.isActive === 'boolean'
    ? stock.isActive
    : stock.targetQuantity !== 0
}

// Per-(item × location) stocking STATE. A (itemId, locationId) pair is unique.
// An item is "stocked at" a location iff an ItemStock row exists for that pair.
//
// Configuration (units, packaging, expiration mode, consume amount) is NOT
// here — it is global and lives on `Item` since v16.
export interface ItemStock {
  id: string
  itemId: string
  locationId: string

  // The "Active here" switch: is the item in use AT THIS LOCATION? `false`
  // shows it as inactive here and keeps its target and refill. Optional
  // because old data has none: a Dexie row, a backup file or a test fixture
  // written before the field existed. Never read it directly; read it through
  // `isStockActive` (above), which gives a missing value the old meaning
  // (target 0 = inactive). The web reads that through isInactive /
  // isStockedHere / isInactiveHere in apps/web/src/lib/quantityUtils.ts.
  isActive?: boolean

  // Quantity state. Target 0 on an ACTIVE row means "no target".
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number

  // Expiration state: when the stock in THIS location expires.
  dueDate?: Date

  // Metadata
  createdAt: Date
  updatedAt: Date
}

// The per-location stock STATE fields of an ItemStock, without the join keys or
// per-row metadata. Used by quantity/expiration helpers and forms that operate
// on stock values regardless of which row they came from.
export type StockFields = Omit<
  ItemStock,
  'id' | 'itemId' | 'locationId' | 'createdAt' | 'updatedAt'
>

// The global stock CONFIGURATION half — the eight fields that moved off
// ItemStock onto Item in v16. Quantity/expiration helpers need both halves, so
// they take `StockFields & StockConfigFields`; a PantryItem satisfies that.
export type StockConfigFields = Pick<
  Item,
  | 'packageUnit'
  | 'measurementUnit'
  | 'amountPerPackage'
  | 'targetUnit'
  | 'consumeAmount'
  | 'estimatedDueDays'
  | 'expirationThreshold'
  | 'expirationMode'
>

// A global Item (identity + stock configuration) joined with its
// active-location ItemStock state. This is the runtime shape the
// pantry/shopping/cooking pages consume — the hooks join an Item with its
// ItemStock for the active location so existing read sites keep reading
// `item.packedQuantity`, `item.targetQuantity`, `item.packageUnit`, etc.
// unchanged, regardless of which half each field now lives on.
//
// `stockId`/`locationId` identify the underlying ItemStock row (for writes).
// When an item is NOT stocked in the active location, the join yields zeroed
// stock fields and `stockId` is undefined.
export type PantryItem = Item &
  StockFields & {
    stockId?: string
    locationId?: string
  }

export interface Tag {
  id: string
  name: string
  typeId: string
  parentId?: string
}

export enum TagColor {
  orange = 'orange',
  brown = 'brown',
  green = 'green',
  teal = 'teal',
  cyan = 'cyan',
  blue = 'blue',
  indigo = 'indigo',
  purple = 'purple',
  pink = 'pink',
  rose = 'rose',
}

export interface TagType {
  id: string
  name: string
  color: TagColor
}

export interface InventoryLog {
  id: string
  itemId: string
  // The location this log belongs to. Added in the Location feature (PR D);
  // existing logs are migrated to DEFAULT_LOCATION_ID. Optional for back-compat
  // with cloud/export payloads that predate the field.
  locationId?: string
  delta: number
  quantity: number
  note?: string
  // The kind of change: `purchase`, `cooking` or `stockCount` (see
  // `inventoryLog.ts`). Older rows hold an i18n key path instead, such as
  // `shopping.log.purchasedAt`, and the oldest rows only a `note`.
  logKey?: string
  // Data, not text: ids plus a name snapshot for new rows (a list of recipes
  // is an array), plain names for older rows.
  logParams?: Record<string, unknown>
  occurredAt: Date
  createdAt: Date
}

export interface ShoppingCart {
  // Cart id is `${locationId}:${vendorId | 'no-vendor'}` (per location × vendor).
  // Added in the Location feature (PR D); previously the id was just the vendor
  // id or 'no-vendor'.
  id: string
  lastPurchasedAt?: Date
}

// Build the location-scoped cart id. vendorId === null means the no-vendor cart.
//
// Both `apps/web` and `apps/server` import this function. The server's cart
// re-key migration also builds the no-vendor id in SQL as
// `l."id" || ':no-vendor'`, so changing the format here makes that SQL wrong.
// `apps/server/src/lib/cartIdRules.test.ts` pins the exact ids.
export function cartIdFor(locationId: string, vendorId: string | null): string {
  return `${locationId}:${vendorId ?? 'no-vendor'}`
}

// Parse a location-scoped cart id back into its parts. Returns vendorId === null
// for the no-vendor cart. Handles vendor ids that themselves contain ':' by
// splitting only on the first colon.
//
// A cart id with no colon at all is a pre-migration id. It parses as
// `{ locationId: <the whole id>, vendorId: null }`. No real location has that
// id, so the server's `requireLocationRole` rejects it. That is on purpose: an
// old client must fail loudly rather than read another location's cart.
export function parseCartId(cartId: string): {
  locationId: string
  vendorId: string | null
} {
  const idx = cartId.indexOf(':')
  if (idx === -1) return { locationId: cartId, vendorId: null }
  const locationId = cartId.slice(0, idx)
  const rest = cartId.slice(idx + 1)
  return { locationId, vendorId: rest === 'no-vendor' ? null : rest }
}

export interface CartItem {
  id: string
  cartId: string
  itemId: string
  quantity: number
}

/**
 * Is this cart row being bought on this trip?
 *
 * A row at quantity 0 is PINNED. It stays in the permanent cart, is not bought,
 * and gets no inventory log. Anything above 0 is being bought.
 *
 * This is the only JavaScript copy. Two places must give the same answer:
 *
 * | Side | Where | Form |
 * |---|---|---|
 * | web | the cloud shopping page, `checkoutRows` in `apps/web/src/routes/shopping/$vendorId.tsx` | this function |
 * | server | `checkout` in `apps/server/src/resolvers/cart.resolver.ts` | the SQL filter `quantity: { gt: 0 }` |
 *
 * ── WHY THEY MUST AGREE ──
 *
 * Since households H3b task B.5 the cloud `checkout` mutation takes the rows
 * the screen showed as being bought (`{ cartItemId, quantity }`), and refuses
 * the whole checkout with `CART_CHANGED` when that list is not exactly the
 * cart's rows with `quantity > 0`. So if the web rule and the SQL filter ever
 * disagreed, every checkout of a cart holding the row they disagree about
 * would be refused. Change the SQL filter in the same commit if this rule
 * changes. (Until task B.5 the server also called this function, and a
 * mismatch failed with `BAD_USER_INPUT`.)
 *
 * `apps/server/src/lib/isBeingBought.test.ts` pins its answers.
 */
export function isBeingBought(cartItem: { quantity: number }): boolean {
  return cartItem.quantity > 0
}

export interface Vendor {
  id: string
  name: string
  createdAt: Date
}

export interface RecipeItem {
  itemId: string
  defaultAmount: number // in item's native unit (measurement or package)
}

export interface Recipe {
  id: string
  name: string
  items: RecipeItem[]
  createdAt: Date
  updatedAt: Date
  lastCookedAt?: Date
}

export interface FilterConfig {
  tagIds?: string[]
  vendorIds?: string[]
  recipeIds?: string[]
}

export interface Shelf {
  id: string
  name: string
  type: 'filter' | 'selection' | 'system'
  order: number
  filterConfig?: FilterConfig
  itemIds?: string[]
  createdAt: Date
  updatedAt: Date
}

// The id of the default, undeletable location. Every fresh DB and every
// upgraded DB is guaranteed to contain a Location with this id ('My Home').
export const DEFAULT_LOCATION_ID = 'local'

export interface Location {
  id: string
  name: string
  order: number
  // LOCAL MODE ONLY. The local user's single undeletable location ("My Home").
  // Exactly one local row carries `true`, and its id is DEFAULT_LOCATION_ID.
  // Not derivable from `order`: LocationList disables dragging *of* the default
  // row, but another row dragged above it still displaces it, so the default's
  // order is not stable.
  //
  // Cloud rows never carry it (households H3a, task 3.12). A household has no
  // default location: any location can be deleted, the last one too since
  // households H5 task F.7 (before, the server refused it with
  // `LAST_LOCATION`). Where cloud code needs "the
  // fallback location", it uses the FIRST location (the server returns them
  // by `order`). So code must test `isDefault === true`, never just read it.
  isDefault?: boolean
  createdAt: Date
  updatedAt: Date
}

// The quantity rules shared by the web and the server (households H3b, task
// B.1). `quantity.ts` imports two types back from this file. That import is
// type-only, so it is erased at build time and makes no runtime cycle.
export * from './quantity'

// The location role rules shared by the web and the server (households H5c,
// decision T33): the rank map, `locationRoleAtLeast` and
// `canChangeLocationRole`.
export * from './locationRoles'

// The inventory log kinds and the stock count rule shared by the web and the
// server (design 2026-11-25, inventory log layout).
export * from './inventoryLog'
