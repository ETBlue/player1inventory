import type { APIRequestContext } from '@playwright/test'
import { makeGql } from '../utils/cloud'
import {
  defaultFixtureLocation,
  type Fixture,
  stockQuantities,
} from './fixture'

// Cloud mode's half of the shared fixture (helpers/fixture.ts). It writes the
// same data `seedLocalFixture` writes, into Postgres through GraphQL, as
// E2E_USER_ID.
//
// Every entity except a location keeps the fixture's own fixed id: `ItemInput`,
// `VendorInput`, `ShelfInput` and `RecipeInput` all declare `id: ID!`. There is
// no `LocationInput` and no `ItemStockInput` in the import schema until PR 4,
// so location ids have to come back from the server and stock is written one
// row at a time through `upsertItemStock`.

type LocationRow = { id: string; name: string; isDefault: boolean }
type StockRow = { itemId: string; locationId: string }

const LOCATIONS_QUERY = `query { locations { id name isDefault } }`
const CREATE_LOCATION = `mutation ($name: String!) { createLocation(name: $name) { id name isDefault } }`
const RENAME_LOCATION = `mutation ($id: ID!, $name: String!) { updateLocation(id: $id, input: { name: $name }) { id name } }`
const BULK_VENDORS = `mutation ($vendors: [VendorInput!]!) { bulkCreateVendors(vendors: $vendors) { id } }`
const BULK_ITEMS = `mutation ($items: [ItemInput!]!) { bulkCreateItems(items: $items) { id } }`
const BULK_SHELVES = `mutation ($shelves: [ShelfInput!]!) { bulkCreateShelves(shelves: $shelves) { id } }`
const BULK_RECIPES = `mutation ($recipes: [RecipeInput!]!) { bulkCreateRecipes(recipes: $recipes) { id } }`
const STOCKS_FOR_ITEM = `query ($itemId: ID!) { itemStocksForItem(itemId: $itemId) { itemId locationId } }`
const REMOVE_STOCK = `mutation ($itemId: ID!, $locationId: ID!) { removeItemFromLocation(itemId: $itemId, locationId: $locationId) }`
const UPSERT_STOCK = `mutation ($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
}`

/**
 * Read the caller's locations and return the default one, creating it if the
 * `locations` query has never run for this user.
 *
 * `seedCloudFixture` needs the default location's ID AND NAME: the id to map the
 * fixture's default location key onto, the name to decide whether to rename it. So
 * this helper is required regardless of what the server does on its own.
 *
 * It began as a workaround for a server bug (issue #287, fixed 2026-09-16). A stock
 * write that arrived before the user's first `locations` query used to be dropped in
 * silence — `mirrorStockToDefaultLocation` (apps/server/src/lib/stockDualWrite.ts)
 * ended with `if (!locationId) return`, so the item was created, `Item`'s legacy
 * columns were set, and no `ItemStock` row was written. The pantry then rendered the
 * item below the "not stocked here" divider showing 0.
 *
 * That is fixed at the source: `ensureDefaultLocation` (apps/server/src/lib/
 * defaultLocation.ts) now creates the location instead of returning null, and every
 * stock write path goes through it. A cloud seed no longer has to call this first to
 * avoid losing writes — but calling it first is still the clearer way to write a
 * seed, and it is how this helper gets the id it returns.
 *
 * The bug was invisible until 2026-09-14, because `/e2e/cleanup` did not delete
 * `Location`. Every run inherited the previous run's default location, so the mirror
 * always had somewhere to write.
 */
export async function ensureCloudDefaultLocation(
  request: APIRequestContext,
): Promise<{ id: string; name: string }> {
  const gql = makeGql(request)
  const { locations } = await gql<{ locations: LocationRow[] }>(LOCATIONS_QUERY)
  const serverDefault = locations.find((loc) => loc.isDefault)
  if (!serverDefault) {
    throw new Error(
      `ensureCloudDefaultLocation: no default location after the locations query — got ${JSON.stringify(locations)}`,
    )
  }
  return serverDefault
}

/**
 * Seed `fixture` into the cloud database and return
 * `Record<locationKey, serverLocationId>`.
 */
export async function seedCloudFixture(
  request: APIRequestContext,
  fixture: Fixture,
): Promise<Record<string, string>> {
  const gql = makeGql(request)
  const now = new Date().toISOString()
  const defaultLocation = defaultFixtureLocation(fixture)
  const locationIds: Record<string, string> = {}

  // 1. Reading `locations` is what runs `ensureDefaultLocation`
  //    (location.resolver.ts), so the caller's default location exists from
  //    here on. Its id is a cuid, never the local `'local'` sentinel.
  const serverDefault = await ensureCloudDefaultLocation(request)
  locationIds[defaultLocation.key] = serverDefault.id

  // The server names its default location from DEFAULT_LOCATION_NAME
  // ('My Home', location.resolver.ts). Rename it when the fixture disagrees, so
  // the fixture stays the single description of the data in both modes instead
  // of silently inheriting a server constant.
  if (serverDefault.name !== defaultLocation.name) {
    await gql(RENAME_LOCATION, {
      id: serverDefault.id,
      name: defaultLocation.name,
    })
  }

  // 2. Every other location is created, and its server id collected.
  for (const loc of fixture.locations) {
    if (loc.isDefault) continue
    const { createLocation } = await gql<{ createLocation: LocationRow }>(
      CREATE_LOCATION,
      { name: loc.name },
    )
    locationIds[loc.key] = createLocation.id
  }

  const resolveLocation = (key: string): string => {
    const id = locationIds[key]
    if (!id) {
      throw new Error(`seedCloudFixture: fixture references unknown location key "${key}"`)
    }
    return id
  }

  // 3. The bulk imports, with the fixture's own fixed entity ids.
  if (fixture.vendors.length > 0) {
    await gql(BULK_VENDORS, { vendors: fixture.vendors })
  }

  if (fixture.items.length > 0) {
    await gql(BULK_ITEMS, {
      items: fixture.items.map((item) => ({
        id: item.id,
        name: item.name,
        tagIds: [],
        vendorIds: item.vendorIds ?? [],
        // `ItemInput` is FLAT — it carries the five stock fields inline with no
        // locationId, and they are required. They are left at 0 here because
        // step 4 writes the real per-location numbers; whatever these become on
        // `Item`'s legacy columns, the cloud pantry has read `ItemStock` since
        // PR 2.
        //
        // `targetUnit` and `consumeAmount` are the exception: they are global
        // item CONFIGURATION, not per-location state, so `ItemStockInput` has
        // no field for them and step 4 cannot set them. What is written here is
        // what the item keeps. The `?? 'package'` and `?? 1` fallbacks are the
        // product defaults — `createItem` writes the same pair, and Prisma
        // declares `consumeAmount Float @default(1)`. `seedLocalFixture` writes
        // the same two values for an omitted key, so both modes match.
        targetUnit: item.targetUnit ?? 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: item.consumeAmount ?? 1,
        createdAt: now,
        updatedAt: now,
      })),
    })
  }

  if (fixture.shelves.length > 0) {
    await gql(BULK_SHELVES, {
      shelves: fixture.shelves.map((shelf) => ({
        id: shelf.id,
        name: shelf.name,
        type: shelf.type,
        order: shelf.order,
        itemIds: shelf.itemIds,
        createdAt: now,
        updatedAt: now,
      })),
    })
  }

  if (fixture.recipes.length > 0) {
    await gql(BULK_RECIPES, {
      recipes: fixture.recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        items: recipe.items,
      })),
    })
  }

  // 4. RECONCILE STOCK against what the database actually holds.
  //
  // `bulkCreateItems` calls `mirrorStockToDefaultLocation`
  // (import.resolver.ts), so an imported item lands with a stock row at the
  // default location whether the fixture asks for one or not. A fixture whose
  // point is "this item is stocked ONLY at the other location" is wrong until
  // that extra row is deleted.
  //
  // The extra rows are READ BACK rather than predicted. Assuming what the
  // mirror did is exactly the assumption that rots when PR 5 removes the
  // dual-write: the seed would then delete a row that no longer exists, or
  // worse, keep trusting a row that was never created.
  const wanted = new Set(
    fixture.stocks.map((s) => `${s.itemId}:${resolveLocation(s.location)}`),
  )

  for (const item of fixture.items) {
    const { itemStocksForItem } = await gql<{ itemStocksForItem: StockRow[] }>(
      STOCKS_FOR_ITEM,
      { itemId: item.id },
    )
    for (const row of itemStocksForItem) {
      if (wanted.has(`${row.itemId}:${row.locationId}`)) continue
      await gql(REMOVE_STOCK, {
        itemId: row.itemId,
        locationId: row.locationId,
      })
    }
  }

  for (const stock of fixture.stocks) {
    await gql(UPSERT_STOCK, {
      itemId: stock.itemId,
      locationId: resolveLocation(stock.location),
      input: stockQuantities(stock),
    })
  }

  return locationIds
}
