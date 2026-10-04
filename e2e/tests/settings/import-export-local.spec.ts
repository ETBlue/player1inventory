import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { test, expect } from '@playwright/test'
import {
  DESTINATION_DEFAULT_LOCATION_NAME,
  FIXTURE_DEFAULT_LOCATION_NAME,
  expectFixtureLocations,
  expectFixtureStockPerLocation,
  expectStockNotCollapsedOntoDefault,
} from '../../helpers/backupAssertions'
import { readRows } from '../../helpers/locationSeed'
import { ItemPage } from '../../pages/ItemPage'
import { PantryPage } from '../../pages/PantryPage'
import { SettingsPage } from '../../pages/SettingsPage'
import { ShoppingPage } from '../../pages/ShoppingPage'

// Prevent empty-data redirect to /onboarding so tests can navigate freely.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
})
import { RecipesPage } from '../../pages/settings/RecipesPage'
import { RecipeDetailPage } from '../../pages/settings/RecipeDetailPage'

const LOCAL_FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/local-backup.json')
const CLOUD_FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/cloud-backup.json')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const localFixture = JSON.parse(fs.readFileSync(LOCAL_FIXTURE_PATH, 'utf-8')) as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cloudFixture = JSON.parse(fs.readFileSync(CLOUD_FIXTURE_PATH, 'utf-8')) as any
const LOCAL_ITEM_ID: string = localFixture.items[0].id
const CLOUD_ITEM_ID: string = cloudFixture.items[0].id

test.afterEach(async ({ page }) => {
  // Local mode: clear IndexedDB, localStorage, and sessionStorage.
  // Navigate to the app origin so IndexedDB API is accessible, then clear all databases.
  await page.goto('/')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map(({ name }) => {
      return new Promise<void>((resolve, reject) => {
        if (!name) { resolve(); return }
        const req = indexedDB.deleteDatabase(name)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
        req.onblocked = () => {
          console.warn(`[afterEach] IndexedDB delete blocked for "${name}" — data may persist`)
          resolve()
        }
      })
    }))
    localStorage.clear()
    sessionStorage.clear()
  })
})

// Helper: seed all fixture entities into IndexedDB via page.evaluate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedLocalFixture(page: import('@playwright/test').Page, fixture: any) {
  await page.goto('/')
  await page.evaluate(async (fixture) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    // `locations` and `itemStocks` are in this list since PR 4b task 8. Without
    // them the fixture seeded a single location (Dexie's own `on('populate')`
    // default) and no stock rows at all, so no assertion about WHICH location
    // an imported row lands in could fail.
    const storeNames = ['tagTypes', 'tags', 'vendors', 'items', 'recipes', 'inventoryLogs', 'shoppingCarts', 'cartItems', 'shelves', 'locations', 'itemStocks']
    // Clear all stores first (removes default-populated data from Dexie's populate hook)
    for (const storeName of storeNames) {
      const tx = db.transaction([storeName], 'readwrite')
      tx.objectStore(storeName).clear()
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }
    // Seed fixture records. `locations` goes FIRST, so the default location
    // exists before any row names it.
    const entries: [string, unknown[]][] = [
      ['locations', (fixture.locations ?? []).map((loc: Record<string, unknown>) => ({
        ...loc,
        createdAt: new Date(loc.createdAt as string),
        updatedAt: new Date(loc.updatedAt as string),
      }))],
      ['itemStocks', (fixture.itemStocks ?? []).map((stock: Record<string, unknown>) => ({
        ...stock,
        createdAt: new Date(stock.createdAt as string),
        updatedAt: new Date(stock.updatedAt as string),
      }))],
      ['tagTypes', fixture.tagTypes],
      ['tags', fixture.tags],
      ['vendors', fixture.vendors],
      ['items', fixture.items],
      ['recipes', fixture.recipes],
      ['inventoryLogs', fixture.inventoryLogs],
      ['shoppingCarts', fixture.shoppingCarts],
      ['cartItems', fixture.cartItems],
      ['shelves', fixture.shelves ?? []],
    ]
    for (const [storeName, records] of entries) {
      const tx = db.transaction([storeName], 'readwrite')
      const store = tx.objectStore(storeName)
      for (const record of records as object[]) {
        store.put(record)
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }
    db.close()
  }, fixture)
}

// Helper: run all 7 relation verifications after any import, then the location
// and quantity checks shared with the cloud spec (helpers/backupAssertions.ts).
//
// `itemId` is a parameter because the two fixtures use different id formats —
// `local-backup.json` has UUIDs, `cloud-backup.json` has ObjectId-shaped ids —
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

  // 7. Shelf exists and contains the fixture item
  await page.goto('/?groupBy=shelf')
  await expect(page.getByText('Fixture Shelf')).toBeVisible()

  // 8. Every location came back, exactly one of them is the default, and each
  //    one holds its OWN quantities. Until PR 4b task 8 this file asserted no
  //    location and no quantity at all, so an imported item could land in the
  //    wrong location — or in none — and every check above still passed.
  // The default location answers to the DESTINATION's name, not the backup's.
  // `ImportCard` runs the `skip` strategy when there is no conflict, and the
  // remap puts the backup's default row on the id the live database already
  // holds — so that one row is the one `skip` leaves alone. See
  // `DESTINATION_DEFAULT_LOCATION_NAME`.
  await expectFixtureStockPerLocation(
    page,
    request,
    baseURL,
    itemId,
    DESTINATION_DEFAULT_LOCATION_NAME,
  )

  // 9. And the two non-default locations' stock is not sitting on the default.
  await expectStockNotCollapsedOntoDefault(page, request, baseURL, itemId)
}

test('user can export and re-import local data (local → local)', async ({ page, request, baseURL }) => {
  const settings = new SettingsPage(page)

  // Given: all fixture entities seeded into IndexedDB
  await seedLocalFixture(page, localFixture as typeof localFixture)

  // When: visit pantry first to populate TanStack Query cache
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Then: export via UI
  await settings.navigateTo()
  const download = await settings.triggerExport()
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('Download path is null')

  // Then: clear IndexedDB
  await page.goto('/')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map(({ name }) => {
      return new Promise<void>((resolve, reject) => {
        if (!name) { resolve(); return }
        const req = indexedDB.deleteDatabase(name)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
        req.onblocked = () => {
          console.warn(`[test] IndexedDB delete blocked for "${name}" — data may persist`)
          resolve()
        }
      })
    }))
  })

  // When: import the downloaded file
  await settings.navigateTo()
  await settings.triggerImport(downloadPath)
  await settings.waitForImportDone('local')

  // Then: verify all relations, including each location's own quantities
  await verifyRelations(page, request, baseURL, LOCAL_ITEM_ID)
})

test('user can import a cloud backup into local mode (cloud → local)', async ({ page, request, baseURL }) => {
  const settings = new SettingsPage(page)

  // Given: no existing local data (fresh context from afterEach teardown)
  // When: import the cloud fixture directly (ObjectId IDs)
  await settings.navigateTo()
  await settings.triggerImport(CLOUD_FIXTURE_PATH)
  await settings.waitForImportDone('local')

  // Then: verify all relations, including each location's own quantities.
  // THE CLOUD FIXTURE'S DEFAULT LOCATION ID IS NOT `local`. The import remap
  // rewrites it onto the local sentinel, so this is the direction that proves
  // the remap: without it the backup's default row keeps its cuid-shaped id
  // and `ensureDefaultLocationRow` adds a FOURTH, empty `local` row beside it.
  await verifyRelations(page, request, baseURL, CLOUD_ITEM_ID)
})

test('user does not see epoch date (1970-01-01) after importing item with null dueDate', async ({ page }) => {
  const settings = new SettingsPage(page)
  const pantry = new PantryPage(page)

  // Given: an export payload where dueDate, estimatedDueDays, expirationThreshold are null
  // (this is what JSON serialization produces for undefined optional fields)
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tagTypes: [],
    tags: [],
    vendors: [],
    items: [
      {
        id: 'bbbbbbbb-0000-0000-0000-000000000001',
        name: 'No Expiry Item',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        dueDate: null,
        estimatedDueDays: null,
        expirationThreshold: null,
        createdAt: '2026-03-25T00:00:00.000Z',
        updatedAt: '2026-03-25T00:00:00.000Z',
      },
    ],
    recipes: [],
    inventoryLogs: [],
    shoppingCarts: [],
    cartItems: [],
  }
  const tmpFile = path.join(os.tmpdir(), 'p1i-epoch-regression.json')
  fs.writeFileSync(tmpFile, JSON.stringify(payload))

  // When: import the payload
  await settings.navigateTo()
  await settings.triggerImport(tmpFile)
  await settings.waitForImportDone('local')

  // Then: item card is visible on pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('No Expiry Item')).toBeVisible()

  // Then: no "1970" text appears anywhere on the page (epoch date regression guard)
  await expect(page.getByText('1970', { exact: false })).toHaveCount(0)
})

test('user importing a cloud backup into local mode gets exactly one default location', async ({ page, request, baseURL }) => {
  const settings = new SettingsPage(page)

  // Given: a cloud backup whose three locations all carry cloud-shaped ids,
  // whose default is NOT the local `'local'` sentinel, and whose default is
  // NOT already called "My Home" — otherwise "the backup's name was applied"
  // and "the live row's name was kept" would give the same answer below
  expect(cloudFixture.locations.map((l: { id: string }) => l.id)).not.toContain('local')
  expect(cloudFixture.locations[0].name).toBe(FIXTURE_DEFAULT_LOCATION_NAME)

  // When: it is imported into local mode
  await settings.navigateTo()
  await settings.triggerImport(CLOUD_FIXTURE_PATH)
  await settings.waitForImportDone('local')

  // Then: all three locations are there and exactly one is flagged default
  await expectFixtureLocations(
    page,
    request,
    baseURL,
    DESTINATION_DEFAULT_LOCATION_NAME,
  )

  // And the flagged row is the LOCAL sentinel id, not the backup's own. This
  // is the stray-row check: leave `locations[].id` out of the remap and the
  // backup's default row keeps its cloud id, `ensureDefaultLocationRow` adds a
  // fourth `local` row, and the count above reads 4 instead of 3.
  const rows = await readRows(page, 'locations')
  expect(
    rows.filter((r) => r.isDefault === true).map((r) => [r.id, r.name]),
  ).toEqual([['local', DESTINATION_DEFAULT_LOCATION_NAME]])
})
