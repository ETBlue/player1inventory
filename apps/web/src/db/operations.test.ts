import { beforeEach, describe, expect, it } from 'vitest'
import type { TagColor } from '../types'
import { db } from './index'
import {
  abandonCart,
  addInventoryLog,
  addToCart,
  checkout,
  createItem,
  createRecipe,
  createShelf,
  createTag,
  createTagType,
  createVendor,
  deleteItem,
  deleteRecipe,
  deleteShelf,
  deleteTag,
  deleteTagType,
  deleteVendor,
  getAllItems,
  getAllTags,
  getAllTagTypes,
  getCartItemCountByItem,
  getCartItems,
  getCurrentQuantity,
  getInventoryLogCountByItem,
  getItem,
  getItemCountByRecipe,
  getItemCountByVendor,
  getItemLogs,
  getLastPurchaseDate,
  getOrCreateActiveCart,
  getRecipe,
  getRecipes,
  getShelf,
  getTagCountByType,
  getTagsByType,
  getVendors,
  listShelves,
  migrateTagColorTints,
  reorderShelfItems,
  reorderShelves,
  seedDefaultData,
  updateCartItem,
  updateItem,
  updateRecipe,
  updateRecipeLastCookedAt,
  updateShelf,
  updateTag,
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
      quantity: 2, // item starts at packedQuantity: 0, delta: 2 → total: 2
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

    await addInventoryLog({
      itemId: item.id,
      delta: 5,
      quantity: 5,
      occurredAt: new Date(),
    })
    await addInventoryLog({
      itemId: item.id,
      delta: -2,
      quantity: 3, // 5 - 2 = 3
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

    await addInventoryLog({
      itemId: item.id,
      delta: 5,
      quantity: 5,
      occurredAt: new Date(),
    })
    await addInventoryLog({
      itemId: item.id,
      delta: -1,
      quantity: 4, // 5 - 1 = 4
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
      quantity: -1, // item starts at packedQuantity: 0, delta: -1
      occurredAt: new Date('2026-01-15'),
    })
    await addInventoryLog({
      itemId: item.id,
      delta: 5,
      quantity: 4, // -1 + 5 = 4
      occurredAt: purchaseDate,
    })
    await addInventoryLog({
      itemId: item.id,
      delta: -2,
      quantity: 2, // 4 - 2 = 2
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

  it('user can create a tag with a parentId', async () => {
    // Given a tag type and a parent tag
    const tagType = await createTagType({ name: 'Category' })
    const parentTag = await createTag({ name: 'Dairy', typeId: tagType.id })

    // When creating a child tag with parentId
    const childTag = await createTag({
      name: 'Milk',
      typeId: tagType.id,
      parentId: parentTag.id,
    })

    // Then the child tag is persisted with parentId
    const retrieved = await getAllTags()
    const found = retrieved.find((t) => t.id === childTag.id)
    expect(found).toBeDefined()
    expect(found?.parentId).toBe(parentTag.id)
  })

  it('user can create a tag without a parentId', async () => {
    // Given a tag type
    const tagType = await createTagType({ name: 'Storage' })

    // When creating a tag without parentId
    const tag = await createTag({ name: 'Fridge', typeId: tagType.id })

    // Then the tag is persisted with no parentId
    const retrieved = await getAllTags()
    const found = retrieved.find((t) => t.id === tag.id)
    expect(found).toBeDefined()
    expect(found?.parentId).toBeUndefined()
  })

  it("user can update a tag's parentId", async () => {
    // Given a tag type, a parent tag, and a child tag without parentId
    const tagType = await createTagType({ name: 'Category' })
    const parentTag = await createTag({ name: 'Food', typeId: tagType.id })
    const childTag = await createTag({ name: 'Dairy', typeId: tagType.id })

    // When updating the child tag to set parentId
    await updateTag(childTag.id, { parentId: parentTag.id })

    // Then the tag is persisted with the new parentId
    const retrieved = await getAllTags()
    const found = retrieved.find((t) => t.id === childTag.id)
    expect(found?.parentId).toBe(parentTag.id)
  })
})

describe('Tag cascade operations', () => {
  beforeEach(async () => {
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.items.clear()
  })

  it('user can delete a tag and it is removed from all items', async () => {
    // Given a tag type, a tag, and two items using that tag
    const tagType = await createTagType({ name: 'Type' })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    const item1 = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [tag.id],
    })
    const item2 = await createItem({
      name: 'Eggs',
      packageUnit: 'dozen',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [tag.id],
    })
    const item3 = await createItem({
      name: 'Bread',
      packageUnit: 'loaf',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    // When deleting the tag
    await deleteTag(tag.id)

    // Then the tag record is gone
    const allTags = await getAllTags()
    expect(allTags.find((t) => t.id === tag.id)).toBeUndefined()

    // And the tag is removed from items that had it
    const updated1 = await getItem(item1.id)
    const updated2 = await getItem(item2.id)
    expect(updated1?.tagIds).not.toContain(tag.id)
    expect(updated2?.tagIds).not.toContain(tag.id)

    // And items that didn't have the tag are unaffected
    const updated3 = await getItem(item3.id)
    expect(updated3?.tagIds).toEqual([])
  })

  it('user can delete a tag type and all its tags are removed from items', async () => {
    // Given a tag type with two tags, and an item using both
    const tagType = await createTagType({ name: 'Type' })
    const tag1 = await createTag({ name: 'Dairy', typeId: tagType.id })
    const tag2 = await createTag({ name: 'Meat', typeId: tagType.id })
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [tag1.id, tag2.id],
    })

    // When deleting the tag type
    await deleteTagType(tagType.id)

    // Then the tag type is gone
    const allTypes = await getAllTagTypes()
    expect(allTypes.find((t) => t.id === tagType.id)).toBeUndefined()

    // And both child tags are gone
    const allTags = await getAllTags()
    expect(allTags.find((t) => t.id === tag1.id)).toBeUndefined()
    expect(allTags.find((t) => t.id === tag2.id)).toBeUndefined()

    // And the item's tagIds are emptied
    const updatedItem = await getItem(item.id)
    expect(updatedItem?.tagIds).toEqual([])
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

  it('log quantity reflects item packed state at time of checkout', async () => {
    // Given an item with pre-existing packedQuantity (simulating manual adjustment)
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 5,
      refillThreshold: 1,
      packedQuantity: 5, // pre-existing stock
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const cart = await getOrCreateActiveCart()
    await addToCart(cart.id, item.id, 3)

    // When checkout is called
    await checkout(cart.id)

    // Then the log quantity reflects total after purchase (existing + bought)
    const logs = await getItemLogs(item.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].delta).toBe(3)
    expect(logs[0].quantity).toBe(8) // 5 existing + 3 bought = 8
  })

  it('checkout increments packedQuantity of each item', async () => {
    // Given an item with known packedQuantity
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 5,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    // And a cart with that item and a quantity
    const cart = await getOrCreateActiveCart()
    await addToCart(cart.id, item.id, 3)

    // When checkout is called
    await checkout(cart.id)

    // Then item.packedQuantity should increase by the cart quantity
    const updatedItem = await getItem(item.id)
    expect(updatedItem?.packedQuantity).toBe(8)
  })

  it('checkout stores "purchased" note on logs when no note provided', async () => {
    // Given an item in cart
    const item = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    const cart = await getOrCreateActiveCart()
    await addToCart(cart.id, item.id, 2)

    // When checkout with no note
    await checkout(cart.id)

    // Then log has "purchased" note
    const logs = await getItemLogs(item.id)
    expect(logs[0].note).toBe('purchased')
  })

  it('checkout stores custom note on logs when note is provided', async () => {
    // Given an item in cart
    const item = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    const cart = await getOrCreateActiveCart()
    await addToCart(cart.id, item.id, 2)

    // When checkout with a vendor note
    await checkout(cart.id, 'purchased at Costco')

    // Then log has the vendor note
    const logs = await getItemLogs(item.id)
    expect(logs[0].note).toBe('purchased at Costco')
  })

  it('checkout skips inventory update for cartItems with quantity=0 (pinned)', async () => {
    // Given an item with known packedQuantity
    const item = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    // And a cart with a pinned item (quantity=0)
    const cart = await getOrCreateActiveCart()
    await addToCart(cart.id, item.id, 1)
    const cartItems = await getCartItems(cart.id)
    await updateCartItem(cartItems[0].id, 0)

    // When checkout is called
    await checkout(cart.id)

    // Then item.packedQuantity is unchanged (pinned item not consumed)
    const updated = await getItem(item.id)
    expect(updated?.packedQuantity).toBe(2)

    // And no inventory log was created for the pinned item
    const logs = await db.inventoryLogs
      .filter((l) => l.itemId === item.id)
      .toArray()
    expect(logs).toHaveLength(0)
  })

  it('checkout keeps pinned items in new active cart', async () => {
    // Given a pinned item (qty=0) and a buying item (qty=2)
    const pinnedItem = await createItem({
      name: 'Eggs',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    const buyItem = await createItem({
      name: 'Butter',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    const cart = await getOrCreateActiveCart()
    await addToCart(cart.id, pinnedItem.id, 1)
    const cartItems = await getCartItems(cart.id)
    await updateCartItem(cartItems[0].id, 0)
    await addToCart(cart.id, buyItem.id, 2)

    // When checkout is called
    await checkout(cart.id)

    // Then old cart is completed
    const oldCart = await db.shoppingCarts.get(cart.id)
    expect(oldCart?.status).toBe('completed')

    // And a new active cart can be retrieved (old cart is completed)
    const newCart = await getOrCreateActiveCart()
    expect(newCart.id).not.toBe(cart.id)

    // And the pinned item is in the new cart with quantity=0
    const newCartItems = await getCartItems(newCart.id)
    expect(newCartItems).toHaveLength(1)
    expect(newCartItems[0].itemId).toBe(pinnedItem.id)
    expect(newCartItems[0].quantity).toBe(0)

    // And the buying item is NOT in the new cart
    expect(newCartItems.find((ci) => ci.itemId === buyItem.id)).toBeUndefined()
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
    await db.items.clear()
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
    await updateVendor(vendor.id, { name: 'Costco Wholesale' })

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

  it('user can delete a vendor and it is removed from all items', async () => {
    // Given a vendor and two items assigned to it
    const vendor = await createVendor('Costco')
    const item1 = await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })
    const item2 = await createItem({
      name: 'Eggs',
      packageUnit: 'dozen',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })
    const item3 = await createItem({
      name: 'Bread',
      packageUnit: 'loaf',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [],
    })

    // When deleting the vendor
    await deleteVendor(vendor.id)

    // Then the vendor is gone
    const vendors = await getVendors()
    expect(vendors.find((v) => v.id === vendor.id)).toBeUndefined()

    // And the vendor is removed from items that had it
    const updated1 = await getItem(item1.id)
    const updated2 = await getItem(item2.id)
    expect(updated1?.vendorIds).not.toContain(vendor.id)
    expect(updated2?.vendorIds).not.toContain(vendor.id)

    // And items without this vendor are unaffected
    const updated3 = await getItem(item3.id)
    expect(updated3?.vendorIds ?? []).toEqual([])
  })
})

describe('getItemCountByVendor', () => {
  beforeEach(async () => {
    await db.vendors.clear()
    await db.items.clear()
  })

  it('returns count of items assigned to a vendor', async () => {
    // Given a vendor with two assigned items and one unassigned
    const vendor = await createVendor('Costco')
    await createItem({
      name: 'Milk',
      packageUnit: 'gallon',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })
    await createItem({
      name: 'Eggs',
      packageUnit: 'dozen',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })
    await createItem({
      name: 'Bread',
      packageUnit: 'loaf',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [],
    })

    // When counting items for the vendor
    const count = await getItemCountByVendor(vendor.id)

    // Then only the two assigned items are counted
    expect(count).toBe(2)
  })
})

describe('getTagCountByType', () => {
  beforeEach(async () => {
    await db.tags.clear()
    await db.tagTypes.clear()
  })

  it('returns count of tags under a tag type', async () => {
    // Given a tag type with three tags
    const tagType = await createTagType({ name: 'Type' })
    await createTag({ name: 'Dairy', typeId: tagType.id })
    await createTag({ name: 'Meat', typeId: tagType.id })
    await createTag({ name: 'Produce', typeId: tagType.id })

    // And another tag type with one tag (should not be counted)
    const otherType = await createTagType({ name: 'Other' })
    await createTag({ name: 'Frozen', typeId: otherType.id })

    // When counting tags for the first type
    const count = await getTagCountByType(tagType.id)

    // Then only tags of that type are counted
    expect(count).toBe(3)
  })
})

describe('Item cascade operations', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.inventoryLogs.clear()
    await db.cartItems.clear()
    await db.shoppingCarts.clear()
  })

  it('deleteItem cascades to inventory logs', async () => {
    // Given an item with inventory logs
    const item = await createItem({
      name: 'Test Item',
      tagIds: [],
      targetQuantity: 5,
      refillThreshold: 2,
      packageUnit: 'package',
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await db.inventoryLogs.add({
      id: crypto.randomUUID(),
      itemId: item.id,
      delta: 5,
      occurredAt: new Date(),
      createdAt: new Date(),
    })
    await db.inventoryLogs.add({
      id: crypto.randomUUID(),
      itemId: item.id,
      delta: -2,
      occurredAt: new Date(),
      createdAt: new Date(),
    })

    // When item is deleted
    await deleteItem(item.id)

    // Then inventory logs are also deleted
    const logs = await db.inventoryLogs
      .where('itemId')
      .equals(item.id)
      .toArray()
    expect(logs).toHaveLength(0)
  })

  it('deleteItem cascades to cart items', async () => {
    // Given an item in a shopping cart
    const item = await createItem({
      name: 'Test Item',
      tagIds: [],
      targetQuantity: 5,
      refillThreshold: 2,
      packageUnit: 'package',
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const cart = await db.shoppingCarts.add({
      id: crypto.randomUUID(),
      status: 'active',
      createdAt: new Date(),
    })
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cart,
      itemId: item.id,
      quantity: 3,
    })

    // When item is deleted
    await deleteItem(item.id)

    // Then cart items are also deleted
    const cartItems = await db.cartItems
      .where('itemId')
      .equals(item.id)
      .toArray()
    expect(cartItems).toHaveLength(0)
  })
})

describe('Count helpers for item relations', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.inventoryLogs.clear()
    await db.cartItems.clear()
    await db.shoppingCarts.clear()
  })

  it('getInventoryLogCountByItem returns correct count', async () => {
    // Given an item with 3 inventory logs
    const item = await createItem({
      name: 'Test Item',
      tagIds: [],
      targetQuantity: 5,
      refillThreshold: 2,
      packageUnit: 'package',
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await db.inventoryLogs.add({
      id: crypto.randomUUID(),
      itemId: item.id,
      delta: 5,
      occurredAt: new Date(),
      createdAt: new Date(),
    })
    await db.inventoryLogs.add({
      id: crypto.randomUUID(),
      itemId: item.id,
      delta: -2,
      occurredAt: new Date(),
      createdAt: new Date(),
    })
    await db.inventoryLogs.add({
      id: crypto.randomUUID(),
      itemId: item.id,
      delta: 1,
      occurredAt: new Date(),
      createdAt: new Date(),
    })

    // When counting logs
    const count = await getInventoryLogCountByItem(item.id)

    // Then count is correct
    expect(count).toBe(3)
  })

  it('getCartItemCountByItem returns correct count', async () => {
    // Given an item in 2 different carts
    const item = await createItem({
      name: 'Test Item',
      tagIds: [],
      targetQuantity: 5,
      refillThreshold: 2,
      packageUnit: 'package',
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const cart1 = await db.shoppingCarts.add({
      id: crypto.randomUUID(),
      status: 'active',
      createdAt: new Date(),
    })
    const cart2 = await db.shoppingCarts.add({
      id: crypto.randomUUID(),
      status: 'active',
      createdAt: new Date(),
    })
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cart1,
      itemId: item.id,
      quantity: 3,
    })
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cart2,
      itemId: item.id,
      quantity: 1,
    })

    // When counting cart items
    const count = await getCartItemCountByItem(item.id)

    // Then count is correct
    expect(count).toBe(2)
  })
})

describe('Recipe operations', () => {
  beforeEach(async () => {
    await db.recipes.clear()
    await db.items.clear()
  })

  it('user can create a recipe', async () => {
    const recipe = await createRecipe({ name: 'Pasta Dinner' })
    expect(recipe.id).toBeDefined()
    expect(recipe.name).toBe('Pasta Dinner')
    expect(recipe.items).toEqual([])
    expect(recipe.createdAt).toBeInstanceOf(Date)
    expect(recipe.updatedAt).toBeInstanceOf(Date)
  })

  it('user can create a recipe with initial items', async () => {
    const recipe = await createRecipe({
      name: 'Omelette',
      items: [{ itemId: 'item-1', defaultAmount: 2 }],
    })
    expect(recipe.items).toHaveLength(1)
    expect(recipe.items[0].itemId).toBe('item-1')
    expect(recipe.items[0].defaultAmount).toBe(2)
  })

  it('user can retrieve a recipe by id', async () => {
    const created = await createRecipe({ name: 'Salad' })
    const retrieved = await getRecipe(created.id)
    expect(retrieved?.name).toBe('Salad')
  })

  it('user can list all recipes', async () => {
    await createRecipe({ name: 'Pasta Dinner' })
    await createRecipe({ name: 'Omelette' })
    const recipes = await getRecipes()
    expect(recipes).toHaveLength(2)
  })

  it('user can update a recipe name', async () => {
    const recipe = await createRecipe({ name: 'Pasta' })
    await updateRecipe(recipe.id, { name: 'Pasta Carbonara' })
    const updated = await getRecipe(recipe.id)
    expect(updated?.name).toBe('Pasta Carbonara')
  })

  it('user can update recipe items', async () => {
    const recipe = await createRecipe({ name: 'Pasta' })
    const newItems = [{ itemId: 'item-1', defaultAmount: 3 }]
    await updateRecipe(recipe.id, { items: newItems })
    const updated = await getRecipe(recipe.id)
    expect(updated?.items).toEqual(newItems)
  })

  it('user can delete a recipe', async () => {
    const recipe = await createRecipe({ name: 'Pasta' })
    await deleteRecipe(recipe.id)
    const retrieved = await getRecipe(recipe.id)
    expect(retrieved).toBeUndefined()
  })

  it('getItemCountByRecipe returns number of items in recipe', async () => {
    const recipe = await createRecipe({
      name: 'Pasta',
      items: [
        { itemId: 'item-1', defaultAmount: 1 },
        { itemId: 'item-2', defaultAmount: 2 },
      ],
    })
    const count = await getItemCountByRecipe(recipe.id)
    expect(count).toBe(2)
  })

  it('deleteItem removes item from recipe items arrays', async () => {
    const item = await createItem({
      name: 'Flour',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const recipe = await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })
    await deleteItem(item.id)
    const updated = await getRecipe(recipe.id)
    expect(updated?.items).toEqual([])
  })

  it('user can record lastCookedAt on a recipe', async () => {
    // Given a recipe exists
    const recipe = await createRecipe({ name: 'Soup' })
    expect(recipe.lastCookedAt).toBeUndefined()

    // When lastCookedAt is updated
    const before = new Date()
    await updateRecipeLastCookedAt(recipe.id)
    const after = new Date()

    // Then the recipe has a lastCookedAt timestamp
    const updated = await getRecipe(recipe.id)
    expect(updated?.lastCookedAt).toBeDefined()
    expect(updated?.lastCookedAt?.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    )
    expect(updated?.lastCookedAt?.getTime()).toBeLessThanOrEqual(
      after.getTime(),
    )
    // And updatedAt is unchanged
    expect(updated?.updatedAt.getTime()).toEqual(recipe.updatedAt.getTime())
  })
})

describe('migrateTagColorTints', () => {
  beforeEach(async () => {
    await db.tagTypes.clear()
  })

  it('user can migrate tint tag type colors to their bold equivalents', async () => {
    // Given tag types with legacy tint color values in the DB
    await db.tagTypes.bulkPut([
      { id: 'tt-red', name: 'Ingredient', color: 'red-inverse' as TagColor },
      { id: 'tt-blue', name: 'Storage', color: 'blue-inverse' as TagColor },
      { id: 'tt-green', name: 'Category', color: 'green' as TagColor },
    ])

    // When migration runs
    await migrateTagColorTints()

    // Then tint colors are replaced with their base equivalents; bold colors are unchanged
    // red-inverse → rose (red removed from 10-hue system; rose is the nearest equivalent)
    const types = await getAllTagTypes()
    expect(types.find((t) => t.id === 'tt-red')?.color).toBe('rose')
    expect(types.find((t) => t.id === 'tt-blue')?.color).toBe('blue')
    expect(types.find((t) => t.id === 'tt-green')?.color).toBe('green')
  })

  it('user sees no changes when no tint colors exist', async () => {
    // Given tag types that already have bold colors
    await db.tagTypes.bulkPut([
      { id: 'tt-teal', name: 'Category', color: 'teal' as TagColor },
    ])

    // When migration runs
    await migrateTagColorTints()

    // Then nothing changes
    const types = await getAllTagTypes()
    expect(types.find((t) => t.id === 'tt-teal')?.color).toBe('teal')
  })
})

describe('seedDefaultData', () => {
  beforeEach(async () => {
    await db.tags.clear()
    await db.tagTypes.clear()
  })

  it('user can see EN default tag types seeded on first launch', async () => {
    // Given an empty database (cleared in beforeEach)

    // When seeding with English
    await seedDefaultData('en')

    // Then EN tag types exist
    const tagTypes = await getAllTagTypes()
    const names = tagTypes.map((t) => t.name)
    expect(names).toContain('Storage')
    expect(names).toContain('Diet')
    expect(names).toContain('Category')
  })

  it('user can see TW default tag types seeded on first launch', async () => {
    // Given an empty database

    // When seeding with Traditional Chinese
    await seedDefaultData('tw')

    // Then TW tag types exist
    const tagTypes = await getAllTagTypes()
    const names = tagTypes.map((t) => t.name)
    expect(names).toContain('保存方式')
    expect(names).toContain('飲食型態')
    expect(names).toContain('食材分類')
  })

  it('user can see EN default tags under Storage tag type', async () => {
    // Given an empty database

    // When seeding with English
    await seedDefaultData('en')

    // Then Storage tag type exists with correct tags
    const tagTypes = await getAllTagTypes()
    const storageType = tagTypes.find((t) => t.name === 'Storage')
    expect(storageType).toBeDefined()

    const tags = await getAllTags()
    const storageTags = tags
      .filter((tag) => tag.typeId === storageType?.id)
      .map((t) => t.name)
    expect(storageTags).toContain('freezer')
    expect(storageTags).toContain('fridge')
    expect(storageTags).toContain('pantry')
  })
})

describe('shelves', () => {
  beforeEach(async () => {
    await db.shelves.clear()
  })

  it('user can create a shelf (selection type)', async () => {
    // Given shelf data for a selection shelf
    const data = {
      name: 'Breakfast',
      type: 'selection' as const,
      order: 0,
      itemIds: [],
    }

    // When creating the shelf
    const shelf = await createShelf(data)

    // Then shelf is persisted with id and timestamps
    expect(shelf.id).toBeDefined()
    expect(shelf.name).toBe('Breakfast')
    expect(shelf.type).toBe('selection')
    expect(shelf.order).toBe(0)
    expect(shelf.createdAt).toBeInstanceOf(Date)
    expect(shelf.updatedAt).toBeInstanceOf(Date)
  })

  it('user can create a filter shelf', async () => {
    // Given shelf data for a filter shelf with filterConfig
    const data = {
      name: 'Low Stock',
      type: 'filter' as const,
      order: 1,
      filterConfig: {
        sortBy: 'stock' as const,
        sortDir: 'asc' as const,
      },
    }

    // When creating the filter shelf
    const shelf = await createShelf(data)

    // Then shelf is persisted with filterConfig
    expect(shelf.id).toBeDefined()
    expect(shelf.type).toBe('filter')
    expect(shelf.filterConfig?.sortBy).toBe('stock')
    expect(shelf.filterConfig?.sortDir).toBe('asc')
  })

  it('user can get a shelf by id', async () => {
    // Given an existing shelf
    const created = await createShelf({
      name: 'Pantry',
      type: 'selection',
      order: 0,
    })

    // When getting the shelf by id
    const found = await getShelf(created.id)

    // Then the correct shelf is returned
    expect(found).toBeDefined()
    expect(found?.id).toBe(created.id)
    expect(found?.name).toBe('Pantry')
  })

  it('user can list shelves ordered by order field', async () => {
    // Given three shelves with different order values
    await createShelf({ name: 'Third', type: 'selection', order: 2 })
    await createShelf({ name: 'First', type: 'selection', order: 0 })
    await createShelf({ name: 'Second', type: 'filter', order: 1 })

    // When listing shelves
    const shelves = await listShelves()

    // Then shelves are returned in ascending order
    expect(shelves).toHaveLength(3)
    expect(shelves[0].name).toBe('First')
    expect(shelves[1].name).toBe('Second')
    expect(shelves[2].name).toBe('Third')
  })

  it('user can update a shelf', async () => {
    // Given an existing shelf
    const shelf = await createShelf({
      name: 'Old Name',
      type: 'selection',
      order: 0,
    })
    const originalUpdatedAt = shelf.updatedAt

    // When updating the shelf name
    const updated = await updateShelf(shelf.id, { name: 'New Name' })

    // Then the shelf reflects the new name and updatedAt is refreshed
    expect(updated.name).toBe('New Name')
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      originalUpdatedAt.getTime(),
    )
  })

  it('user can delete a shelf', async () => {
    // Given an existing shelf
    const shelf = await createShelf({
      name: 'To Delete',
      type: 'selection',
      order: 0,
    })

    // When deleting the shelf
    await deleteShelf(shelf.id)

    // Then the shelf no longer exists
    const found = await getShelf(shelf.id)
    expect(found).toBeUndefined()
  })

  it('user can reorder shelves', async () => {
    // Given three shelves in initial order
    const a = await createShelf({ name: 'A', type: 'selection', order: 0 })
    const b = await createShelf({ name: 'B', type: 'selection', order: 1 })
    const c = await createShelf({ name: 'C', type: 'selection', order: 2 })

    // When reordering to C, A, B
    await reorderShelves([c.id, a.id, b.id])

    // Then shelves are listed in the new order
    const shelves = await listShelves()
    expect(shelves[0].name).toBe('C')
    expect(shelves[1].name).toBe('A')
    expect(shelves[2].name).toBe('B')
  })

  it('user can reorder items in a selection shelf', async () => {
    // Given a selection shelf with itemIds
    const shelf = await createShelf({
      name: 'Weekly',
      type: 'selection',
      order: 0,
      itemIds: ['id-1', 'id-2', 'id-3'],
    })

    // When reordering the items
    await reorderShelfItems(shelf.id, ['id-3', 'id-1', 'id-2'])

    // Then the shelf reflects the new item order
    const updated = await getShelf(shelf.id)
    expect(updated?.itemIds).toEqual(['id-3', 'id-1', 'id-2'])
  })
})
