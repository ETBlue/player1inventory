import Dexie, { type EntityTable } from 'dexie'
import type { Item, Tag, TagType, InventoryLog, ShoppingCart, CartItem } from '@/types'

const db = new Dexie('Player1Inventory') as Dexie & {
  items: EntityTable<Item, 'id'>
  tags: EntityTable<Tag, 'id'>
  tagTypes: EntityTable<TagType, 'id'>
  inventoryLogs: EntityTable<InventoryLog, 'id'>
  shoppingCarts: EntityTable<ShoppingCart, 'id'>
  cartItems: EntityTable<CartItem, 'id'>
}

db.version(1).stores({
  items: 'id, name, *tagIds, createdAt',
  tags: 'id, name, typeId',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt',
  cartItems: 'id, cartId, itemId',
})

export { db }
