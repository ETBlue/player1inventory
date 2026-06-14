import Dexie, { type EntityTable } from 'dexie'
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

const db = new Dexie('Player1Inventory') as Dexie & {
  items: EntityTable<Item, 'id'>
  itemStocks: EntityTable<ItemStock, 'id'>
  tags: EntityTable<Tag, 'id'>
  tagTypes: EntityTable<TagType, 'id'>
  inventoryLogs: EntityTable<InventoryLog, 'id'>
  shoppingCarts: EntityTable<ShoppingCart, 'id'>
  cartItems: EntityTable<CartItem, 'id'>
  vendors: EntityTable<Vendor, 'id'>
  recipes: EntityTable<Recipe, 'id'>
  shelves: EntityTable<Shelf, 'id'>
  locations: EntityTable<Location, 'id'>
}

// Stock/unit/expiration fields that moved from Item onto ItemStock in v15.
const STOCK_FIELD_KEYS = [
  'packageUnit',
  'measurementUnit',
  'amountPerPackage',
  'targetUnit',
  'targetQuantity',
  'refillThreshold',
  'packedQuantity',
  'unpackedQuantity',
  'consumeAmount',
  'dueDate',
  'estimatedDueDays',
  'expirationThreshold',
  'expirationMode',
] as const

// Idempotently ensure the default location exists. Shared by the v14 upgrade
// fn (existing users) and the `on('populate')` hook (fresh DBs).
async function ensureDefaultLocation(
  // biome-ignore lint/suspicious/noExplicitAny: Dexie tx/table typed loosely so this works from both upgrade (Transaction) and populate (db) contexts
  locationsTable: any,
): Promise<void> {
  const existing = await locationsTable.get(DEFAULT_LOCATION_ID)
  if (existing) return
  const now = new Date()
  await locationsTable.put({
    id: DEFAULT_LOCATION_ID,
    name: 'My Home',
    order: 0,
    createdAt: now,
    updatedAt: now,
  })
}

// Version 1: Original schema
db.version(1).stores({
  items: 'id, name, *tagIds, createdAt',
  tags: 'id, name, typeId',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt',
  cartItems: 'id, cartId, itemId',
})

// Version 2: Add dual-unit tracking fields
db.version(2).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, name, typeId',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
})

// Version 3: Add vendors table
db.version(3).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, name, typeId',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
})

// Version 4: Add recipes table
db.version(4).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, name, typeId',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name',
})

// Version 5: Add lastCookedAt to recipes
db.version(5).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, name, typeId',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name, lastCookedAt',
})

// Version 6: Add parentId index to tags for nested tag hierarchy (onboarding phase A)
db.version(6).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, typeId, parentId, createdAt',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name, lastCookedAt',
})

// Version 7: Add expirationMode to items — no migration callback (prototype mode, single user)
db.version(7).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, typeId, parentId, createdAt',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name, lastCookedAt',
})

// Version 8: Add shelves table for shelf-view feature
db.version(8).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, typeId, parentId, createdAt',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name, lastCookedAt',
  shelves: '++id, name, type, order',
})

// Version 9: Move sortBy/sortDir from filterConfig to top-level shelf fields
db.version(9).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, typeId, parentId, createdAt',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name, lastCookedAt',
  shelves: 'id, name, type, order, sortBy, sortDir',
})

// Version 10: Remove sortBy/sortDir from shelves — replaced by global pantry sort control
db.version(10)
  .stores({
    items: 'id, name, targetUnit, createdAt, updatedAt',
    tags: 'id, typeId, parentId, createdAt',
    tagTypes: 'id, name',
    inventoryLogs: 'id, itemId, occurredAt, createdAt',
    shoppingCarts: 'id, status, createdAt, completedAt',
    cartItems: 'id, cartId, itemId',
    vendors: 'id, name',
    recipes: 'id, name, lastCookedAt',
    shelves: 'id, name, type, order',
  })
  .upgrade((tx) => {
    return tx
      .table('shelves')
      .toCollection()
      .modify((shelf) => {
        delete (shelf as Record<string, unknown>).sortBy
        delete (shelf as Record<string, unknown>).sortDir
      })
  })

// Version 11: Add logKey/logParams to inventoryLogs for dynamic i18n — no upgrade needed (optional fields)
db.version(11).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, typeId, parentId, createdAt',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name, lastCookedAt',
  shelves: 'id, name, type, order',
})

// Version 12: Add vendorId to shoppingCarts for vendor-based cart support
db.version(12)
  .stores({
    items: 'id, name, targetUnit, createdAt, updatedAt',
    tags: 'id, typeId, parentId, createdAt',
    tagTypes: 'id, name',
    inventoryLogs: 'id, itemId, occurredAt, createdAt',
    shoppingCarts: 'id, status, vendorId, createdAt, completedAt',
    cartItems: 'id, cartId, itemId',
    vendors: 'id, name',
    recipes: 'id, name, lastCookedAt',
    shelves: 'id, name, type, order',
  })
  .upgrade((tx) =>
    tx
      .table('shoppingCarts')
      .toCollection()
      .modify((cart) => {
        cart.vendorId = null
      }),
  )

// Version 13: Replace ephemeral carts with permanent carts (id = vendorId or 'no-vendor').
// Removes status, createdAt, completedAt, vendorId fields. Adds lastPurchasedAt (optional).
// Migration: creates one permanent cart per vendor plus a 'no-vendor' cart, then migrates
// cartItems from old active carts to permanent carts, copies lastPurchasedAt from completed
// carts, and deletes abandoned cart items and all old ephemeral cart records.
db.version(13)
  .stores({
    items: 'id, name, targetUnit, createdAt, updatedAt',
    tags: 'id, typeId, parentId, createdAt',
    tagTypes: 'id, name',
    inventoryLogs: 'id, itemId, occurredAt, createdAt',
    shoppingCarts: 'id',
    cartItems: 'id, cartId, itemId',
    vendors: 'id, name',
    recipes: 'id, name, lastCookedAt',
    shelves: 'id, name, type, order',
  })
  .upgrade(async (tx) => {
    // 1. Read all vendors
    const vendors = await tx.table('vendors').toArray()
    const vendorIds = new Set(vendors.map((v: Vendor) => v.id))

    // 2. Put a permanent cart for each vendor and one for 'no-vendor'
    for (const vendor of vendors) {
      await tx.table('shoppingCarts').put({ id: vendor.id })
    }
    await tx.table('shoppingCarts').put({ id: 'no-vendor' })

    // 3. Read all OLD carts (those whose id is not a vendor id and not 'no-vendor')
    const allCarts = await tx.table('shoppingCarts').toArray()
    const oldCarts = allCarts.filter(
      (cart: Record<string, unknown>) =>
        !vendorIds.has(cart.id as string) && cart.id !== 'no-vendor',
    )

    for (const oldCart of oldCarts as Array<Record<string, unknown>>) {
      const permanentCartId = (oldCart.vendorId as string | null) ?? 'no-vendor'

      if (oldCart.status === 'active') {
        // Re-point cartItems from old cart to permanent cart
        await tx
          .table('cartItems')
          .where('cartId')
          .equals(oldCart.id as string)
          .modify((item: Record<string, unknown>) => {
            item.cartId = permanentCartId
          })
      } else if (
        oldCart.status === 'completed' &&
        oldCart.completedAt != null
      ) {
        // Update lastPurchasedAt on permanent cart if this completion is more recent
        const permanentCart = (await tx
          .table('shoppingCarts')
          .get(permanentCartId)) as Record<string, unknown> | undefined
        if (permanentCart) {
          const existingDate = permanentCart.lastPurchasedAt as Date | undefined
          const completedAt = oldCart.completedAt as Date
          if (!existingDate || completedAt > existingDate) {
            await tx
              .table('shoppingCarts')
              .update(permanentCartId, { lastPurchasedAt: completedAt })
          }
        }
      } else if (oldCart.status === 'abandoned') {
        // Delete cart items for abandoned carts
        await tx
          .table('cartItems')
          .where('cartId')
          .equals(oldCart.id as string)
          .delete()
      }

      // Delete the old ephemeral cart record
      await tx.table('shoppingCarts').delete(oldCart.id as string)
    }
  })

// Version 14: Add locations table for the location feature (PR A — inert).
// Seeds the default location 'local' ('My Home') for existing users on upgrade.
// Brand-new / fresh DBs are seeded via the `on('populate')` hook below instead,
// because Dexie only runs per-version upgrade fns when migrating from an older
// version — never on first creation at the latest version.
db.version(14)
  .stores({
    items: 'id, name, targetUnit, createdAt, updatedAt',
    tags: 'id, typeId, parentId, createdAt',
    tagTypes: 'id, name',
    inventoryLogs: 'id, itemId, occurredAt, createdAt',
    shoppingCarts: 'id',
    cartItems: 'id, cartId, itemId',
    vendors: 'id, name',
    recipes: 'id, name, lastCookedAt',
    shelves: 'id, name, type, order',
    locations: 'id, order, name',
  })
  .upgrade(async (tx) => {
    await ensureDefaultLocation(tx.table('locations'))
  })

// Version 15: Split stock off Item into a per-(item × location) ItemStock
// record (the Location feature, PR D). New `itemStocks` store; `inventoryLogs`
// gains a `locationId` index; carts are re-keyed to `${locationId}:${vendorId|'no-vendor'}`.
//
// Upgrade (v14 → v15), idempotent:
//  1. For each Item, create an ItemStock under DEFAULT_LOCATION_ID carrying its
//     stock/unit/expiration fields, then strip those fields from the item row.
//  2. Stamp locationId = DEFAULT_LOCATION_ID on every inventoryLog.
//  3. Re-key every shoppingCart / cartItem to the `local:` scheme. The existing
//     'no-vendor' cart becomes 'local:no-vendor'; a vendor cart `<vendorId>`
//     becomes `local:<vendorId>`.
db.version(15)
  .stores({
    items: 'id, name, createdAt, updatedAt',
    itemStocks: 'id, itemId, locationId, [itemId+locationId], updatedAt',
    tags: 'id, typeId, parentId, createdAt',
    tagTypes: 'id, name',
    inventoryLogs: 'id, itemId, locationId, occurredAt, createdAt',
    shoppingCarts: 'id',
    cartItems: 'id, cartId, itemId',
    vendors: 'id, name',
    recipes: 'id, name, lastCookedAt',
    shelves: 'id, name, type, order',
    locations: 'id, order, name',
  })
  .upgrade(async (tx) => {
    const defaultLocationId = DEFAULT_LOCATION_ID
    await ensureDefaultLocation(tx.table('locations'))

    // 1. Split each Item's stock fields into an ItemStock, then strip them.
    const items = await tx.table('items').toArray()
    const itemStocksTable = tx.table('itemStocks')
    for (const item of items as Array<Record<string, unknown>>) {
      const itemId = item.id as string
      // Idempotency: skip if a stock row already exists for this pair.
      const existing = await itemStocksTable
        .where('[itemId+locationId]')
        .equals([itemId, defaultLocationId])
        .first()
      if (!existing) {
        const now = new Date()
        const stock: Record<string, unknown> = {
          id: crypto.randomUUID(),
          itemId,
          locationId: defaultLocationId,
          // sensible defaults in case a pre-v2 row lacks some fields
          targetUnit: 'package',
          targetQuantity: 0,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
          createdAt: (item.createdAt as Date) ?? now,
          updatedAt: (item.updatedAt as Date) ?? now,
        }
        for (const key of STOCK_FIELD_KEYS) {
          if (item[key] !== undefined) stock[key] = item[key]
        }
        await itemStocksTable.add(stock)
      }
      // Strip stock fields from the item row.
      await tx.table('items').update(itemId, {
        ...Object.fromEntries(STOCK_FIELD_KEYS.map((k) => [k, undefined])),
      })
    }

    // 2. Stamp locationId on every inventory log.
    await tx
      .table('inventoryLogs')
      .toCollection()
      .modify((log: Record<string, unknown>) => {
        if (log.locationId == null) log.locationId = defaultLocationId
      })

    // 3. Re-key carts and cart items to `local:<vendor|'no-vendor'>`.
    const carts = await tx.table('shoppingCarts').toArray()
    for (const cart of carts as Array<Record<string, unknown>>) {
      const oldId = cart.id as string
      // Skip if already in the location:vendor scheme.
      if (oldId.startsWith(`${defaultLocationId}:`)) continue
      const newId = `${defaultLocationId}:${oldId}`
      // Move the cart record under the new id.
      const { id: _id, ...rest } = cart
      await tx.table('shoppingCarts').put({ id: newId, ...rest })
      await tx.table('shoppingCarts').delete(oldId)
      // Re-point its cart items.
      await tx
        .table('cartItems')
        .where('cartId')
        .equals(oldId)
        .modify((ci: Record<string, unknown>) => {
          ci.cartId = newId
        })
    }
  })

// Fresh-DB seed: `on('populate')` fires exactly once, when the database is
// first created at the latest version (brand-new users). The version upgrade
// fns above do NOT run in that case, so the default location is seeded here.
db.on('populate', () => {
  // Dexie runs this inside an open populate transaction; db.locations is valid.
  return ensureDefaultLocation(db.locations)
})

export { db }
