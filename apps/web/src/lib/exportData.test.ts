import type { ApolloClient } from '@apollo/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  AllCartItemsDocument,
  AllItemStocksDocument,
  GetItemsDocument,
  GetLocationsDocument,
  GetRecipesDocument,
  GetShelvesDocument,
  GetTagsDocument,
  GetTagTypesDocument,
  GetVendorsDocument,
  InventoryLogsDocument,
  ShoppingCartsDocument,
} from '@/generated/graphql'
import {
  buildExportPayload,
  fetchCloudPayload,
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

describe('fetchLocalPayload — item stock and locations (v15 split)', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.locations.clear()
  })

  it('user can export a multi-location pantry with its stock', async () => {
    // Given two locations, one item, and a stock row in each location
    const now = new Date('2026-02-01T00:00:00.000Z')
    await db.locations.bulkPut([
      {
        id: 'local',
        name: 'My Home',
        order: 0,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'office',
        name: 'Office',
        order: 1,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      },
    ])
    await db.items.put({
      id: 'item-1',
      name: 'Milk',
      tagIds: [],
      createdAt: now,
      updatedAt: now,
    })
    await db.itemStocks.bulkPut([
      {
        id: 'stock-home',
        itemId: 'item-1',
        locationId: 'local',
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 1,
        packedQuantity: 3,
        unpackedQuantity: 0,
        consumeAmount: 1,
        packageUnit: 'bottle',
        dueDate: new Date('2026-03-01T00:00:00.000Z'),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'stock-office',
        itemId: 'item-1',
        locationId: 'office',
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 0,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
        createdAt: now,
        updatedAt: now,
      },
    ])

    // When the local export payload is fetched
    const payload = await fetchLocalPayload()

    // Then both locations and both stock rows are exported
    expect(
      (payload.locations ?? []).map((l) => (l as { id: string }).id),
    ).toEqual(expect.arrayContaining(['local', 'office']))
    const stocks = (payload.itemStocks ?? []) as Array<Record<string, unknown>>
    expect(stocks).toHaveLength(2)

    // And the stock values that no longer live on the Item survive the export
    const home = stocks.find((s) => s.id === 'stock-home')
    expect(home).toMatchObject({
      itemId: 'item-1',
      locationId: 'local',
      packedQuantity: 3,
      targetQuantity: 4,
      packageUnit: 'bottle',
    })
    expect(home?.dueDate).toBeInstanceOf(Date)
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

// ---------------------------------------------------------------------------
// fetchCloudPayload — the cloud backup file
//
// This had NO test before cloud locations PR 4b: every consumer mocks the
// function out (DataModeCard/index.test.tsx, ExportCard/index.test.tsx), so
// nothing exercised the real one.
//
// The fake client answers each of the eleven queries by DOCUMENT IDENTITY. A
// query the fixture does not name resolves to `{}`, which `fetchCloudPayload`
// reads as an empty array — so a missing document shows up as a missing
// entity, never as a thrown error that hides which query was dropped.
// ---------------------------------------------------------------------------

// TWO locations, and the office one is NOT the default. With a single location
// "every location's stock" and "the only location's stock" are the same
// answer, so a one-location fixture cannot tell a correct implementation from
// one that ignores location entirely (root CLAUDE.md, Proving a Test Works).
const CLOUD_LOCATIONS = [
  {
    __typename: 'Location',
    id: 'loc-home',
    name: 'My Home',
    order: 0,
    isDefault: true,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
  {
    __typename: 'Location',
    id: 'loc-office',
    name: 'Office',
    order: 1,
    isDefault: false,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
]

// One stock row in EACH location, with different quantities, so a payload that
// carried only one location's rows would be visible.
const CLOUD_ITEM_STOCKS = [
  {
    __typename: 'ItemStock',
    id: 'stock-home',
    itemId: 'item-1',
    locationId: 'loc-home',
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 3,
    unpackedQuantity: 0,
    dueDate: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
  {
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
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
]

const CLOUD_LOGS = [
  {
    __typename: 'InventoryLog',
    id: 'log-1',
    itemId: 'item-1',
    // The log sits at the NON-default location. A payload that lost the field
    // would restore it to the default, so the two cannot be the same id here.
    locationId: 'loc-office',
    delta: -1,
    quantity: 2,
    occurredAt: '2026-02-10T08:00:00.000Z',
    note: null,
    logKey: 'log.cooked',
    logParams: { recipe: 'Smoothie' },
  },
]

function makeCloudClient(
  overrides: Map<unknown, unknown> = new Map(),
): ApolloClient {
  const answers = new Map<unknown, unknown>([
    [GetItemsDocument, { items: [] }],
    [GetTagsDocument, { tags: [] }],
    [GetTagTypesDocument, { tagTypes: [] }],
    [GetVendorsDocument, { vendors: [] }],
    [GetRecipesDocument, { recipes: [] }],
    [InventoryLogsDocument, { inventoryLogs: CLOUD_LOGS }],
    [ShoppingCartsDocument, { allCarts: [] }],
    [AllCartItemsDocument, { allCartItems: [] }],
    [GetShelvesDocument, { shelves: [] }],
    [GetLocationsDocument, { locations: CLOUD_LOCATIONS }],
    [AllItemStocksDocument, { allItemStocks: CLOUD_ITEM_STOCKS }],
    ...overrides,
  ])

  return {
    query: async ({ query }: { query: unknown }) => ({
      data: answers.get(query) ?? {},
    }),
  } as unknown as ApolloClient
}

describe('fetchCloudPayload — the cloud backup is lossless', () => {
  it('user can export every location, not only the default one', async () => {
    // Given a cloud account with two locations, one of them not the default
    const client = makeCloudClient()

    // When the cloud export payload is fetched
    const payload = await fetchCloudPayload(client)

    // Then both locations are in the file, each by its own id
    const locations = (payload.locations ?? []) as Array<
      Record<string, unknown>
    >
    expect(locations).toHaveLength(2)
    expect(locations.map((l) => l.id).sort()).toEqual([
      'loc-home',
      'loc-office',
    ])
    expect(locations.find((l) => l.id === 'loc-office')?.name).toBe('Office')

    // And `isDefault` IS kept in the file, while Apollo's `__typename` is not.
    //
    // THIS ASSERTION WAS INVERTED UNTIL PR 4b TASK 3. It read
    // `not.toHaveProperty('isDefault')`, on the grounds that `LocationInput`
    // has no such field — true, and not the question. The flag is never
    // UPLOADED (`toLocationInput` drops it, and the server would reject a
    // second default with a P2002), but the BACKUP FILE is the only place the
    // import side can learn which of the payload's locations is its default.
    // `findPayloadDefaultLocationId` (lib/importData.ts) reads this flag and
    // nothing else, so dropping it here made the remap rule a no-op for every
    // cloud-sourced payload: restoring your own cloud backup with "clear and
    // import" would leave a stray empty default location beside the restored
    // one, because `clearAllData` deletes the old default and
    // `ensureDefaultLocation` creates a new id in its place.
    //
    // The comment beside the `GetLocations` call in `fetchCloudPayload`
    // already claimed "the backup records it" while this test asserted the
    // opposite. The comment was the intent; the test was the accident.
    for (const location of locations) {
      expect(location).not.toHaveProperty('__typename')
    }
    expect(locations.find((l) => l.id === 'loc-home')?.isDefault).toBe(true)
    expect(locations.find((l) => l.id === 'loc-office')?.isDefault).toBe(false)
  })

  it('user can export the stock held in each location separately', async () => {
    // Given one item stocked in BOTH locations, with different quantities
    const client = makeCloudClient()

    // When the cloud export payload is fetched
    const payload = await fetchCloudPayload(client)

    // Then both rows are present, each naming its own location
    const stocks = (payload.itemStocks ?? []) as Array<Record<string, unknown>>
    expect(stocks).toHaveLength(2)

    const home = stocks.find((st) => st.locationId === 'loc-home')
    const office = stocks.find((st) => st.locationId === 'loc-office')
    expect(home).toMatchObject({
      id: 'stock-home',
      itemId: 'item-1',
      locationId: 'loc-home',
      packedQuantity: 3,
      targetQuantity: 4,
    })
    expect(office).toMatchObject({
      id: 'stock-office',
      itemId: 'item-1',
      locationId: 'loc-office',
      packedQuantity: 2,
      targetQuantity: 1,
    })

    // And the two quantities differ, so a payload carrying one location's
    // rows twice could not pass this
    expect(home?.packedQuantity).not.toBe(office?.packedQuantity)
    expect(home?.dueDate).toBe('2026-03-01T00:00:00.000Z')
    expect(office?.dueDate).toBeUndefined()
    expect(office).not.toHaveProperty('__typename')
  })

  it('user can export a log with its location and its message', async () => {
    // Given a log at the non-default location, carrying a translated message
    const client = makeCloudClient()

    // When the cloud export payload is fetched
    const payload = await fetchCloudPayload(client)

    // Then locationId, logKey and logParams all survive. All three were
    // dropped before PR 4b: locationId was not on the query, and logKey /
    // logParams were on neither the query nor the mapper.
    const logs = payload.inventoryLogs as Array<Record<string, unknown>>
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      id: 'log-1',
      locationId: 'loc-office',
      logKey: 'log.cooked',
      logParams: { recipe: 'Smoothie' },
    })
    expect(logs[0]).not.toHaveProperty('__typename')
  })
})
