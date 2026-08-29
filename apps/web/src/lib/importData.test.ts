import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { addItemToLocation, getStockedItems } from '@/db/operations'
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
  resolveFlattenLocationId,
  toCartItemInput,
  toInventoryLogInput,
  toItemInput,
  toRecipeInput,
  toShelfInput,
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

// The CURRENT (post-v15) payload shape: `itemStocks` and `locations` are
// present, empty or not. They are optional on `ExportPayload`, and omitting
// them here made every default test payload legacy-shaped — `itemStocks ===
// undefined` is exactly what `upgradeLegacyPayload` reads as "pre-v15", so no
// test that used the default ever reached the v15 branch. That is the
// structural reason unit coverage missed a real data-loss bug on PR D. Use
// `legacyPayload()` below when a test wants the pre-v15 shape on purpose.
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
    shelves: [],
    itemStocks: [],
    locations: [],
    ...overrides,
  }
}

// A pre-v15 backup (or a cloud export): no `itemStocks` key at all. Items carry
// their stock inline and cart ids are bare (`vendorId | 'no-vendor'`), so the
// import side must split the stock out and re-key the carts. The absent
// `itemStocks` key is the ONLY thing that marks a payload legacy —
// `upgradeLegacyPayload` branches on nothing else — so that is what this drops.
// `locations` goes too unless the caller asks for it explicitly (a real pre-v15
// backup has neither; a cloud-down copy may still target a known location).
function legacyPayload(overrides: Partial<ExportPayload> = {}): ExportPayload {
  const { itemStocks, locations, ...rest } = emptyPayload(overrides)
  void itemStocks
  return 'locations' in overrides ? { ...rest, locations } : rest
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
    shelves: [],
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
      shelves: [],
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
      shelves: [],
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

  // The v15-only tables are in no conflict set, so partitioning must carry them
  // through untouched on every strategy. Nothing else asserts this: they were
  // absent from the default payload helper until now, so an implementation that
  // rebuilt `toCreate` table-by-table instead of spreading would have silently
  // dropped every stock row and location — items would import stockless and the
  // pantry would render empty.
  it.each([
    'skip',
    'replace',
    'clear',
  ] as const)('user importing a v15 backup with %s keeps its itemStocks and locations', (strategy) => {
    // Given a v15 payload carrying stock rows and locations
    const v15Payload = emptyPayload({
      items: [existingItem, newItem],
      itemStocks: [
        { id: 'stock-1', itemId: 'item-1', locationId: 'local' },
        { id: 'stock-2', itemId: 'item-2', locationId: 'office' },
      ],
      locations: [{ id: 'office', name: 'Office', order: 1 }],
    })

    // When partitioning it
    const { toCreate } = partitionPayload(
      v15Payload,
      detectConflicts(v15Payload, existing),
      strategy,
    )

    // Then both v15 tables survive intact
    expect(toCreate.itemStocks).toHaveLength(2)
    expect((toCreate.itemStocks as Array<{ id: string }>).map((s) => s.id)) //
      .toEqual(['stock-1', 'stock-2'])
    expect(toCreate.locations).toHaveLength(1)
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
  await db.itemStocks.clear()
  await db.locations.clear()
  await db.shelves.clear()
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

  it('user can import permanent carts over a bootstrapped cart without throwing', async () => {
    // Given the app has already bootstrapped the location's 'no-vendor' cart
    await db.shoppingCarts.put({ id: 'local:no-vendor' })

    // And a backup whose cart carries legacy status/createdAt fields and reuses
    // the same sentinel id (this collided on the old bulkAdd → ConstraintError,
    // aborting the whole import)
    const payload = legacyPayload({
      items: [makeItem('item-1', 'Milk')],
      shoppingCarts: [makeShoppingCart('no-vendor')],
      cartItems: [makeCartItem('ci-1', 'no-vendor', 'item-1')],
    })

    // When importing — must not throw and must drop the legacy fields
    await importLocalData(payload, 'skip')

    // Then the cart persists in the v13+ schema shape (id only, no status/createdAt),
    // re-keyed onto the default location so it merges with the bootstrapped cart
    const carts = await db.shoppingCarts.toArray()
    expect(carts).toHaveLength(1)
    expect(carts[0].id).toBe('local:no-vendor')
    expect('status' in carts[0]).toBe(false)
    expect('createdAt' in carts[0]).toBe(false)

    // And the cart item is imported
    const cartItems = await db.cartItems.toArray()
    expect(cartItems.map((c) => c.id)).toContain('ci-1')
  })

  it('user can import a cart whose lastPurchasedAt is epoch millis', async () => {
    // Given a backup exported from cloud while `Cart.lastPurchasedAt` shipped as
    // epoch millis — the digit-string form, not ISO 8601
    const payload = legacyPayload({
      items: [makeItem('item-1', 'Milk')],
      shoppingCarts: [
        { ...makeShoppingCart('no-vendor'), lastPurchasedAt: '1787827334343' },
      ],
      cartItems: [],
    })

    // When importing
    await importLocalData(payload, 'skip')

    // Then lastPurchasedAt lands as a valid Date, not an Invalid Date
    const carts = await db.shoppingCarts.toArray()
    expect(carts).toHaveLength(1)
    expect(carts[0].lastPurchasedAt).toBeInstanceOf(Date)
    expect(Number.isNaN((carts[0].lastPurchasedAt as Date).getTime())).toBe(
      false,
    )
    expect((carts[0].lastPurchasedAt as Date).getTime()).toBe(1787827334343)
  })

  it('user can import a cloud-exported recipe that carries no timestamps', async () => {
    // Given a backup exported from cloud: `Recipe { id, name, items,
    // lastCookedAt, userId }` — the cloud schema has no createdAt/updatedAt, so
    // the export simply has no such keys
    const payload = legacyPayload({
      items: [makeItem('item-1', 'Milk')],
      recipes: [
        {
          id: 'recipe-1',
          name: 'Pasta',
          items: [],
          userId: 'user-1',
          lastCookedAt: null,
        },
      ],
    })

    // When importing into local mode
    await importLocalData(payload, 'skip')

    // Then the recipe lands in Dexie with valid Dates, not Invalid Dates —
    // createdAt/updatedAt are unindexed on the `recipes` store, so IndexedDB
    // would have accepted NaN timestamps silently
    const recipes = await db.recipes.toArray()
    expect(recipes).toHaveLength(1)
    expect(recipes[0].createdAt).toBeInstanceOf(Date)
    expect(Number.isNaN(recipes[0].createdAt.getTime())).toBe(false)
    expect(recipes[0].updatedAt).toBeInstanceOf(Date)
    expect(Number.isNaN(recipes[0].updatedAt.getTime())).toBe(false)
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

  it('user can import a shopping cart and its cart items (drops legacy status)', async () => {
    // Given a backup whose cart still carries the legacy status/createdAt fields
    const cart = makeShoppingCart('cart-1', 'active')
    const cartItem = makeCartItem('ci-1', 'cart-1', 'item-1')
    const payload = legacyPayload({
      shoppingCarts: [cart],
      cartItems: [cartItem],
    })

    // When importing with skip strategy
    await importLocalData(payload, 'skip')

    // Then the shopping cart and its items are stored in the v13+ shape,
    // re-keyed onto the default location (v15 carts are per location × vendor).
    // The import also bootstraps the location's sentinel carts, so the imported
    // one is looked up by id rather than by being the only row.
    const imported = await db.shoppingCarts.get('local:cart-1')
    expect(imported).toBeDefined()
    // Permanent carts (v13+) have no status — the import drops legacy fields.
    expect('status' in (imported as object)).toBe(false)

    const cartItems = await db.cartItems.toArray()
    expect(cartItems).toHaveLength(1)
    expect(cartItems[0].id).toBe('ci-1')
    expect(cartItems[0].cartId).toBe('local:cart-1')
  })

  // Expiration fields moved onto ItemStock in v15, so a legacy payload's inline
  // values are asserted on the synthesised 'local' stock row.
  async function localStockOf(itemId: string) {
    return db.itemStocks
      .where('[itemId+locationId]')
      .equals([itemId, 'local'])
      .first()
  }

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
    const stored = await localStockOf('item-1')
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
    const stored = await localStockOf('item-null-due')
    expect(stored).toBeDefined()
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
    const stored = await localStockOf('item-null-days')
    expect(stored).toBeDefined()
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
    const stored = await localStockOf('item-null-threshold')
    expect(stored).toBeDefined()
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

  it('user can import recipe with lastCookedAt as ISO string (clear) — stored as Date', async () => {
    // Given a payload where lastCookedAt is an ISO string (as produced by JSON.parse on a backup)
    const recipe = {
      id: 'recipe-cooked',
      name: 'Soup',
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z' as unknown as Date,
      updatedAt: '2026-01-15T00:00:00.000Z' as unknown as Date,
      lastCookedAt: '2026-03-10T08:00:00.000Z' as unknown as Date,
    }
    const payload = emptyPayload({ recipes: [recipe] })

    // When importing with clear strategy (the simplest path)
    await importLocalData(payload, 'clear')

    // Then lastCookedAt is stored as a Date instance, not a string
    const stored = await db.recipes.get('recipe-cooked')
    expect(stored?.lastCookedAt).toBeInstanceOf(Date)
    expect((stored?.lastCookedAt as Date).toISOString()).toBe(
      '2026-03-10T08:00:00.000Z',
    )
  })

  it('user can import recipe with lastCookedAt as ISO string (skip) — stored as Date', async () => {
    // Given a payload where lastCookedAt is an ISO string
    const recipe = {
      id: 'recipe-skip',
      name: 'Stew',
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z' as unknown as Date,
      updatedAt: '2026-01-15T00:00:00.000Z' as unknown as Date,
      lastCookedAt: '2026-04-05T10:00:00.000Z' as unknown as Date,
    }
    const payload = emptyPayload({ recipes: [recipe] })

    // When importing with skip strategy
    await importLocalData(payload, 'skip')

    // Then lastCookedAt is stored as a Date instance
    const stored = await db.recipes.get('recipe-skip')
    expect(stored?.lastCookedAt).toBeInstanceOf(Date)
    expect((stored?.lastCookedAt as Date).toISOString()).toBe(
      '2026-04-05T10:00:00.000Z',
    )
  })

  it('user can import recipe with lastCookedAt as ISO string (replace) — stored as Date', async () => {
    // Given an existing recipe that will be upserted (replace strategy, conflict by id)
    const existingRecipe = {
      id: 'recipe-replace',
      name: 'Pasta',
      items: [],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }
    await db.recipes.add(existingRecipe)

    // And a payload with the same recipe id but lastCookedAt as an ISO string
    const recipe = {
      id: 'recipe-replace',
      name: 'Pasta Updated',
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z' as unknown as Date,
      updatedAt: '2026-02-01T00:00:00.000Z' as unknown as Date,
      lastCookedAt: '2026-05-01T09:00:00.000Z' as unknown as Date,
    }
    const payload = emptyPayload({ recipes: [recipe] })

    // When importing with replace strategy (triggers bulkPut for the conflicting recipe)
    await importLocalData(payload, 'replace')

    // Then lastCookedAt is stored as a Date instance
    const stored = await db.recipes.get('recipe-replace')
    expect(stored?.lastCookedAt).toBeInstanceOf(Date)
    expect((stored?.lastCookedAt as Date).toISOString()).toBe(
      '2026-05-01T09:00:00.000Z',
    )
  })
})

describe('importLocalData — item stock and locations (v15 split)', () => {
  beforeEach(clearAllTables)
  afterEach(clearAllTables)

  // A post-v15 item row: identity only, no stock fields.
  function makeSplitItem(id: string, name: string) {
    return {
      id,
      name,
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  function makeStock(
    id: string,
    itemId: string,
    locationId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      itemId,
      locationId,
      targetUnit: 'package' as const,
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }
  }

  function makeLocation(id: string, name: string, order = 0) {
    return { id, name, order, createdAt: new Date(), updatedAt: new Date() }
  }

  it('user can restore a v15 backup and see the pantry populated', async () => {
    // Given a v15 backup carrying locations and per-location stock
    const payload = emptyPayload({
      items: [makeSplitItem('item-1', 'Milk')],
      itemStocks: [
        makeStock('stock-home', 'item-1', 'local'),
        makeStock('stock-office', 'item-1', 'office', { packedQuantity: 1 }),
      ],
      locations: [
        makeLocation('local', 'My Home', 0),
        makeLocation('office', 'Office', 1),
      ],
    })

    // When restoring it
    await importLocalData(payload, 'clear')

    // Then both locations and both stock rows are restored
    expect((await db.locations.toArray()).map((l) => l.id)).toEqual(
      expect.arrayContaining(['local', 'office']),
    )
    expect(await db.itemStocks.count()).toBe(2)

    // And the pantry (stocked items in the active location) is populated
    const stocked = await getStockedItems('local')
    expect(stocked).toHaveLength(1)
    expect(stocked[0].packedQuantity).toBe(3)
  })

  // A v15 export carries the eight configuration fields on the STOCK rows.
  // Import must apply the same collapse rule the v16 Dexie upgrade does.
  it('user can restore a v15 backup — per-location settings collapse onto the item', async () => {
    // Given a v15 backup whose stock rows disagree about the configuration
    const payload = emptyPayload({
      items: [makeSplitItem('item-1', 'Milk')],
      itemStocks: [
        makeStock('stock-office', 'item-1', 'office', {
          packageUnit: 'carton',
          consumeAmount: 5,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
        }),
        makeStock('stock-home', 'item-1', 'local', {
          packageUnit: 'bottle',
          measurementUnit: 'ml',
          amountPerPackage: 1000,
          targetUnit: 'measurement',
          consumeAmount: 250,
          expirationMode: 'days from purchase',
          estimatedDueDays: 7,
          expirationThreshold: 2,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ],
      locations: [
        makeLocation('local', 'My Home', 0),
        makeLocation('office', 'Office', 1),
      ],
    })

    // When restoring it
    await importLocalData(payload, 'clear')

    // Then the default location's settings win, on the global item
    expect(await db.items.get('item-1')).toMatchObject({
      packageUnit: 'bottle',
      measurementUnit: 'ml',
      amountPerPackage: 1000,
      targetUnit: 'measurement',
      consumeAmount: 250,
      expirationMode: 'days from purchase',
      estimatedDueDays: 7,
      expirationThreshold: 2,
    })

    // And no stock row carries configuration any more
    for (const stock of await db.itemStocks.toArray()) {
      expect(stock).not.toHaveProperty('packageUnit')
      expect(stock).not.toHaveProperty('consumeAmount')
      expect(stock).not.toHaveProperty('targetUnit')
    }
  })

  it('user can restore a v15 backup of an item stocked nowhere near home — the oldest row wins', async () => {
    // Given a v15 backup whose item is not stocked at the default location
    const payload = emptyPayload({
      items: [makeSplitItem('item-1', 'Flour')],
      itemStocks: [
        makeStock('stock-b', 'item-1', 'office', {
          packageUnit: 'newer-bag',
          createdAt: new Date('2026-05-05T00:00:00.000Z'),
        }),
        makeStock('stock-a', 'item-1', 'cabin', {
          packageUnit: 'oldest-sack',
          createdAt: new Date('2025-05-05T00:00:00.000Z'),
        }),
      ],
      locations: [
        makeLocation('local', 'My Home', 0),
        makeLocation('cabin', 'Cabin', 1),
        makeLocation('office', 'Office', 2),
      ],
    })

    // When restoring it
    await importLocalData(payload, 'clear')

    // Then the oldest stock row's settings win
    expect(await db.items.get('item-1')).toMatchObject({
      packageUnit: 'oldest-sack',
    })
  })

  it('user can restore a v16 backup unchanged — settings already on the item stay put', async () => {
    // Given a v16 backup: configuration on the item, state on the stock rows
    const payload = emptyPayload({
      items: [
        {
          ...makeSplitItem('item-1', 'Sugar'),
          packageUnit: 'jar',
          targetUnit: 'measurement',
          measurementUnit: 'g',
          amountPerPackage: 750,
          consumeAmount: 25,
        },
      ],
      itemStocks: [
        {
          id: 'stock-home',
          itemId: 'item-1',
          locationId: 'local',
          targetQuantity: 4,
          refillThreshold: 1,
          packedQuantity: 3,
          unpackedQuantity: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      locations: [makeLocation('local', 'My Home', 0)],
    })

    // When restoring it
    await importLocalData(payload, 'clear')

    // Then nothing was collapsed away or defaulted over
    expect(await db.items.get('item-1')).toMatchObject({
      packageUnit: 'jar',
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: 750,
      consumeAmount: 25,
    })
    expect((await db.itemStocks.get('stock-home'))?.packedQuantity).toBe(3)
  })

  it('user can restore a legacy (pre-v15) backup — inline stock becomes local stock', async () => {
    // Given a pre-v15 backup whose stock fields still live on the item
    const legacyItem = {
      ...makeItem('item-1', 'Milk'),
      packedQuantity: 7,
      targetQuantity: 9,
      packageUnit: 'bottle',
      dueDate: new Date('2026-06-01T00:00:00.000Z'),
    }
    const payload = emptyPayload({ items: [legacyItem] })

    // When restoring it
    await importLocalData(payload, 'skip')

    // Then a 'local' ItemStock is synthesised from the inline STATE fields
    const stocks = await db.itemStocks.toArray()
    expect(stocks).toHaveLength(1)
    expect(stocks[0]).toMatchObject({
      itemId: 'item-1',
      locationId: 'local',
      packedQuantity: 7,
      targetQuantity: 9,
    })
    expect(stocks[0]?.dueDate).toBeInstanceOf(Date)
    // …while the configuration stays on the global item
    expect(stocks[0]).not.toHaveProperty('packageUnit')
    expect(await db.items.get('item-1')).toMatchObject({
      packageUnit: 'bottle',
    })

    // And the pantry is populated, while the item row no longer carries stock
    const stocked = await getStockedItems('local')
    expect(stocked).toHaveLength(1)
    expect(stocked[0].packedQuantity).toBe(7)
    const itemRow = (await db.items.get('item-1')) as Record<string, unknown>
    expect(itemRow.packedQuantity).toBeUndefined()
  })

  it('user can restore a legacy backup — cart ids gain the location prefix', async () => {
    // Given a pre-v15 backup whose cart ids are bare vendor ids / 'no-vendor'
    const payload = legacyPayload({
      items: [makeItem('item-1', 'Milk')],
      vendors: [makeVendor('vendor-1', 'Costco')],
      shoppingCarts: [
        makeShoppingCart('no-vendor'),
        makeShoppingCart('vendor-1'),
      ],
      cartItems: [makeCartItem('ci-1', 'no-vendor', 'item-1')],
    })

    // When restoring it
    await importLocalData(payload, 'skip')

    // Then every cart is re-keyed to `${locationId}:${vendorId|'no-vendor'}`
    const carts = await db.shoppingCarts.toArray()
    expect(carts.map((c) => c.id).sort()).toEqual([
      'local:no-vendor',
      'local:vendor-1',
    ])

    // And its cart items follow the cart
    const cartItems = await db.cartItems.toArray()
    expect(cartItems[0].cartId).toBe('local:no-vendor')
  })

  it('clearing on import removes stale item stock rows', async () => {
    // Given a stale stock row left over from an earlier database
    await db.itemStocks.put(
      makeStock('stale', 'item-1', 'local', { packedQuantity: 99 }),
    )

    // When restoring a backup with the clear strategy
    const payload = emptyPayload({
      items: [makeSplitItem('item-1', 'Milk')],
      itemStocks: [makeStock('stock-1', 'item-1', 'local')],
      locations: [makeLocation('local', 'My Home')],
    })
    await importLocalData(payload, 'clear')

    // Then the stale row is gone — the item is not re-attached to old stock
    const stocks = await db.itemStocks.toArray()
    expect(stocks).toHaveLength(1)
    expect(stocks[0].packedQuantity).toBe(3)
  })

  it('restoring a backup without locations keeps the default location', async () => {
    // Given a legacy backup that carries no locations at all
    const payload = emptyPayload({ items: [makeItem('item-1', 'Milk')] })

    // When restoring with the clear strategy (which empties the tables first)
    await importLocalData(payload, 'clear')

    // Then the undeletable default location still exists
    const locations = await db.locations.toArray()
    expect(locations.map((l) => l.id)).toContain('local')
  })

  it('replacing an item also replaces its stock for the same location', async () => {
    // Given an existing item whose local stock says 9 packs
    await db.items.add(makeSplitItem('item-1', 'Milk') as never)
    await db.itemStocks.put(
      makeStock('stock-existing', 'item-1', 'local', { packedQuantity: 9 }),
    )

    // And a backup with the same item and a different stock row for that pair
    const payload = emptyPayload({
      items: [makeSplitItem('item-1', 'Milk')],
      itemStocks: [
        makeStock('stock-imported', 'item-1', 'local', { packedQuantity: 1 }),
      ],
      locations: [makeLocation('local', 'My Home')],
    })

    // When importing with the replace strategy
    await importLocalData(payload, 'replace')

    // Then the pair keeps exactly one stock row, carrying the imported values
    const stocks = await db.itemStocks
      .where('[itemId+locationId]')
      .equals(['item-1', 'local'])
      .toArray()
    expect(stocks).toHaveLength(1)
    expect(stocks[0].packedQuantity).toBe(1)
  })

  it('skipping a conflicting item leaves its existing stock untouched', async () => {
    // Given an existing item whose local stock says 9 packs
    await db.items.add(makeSplitItem('item-1', 'Milk') as never)
    await db.itemStocks.put(
      makeStock('stock-existing', 'item-1', 'local', { packedQuantity: 9 }),
    )

    // And a backup with the same item id and a different stock value
    const payload = emptyPayload({
      items: [makeSplitItem('item-1', 'Milk')],
      itemStocks: [
        makeStock('stock-imported', 'item-1', 'local', { packedQuantity: 1 }),
      ],
      locations: [makeLocation('local', 'My Home')],
    })

    // When importing with the skip strategy
    await importLocalData(payload, 'skip')

    // Then the existing stock is preserved (the item itself was skipped)
    const stocks = await db.itemStocks
      .where('[itemId+locationId]')
      .equals(['item-1', 'local'])
      .toArray()
    expect(stocks).toHaveLength(1)
    expect(stocks[0].packedQuantity).toBe(9)
  })

  // Copying cloud data down (and importing any pre-v15 backup) must place the
  // restored stock where the user is actually looking — the ACTIVE location —
  // mirroring the outbound local → cloud rule. Landing everything in 'local'
  // while the active location is elsewhere renders an empty pantry.
  it('user copying cloud data down lands stock and carts in the target location', async () => {
    // Given a legacy/cloud payload: stock inline on the item, bare cart ids
    const legacyItem = {
      ...makeItem('item-1', 'Milk'),
      packedQuantity: 5,
      targetQuantity: 6,
    }
    const payload = legacyPayload({
      items: [legacyItem],
      vendors: [makeVendor('vendor-1', 'Costco')],
      shoppingCarts: [makeShoppingCart('vendor-1')],
      cartItems: [makeCartItem('ci-1', 'vendor-1', 'item-1')],
      locations: [makeLocation('office', 'Office', 1)],
    })

    // When importing it with 'office' as the target location
    await importLocalData(payload, 'skip', 'office')

    // Then the synthesised stock lands in 'office', not 'local'
    const stocks = await db.itemStocks.toArray()
    expect(stocks).toHaveLength(1)
    expect(stocks[0].locationId).toBe('office')
    expect(await getStockedItems('office')).toHaveLength(1)
    expect(await getStockedItems('local')).toHaveLength(0)

    // And the carts are re-keyed onto the same location
    const cartIds = (await db.shoppingCarts.toArray()).map((c) => c.id)
    expect(cartIds).toContain('office:vendor-1')
    expect((await db.cartItems.get('ci-1'))?.cartId).toBe('office:vendor-1')
  })

  it('user importing a legacy backup without a target location still lands in local', async () => {
    // Given the same legacy payload and no explicit target location
    const payload = emptyPayload({
      items: [{ ...makeItem('item-1', 'Milk'), packedQuantity: 5 }],
    })

    // When importing it
    await importLocalData(payload, 'skip')

    // Then it defaults to the default location, as before
    const stocks = await db.itemStocks.toArray()
    expect(stocks[0].locationId).toBe('local')
  })

  // An old backup can carry items with no createdAt/updatedAt at all. The
  // synthesised stock row must still get timestamps — `addItemToLocation` sorts
  // candidate source rows by `updatedAt.getTime()` and throws on an absent one.
  // `toShelfInput` already defends the same case with a `new Date()` fallback.
  it('user can stock an item in another location after importing a timestamp-less backup', async () => {
    // Given a very old backup whose item carries no timestamps
    const payload = emptyPayload({
      items: [
        { id: 'item-1', name: 'Milk', tagIds: [], packedQuantity: 2 },
      ] as never,
    })
    await importLocalData(payload, 'skip')

    // Then the synthesised stock still has usable timestamps
    const stocks = await db.itemStocks.toArray()
    expect(stocks[0].updatedAt).toBeInstanceOf(Date)
    expect(stocks[0].createdAt).toBeInstanceOf(Date)

    // When the user stocks it in a new location, copying from one it is not in
    // (so the source has to be picked by the most-recently-updated sort)
    const stock = await addItemToLocation('item-1', 'kitchen', 'office')

    // Then it succeeds instead of throwing
    expect(stock.locationId).toBe('kitchen')
  })

  // `importItemStocks` only removes stale rows for (itemId, locationId) pairs
  // the payload actually mentions, so a destructive 'clear' restore depends on
  // `db.itemStocks.clear()` / `db.locations.clear()` to wipe everything else.
  it('user restoring with clear does not keep stock in a location the backup omits', async () => {
    // Given an item stocked in 'local' on this device
    await db.items.add(makeSplitItem('item-1', 'Milk') as never)
    await db.locations.put(makeLocation('local', 'My Home', 0) as never)
    await db.itemStocks.put(
      makeStock('stock-stale', 'item-1', 'local', { packedQuantity: 9 }),
    )

    // And a backup carrying that same item stocked ONLY in another location
    const payload = emptyPayload({
      items: [makeSplitItem('item-1', 'Milk')],
      itemStocks: [makeStock('stock-office', 'item-1', 'office')],
      locations: [makeLocation('office', 'Office', 0)],
    })

    // When restoring it with the destructive 'clear' strategy
    await importLocalData(payload, 'clear')

    // Then the item is no longer stocked in 'local' — a stale row surviving
    // would re-attach to the restored item and show phantom stock
    const staleStocks = await db.itemStocks
      .where('[itemId+locationId]')
      .equals(['item-1', 'local'])
      .toArray()
    expect(staleStocks).toHaveLength(0)
    expect(await getStockedItems('local')).toHaveLength(0)

    // And the backup's own location still holds the restored stock
    expect(await getStockedItems('office')).toHaveLength(1)
  })

  it('user restoring with clear does not keep a location the backup omits', async () => {
    // Given a location on this device that the backup knows nothing about
    await db.locations.put(makeLocation('attic', 'Attic', 5) as never)

    // And a backup carrying a different location set
    const payload = emptyPayload({
      items: [],
      itemStocks: [],
      locations: [makeLocation('office', 'Office', 0)],
    })

    // When restoring it with the destructive 'clear' strategy
    await importLocalData(payload, 'clear')

    // Then the omitted location is gone (the default location is re-ensured,
    // since it is undeletable)
    const locationIds = (await db.locations.toArray()).map((l) => l.id).sort()
    expect(locationIds).toEqual(['local', 'office'])
  })

  // `fetchLocalPayload` always writes an `itemStocks` key, empty or not. A
  // database whose item rows still carry stock inline therefore exports as
  // `items: [ ...inline stock... ], itemStocks: []` — and a payload-level
  // "itemStocks is present, so this is post-v15" check reads that as nothing to
  // upgrade, drops the stock, and leaves the restored pantry empty (the pantry
  // lists only items that HAVE a stock row). This is the local → local round
  // trip in e2e/tests/settings/import-export-local.spec.ts.
  it('user re-importing an export whose itemStocks table is empty keeps the pantry', async () => {
    // Given a backup that declares an empty itemStocks table while its item
    // still carries the stock inline
    const payload = emptyPayload({
      items: [
        {
          ...makeItem('item-1', 'Milk'),
          packedQuantity: 4,
          targetQuantity: 6,
          packageUnit: 'bottle',
        },
      ],
      itemStocks: [],
      locations: [makeLocation('local', 'My Home', 0)],
    })

    // When restoring it
    await importLocalData(payload, 'clear')

    // Then the inline stock became a 'local' ItemStock and the pantry shows it
    const stocked = await getStockedItems('local')
    expect(stocked).toHaveLength(1)
    expect(stocked[0].packedQuantity).toBe(4)
    expect(stocked[0].targetQuantity).toBe(6)
    expect(stocked[0].packageUnit).toBe('bottle')

    // And the item row no longer carries the inline stock
    const itemRow = (await db.items.get('item-1')) as Record<string, unknown>
    expect(itemRow.packedQuantity).toBeUndefined()
  })

  // A partly split database exports a MIXED payload: stock rows for the items
  // that were split, inline stock on the ones that were not. Legacy-ness is a
  // property of each item, not of the payload.
  it('user restoring a partly split backup keeps the stock of the unsplit items', async () => {
    // Given a backup where one item is split and the other still has its stock
    // inline
    const payload = emptyPayload({
      items: [
        makeSplitItem('item-1', 'Milk'),
        {
          ...makeItem('item-2', 'Eggs'),
          packedQuantity: 2,
          targetQuantity: 12,
        },
      ],
      itemStocks: [makeStock('stock-1', 'item-1', 'local')],
      locations: [makeLocation('local', 'My Home', 0)],
    })

    // When restoring it
    await importLocalData(payload, 'clear')

    // Then BOTH items are stocked in 'local'
    const stocked = await getStockedItems('local')
    expect(stocked.map((i) => i.name).sort()).toEqual(['Eggs', 'Milk'])
    const eggs = stocked.find((i) => i.name === 'Eggs')
    expect(eggs?.packedQuantity).toBe(2)
    expect(eggs?.targetQuantity).toBe(12)
  })

  // The counterpart guard: `itemStocks: []` next to genuinely split items means
  // "nothing is stocked", and must NOT invent zeroed rows for every item.
  it('user restoring a split backup with no stock at all gets no phantom stock rows', async () => {
    // Given a post-v15 backup whose items carry no stock and whose stock table
    // is legitimately empty
    const payload = emptyPayload({
      items: [makeSplitItem('item-1', 'Milk')],
      itemStocks: [],
      locations: [makeLocation('local', 'My Home', 0)],
    })

    // When restoring it
    await importLocalData(payload, 'clear')

    // Then no stock row is synthesised and the pantry stays empty
    expect(await db.itemStocks.count()).toBe(0)
    expect(await getStockedItems('local')).toHaveLength(0)
  })

  // An item stocked only in another location still carries no inline stock, so
  // it must not gain a duplicate row in the target location.
  it('user restoring a backup does not duplicate stock for an item stocked elsewhere', async () => {
    // Given a backup whose item is stocked in 'office' only
    const payload = emptyPayload({
      items: [makeSplitItem('item-1', 'Milk')],
      itemStocks: [makeStock('stock-office', 'item-1', 'office')],
      locations: [
        makeLocation('local', 'My Home', 0),
        makeLocation('office', 'Office', 1),
      ],
    })

    // When restoring it into 'local'
    await importLocalData(payload, 'clear', 'local')

    // Then it keeps exactly the one row it had
    expect(await db.itemStocks.count()).toBe(1)
    expect(await getStockedItems('local')).toHaveLength(0)
    expect(await getStockedItems('office')).toHaveLength(1)
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

  it('toShoppingCartInput keeps only id + lastPurchasedAt, dropping legacy fields', () => {
    const date = new Date('2026-03-01T10:00:00.000Z')
    const rawCart = {
      __typename: 'Cart',
      id: 'cart-1',
      // Legacy fields from old backups — must be dropped (no longer on the schema)
      status: 'active',
      createdAt: date,
      completedAt: null,
      lastPurchasedAt: date,
      userId: 'u1',
      familyId: 'f1',
    }
    const result = toShoppingCartInput(rawCart)
    expect(result).not.toHaveProperty('__typename')
    expect(result).not.toHaveProperty('userId')
    expect(result).not.toHaveProperty('familyId')
    expect(result).not.toHaveProperty('status')
    expect(result).not.toHaveProperty('createdAt')
    expect(result).not.toHaveProperty('completedAt')
    expect(result.id).toBe('cart-1')
    // lastPurchasedAt (the only optional permanent-cart field) is converted to ISO
    expect(result.lastPurchasedAt).toBe('2026-03-01T10:00:00.000Z')
  })

  it('toShoppingCartInput normalizes an epoch-millis lastPurchasedAt to ISO', () => {
    // Given a cart out of a backup exported while the cloud shipped
    // `lastPurchasedAt` as epoch millis (no `Cart` type resolver on the server)
    const rawCart = { id: 'cart-1', lastPurchasedAt: '1787827334343' }

    // When mapping it back to ShoppingCartInput for bulkUpsertShoppingCarts
    const result = toShoppingCartInput(rawCart)

    // Then it is ISO 8601, not the digit-string — the server does
    // `new Date(lastPurchasedAt)` on it, which would otherwise be an Invalid
    // Date and fail the Prisma write
    expect(result.lastPurchasedAt).toBe(new Date(1787827334343).toISOString())
  })

  it('toShoppingCartInput drops an unparseable lastPurchasedAt', () => {
    const result = toShoppingCartInput({
      id: 'cart-1',
      lastPurchasedAt: 'nope',
    })
    expect(result).not.toHaveProperty('lastPurchasedAt')
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

describe('toItemInput — null normalization', () => {
  it('toItemInput normalizes vendorIds null to undefined', () => {
    // Given a raw item record where vendorIds is null (as stored in a backup JSON)
    const rawItem = {
      id: 'item-1',
      name: 'Apple',
      tagIds: [],
      vendorIds: null,
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    // When mapped to ItemInput
    const result = toItemInput(rawItem as unknown as Record<string, unknown>)

    // Then vendorIds is undefined (not null), safe for Dexie and downstream filters
    expect(result.vendorIds).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// toShelfInput — filterConfig __typename stripping and timestamp fallback
// ---------------------------------------------------------------------------

describe('toShelfInput', () => {
  it('strips __typename from filterConfig', () => {
    // Given a shelf with a filterConfig that has __typename (as added by Apollo)
    const input = {
      id: 'shelf-1',
      name: 'Proteins',
      type: 'filter',
      order: 1,
      filterConfig: {
        __typename: 'FilterConfig',
        tagIds: ['t1'],
        vendorIds: null,
        recipeIds: null,
      },
      itemIds: [],
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:00.000Z',
    }

    // When mapped to ShelfInput
    const result = toShelfInput(input as unknown as Record<string, unknown>)

    // Then __typename is not present in filterConfig
    expect(
      (result.filterConfig as Record<string, unknown>)?.__typename,
    ).toBeUndefined()
    // And valid filterConfig fields are preserved
    expect((result.filterConfig as Record<string, unknown>)?.tagIds).toEqual([
      't1',
    ])
  })

  it('falls back to current ISO date when createdAt is missing', () => {
    // Given a shelf from an old backup without createdAt or updatedAt
    const input = {
      id: 'shelf-1',
      name: 'Manual',
      type: 'selection',
      order: 2,
      itemIds: [],
      filterConfig: null,
      // no createdAt or updatedAt
    }

    // When mapped to ShelfInput
    const result = toShelfInput(input as unknown as Record<string, unknown>)

    // Then createdAt and updatedAt are non-empty ISO strings
    expect(result.createdAt).toBeTruthy()
    expect(result.updatedAt).toBeTruthy()
    expect(() => new Date(result.createdAt)).not.toThrow()
    expect(() => new Date(result.updatedAt)).not.toThrow()
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
          shelves: [],
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

  it('merges newly created item IDs into a conflicting shelf on skip (cloud)', async () => {
    // Given: cloud has shelf-1 with itemIds: ['item-old']
    const existingShelf = {
      id: 'shelf-1',
      name: 'My Shelf',
      type: 'selection',
      order: 1,
      itemIds: ['item-old'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const client = {
      mutate: vi.fn().mockResolvedValue({}),
      resetStore: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({
        data: {
          items: [
            {
              id: 'item-old',
              name: 'OldItem',
              tagIds: [],
              targetUnit: 'package',
              targetQuantity: 1,
              refillThreshold: 0,
              packedQuantity: 0,
              unpackedQuantity: 0,
              consumeAmount: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          tags: [],
          tagTypes: [],
          vendors: [],
          recipes: [],
          inventoryLogs: [],
          shoppingCarts: [],
          allCartItems: [],
          shelves: [existingShelf],
        },
      }),
    }

    // And: payload has shelf-1 (conflict) with itemIds: ['item-old', 'item-new'],
    //      and item-new is new (non-conflicting)
    const payload = emptyPayload({
      items: [makeItem('item-new', 'NewItem')],
      shelves: [
        {
          id: 'shelf-1',
          name: 'My Shelf',
          type: 'selection',
          order: 1,
          itemIds: ['item-old', 'item-new'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    })

    // When importing with skip
    await importCloudData(payload, 'skip', client as never)

    // Then UpdateShelf was called with merged itemIds containing both item-old and item-new
    const mutateCalls = (client.mutate as ReturnType<typeof vi.fn>).mock.calls
    const updateCall = mutateCalls.find(
      (call: Array<{ variables?: { id?: string } }>) =>
        call[0]?.variables?.id === 'shelf-1',
    )
    expect(updateCall).toBeDefined()
    const vars = updateCall[0].variables as { itemIds: string[] }
    expect(vars.itemIds).toContain('item-old')
    expect(vars.itemIds).toContain('item-new')
  })

  it('merges newly created ingredient items into a conflicting recipe on skip (cloud)', async () => {
    // Given: cloud has recipe-1 with item-old as its only ingredient
    const existingRecipe = {
      id: 'recipe-1',
      name: 'Smoothie',
      items: [{ itemId: 'item-old', defaultAmount: 1 }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const client = {
      mutate: vi.fn().mockResolvedValue({}),
      resetStore: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({
        data: {
          items: [
            {
              id: 'item-old',
              name: 'OldItem',
              tagIds: [],
              targetUnit: 'package',
              targetQuantity: 1,
              refillThreshold: 0,
              packedQuantity: 0,
              unpackedQuantity: 0,
              consumeAmount: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          tags: [],
          tagTypes: [],
          vendors: [],
          recipes: [existingRecipe],
          inventoryLogs: [],
          shoppingCarts: [],
          allCartItems: [],
          shelves: [],
        },
      }),
    }

    // And: payload has recipe-1 (conflict) with item-old + item-new as ingredients,
    //      item-new is new (non-conflicting)
    const payload = emptyPayload({
      items: [makeItem('item-new', 'NewItem')],
      recipes: [
        {
          id: 'recipe-1',
          name: 'Smoothie',
          items: [
            { itemId: 'item-old', defaultAmount: 1 },
            { itemId: 'item-new', defaultAmount: 2 },
          ],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
        },
      ],
    })

    // When importing with skip
    await importCloudData(payload, 'skip', client as never)

    // Then UpdateRecipe was called with merged items containing both item-old and item-new
    const mutateCalls = (client.mutate as ReturnType<typeof vi.fn>).mock.calls
    const updateCall = mutateCalls.find(
      (call: Array<{ variables?: { id?: string } }>) =>
        call[0]?.variables?.id === 'recipe-1',
    )
    expect(updateCall).toBeDefined()
    const vars = updateCall[0].variables as {
      items: Array<{ itemId: string; defaultAmount: number }>
    }
    expect(vars.items.map((i) => i.itemId)).toContain('item-old')
    expect(vars.items.map((i) => i.itemId)).toContain('item-new')
  })
})

describe('importLocalData — shelf itemIds merge on skip conflict', () => {
  beforeEach(clearAllTables)
  afterEach(clearAllTables)

  it('user can merge newly created item IDs into a conflicting shelf on skip', async () => {
    // Given: shelf-1 already exists in local DB with item-old in its itemIds
    const existingShelf = {
      id: 'shelf-1',
      name: 'My Shelf',
      type: 'selection' as const,
      order: 1,
      itemIds: ['item-old'],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }
    await db.items.add(makeItem('item-old', 'OldItem'))
    await db.shelves.add(existingShelf)

    // And: payload has same shelf-1 (conflict) with item-old + item-new in itemIds,
    //      and item-new is a new item (not in existing DB)
    const payload = emptyPayload({
      items: [makeItem('item-new', 'NewItem')],
      shelves: [
        {
          ...existingShelf,
          itemIds: ['item-old', 'item-new'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    })

    // When importing with skip strategy
    await importLocalData(payload, 'skip')

    // Then item-new is created
    const items = await db.items.toArray()
    expect(items.map((i) => i.id)).toContain('item-new')

    // And shelf-1 now contains both item-old AND item-new
    const shelf = await db.shelves.get('shelf-1')
    expect(shelf?.itemIds).toContain('item-old')
    expect(shelf?.itemIds).toContain('item-new')
  })

  it('does not modify a conflicting shelf when no newly created items belong to it', async () => {
    // Given: shelf-1 exists with item-old
    const existingShelf = {
      id: 'shelf-1',
      name: 'My Shelf',
      type: 'selection' as const,
      order: 1,
      itemIds: ['item-old'],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }
    await db.items.add(makeItem('item-old', 'OldItem'))
    await db.shelves.add(existingShelf)

    // And: payload has same shelf-1 but its itemIds only references item-old (also conflicting)
    const payload = emptyPayload({
      items: [makeItem('item-old', 'OldItem')], // item-old is also conflicting
      shelves: [
        {
          ...existingShelf,
          itemIds: ['item-old'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    // When importing with skip
    await importLocalData(payload, 'skip')

    // Then shelf-1 itemIds is still just item-old (no changes)
    const shelf = await db.shelves.get('shelf-1')
    expect(shelf?.itemIds).toEqual(['item-old'])
  })
})

describe('importLocalData — recipe items merge on skip conflict', () => {
  beforeEach(clearAllTables)
  afterEach(clearAllTables)

  it('user can merge newly created ingredient items into a conflicting recipe on skip', async () => {
    // Given: recipe-1 exists in local DB with item-old as its only ingredient
    const existingRecipe = {
      id: 'recipe-1',
      name: 'Smoothie',
      items: [{ itemId: 'item-old', defaultAmount: 1 }],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }
    await db.items.add(makeItem('item-old', 'OldItem'))
    await db.recipes.add(existingRecipe)

    // And: payload has same recipe-1 (conflict) with item-old + item-new as ingredients,
    //      and item-new is a new item (not in existing DB)
    const payload = emptyPayload({
      items: [makeItem('item-new', 'NewItem')],
      recipes: [
        {
          ...existingRecipe,
          items: [
            { itemId: 'item-old', defaultAmount: 1 },
            { itemId: 'item-new', defaultAmount: 2 },
          ],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
        },
      ],
    })

    // When importing with skip strategy
    await importLocalData(payload, 'skip')

    // Then item-new is created
    const items = await db.items.toArray()
    expect(items.map((i) => i.id)).toContain('item-new')

    // And recipe-1 now contains both item-old AND item-new as ingredients
    const recipe = await db.recipes.get('recipe-1')
    const ingredientIds = recipe?.items.map((ri) => ri.itemId) ?? []
    expect(ingredientIds).toContain('item-old')
    expect(ingredientIds).toContain('item-new')
  })

  it('does not modify a conflicting recipe when no newly created items are ingredients', async () => {
    // Given: recipe-1 exists with item-old as ingredient
    const existingRecipe = {
      id: 'recipe-1',
      name: 'Smoothie',
      items: [{ itemId: 'item-old', defaultAmount: 1 }],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }
    await db.items.add(makeItem('item-old', 'OldItem'))
    await db.recipes.add(existingRecipe)

    // And: payload has same recipe-1 whose items only reference item-old (also conflicting)
    const payload = emptyPayload({
      items: [makeItem('item-old', 'OldItem')],
      recipes: [
        {
          ...existingRecipe,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ],
    })

    // When importing with skip
    await importLocalData(payload, 'skip')

    // Then recipe-1 items is still just item-old (no changes)
    const recipe = await db.recipes.get('recipe-1')
    expect(recipe?.items).toHaveLength(1)
    expect(recipe?.items[0].itemId).toBe('item-old')
  })
})

// ---------------------------------------------------------------------------
// Local → cloud migration (v15 split). Cloud has no per-location ItemStock, so
// the migration flattens the ACTIVE location's stock back onto each item.
// ---------------------------------------------------------------------------

describe('importCloudData — local → cloud stock flattening (v15 split)', () => {
  function makeCloudClient(mutateFn = vi.fn().mockResolvedValue({})) {
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
          shelves: [],
        },
      }),
    }
  }

  // A post-v15 item row: identity only, no stock fields.
  function splitItem(id: string, name: string) {
    return {
      id,
      name,
      tagIds: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    }
  }

  function stockRow(
    id: string,
    itemId: string,
    locationId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      itemId,
      locationId,
      targetUnit: 'package' as const,
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }
  }

  // Pull the variables of the first `items` mutation out of an Apollo mock.
  function sentItems(client: { mutate: ReturnType<typeof vi.fn> }) {
    const call = client.mutate.mock.calls.find(
      (c) => (c[0]?.variables as { items?: unknown[] })?.items !== undefined,
    )
    return (call?.[0].variables as { items: Record<string, unknown>[] }).items
  }

  function sentOf(client: { mutate: ReturnType<typeof vi.fn> }, key: string) {
    const call = client.mutate.mock.calls.find(
      (c) => (c[0]?.variables as Record<string, unknown>)?.[key] !== undefined,
    )
    return call
      ? (call[0].variables as Record<string, Record<string, unknown>[]>)[key]
      : undefined
  }

  it('user migrating to cloud sends the active location stock, not nulls', async () => {
    // Given a local pantry where Milk is stocked in two locations
    const payload = emptyPayload({
      items: [splitItem('item-1', 'Milk')],
      itemStocks: [
        stockRow('stock-home', 'item-1', 'local', { packedQuantity: 3 }),
        stockRow('stock-office', 'item-1', 'office', {
          packedQuantity: 9,
          targetQuantity: 12,
          packageUnit: 'bottle',
          dueDate: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ],
      locations: [
        { id: 'local', name: 'My Home', order: 0 },
        { id: 'office', name: 'Office', order: 1 },
      ],
    })
    const client = makeCloudClient()

    // When migrating with 'office' as the active location
    await importCloudData(payload, 'skip', client as never, {
      locationId: 'office',
    })

    // Then the item carries the office stock, fully populated
    const items = sentItems(client)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'item-1',
      name: 'Milk',
      packedQuantity: 9,
      targetQuantity: 12,
      packageUnit: 'bottle',
      targetUnit: 'package',
      refillThreshold: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    // And the Date dueDate is serialised as an ISO string for GraphQL
    expect(items[0].dueDate).toBe('2026-06-01T00:00:00.000Z')
  })

  // A cloud Item carries stock inline, so flattening must merge BOTH halves:
  // the global configuration off the item and the state off the stock row.
  // The zeroed defaults must not overwrite the item's own configuration.
  it('user migrating to cloud keeps the item’s global settings alongside the location stock', async () => {
    // Given a v16 payload: configuration on the item, state on the stock row
    const payload = emptyPayload({
      items: [
        {
          ...splitItem('item-1', 'Olive Oil'),
          packageUnit: 'bottle',
          measurementUnit: 'ml',
          amountPerPackage: 750,
          targetUnit: 'measurement',
          consumeAmount: 15,
          expirationMode: 'days from purchase',
          estimatedDueDays: 180,
          expirationThreshold: 14,
        },
      ],
      itemStocks: [
        {
          id: 'stock-home',
          itemId: 'item-1',
          locationId: 'local',
          targetQuantity: 1500,
          refillThreshold: 250,
          packedQuantity: 2,
          unpackedQuantity: 300,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    const client = makeCloudClient()

    // When migrating with 'local' active
    await importCloudData(payload, 'skip', client as never, {
      locationId: 'local',
    })

    // Then the cloud item carries both halves
    const items = sentItems(client)
    expect(items[0]).toMatchObject({
      id: 'item-1',
      packageUnit: 'bottle',
      measurementUnit: 'ml',
      amountPerPackage: 750,
      targetUnit: 'measurement',
      consumeAmount: 15,
      expirationMode: 'days from purchase',
      estimatedDueDays: 180,
      expirationThreshold: 14,
      targetQuantity: 1500,
      refillThreshold: 250,
      packedQuantity: 2,
      unpackedQuantity: 300,
    })
  })

  it('an item not stocked in the active location keeps its global settings, with zeroed state', async () => {
    // Given Rice's settings are global but it is not stocked where we are
    const payload = emptyPayload({
      items: [
        {
          ...splitItem('item-2', 'Rice'),
          packageUnit: 'sack',
          consumeAmount: 4,
          targetUnit: 'package',
        },
      ],
      itemStocks: [
        {
          id: 'stock-home',
          itemId: 'item-2',
          locationId: 'local',
          targetQuantity: 3,
          refillThreshold: 1,
          packedQuantity: 5,
          unpackedQuantity: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    const client = makeCloudClient()

    // When migrating with 'office' active
    await importCloudData(payload, 'skip', client as never, {
      locationId: 'office',
    })

    // Then the state zeroes out but the configuration survives
    const items = sentItems(client)
    expect(items[0]).toMatchObject({
      id: 'item-2',
      packageUnit: 'sack',
      consumeAmount: 4,
      packedQuantity: 0,
      targetQuantity: 0,
    })
  })

  it('an item not stocked in the active location is still sent, with zeroed stock', async () => {
    // Given Rice is only stocked in 'local' while 'office' is active
    const payload = emptyPayload({
      items: [splitItem('item-1', 'Milk'), splitItem('item-2', 'Rice')],
      itemStocks: [
        stockRow('stock-office', 'item-1', 'office', { packedQuantity: 9 }),
        stockRow('stock-home', 'item-2', 'local', { packedQuantity: 5 }),
      ],
    })
    const client = makeCloudClient()

    // When migrating with 'office' active
    await importCloudData(payload, 'skip', client as never, {
      locationId: 'office',
    })

    // Then Rice is still sent (recipes/shelves reference it) but with the
    // zeroed stock the app itself shows for an item absent from this location
    const rice = sentItems(client).find((i) => i.id === 'item-2')
    expect(rice).toMatchObject({
      packedQuantity: 0,
      unpackedQuantity: 0,
      targetQuantity: 0,
      refillThreshold: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    // And no other location's quantity leaks in
    expect(rice?.packedQuantity).not.toBe(5)
  })

  it('cart ids lose the location prefix and other locations carts are dropped', async () => {
    // Given carts in two locations (local ids are `${locationId}:${vendorId}`)
    const payload = emptyPayload({
      items: [splitItem('item-1', 'Milk')],
      itemStocks: [stockRow('s1', 'item-1', 'office')],
      shoppingCarts: [
        { id: 'office:no-vendor' },
        { id: 'office:vendor-1' },
        { id: 'local:no-vendor' },
      ],
      cartItems: [
        makeCartItem('ci-1', 'office:no-vendor', 'item-1'),
        makeCartItem('ci-2', 'local:no-vendor', 'item-1'),
      ],
    })
    const client = makeCloudClient()

    // When migrating with 'office' active
    await importCloudData(payload, 'skip', client as never, {
      locationId: 'office',
    })

    // Then cloud receives bare vendor-keyed cart ids for the active location only
    const carts = sentOf(client, 'carts')
    expect(carts?.map((c) => c.id).sort()).toEqual(['no-vendor', 'vendor-1'])

    // And only that location's cart items travel, re-keyed to match
    const cartItems = sentOf(client, 'cartItems')
    expect(cartItems).toHaveLength(1)
    expect(cartItems?.[0]).toMatchObject({ id: 'ci-1', cartId: 'no-vendor' })
  })

  it('inventory logs from other locations are not sent', async () => {
    // Given logs recorded in two locations
    const payload = emptyPayload({
      items: [splitItem('item-1', 'Milk')],
      itemStocks: [stockRow('s1', 'item-1', 'office')],
      inventoryLogs: [
        { ...makeInventoryLog('log-office'), locationId: 'office' },
        { ...makeInventoryLog('log-home'), locationId: 'local' },
        // A pre-Location log with no locationId still belongs to the user
        makeInventoryLog('log-legacy'),
      ],
    })
    const client = makeCloudClient()

    // When migrating with 'office' active
    await importCloudData(payload, 'skip', client as never, {
      locationId: 'office',
    })

    // Then only the active location's (and un-scoped) logs are sent
    const logs = sentOf(client, 'logs')
    expect(logs?.map((l) => l.id).sort()).toEqual(['log-legacy', 'log-office'])
  })

  it('a cloud-shaped payload (no itemStocks) passes through untouched', async () => {
    // Given a cloud/legacy payload whose stock still lives inline on the item
    const payload = legacyPayload({
      items: [{ ...makeItem('item-1', 'Milk'), packedQuantity: 7 }],
      shoppingCarts: [{ id: 'no-vendor' }],
      cartItems: [makeCartItem('ci-1', 'no-vendor', 'item-1')],
    })
    const client = makeCloudClient()

    // When importing it into cloud
    await importCloudData(payload, 'skip', client as never, {
      locationId: 'office',
    })

    // Then nothing is flattened or re-keyed away
    expect(sentItems(client)[0]).toMatchObject({ packedQuantity: 7 })
    expect(sentOf(client, 'carts')?.[0]).toMatchObject({ id: 'no-vendor' })
    expect(sentOf(client, 'cartItems')).toHaveLength(1)
  })
})

describe('importLocalData — carts are bootstrapped by every strategy', () => {
  beforeEach(clearAllTables)
  afterEach(clearAllTables)

  it('user importing a cart-less backup with clear still has shopping carts', async () => {
    // Given a backup that carries no carts at all (e.g. exported before any
    // shopping happened) and two locations
    const now = new Date()
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Milk')],
      vendors: [makeVendor('vendor-1', 'Costco')],
      itemStocks: [],
      locations: [
        {
          id: 'local',
          name: 'My Home',
          order: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'office',
          name: 'Office',
          order: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
      shoppingCarts: [],
      cartItems: [],
    })

    // When restoring it with the destructive 'clear' strategy, which wipes the
    // cart table first
    await importLocalData(payload, 'clear')

    // Then every location still has its no-vendor + per-vendor carts — `getCart`
    // is a pure read, so a cart-less database leaves shopping unusable
    const cartIds = (await db.shoppingCarts.toArray()).map((c) => c.id).sort()
    expect(cartIds).toEqual([
      'local:no-vendor',
      'local:vendor-1',
      'office:no-vendor',
      'office:vendor-1',
    ])
  })

  it('user importing a new vendor with skip gets a usable cart for it', async () => {
    // Given a backup introducing a vendor the payload carries no cart for
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Milk')],
      vendors: [makeVendor('vendor-new', 'Costco')],
      itemStocks: [],
      shoppingCarts: [],
      cartItems: [],
    })

    // When merging it with the non-destructive 'skip' strategy
    await importLocalData(payload, 'skip')

    // Then the new vendor has a cart — without it `/shopping/vendor-new`
    // disables every add-to-cart control with no message
    const cartIds = (await db.shoppingCarts.toArray()).map((c) => c.id)
    expect(cartIds).toContain('local:vendor-new')
  })

  it('user importing a new vendor with replace gets a usable cart for it', async () => {
    // Given the same backup restored over an existing database
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Milk')],
      vendors: [makeVendor('vendor-new', 'Costco')],
      itemStocks: [],
      shoppingCarts: [],
      cartItems: [],
    })

    // When merging it with the 'replace' strategy
    await importLocalData(payload, 'replace')

    // Then the new vendor has a cart
    const cartIds = (await db.shoppingCarts.toArray()).map((c) => c.id)
    expect(cartIds).toContain('local:vendor-new')
  })
})

describe('resolveFlattenLocationId — cloud file import cannot silently zero stock', () => {
  function payloadWithStockIn(...locationIds: string[]): ExportPayload {
    return emptyPayload({
      items: [{ id: 'item-1', name: 'Milk', tagIds: [] }],
      itemStocks: locationIds.map((locationId, i) => ({
        id: `stock-${i}`,
        itemId: 'item-1',
        locationId,
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 1,
        packedQuantity: 3,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })),
    })
  }

  it('prefers the requested location when the backup has stock for it', () => {
    // Given a backup holding stock in both locations
    const payload = payloadWithStockIn('local', 'office')

    // When resolving against the device's active location
    // Then that location wins — Ruling A is unaffected
    expect(resolveFlattenLocationId(payload, 'office')).toBe('office')
  })

  it('falls back to the backup single location when the requested one is absent', () => {
    // Given a backup written on another device, whose only location id is
    // unknown here (this device has just 'local')
    const payload = payloadWithStockIn('kitchen-a1b2')

    // When resolving against 'local'
    // Then the one location the backup does have is used — flattening by
    // 'local' would have uploaded every item with zeroed stock
    expect(resolveFlattenLocationId(payload, 'local')).toBe('kitchen-a1b2')
  })

  it('refuses to guess when the backup has several unknown locations', () => {
    // Given a backup with stock in two locations, neither of them this device's
    const payload = payloadWithStockIn('kitchen-a1b2', 'garage-c3d4')

    // When resolving against 'local'
    // Then there is no safe answer — the caller must fail loudly rather than
    // upload zeros for everything
    expect(resolveFlattenLocationId(payload, 'local')).toBeNull()
  })

  it('passes the request through when there is no stock to flatten', () => {
    // Given a cloud-shaped payload (no itemStocks at all) and one with an
    // empty stock table and no carts — neither can lose anything by being
    // flattened
    expect(resolveFlattenLocationId(emptyPayload(), 'local')).toBe('local')
    expect(resolveFlattenLocationId(payloadWithStockIn(), 'local')).toBe(
      'local',
    )
  })

  // With no stock to disambiguate, the carts still carry a location prefix, and
  // flattening by a location none of them use drops every cart and cart item
  // silently. Zeroed stock is correct here (there is none); losing the carts is
  // not.
  function payloadWithCartsIn(...locationIds: string[]): ExportPayload {
    return emptyPayload({
      items: [{ id: 'item-1', name: 'Milk', tagIds: [] }],
      itemStocks: [],
      shoppingCarts: locationIds.map((locationId) => ({
        id: `${locationId}:vendor-1`,
      })),
      cartItems: locationIds.map((locationId, i) => ({
        id: `ci-${i}`,
        cartId: `${locationId}:vendor-1`,
        itemId: 'item-1',
        quantity: 1,
      })),
    })
  }

  it('falls back to the cart location when there is no stock to disambiguate', () => {
    // Given a stock-less backup whose carts all belong to one other location
    const payload = payloadWithCartsIn('kitchen-a1b2')

    // When resolving against 'local'
    // Then the carts' own location is used — flattening by 'local' would have
    // dropped every cart and cart item with no warning
    expect(resolveFlattenLocationId(payload, 'local')).toBe('kitchen-a1b2')
  })

  it('prefers the requested location when its carts are in the backup', () => {
    // Given a stock-less backup with carts in both locations
    const payload = payloadWithCartsIn('local', 'office')

    // Then the request still wins — Ruling A is unaffected
    expect(resolveFlattenLocationId(payload, 'office')).toBe('office')
  })

  it('refuses to guess when stock-less carts span several unknown locations', () => {
    // Given carts in two locations, neither of them this device's
    const payload = payloadWithCartsIn('kitchen-a1b2', 'garage-c3d4')

    // Then there is no safe answer — refuse rather than drop half the carts
    expect(resolveFlattenLocationId(payload, 'local')).toBeNull()
  })
})
