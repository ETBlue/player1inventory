import { db } from './index'
import type { Item, InventoryLog, Tag, TagType, ShoppingCart, CartItem } from '@/types'

// Item operations
type CreateItemInput = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>

export async function createItem(input: CreateItemInput): Promise<Item> {
  const now = new Date()
  const item: Item = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }
  await db.items.add(item)
  return item
}

export async function getItem(id: string): Promise<Item | undefined> {
  return db.items.get(id)
}

export async function getAllItems(): Promise<Item[]> {
  return db.items.toArray()
}

export async function updateItem(id: string, updates: Partial<Omit<Item, 'id' | 'createdAt'>>): Promise<void> {
  await db.items.update(id, { ...updates, updatedAt: new Date() })
}

export async function deleteItem(id: string): Promise<void> {
  await db.items.delete(id)
}

// InventoryLog operations
type CreateLogInput = {
  itemId: string
  delta: number
  occurredAt: Date
  note?: string
}

export async function addInventoryLog(input: CreateLogInput): Promise<InventoryLog> {
  const currentQty = await getCurrentQuantity(input.itemId)
  const now = new Date()

  const log: InventoryLog = {
    id: crypto.randomUUID(),
    itemId: input.itemId,
    delta: input.delta,
    quantity: currentQty + input.delta,
    note: input.note,
    occurredAt: input.occurredAt,
    createdAt: now,
  }

  await db.inventoryLogs.add(log)
  return log
}

export async function getItemLogs(itemId: string): Promise<InventoryLog[]> {
  return db.inventoryLogs.where('itemId').equals(itemId).sortBy('occurredAt')
}

export async function getCurrentQuantity(itemId: string): Promise<number> {
  const logs = await db.inventoryLogs
    .where('itemId')
    .equals(itemId)
    .sortBy('createdAt')

  if (logs.length === 0) return 0

  return logs[logs.length - 1].quantity
}

export async function getLastPurchaseDate(itemId: string): Promise<Date | null> {
  const logs = await db.inventoryLogs
    .where('itemId')
    .equals(itemId)
    .filter(log => log.delta > 0)
    .toArray()

  if (logs.length === 0) return null

  const latest = logs.reduce((a, b) =>
    a.occurredAt > b.occurredAt ? a : b
  )
  return latest.occurredAt
}

// TagType operations
export async function createTagType(input: { name: string }): Promise<TagType> {
  const tagType: TagType = {
    id: crypto.randomUUID(),
    name: input.name,
  }
  await db.tagTypes.add(tagType)
  return tagType
}

export async function getAllTagTypes(): Promise<TagType[]> {
  return db.tagTypes.toArray()
}

export async function updateTagType(id: string, updates: Partial<Omit<TagType, 'id'>>): Promise<void> {
  await db.tagTypes.update(id, updates)
}

export async function deleteTagType(id: string): Promise<void> {
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

export async function updateTag(id: string, updates: Partial<Omit<Tag, 'id'>>): Promise<void> {
  await db.tags.update(id, updates)
}

export async function deleteTag(id: string): Promise<void> {
  await db.tags.delete(id)
}

// ShoppingCart operations
export async function getOrCreateActiveCart(): Promise<ShoppingCart> {
  const existing = await db.shoppingCarts.where('status').equals('active').first()
  if (existing) return existing

  const cart: ShoppingCart = {
    id: crypto.randomUUID(),
    status: 'active',
    createdAt: new Date(),
  }
  await db.shoppingCarts.add(cart)
  return cart
}

export async function addToCart(cartId: string, itemId: string, quantity: number): Promise<CartItem> {
  const existing = await db.cartItems
    .where('cartId')
    .equals(cartId)
    .filter(ci => ci.itemId === itemId)
    .first()

  if (existing) {
    await db.cartItems.update(existing.id, { quantity: existing.quantity + quantity })
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

export async function updateCartItem(cartItemId: string, quantity: number): Promise<void> {
  await db.cartItems.update(cartItemId, { quantity })
}

export async function removeFromCart(cartItemId: string): Promise<void> {
  await db.cartItems.delete(cartItemId)
}

export async function getCartItems(cartId: string): Promise<CartItem[]> {
  return db.cartItems.where('cartId').equals(cartId).toArray()
}

export async function checkout(cartId: string): Promise<void> {
  const cartItems = await getCartItems(cartId)
  const now = new Date()

  for (const cartItem of cartItems) {
    await addInventoryLog({
      itemId: cartItem.itemId,
      delta: cartItem.quantity,
      occurredAt: now,
    })
  }

  await db.shoppingCarts.update(cartId, {
    status: 'completed',
    completedAt: now,
  })

  await db.cartItems.where('cartId').equals(cartId).delete()
}

export async function abandonCart(cartId: string): Promise<void> {
  await db.shoppingCarts.update(cartId, { status: 'abandoned' })
  await db.cartItems.where('cartId').equals(cartId).delete()
}
