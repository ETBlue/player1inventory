import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import type { ExportPayload } from './exportData'
import {
  type ConflictSummary,
  detectConflicts,
  type ExistingData,
  hasConflicts,
  type ImportSession,
  importCloudData,
  importLocalData,
  partitionPayload,
  toCartItemInput,
  toInventoryLogInput,
  toItemInput,
  toRecipeInput,
  toShoppingCartInput,
  toTagInput,
  toTagTypeInput,
  toVendorInput,
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

function makeShoppingCart(
  id: string,
  status: 'active' | 'completed' | 'abandoned' = 'active',
) {
  return {
    id,
    status,
    createdAt: new Date(),
  }
}

function makeCartItem(id: string, cartId = 'cart-1', itemId = 'item-1') {
  return {
    id,
    cartId,
    itemId,
    quantity: 1,
  }
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
    })

    // When importing a payload whose IDs all match existing entities
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Different Name')],
      tags: [makeTag('tag-1', 'Different Tag')],
      tagTypes: [makeTagType('type-1', 'Different Type')],
      vendors: [makeVendor('vendor-1', 'Different Vendor')],
      recipes: [makeRecipe('recipe-1', 'Different Recipe')],
      inventoryLogs: [makeInventoryLog('log-1')],
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

  it('user can detect a conflict when a tag parentId changes', async () => {
    // Given an existing tag without a parent
    const existing = emptyExisting({
      tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }],
    })

    // When importing a tag with the same id but a new parentId (reparented)
    const payload = emptyPayload({
      tags: [
        { id: 'tag-1', name: 'Dairy', typeId: 'type-1', parentId: 'tag-root' },
      ],
    })

    const summary = detectConflicts(payload, existing)

    // Then the reparented tag is reported as a conflict
    expect(summary.tags).toHaveLength(1)
    expect(summary.tags[0].matchReasons).toContain('id')
  })

  it('user can detect no conflicts when tag parentId is unchanged', async () => {
    // Given an existing tag with a parentId
    const existing = emptyExisting({
      tags: [
        {
          id: 'tag-1',
          name: 'Dairy',
          typeId: 'type-1',
          parentId: 'tag-root',
        },
      ],
    })

    // When importing a tag with the same parentId
    const payload = emptyPayload({
      tags: [
        {
          id: 'tag-new',
          name: 'Fresh',
          typeId: 'type-1',
          parentId: 'tag-root',
        },
      ],
    })

    const summary = detectConflicts(payload, existing)

    // Then no conflict is detected (different id and name)
    expect(summary.tags).toHaveLength(0)
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

async function clearAllTables() {
  await db.cartItems.clear()
  await db.shoppingCarts.clear()
  await db.inventoryLogs.clear()
  await db.tags.clear()
  await db.tagTypes.clear()
  await db.recipes.clear()
  await db.vendors.clear()
  await db.items.clear()
}

describe('importLocalData', () => {
  // Clear before and after each test to ensure a clean state
  // (beforeEach handles any seed data from db.on('populate'))
  beforeEach(clearAllTables)
  afterEach(clearAllTables)

  it('user can import new data with skip strategy (no conflicts)', async () => {
    // Given an empty database and a payload with new items and vendors
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Milk'), makeItem('item-2', 'Eggs')],
      vendors: [makeVendor('vendor-1', 'Costco')],
      tagTypes: [makeTagType('type-1', 'Category')],
      tags: [makeTag('tag-1', 'Dairy', 'type-1')],
    })

    // When importing with skip strategy
    await importLocalData(payload, 'skip')

    // Then all entities are inserted into the database
    const items = await db.items.toArray()
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.id)).toContain('item-1')
    expect(items.map((i) => i.id)).toContain('item-2')

    const vendors = await db.vendors.toArray()
    expect(vendors).toHaveLength(1)
    expect(vendors[0].id).toBe('vendor-1')

    const tagTypes = await db.tagTypes.toArray()
    expect(tagTypes).toHaveLength(1)

    const tags = await db.tags.toArray()
    expect(tags).toHaveLength(1)
  })

  it('user can import and skip conflicting entities', async () => {
    // Given a database with an existing item
    await db.items.add(makeItem('item-1', 'Milk'))

    // And a payload containing the conflicting item and a new item
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Milk'), makeItem('item-2', 'Eggs')],
    })

    // When importing with skip strategy
    await importLocalData(payload, 'skip')

    // Then only the new item is added; the conflicting item is skipped
    const items = await db.items.toArray()
    expect(items).toHaveLength(2) // original item-1 + new item-2
    const ids = items.map((i) => i.id)
    expect(ids).toContain('item-1')
    expect(ids).toContain('item-2')

    // The existing item-1 data is unchanged (name is still 'Milk')
    const existing = await db.items.get('item-1')
    expect(existing?.name).toBe('Milk')
  })

  it('user can import and replace conflicting entities', async () => {
    // Given a database with an existing item named 'Milk'
    await db.items.add(makeItem('item-1', 'Milk'))

    // And a payload with the same ID but a different name
    const updatedItem = { ...makeItem('item-1', 'Whole Milk') }
    const payload = emptyPayload({
      items: [updatedItem, makeItem('item-2', 'Eggs')],
    })

    // When importing with replace strategy
    await importLocalData(payload, 'replace')

    // Then the conflicting item is replaced and the new item is added
    const items = await db.items.toArray()
    expect(items).toHaveLength(2)

    const replaced = await db.items.get('item-1')
    expect(replaced?.name).toBe('Whole Milk')

    const added = await db.items.get('item-2')
    expect(added?.name).toBe('Eggs')
  })

  it('user can clear all data and import fresh', async () => {
    // Given a database with existing data
    await db.items.add(makeItem('item-old', 'OldItem'))
    await db.vendors.add(makeVendor('vendor-old', 'OldVendor'))

    // And a payload with completely different data
    const payload = emptyPayload({
      items: [makeItem('item-new', 'NewItem')],
      vendors: [makeVendor('vendor-new', 'NewVendor')],
    })

    // When importing with clear strategy
    await importLocalData(payload, 'clear')

    // Then old data is gone and only new data exists
    const items = await db.items.toArray()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('item-new')
    expect(items[0].name).toBe('NewItem')

    const vendors = await db.vendors.toArray()
    expect(vendors).toHaveLength(1)
    expect(vendors[0].id).toBe('vendor-new')

    // Old data is removed
    const oldItem = await db.items.get('item-old')
    expect(oldItem).toBeUndefined()
  })

  it('user can import active shopping cart and cart items', async () => {
    // Given a payload with an active shopping cart and its cart items
    const cart = makeShoppingCart('cart-1', 'active')
    const cartItem = makeCartItem('ci-1', 'cart-1', 'item-1')
    const payload = emptyPayload({
      shoppingCarts: [cart],
      cartItems: [cartItem],
    })

    // When importing with skip strategy
    await importLocalData(payload, 'skip')

    // Then the shopping cart and its items are stored
    const carts = await db.shoppingCarts.toArray()
    expect(carts).toHaveLength(1)
    expect(carts[0].id).toBe('cart-1')
    expect(carts[0].status).toBe('active')

    const cartItems = await db.cartItems.toArray()
    expect(cartItems).toHaveLength(1)
    expect(cartItems[0].id).toBe('ci-1')
    expect(cartItems[0].cartId).toBe('cart-1')
  })

  it('user can import item with dueDate as ISO string — stored as Date', async () => {
    // Given a payload where dueDate is an ISO string (as produced by JSON.parse)
    const item = {
      ...makeItem('item-1', 'Milk'),
      dueDate: new Date('2026-06-01T00:00:00.000Z'),
    }
    const payload = emptyPayload({ items: [item] })

    // When importing
    await importLocalData(payload, 'skip')

    // Then dueDate is stored as a Date object, not a string
    const stored = await db.items.get('item-1')
    expect(stored?.dueDate).toBeInstanceOf(Date)
    expect(stored?.dueDate?.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })

  it('user can import item with dueDate: null — stored as undefined, not epoch', async () => {
    // Given a payload where dueDate is null (as produced by JSON.parse of an exported item)
    const item = {
      ...makeItem('item-null-due', 'Butter'),
      dueDate: null as unknown as Date,
    }
    const payload = emptyPayload({ items: [item] })

    // When importing
    await importLocalData(payload, 'skip')

    // Then dueDate is undefined, not the Unix epoch date
    const stored = await db.items.get('item-null-due')
    expect(stored?.dueDate).toBeUndefined()
  })

  it('user can import item with estimatedDueDays: null — stored as undefined', async () => {
    // Given a payload where estimatedDueDays is null (as produced by JSON.parse)
    const item = {
      ...makeItem('item-null-days', 'Cheese'),
      estimatedDueDays: null as unknown as number,
    }
    const payload = emptyPayload({ items: [item] })

    // When importing
    await importLocalData(payload, 'skip')

    // Then estimatedDueDays is undefined
    const stored = await db.items.get('item-null-days')
    expect(stored?.estimatedDueDays).toBeUndefined()
  })

  it('user can import item with expirationThreshold: null — stored as undefined', async () => {
    // Given a payload where expirationThreshold is null (as produced by JSON.parse)
    const item = {
      ...makeItem('item-null-threshold', 'Yogurt'),
      expirationThreshold: null as unknown as number,
    }
    const payload = emptyPayload({ items: [item] })

    // When importing
    await importLocalData(payload, 'skip')

    // Then expirationThreshold is undefined
    const stored = await db.items.get('item-null-threshold')
    expect(stored?.expirationThreshold).toBeUndefined()
  })

  it('user can import tags with parentId — stored with correct parentId', async () => {
    // Given a payload containing a parent tag and a child tag with parentId
    const payload = emptyPayload({
      tagTypes: [makeTagType('type-1', 'Category')],
      tags: [
        { id: 'tag-parent', name: 'Dairy', typeId: 'type-1' },
        {
          id: 'tag-child',
          name: 'Whole Milk',
          typeId: 'type-1',
          parentId: 'tag-parent',
        },
      ],
    })

    // When importing
    await importLocalData(payload, 'skip')

    // Then both tags are stored and the child has the correct parentId
    const tags = await db.tags.toArray()
    expect(tags).toHaveLength(2)

    const child = await db.tags.get('tag-child')
    expect(child?.parentId).toBe('tag-parent')

    const parent = await db.tags.get('tag-parent')
    expect(parent?.parentId).toBeUndefined()
  })

  it('user can import tags without parentId (backwards-compatible with old exports)', async () => {
    // Given a payload from an old export that does not include parentId
    const tagWithoutParentId = {
      id: 'tag-old',
      name: 'Organic',
      typeId: 'type-1',
    }
    const payload = emptyPayload({
      tagTypes: [makeTagType('type-1', 'Category')],
      tags: [tagWithoutParentId],
    })

    // When importing
    await importLocalData(payload, 'skip')

    // Then the tag is stored without error and parentId is undefined
    const stored = await db.tags.get('tag-old')
    expect(stored).toBeDefined()
    expect(stored?.parentId).toBeUndefined()
  })

  it('user can import inventory log with occurredAt as ISO string — stored as Date', async () => {
    // Given a payload where occurredAt is an ISO string (as produced by JSON.parse)
    const log = {
      ...makeInventoryLog('log-1'),
      occurredAt: new Date('2026-03-01T12:00:00.000Z'),
    }
    const payload = emptyPayload({ inventoryLogs: [log] })

    // When importing
    await importLocalData(payload, 'skip')

    // Then occurredAt is stored as a Date object, not a string
    const stored = await db.inventoryLogs.get('log-1')
    expect(stored?.occurredAt).toBeInstanceOf(Date)
    expect(stored?.occurredAt?.toISOString()).toBe('2026-03-01T12:00:00.000Z')
  })
})

describe('cloud import input mappers — strip server-only fields', () => {
  it('toItemInput strips __typename, userId, familyId from a raw Apollo item', () => {
    // Given a raw item object as returned by Apollo (with extra server-only fields)
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

    // When mapped to ItemInput
    const result = toItemInput(rawItem)

    // Then server-only and Apollo fields are absent
    expect(result).not.toHaveProperty('__typename')
    expect(result).not.toHaveProperty('userId')
    expect(result).not.toHaveProperty('familyId')

    // And the valid ItemInput fields are present
    expect(result.id).toBe('item-1')
    expect(result.name).toBe('Apple')
    expect(result.createdAt).toBe('2026-03-22T22:44:46.927Z')
  })

  it('toItemInput converts Date createdAt/updatedAt to ISO strings', () => {
    // Given an item with Date objects (as produced by local export)
    const date = new Date('2026-01-15T10:00:00.000Z')
    const rawItem = {
      id: 'item-2',
      name: 'Banana',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: date,
      updatedAt: date,
    }

    // When mapped to ItemInput
    const result = toItemInput(rawItem)

    // Then dates are ISO strings
    expect(result.createdAt).toBe('2026-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2026-01-15T10:00:00.000Z')
  })

  it('toTagInput strips server-only fields', () => {
    const rawTag = {
      __typename: 'Tag',
      id: 'tag-1',
      name: 'Dairy',
      typeId: 'type-1',
      userId: 'u1',
      familyId: 'f1',
    }
    const result = toTagInput(rawTag)
    expect(result).not.toHaveProperty('__typename')
    expect(result).not.toHaveProperty('userId')
    expect(result).not.toHaveProperty('familyId')
    expect(result.id).toBe('tag-1')
    expect(result.name).toBe('Dairy')
    expect(result.typeId).toBe('type-1')
  })

  it('toTagInput preserves parentId when present', () => {
    // Given a tag with a parentId (nested tag)
    const rawTag = {
      __typename: 'Tag',
      id: 'tag-child',
      name: 'Whole Milk',
      typeId: 'type-1',
      parentId: 'tag-parent',
      userId: 'u1',
    }

    // When mapped to TagInput
    const result = toTagInput(rawTag)

    // Then parentId is included in the output
    expect(result.parentId).toBe('tag-parent')
    expect(result).not.toHaveProperty('__typename')
    expect(result).not.toHaveProperty('userId')
  })

  it('toTagInput sets parentId to undefined when absent (backwards compatible)', () => {
    // Given a tag without parentId (old export format)
    const rawTag = {
      id: 'tag-1',
      name: 'Dairy',
      typeId: 'type-1',
    }

    // When mapped to TagInput
    const result = toTagInput(rawTag)

    // Then parentId is undefined — no error
    expect(result.parentId).toBeUndefined()
  })

  it('toTagTypeInput strips server-only fields', () => {
    const rawTagType = {
      __typename: 'TagType',
      id: 'type-1',
      name: 'Category',
      color: 'blue',
      userId: 'u1',
    }
    const result = toTagTypeInput(rawTagType)
    expect(result).not.toHaveProperty('__typename')
    expect(result).not.toHaveProperty('userId')
    expect(result.id).toBe('type-1')
    expect(result.color).toBe('blue')
  })

  it('toVendorInput strips server-only fields', () => {
    const rawVendor = {
      __typename: 'Vendor',
      id: 'vendor-1',
      name: 'Costco',
      userId: 'u1',
      familyId: 'f1',
    }
    const result = toVendorInput(rawVendor)
    expect(result).not.toHaveProperty('__typename')
    expect(result).not.toHaveProperty('userId')
    expect(result).not.toHaveProperty('familyId')
    expect(result.id).toBe('vendor-1')
    expect(result.name).toBe('Costco')
  })

  it('toRecipeInput strips server-only fields', () => {
    const rawRecipe = {
      __typename: 'Recipe',
      id: 'recipe-1',
      name: 'Smoothie',
      items: [],
      lastCookedAt: null,
      userId: 'u1',
    }
    const result = toRecipeInput(rawRecipe)
    expect(result).not.toHaveProperty('__typename')
    expect(result).not.toHaveProperty('userId')
    expect(result.id).toBe('recipe-1')
    expect(result.name).toBe('Smoothie')
  })

  it('toInventoryLogInput strips server-only fields and converts Date occurredAt', () => {
    const date = new Date('2026-02-10T08:00:00.000Z')
    const rawLog = {
      __typename: 'InventoryLog',
      id: 'log-1',
      itemId: 'item-1',
      delta: 1,
      quantity: 2,
      occurredAt: date,
      note: null,
      userId: 'u1',
    }
    const result = toInventoryLogInput(rawLog)
    expect(result).not.toHaveProperty('__typename')
    expect(result).not.toHaveProperty('userId')
    expect(result.occurredAt).toBe('2026-02-10T08:00:00.000Z')
  })

  it('toShoppingCartInput strips server-only fields and converts Date createdAt', () => {
    const date = new Date('2026-03-01T10:00:00.000Z')
    const rawCart = {
      __typename: 'Cart',
      id: 'cart-1',
      status: 'active',
      createdAt: date,
      completedAt: null,
      userId: 'u1',
      familyId: 'f1',
    }
    const result = toShoppingCartInput(rawCart)
    expect(result).not.toHaveProperty('__typename')
    expect(result).not.toHaveProperty('userId')
    expect(result).not.toHaveProperty('familyId')
    expect(result.id).toBe('cart-1')
    expect(result.status).toBe('active')
    expect(result.createdAt).toBe('2026-03-01T10:00:00.000Z')
  })

  it('toCartItemInput strips server-only fields', () => {
    const rawCartItem = {
      __typename: 'CartItem',
      id: 'ci-1',
      cartId: 'cart-1',
      itemId: 'item-1',
      quantity: 3,
      userId: 'u1',
    }
    const result = toCartItemInput(rawCartItem)
    expect(result).not.toHaveProperty('__typename')
    expect(result).not.toHaveProperty('userId')
    expect(result.id).toBe('ci-1')
    expect(result.cartId).toBe('cart-1')
    expect(result.itemId).toBe('item-1')
    expect(result.quantity).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// importCloudData — batched cloud import
// ---------------------------------------------------------------------------

describe('importCloudData — batched cloud import', () => {
  function makeMockClient(mutateFn = vi.fn().mockResolvedValue({})) {
    return {
      mutate: mutateFn,
      resetStore: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({
        data: {
          items: [],
          tags: [],
          tagTypes: [],
          vendors: [],
          recipes: [],
          inventoryLogs: [],
          shoppingCarts: [],
          allCartItems: [],
        },
      }),
    }
  }

  // Build a payload with enough items to span multiple batches (batch size = 50)
  function makePayloadWithItems(count: number): ExportPayload {
    return emptyPayload({
      items: Array.from({ length: count }, (_, i) =>
        makeItem(`item-${i}`, `Item ${i}`),
      ),
    })
  }

  it('onProgress is called for each batch', async () => {
    // Given a payload with 60 items (2 batches) and a succeeding Apollo client
    const payload = makePayloadWithItems(60)
    const client = makeMockClient()
    const progressCalls: Array<{
      completedBatches: number
      totalBatches: number
    }> = []

    // When importing with skip strategy
    await importCloudData(payload, 'skip', client as never, {
      onProgress: (p) => progressCalls.push(p),
    })

    // Then onProgress is called: once at start (0/2) + once per batch (1/2, 2/2)
    // Total batches = 2 (items only — all other entity arrays are empty → 0 batches each)
    expect(progressCalls[0]).toMatchObject({
      completedBatches: 0,
      totalBatches: 2,
    })
    // Each completed batch increments completedBatches
    const completedValues = progressCalls
      .slice(1)
      .map((p) => p.completedBatches)
    expect(completedValues).toEqual([1, 2])
    expect(progressCalls[progressCalls.length - 1].completedBatches).toBe(
      progressCalls[progressCalls.length - 1].totalBatches,
    )
  })

  it('skips already-completed batches on retry', async () => {
    // Given a payload with 60 items (2 batches of 50/10)
    const payload = makePayloadWithItems(60)
    const client = makeMockClient()

    // And a session where batch 0 (items:0) is already complete
    const session: ImportSession = {
      payload,
      strategy: 'skip',
      completedBatchKeys: new Set(['items:0']),
    }

    // When retrying the import
    await importCloudData(payload, 'skip', client as never, { session })

    // Then Apollo mutate is only called once (for batch 1 = the second 10 items)
    // Not for batch 0 which is already done
    const mutateCalls = (client.mutate as ReturnType<typeof vi.fn>).mock.calls
    expect(mutateCalls).toHaveLength(1)

    // Verify the single call contains the second batch (10 items)
    const variables = mutateCalls[0][0].variables as { items: unknown[] }
    expect(variables.items).toHaveLength(10)
  })

  it('throws with session attached when a batch fails', async () => {
    // Given a payload with 110 items (3 batches: 50, 50, 10)
    const payload = makePayloadWithItems(110)

    // And a client that fails on the second mutate call (batch index 1)
    let callCount = 0
    const mutateFn = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return Promise.reject(new Error('Network error'))
      }
      return Promise.resolve({})
    })
    const client = makeMockClient(mutateFn)

    // When importing
    let caughtError: (Error & { session?: ImportSession }) | null = null
    try {
      await importCloudData(payload, 'skip', client as never)
    } catch (err) {
      caughtError = err as Error & { session?: ImportSession }
    }

    // Then an error is thrown with a session attached
    expect(caughtError).not.toBeNull()
    expect(caughtError?.session).toBeDefined()

    // And the session records batch 0 as completed but not batch 1
    const completedKeys = caughtError?.session?.completedBatchKeys
    expect(completedKeys?.has('items:0')).toBe(true)
    expect(completedKeys?.has('items:1')).toBe(false)
  })
})
