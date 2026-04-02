import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { CookingPage } from '../pages/CookingPage'
import { ItemPage } from '../pages/ItemPage'
import { PantryPage } from '../pages/PantryPage'
import { ShoppingPage } from '../pages/ShoppingPage'
import { makeGql } from '../utils/cloud'

// Seed one item with initial stock and a recipe that uses it.
// Local mode: seeds directly into IndexedDB.
// Cloud mode: seeds via GraphQL API.
async function seedCookingData(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<{ milkId: string }> {
  if (baseURL === CLOUD_WEB_URL) {
    const gql = makeGql(request)
    const { createItem: milk } = await gql<{ createItem: { id: string } }>(
      'mutation CreateItem($name: String!) { createItem(input: { name: $name }) { id } }',
      { name: 'Test Milk' },
    )
    await gql(
      'mutation UpdateItem($id: ID!, $input: UpdateItemInput!) { updateItem(id: $id, input: $input) { id } }',
      { id: milk.id, input: { packedQuantity: 5 } },
    )
    await gql(
      `mutation CreateRecipe($name: String!, $items: [RecipeItemInput!]) {
        createRecipe(name: $name, items: $items) { id }
      }`,
      { name: 'Test Recipe', items: [{ itemId: milk.id, defaultAmount: 1 }] },
    )
    return { milkId: milk.id }
  }

  await page.goto('/')
  const milkId = crypto.randomUUID()
  const recipeId = crypto.randomUUID()
  const now = new Date().toISOString()

  await page.evaluate(
    async ({ milkId, recipeId, now }) => {
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
        id: milkId,
        name: 'Test Milk',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 5,
        unpackedQuantity: 0,
        consumeAmount: 1,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      await put('recipes', {
        id: recipeId,
        name: 'Test Recipe',
        items: [{ itemId: milkId, defaultAmount: 1 }],
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
    },
    { milkId, recipeId, now },
  )

  return { milkId }
}

test.beforeEach(async ({ page, request, baseURL }) => {
  // Prevent empty-data redirect to /onboarding so tests can navigate freely.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  if (baseURL === CLOUD_WEB_URL) {
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
  }
})

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: delete all test data from MongoDB via the E2E cleanup endpoint.
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
    return
  }
  // Local mode: clear IndexedDB, localStorage, and sessionStorage.
  // Navigate to the app origin so IndexedDB API is accessible, then clear all databases.
  // We must stay on the same origin to call indexedDB.databases().
  // Use onblocked to force-close any lingering connections before the delete proceeds.
  await page.goto('/')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map(({ name }) => {
      return new Promise<void>((resolve, reject) => {
        if (!name) { resolve(); return }
        const req = indexedDB.deleteDatabase(name)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
        // If existing connections block deletion, the blocked event fires.
        // We resolve anyway since the app will be reset on next navigation.
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

test('user can see empty log state for a new item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given: a new item "Test Milk" is created on the pantry page
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Test Milk')
  await item.save()

  // When: navigate to the item log tab
  await item.navigateToLogTab()
  await page.waitForURL(/\/items\/[^/]+\/log/)

  // Then: the empty state message is visible
  await expect(item.getEmptyLogMessage()).toBeVisible()
})

test('user can see inventory log after cooking', async ({ page, request, baseURL }) => {
  const cooking = new CookingPage(page)
  const item = new ItemPage(page)

  // Given: "Test Milk" (qty 5) exists and "Test Recipe" uses it
  const { milkId } = await seedCookingData(page, request, baseURL)

  // When: cook the recipe on the cooking page
  await cooking.navigateTo()
  await cooking.checkRecipe('Test Recipe')
  await cooking.clickDone()
  await cooking.confirmDone()

  // Then: navigate to the item log tab
  await page.goto(`/items/${milkId}/log`)
  await page.waitForURL(`/items/${milkId}/log`)

  // Then: a negative-delta log entry is visible and the empty state is gone
  await expect(item.getEmptyLogMessage()).not.toBeVisible()
  await expect(item.getLogEntries().first()).toBeVisible()
})

test('user can see inventory log after checkout', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)
  const shopping = new ShoppingPage(page)

  // Given: item "Test Milk" exists on pantry
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Test Milk')
  await item.save()
  const itemId = item.getCurrentItemId()

  // When: add to cart → checkout
  await shopping.navigateTo()
  await shopping.addItemToCart('Test Milk')
  await shopping.clickDone()
  await shopping.confirmCheckout()
  await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled()

  // Then: navigate to the item log tab
  await page.goto(`/items/${itemId}/log`)
  await page.waitForURL(`/items/${itemId}/log`)

  // Then: at least one log entry is visible and the empty state is gone
  await expect(item.getEmptyLogMessage()).not.toBeVisible()
  await expect(item.getLogEntries().first()).toBeVisible()
})
