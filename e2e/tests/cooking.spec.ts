import { test, expect, type Page } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { CookingPage } from '../pages/CookingPage'
import { ItemPage } from '../pages/ItemPage'
import { PantryPage } from '../pages/PantryPage'

// Seed items and a recipe directly into IndexedDB.
// This avoids 10-15 UI steps for creating items + recipe before testing cooking.
// The app must load at '/' first so Dexie initialises the DB schema.
async function seedDatabase(page: Page) {
  await page.goto('/')

  // Generate IDs in Node context so we can return them for later verification
  const flourId = crypto.randomUUID()
  const eggsId = crypto.randomUUID()
  const recipeId = crypto.randomUUID()
  const now = new Date().toISOString()

  await page.evaluate(
    async ({ flourId, eggsId, recipeId, now }) => {
      // Open the already-initialised DB (Dexie created it on page load)
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      const put = (storeName: string, record: object) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite')
          const req = tx.objectStore(storeName).put(record)
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error)
        })

      await put('items', {
        id: flourId,
        name: 'Flour',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 10,
        unpackedQuantity: 0,
        consumeAmount: 1,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      await put('items', {
        id: eggsId,
        name: 'Eggs',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 12,
        unpackedQuantity: 0,
        consumeAmount: 1,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      await put('recipes', {
        id: recipeId,
        name: 'Pancakes',
        items: [
          { itemId: flourId, defaultAmount: 2 },
          { itemId: eggsId, defaultAmount: 3 },
        ],
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
    },
    { flourId, eggsId, recipeId, now },
  )

  return { flourId, eggsId, recipeId }
}

test.beforeEach(async ({ request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
  }
})

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
  } else {
    await page.goto('/')
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases()
      await Promise.all(
        dbs.map(({ name }) => {
          return new Promise<void>((resolve, reject) => {
            if (!name) {
              resolve()
              return
            }
            const req = indexedDB.deleteDatabase(name)
            req.onsuccess = () => resolve()
            req.onerror = () => reject(req.error)
            req.onblocked = () => {
              console.warn(`[afterEach] IndexedDB delete blocked for "${name}"...`)
              resolve()
            }
          })
        }),
      )
      localStorage.clear()
      sessionStorage.clear()
    })
  }
})

test('user can cook a recipe with partial items and multiple servings', async ({ page }) => {
  const cooking = new CookingPage(page)
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given: items "Flour" (qty 10) and "Eggs" (qty 12) exist, linked in "Pancakes" recipe
  await seedDatabase(page)

  // When: navigate to cooking page
  await cooking.navigateTo()

  // And: check "Pancakes" recipe (both items checked by default since defaultAmount > 0)
  await expect(page.getByRole('checkbox', { name: 'Pancakes' })).toBeVisible()
  await cooking.checkRecipe('Pancakes')

  // And: expand the recipe to see items
  await cooking.expandRecipe('Pancakes')

  // And: uncheck "Eggs" (leave only Flour checked)
  await expect(page.getByLabel('Remove Eggs')).toBeVisible()
  await cooking.uncheckItem('Eggs')

  // And: increase servings from 1 to 2
  await cooking.increaseServings()

  // And: click Done and confirm
  await cooking.clickDone()
  await cooking.confirmDone()

  // Then: navigate to pantry and verify Flour quantity reduced by 2 servings × 2 defaultAmount = 4
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Flour')).toBeVisible()
  await pantry.getItemCard('Flour').click()
  await expect(item.getPackedQuantityInput()).toHaveValue('6')

  // And: navigate back to pantry and verify Eggs quantity unchanged (was unchecked)
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Eggs')).toBeVisible()
  await pantry.getItemCard('Eggs').click()
  await expect(item.getPackedQuantityInput()).toHaveValue('12')
})

// ─── Cloud mode tests ────────────────────────────────────────────────────────

test('user can view recipes in cloud mode', async ({ page, baseURL }) => {
  test.skip(baseURL !== CLOUD_WEB_URL, 'Cloud mode only')
  const cooking = new CookingPage(page)

  // Given: a recipe is created via the settings UI
  await page.goto('/settings/recipes')
  await page.getByRole('button', { name: /new recipe/i }).click()
  await page.waitForURL((url) => url.pathname === '/settings/recipes/new')
  await page.getByLabel('Name').fill('Cloud Pancakes')
  await page.getByRole('button', { name: /save/i }).click()
  await page.waitForURL((url) => url.pathname.startsWith('/settings/recipes/') && url.pathname !== '/settings/recipes/new')

  // When: navigate to cooking page
  await cooking.navigateTo()

  // Then: "Cloud Pancakes" recipe is visible
  await expect(page.getByRole('checkbox', { name: 'Cloud Pancakes' })).toBeVisible()
})

test('user can mark a recipe as last cooked in cloud mode', async ({ page, baseURL }) => {
  test.skip(baseURL !== CLOUD_WEB_URL, 'Cloud mode only')
  const cooking = new CookingPage(page)

  // Given: a recipe exists (created via UI, no items needed)
  await page.goto('/settings/recipes')
  await page.getByRole('button', { name: /new recipe/i }).click()
  await page.waitForURL((url) => url.pathname === '/settings/recipes/new')
  await page.getByLabel('Name').fill('Cloud Omelette')
  await page.getByRole('button', { name: /save/i }).click()
  await page.waitForURL((url) => url.pathname.startsWith('/settings/recipes/') && url.pathname !== '/settings/recipes/new')

  // When: navigate to cooking, check the recipe, and confirm done
  await cooking.navigateTo()
  await cooking.checkRecipe('Cloud Omelette')
  await cooking.clickDone()
  await cooking.confirmDone()

  // Then: navigating back to cooking still shows the recipe (lastCookedAt updated, recipe not deleted)
  await cooking.navigateTo()
  await expect(page.getByRole('checkbox', { name: 'Cloud Omelette' })).toBeVisible()
})
