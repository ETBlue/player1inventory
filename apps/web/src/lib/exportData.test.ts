import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  buildExportPayload,
  fetchLocalPayload,
  sanitiseCloudPayload,
} from './exportData'

describe('buildExportPayload', () => {
  it('includes version and exportedAt', () => {
    const payload = buildExportPayload({
      items: [],
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
      shelves: [],
    })

    expect(payload.version).toBe(1)
    expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('passes all entity arrays through', () => {
    const payload = buildExportPayload({
      items: [{ id: '1', name: 'Milk' }],
      tags: [{ id: 't1' }],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
      shelves: [],
    })

    expect(payload.items).toHaveLength(1)
    expect(payload.tags).toHaveLength(1)
  })

  it('buildExportPayload includes shoppingCarts and cartItems fields', () => {
    const payload = buildExportPayload({
      items: [],
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [
        {
          id: 'cart-1',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      cartItems: [
        { id: 'ci-1', cartId: 'cart-1', itemId: 'item-1', quantity: 2 },
      ],
      shelves: [],
    })
    expect(payload.shoppingCarts).toHaveLength(1)
    expect(payload.cartItems).toHaveLength(1)
  })
})

describe('fetchLocalPayload — local (Dexie) export', () => {
  beforeEach(async () => {
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
    await db.items.clear()
    await db.vendors.clear()
  })

  it('user can export when shopping carts exist', async () => {
    // Given permanent shopping carts (v13 model: id only, NO `status` field)
    // plus cart items belonging to them
    await db.shoppingCarts.bulkPut([
      { id: 'vendor-1' },
      {
        id: 'no-vendor',
        lastPurchasedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ] as never)
    await db.cartItems.bulkPut([
      { id: 'ci-1', cartId: 'vendor-1', itemId: 'item-1', quantity: 2 },
      { id: 'ci-2', cartId: 'no-vendor', itemId: 'item-2', quantity: 1 },
    ] as never)

    // When the local export payload is fetched
    // (must NOT throw a Dexie SchemaError — `status` index was removed in v13)
    const payload = await fetchLocalPayload()

    // Then both permanent carts and their cart items are included
    expect(payload.shoppingCarts).toHaveLength(2)
    expect(
      (payload.cartItems as Array<{ id: string }>).map((ci) => ci.id),
    ).toEqual(expect.arrayContaining(['ci-1', 'ci-2']))
    expect(payload.cartItems).toHaveLength(2)
  })

  it('only exports cart items belonging to existing carts', async () => {
    // Given a cart plus an orphan cart item pointing at a non-existent cart
    await db.shoppingCarts.bulkPut([{ id: 'vendor-1' }] as never)
    await db.cartItems.bulkPut([
      { id: 'ci-1', cartId: 'vendor-1', itemId: 'item-1', quantity: 2 },
      { id: 'orphan', cartId: 'deleted-cart', itemId: 'item-9', quantity: 1 },
    ] as never)

    // When the local export payload is fetched
    const payload = await fetchLocalPayload()

    // Then only the cart item scoped to an existing cart is exported
    expect(payload.cartItems).toHaveLength(1)
    expect((payload.cartItems[0] as { id: string }).id).toBe('ci-1')
  })
})

describe('sanitiseCloudPayload — strip Apollo/server fields from cloud export', () => {
  it('strips __typename, userId, and familyId from items', () => {
    // Given a raw Apollo item with server-only fields
    const rawItem = {
      __typename: 'Item',
      id: 'item-1',
      name: 'Apple',
      tagIds: ['tag-1'],
      vendorIds: ['vendor-1'],
      packageUnit: null,
      measurementUnit: null,
      amountPerPackage: null,
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      dueDate: null,
      estimatedDueDays: null,
      expirationThreshold: null,
      userId: 'user_abc',
      familyId: null,
      createdAt: '2026-03-22T22:44:46.927Z',
      updatedAt: '2026-03-23T03:15:32.956Z',
    }

    // When sanitising a payload containing this item
    const raw = buildExportPayload({
      items: [rawItem],
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
      shelves: [],
    })
    const clean = sanitiseCloudPayload(raw)

    // Then the item in the clean payload has no server-only fields
    const item = clean.items[0] as Record<string, unknown>
    expect(item).not.toHaveProperty('__typename')
    expect(item).not.toHaveProperty('userId')
    expect(item).not.toHaveProperty('familyId')

    // And the valid fields are preserved
    expect(item.id).toBe('item-1')
    expect(item.name).toBe('Apple')
    expect(item.createdAt).toBe('2026-03-22T22:44:46.927Z')
  })

  it('user can export tags with parentId — parentId is preserved after sanitise', () => {
    // Given a cloud tag payload where one tag has a parentId
    const rawTag = {
      __typename: 'Tag',
      id: 'tag-child',
      name: 'Whole Milk',
      typeId: 'type-1',
      parentId: 'tag-parent',
      userId: 'u1',
    }

    // When building and sanitising a cloud export payload
    const raw = buildExportPayload({
      items: [],
      tags: [rawTag],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
      shelves: [],
    })
    const clean = sanitiseCloudPayload(raw)

    // Then parentId survives the sanitise step and server-only fields are removed
    const tag = clean.tags[0] as Record<string, unknown>
    expect(tag.parentId).toBe('tag-parent')
    expect(tag).not.toHaveProperty('__typename')
    expect(tag).not.toHaveProperty('userId')
  })

  it('strips __typename from tags, tagTypes, vendors, recipes', () => {
    const rawTag = {
      __typename: 'Tag',
      id: 'tag-1',
      name: 'Dairy',
      typeId: 'type-1',
    }
    const rawTagType = {
      __typename: 'TagType',
      id: 'type-1',
      name: 'Category',
      color: 'blue',
    }
    const rawVendor = { __typename: 'Vendor', id: 'vendor-1', name: 'Costco' }
    const rawRecipe = {
      __typename: 'Recipe',
      id: 'recipe-1',
      name: 'Smoothie',
      items: [],
      lastCookedAt: null,
    }

    const raw = buildExportPayload({
      items: [],
      tags: [rawTag],
      tagTypes: [rawTagType],
      vendors: [rawVendor],
      recipes: [rawRecipe],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
      shelves: [],
    })
    const clean = sanitiseCloudPayload(raw)

    expect(clean.tags[0] as Record<string, unknown>).not.toHaveProperty(
      '__typename',
    )
    expect(clean.tagTypes[0] as Record<string, unknown>).not.toHaveProperty(
      '__typename',
    )
    expect(clean.vendors[0] as Record<string, unknown>).not.toHaveProperty(
      '__typename',
    )
    expect(clean.recipes[0] as Record<string, unknown>).not.toHaveProperty(
      '__typename',
    )
  })
})
