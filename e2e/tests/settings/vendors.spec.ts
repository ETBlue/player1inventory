import { expect, test, type Page } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../../constants'
import { VendorsPage } from '../../pages/settings/VendorsPage'

// Seed a vendor directly into IndexedDB (local mode setup)
async function seedVendor(page: Page, name: string): Promise<string> {
  const vendorId = crypto.randomUUID()
  const now = new Date().toISOString()

  await page.goto('/')
  await page.evaluate(
    async ({ vendorId, name, now }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('vendors', 'readwrite')
        const req = tx.objectStore('vendors').put({
          id: vendorId,
          name,
          createdAt: new Date(now),
        })
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    },
    { vendorId, name, now },
  )

  return vendorId
}

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: delete all test data from MongoDB via the E2E cleanup endpoint.
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
  } else {
    // Local mode: clear IndexedDB, localStorage, and sessionStorage.
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

test('user can create a vendor', async ({ page }) => {
  const vendorsPage = new VendorsPage(page)

  // Given: the vendors settings page is empty
  await vendorsPage.navigateTo()

  // When: user clicks "New Vendor", fills the name, and saves
  await vendorsPage.clickNewVendor()
  await vendorsPage.fillVendorName('Costco')
  await vendorsPage.clickSave()

  // Wait for navigation to vendor detail page (post-save redirect — not /new)
  await page.waitForURL(/\/settings\/vendors\/(?!new)[^/]/)

  // Then: navigating back to vendor list shows "Costco"
  await vendorsPage.navigateTo()
  await expect(vendorsPage.getVendorCard('Costco')).toBeVisible()
})

test('user can delete a vendor', async ({ page, baseURL }) => {
  const vendorsPage = new VendorsPage(page)

  if (baseURL === CLOUD_WEB_URL) {
    // Cloud: create via UI
    await vendorsPage.navigateTo()
    await vendorsPage.clickNewVendor()
    await vendorsPage.fillVendorName('Walmart')
    await vendorsPage.clickSave()
    await vendorsPage.navigateTo()
  } else {
    // Local: seed via IndexedDB and navigate
    await seedVendor(page, 'Walmart')
    await vendorsPage.navigateTo()
  }

  await expect(vendorsPage.getVendorCard('Walmart')).toBeVisible()

  // When: user clicks the delete button and confirms
  await vendorsPage.clickDeleteVendor('Walmart')
  await vendorsPage.confirmDelete()

  // Then: "Walmart" is gone from the list
  await expect(vendorsPage.getVendorCard('Walmart')).not.toBeVisible()
})
