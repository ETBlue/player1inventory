import type { Language } from '@/lib/language'
import { getPackedTotal } from '@/lib/quantityUtils'
import type {
  CartItem,
  InventoryLog,
  Item,
  ItemStock,
  Location,
  PantryItem,
  Recipe,
  RecipeItem,
  Shelf,
  ShoppingCart,
  StockFields,
  Tag,
  TagType,
  Vendor,
} from '@/types'
import { cartIdFor, DEFAULT_LOCATION_ID, parseCartId, TagColor } from '@/types'
import { db } from './index'

// ── ItemStock helpers ──────────────────────────────────────────────────────
//
// Per-location stock STATE lives on an ItemStock row; stock CONFIGURATION
// (units, packaging, expiration mode, consume amount) is global and lives on
// the Item since v16. Components consume a joined `PantryItem`
// (Item + active-location stock); operations expose both the raw ItemStock CRUD
// and the joined reads.

// The default stock state used when an item has no ItemStock in the requested
// location (so a joined PantryItem still reads sensible zeroed values).
const ZERO_STOCK: StockFields = {
  targetQuantity: 0,
  refillThreshold: 0,
  packedQuantity: 0,
  unpackedQuantity: 0,
}

// Every field `joinItemStock` copies from an ItemStock onto an Item. The eight
// configuration fields are deliberately absent — they are the Item's own.
const STOCK_FIELD_KEYS: (keyof StockFields)[] = [
  'targetQuantity',
  'refillThreshold',
  'packedQuantity',
  'unpackedQuantity',
  'dueDate',
]

// Pull just the stock fields off an object (drops join keys / metadata / undefined).
function pickStockFields(source: Record<string, unknown>): StockFields {
  const out: StockFields = { ...ZERO_STOCK }
  const keys = STOCK_FIELD_KEYS
  for (const key of keys) {
    const value = source[key]
    if (value !== undefined) {
      // biome-ignore lint/suspicious/noExplicitAny: assigning across the union of stock field types
      ;(out as any)[key] = value
    }
  }
  return out
}

// Reduce an already-joined PantryItem back to its global Item.
//
// Re-joining a PantryItem with a DIFFERENT location's row without this is a
// data-correctness bug, not a tidiness one: an ItemStock omits its unset
// optional keys entirely (see ZERO_STOCK / pickStockFields), so spreading the
// second row over the first join leaves the FIRST location's `dueDate` showing
// through — and a form fed that shape saves one location's expiry into
// another location's row. (Before v16 the same trap covered the unit and
// expiration-config keys too; those are global now and are meant to survive.)
export function stripStockFields(item: PantryItem): Item {
  // Typed as Partial<PantryItem> so the deletes type-check (every key being
  // removed is optional there) and the result still converts to Item.
  const out: Partial<PantryItem> = { ...item }
  for (const key of STOCK_FIELD_KEYS) delete out[key]
  delete out.stockId
  delete out.locationId
  return out as Item
}

// Join an Item with a stock row into the runtime PantryItem shape.
export function joinItemStock(
  item: Item,
  stock: ItemStock | undefined,
  locationId: string,
): PantryItem {
  if (!stock) {
    return { ...item, ...ZERO_STOCK, locationId }
  }
  const { id, itemId, createdAt, updatedAt, ...stockFields } = stock
  void itemId
  void createdAt
  void updatedAt
  return { ...item, ...stockFields, stockId: id, locationId: stock.locationId }
}

export async function getItemStock(
  itemId: string,
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<ItemStock | undefined> {
  return db.itemStocks
    .where('[itemId+locationId]')
    .equals([itemId, locationId])
    .first()
}

export async function getItemStocks(itemId: string): Promise<ItemStock[]> {
  return db.itemStocks.where('itemId').equals(itemId).toArray()
}

export async function getItemStocksByLocation(
  locationId: string,
): Promise<ItemStock[]> {
  return db.itemStocks.where('locationId').equals(locationId).toArray()
}

// Insert or update the ItemStock for (itemId, locationId), merging stock fields.
export async function upsertItemStock(
  itemId: string,
  locationId: string,
  fields: Partial<StockFields>,
): Promise<ItemStock> {
  const now = new Date()
  const existing = await getItemStock(itemId, locationId)
  if (existing) {
    const updated: ItemStock = { ...existing, ...fields, updatedAt: now }
    await db.itemStocks.put(updated)
    return updated
  }
  const stock: ItemStock = {
    ...ZERO_STOCK,
    ...fields,
    id: crypto.randomUUID(),
    itemId,
    locationId,
    createdAt: now,
    updatedAt: now,
  }
  await db.itemStocks.add(stock)
  return stock
}

// Copy-on-add: stock an existing item in a location, inheriting the per-location
// stock STATE except packed/unpacked quantities (which start at 0). Source row =
// the active location's stock if present, else the item's most-recently-updated
// stock. No-op (returns the existing row) if the item is already stocked there.
//
// Since v16 there is nothing to copy for units / packaging / expiration mode /
// consume amount: those are global Item fields and the new location shares them
// automatically. Only targetQuantity, refillThreshold and dueDate are inherited.
export async function addItemToLocation(
  itemId: string,
  locationId: string,
  sourceLocationId: string = DEFAULT_LOCATION_ID,
): Promise<ItemStock> {
  const existing = await getItemStock(itemId, locationId)
  if (existing) return existing

  const all = await getItemStocks(itemId)
  const source =
    all.find((s) => s.locationId === sourceLocationId) ??
    all.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]

  const fields: StockFields = source
    ? {
        ...pickStockFields(source as unknown as Record<string, unknown>),
        packedQuantity: 0,
        unpackedQuantity: 0,
      }
    : { ...ZERO_STOCK }

  return upsertItemStock(itemId, locationId, fields)
}

// Un-stock an item from one location: deletes that (item × location) ItemStock
// row and cascades the data that only makes sense alongside it — the item's
// inventory logs for that location and its entries in that location's carts
// (`${locationId}:${vendorId|'no-vendor'}`). The cart rows themselves survive:
// they are shared by every item in the location.
//
// The global `Item` deliberately persists. An item removed from its last
// location becomes an "orphan": hidden from the pantry (`getStockedItems`
// filters on ItemStock) but still in the catalog (`getAllItems`), so the Add
// combobox can find and re-add it. Use `deleteItem` to remove it everywhere.
//
// Local/Dexie only. Cloud mode has no locations and no ItemStock — cloud items
// carry inline stock on the GraphQL `Item` — so no cloud branch exists here and
// nothing in the cloud code path may call this.
export async function removeItemFromLocation(
  itemId: string,
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<void> {
  await db.itemStocks
    .where('[itemId+locationId]')
    .equals([itemId, locationId])
    .delete()

  // Inventory logs for this (item, location). Logs predating the Location
  // feature may carry no locationId, so treat an absent one as the default
  // location — the same reading `getItemLogs` uses.
  const logIds = (
    await db.inventoryLogs.where('itemId').equals(itemId).toArray()
  )
    .filter((log) => (log.locationId ?? DEFAULT_LOCATION_ID) === locationId)
    .map((log) => log.id)
  if (logIds.length > 0) await db.inventoryLogs.bulkDelete(logIds)

  // Entries in this location's carts (every vendor cart plus the no-vendor
  // one). Match on the parsed cart id rather than a string prefix so a vendor
  // id containing ':' can't be mistaken for a location.
  const cartItemIds = (
    await db.cartItems.where('itemId').equals(itemId).toArray()
  )
    .filter((ci) => parseCartId(ci.cartId).locationId === locationId)
    .map((ci) => ci.id)
  if (cartItemIds.length > 0) await db.cartItems.bulkDelete(cartItemIds)
}

// Item operations
//
// CreateItemInput accepts the global item fields (identity + stock
// configuration) plus the optional per-location stock state: existing
// callers/tests pass one flat object, which we split into the global Item and
// an ItemStock for `locationId` (default 'local'). `targetUnit`/`consumeAmount`
// are required on an Item but optional here — they fall back to their defaults.
type CreateItemInput = Omit<
  Item,
  'id' | 'createdAt' | 'updatedAt' | 'targetUnit' | 'consumeAmount'
> &
  Partial<Pick<Item, 'targetUnit' | 'consumeAmount'>> &
  Partial<StockFields>

export interface CreateItemOptions {
  /**
   * Create the item in the global catalog only, skipping the per-location
   * `ItemStock` write. Opt-in: omitted or `false` keeps the historic
   * behaviour of stocking the new item in `locationId`.
   *
   * Used by the Settings assignment tabs (shelves/vendors/recipes/tags),
   * which edit a global item↔entity relation and must not write
   * location-scoped stock. The result is an intentional orphan — in the
   * catalog, attached to the entity, stocked nowhere. `getAllItems` already
   * surfaces such items with `ZERO_STOCK` and no `stockId`; `getStockedItems`
   * (the pantry) excludes them.
   */
  catalogOnly?: boolean
}

export async function createItem(
  input: CreateItemInput,
  locationId: string = DEFAULT_LOCATION_ID,
  options: CreateItemOptions = {},
): Promise<PantryItem> {
  const now = new Date()
  const {
    name,
    tagIds,
    vendorIds,
    wikidataUrl,
    note,
    // Global stock configuration
    packageUnit,
    measurementUnit,
    amountPerPackage,
    targetUnit,
    consumeAmount,
    estimatedDueDays,
    expirationThreshold,
    expirationMode,
    // Per-location stock state (written to the ItemStock below)
    targetQuantity: _tq,
    refillThreshold: _rt,
    packedQuantity: _pq,
    unpackedQuantity: _uq,
    dueDate: _dd,
    ...rest
  } = input
  void rest

  const item: Item = {
    id: crypto.randomUUID(),
    name,
    tagIds,
    ...(vendorIds !== undefined ? { vendorIds } : {}),
    ...(wikidataUrl !== undefined ? { wikidataUrl } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(packageUnit !== undefined ? { packageUnit } : {}),
    ...(measurementUnit !== undefined ? { measurementUnit } : {}),
    ...(amountPerPackage !== undefined ? { amountPerPackage } : {}),
    targetUnit: targetUnit ?? 'package',
    consumeAmount: consumeAmount ?? 1,
    ...(estimatedDueDays !== undefined ? { estimatedDueDays } : {}),
    ...(expirationThreshold !== undefined ? { expirationThreshold } : {}),
    ...(expirationMode !== undefined ? { expirationMode } : {}),
    createdAt: now,
    updatedAt: now,
  }
  await db.items.add(item)

  // Catalog-only create: no ItemStock anywhere. The join below with an
  // undefined stock yields the same zeroed, stockId-less shape `getAllItems`
  // already produces for items not stocked in the requested location.
  if (options.catalogOnly) {
    return joinItemStock(item, undefined, locationId)
  }

  const stock = await upsertItemStock(
    item.id,
    locationId,
    pickStockFields(input as Record<string, unknown>),
  )
  return joinItemStock(item, stock, locationId)
}

export async function getItem(
  id: string,
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<PantryItem | undefined> {
  const item = await db.items.get(id)
  if (!item) return undefined
  const stock = await getItemStock(id, locationId)
  return joinItemStock(item, stock, locationId)
}

export async function getAllItems(
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<PantryItem[]> {
  const items = await db.items.toArray()
  const stocks = await getItemStocksByLocation(locationId)
  const stockByItem = new Map(stocks.map((s) => [s.itemId, s]))
  return items.map((item) =>
    joinItemStock(item, stockByItem.get(item.id), locationId),
  )
}

// Items stocked in a location (have an ItemStock row there), joined with stock.
// This is what the pantry shows — items not stocked in the active location are
// absent. (PR D scopes the pantry; the combobox to add more is a later phase.)
export async function getStockedItems(
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<PantryItem[]> {
  const stocks = await getItemStocksByLocation(locationId)
  const items = await db.items.bulkGet(stocks.map((s) => s.itemId))
  const result: PantryItem[] = []
  for (let i = 0; i < stocks.length; i++) {
    const item = items[i]
    if (item) result.push(joinItemStock(item, stocks[i], locationId))
  }
  return result
}

// Update global Item fields and/or the active-location stock state. The five
// per-location state fields in `updates` are routed to the ItemStock for
// `locationId`; everything else — identity (name, tagIds, vendorIds,
// wikidataUrl, note) AND stock configuration (units, packaging, expiration
// mode/threshold/days, consume amount) — stays on the Item, where it applies to
// every location at once.
export async function updateItem(
  id: string,
  updates: Partial<Omit<Item, 'id' | 'createdAt'>> & Partial<StockFields>,
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<void> {
  await writeItemUpdate(id, updates, locationId, new Date())
}

// The field-routing half of `updateItem`, factored out so the transactional
// batch below splits fields identically instead of re-deriving the rule. Awaits
// only Dexie promises, so it is safe to call from inside a transaction.
async function writeItemUpdate(
  id: string,
  updates: Partial<Omit<Item, 'id' | 'createdAt'>> & Partial<StockFields>,
  locationId: string,
  now: Date,
): Promise<void> {
  const stockKeys: (keyof StockFields)[] = STOCK_FIELD_KEYS
  const stockUpdate: Partial<StockFields> = {}
  const itemUpdate: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if ((stockKeys as string[]).includes(key)) {
      // biome-ignore lint/suspicious/noExplicitAny: routing dynamic keys to the stock partial
      ;(stockUpdate as any)[key] = value
    } else {
      itemUpdate[key] = value
    }
  }

  if (Object.keys(itemUpdate).length > 0) {
    await db.items.update(id, { ...itemUpdate, updatedAt: now })
  }
  if (Object.keys(stockUpdate).length > 0) {
    // upsert so a not-yet-stocked item still records the change for this location
    await upsertItemStock(id, locationId, stockUpdate)
  }
}

// Everything one unit switch rewrites, in the order it is written.
//
// Nothing here is computed inside the transaction: a Dexie transaction is
// zone-scoped, and awaiting a foreign (non-Dexie) promise inside it can detach
// the zone so later writes commit OUTSIDE the transaction — exactly the
// partial-commit this operation exists to prevent. The caller does all the
// arithmetic (conversion factors, recipe amounts) and hands over finished rows.
export type UnitSwitchBatchInput = {
  itemId: string
  // The Item's own update — identity plus the global stock configuration.
  // Routed by field exactly as `updateItem` does, so a per-location state field
  // slipped in here still lands on `locationId`'s stock row.
  updates: Partial<Omit<Item, 'id' | 'createdAt'>> & Partial<StockFields>
  // Which location `updates`' per-location fields (if any) belong to.
  locationId?: string
  // One entry per stocked location whose tracked quantities the switch moves.
  // The factor (`amountPerPackage`) is global, so every location converts —
  // see `convertTrackedQuantities`.
  stockConversions: Array<{
    locationId: string
    quantities: Partial<StockFields>
  }>
  // One entry per recipe whose `defaultAmount` for this item is expressed in
  // the old unit. `items` is the FULL replacement array, already rewritten.
  recipeUpdates: Array<{ recipeId: string; items: RecipeItem[] }>
}

// Commit a unit switch as one atomic write.
//
// A switch touches three kinds of row — the Item's configuration, one ItemStock
// per location holding quantities expressed in the old unit, and one recipe per
// `defaultAmount` expressed in it. Written separately, a failure partway leaves
// the item on the NEW unit while some locations and recipes still hold OLD-unit
// numbers: mixed units, silently, with no error surfaced. This is inventory
// data, so it is all-or-nothing.
//
// Every table touched must be declared — touching an undeclared table throws at
// runtime, not compile time.
export async function applyUnitSwitchBatch(
  input: UnitSwitchBatchInput,
): Promise<void> {
  const locationId = input.locationId ?? DEFAULT_LOCATION_ID
  const now = new Date()
  await db.transaction(
    'rw',
    [db.items, db.itemStocks, db.recipes],
    async () => {
      await writeItemUpdate(input.itemId, input.updates, locationId, now)
      for (const conversion of input.stockConversions) {
        await upsertItemStock(
          input.itemId,
          conversion.locationId,
          conversion.quantities,
        )
      }
      for (const update of input.recipeUpdates) {
        await db.recipes.update(update.recipeId, {
          items: update.items,
          updatedAt: now,
        })
      }
    },
  )
}

export async function deleteItem(id: string): Promise<void> {
  // Delete all stock rows for this item (every location)
  await db.itemStocks.where('itemId').equals(id).delete()

  // Delete related inventory logs
  await db.inventoryLogs.where('itemId').equals(id).delete()

  // Delete related cart items
  await db.cartItems.where('itemId').equals(id).delete()

  // Cascade: remove item from all recipes
  const recipes = await db.recipes
    .filter((recipe) => recipe.items.some((ri) => ri.itemId === id))
    .toArray()
  const now = new Date()
  for (const recipe of recipes) {
    await db.recipes.update(recipe.id, {
      items: recipe.items.filter((ri) => ri.itemId !== id),
      updatedAt: now,
    })
  }

  // Delete the item itself
  await db.items.delete(id)
}

// Per-item counts of the two families `removeItemFromLocation` cascades.
// Passing `locationId` scopes the count to that location using exactly the
// predicate the cascade deletes by, so the Stock tab's remove confirmation can
// state what disappears for the location it names. Omitting it counts every
// location (the original, item-global behaviour).
export async function getInventoryLogCountByItem(
  itemId: string,
  locationId?: string,
): Promise<number> {
  if (locationId === undefined) {
    return await db.inventoryLogs.where('itemId').equals(itemId).count()
  }
  // Logs predating the Location feature carry no locationId; treat an absent
  // one as the default location (same reading as getItemLogs / the cascade).
  return await db.inventoryLogs
    .where('itemId')
    .equals(itemId)
    .filter((log) => (log.locationId ?? DEFAULT_LOCATION_ID) === locationId)
    .count()
}

export async function getCartItemCountByItem(
  itemId: string,
  locationId?: string,
): Promise<number> {
  if (locationId === undefined) {
    return await db.cartItems.where('itemId').equals(itemId).count()
  }
  return await db.cartItems
    .where('itemId')
    .equals(itemId)
    .filter((ci) => parseCartId(ci.cartId).locationId === locationId)
    .count()
}

// InventoryLog operations
type CreateLogInput = {
  itemId: string
  locationId?: string
  delta: number
  quantity: number // final total in package units — provided by caller, not derived from log history
  occurredAt: Date
  note?: string
  logKey?: string
  logParams?: Record<string, string>
}

export async function addInventoryLog(
  input: CreateLogInput,
): Promise<InventoryLog> {
  const now = new Date()

  const log: InventoryLog = {
    id: crypto.randomUUID(),
    itemId: input.itemId,
    locationId: input.locationId ?? DEFAULT_LOCATION_ID,
    delta: input.delta,
    quantity: input.quantity,
    occurredAt: input.occurredAt,
    createdAt: now,
  }
  if (input.note) log.note = input.note
  if (input.logKey) log.logKey = input.logKey
  if (input.logParams) log.logParams = input.logParams

  await db.inventoryLogs.add(log)
  return log
}

// Logs for an item scoped to a location. Older logs predating the location
// feature carry locationId === DEFAULT_LOCATION_ID (set by the v15 migration).
export async function getItemLogs(
  itemId: string,
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<InventoryLog[]> {
  const logs = await db.inventoryLogs
    .where('itemId')
    .equals(itemId)
    .sortBy('occurredAt')
  return logs.filter(
    (log) => (log.locationId ?? DEFAULT_LOCATION_ID) === locationId,
  )
}

export async function getCurrentQuantity(
  itemId: string,
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<number> {
  const logs = await getItemLogs(itemId, locationId)
  return logs.reduce((sum, log) => sum + log.delta, 0)
}

export async function getLastPurchaseDate(
  itemId: string,
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<Date | null> {
  const logs = (await getItemLogs(itemId, locationId)).filter(
    (log) => log.delta > 0,
  )

  if (logs.length === 0) return null

  const latest = logs.reduce((a, b) => (a.occurredAt > b.occurredAt ? a : b))
  return latest.occurredAt
}

// TagType operations
export async function createTagType(input: {
  name: string
  color?: TagColor
}): Promise<TagType> {
  const tagType: TagType = {
    id: crypto.randomUUID(),
    name: input.name,
    color: input.color || TagColor.blue,
  }
  await db.tagTypes.add(tagType)
  return tagType
}

export async function getAllTagTypes(): Promise<TagType[]> {
  return db.tagTypes.toArray()
}

export async function updateTagType(
  id: string,
  updates: Partial<Omit<TagType, 'id'>>,
): Promise<void> {
  await db.tagTypes.update(id, updates)
}

export async function deleteTagType(id: string): Promise<void> {
  const tags = await db.tags.where('typeId').equals(id).toArray()
  for (const tag of tags) {
    await deleteTag(tag.id)
  }
  await db.tagTypes.delete(id)
}

// Tag operations
type CreateTagInput = Omit<Tag, 'id'>

export async function createTag(input: CreateTagInput): Promise<Tag> {
  const tag: Tag = {
    ...input,
    id: crypto.randomUUID(),
  }
  await db.tags.add(tag)
  return tag
}

export async function getAllTags(): Promise<Tag[]> {
  return db.tags.toArray()
}

export async function getTagsByType(typeId: string): Promise<Tag[]> {
  return db.tags.where('typeId').equals(typeId).toArray()
}

export async function updateTag(
  id: string,
  updates: Partial<Omit<Tag, 'id'>> & { parentId?: string | undefined },
): Promise<void> {
  // If parentId is explicitly passed as undefined, delete the field from the record
  // (Dexie update with undefined does not remove the key; use modify to delete it)
  if ('parentId' in updates && updates.parentId === undefined) {
    const { parentId: _removed, ...rest } = updates
    if (Object.keys(rest).length > 0) {
      await db.tags.update(id, rest)
    }
    await db.tags
      .where('id')
      .equals(id)
      .modify((t: Tag & { parentId?: string }) => {
        delete t.parentId
      })
  } else {
    await db.tags.update(id, updates)
  }
}

export async function deleteTag(id: string): Promise<void> {
  const items = await db.items
    .filter((item) => item.tagIds.includes(id))
    .toArray()
  const now = new Date()
  for (const item of items) {
    await db.items.update(item.id, {
      tagIds: item.tagIds.filter((tagId) => tagId !== id),
      updatedAt: now,
    })
  }
  await db.tags.delete(id)
}

export async function getItemCountByTag(tagId: string): Promise<number> {
  const items = await db.items
    .filter((item) => item.tagIds.includes(tagId))
    .count()
  return items
}

export async function getItemCountByVendor(vendorId: string): Promise<number> {
  return db.items
    .filter((item) => item.vendorIds?.includes(vendorId) ?? false)
    .count()
}

export async function getTagCountByType(typeId: string): Promise<number> {
  return db.tags.where('typeId').equals(typeId).count()
}

// ShoppingCart operations
//
// Carts are per (location × vendor); the cart id is `${locationId}:${vendorId|'no-vendor'}`.
// All cart reads/writes take the active locationId (defaulting to 'local').
// Pure read — does not create the cart if missing. Cart rows for a location
// are created up front by `bootstrapCarts` (called from `ActiveLocationProvider`
// whenever the active location changes), not lazily from a read path. This
// keeps `getCart` safe to call from TanStack Query `queryFn`s without side
// effects.
export async function getCart(
  vendorId: string | null = null,
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<ShoppingCart | undefined> {
  const cartId = cartIdFor(locationId, vendorId)
  return db.shoppingCarts.get(cartId)
}

// All carts for a location (one per vendor + the no-vendor cart).
export async function getAllCarts(
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<ShoppingCart[]> {
  const prefix = `${locationId}:`
  return (await db.shoppingCarts.toArray()).filter((c) =>
    c.id.startsWith(prefix),
  )
}

export async function getLastPurchasedByVendor(
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<Map<string | null, Date | null>> {
  const carts = await getAllCarts(locationId)
  const result = new Map<string | null, Date | null>()
  for (const cart of carts) {
    const { vendorId } = parseCartId(cart.id)
    result.set(vendorId, cart.lastPurchasedAt ?? null)
  }
  return result
}

export async function addToCart(
  cartId: string,
  itemId: string,
  quantity: number,
): Promise<CartItem> {
  const existing = await db.cartItems
    .where('cartId')
    .equals(cartId)
    .filter((ci) => ci.itemId === itemId)
    .first()

  if (existing) {
    await db.cartItems.update(existing.id, {
      quantity: existing.quantity + quantity,
    })
    return { ...existing, quantity: existing.quantity + quantity }
  }

  const cartItem: CartItem = {
    id: crypto.randomUUID(),
    cartId,
    itemId,
    quantity,
  }
  await db.cartItems.add(cartItem)
  return cartItem
}

export async function updateCartItem(
  cartItemId: string,
  quantity: number,
): Promise<void> {
  await db.cartItems.update(cartItemId, { quantity })
}

export async function removeFromCart(cartItemId: string): Promise<void> {
  await db.cartItems.delete(cartItemId)
}

export async function getCartItems(cartId: string): Promise<CartItem[]> {
  return db.cartItems.where('cartId').equals(cartId).toArray()
}

export async function checkout(
  cartId: string,
  logDescriptor?: { logKey?: string; logParams?: Record<string, string> },
): Promise<void> {
  // The cart id encodes the location; stock writes + logs target that location.
  const { locationId } = parseCartId(cartId)
  const cartItems = await getCartItems(cartId)
  const now = new Date()
  const buyingItems = cartItems.filter((ci) => ci.quantity > 0)

  for (const cartItem of buyingItems) {
    const stock = await getItemStock(cartItem.itemId, locationId)
    // Stock the item in this location if it isn't yet (copy-on-add semantics:
    // start from zeroed stock). This keeps checkout robust even for items not
    // previously stocked here.
    const base = stock ?? (await addItemToLocation(cartItem.itemId, locationId))
    // `amountPerPackage` is a global Item field since v16 — the stock row alone
    // cannot convert an unpacked measurement quantity into packs.
    const item = await db.items.get(cartItem.itemId)
    const finalQuantity =
      getPackedTotal({
        packedQuantity: base.packedQuantity,
        unpackedQuantity: base.unpackedQuantity,
        ...(item?.amountPerPackage !== undefined
          ? { amountPerPackage: item.amountPerPackage }
          : {}),
      }) + cartItem.quantity
    await upsertItemStock(cartItem.itemId, locationId, {
      packedQuantity: base.packedQuantity + cartItem.quantity,
    })
    await addInventoryLog({
      itemId: cartItem.itemId,
      locationId,
      delta: cartItem.quantity,
      quantity: finalQuantity,
      occurredAt: now,
      ...(logDescriptor?.logKey ? { logKey: logDescriptor.logKey } : {}),
      ...(logDescriptor?.logParams
        ? { logParams: logDescriptor.logParams }
        : {}),
    })
  }

  await db.shoppingCarts.update(cartId, { lastPurchasedAt: now })
  await db.cartItems
    .where('cartId')
    .equals(cartId)
    .filter((ci) => ci.quantity > 0)
    .delete()
}

export async function abandonCart(cartId: string): Promise<void> {
  await db.cartItems.where('cartId').equals(cartId).delete()
}

// Ensure the no-vendor + per-vendor carts exist for a location.
export async function bootstrapCarts(
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<void> {
  const vendors = await db.vendors.toArray()
  const existingCarts = new Set(
    (await db.shoppingCarts.toArray()).map((c) => c.id),
  )

  const noVendorId = cartIdFor(locationId, null)
  if (!existingCarts.has(noVendorId)) {
    await db.shoppingCarts.put({ id: noVendorId })
  }

  for (const vendor of vendors) {
    const cartId = cartIdFor(locationId, vendor.id)
    if (!existingCarts.has(cartId)) {
      await db.shoppingCarts.put({ id: cartId })
    }
  }
}

// Migration helper: move color from Tags to TagTypes
export async function migrateTagColorsToTypes(): Promise<void> {
  const tagTypes = await getAllTagTypes()

  for (const tagType of tagTypes) {
    // Skip if TagType already has a color
    if (tagType.color) continue

    // Find the first tag of this type that has a color (from old data)
    const tags = await getTagsByType(tagType.id)
    const tagWithColor = tags.find(
      (tag: Tag & { color?: TagColor }) =>
        (tag as Tag & { color?: TagColor }).color,
    )

    if (tagWithColor) {
      const color = (tagWithColor as Tag & { color?: TagColor }).color
      if (color) {
        await updateTagType(tagType.id, { color })
      }
    }
  }
}

// Migration helper: convert legacy x-tint TagType colors to bold x colors
export async function migrateTagColorTints(): Promise<void> {
  const tintToBase: Record<string, string> = {
    // Legacy -tint suffix (pre-redesign naming)
    'red-tint': 'rose',
    'orange-tint': 'orange',
    'amber-tint': 'orange',
    'yellow-tint': 'orange',
    'green-tint': 'green',
    'teal-tint': 'teal',
    'blue-tint': 'blue',
    'indigo-tint': 'indigo',
    'purple-tint': 'purple',
    'pink-tint': 'pink',
    // Legacy -inverse suffix (previous redesign iteration)
    'red-inverse': 'rose',
    'orange-inverse': 'orange',
    'amber-inverse': 'orange',
    'yellow-inverse': 'orange',
    'green-inverse': 'green',
    'teal-inverse': 'teal',
    'blue-inverse': 'blue',
    'indigo-inverse': 'indigo',
    'purple-inverse': 'purple',
    'pink-inverse': 'pink',
    'brown-inverse': 'brown',
    'cyan-inverse': 'cyan',
    'rose-inverse': 'rose',
    // Obsolete colors (removed from 10-hue system) → nearest equivalent
    red: 'rose',
    amber: 'orange',
    yellow: 'orange',
    lime: 'green',
  }

  const tagTypes = await getAllTagTypes()
  const toUpdate = tagTypes.filter((tt) => tintToBase[tt.color])

  if (toUpdate.length > 0) {
    await db.tagTypes.bulkPut(
      toUpdate.map((tt) => ({
        ...tt,
        color: tintToBase[tt.color] as TagColor,
      })),
    )
  }
}

// Vendor operations
export async function getVendors(): Promise<Vendor[]> {
  return db.vendors.toArray()
}

export async function createVendor(
  name: string,
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<Vendor> {
  const vendor: Vendor = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date(),
  }
  await db.vendors.add(vendor)
  // Pre-create the vendor's cart for the active location so it shows up on the
  // shopping index immediately. Carts for other locations are created by
  // `bootstrapCarts`, called from `ActiveLocationProvider` whenever the
  // active location changes — not lazily from a read path (see `getCart`).
  await db.shoppingCarts.put({ id: cartIdFor(locationId, vendor.id) })
  return vendor
}

export async function updateVendor(
  id: string,
  updates: Partial<Omit<Vendor, 'id'>>,
): Promise<void> {
  await db.vendors.update(id, updates)
}

export async function deleteVendor(id: string): Promise<void> {
  const items = await db.items
    .filter((item) => item.vendorIds?.includes(id) ?? false)
    .toArray()
  const now = new Date()
  for (const item of items) {
    await db.items.update(item.id, {
      vendorIds: item.vendorIds?.filter((vid) => vid !== id) ?? [],
      updatedAt: now,
    })
  }
  // Delete this vendor's carts + cart items across every location. Cart ids are
  // `${locationId}:${vendorId}`, so match on the `:<vendorId>` suffix.
  const suffix = `:${id}`
  const vendorCarts = (await db.shoppingCarts.toArray()).filter((c) =>
    c.id.endsWith(suffix),
  )
  for (const cart of vendorCarts) {
    await db.cartItems.where('cartId').equals(cart.id).delete()
    await db.shoppingCarts.delete(cart.id)
  }
  await db.vendors.delete(id)
}

// Recipe operations

export async function getRecipes(): Promise<Recipe[]> {
  return db.recipes.toArray()
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  return db.recipes.get(id)
}

export async function createRecipe(input: {
  name: string
  items?: RecipeItem[]
}): Promise<Recipe> {
  const now = new Date()
  const recipe: Recipe = {
    id: crypto.randomUUID(),
    name: input.name,
    items: input.items ?? [],
    createdAt: now,
    updatedAt: now,
  }
  await db.recipes.add(recipe)
  return recipe
}

export async function updateRecipe(
  id: string,
  updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.recipes.update(id, { ...updates, updatedAt: new Date() })
}

export async function updateRecipeLastCookedAt(id: string): Promise<void> {
  await db.recipes.update(id, { lastCookedAt: new Date() })
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id)
}

type ConsumeRecipesBatchInput = {
  occurredAt: Date
  locationId?: string
  recipeIds: string[]
  items: Array<{
    itemId: string
    packedQuantity: number
    unpackedQuantity: number
    delta: number
    quantity: number
    note?: string
    logKey?: string
    logParams?: Record<string, string>
  }>
}

export async function consumeRecipesBatch(
  input: ConsumeRecipesBatchInput,
): Promise<void> {
  const locationId = input.locationId ?? DEFAULT_LOCATION_ID
  await db.transaction(
    'rw',
    [db.items, db.itemStocks, db.inventoryLogs, db.recipes],
    async () => {
      for (const item of input.items) {
        // Write the consumed quantities to the item's stock in this location.
        const existing = await db.itemStocks
          .where('[itemId+locationId]')
          .equals([item.itemId, locationId])
          .first()
        const now = input.occurredAt
        if (existing) {
          await db.itemStocks.put({
            ...existing,
            packedQuantity: item.packedQuantity,
            unpackedQuantity: item.unpackedQuantity,
            updatedAt: now,
          })
        } else {
          await db.itemStocks.add({
            ...ZERO_STOCK,
            id: crypto.randomUUID(),
            itemId: item.itemId,
            locationId,
            packedQuantity: item.packedQuantity,
            unpackedQuantity: item.unpackedQuantity,
            createdAt: now,
            updatedAt: now,
          })
        }
        await db.inventoryLogs.add({
          id: crypto.randomUUID(),
          itemId: item.itemId,
          locationId,
          delta: item.delta,
          quantity: item.quantity,
          occurredAt: input.occurredAt,
          createdAt: input.occurredAt,
          ...(item.note ? { note: item.note } : {}),
          ...(item.logKey ? { logKey: item.logKey } : {}),
          ...(item.logParams ? { logParams: item.logParams } : {}),
        })
      }
      for (const recipeId of input.recipeIds) {
        await db.recipes.update(recipeId, { lastCookedAt: input.occurredAt })
      }
    },
  )
}

export async function getItemCountByRecipe(recipeId: string): Promise<number> {
  const recipe = await db.recipes.get(recipeId)
  return recipe?.items.length ?? 0
}

// Shelf operations

export async function listShelves(): Promise<Shelf[]> {
  return db.shelves.orderBy('order').toArray()
}

export async function getShelf(id: string): Promise<Shelf | undefined> {
  return db.shelves.get(id)
}

export async function createShelf(
  data: Omit<Shelf, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Shelf> {
  const now = new Date()
  const shelf: Shelf = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }
  await db.shelves.add(shelf)
  return shelf
}

export async function updateShelf(
  id: string,
  data: Partial<Omit<Shelf, 'id' | 'createdAt'>>,
): Promise<Shelf> {
  await db.shelves.update(id, { ...data, updatedAt: new Date() })
  const updated = await db.shelves.get(id)
  if (!updated) throw new Error(`Shelf not found: ${id}`)
  return updated
}

export async function deleteShelf(id: string): Promise<void> {
  await db.shelves.delete(id)
}

export async function reorderShelves(orderedIds: string[]): Promise<void> {
  const now = new Date()
  for (const [i, id] of orderedIds.entries()) {
    await db.shelves.update(id, { order: i, updatedAt: now })
  }
}

export async function reorderShelfItems(
  shelfId: string,
  orderedItemIds: string[],
): Promise<void> {
  await db.shelves.update(shelfId, {
    itemIds: orderedItemIds,
    updatedAt: new Date(),
  })
}

// Location operations
//
// PR A — inert: locations exist but nothing else references them yet. Delete is
// a plain row delete (no cascade). The default location (DEFAULT_LOCATION_ID)
// is undeletable. Cloud sync is deferred; locations are local-first for now.

export async function getLocations(): Promise<Location[]> {
  return db.locations.orderBy('order').toArray()
}

export async function createLocation(name: string): Promise<Location> {
  const now = new Date()
  // Append after the current highest order.
  const all = await db.locations.toArray()
  const maxOrder = all.reduce((max, l) => Math.max(max, l.order), -1)
  const location: Location = {
    id: crypto.randomUUID(),
    name: name.trim(),
    order: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  }
  await db.locations.add(location)
  return location
}

export async function updateLocation(
  id: string,
  updates: Partial<Omit<Location, 'id' | 'createdAt'>>,
): Promise<Location> {
  const patch = { ...updates, updatedAt: new Date() }
  if (typeof patch.name === 'string') patch.name = patch.name.trim()
  await db.locations.update(id, patch)
  const updated = await db.locations.get(id)
  if (!updated) throw new Error(`Location not found: ${id}`)
  return updated
}

export async function deleteLocation(id: string): Promise<void> {
  // The default location is undeletable.
  if (id === DEFAULT_LOCATION_ID) {
    throw new Error('The default location cannot be deleted.')
  }
  // Cascade: remove this location's ItemStock rows, its carts + cart items, and
  // its inventory logs. (Added in PR D; was a plain delete in PR A.)
  await db.itemStocks.where('locationId').equals(id).delete()
  await db.inventoryLogs.where('locationId').equals(id).delete()
  const prefix = `${id}:`
  const carts = (await db.shoppingCarts.toArray()).filter((c) =>
    c.id.startsWith(prefix),
  )
  for (const cart of carts) {
    await db.cartItems.where('cartId').equals(cart.id).delete()
    await db.shoppingCarts.delete(cart.id)
  }
  await db.locations.delete(id)
}

export async function reorderLocations(orderedIds: string[]): Promise<void> {
  const now = new Date()
  for (const [i, id] of orderedIds.entries()) {
    await db.locations.update(id, { order: i, updatedAt: now })
  }
}

// --- Seed Data ---

const EN_SEED_DATA = [
  {
    type: { name: 'Storage', color: TagColor.blue },
    tags: ['freezer', 'fridge', 'pantry'],
  },
  {
    type: { name: 'Diet', color: TagColor.green },
    tags: ['plant-based', 'low-GI', 'gluten-free'],
  },
  {
    type: { name: 'Category', color: TagColor.orange },
    tags: ['produce', 'dairy', 'meat', 'grains', 'snacks', 'beverages'],
  },
]

const TW_SEED_DATA = [
  {
    type: { name: '保存方式', color: TagColor.blue },
    tags: ['冷凍', '冷藏', '常溫'],
  },
  {
    type: { name: '飲食型態', color: TagColor.green },
    tags: ['蔬食', '低GI', '無麩質'],
  },
  {
    type: { name: '食材分類', color: TagColor.orange },
    tags: ['蔬果', '乳製品', '肉', '穀物', '零食', '飲料'],
  },
]

export async function seedDefaultData(language: Language): Promise<void> {
  const seeds = language === 'tw' ? TW_SEED_DATA : EN_SEED_DATA
  for (const { type, tags } of seeds) {
    const tagType = await createTagType(type)
    for (const tagName of tags) {
      await createTag({ name: tagName, typeId: tagType.id })
    }
  }
}
