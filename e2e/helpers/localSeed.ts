import type { Page } from '@playwright/test'
import {
  defaultFixtureLocation,
  type Fixture,
  stockQuantities,
} from './fixture'
import { seedRows } from './locationSeed'

// Local mode's half of the shared fixture (helpers/fixture.ts). It writes the
// same data `seedCloudFixture` writes, into IndexedDB instead of Postgres.

// `DEFAULT_LOCATION_ID` in src/types — the sentinel id Dexie's `on('populate')`
// gives the seeded "My Home" row. Cloud has no equivalent: its default location
// id is a server-generated cuid.
const LOCAL_DEFAULT_LOCATION_ID = 'local'

/** The local id a fixture location key resolves to. */
function localLocationId(key: string, isDefault: boolean | undefined): string {
  return isDefault ? LOCAL_DEFAULT_LOCATION_ID : `loc-${key.toLowerCase()}`
}

/**
 * Seed `fixture` into IndexedDB and return `Record<locationKey, localId>`.
 *
 * `seedRows` resolves on the transaction's `oncomplete`, never on a request's
 * `onsuccess` — the navigation that follows a seed aborts a still-open
 * transaction and silently discards its rows.
 */
export async function seedLocalFixture(
  page: Page,
  fixture: Fixture,
): Promise<Record<string, string>> {
  defaultFixtureLocation(fixture) // fail loudly on a malformed fixture

  // Dexie must have created the schema before opening the database by name.
  await page.goto('/')
  const now = new Date()

  const locationIds: Record<string, string> = {}
  for (const loc of fixture.locations) {
    locationIds[loc.key] = localLocationId(loc.key, loc.isDefault)
  }

  await seedRows(
    page,
    'locations',
    fixture.locations.map((loc, index) => ({
      id: locationIds[loc.key],
      name: loc.name,
      order: index,
      isDefault: loc.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    })),
  )

  if (fixture.vendors.length > 0) {
    await seedRows(
      page,
      'vendors',
      fixture.vendors.map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        createdAt: now,
      })),
    )
  }

  if (fixture.items.length > 0) {
    await seedRows(
      page,
      'items',
      fixture.items.map((item) => ({
        id: item.id,
        name: item.name,
        tagIds: [],
        vendorIds: item.vendorIds ?? [],
        // Both keys are OMITTED when the fixture leaves them out, which is
        // exactly what this seed has always written. Writing `undefined`
        // instead of omitting is not the same thing: Dexie would store the key.
        //
        // What an omitted key means downstream is NOT the `ItemForm`
        // DEFAULT_VALUES of 'package' and 1. Both item routes build the form's
        // `initialValues` themselves and always supply the key:
        // `itemToFormValues` passes `consumeAmount: item.consumeAmount ?? 0`
        // and `targetUnit: item.targetUnit` with no fallback
        // (apps/web/src/routes/items/$id/index.tsx lines 51 and 61, and the
        // same pair in $id/stock.tsx). So an omitted key reaches the form as 0
        // and as undefined, and DEFAULT_VALUES never applies.
        //
        // Cloud is different: `seedCloudFixture` must send a value, so an
        // omitted key becomes 'package' and 1 there. The two modes therefore
        // DISAGREE for a fixture that leaves these out. A spec that cares about
        // either value must set it explicitly.
        ...(item.targetUnit !== undefined ? { targetUnit: item.targetUnit } : {}),
        ...(item.consumeAmount !== undefined
          ? { consumeAmount: item.consumeAmount }
          : {}),
        createdAt: now,
        updatedAt: now,
      })),
    )
  }

  if (fixture.stocks.length > 0) {
    await seedRows(
      page,
      'itemStocks',
      fixture.stocks.map((stock) => {
        const locationId = locationIds[stock.location]
        return {
          id: `stock-${stock.itemId}-${locationId}`,
          itemId: stock.itemId,
          locationId,
          // Only the per-location STATE lives here. The global configuration
          // fields have been Item fields since schema v16.
          ...stockQuantities(stock),
          createdAt: now,
          updatedAt: now,
        }
      }),
    )
  }

  if (fixture.shelves.length > 0) {
    await seedRows(
      page,
      'shelves',
      fixture.shelves.map((shelf) => ({
        id: shelf.id,
        name: shelf.name,
        type: shelf.type,
        order: shelf.order,
        itemIds: shelf.itemIds,
        createdAt: now,
        updatedAt: now,
      })),
    )
  }

  if (fixture.recipes.length > 0) {
    await seedRows(
      page,
      'recipes',
      fixture.recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        items: recipe.items,
        createdAt: now,
        updatedAt: now,
      })),
    )
  }

  return locationIds
}
