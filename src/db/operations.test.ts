import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './index'
import {
  abandonCart,
  addInventoryLog,
  addToCart,
  checkout,
  createItem,
  createRecipe,
  createTag,
  createTagType,
  createVendor,
  deleteItem,
  deleteRecipe,
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
  getTagCountByType,
  getTagsByType,
  getVendors,
  updateCartItem,
  updateItem,
  updateRecipe,
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
})
