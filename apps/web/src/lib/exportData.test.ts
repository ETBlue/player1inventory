import { describe, expect, it } from 'vitest'
import { buildExportPayload, sanitiseCloudPayload } from './exportData'

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
    })

    expect(payload.items).toHaveLength(1)
    expect(payload.tags).toHaveLength(1)
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
