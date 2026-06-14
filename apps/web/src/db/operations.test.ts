import { beforeEach, describe, expect, it } from 'vitest'
import type { TagColor } from '../types'
import { cartIdFor, DEFAULT_LOCATION_ID } from '../types'
import { db } from './index'
import {
  abandonCart,
  addInventoryLog,
  addItemToLocation,
  addToCart,
  checkout,
  createItem,
  createLocation,
  createRecipe,
  createShelf,
  createTag,
  createTagType,
  createVendor,
  deleteItem,
  deleteLocation,
  deleteRecipe,
  deleteShelf,
  deleteTag,
  deleteTagType,
  deleteVendor,
  getAllCarts,
  getAllItems,
  getAllTags,
  getAllTagTypes,
  getCart,
  getCartItemCountByItem,
  getCartItems,
  getCurrentQuantity,
  getInventoryLogCountByItem,
  getItem,
  getItemCountByRecipe,
  getItemCountByVendor,
  getItemLogs,
  getItemStock,
  getItemStocks,
  getLastPurchaseDate,
  getLastPurchasedByVendor,
  getLocations,
  getRecipe,
  getRecipes,
  getShelf,
  getStockedItems,
  getTagCountByType,
  getTagsByType,
  getVendors,
  listShelves,
  migrateTagColorTints,
  reorderLocations,
  reorderShelfItems,
  reorderShelves,
  seedDefaultData,
  updateCartItem,
  updateItem,
  updateLocation,
  updateRecipe,
  updateRecipeLastCookedAt,
  updateShelf,
  updateTag,
  updateVendor,
} from './operations'

// Cart ids are location-scoped (`${locationId}:${vendorId|'no-vendor'}`) since
// the Location feature (PR D). Helper for the default location used in tests.
const localCartId = (vendorId: string | null) =>
  cartIdFor(DEFAULT_LOCATION_ID, vendorId)

describe('Item operations', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
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

  it('user can persist wikidataUrl and note on an item', async () => {
    // Given item data with wikidataUrl and note
    const created = await createItem({
      name: 'Milk',
      wikidataUrl: 'https://www.wikidata.org/wiki/Q8495',
      note: 'Prefer organic; see https://example.com',
      packageUnit: 'gallon',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    // When the item is read back from the database
    const fetched = await getItem(created.id)

    // Then both fields persist and read back unchanged
    expect(fetched?.wikidataUrl).toBe('https://www.wikidata.org/wiki/Q8495')
    expect(fetched?.note).toBe('Prefer organic; see https://example.com')

    // And updating them round-trips as well
    await updateItem(created.id, {
      wikidataUrl: 'https://www.wikidata.org/wiki/Q11002',
      note: 'Updated note',
    })
    const reFetched = await getItem(created.id)
    expect(reFetched?.wikidataUrl).toBe('https://www.wikidata.org/wiki/Q11002')
    expect(reFetched?.note).toBe('Updated note')
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

describe('ItemStock operations (Location PR D)', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.inventoryLogs.clear()
    await db.locations.clear()
  })

  it('user can create an item that is stocked in a given location', async () => {
    // Given an item created in a non-default location
    const loc = await createLocation('Storage')
    const item = await createItem(
      {
        name: 'Rice',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      loc.id,
    )

    // Then the global item carries no stock fields, but an ItemStock exists in loc
    const rawItem = (await db.items.get(item.id)) as Record<string, unknown>
    expect(rawItem.packedQuantity).toBeUndefined()
    const stock = await getItemStock(item.id, loc.id)
    expect(stock?.packedQuantity).toBe(2)
    expect(stock?.targetQuantity).toBe(3)
    // And no stock exists in the default location
    expect(await getItemStock(item.id, DEFAULT_LOCATION_ID)).toBeUndefined()
  })

  it('joined reads return zeroed stock when the item is not stocked in a location', async () => {
    // Given an item stocked only in the default location
    const item = await createItem({
      name: 'Salt',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 5,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const other = await createLocation('Cabin')

    // When read joined against another location
    const joined = await getItem(item.id, other.id)

    // Then stock fields are zeroed and stockId is undefined
    expect(joined?.packedQuantity).toBe(0)
    expect(joined?.stockId).toBeUndefined()
    expect(joined?.locationId).toBe(other.id)
  })

  it('copy-on-add inherits all fields except packed/unpacked (which start at 0)', async () => {
    // Given an item stocked in the default location with quantities + units
    const item = await createItem({
      name: 'Flour',
      tagIds: [],
      packageUnit: 'bag',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'measurement',
      targetQuantity: 2000,
      refillThreshold: 500,
      packedQuantity: 4,
      unpackedQuantity: 100,
      consumeAmount: 100,
    })
    const cabin = await createLocation('Cabin')

    // When adding it to another location via copy-on-add
    const copied = await addItemToLocation(item.id, cabin.id)

    // Then all profile fields are inherited but quantities reset to 0
    expect(copied.targetQuantity).toBe(2000)
    expect(copied.refillThreshold).toBe(500)
    expect(copied.amountPerPackage).toBe(500)
    expect(copied.consumeAmount).toBe(100)
    expect(copied.packedQuantity).toBe(0)
    expect(copied.unpackedQuantity).toBe(0)
  })

  it('addItemToLocation is a no-op when the item is already stocked there', async () => {
    const item = await createItem({
      name: 'Sugar',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    // When adding to the default location where it is already stocked
    const result = await addItemToLocation(item.id, DEFAULT_LOCATION_ID)

    // Then the existing stock is returned unchanged (quantities preserved)
    expect(result.packedQuantity).toBe(3)
    const stocks = await getItemStocks(item.id)
    expect(stocks).toHaveLength(1)
  })

  it('getStockedItems returns only items stocked in the given location', async () => {
    // Given two items stocked in the default location and one only elsewhere
    const cabin = await createLocation('Cabin')
    await createItem({ name: 'Milk', tagIds: [] }, DEFAULT_LOCATION_ID)
    await createItem({ name: 'Eggs', tagIds: [] }, DEFAULT_LOCATION_ID)
    const cabinOnly = await createItem(
      { name: 'Firewood', tagIds: [] },
      cabin.id,
    )

    // When reading stocked items for the default location
    const defaultStocked = await getStockedItems(DEFAULT_LOCATION_ID)

    // Then only the two default-location items appear (not the cabin-only one)
    const names = defaultStocked.map((i) => i.name).sort()
    expect(names).toEqual(['Eggs', 'Milk'])
    expect(defaultStocked.every((i) => i.stockId)).toBe(true)

    // And the cabin location scopes to its own item
    const cabinStocked = await getStockedItems(cabin.id)
    expect(cabinStocked.map((i) => i.id)).toEqual([cabinOnly.id])
  })

  it('getStockedItems re-scopes after copy-on-add into a new location', async () => {
    // Given an item stocked only in the default location
    const cabin = await createLocation('Cabin')
    const item = await createItem(
      { name: 'Salt', tagIds: [] },
      DEFAULT_LOCATION_ID,
    )
    expect(await getStockedItems(cabin.id)).toHaveLength(0)

    // When it is added to the cabin via copy-on-add
    await addItemToLocation(item.id, cabin.id)

    // Then it now appears in the cabin's stocked set
    const cabinStocked = await getStockedItems(cabin.id)
    expect(cabinStocked.map((i) => i.id)).toEqual([item.id])
  })

  it('deleteLocation cascades the location ItemStock rows, carts, and logs', async () => {
    const cabin = await createLocation('Cabin')
    const vendor = await createVendor('Costco', cabin.id)
    const item = await createItem(
      {
        name: 'Beans',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      cabin.id,
    )
    await addToCart(cartIdFor(cabin.id, vendor.id), item.id, 2)
    await checkout(cartIdFor(cabin.id, vendor.id))

    // sanity: data exists in the cabin location
    expect(await getItemStock(item.id, cabin.id)).toBeDefined()
    expect(await getItemLogs(item.id, cabin.id)).not.toHaveLength(0)

    // When the location is deleted
    await deleteLocation(cabin.id)

    // Then its stock, logs and carts are gone
    expect(await getItemStock(item.id, cabin.id)).toBeUndefined()
    expect(await getItemLogs(item.id, cabin.id)).toHaveLength(0)
    const carts = await db.shoppingCarts
      .where('id')
      .startsWith(`${cabin.id}:`)
      .toArray()
    expect(carts).toHaveLength(0)
    // And the global item itself survives
    expect(await db.items.get(item.id)).toBeDefined()
  })

  it('checkout and cooking write to the location passed via the cart/locationId', async () => {
    const cabin = await createLocation('Cabin')
    const item = await createItem(
      {
        name: 'Pasta',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 5,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      cabin.id,
    )
    await addToCart(cartIdFor(cabin.id, null), item.id, 2)
    await checkout(cartIdFor(cabin.id, null))

    // Stock + log land in the cabin location, not the default one
    const cabinStock = await getItemStock(item.id, cabin.id)
    expect(cabinStock?.packedQuantity).toBe(3)
    expect(await getCurrentQuantity(item.id, cabin.id)).toBe(2)
    expect(await getCurrentQuantity(item.id, DEFAULT_LOCATION_ID)).toBe(0)
  })
})

describe('InventoryLog operations', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
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
    await db.itemStocks.clear()
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
    await db.vendors.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
    await db.items.clear()
    await db.itemStocks.clear()
    await db.inventoryLogs.clear()
  })

  it('getCart returns the permanent cart for a vendor', async () => {
    // Given a vendor (createVendor also creates the cart)
    const vendor = await createVendor('Test Vendor')

    // When getting the cart for that vendor
    const cart = await getCart(vendor.id)

    // Then the cart exists with the location-scoped id
    expect(cart).toBeDefined()
    expect(cart?.id).toBe(localCartId(vendor.id))
  })

  it('getCart returns the no-vendor cart', async () => {
    // Given a no-vendor cart exists (location-scoped id)
    await db.shoppingCarts.put({ id: localCartId(null) })

    // When getting the cart with null vendorId
    const cart = await getCart(null)

    // Then the no-vendor cart is returned
    expect(cart).toBeDefined()
    expect(cart?.id).toBe(localCartId(null))
  })

  it('createVendor creates a permanent cart with the location-scoped id', async () => {
    // When creating a vendor
    const vendor = await createVendor('Costco')

    // Then a cart with the location-scoped id is created
    const cart = await db.shoppingCarts.get(localCartId(vendor.id))
    expect(cart).toBeDefined()
    expect(cart?.id).toBe(localCartId(vendor.id))
  })

  it('deleteVendor deletes the vendor cart and its items', async () => {
    // Given a vendor with a cart and cart items
    const vendor = await createVendor('Costco')
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
    await addToCart(localCartId(vendor.id), item.id, 2)

    // When deleting the vendor
    await deleteVendor(vendor.id)

    // Then the vendor cart is gone
    const cart = await db.shoppingCarts.get(localCartId(vendor.id))
    expect(cart).toBeUndefined()

    // And the cart items are gone
    const cartItems = await db.cartItems
      .where('cartId')
      .equals(localCartId(vendor.id))
      .toArray()
    expect(cartItems).toHaveLength(0)
  })

  it('adds item to cart', async () => {
    // Given a vendor and its permanent cart
    const vendor = await createVendor('Test Vendor')
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

    // When adding an item to the cart
    const cartItem = await addToCart(localCartId(vendor.id), item.id, 2)

    // Then the cart item is created with the correct quantity
    expect(cartItem.quantity).toBe(2)
  })

  it('updates cart item quantity', async () => {
    // Given a vendor cart with an item
    const vendor = await createVendor('Test Vendor')
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
    const cartItem = await addToCart(localCartId(vendor.id), item.id, 2)

    // When updating the quantity
    await updateCartItem(cartItem.id, 5)

    // Then the quantity is updated
    const items = await getCartItems(localCartId(vendor.id))
    expect(items[0]?.quantity).toBe(5)
  })

  it('checkout creates inventory logs for bought items', async () => {
    // Given a vendor cart with a bought item
    const vendor = await createVendor('Test Vendor')
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
    await addToCart(localCartId(vendor.id), item.id, 3)

    // When checking out
    await checkout(localCartId(vendor.id))

    // Then inventory logs are created
    const quantity = await getCurrentQuantity(item.id)
    expect(quantity).toBe(3)
  })

  it('checkout sets lastPurchasedAt on the cart', async () => {
    // Given a vendor cart with an item
    const vendor = await createVendor('Test Vendor')
    const item = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await addToCart(localCartId(vendor.id), item.id, 1)
    const before = new Date()

    // When checking out
    await checkout(localCartId(vendor.id))

    // Then the cart has lastPurchasedAt set
    const cart = await db.shoppingCarts.get(localCartId(vendor.id))
    expect(cart?.lastPurchasedAt).toBeDefined()
    expect(cart?.lastPurchasedAt?.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    )
  })

  it('checkout clears only active items (quantity > 0)', async () => {
    // Given a vendor cart with one active item and one pinned item
    const vendor = await createVendor('Test Vendor')
    const activeItem = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const pinnedItem = await createItem({
      name: 'Eggs',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await addToCart(localCartId(vendor.id), activeItem.id, 2)
    await addToCart(localCartId(vendor.id), pinnedItem.id, 1)
    const cartItems = await getCartItems(localCartId(vendor.id))
    const pinnedCartItem = cartItems.find((ci) => ci.itemId === pinnedItem.id)
    if (pinnedCartItem) await updateCartItem(pinnedCartItem.id, 0)

    // When checking out
    await checkout(localCartId(vendor.id))

    // Then only the active item is removed (the pinned stays)
    const remainingItems = await getCartItems(localCartId(vendor.id))
    expect(remainingItems).toHaveLength(1)
    expect(remainingItems[0].itemId).toBe(pinnedItem.id)
    expect(remainingItems[0].quantity).toBe(0)
  })

  it('checkout keeps pinned items (quantity === 0) in same cart', async () => {
    // Given a vendor cart with a pinned item (quantity=0)
    const vendor = await createVendor('Test Vendor')
    const item = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await addToCart(localCartId(vendor.id), item.id, 1)
    const cartItems = await getCartItems(localCartId(vendor.id))
    await updateCartItem(cartItems[0].id, 0)

    // When checking out
    await checkout(localCartId(vendor.id))

    // Then the pinned item remains in the same permanent cart
    const remainingItems = await getCartItems(localCartId(vendor.id))
    expect(remainingItems).toHaveLength(1)
    expect(remainingItems[0].itemId).toBe(item.id)
    expect(remainingItems[0].quantity).toBe(0)

    // And the item's packedQuantity is unchanged
    const updatedItem = await getItem(item.id)
    expect(updatedItem?.packedQuantity).toBe(2)
  })

  it('checkout stores logKey and logParams on logs when logDescriptor provided', async () => {
    // Given a vendor cart with an item
    const vendor = await createVendor('Test Vendor')
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
    await addToCart(localCartId(vendor.id), item.id, 2)

    // When checkout with a logDescriptor
    await checkout(localCartId(vendor.id), {
      logKey: 'shopping.log.purchasedAt',
      logParams: { vendor: 'Costco' },
    })

    // Then log has the logKey and logParams but no note
    const logs = await getItemLogs(item.id)
    expect(logs[0].logKey).toBe('shopping.log.purchasedAt')
    expect(logs[0].logParams?.vendor).toBe('Costco')
    expect(logs[0].note).toBeUndefined()
  })

  it('abandonCart clears all items including pinned', async () => {
    // Given a vendor cart with one active and one pinned item
    const vendor = await createVendor('Test Vendor')
    const item1 = await createItem({
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
    const item2 = await createItem({
      name: 'Eggs',
      packageUnit: 'dozen',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await addToCart(localCartId(vendor.id), item1.id, 3)
    await addToCart(localCartId(vendor.id), item2.id, 1)
    const cartItems = await getCartItems(localCartId(vendor.id))
    const item2CartItem = cartItems.find((ci) => ci.itemId === item2.id)
    if (item2CartItem) await updateCartItem(item2CartItem.id, 0)

    // When abandoning the cart
    await abandonCart(localCartId(vendor.id))

    // Then all items including pinned are removed
    const remaining = await getCartItems(localCartId(vendor.id))
    expect(remaining).toHaveLength(0)

    // And no inventory logs were created
    const quantity = await getCurrentQuantity(item1.id)
    expect(quantity).toBe(0)
  })

  it('getAllCarts returns all permanent carts', async () => {
    // Given two vendor carts and a no-vendor cart
    const vendor1 = await createVendor('Costco')
    const vendor2 = await createVendor('Trader Joes')
    await db.shoppingCarts.put({ id: localCartId(null) })

    // When getting all carts
    const carts = await getAllCarts()

    // Then all three carts are returned
    expect(carts.length).toBeGreaterThanOrEqual(3)
    const ids = carts.map((c) => c.id)
    expect(ids).toContain(localCartId(vendor1.id))
    expect(ids).toContain(localCartId(vendor2.id))
    expect(ids).toContain(localCartId(null))
  })

  it('getLastPurchasedByVendor returns lastPurchasedAt from each cart', async () => {
    // Given two vendor carts with known lastPurchasedAt values
    const vendor1 = await createVendor('Costco')
    const vendor2 = await createVendor('Trader Joes')
    await db.shoppingCarts.put({ id: localCartId(null) })
    const date1 = new Date('2026-05-01')
    const date2 = new Date('2026-04-15')
    await db.shoppingCarts.update(localCartId(vendor1.id), {
      lastPurchasedAt: date1,
    })
    await db.shoppingCarts.update(localCartId(vendor2.id), {
      lastPurchasedAt: date2,
    })

    // When getting lastPurchasedByVendor
    const result = await getLastPurchasedByVendor()

    // Then each vendor id maps to its cart's lastPurchasedAt
    expect(result.get(vendor1.id)?.getTime()).toBe(date1.getTime())
    expect(result.get(vendor2.id)?.getTime()).toBe(date2.getTime())
    // And the no-vendor cart maps to null (no lastPurchasedAt)
    expect(result.get(null)).toBeNull()
  })

  it('log quantity reflects item packed state at time of checkout', async () => {
    // Given an item with pre-existing packedQuantity (simulating manual adjustment)
    const vendor = await createVendor('Test Vendor')
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
    await addToCart(localCartId(vendor.id), item.id, 3)

    // When checkout is called
    await checkout(localCartId(vendor.id))

    // Then the log quantity reflects total after purchase (existing + bought)
    const logs = await getItemLogs(item.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].delta).toBe(3)
    expect(logs[0].quantity).toBe(8) // 5 existing + 3 bought = 8
  })

  it('checkout increments packedQuantity of each item', async () => {
    // Given an item with known packedQuantity
    const vendor = await createVendor('Test Vendor')
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
    await addToCart(localCartId(vendor.id), item.id, 3)

    // When checkout is called
    await checkout(localCartId(vendor.id))

    // Then item.packedQuantity should increase by the cart quantity
    const updatedItem = await getItem(item.id)
    expect(updatedItem?.packedQuantity).toBe(8)
  })
})

describe('Vendor operations', () => {
  beforeEach(async () => {
    await db.vendors.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
    await db.items.clear()
    await db.itemStocks.clear()
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
    await db.shoppingCarts.clear()
    await db.items.clear()
    await db.itemStocks.clear()
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
    await db.itemStocks.clear()
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
    const cartId = crypto.randomUUID()
    await db.shoppingCarts.put({ id: cartId })
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId,
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
    await db.itemStocks.clear()
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
    const cartId1 = crypto.randomUUID()
    const cartId2 = crypto.randomUUID()
    await db.shoppingCarts.put({ id: cartId1 })
    await db.shoppingCarts.put({ id: cartId2 })
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cartId1,
      itemId: item.id,
      quantity: 3,
    })
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cartId2,
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
    await db.itemStocks.clear()
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
    // Given shelf data for a filter shelf
    const data = {
      name: 'Low Stock',
      type: 'filter' as const,
      order: 1,
    }

    // When creating the filter shelf
    const shelf = await createShelf(data)

    // Then shelf is persisted with id and type
    expect(shelf.id).toBeDefined()
    expect(shelf.type).toBe('filter')
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

describe('locations', () => {
  beforeEach(async () => {
    await db.locations.clear()
  })

  it('user can list locations ordered by order', async () => {
    // Given three locations created out of order
    const a = await createLocation('Office')
    const b = await createLocation('Cabin')
    await reorderLocations([b.id, a.id])

    // When listing locations
    const locations = await getLocations()

    // Then they come back sorted by their order field
    expect(locations.map((l) => l.name)).toEqual(['Cabin', 'Office'])
  })

  it('user can create a location', async () => {
    // Given a location name
    // When the user creates the location
    const location = await createLocation('Beach House')

    // Then it is persisted with id, order, and timestamps
    expect(location.id).toBeDefined()
    expect(location.name).toBe('Beach House')
    expect(location.order).toBe(0)
    expect(location.createdAt).toBeInstanceOf(Date)
    expect(location.updatedAt).toBeInstanceOf(Date)
  })

  it('user can create a location with a trimmed name', async () => {
    // Given a name with surrounding whitespace
    // When the user creates the location
    const location = await createLocation('  Garage  ')

    // Then the stored name is trimmed
    expect(location.name).toBe('Garage')
  })

  it('appends each new location after the current highest order', async () => {
    // Given two existing locations
    const first = await createLocation('First')
    const second = await createLocation('Second')

    // When a third is created
    const third = await createLocation('Third')

    // Then orders are sequential
    expect(first.order).toBe(0)
    expect(second.order).toBe(1)
    expect(third.order).toBe(2)
  })

  it('user can rename a location', async () => {
    // Given an existing location
    const location = await createLocation('Old Name')

    // When the user renames it
    const updated = await updateLocation(location.id, { name: 'New Name' })

    // Then the name is updated and updatedAt advances
    expect(updated.name).toBe('New Name')
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      location.updatedAt.getTime(),
    )
  })

  it('user can delete a non-default location', async () => {
    // Given a non-default location
    const location = await createLocation('Temporary')

    // When the user deletes it
    await deleteLocation(location.id)

    // Then it is gone
    expect(await db.locations.get(location.id)).toBeUndefined()
  })

  it('user cannot delete the default location', async () => {
    // Given the default location exists
    const now = new Date()
    await db.locations.put({
      id: DEFAULT_LOCATION_ID,
      name: 'My Home',
      order: 0,
      createdAt: now,
      updatedAt: now,
    })

    // When the user attempts to delete it
    // Then it throws and the row remains
    await expect(deleteLocation(DEFAULT_LOCATION_ID)).rejects.toThrow()
    expect(await db.locations.get(DEFAULT_LOCATION_ID)).toBeDefined()
  })

  it('user can reorder locations', async () => {
    // Given three locations
    const a = await createLocation('A')
    const b = await createLocation('B')
    const c = await createLocation('C')

    // When the user reorders them C, A, B
    await reorderLocations([c.id, a.id, b.id])

    // Then the stored order reflects the new sequence
    const locations = await getLocations()
    expect(locations.map((l) => l.name)).toEqual(['C', 'A', 'B'])
  })
})
