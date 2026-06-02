import Dexie, { type EntityTable } from 'dexie'
import type {
  CartItem,
  InventoryLog,
  Item,
  Recipe,
  Shelf,
  ShoppingCart,
  Tag,
  TagType,
  Vendor,
} from '@/types'

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

export { db }
