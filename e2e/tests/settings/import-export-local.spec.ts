import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { test, expect } from '@playwright/test'
import { ItemPage } from '../../pages/ItemPage'
import { PantryPage } from '../../pages/PantryPage'
import { SettingsPage } from '../../pages/SettingsPage'
import { ShoppingPage } from '../../pages/ShoppingPage'
import { RecipesPage } from '../../pages/settings/RecipesPage'
import { RecipeDetailPage } from '../../pages/settings/RecipeDetailPage'

const LOCAL_FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/local-backup.json')
const CLOUD_FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/cloud-backup.json')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const localFixture = JSON.parse(fs.readFileSync(LOCAL_FIXTURE_PATH, 'utf-8')) as any

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
    const storeNames = ['tagTypes', 'tags', 'vendors', 'items', 'recipes', 'inventoryLogs', 'shoppingCarts', 'cartItems']
    // Clear all stores first (removes default-populated data from Dexie's populate hook)
    for (const storeName of storeNames) {
      const tx = db.transaction([storeName], 'readwrite')
      tx.objectStore(storeName).clear()
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }
    // Seed fixture records
    const entries: [string, unknown[]][] = [
      ['tagTypes', fixture.tagTypes],
      ['tags', fixture.tags],
      ['vendors', fixture.vendors],
      ['items', fixture.items],
      ['recipes', fixture.recipes],
      ['inventoryLogs', fixture.inventoryLogs],
      ['shoppingCarts', fixture.shoppingCarts],
      ['cartItems', fixture.cartItems],
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

// Helper: run all 6 relation verifications after any import
async function verifyRelations(page: import('@playwright/test').Page) {
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

  // 6. Cart item in shopping page
  await shopping.navigateTo()
  await expect(shopping.getItemCard('Fixture Item')).toBeVisible()
}

test('user can export and re-import local data (local → local)', async ({ page }) => {
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

  // Then: verify all relations
  await verifyRelations(page)
})

test('user can import a cloud backup into local mode (cloud → local)', async ({ page }) => {
  const settings = new SettingsPage(page)

  // Given: no existing local data (fresh context from afterEach teardown)
  // When: import the cloud fixture directly (ObjectId IDs)
  await settings.navigateTo()
  await settings.triggerImport(CLOUD_FIXTURE_PATH)
  await settings.waitForImportDone('local')

  // Then: verify all relations
  await verifyRelations(page)
})
