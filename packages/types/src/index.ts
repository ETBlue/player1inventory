export const DEFAULT_PACKAGE_UNIT = 'pack'

export type ExpirationMode = 'disabled' | 'date' | 'days from purchase'

// Global item identity. Stock/unit/expiration now live on ItemStock (one per
// item × location); see the Location feature (PR D — Item/ItemStock split).
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

  // Metadata
  createdAt: Date
  updatedAt: Date
}

// Per-(item × location) stocking profile. A (itemId, locationId) pair is unique.
// An item is "stocked at" a location iff an ItemStock row exists for that pair.
export interface ItemStock {
  id: string
  itemId: string
  locationId: string

  // Dual-unit tracking
  packageUnit?: string
  measurementUnit?: string
  amountPerPackage?: number

  // Quantity tracking
  targetUnit: 'package' | 'measurement'
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number

  // Consumption
  consumeAmount: number

  // Expiration
  dueDate?: Date
  estimatedDueDays?: number
  expirationThreshold?: number // Days before expiration to show warning
  expirationMode?: ExpirationMode

  // Metadata
  createdAt: Date
  updatedAt: Date
}

// The stock/unit/expiration fields of an ItemStock, without the join keys or
// per-row metadata. Used by quantity/expiration helpers and forms that operate
// on stock values regardless of which row they came from.
export type StockFields = Omit<
  ItemStock,
  'id' | 'itemId' | 'locationId' | 'createdAt' | 'updatedAt'
>

// A global Item joined with its active-location ItemStock fields. This is the
// runtime shape the pantry/shopping/cooking pages consume — the hooks join an
// Item with its ItemStock for the active location so existing read sites keep
// reading `item.packedQuantity`, `item.targetQuantity`, etc. unchanged.
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
  logKey?: string
  logParams?: Record<string, string>
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
export function cartIdFor(locationId: string, vendorId: string | null): string {
  return `${locationId}:${vendorId ?? 'no-vendor'}`
}

// Parse a location-scoped cart id back into its parts. Returns vendorId === null
// for the no-vendor cart. Handles vendor ids that themselves contain ':' by
// splitting only on the first colon.
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
  createdAt: Date
  updatedAt: Date
}
