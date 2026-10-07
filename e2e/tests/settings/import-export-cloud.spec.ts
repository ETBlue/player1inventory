import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { test, expect } from '@playwright/test'
import {
  DESTINATION_DEFAULT_LOCATION_NAME,
  expectFixtureStockPerLocation,
  expectStockNotCollapsedOntoDefault,
} from '../../helpers/backupAssertions'
import { cleanupCloudData } from '../../helpers/cloudTeardown'
import { ensureCloudDefaultLocation } from '../../helpers/cloudSeed'
import { readLocations } from '../../helpers/stockReadback'
import { makeGql } from '../../utils/cloud'
import { ItemPage } from '../../pages/ItemPage'
import { PantryPage } from '../../pages/PantryPage'
import { SettingsPage } from '../../pages/SettingsPage'
import { ShoppingPage } from '../../pages/ShoppingPage'
import { RecipesPage } from '../../pages/settings/RecipesPage'
import { RecipeDetailPage } from '../../pages/settings/RecipeDetailPage'

const CLOUD_FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/cloud-backup.json')
const LOCAL_FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/local-backup.json')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cloudFixture = JSON.parse(fs.readFileSync(CLOUD_FIXTURE_PATH, 'utf-8')) as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const localFixture = JSON.parse(fs.readFileSync(LOCAL_FIXTURE_PATH, 'utf-8')) as any
const CLOUD_ITEM_ID: string = cloudFixture.items[0].id
const LOCAL_ITEM_ID: string = localFixture.items[0].id
const CLOUD_VENDOR_ID: string = cloudFixture.vendors[0].id
const LOCAL_VENDOR_ID: string = localFixture.vendors[0].id
// The fixtures' NON-default locations keep their own ids through every import:
// the remap rewrites only the payload's default. So these two can be asserted
// verbatim after a round trip, and the default's id cannot.
const CLOUD_OFFICE_ID: string = cloudFixture.locations[1].id
const LOCAL_OFFICE_ID: string = localFixture.locations[1].id

test.beforeEach(async ({ request }) => {
  await cleanupCloudData(request)
})

// Prevent the empty-data redirect to /onboarding so the settings/import UI stays
// reachable even before/after data exists (mirrors import-export-local.spec.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
})

test.afterEach(async ({ request }) => {
  await cleanupCloudData(request)
})

// Helper: seed all fixture entities via GraphQL bulk create mutations.
//
// THIS IS THE SPEC'S OWN SEED, NOT `e2e/helpers/cloudSeed.ts`'s, and PR 4b task
// 8 extended it rather than switching over. The shared helper's `Fixture` type
// (helpers/fixture.ts) describes locations, vendors, items, stocks, shelves and
// recipes — and nothing else. `verifyRelations` below asserts a TAG, a TAG
// TYPE, an inventory LOG and a CART ITEM, none of which that type can express.
// Moving to it would mean widening `Fixture` and both seed halves, which would
// touch the five other specs that already use them, for no gain here.
//
// Returns the real location ids, keyed by the FIXTURE's own location ids, so a
// caller can name a location the seed placed.
async function seedCloudFixture(
  request: import('@playwright/test').APIRequestContext,
): Promise<Record<string, string>> {
  const gql = makeGql(request)

  // 1. LOCATIONS FIRST, before anything that names one.
  //
  // The fixture's default location cannot be created: `ensureDefaultLocation`
  // (apps/server/src/lib/defaultLocation.ts) already made one with a cuid id,
  // and `Location_one_default_per_user_key` forbids a second. So the fixture's
  // default id is MAPPED onto that row's id and the row is renamed — the same
  // thing `helpers/cloudSeed.ts` does, and the same rule the import remap
  // applies.
  //
  // Every NON-default location is created with the fixture's OWN id, through
  // `bulkCreateLocations` (`LocationInput.id` is required, PR 4a). That is what
  // lets a test assert a cart id or a log's location verbatim after a round
  // trip: the remap rewrites only the default.
  const fixtureLocations = cloudFixture.locations as Array<Record<string, unknown>>
  const fixtureDefault = fixtureLocations.find((loc) => loc.isDefault === true)
  if (!fixtureDefault) throw new Error('cloud-backup.json marks no default location')

  const serverDefault = await ensureCloudDefaultLocation(request)
  const locationIds: Record<string, string> = {
    [fixtureDefault.id as string]: serverDefault.id,
  }
  for (const loc of fixtureLocations) {
    if (loc.isDefault === true) continue
    locationIds[loc.id as string] = loc.id as string
  }
  if (serverDefault.name !== fixtureDefault.name) {
    await gql(
      `mutation ($id: ID!, $name: String!) { updateLocation(id: $id, input: { name: $name }) { id } }`,
      { id: serverDefault.id, name: fixtureDefault.name },
    )
  }
  await gql(
    `mutation BulkCreateLocations($locations: [LocationInput!]!) { bulkCreateLocations(locations: $locations) { id } }`,
    {
      locations: fixtureLocations
        .filter((loc) => loc.isDefault !== true)
        .map((loc) => ({
          id: loc.id,
          name: loc.name,
          order: loc.order,
          createdAt: loc.createdAt,
          updatedAt: loc.updatedAt,
        })),
    },
  )

  const resolveLocation = (id: unknown): string => {
    const real = locationIds[id as string]
    if (!real) throw new Error(`seedCloudFixture: unknown fixture location id "${String(id)}"`)
    return real
  }

  // Insert in dependency order: tagTypes → tags → vendors → items → stocks → recipes → logs → carts → cartItems
  await gql(
    `mutation BulkCreateTagTypes($tagTypes: [TagTypeInput!]!) { bulkCreateTagTypes(tagTypes: $tagTypes) { id } }`,
    { tagTypes: cloudFixture.tagTypes },
  )
  await gql(
    `mutation BulkCreateTags($tags: [TagInput!]!) { bulkCreateTags(tags: $tags) { id } }`,
    { tags: cloudFixture.tags },
  )
  await gql(
    `mutation BulkCreateVendors($vendors: [VendorInput!]!) { bulkCreateVendors(vendors: $vendors) { id } }`,
    { vendors: cloudFixture.vendors },
  )
  await gql(
    `mutation BulkCreateItems($items: [ItemInput!]!) { bulkCreateItems(items: $items) { id } }`,
    {
      // The five per-location state fields are stripped HERE, at the call site,
      // and NOT from `e2e/fixtures/cloud-backup.json`.
      //
      // The fixture is a backup PAYLOAD and carrying them is correct: a real
      // pre-v15 export has them inline on each item, and that is the shape
      // `upgradeLegacyPayloadForCloud` has to be able to read. What is not
      // correct is forwarding them into `ItemInput`, which has declared none of
      // the five since cloud locations PR 5 — the server answers `Field
      // "targetQuantity" is not defined by type "ItemInput". Did you mean
      // "targetUnit"?` and the whole seed throws.
      //
      // The app's own import path already does this, in `toItemInput`
      // (apps/web/src/lib/importData.ts), so this seed is only matching it. The
      // real per-location numbers arrive in the next step, through
      // `bulkCreateItemStocks`, where each row names its location.
      items: (cloudFixture.items as Array<Record<string, unknown>>).map(
        ({
          targetQuantity: _targetQuantity,
          refillThreshold: _refillThreshold,
          packedQuantity: _packedQuantity,
          unpackedQuantity: _unpackedQuantity,
          dueDate: _dueDate,
          ...config
        }) => config,
      ),
    },
  )
  // 2. STOCK, after the items and the locations it joins.
  //
  // THIS IS NEW IN PR 4b TASK 8, AND WITHOUT IT THIS SPEC CANNOT PASS. Until
  // task 6 the server's `mirrorStockToDefaultLocation` gave every imported item
  // a stock row at the caller's default location, so a seed that wrote no stock
  // still produced a visible pantry. That mirror is gone, and a cloud seed that
  // writes an item and no stock row now writes an item that is in the catalog
  // and in no location — invisible in the pantry, with no error anywhere.
  // Measured on this branch before this block existed: both tests in this file
  // failed on `getByRole('heading', { name: 'Fixture Item', level: 3 })`,
  // "element(s) not found". See e2e/CLAUDE.md, "A seed that writes an item must
  // also write its stock — in BOTH modes".
  await gql(
    `mutation BulkCreateItemStocks($itemStocks: [ItemStockImportInput!]!) { bulkCreateItemStocks(itemStocks: $itemStocks) { id } }`,
    {
      itemStocks: (cloudFixture.itemStocks as Array<Record<string, unknown>>).map(
        (stock) => ({ ...stock, locationId: resolveLocation(stock.locationId) }),
      ),
    },
  )
  await gql(
    `mutation BulkCreateRecipes($recipes: [RecipeInput!]!) { bulkCreateRecipes(recipes: $recipes) { id } }`,
    { recipes: cloudFixture.recipes },
  )
  await gql(
    `mutation BulkCreateInventoryLogs($logs: [InventoryLogInput!]!) { bulkCreateInventoryLogs(logs: $logs) { id } }`,
    {
      // Each log's own `locationId`, mapped through the same table. A log
      // naming a location the account does not hold is NOT an error:
      // `resolveLogLocations` (apps/server/src/resolvers/import.resolver.ts)
      // falls back to the caller's default, silently. So the fixture's default
      // log has to be mapped here, or the seed would be asserting a fallback
      // rather than a placement.
      logs: (cloudFixture.inventoryLogs as Array<Record<string, unknown>>).map(
        (log) => ({ ...log, locationId: resolveLocation(log.locationId) }),
      ),
    },
  )
  await gql(
    `mutation BulkCreateShoppingCarts($carts: [ShoppingCartInput!]!) { bulkCreateShoppingCarts(carts: $carts) { id } }`,
    // Permanent carts (v13+) carry only `id` (+ optional `lastPurchasedAt`). The
    // fixture deliberately keeps legacy `status`/`createdAt` to exercise
    // backward-compat *import*, but this direct GraphQL seed must send only the
    // fields `ShoppingCartInput` accepts, or the server rejects it (BAD_USER_INPUT).
    {
      carts: (cloudFixture.shoppingCarts as Array<Record<string, unknown>>).map(
        (c) => ({
          id: c.id,
          ...(c.lastPurchasedAt != null
            ? { lastPurchasedAt: c.lastPurchasedAt }
            : {}),
        }),
      ),
    },
  )
  await gql(
    `mutation BulkCreateCartItems($cartItems: [CartItemInput!]!) { bulkCreateCartItems(cartItems: $cartItems) { id } }`,
    { cartItems: cloudFixture.cartItems },
  )

  return locationIds
}

// Helper: run all 6 relation verifications after any import, then the location
// and quantity checks shared with the local spec (helpers/backupAssertions.ts).
//
// `itemId` is a parameter because the two fixtures use different id formats —
// `cloud-backup.json` has ObjectId-shaped ids, `local-backup.json` has UUIDs —
// and the stock readback has to name the item.
async function verifyRelations(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
  baseURL: string | undefined,
  itemId: string,
) {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)
  const shopping = new ShoppingPage(page)
  const recipes = new RecipesPage(page)
  const recipeDetail = new RecipeDetailPage(page)

  // 1. Item in pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Fixture Item')).toBeVisible()

  // 2. Tag assigned to item
  await pantry.getItemCard('Fixture Item').click()
  await page.waitForURL(/\/items\//)
  await item.navigateToTab('tags')
  await expect(item.getTagBadge('Fixture Tag')).toBeVisible()

  // 3. Vendor assigned to item
  await item.navigateToTab('vendors')
  await expect(item.getAssignedVendorBadge('Fixture Vendor')).toBeVisible()

  // 4. Inventory log entry
  await item.navigateToLogTab()
  await expect(item.getLogEntries()).toHaveCount(1)

  // 5. Recipe has item as ingredient
  await recipes.navigateTo()
  await recipes.getRecipeCard('Fixture Recipe').click()
  await page.waitForURL(/\/settings\/recipes\//)
  const recipeId = page.url().match(/\/settings\/recipes\/([^/]+)/)?.[1]
  if (!recipeId) throw new Error('Could not extract recipe ID from URL')
  await recipeDetail.navigateToItems(recipeId)
  await expect(recipeDetail.getAssignedItemCheckbox('Fixture Item')).toBeVisible()

  // 6. Item appears inside its vendor's cart.
  // /shopping is now a vendor-grouped overview (one VendorCartCard per vendor) —
  // individual item cards live inside a vendor cart at /shopping/<vendorId>.
  // The Fixture Item is assigned to "Fixture Vendor", so it is listed (as a
  // pending item) on that vendor's cart page.
  await shopping.navigateTo()
  await shopping.clickVendorCartCard('Fixture Vendor')
  await expect(shopping.getItemCard('Fixture Item')).toBeVisible()

  // 7. Every location came back, exactly one of them is the default, and each
  //    one holds its OWN quantities. Until PR 4b task 8 this file asserted no
  //    location and no quantity at all, so an imported item could land in the
  //    wrong location — or in none — and every check above still passed.
  // The default location answers to the DESTINATION's name, not the backup's.
  // `ImportCard` runs the `skip` strategy when there is no conflict, and the
  // remap puts the backup's default row on the id the account already holds —
  // so that one row is the one `skip` leaves alone. See
  // `DESTINATION_DEFAULT_LOCATION_NAME`.
  await expectFixtureStockPerLocation(
    page,
    request,
    baseURL,
    itemId,
    DESTINATION_DEFAULT_LOCATION_NAME,
  )

  // 8. And the two non-default locations' stock is not sitting on the default.
  await expectStockNotCollapsedOntoDefault(page, request, baseURL, itemId)
}

// How many of the caller's carts AT ONE LOCATION hold this item.
//
// This is the only way to read a `Cart` row's `locationId` COLUMN through
// GraphQL: the `Cart` type exposes `id` and `lastPurchasedAt` and nothing else
// (apps/server/src/schema/cart.graphql). `cartItemCountByItem(itemId,
// locationId:)` resolves through the relation filter
// `where: { itemId, userId, cart: { locationId } }`, so it reads the column
// rather than parsing the id — which is exactly the difference this spec has
// to see. A cart whose id SAYS one location while its column says another
// answers 0 here and 1 at the other location.
async function cartCountAt(
  request: import('@playwright/test').APIRequestContext,
  itemId: string,
  locationId: string,
): Promise<number> {
  const gql = makeGql(request)
  const { cartItemCountByItem } = await gql<{ cartItemCountByItem: number }>(
    `query ($itemId: ID!, $locationId: ID) { cartItemCountByItem(itemId: $itemId, locationId: $locationId) }`,
    { itemId, locationId },
  )
  return cartItemCountByItem
}

/** Every log the account holds, with its location and its message fields. */
async function readLogs(
  request: import('@playwright/test').APIRequestContext,
): Promise<Array<Record<string, unknown>>> {
  const gql = makeGql(request)
  const { inventoryLogs } = await gql<{
    inventoryLogs: Array<Record<string, unknown>>
  }>(
    `query { inventoryLogs { id itemId locationId delta quantity logKey logParams } }`,
  )
  return inventoryLogs
}

test('user can export and re-import cloud data (cloud → cloud)', async ({ page, request, baseURL }) => {
  // This one test needs more than the default 30s. Measured 2026-10-04: it
  // takes 36.5s. It is the only test here that does a FULL cloud round trip —
  // seed, export, clearAllData, re-import — and then walks `verifyRelations`'
  // seven UI steps plus PR 4b's location and quantity readbacks.
  //
  // NOT a flake, and it was first misread as one. Three measurements say so:
  // it failed again when its spec ran alone at load average 1.65; the page
  // snapshot taken at the failure shows the element PRESENT, so the data had
  // restored correctly and only the assertion ran out of time; and the same
  // test passes in 36.5s with `--timeout=90000`.
  //
  // Deliberately on this test and not on the `cloud` project. The other five
  // tests in this file pass inside 30s, and raising the project's budget would
  // mean the next test that quietly grows to 45s tells nobody.
  test.setTimeout(60000)

  const settings = new SettingsPage(page)

  // Given: all fixture entities seeded via GraphQL
  await seedCloudFixture(request)

  // Visit pantry first to populate Apollo cache
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // When: export via UI
  await settings.navigateTo()
  const download = await settings.triggerExport()
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('Download path is null')

  // Then: clear all cloud data
  await cleanupCloudData(request)

  // When: import the downloaded file
  await settings.navigateTo()
  await settings.triggerImport(downloadPath)
  await settings.waitForImportDone('cloud')

  // Then: verify all relations, including each location's own quantities
  await verifyRelations(page, request, baseURL, CLOUD_ITEM_ID)
})

test('user can import a local backup into cloud mode (local → cloud)', async ({ page, request, baseURL }) => {
  const settings = new SettingsPage(page)

  // Given: no existing cloud data (beforeEach cleanup ran)
  // When: import local fixture (UUID IDs — regression test for the UUID→ObjectId bug)
  await settings.navigateTo()
  await settings.triggerImport(LOCAL_FIXTURE_PATH)
  await settings.waitForImportDone('cloud')

  // Then: verify all relations, including each location's own quantities
  await verifyRelations(page, request, baseURL, LOCAL_ITEM_ID)
})

test('user re-importing a cloud backup keeps every location and gains no stray default', async ({ page, request, baseURL }) => {
  const settings = new SettingsPage(page)

  // Given: three locations with three different stock quantities
  await seedCloudFixture(request)
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // When: the account is exported, cleared, and the backup imported
  await settings.navigateTo()
  const download = await settings.triggerExport()
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('Download path is null')
  await cleanupCloudData(request)
  await settings.navigateTo()
  await settings.triggerImport(downloadPath)
  await settings.waitForImportDone('cloud')

  // Then: three locations, one default, each holding its own numbers
  await expectFixtureStockPerLocation(
    page,
    request,
    baseURL,
    CLOUD_ITEM_ID,
    DESTINATION_DEFAULT_LOCATION_NAME,
  )

  // And no FOURTH location beside the restored default. `clearAllData` deletes
  // every Location row and `ensureDefaultLocation` makes a fresh one with a new
  // cuid on the next `locations` read, so the backup's own default id no longer
  // exists. Leave `locations[].id` out of the remap and the backup writes that
  // dead id as a new row, giving four locations — the stray default.
  const locations = await readLocations(page, request, baseURL)
  expect(locations).toHaveLength(3)
  expect(locations.filter((l) => l.isDefault)).toHaveLength(1)
})

test('user re-importing a cloud backup keeps each cart at its own location', async ({ page, request, baseURL }) => {
  const settings = new SettingsPage(page)

  // Given: the fixture's one cart sits at Fixture Office, NOT at the default
  expect(cloudFixture.shoppingCarts[0].id).toBe(`${CLOUD_OFFICE_ID}:${CLOUD_VENDOR_ID}`)
  await seedCloudFixture(request)
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // When: the account is exported, cleared, and the backup imported
  await settings.navigateTo()
  const download = await settings.triggerExport()
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('Download path is null')
  await cleanupCloudData(request)
  await settings.navigateTo()
  await settings.triggerImport(downloadPath)
  await settings.waitForImportDone('cloud')

  // Then: the cart's `locationId` COLUMN still says Fixture Office, read
  // through the relation filter rather than by parsing the id. This is the
  // real-SQL half of the cart-prefix proof: task 1's unit test pins the id the
  // client SENDS, and nothing until now confirmed which column Postgres wrote.
  expect(await cartCountAt(request, CLOUD_ITEM_ID, CLOUD_OFFICE_ID)).toBe(1)

  // And the default location holds no cart for it. Upload `shoppingCarts`
  // before `locations` and `resolveCartLocations` cannot claim the Office id,
  // so it falls back to the caller's default — silently. Then these two
  // numbers swap.
  const defaultLocation = (await readLocations(page, request, baseURL)).find(
    (l) => l.isDefault,
  )
  if (!defaultLocation) throw new Error('no default location after the import')
  expect(await cartCountAt(request, CLOUD_ITEM_ID, defaultLocation.id)).toBe(0)
})

test('user re-importing a cloud backup keeps each log’s location and message', async ({ page, request, baseURL }) => {
  const settings = new SettingsPage(page)

  // Given: two logs — one at the default location, one at Fixture Office —
  // each carrying a `logKey` and `logParams`. Before PR 4b the cloud export
  // selected neither of those two fields, so every cloud backup lost every
  // log's message.
  await seedCloudFixture(request)
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // When: the account is exported, cleared, and the backup imported
  await settings.navigateTo()
  const download = await settings.triggerExport()
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('Download path is null')
  await cleanupCloudData(request)
  await settings.navigateTo()
  await settings.triggerImport(downloadPath)
  await settings.waitForImportDone('cloud')

  // Then: both logs are back, one at each location, with their messages
  const defaultLocation = (await readLocations(page, request, baseURL)).find(
    (l) => l.isDefault,
  )
  if (!defaultLocation) throw new Error('no default location after the import')
  const logs = await readLogs(request)

  expect(
    logs
      .map((log) => ({
        locationId:
          log.locationId === defaultLocation.id ? 'DEFAULT' : log.locationId,
        logKey: log.logKey,
        logParams: log.logParams,
      }))
      .sort((a, b) => String(a.logKey).localeCompare(String(b.logKey))),
  ).toEqual([
    {
      locationId: CLOUD_OFFICE_ID,
      logKey: 'log.consumed',
      logParams: { amount: 1, unit: 'package' },
    },
    {
      locationId: 'DEFAULT',
      logKey: 'log.purchased',
      logParams: { amount: 1, unit: 'package' },
    },
  ])
})

test('user copying a local pantry to cloud keeps every location’s stock', async ({ page, request, baseURL }) => {
  const settings = new SettingsPage(page)

  // Given: a LOCAL backup whose default location is the `'local'` sentinel and
  // whose other two locations carry UUID ids. The remap must rewrite the first
  // and keep the other two.
  expect(localFixture.locations[0].id).toBe('local')
  expect(localFixture.shoppingCarts[0].id).toBe(`${LOCAL_OFFICE_ID}:${LOCAL_VENDOR_ID}`)

  // When: it is imported into cloud mode (beforeEach left the account empty)
  await settings.navigateTo()
  await settings.triggerImport(LOCAL_FIXTURE_PATH)
  await settings.waitForImportDone('cloud')

  // Then: three locations, one default, each holding its own numbers. A
  // single-location fixture could not fail this: "the location the payload
  // named" and "the caller's default" would be the same id.
  await expectFixtureStockPerLocation(
    page,
    request,
    baseURL,
    LOCAL_ITEM_ID,
    DESTINATION_DEFAULT_LOCATION_NAME,
  )
  await expectStockNotCollapsedOntoDefault(page, request, baseURL, LOCAL_ITEM_ID)

  // And the cart the local pantry kept at its Office is at the Office here
  expect(await cartCountAt(request, LOCAL_ITEM_ID, LOCAL_OFFICE_ID)).toBe(1)
  const defaultLocation = (await readLocations(page, request, baseURL)).find(
    (l) => l.isDefault,
  )
  if (!defaultLocation) throw new Error('no default location after the import')
  expect(await cartCountAt(request, LOCAL_ITEM_ID, defaultLocation.id)).toBe(0)
})
