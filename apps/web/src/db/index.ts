import Dexie, { type EntityTable } from 'dexie'
import type {
  CartItem,
  InventoryLog,
  Item,
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

// Fresh-DB seed: `on('populate')` fires exactly once, when the database is
// first created at the latest version (brand-new users). The v14 upgrade fn
// above does NOT run in that case, so the default location is seeded here.
db.on('populate', () => {
  // Dexie runs this inside an open populate transaction; db.locations is valid.
  return ensureDefaultLocation(db.locations)
})

export { db }
