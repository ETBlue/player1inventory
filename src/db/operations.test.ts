import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import {
  createItem,
  getItem,
  getAllItems,
  updateItem,
  deleteItem,
  addInventoryLog,
  getItemLogs,
  getCurrentQuantity,
  getLastPurchaseDate,
  createTagType,
  getAllTagTypes,
  createTag,
  getTagsByType,
  getOrCreateActiveCart,
  addToCart,
  updateCartItem,
  getCartItems,
  checkout,
  abandonCart,
} from './operations'

describe('Item operations', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.inventoryLogs.clear()
  })

  it('creates an item', async () => {
    const item = await createItem({
      name: 'Milk',
      unit: 'gallon',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })

    expect(item.id).toBeDefined()
    expect(item.name).toBe('Milk')
    expect(item.createdAt).toBeInstanceOf(Date)
  })

  it('retrieves an item by id', async () => {
    const created = await createItem({
      name: 'Eggs',
      tagIds: [],
      targetQuantity: 12,
      refillThreshold: 6,
    })

    const retrieved = await getItem(created.id)
    expect(retrieved?.name).toBe('Eggs')
  })

  it('lists all items', async () => {
    await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    await createItem({ name: 'Eggs', tagIds: [], targetQuantity: 12, refillThreshold: 6 })

    const items = await getAllItems()
    expect(items).toHaveLength(2)
  })

  it('updates an item', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })

    await updateItem(item.id, { name: 'Whole Milk' })

    const updated = await getItem(item.id)
    expect(updated?.name).toBe('Whole Milk')
  })

  it('deletes an item', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })

    await deleteItem(item.id)

    const retrieved = await getItem(item.id)
    expect(retrieved).toBeUndefined()
  })
})

describe('InventoryLog operations', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.inventoryLogs.clear()
  })

  it('adds an inventory log', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })

    const log = await addInventoryLog({
      itemId: item.id,
      delta: 2,
      occurredAt: new Date(),
    })

    expect(log.id).toBeDefined()
    expect(log.delta).toBe(2)
    expect(log.quantity).toBe(2)
  })

  it('calculates current quantity from logs', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })

    await addInventoryLog({ itemId: item.id, delta: 5, occurredAt: new Date() })
    await addInventoryLog({ itemId: item.id, delta: -2, occurredAt: new Date() })

    const quantity = await getCurrentQuantity(item.id)
    expect(quantity).toBe(3)
  })

  it('gets logs for an item', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })

    await addInventoryLog({ itemId: item.id, delta: 5, occurredAt: new Date() })
    await addInventoryLog({ itemId: item.id, delta: -1, occurredAt: new Date() })

    const logs = await getItemLogs(item.id)
    expect(logs).toHaveLength(2)
  })

  it('gets last purchase date', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    const purchaseDate = new Date('2026-02-01')

    await addInventoryLog({ itemId: item.id, delta: -1, occurredAt: new Date('2026-01-15') })
    await addInventoryLog({ itemId: item.id, delta: 5, occurredAt: purchaseDate })
    await addInventoryLog({ itemId: item.id, delta: -2, occurredAt: new Date('2026-02-02') })

    const lastPurchase = await getLastPurchaseDate(item.id)
    expect(lastPurchase?.getTime()).toBe(purchaseDate.getTime())
  })
})

describe('Tag operations', () => {
  beforeEach(async () => {
    await db.tags.clear()
    await db.tagTypes.clear()
  })

  it('creates a tag type', async () => {
    const tagType = await createTagType({ name: 'Ingredient type' })

    expect(tagType.id).toBeDefined()
    expect(tagType.name).toBe('Ingredient type')
  })

  it('lists all tag types', async () => {
    await createTagType({ name: 'Ingredient type' })
    await createTagType({ name: 'Storage method' })

    const types = await getAllTagTypes()
    expect(types).toHaveLength(2)
  })

  it('creates a tag', async () => {
    const tagType = await createTagType({ name: 'Ingredient type' })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

    expect(tag.id).toBeDefined()
    expect(tag.name).toBe('Dairy')
    expect(tag.typeId).toBe(tagType.id)
  })

  it('creates a tag type with color', async () => {
    const tagType = await createTagType({ name: 'Ingredient type', color: '#3b82f6' })

    expect(tagType.id).toBeDefined()
    expect(tagType.name).toBe('Ingredient type')
    expect(tagType.color).toBe('#3b82f6')
  })

  it('gets tags by type', async () => {
    const type1 = await createTagType({ name: 'Ingredient type' })
    const type2 = await createTagType({ name: 'Storage method' })

    await createTag({ name: 'Dairy', typeId: type1.id })
    await createTag({ name: 'Produce', typeId: type1.id })
    await createTag({ name: 'Refrigerated', typeId: type2.id })

    const ingredientTags = await getTagsByType(type1.id)
    expect(ingredientTags).toHaveLength(2)
  })
})

describe('ShoppingCart operations', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.inventoryLogs.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
  })

  it('creates an active cart if none exists', async () => {
    const cart = await getOrCreateActiveCart()

    expect(cart.id).toBeDefined()
    expect(cart.status).toBe('active')
  })

  it('reuses existing active cart', async () => {
    const cart1 = await getOrCreateActiveCart()
    const cart2 = await getOrCreateActiveCart()

    expect(cart1.id).toBe(cart2.id)
  })

  it('adds item to cart', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    const cart = await getOrCreateActiveCart()

    const cartItem = await addToCart(cart.id, item.id, 2)

    expect(cartItem.quantity).toBe(2)
  })

  it('updates cart item quantity', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    const cart = await getOrCreateActiveCart()
    const cartItem = await addToCart(cart.id, item.id, 2)

    await updateCartItem(cartItem.id, 5)

    const items = await getCartItems(cart.id)
    expect(items[0]?.quantity).toBe(5)
  })

  it('checks out cart and creates inventory logs', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    const cart = await getOrCreateActiveCart()
    await addToCart(cart.id, item.id, 3)

    await checkout(cart.id)

    const quantity = await getCurrentQuantity(item.id)
    expect(quantity).toBe(3)

    const updatedCart = await db.shoppingCarts.get(cart.id)
    expect(updatedCart?.status).toBe('completed')
  })

  it('abandons cart without creating logs', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    const cart = await getOrCreateActiveCart()
    await addToCart(cart.id, item.id, 3)

    await abandonCart(cart.id)

    const quantity = await getCurrentQuantity(item.id)
    expect(quantity).toBe(0)

    const updatedCart = await db.shoppingCarts.get(cart.id)
    expect(updatedCart?.status).toBe('abandoned')
  })
})
