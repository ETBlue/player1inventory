import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './index'
import {
  abandonCart,
  addInventoryLog,
  addToCart,
  checkout,
  createItem,
  createTag,
  createTagType,
  createVendor,
  deleteItem,
  deleteVendor,
  getAllItems,
  getAllTagTypes,
  getCartItems,
  getCurrentQuantity,
  getItem,
  getItemLogs,
  getLastPurchaseDate,
  getOrCreateActiveCart,
  getTagsByType,
  getVendors,
  updateCartItem,
  updateItem,
  updateVendor,
} from './operations'

describe('Item operations', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.inventoryLogs.clear()
  })

  it('creates an item', async () => {
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    expect(item.id).toBeDefined()
    expect(item.name).toBe('Milk')
    expect(item.createdAt).toBeInstanceOf(Date)
  })

  it('creates item with dual-unit tracking', async () => {
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 2,
      refillThreshold: 0.5,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 0.25,
      tagIds: [],
    })

    expect(item.packageUnit).toBe('bottle')
    expect(item.measurementUnit).toBe('L')
    expect(item.amountPerPackage).toBe(1)
    expect(item.targetUnit).toBe('measurement')
    expect(item.consumeAmount).toBe(0.25)
  })

  it('creates item with simple tracking', async () => {
    const item = await createItem({
      name: 'Eggs',
      packageUnit: 'dozen',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    expect(item.packageUnit).toBe('dozen')
    expect(item.measurementUnit).toBeUndefined()
    expect(item.packedQuantity).toBe(1)
  })

  it('retrieves an item by id', async () => {
    const created = await createItem({
      name: 'Eggs',
      packageUnit: 'dozen',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 12,
      refillThreshold: 6,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    const retrieved = await getItem(created.id)
    expect(retrieved?.name).toBe('Eggs')
  })

  it('lists all items', async () => {
    await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await createItem({
      name: 'Eggs',
      packageUnit: 'dozen',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 12,
      refillThreshold: 6,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    const items = await getAllItems()
    expect(items).toHaveLength(2)
  })

  it('updates an item', async () => {
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    await updateItem(item.id, { name: 'Whole Milk' })

    const updated = await getItem(item.id)
    expect(updated?.name).toBe('Whole Milk')
  })

  it('deletes an item', async () => {
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

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
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

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
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    await addInventoryLog({ itemId: item.id, delta: 5, occurredAt: new Date() })
    await addInventoryLog({
      itemId: item.id,
      delta: -2,
      occurredAt: new Date(),
    })

    const quantity = await getCurrentQuantity(item.id)
    expect(quantity).toBe(3)
  })

  it('gets logs for an item', async () => {
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    await addInventoryLog({ itemId: item.id, delta: 5, occurredAt: new Date() })
    await addInventoryLog({
      itemId: item.id,
      delta: -1,
      occurredAt: new Date(),
    })

    const logs = await getItemLogs(item.id)
    expect(logs).toHaveLength(2)
  })

  it('gets last purchase date', async () => {
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const purchaseDate = new Date('2026-02-01')

    await addInventoryLog({
      itemId: item.id,
      delta: -1,
      occurredAt: new Date('2026-01-15'),
    })
    await addInventoryLog({
      itemId: item.id,
      delta: 5,
      occurredAt: purchaseDate,
    })
    await addInventoryLog({
      itemId: item.id,
      delta: -2,
      occurredAt: new Date('2026-02-02'),
    })

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
    const tagType = await createTagType({
      name: 'Ingredient type',
      color: '#3b82f6',
    })

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
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const cart = await getOrCreateActiveCart()

    const cartItem = await addToCart(cart.id, item.id, 2)

    expect(cartItem.quantity).toBe(2)
  })

  it('updates cart item quantity', async () => {
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const cart = await getOrCreateActiveCart()
    const cartItem = await addToCart(cart.id, item.id, 2)

    await updateCartItem(cartItem.id, 5)

    const items = await getCartItems(cart.id)
    expect(items[0]?.quantity).toBe(5)
  })

  it('checks out cart and creates inventory logs', async () => {
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const cart = await getOrCreateActiveCart()
    await addToCart(cart.id, item.id, 3)

    await checkout(cart.id)

    const quantity = await getCurrentQuantity(item.id)
    expect(quantity).toBe(3)

    const updatedCart = await db.shoppingCarts.get(cart.id)
    expect(updatedCart?.status).toBe('completed')
  })

  it('abandons cart without creating logs', async () => {
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const cart = await getOrCreateActiveCart()
    await addToCart(cart.id, item.id, 3)

    await abandonCart(cart.id)

    const quantity = await getCurrentQuantity(item.id)
    expect(quantity).toBe(0)

    const updatedCart = await db.shoppingCarts.get(cart.id)
    expect(updatedCart?.status).toBe('abandoned')
  })
})

describe('Vendor operations', () => {
  beforeEach(async () => {
    await db.vendors.clear()
  })

  it('user can get all vendors', async () => {
    // Given two vendors seeded directly
    await db.vendors.bulkAdd([
      { id: 'v1', name: 'Costco', createdAt: new Date() },
      { id: 'v2', name: "Trader Joe's", createdAt: new Date() },
    ])

    // When fetching all vendors
    const vendors = await getVendors()

    // Then both vendors are returned
    expect(vendors).toHaveLength(2)
    expect(vendors.map((v) => v.name)).toContain('Costco')
    expect(vendors.map((v) => v.name)).toContain("Trader Joe's")
  })

  it('user gets empty array when no vendors exist', async () => {
    const vendors = await getVendors()
    expect(vendors).toEqual([])
  })
})

describe('Vendor CRUD operations', () => {
  beforeEach(async () => {
    await db.vendors.clear()
  })

  it('user can create a vendor', async () => {
    // Given a vendor name
    const name = 'Costco'

    // When creating the vendor
    const vendor = await createVendor(name)

    // Then vendor is persisted with id and createdAt
    expect(vendor.id).toBeDefined()
    expect(vendor.name).toBe('Costco')
    expect(vendor.createdAt).toBeInstanceOf(Date)
  })

  it('user can list all vendors', async () => {
    // Given two vendors
    await createVendor('Costco')
    await createVendor('Trader Joes')

    // When listing vendors
    const vendors = await getVendors()

    // Then both vendors are returned
    expect(vendors).toHaveLength(2)
    expect(vendors.map((v) => v.name)).toContain('Costco')
    expect(vendors.map((v) => v.name)).toContain('Trader Joes')
  })

  it('user can update a vendor name', async () => {
    // Given an existing vendor
    const vendor = await createVendor('Costco')

    // When updating the vendor name
    await updateVendor(vendor.id, 'Costco Wholesale')

    // Then the vendor is updated in the database
    const vendors = await getVendors()
    const updated = vendors.find((v) => v.id === vendor.id)
    expect(updated?.name).toBe('Costco Wholesale')
  })

  it('user can delete a vendor', async () => {
    // Given an existing vendor
    const vendor = await createVendor('Costco')

    // When deleting the vendor
    await deleteVendor(vendor.id)

    // Then the vendor is no longer in the database
    const vendors = await getVendors()
    expect(vendors.find((v) => v.id === vendor.id)).toBeUndefined()
  })
})
