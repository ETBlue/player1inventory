import { describe, expect, it } from 'vitest'
import type { ExportPayload } from './exportData'
import {
  type ConflictSummary,
  detectConflicts,
  type ExistingData,
  hasConflicts,
  partitionPayload,
} from './importData'

// --- Minimal fixture helpers ---

function makeItem(id: string, name: string) {
  return {
    id,
    name,
    tagIds: [],
    targetUnit: 'package' as const,
    targetQuantity: 1,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function makeTag(id: string, name: string, typeId = 'type-1') {
  return { id, name, typeId }
}

function makeTagType(id: string, name: string) {
  return { id, name, color: 'blue' as const }
}

function makeVendor(id: string, name: string) {
  return { id, name, createdAt: new Date() }
}

function makeRecipe(id: string, name: string) {
  return { id, name, items: [], createdAt: new Date(), updatedAt: new Date() }
}

function makeInventoryLog(id: string) {
  return {
    id,
    itemId: 'item-1',
    delta: 1,
    quantity: 1,
    occurredAt: new Date(),
    createdAt: new Date(),
  }
}

function makeShoppingCart(id: string) {
  return { id, status: 'active' as const, createdAt: new Date() }
}

function makeCartItem(id: string) {
  return { id, cartId: 'cart-1', itemId: 'item-1', quantity: 1 }
}

function emptyPayload(overrides: Partial<ExportPayload> = {}): ExportPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    items: [],
    tags: [],
    tagTypes: [],
    vendors: [],
    recipes: [],
    inventoryLogs: [],
    shoppingCarts: [],
    cartItems: [],
    ...overrides,
  }
}

function emptyExisting(overrides: Partial<ExistingData> = {}): ExistingData {
  return {
    items: [],
    tags: [],
    tagTypes: [],
    vendors: [],
    recipes: [],
    inventoryLogs: [],
    shoppingCarts: [],
    cartItems: [],
    ...overrides,
  }
}

// --- Tests ---

describe('detectConflicts', () => {
  it('user can detect ID conflicts across entity types', async () => {
    // Given existing data with one entity of each type
    const existing = emptyExisting({
      items: [makeItem('item-1', 'Milk')],
      tags: [makeTag('tag-1', 'Dairy')],
      tagTypes: [makeTagType('type-1', 'Category')],
      vendors: [makeVendor('vendor-1', 'Costco')],
      recipes: [makeRecipe('recipe-1', 'Smoothie')],
      inventoryLogs: [makeInventoryLog('log-1')],
      shoppingCarts: [makeShoppingCart('cart-1')],
      cartItems: [makeCartItem('ci-1')],
    })

    // When importing a payload whose IDs all match existing entities
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Different Name')],
      tags: [makeTag('tag-1', 'Different Tag')],
      tagTypes: [makeTagType('type-1', 'Different Type')],
      vendors: [makeVendor('vendor-1', 'Different Vendor')],
      recipes: [makeRecipe('recipe-1', 'Different Recipe')],
      inventoryLogs: [makeInventoryLog('log-1')],
      shoppingCarts: [makeShoppingCart('cart-1')],
      cartItems: [makeCartItem('ci-1')],
    })

    const summary = detectConflicts(payload, existing)

    // Then each entity type reports one ID conflict
    expect(summary.items).toHaveLength(1)
    expect(summary.items[0].matchReasons).toContain('id')

    expect(summary.tags).toHaveLength(1)
    expect(summary.tags[0].matchReasons).toContain('id')

    expect(summary.tagTypes).toHaveLength(1)
    expect(summary.tagTypes[0].matchReasons).toContain('id')

    expect(summary.vendors).toHaveLength(1)
    expect(summary.vendors[0].matchReasons).toContain('id')

    expect(summary.recipes).toHaveLength(1)
    expect(summary.recipes[0].matchReasons).toContain('id')

    expect(summary.inventoryLogs).toHaveLength(1)
    expect(summary.inventoryLogs[0].matchReasons).toEqual(['id'])

    expect(summary.shoppingCarts).toHaveLength(1)
    expect(summary.shoppingCarts[0].matchReasons).toEqual(['id'])

    expect(summary.cartItems).toHaveLength(1)
    expect(summary.cartItems[0].matchReasons).toEqual(['id'])
  })

  it('user can detect name conflicts for named entities', async () => {
    // Given existing data with named entities
    const existing = emptyExisting({
      items: [makeItem('item-existing', 'Milk')],
      vendors: [makeVendor('vendor-existing', 'Costco')],
    })

    // When importing a payload with different IDs but same names
    const payload = emptyPayload({
      items: [makeItem('item-new', 'Milk')],
      vendors: [makeVendor('vendor-new', 'Costco')],
    })

    const summary = detectConflicts(payload, existing)

    // Then name conflicts are detected
    expect(summary.items).toHaveLength(1)
    expect(summary.items[0].matchReasons).toContain('name')
    expect(summary.items[0].matchReasons).not.toContain('id')

    expect(summary.vendors).toHaveLength(1)
    expect(summary.vendors[0].matchReasons).toContain('name')
    expect(summary.vendors[0].matchReasons).not.toContain('id')
  })

  it('user can detect both ID and name conflict on same entity', async () => {
    // Given an existing item
    const existing = emptyExisting({
      items: [makeItem('item-1', 'Milk')],
    })

    // When importing an item with the same ID AND the same name
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Milk')],
    })

    const summary = detectConflicts(payload, existing)

    // Then both id and name reasons are reported
    expect(summary.items).toHaveLength(1)
    expect(summary.items[0].matchReasons).toContain('id')
    expect(summary.items[0].matchReasons).toContain('name')
  })

  it('user can detect no conflicts when data is entirely new', async () => {
    // Given existing data
    const existing = emptyExisting({
      items: [makeItem('item-1', 'Milk')],
      vendors: [makeVendor('vendor-1', 'Costco')],
    })

    // When importing entirely new entities
    const payload = emptyPayload({
      items: [makeItem('item-99', 'Eggs')],
      vendors: [makeVendor('vendor-99', 'Trader Joes')],
    })

    const summary = detectConflicts(payload, existing)

    // Then no conflicts are found
    expect(hasConflicts(summary)).toBe(false)
    expect(summary.items).toHaveLength(0)
    expect(summary.vendors).toHaveLength(0)
  })
})

describe('hasConflicts', () => {
  it('returns false for an empty conflict summary', () => {
    const empty: ConflictSummary = {
      items: [],
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
    }
    expect(hasConflicts(empty)).toBe(false)
  })

  it('returns true when any entity type has a conflict', () => {
    const withConflict: ConflictSummary = {
      items: [{ id: 'item-1', name: 'Milk', matchReasons: ['id'] }],
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
    }
    expect(hasConflicts(withConflict)).toBe(true)
  })
})

describe('partitionPayload', () => {
  const existingItem = makeItem('item-1', 'Milk')
  const newItem = makeItem('item-2', 'Eggs')

  const existing = emptyExisting({ items: [existingItem] })

  const payload = emptyPayload({
    items: [existingItem, newItem],
  })

  it('user can partition payload for skip strategy', () => {
    // Given a payload with one conflicting and one new item
    const conflicts = detectConflicts(payload, existing)

    // When partitioning with skip strategy
    const { toCreate, toUpsert } = partitionPayload(payload, conflicts, 'skip')

    // Then only the new item goes to toCreate; toUpsert is empty
    expect(toCreate.items).toHaveLength(1)
    expect((toCreate.items[0] as { id: string }).id).toBe('item-2')

    expect(toUpsert.items).toHaveLength(0)
  })

  it('user can partition payload for replace strategy', () => {
    // Given a payload with one conflicting and one new item
    const conflicts = detectConflicts(payload, existing)

    // When partitioning with replace strategy
    const { toCreate, toUpsert } = partitionPayload(
      payload,
      conflicts,
      'replace',
    )

    // Then new item goes to toCreate; conflicting item goes to toUpsert
    expect(toCreate.items).toHaveLength(1)
    expect((toCreate.items[0] as { id: string }).id).toBe('item-2')

    expect(toUpsert.items).toHaveLength(1)
    expect((toUpsert.items[0] as { id: string }).id).toBe('item-1')
  })

  it('user can partition payload for clear strategy', () => {
    // Given a payload with one conflicting and one new item
    const conflicts = detectConflicts(payload, existing)

    // When partitioning with clear strategy
    const { toCreate, toUpsert } = partitionPayload(payload, conflicts, 'clear')

    // Then all items go to toCreate (including conflicting ones); toUpsert is empty
    expect(toCreate.items).toHaveLength(2)
    expect(toUpsert.items).toHaveLength(0)
  })
})
