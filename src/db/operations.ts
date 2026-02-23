import type {
  CartItem,
  InventoryLog,
  Item,
  Recipe,
  RecipeItem,
  ShoppingCart,
  Tag,
  TagType,
  Vendor,
} from '@/types'
import { TagColor } from '@/types'
import { db } from './index'

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

export async function updateItem(
  id: string,
  updates: Partial<Omit<Item, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.items.update(id, { ...updates, updatedAt: new Date() })
}

export async function deleteItem(id: string): Promise<void> {
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

export async function getInventoryLogCountByItem(
  itemId: string,
): Promise<number> {
  return await db.inventoryLogs.where('itemId').equals(itemId).count()
}

export async function getCartItemCountByItem(itemId: string): Promise<number> {
  return await db.cartItems.where('itemId').equals(itemId).count()
}

// InventoryLog operations
type CreateLogInput = {
  itemId: string
  delta: number
  occurredAt: Date
  note?: string
}

export async function addInventoryLog(
  input: CreateLogInput,
): Promise<InventoryLog> {
  const currentQty = await getCurrentQuantity(input.itemId)
  const now = new Date()

  const log: InventoryLog = {
    id: crypto.randomUUID(),
    itemId: input.itemId,
    delta: input.delta,
    quantity: currentQty + input.delta,
    occurredAt: input.occurredAt,
    createdAt: now,
  }
  if (input.note) log.note = input.note

  await db.inventoryLogs.add(log)
  return log
}

export async function getItemLogs(itemId: string): Promise<InventoryLog[]> {
  return db.inventoryLogs.where('itemId').equals(itemId).sortBy('occurredAt')
}

export async function getCurrentQuantity(itemId: string): Promise<number> {
  const logs = await db.inventoryLogs.where('itemId').equals(itemId).toArray()

  return logs.reduce((sum, log) => sum + log.delta, 0)
}

export async function getLastPurchaseDate(
  itemId: string,
): Promise<Date | null> {
  const logs = await db.inventoryLogs
    .where('itemId')
    .equals(itemId)
    .filter((log) => log.delta > 0)
    .toArray()

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
  updates: Partial<Omit<Tag, 'id'>>,
): Promise<void> {
  await db.tags.update(id, updates)
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
export async function getOrCreateActiveCart(): Promise<ShoppingCart> {
  const existing = await db.shoppingCarts
    .where('status')
    .equals('active')
    .first()
  if (existing) return existing

  const cart: ShoppingCart = {
    id: crypto.randomUUID(),
    status: 'active',
    createdAt: new Date(),
  }
  await db.shoppingCarts.add(cart)
  return cart
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

export async function checkout(cartId: string): Promise<void> {
  const cartItems = await getCartItems(cartId)
  const now = new Date()

  for (const cartItem of cartItems) {
    await addInventoryLog({
      itemId: cartItem.itemId,
      delta: cartItem.quantity,
      occurredAt: now,
    })
    const item = await db.items.get(cartItem.itemId)
    if (item) {
      await db.items.update(cartItem.itemId, {
        packedQuantity: item.packedQuantity + cartItem.quantity,
        updatedAt: now,
      })
    }
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

// Vendor operations
export async function getVendors(): Promise<Vendor[]> {
  return db.vendors.toArray()
}

export async function createVendor(name: string): Promise<Vendor> {
  const vendor: Vendor = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date(),
  }
  await db.vendors.add(vendor)
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

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id)
}

export async function getItemCountByRecipe(recipeId: string): Promise<number> {
  const recipe = await db.recipes.get(recipeId)
  return recipe?.items.length ?? 0
}
