import { expect, test, type Page } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../../constants'
import { ItemPage } from '../../pages/ItemPage'
import { PantryPage } from '../../pages/PantryPage'
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
    await page.waitForURL(/\/settings\/vendors\/(?!new)[^/]/)
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

test.describe('vendor item count after vendor assignment', () => {
  test('vendor item count updates after vendor is assigned to an item', async ({ page, baseURL }) => {
    const vendorsPage = new VendorsPage(page)
    const pantry = new PantryPage(page)
    const item = new ItemPage(page)

    // Given: a vendor "Test Shop" exists and an item "Test Mango" exists WITHOUT the vendor
    if (baseURL === CLOUD_WEB_URL) {
      // Cloud: create vendor via UI, then create item without assigning vendor
      await vendorsPage.navigateTo()
      await vendorsPage.clickNewVendor()
      await vendorsPage.fillVendorName('Test Shop')
      await vendorsPage.clickSave()
      await page.waitForURL(/\/settings\/vendors\/(?!new)[^/]/)

      // Create item via pantry UI (vendor not assigned)
      await pantry.navigateTo()
      await pantry.clickAddItem()
      await item.fillName('Test Mango')
      await item.save()
    } else {
      // Local: seed vendor and item (without vendor) directly into IndexedDB
      await seedVendor(page, 'Test Shop')
      // Item seeded without any vendorIds
      await page.goto('/')
      await page.evaluate(async ({ name, now }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('Player1Inventory')
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        })
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('items', 'readwrite')
          const req = tx.objectStore('items').put({
            id: crypto.randomUUID(),
            name,
            tagIds: [],
            vendorIds: [],
            targetUnit: 'package',
            targetQuantity: 0,
            refillThreshold: 0,
            packedQuantity: 0,
            unpackedQuantity: 0,
            consumeAmount: 0,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          })
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error)
        })
      }, { name: 'Test Mango', now: new Date().toISOString() })
    }

    // First: navigate to vendors list to prime the TanStack Query cache with count=0
    await vendorsPage.navigateTo()
    // Confirm count is 0 (dialog says "No items are assigned to…")
    await vendorsPage.clickDeleteVendor('Test Shop')
    await expect(vendorsPage.getDeleteDialog()).toContainText('No items are assigned to')
    await vendorsPage.cancelDeleteDialog()

    // When: navigate to the item's vendors tab and assign the vendor
    await pantry.navigateTo()
    await pantry.getItemCard('Test Mango').click()
    await item.navigateToTab('vendors')

    // Toggle the "Test Shop" badge to assign it (initially unselected)
    await page.getByRole('button', { name: /test shop/i, pressed: false }).click()
    await expect(
      page.getByRole('button', { name: /test shop/i, pressed: true })
    ).toBeVisible()

    // Then: navigate to settings vendors page — the cached count must have been invalidated
    // and reflect the assignment (count=1), not the stale count=0
    await vendorsPage.navigateTo()

    // Click delete to open dialog and verify the count reflects the assignment
    // Dialog description: '"Test Shop" will be removed from 1 item.'
    // (src/i18n/locales/en.json: settings.vendors.deleteWithItems_one)
    await vendorsPage.clickDeleteVendor('Test Shop')
    await expect(vendorsPage.getDeleteDialog()).toContainText('will be removed from 1 item')

    // Cancel — do not delete
    await vendorsPage.cancelDeleteDialog()
  })
})

test.describe('vendor item count after item deletion', () => {
  test('vendor item count updates after item is deleted', async ({ page, baseURL }) => {
    const vendorsPage = new VendorsPage(page)
    const pantry = new PantryPage(page)
    const item = new ItemPage(page)

    // Given: a vendor "Test Market" exists and an item "Test Carrot" is assigned to it
    if (baseURL === CLOUD_WEB_URL) {
      // Cloud: create vendor via UI, then create item and assign vendor via item vendors tab
      await vendorsPage.navigateTo()
      await vendorsPage.clickNewVendor()
      await vendorsPage.fillVendorName('Test Market')
      await vendorsPage.clickSave()
      await page.waitForURL(/\/settings\/vendors\/(?!new)[^/]/)

      // Create item via pantry UI
      await pantry.navigateTo()
      await pantry.clickAddItem()
      await item.fillName('Test Carrot')
      await item.save()

      // Assign vendor from item vendors tab
      await item.navigateToTab('vendors')
      // Toggle the "Test Market" badge to assign it (initially unselected)
      await page.getByRole('button', { name: /test market/i, pressed: false }).click()
      await expect(
        page.getByRole('button', { name: /test market/i, pressed: true })
      ).toBeVisible()
    } else {
      // Local: seed vendor, then seed item with vendor already assigned
      const vendorId = await seedVendor(page, 'Test Market')
      await seedItemWithVendor(page, 'Test Carrot', vendorId)

      // Navigate to pantry so TanStack Query cache is populated
      await pantry.navigateTo()
    }

    // When: navigate to settings vendors page and check the item count for "Test Market"
    await vendorsPage.navigateTo()

    // Click the delete button to open the dialog and read the count from the description
    // Dialog description says: '"Test Market" will be removed from 1 item.'
    // (src/i18n/locales/en.json: settings.vendors.deleteWithItems_one)
    await vendorsPage.clickDeleteVendor('Test Market')
    await expect(vendorsPage.getDeleteDialog()).toContainText('will be removed from 1 item')

    // Cancel so we don't delete the vendor
    await vendorsPage.cancelDeleteDialog()

    // Then: navigate to the item and delete it
    await pantry.navigateTo()
    await pantry.getItemCard('Test Carrot').click()
    await item.delete()

    // And: navigate back to settings vendors page and verify the count is now 0
    await vendorsPage.navigateTo()

    // Click delete again to check the updated count in the dialog
    await vendorsPage.clickDeleteVendor('Test Market')
    // Dialog now says: 'No items are assigned to "Test Market".'
    // (src/i18n/locales/en.json: settings.vendors.deleteNoItems)
    await expect(vendorsPage.getDeleteDialog()).toContainText('No items are assigned to')

    // Cancel — do not actually delete
    await vendorsPage.cancelDeleteDialog()
  })
})

// Seed an item with a vendor directly into IndexedDB (local mode only)
async function seedItemWithVendor(page: Page, name: string, vendorId: string): Promise<string> {
  const itemId = crypto.randomUUID()
  const now = new Date().toISOString()

  await page.evaluate(
    async ({ itemId, name, vendorId, now }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('items', 'readwrite')
        const req = tx.objectStore('items').put({
          id: itemId,
          name,
          tagIds: [],
          vendorIds: [vendorId],
          targetUnit: 'package',
          targetQuantity: 0,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 0,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    },
    { itemId, name, vendorId, now },
  )

  return itemId
}
