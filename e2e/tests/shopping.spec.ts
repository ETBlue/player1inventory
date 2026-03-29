import { test, expect } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { ItemPage } from '../pages/ItemPage'
import { PantryPage } from '../pages/PantryPage'
import { ShoppingPage } from '../pages/ShoppingPage'

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

test('user can checkout items from shopping cart', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)
  const shopping = new ShoppingPage(page)

  // Given: item "Test Milk" exists with 0 packed quantity (default)
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Test Milk')
  await item.save()
  // item.save() waits for navigation to /items/$id — packed quantity defaults to 0

  // When: navigate to shopping page, add item to cart, checkout
  await shopping.navigateTo()
  await shopping.addItemToCart('Test Milk')
  await shopping.clickDone()
  await shopping.confirmCheckout()

  // Then: cart is empty — Done button is disabled
  await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled()

  // And: navigate to pantry and open the item — packed quantity is now 1
  await pantry.navigateTo()
  await pantry.getItemCard('Test Milk').click()
  await expect(item.getPackedQuantityInput()).toHaveValue('1')
})
