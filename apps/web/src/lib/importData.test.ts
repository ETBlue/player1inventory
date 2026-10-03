import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { addItemToLocation, getStockedItems } from '@/db/operations'
import { ClearAllDataDocument } from '@/generated/graphql'
import type { ExportPayload } from './exportData'
import {
  applyLocationRemap,
  buildLocationRemap,
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
  toItemStockInput,
  toLocationInput,
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

  // The v15-only tables are in no conflict set, so nothing may silently drop
  // them: an implementation that rebuilt `toCreate` table-by-table instead of
  // spreading would have lost every stock row and location, and items would
  // import stockless with an empty pantry.
  //
  // They are NOT carried through identically on every strategy, which is what
  // these three tests used to assert as one `it.each`. PR 4b task 4 made the
  // cloud upload read them, and the two passes need them in different places —
  // see the table above `partitionPayload`. The fixture is what makes the three
  // rules distinguishable: `item-1` conflicts and `item-2` does not, and each
  // has its own stock row.
  function v15Payload() {
    return emptyPayload({
      items: [existingItem, newItem],
      itemStocks: [
        { id: 'stock-1', itemId: 'item-1', locationId: 'local' },
        { id: 'stock-2', itemId: 'item-2', locationId: 'office' },
      ],
      locations: [{ id: 'office', name: 'Office', order: 1 }],
    })
  }

  it('user importing a v15 backup with clear keeps every stock row and location', () => {
    // Given a v15 payload carrying stock rows and locations
    const payload = v15Payload()

    // When partitioning it for the clear strategy
    const { toCreate } = partitionPayload(
      payload,
      detectConflicts(payload, existing),
      'clear',
    )

    // Then every row goes to the create pass — nothing is left to conflict with
    expect((toCreate.itemStocks as Array<{ id: string }>).map((s) => s.id)) //
      .toEqual(['stock-1', 'stock-2'])
    expect(toCreate.locations).toHaveLength(1)
  })

  it('user importing a v15 backup with skip keeps the stock of the items it added', () => {
    // Given a v15 payload whose `item-1` already exists and whose `item-2` does not
    const payload = v15Payload()

    // When partitioning it for the skip strategy
    const { toCreate, toUpsert } = partitionPayload(
      payload,
      detectConflicts(payload, existing),
      'skip',
    )

    // Then only the new item's stock goes up. `item-1` was skipped, so the
    // stock it already has stays as it is — the rule `importItemStocks` uses
    // locally, and the only rule the server accepts: `requireOwnItemStockRefs`
    // refuses an item id the account does not hold.
    expect((toCreate.itemStocks as Array<{ id: string }>).map((s) => s.id)) //
      .toEqual(['stock-2'])
    // And every location goes up, because a location is never a conflict
    expect(toCreate.locations).toHaveLength(1)
    expect(toUpsert.itemStocks ?? []).toHaveLength(0)
  })

  it('user importing a v15 backup with replace sends every stock row to the upsert pass', () => {
    // Given the same v15 payload
    const payload = v15Payload()

    // When partitioning it for the replace strategy
    const { toCreate, toUpsert } = partitionPayload(
      payload,
      detectConflicts(payload, existing),
      'replace',
    )

    // Then no stock goes to the create pass: `bulkCreateItemStocks` skips a
    // taken (itemId, locationId) pair, which would drop the quantities the
    // user asked to restore
    expect(toCreate.itemStocks).toHaveLength(0)
    expect((toUpsert.itemStocks as Array<{ id: string }>).map((s) => s.id)) //
      .toEqual(['stock-1', 'stock-2'])
    // And locations go to the CREATE pass, never the upsert pass: the carts
    // and logs that name them are sent on that same pass
    expect(toCreate.locations).toHaveLength(1)
    expect(toUpsert.locations).toHaveLength(0)
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

  it('toInventoryLogInput keeps locationId, logKey and logParams', () => {
    // Given a log that names its location and carries a translated message.
    // All three fields were dropped by this mapper before cloud locations
    // PR 4b, so a restored backup put every log in the default location with
    // no message at all.
    const rawLog = {
      __typename: 'InventoryLog',
      id: 'log-1',
      itemId: 'item-1',
      locationId: 'loc-office',
      delta: -1,
      quantity: 2,
      occurredAt: '2026-02-10T08:00:00.000Z',
      note: null,
      logKey: 'log.cooked',
      logParams: { recipe: 'Smoothie' },
      userId: 'u1',
    }

    // When mapped to InventoryLogInput
    const result = toInventoryLogInput(rawLog)

    // Then the location and the message both survive
    expect(result.locationId).toBe('loc-office')
    expect(result.logKey).toBe('log.cooked')
    expect(result.logParams).toEqual({ recipe: 'Smoothie' })
    expect(result).not.toHaveProperty('userId')
  })

  it('toLocationInput drops isDefault', () => {
    // Given a location row out of a cloud export, which DOES record isDefault
    // (GetLocations selects it) — but LocationInput has no such field, and
    // sending it would fail GraphQL validation
    const rawLocation = {
      __typename: 'Location',
      id: 'loc-office',
      name: 'Office',
      order: 1,
      isDefault: true,
      userId: 'u1',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
    }

    // When mapped to LocationInput
    const result = toLocationInput(rawLocation)

    // Then the key is ABSENT, not `false` — the server accepts no such field
    expect(result).not.toHaveProperty('isDefault')
    expect(result).not.toHaveProperty('__typename')
    expect(result).not.toHaveProperty('userId')

    // And everything LocationInput does accept is present
    expect(result).toEqual({
      id: 'loc-office',
      name: 'Office',
      order: 1,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
    })
  })

  it('toLocationInput converts Date timestamps out of a local backup', () => {
    // Given a Dexie location row, whose timestamps are Date objects
    const result = toLocationInput({
      id: 'local',
      name: 'My Home',
      order: 0,
      isDefault: true,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-02T00:00:00.000Z'),
    })

    // Then they arrive as ISO strings, which is what LocationInput declares
    expect(result.createdAt).toBe('2026-02-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2026-02-02T00:00:00.000Z')
  })

  it('toItemStockInput keeps locationId and accepts a null dueDate', () => {
    // Given a stock row with no expiration date. Apollo sends `null`, Dexie
    // sends `undefined`, and `dueDate` is the one optional field on
    // ItemStockImportInput — so both have to become "no due date"
    const rawStock = {
      __typename: 'ItemStock',
      id: 'stock-office',
      itemId: 'item-1',
      locationId: 'loc-office',
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 2,
      unpackedQuantity: 0,
      dueDate: null,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
    }

    // When mapped to ItemStockImportInput
    const result = toItemStockInput(rawStock)

    // Then the location is kept — it is what makes the row per-location
    expect(result.locationId).toBe('loc-office')
    expect(result.dueDate).toBeUndefined()
    expect(result).not.toHaveProperty('__typename')
    expect(result.packedQuantity).toBe(2)
  })

  it('toItemStockInput converts a Date dueDate and drops local-only columns', () => {
    // Given a Dexie stock row: Date timestamps, plus the unit and packaging
    // columns the cloud keeps on Item instead of ItemStock
    const result = toItemStockInput({
      id: 'stock-home',
      itemId: 'item-1',
      locationId: 'local',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0,
      dueDate: new Date('2026-03-01T00:00:00.000Z'),
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-02T00:00:00.000Z'),
      targetUnit: 'package',
      packageUnit: 'bottle',
      consumeAmount: 1,
    })

    // Then the dates are ISO and the local-only columns are gone
    expect(result.dueDate).toBe('2026-03-01T00:00:00.000Z')
    expect(result.createdAt).toBe('2026-02-01T00:00:00.000Z')
    expect(result).not.toHaveProperty('targetUnit')
    expect(result).not.toHaveProperty('packageUnit')
    expect(result).not.toHaveProperty('consumeAmount')
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
// importCloudData — locations and stock upload in dependency order
// (cloud locations PR 4b task 4)
//
// EVERY TEST HERE ASSERTS THE SEQUENCE, NOT JUST THAT BOTH HAPPENED. A wrong
// upload order produces no error at all:
//
//   - a cart uploaded before its location exists is written to the account's
//     DEFAULT location by `resolveCartLocations`, silently;
//   - stock uploaded before its item or location exists is refused with
//     `Forbidden`, and on the `clear` strategy that lands after
//     `clearAllData` has already emptied the account.
//
// "Both were called" passes against both of those, so it proves nothing.
// ---------------------------------------------------------------------------

describe('importCloudData — locations and stock upload in dependency order', () => {
  // The GraphQL operation name of a document, e.g. 'BulkCreateLocations'.
  // Comparing names rather than document objects keeps the failure message
  // readable: a wrong order prints two lists of names.
  function opName(doc: unknown): string {
    const definitions = (
      doc as { definitions: Array<{ name?: { value: string } }> }
    ).definitions
    return definitions[0]?.name?.value ?? '(anonymous)'
  }

  // The destination account's one location, flagged default. The remap maps
  // the PAYLOAD's default onto this id and leaves every other id alone, so a
  // fixture needs at least one non-default location to tell the two rules
  // apart. This one seeds THREE.
  const CLOUD_DEFAULT_ID = 'cloud_default'

  function makeRecordingClient() {
    const mutate = vi.fn().mockResolvedValue({})
    const query = vi
      .fn()
      .mockImplementation(({ query: doc }: { query: unknown }) => {
        if (opName(doc) === 'GetLocations') {
          return Promise.resolve({
            data: {
              locations: [
                {
                  id: CLOUD_DEFAULT_ID,
                  name: 'My Home',
                  order: 0,
                  isDefault: true,
                  createdAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                },
              ],
            },
          })
        }
        return Promise.resolve({
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
        })
      })
    return { mutate, query, resetStore: vi.fn().mockResolvedValue(undefined) }
  }

  function mutationOrder(client: { mutate: ReturnType<typeof vi.fn> }) {
    return client.mutate.mock.calls.map((call) => opName(call[0].mutation))
  }

  function variablesOf(
    client: { mutate: ReturnType<typeof vi.fn> },
    operation: string,
  ) {
    const call = client.mutate.mock.calls.find(
      (c) => opName(c[0].mutation) === operation,
    )
    return call?.[0].variables as Record<string, unknown> | undefined
  }

  function makeStock(
    id: string,
    itemId: string,
    locationId: string,
    packedQuantity: number,
  ) {
    return {
      id,
      itemId,
      locationId,
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity,
      unpackedQuantity: 0,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    }
  }

  // One row in EVERY array, so every entity's mutation fires and the full
  // sequence can be asserted. Three locations, two of them non-default, and
  // three stock rows with three different quantities — so "each row keeps its
  // own locationId" and "every row got the default" give different answers.
  function fullPayload(): ExportPayload {
    return emptyPayload({
      tagTypes: [makeTagType('type-1', 'Category')],
      tags: [makeTag('tag-1', 'Dairy')],
      vendors: [makeVendor('vendor_1', 'Corner Shop')],
      locations: [
        {
          id: 'loc_home',
          name: 'Home',
          order: 0,
          isDefault: true,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        },
        {
          id: 'loc_garage',
          name: 'Garage',
          order: 1,
          isDefault: false,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        },
        {
          id: 'loc_office',
          name: 'Office',
          order: 2,
          isDefault: false,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        },
      ],
      items: [makeItem('item_1', 'Milk'), makeItem('item_2', 'Rice')],
      itemStocks: [
        makeStock('stock_home', 'item_1', 'loc_home', 1),
        makeStock('stock_garage', 'item_1', 'loc_garage', 7),
        makeStock('stock_office', 'item_2', 'loc_office', 3),
      ],
      recipes: [makeRecipe('recipe-1', 'Porridge')],
      inventoryLogs: [makeInventoryLog('log-1')],
      shoppingCarts: [makeShoppingCart('loc_garage:vendor_1')],
      cartItems: [makeCartItem('ci-1', 'loc_garage:vendor_1', 'item_1')],
      shelves: [
        {
          id: 'shelf-1',
          name: 'Fridge',
          type: 'selection',
          order: 0,
          itemIds: ['item_1'],
          filterConfig: null,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        },
      ],
    })
  }

  it('user signing in has every location uploaded before any item or cart', async () => {
    // Given a payload with three locations, two items, stock and a cart
    const client = makeRecordingClient()

    // When the whole payload is uploaded
    await importCloudData(fullPayload(), 'clear', client as never)

    // Then the exact sequence of mutations is the dependency order
    expect(mutationOrder(client)).toEqual([
      'ClearAllData',
      'BulkCreateTagTypes',
      'BulkCreateTags',
      'BulkCreateVendors',
      'BulkCreateLocations',
      'BulkCreateItems',
      'BulkCreateItemStocks',
      'BulkCreateRecipes',
      'BulkCreateInventoryLogs',
      'BulkCreateShoppingCarts',
      'BulkCreateCartItems',
      'BulkCreateShelves',
    ])

    // And, said as the three constraints that matter, so a failure names which
    // one broke
    const order = mutationOrder(client)
    expect(order.indexOf('BulkCreateLocations')).toBeLessThan(
      order.indexOf('BulkCreateItems'),
    )
    expect(order.indexOf('BulkCreateLocations')).toBeLessThan(
      order.indexOf('BulkCreateShoppingCarts'),
    )
    expect(order.indexOf('BulkCreateLocations')).toBeLessThan(
      order.indexOf('BulkCreateInventoryLogs'),
    )
  })

  it('user signing in has stock uploaded after the items and locations it points at', async () => {
    // Given the same payload
    const client = makeRecordingClient()

    // When it is uploaded
    await importCloudData(fullPayload(), 'clear', client as never)

    // Then stock comes after BOTH of its parents — it is a child of each, and
    // the server refuses an unknown one with `Forbidden`
    const order = mutationOrder(client)
    expect(order.indexOf('BulkCreateItemStocks')).toBeGreaterThan(
      order.indexOf('BulkCreateItems'),
    )
    expect(order.indexOf('BulkCreateItemStocks')).toBeGreaterThan(
      order.indexOf('BulkCreateLocations'),
    )
  })

  it('user signing in keeps every location id except the payload default', async () => {
    // Given a payload whose default is `loc_home` and whose other two
    // locations are `loc_garage` and `loc_office`
    const client = makeRecordingClient()

    // When it is uploaded to an account whose default is `cloud_default`
    await importCloudData(fullPayload(), 'clear', client as never)

    // Then all three locations are uploaded in one batch: the payload default
    // lands on the destination's default row, the other two keep their own ids
    const uploaded = variablesOf(client, 'BulkCreateLocations')
      ?.locations as Array<{ id: string; name: string }>
    expect(uploaded.map((l) => l.id)).toEqual([
      CLOUD_DEFAULT_ID,
      'loc_garage',
      'loc_office',
    ])
    expect(uploaded.map((l) => l.name)).toEqual(['Home', 'Garage', 'Office'])
    // And `isDefault` is never sent — the column is a per-user unique partial
    // index, so a second default would raise P2002 after `clearAllData`
    expect(uploaded.every((l) => !('isDefault' in l))).toBe(true)
  })

  it('user signing in keeps each stock row at its own location', async () => {
    // Given three stock rows at three different locations, with three
    // different quantities
    const client = makeRecordingClient()

    // When the payload is uploaded
    await importCloudData(fullPayload(), 'clear', client as never)

    // Then each row carries its OWN locationId, not one shared location
    const uploaded = variablesOf(client, 'BulkCreateItemStocks')
      ?.itemStocks as Array<{
      id: string
      itemId: string
      locationId: string
      packedQuantity: number
    }>
    expect(uploaded.map((s) => [s.id, s.locationId, s.packedQuantity])).toEqual(
      [
        // the payload default, remapped onto the destination's default
        ['stock_home', CLOUD_DEFAULT_ID, 1],
        ['stock_garage', 'loc_garage', 7],
        ['stock_office', 'loc_office', 3],
      ],
    )
    // And the three locations really are three, not one repeated
    expect(new Set(uploaded.map((s) => s.locationId)).size).toBe(3)
  })

  it('user replacing cloud data creates the locations first and upserts the stock last', async () => {
    // Given an account that already holds `item_1` under the same id
    const client = makeRecordingClient()
    client.query.mockImplementation(({ query: doc }: { query: unknown }) => {
      if (opName(doc) === 'GetLocations') {
        return Promise.resolve({
          data: {
            locations: [
              {
                id: CLOUD_DEFAULT_ID,
                name: 'My Home',
                order: 0,
                isDefault: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        })
      }
      return Promise.resolve({
        data: {
          items: [{ id: 'item_1', name: 'Milk' }],
          tags: [],
          tagTypes: [],
          vendors: [],
          recipes: [],
          inventoryLogs: [],
          shoppingCarts: [],
          allCartItems: [],
          shelves: [],
        },
      })
    })

    // When the payload is imported with the replace strategy
    await importCloudData(fullPayload(), 'replace', client as never)

    // Then locations are CREATED, before the carts that name them, and stock
    // is UPSERTED on the second pass so the payload's quantities win
    const order = mutationOrder(client)
    expect(order).toContain('BulkCreateLocations')
    expect(order).not.toContain('BulkUpsertLocations')
    expect(order).toContain('BulkUpsertItemStocks')
    expect(order).not.toContain('BulkCreateItemStocks')
    expect(order.indexOf('BulkCreateLocations')).toBeLessThan(
      order.indexOf('BulkCreateShoppingCarts'),
    )
    expect(order.indexOf('BulkUpsertItemStocks')).toBeGreaterThan(
      order.indexOf('BulkUpsertItems'),
    )
    // And all three stock rows go up, including the one for the item that
    // already existed
    const upserted = variablesOf(client, 'BulkUpsertItemStocks')
      ?.itemStocks as Array<{ id: string }>
    expect(upserted.map((s) => s.id)).toEqual([
      'stock_home',
      'stock_garage',
      'stock_office',
    ])
  })

  it('user watching the progress bar sees a total that matches what is sent', async () => {
    // Given a payload with one batch for each of the eleven entities
    const client = makeRecordingClient()
    const progress: Array<{ completedBatches: number; totalBatches: number }> =
      []

    // When it is uploaded
    await importCloudData(fullPayload(), 'clear', client as never, {
      onProgress: (p) => progress.push(p),
    })

    // Then `computeTotalBatches` counted exactly the batches the loop sent —
    // the eleven bulk mutations, not counting `ClearAllData`
    const sentBatches = mutationOrder(client).filter(
      (name) => name !== 'ClearAllData',
    ).length
    expect(sentBatches).toBe(11)
    expect(progress[0].totalBatches).toBe(sentBatches)
    // And the bar reaches the end rather than stopping short or overrunning
    const last = progress[progress.length - 1]
    expect(last.completedBatches).toBe(last.totalBatches)
  })

  it('user retrying a failed import does not re-send the locations and stock already sent', async () => {
    // Given a session that already recorded the locations and stock batches
    const client = makeRecordingClient()
    const payload = fullPayload()
    const session: ImportSession = {
      payload,
      strategy: 'clear',
      completedBatchKeys: new Set(['locations:0', 'itemStocks:0']),
    }

    // When the import is retried with that session
    await importCloudData(payload, 'clear', client as never, { session })

    // Then neither is uploaded again
    const order = mutationOrder(client)
    expect(order).not.toContain('BulkCreateLocations')
    expect(order).not.toContain('BulkCreateItemStocks')
    // And every other entity still is
    expect(order).toContain('BulkCreateItems')
    expect(order).toContain('BulkCreateShoppingCarts')
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

// ---------------------------------------------------------------------------
// THE REMAP RULE — cloud locations PR 4 design §1, built by PR 4b task 3.
//
//   Preserve payload location ids verbatim, except the payload's default,
//   which maps onto the destination's default.
//
// This block replaces two describes that PR 4b deleted:
//
//   - `importCloudData — local → cloud stock flattening (v15 split)`, 7 its,
//     which pinned the OPPOSITE behaviour: one location's stock inlined onto
//     the item, every other location's carts and logs thrown away, cart ids
//     stripped of their prefix;
//   - `resolveFlattenLocationId — cloud file import cannot silently zero
//     stock`, 7 its, which pinned WHICH location to collapse onto. There is no
//     such choice any more, so the function and its tests went together.
//
// Three of those 14 covered a rule 4b keeps, in inverted form, and they are
// re-asserted below: every location's logs travel, a legacy payload is not
// rewritten, and a backup whose locations are all unknown here is neither
// refused nor collapsed.
// ---------------------------------------------------------------------------

describe('buildLocationRemap / applyLocationRemap — the remap rule', () => {
  // THREE locations: the payload's default plus TWO others. Two is the
  // minimum that can catch "map every location onto the destination default"
  // — with one non-default location that mutation is indistinguishable from
  // the correct rule, because a single id mapped to a single id looks right
  // either way.
  const PAYLOAD_LOCATIONS = [
    { id: 'local', name: 'My Home', order: 0, isDefault: true },
    { id: 'loc_garage', name: 'my Garage', order: 1, isDefault: false },
    { id: 'loc_office', name: 'Office', order: 2, isDefault: false },
  ]

  function stockAt(id: string, locationId: string) {
    return {
      id,
      itemId: 'item-1',
      locationId,
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  function remapped(
    payload: ExportPayload,
    destinationDefaultId: string | null,
  ) {
    return applyLocationRemap(
      payload,
      buildLocationRemap(payload, destinationDefaultId),
    )
  }

  it('maps the payload default onto the destination default and nothing else', () => {
    // Given a payload with one default location and two others
    const payload = emptyPayload({ locations: PAYLOAD_LOCATIONS })

    // When the remap is built against a destination whose default is a cuid
    const remap = buildLocationRemap(payload, 'cloud_default')

    // Then it holds exactly one entry — identity is expressed by ABSENCE
    expect([...remap.entries()]).toEqual([['local', 'cloud_default']])
  })

  it('a three-location payload still has three locations after the remap', () => {
    // Given the same payload
    const payload = emptyPayload({
      locations: PAYLOAD_LOCATIONS,
      itemStocks: [
        stockAt('s-home', 'local'),
        stockAt('s-garage', 'loc_garage'),
        stockAt('s-office', 'loc_office'),
      ],
    })

    // When it is remapped
    const result = remapped(payload, 'cloud_default')

    // Then only the default's id changed — the other two are verbatim
    expect(
      (result.locations as Array<{ id: string }>).map((l) => l.id),
    ).toEqual(['cloud_default', 'loc_garage', 'loc_office'])

    // And each stock row still names the location it was written for
    expect(
      (result.itemStocks as Array<{ id: string; locationId: string }>).map(
        (s) => [s.id, s.locationId],
      ),
    ).toEqual([
      ['s-home', 'cloud_default'],
      ['s-garage', 'loc_garage'],
      ['s-office', 'loc_office'],
    ])
  })

  it('nothing is remapped when the destination has no default', () => {
    // Given a payload with a default, and a destination that reports none
    const payload = emptyPayload({ locations: PAYLOAD_LOCATIONS })

    // Then the map is empty and every id is kept
    expect(buildLocationRemap(payload, null).size).toBe(0)
  })

  it('nothing is remapped when both defaults already share an id', () => {
    // Given a cloud → same-cloud restore: the payload default IS the
    // destination default
    const payload = emptyPayload({
      locations: [
        { id: 'cloud_default', name: 'Home', order: 0, isDefault: true },
      ],
    })

    // Then there is no non-identity entry to make
    expect(buildLocationRemap(payload, 'cloud_default').size).toBe(0)
  })

  it('a pre-v18 backup with no isDefault key treats the local id as its default', () => {
    // Given a backup written before Dexie v18 added `Location.isDefault`
    const payload = emptyPayload({
      locations: [
        { id: 'local', name: 'My Home', order: 0 },
        { id: 'loc_garage', name: 'my Garage', order: 1 },
      ],
    })

    // Then `DEFAULT_LOCATION_ID` is the default, because in local mode it
    // always was
    expect([...buildLocationRemap(payload, 'cloud_default').entries()]).toEqual(
      [['local', 'cloud_default']],
    )
  })

  it('a payload with no locations array names no default', () => {
    // Given a pre-v15 file: no `locations` key at all
    const payload = legacyPayload()

    // Then nothing can be remapped, and nothing needs to be
    expect(buildLocationRemap(payload, 'cloud_default').size).toBe(0)
  })

  it('a cart id whose vendor id contains a colon survives the remap', () => {
    // Given a vendor id with a ':' in it — `bulkCreateVendors` stores
    // `VendorInput.id` verbatim with no format check, so this is reachable
    const payload = emptyPayload({
      locations: PAYLOAD_LOCATIONS,
      shoppingCarts: [
        { id: 'local:ven:dor_1' },
        { id: 'loc_garage:ven:dor_1' },
      ],
      cartItems: [
        makeCartItem('ci-1', 'local:ven:dor_1', 'item-1'),
        makeCartItem('ci-2', 'loc_garage:ven:dor_1', 'item-1'),
      ],
    })

    // When remapped
    const result = remapped(payload, 'cloud_default')

    // Then only the LOCATION half moved; the vendor id kept both its parts
    expect(
      (result.shoppingCarts as Array<{ id: string }>).map((c) => c.id),
    ).toEqual(['cloud_default:ven:dor_1', 'loc_garage:ven:dor_1'])
    expect(
      (result.cartItems as Array<{ cartId: string }>).map((ci) => ci.cartId),
    ).toEqual(['cloud_default:ven:dor_1', 'loc_garage:ven:dor_1'])
  })

  it('a bare cart id with no colon is left alone', () => {
    // Given a pre-PR-3b cart id that names no location
    const payload = emptyPayload({
      locations: PAYLOAD_LOCATIONS,
      shoppingCarts: [{ id: 'no-vendor' }],
      cartItems: [makeCartItem('ci-1', 'no-vendor', 'item-1')],
    })

    // Then it is not turned into `cloud_default:no-vendor` — no location
    // matches the whole id, so the remap has nothing to say about it
    const result = remapped(payload, 'cloud_default')
    expect((result.shoppingCarts as Array<{ id: string }>)[0].id).toBe(
      'no-vendor',
    )
    expect((result.cartItems as Array<{ cartId: string }>)[0].cartId).toBe(
      'no-vendor',
    )
  })

  it('a log keeps its own location, and a log with none stays without one', () => {
    // Given three logs: one at the default, one elsewhere, one pre-Location
    const payload = emptyPayload({
      locations: PAYLOAD_LOCATIONS,
      inventoryLogs: [
        { ...makeInventoryLog('log-home'), locationId: 'local' },
        { ...makeInventoryLog('log-garage'), locationId: 'loc_garage' },
        makeInventoryLog('log-legacy'),
      ],
    })

    // When remapped
    const result = remapped(payload, 'cloud_default')

    // Then only the default's log moved, and the un-scoped one gained no id
    expect(
      (result.inventoryLogs as Array<{ id: string; locationId?: string }>).map(
        (l) => [l.id, l.locationId],
      ),
    ).toEqual([
      ['log-home', 'cloud_default'],
      ['log-garage', 'loc_garage'],
      ['log-legacy', undefined],
    ])
  })
})

describe('importCloudData — every location travels to cloud (PR 4b task 3)', () => {
  const EMPTY_EXISTING = {
    items: [],
    tags: [],
    tagTypes: [],
    vendors: [],
    recipes: [],
    inventoryLogs: [],
    shoppingCarts: [],
    allCartItems: [],
    shelves: [],
  }

  function makeCloudClient(destinationLocations: unknown[] = []) {
    return {
      mutate: vi.fn().mockResolvedValue({}),
      resetStore: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({
        data: { ...EMPTY_EXISTING, locations: destinationLocations },
      }),
    }
  }

  /** The rows sent under one variable name, across every mutation Apollo saw. */
  function sentOf(
    client: { mutate: ReturnType<typeof vi.fn> },
    key: string,
  ): Record<string, unknown>[] {
    const call = client.mutate.mock.calls.find(
      (c) => (c[0]?.variables as Record<string, unknown>)?.[key] !== undefined,
    )
    if (!call) return []
    return (call[0].variables as Record<string, Record<string, unknown>[]>)[key]
  }

  const DESTINATION = [
    { id: 'cloud_default', name: 'Home', order: 0, isDefault: true },
  ]

  const PAYLOAD_LOCATIONS = [
    { id: 'local', name: 'My Home', order: 0, isDefault: true },
    { id: 'loc_garage', name: 'my Garage', order: 1, isDefault: false },
  ]

  it('user copying a pantry to cloud sends the default location’s carts under the destination’s default id', async () => {
    // Given one cart at the payload's default and one at the Garage
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Milk')],
      locations: PAYLOAD_LOCATIONS,
      shoppingCarts: [{ id: 'local:vendor_1' }, { id: 'loc_garage:no-vendor' }],
      cartItems: [
        makeCartItem('ci-1', 'local:vendor_1', 'item-1'),
        makeCartItem('ci-2', 'loc_garage:no-vendor', 'item-1'),
      ],
    })
    const client = makeCloudClient(DESTINATION)

    // When the pantry is copied up
    await importCloudData(payload, 'skip', client as never)

    // Then the default's cart arrives under the DESTINATION default's id,
    // and the Garage's cart is untouched
    expect(sentOf(client, 'carts').map((c) => c.id)).toEqual([
      'cloud_default:vendor_1',
      'loc_garage:no-vendor',
    ])
    expect(sentOf(client, 'cartItems').map((c) => c.cartId)).toEqual([
      'cloud_default:vendor_1',
      'loc_garage:no-vendor',
    ])
  })

  // Replaces the deleted `inventory logs from other locations are not sent`.
  // That test pinned the filter 4b removes; this one pins its absence.
  it('user copying a pantry to cloud keeps the logs of every location', async () => {
    // Given logs recorded at two locations plus one pre-Location log
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Milk')],
      locations: PAYLOAD_LOCATIONS,
      inventoryLogs: [
        { ...makeInventoryLog('log-home'), locationId: 'local' },
        { ...makeInventoryLog('log-garage'), locationId: 'loc_garage' },
        makeInventoryLog('log-legacy'),
      ],
    })
    const client = makeCloudClient(DESTINATION)

    // When the pantry is copied up
    await importCloudData(payload, 'skip', client as never)

    // Then all three travel, each naming the location it belongs to
    expect(sentOf(client, 'logs').map((l) => [l.id, l.locationId])).toEqual([
      ['log-home', 'cloud_default'],
      ['log-garage', 'loc_garage'],
      ['log-legacy', undefined],
    ])
  })

  // THE ORDERING HAZARD. `clearAllData` deletes every Location row and
  // `ensureDefaultLocation` re-creates a default lazily, so the destination's
  // default id BEFORE the clear is not the one that exists after it. PR 4a
  // shipped that bug and it cost a full E2E gate run to find.
  it('user clearing cloud before an import maps onto the default that exists after the clear', async () => {
    // Given a destination whose default id changes when the data is cleared
    let cleared = false
    const client = {
      mutate: vi.fn(async (opts: { mutation: unknown }) => {
        if (opts.mutation === ClearAllDataDocument) cleared = true
        return {}
      }),
      resetStore: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(async () => ({
        data: {
          ...EMPTY_EXISTING,
          locations: [
            {
              id: cleared ? 'cloud_default_after' : 'cloud_default_before',
              name: 'Home',
              order: 0,
              isDefault: true,
            },
          ],
        },
      })),
    }
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Milk')],
      locations: PAYLOAD_LOCATIONS,
      shoppingCarts: [{ id: 'local:vendor_1' }],
      cartItems: [makeCartItem('ci-1', 'local:vendor_1', 'item-1')],
    })

    // When the import clears cloud first
    await importCloudData(payload, 'clear', client as never)

    // Then the cart names the default that exists NOW, not the deleted one
    expect(sentOf(client, 'carts').map((c) => c.id)).toEqual([
      'cloud_default_after:vendor_1',
    ])
  })

  // Replaces the deleted `a cloud-shaped payload (no itemStocks) passes
  // through untouched`. The old test used the absent `itemStocks` key as the
  // signal "already flat"; 4b removed that sniff test. What survives is the
  // outcome: a legacy payload names no default, so nothing is rewritten.
  it('a legacy payload with no locations is uploaded unchanged', async () => {
    // Given a pre-v15 backup: no `locations`, no `itemStocks`, bare cart ids
    const payload = legacyPayload({
      items: [{ ...makeItem('item-1', 'Milk'), packedQuantity: 7 }],
      shoppingCarts: [{ id: 'no-vendor' }],
      cartItems: [makeCartItem('ci-1', 'no-vendor', 'item-1')],
    })
    const client = makeCloudClient(DESTINATION)

    // When it is imported into cloud
    await importCloudData(payload, 'skip', client as never)

    // Then its ids are not rewritten
    expect(sentOf(client, 'carts').map((c) => c.id)).toEqual(['no-vendor'])
    expect(sentOf(client, 'cartItems').map((c) => c.cartId)).toEqual([
      'no-vendor',
    ])
  })

  // Replaces the three deleted `resolveFlattenLocationId` refusal tests. They
  // asserted that a backup whose locations are unknown on this device must be
  // REFUSED rather than collapsed onto one of them. 4b needs no such refusal:
  // every location is carried, so there is nothing to lose and nothing to
  // guess.
  it('user restoring a backup from another device keeps all of its locations', async () => {
    // Given a backup whose three location ids exist nowhere on this account
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Milk')],
      locations: [
        { id: 'kitchen-a1b2', name: 'Kitchen', order: 0, isDefault: true },
        { id: 'garage-c3d4', name: 'Garage', order: 1, isDefault: false },
        { id: 'shed-e5f6', name: 'Shed', order: 2, isDefault: false },
      ],
      shoppingCarts: [
        { id: 'kitchen-a1b2:vendor_1' },
        { id: 'garage-c3d4:no-vendor' },
        { id: 'shed-e5f6:no-vendor' },
      ],
      cartItems: [
        makeCartItem('ci-1', 'kitchen-a1b2:vendor_1', 'item-1'),
        makeCartItem('ci-2', 'garage-c3d4:no-vendor', 'item-1'),
        makeCartItem('ci-3', 'shed-e5f6:no-vendor', 'item-1'),
      ],
    })
    const client = makeCloudClient(DESTINATION)

    // When it is imported
    await importCloudData(payload, 'skip', client as never)

    // Then no cart is dropped, and only the backup's own default is remapped
    expect(sentOf(client, 'carts').map((c) => c.id)).toEqual([
      'cloud_default:vendor_1',
      'garage-c3d4:no-vendor',
      'shed-e5f6:no-vendor',
    ])
    expect(sentOf(client, 'cartItems')).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// TARGET BEHAVIOUR FOR CLOUD LOCATIONS PR 4b. THIS BLOCK IS RED UNTIL TASK 3.
//
// Plan: docs/features/locations/2026-10-03-cloud-locations-plan-pr4b.md —
// task 1 part 1 writes these tests, task 3 deletes the code that makes them
// fail. A red result here is the CORRECT state of the tree until then.
//
// WHAT IS BEING PINNED
//
// A cart id carries its location. Local ids are
// `${locationId}:${vendorId | 'no-vendor'}` (db/operations.ts:720), and cloud
// ids have had the SAME shape since cloud-locations PR 3b
// (apps/server/src/lib/cartId.ts). So the id must travel to cloud unchanged.
//
// `flattenPayloadForCloud` (importData.ts) still does two things to it, both
// written before PR 3b and both wrong now:
//
//   1. it SLICES the location prefix off, so `loc_garage:no-vendor` is
//      uploaded as the bare `no-vendor`;
//   2. it DROPS every cart belonging to any other location.
//
// Why (1) is a cross-account hazard, read from the code:
//
//   - `Cart.id` is a GLOBAL primary key with no `userId` in it
//     (apps/server/prisma/schema.prisma), so the first account to import a
//     bare `no-vendor` holds that id for everybody;
//   - `bulkCreateShoppingCarts` (import.resolver.ts:642) looks the id up with
//     an UNSCOPED `findUnique({ where: { id } })` and `continue`s when it is
//     taken, so the second account gets no cart row of its own;
//   - `bulkCreateCartItems` (import.resolver.ts:669) resolves `cartId` with
//     the same unscoped `findUnique`, so the second account's cart items are
//     created pointing at the FIRST account's cart row.
//
// DO NOT make these tests pass by restoring the strip. The strip is the bug,
// not the cure — its own comment ("would collide with it on the un-prefixed
// cloud id") describes the world before PR 3b.
//
// The server-side half of the hazard — a bare id shared across two accounts —
// is characterised in `e2e/tests/cart-id-cross-user-leak.spec.ts`. That spec
// is GREEN today and stays green after this PR, so it is a negative control,
// not the proof. These two tests are the proof.
// ---------------------------------------------------------------------------

describe('importCloudData — a cart id keeps its location prefix (PR 4b task 3)', () => {
  function makeCloudClient() {
    return {
      mutate: vi.fn().mockResolvedValue({}),
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

  /** The rows sent under one variable name, across every mutation Apollo saw. */
  function sentOf(
    client: { mutate: ReturnType<typeof vi.fn> },
    key: string,
  ): Record<string, unknown>[] {
    const call = client.mutate.mock.calls.find(
      (c) => (c[0]?.variables as Record<string, unknown>)?.[key] !== undefined,
    )
    if (!call) return []
    return (call[0].variables as Record<string, Record<string, unknown>[]>)[key]
  }

  // Three locations: the payload's default plus two others. The carts below
  // live at the NON-default ones on purpose. PR 4b's remap rule keeps every
  // payload location id verbatim EXCEPT the payload's default, which maps onto
  // the destination account's own default — so a cart prefixed with the
  // payload default would legitimately change id and could not be asserted
  // verbatim here.
  const LOCATIONS = [
    { id: 'local', name: 'My Home', order: 0, isDefault: true },
    { id: 'loc_garage', name: 'my Garage', order: 1, isDefault: false },
    { id: 'loc_office', name: 'Office', order: 2, isDefault: false },
  ]

  it('user copying a pantry to cloud keeps each cart id prefixed with its location', async () => {
    // Given two carts at the Garage, named by the local composite id shape
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Milk')],
      locations: LOCATIONS,
      itemStocks: [],
      shoppingCarts: [
        makeShoppingCart('loc_garage:no-vendor'),
        makeShoppingCart('loc_garage:vendor_1'),
      ],
      cartItems: [
        makeCartItem('ci-1', 'loc_garage:no-vendor', 'item-1'),
        makeCartItem('ci-2', 'loc_garage:vendor_1', 'item-1'),
      ],
    })
    const client = makeCloudClient()

    // When the cloud upload payload is built
    // NOTE: `locationId` is passed only so TODAY's flatten keeps these carts
    // instead of dropping them, which makes the failure show the STRIP rather
    // than the drop. Task 7 removes this option from `importCloudData`; delete
    // the argument then. Every assertion below stands unchanged.
    await importCloudData(payload, 'skip', client as never, {
      locationId: 'loc_garage',
    })

    // Then both ids are still prefixed with the location they belong to
    expect(sentOf(client, 'carts').map((c) => c.id)).toEqual([
      'loc_garage:no-vendor',
      'loc_garage:vendor_1',
    ])

    // And the cart items still point at those same ids
    expect(
      sentOf(client, 'cartItems').map((c) => ({ id: c.id, cartId: c.cartId })),
    ).toEqual([
      { id: 'ci-1', cartId: 'loc_garage:no-vendor' },
      { id: 'ci-2', cartId: 'loc_garage:vendor_1' },
    ])
  })

  it('user copying a pantry to cloud keeps the carts of every location, not just one', async () => {
    // Given one cart at the Garage and one at the Office
    const payload = emptyPayload({
      items: [makeItem('item-1', 'Milk')],
      locations: LOCATIONS,
      itemStocks: [],
      shoppingCarts: [
        makeShoppingCart('loc_garage:vendor_1'),
        makeShoppingCart('loc_office:no-vendor'),
      ],
      cartItems: [
        makeCartItem('ci-1', 'loc_garage:vendor_1', 'item-1'),
        makeCartItem('ci-2', 'loc_office:no-vendor', 'item-1'),
      ],
    })
    const client = makeCloudClient()

    // When the cloud upload payload is built, with no location named
    await importCloudData(payload, 'skip', client as never)

    // Then neither location's cart has been thrown away
    expect(
      sentOf(client, 'carts')
        .map((c) => c.id as string)
        .sort(),
    ).toEqual(['loc_garage:vendor_1', 'loc_office:no-vendor'])

    // And both cart items travel with them
    expect(
      sentOf(client, 'cartItems')
        .map((c) => c.cartId as string)
        .sort(),
    ).toEqual(['loc_garage:vendor_1', 'loc_office:no-vendor'])
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
