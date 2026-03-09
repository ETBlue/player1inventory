import { test, expect } from '@playwright/test'
import { ItemPage } from '../pages/ItemPage'
import { PantryPage } from '../pages/PantryPage'
import { ShoppingPage } from '../pages/ShoppingPage'

test.afterEach(async ({ page }) => {
  // Same IndexedDB cleanup as item-management.spec.ts
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
  await expect(page.locator('#packedQuantity')).toHaveValue('1')
})
