import { test, expect } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { ItemPage } from '../pages/ItemPage'
import { PantryPage } from '../pages/PantryPage'
import { SettingsPage } from '../pages/SettingsPage'

// Prevent empty-data redirect to /onboarding so tests can navigate freely.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
})

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: delete all test data from MongoDB via the E2E cleanup endpoint.
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
  } else {
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
  }
})

test('user can create an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given user is on the pantry page
  await pantry.navigateTo()

  // When user creates a new item
  await pantry.clickAddItem()
  await item.fillName('Test Milk')
  // save() waits for navigation to /items/:id — verifies the app redirects after create
  await item.save()

  // Then the item appears in the pantry list
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Test Milk')).toBeVisible()
})

test('user can view item details after navigating from pantry', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an item exists
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Detail Item')
  await item.save()

  // When user navigates to pantry and clicks the item card
  await pantry.navigateTo()
  await pantry.getItemCard('Detail Item').click()

  // Then the item detail page loads correctly (not "Item not found")
  await expect(page.getByText('Item not found')).not.toBeVisible()
  await expect(page.getByLabel('Name')).toBeVisible()
})

test('user can edit an item name', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an existing item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Edit Me')
  await item.save()

  // When user navigates back and reopens the item to edit it
  await pantry.navigateTo()
  await pantry.getItemCard('Edit Me').click()
  await item.fillName('Edited Name')
  await item.saveExisting()

  // Then the updated name appears in the pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Edited Name')).toBeVisible()
  await expect(pantry.getItemCard('Edit Me')).not.toBeVisible()
})

test('user can assign a tag to an item', async ({ page, baseURL }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)
  const settings = new SettingsPage(page)

  // Given a tag type exists and a new item
  await settings.createTagType('Category')
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Tagged Item')
  await item.save()

  // When user creates and assigns a tag inline
  await item.createAndAssignTag('Dairy')

  // Then the assigned tag badge is visible (aria-pressed="true" = assigned state)
  await expect(page.getByRole('button', { name: 'Dairy', pressed: true })).toBeVisible()
})

test('user can assign a vendor to an item', async ({ page, baseURL }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an existing item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Vendor Item')
  await item.save()

  // When user creates and assigns a vendor
  await item.createAndAssignVendor('Costco')

  // Then the vendor badge is visible on the vendors tab (selected = neutral variant with X icon)
  // The badge renders with the vendor name text on the vendors tab
  await expect(page.getByRole('main').getByText('Costco')).toBeVisible()
})

test('user can set specific-date expiration on an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given a new item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Expiry Date Item')
  // save() navigates to /items/$id
  await item.save()

  // When user selects "Specific Date" expiration mode and sets a past due date
  await item.selectExpirationMode('Specific Date')
  await item.fillExpirationDueDate('2020-01-01')
  await item.fillPackedQuantity('1')
  await item.saveExisting()

  // Then the item card in the pantry shows the "Expires on" text for the saved date
  await pantry.navigateTo()
  await expect(page.getByText(/Expires on 2020-01-01/)).toBeVisible()
})

test('user can set days-from-purchase expiration on an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given a new item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Expiry Days Item')
  // save() navigates to /items/$id — capture item ID for the re-open assertion
  await item.save()
  const itemId = item.getCurrentItemId()

  // When user selects "Days from Purchase" mode and enters estimated days
  await item.selectExpirationMode('Days from Purchase')
  await item.fillEstimatedDueDays('30')
  await item.saveExisting()

  // Then revisiting the item shows "Days from Purchase" mode persisted
  await page.goto(`/items/${itemId}`)
  await expect(item.getExpirationModeSelector()).toContainText('Days from Purchase')
})

test('user can delete an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an existing item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Delete Me')
  await item.save()

  // Verify it exists in the pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Delete Me')).toBeVisible()

  // When user opens the item and deletes it
  await pantry.getItemCard('Delete Me').click()
  await item.delete()

  // Then the item no longer appears in the pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Delete Me')).not.toBeVisible()
})

test('user can quick-update item quantity via dialog', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an item with targetQuantity=5 and initial packedQuantity=2
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Olive Oil')
  await item.save()
  // Set targetQuantity and initial packedQuantity on the detail page (/items/$id)
  // These fields do not exist in the NewItemDialog — only on the detail form.
  await item.fillTargetQuantity('5')
  await item.fillPackedQuantity('2')
  await item.saveExisting()

  // Navigate to pantry
  await pantry.navigateTo()

  // When user clicks the quick update button on the item card
  await pantry.clickQuickUpdate('Olive Oil')

  // Then the quick update dialog opens
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Update/i })).toBeVisible()

  // When user fills to full stock (sets packedQuantity = targetQuantity = 5)
  await page.getByRole('button', { name: 'Fill to Full' }).click()

  // And submits
  await page.getByRole('button', { name: 'Update' }).click()

  // Then the dialog closes
  await expect(page.getByRole('dialog')).not.toBeVisible()
})
