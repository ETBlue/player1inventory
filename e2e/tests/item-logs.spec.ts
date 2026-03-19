import { test, expect } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { ItemPage } from '../pages/ItemPage'
import { PantryPage } from '../pages/PantryPage'
import { ShoppingPage } from '../pages/ShoppingPage'

test.beforeEach(async ({ request, baseURL }) => {
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
