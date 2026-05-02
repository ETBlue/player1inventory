import { expect, test } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { PantryPage } from '../pages/PantryPage'

// Seed a shelf + item into IndexedDB for local-mode tests.
// Cloud mode is not tested here (pantry is local-only in this feature).
async function seedShelfWithItem(
  page: import('@playwright/test').Page,
  shelfName: string,
  itemName: string,
): Promise<{ shelfId: string; itemId: string }> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return page.evaluate(
    async ({ shelfName, itemName }) => {
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

      const now = new Date()
      const itemId = crypto.randomUUID()
      const shelfId = crypto.randomUUID()

      await put('items', {
        id: itemId,
        name: itemName,
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
        createdAt: now,
        updatedAt: now,
      })

      await put('shelves', {
        id: shelfId,
        name: shelfName,
        type: 'selection',
        order: 0,
        itemIds: [itemId],
        createdAt: now,
        updatedAt: now,
      })

      return { shelfId, itemId }
    },
    { shelfName, itemName },
  )
}

// Seed two items: one in a named shelf, one "unsorted"
async function seedTwoShelves(
  page: import('@playwright/test').Page,
): Promise<{ shelfId: string }> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return page.evaluate(async () => {
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

    const now = new Date()
    const fridgeItemId = crypto.randomUUID()
    const pantryItemId = crypto.randomUUID()
    const shelfId = crypto.randomUUID()

    await put('items', {
      id: fridgeItemId,
      name: 'Milk',
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: now,
      updatedAt: now,
    })

    await put('items', {
      id: pantryItemId,
      name: 'Rice',
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: now,
      updatedAt: now,
    })

    await put('shelves', {
      id: shelfId,
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [fridgeItemId],
      createdAt: now,
      updatedAt: now,
    })

    return { shelfId }
  })
}

test.beforeEach(async ({ page }) => {
  // Prevent empty-data redirect to /onboarding so tests can navigate freely.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
})

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
    return
  }
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
            console.warn(
              `[afterEach] IndexedDB delete blocked for "${name}" — data may persist`,
            )
            resolve()
          }
        })
      }),
    )
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('user can see items grouped by shelves on the pantry page', async ({
  page,
}) => {
  const pantry = new PantryPage(page)

  // Given: a shelf "Fridge" with "Milk", and an unsorted item "Rice"
  await seedTwoShelves(page)

  // When: the user navigates to the pantry page
  await pantry.navigateTo()
  await page.waitForLoadState('networkidle')

  // Then: shelf cards are visible for "Fridge" and "Unsorted"
  await expect(
    page.locator('button[aria-expanded]').filter({ hasText: 'Fridge' }),
  ).toBeVisible()
  await expect(
    page.locator('button[aria-expanded]').filter({ hasText: 'Unsorted' }),
  ).toBeVisible()
})

test('user can expand and collapse a shelf', async ({ page }) => {
  const pantry = new PantryPage(page)

  // Given: a shelf "Fridge" with item "Milk"
  await seedShelfWithItem(page, 'Fridge', 'Milk')

  // When: the user navigates to the pantry page
  await pantry.navigateTo()
  await page.waitForLoadState('networkidle')

  // Then: Milk is NOT visible (shelf collapsed by default)
  const shelfButton = page
    .locator('button[aria-expanded]')
    .filter({ hasText: 'Fridge' })
  await expect(shelfButton).toHaveAttribute('aria-expanded', 'false')
  await expect(pantry.getItemCard('Milk')).not.toBeVisible()

  // When: the user clicks the shelf to expand it
  await shelfButton.click()

  // Then: Milk IS visible and the shelf is expanded
  await expect(shelfButton).toHaveAttribute('aria-expanded', 'true')
  await expect(pantry.getItemCard('Milk')).toBeVisible()

  // When: the user clicks the shelf again to collapse it
  await shelfButton.click()

  // Then: Milk is NOT visible and the shelf is collapsed
  await expect(shelfButton).toHaveAttribute('aria-expanded', 'false')
  await expect(pantry.getItemCard('Milk')).not.toBeVisible()
})

test('user can expand all and collapse all shelves', async ({ page }) => {
  const pantry = new PantryPage(page)

  // Given: a shelf "Fridge" with item "Milk" and unsorted item "Rice"
  await seedTwoShelves(page)

  // When: the user navigates to the pantry page
  await pantry.navigateTo()
  await page.waitForLoadState('networkidle')

  // Then: all shelves are collapsed initially
  // Use aria-label pattern to match only shelf toggle buttons (not the sort dropdown trigger
  // which also gets aria-expanded from Radix UI)
  const shelfButtons = page.locator('button[aria-expanded][aria-label^="Expand"], button[aria-expanded][aria-label^="Collapse"]')
  const expandedStates = await shelfButtons.evaluateAll((btns) =>
    btns.map((b) => b.getAttribute('aria-expanded')),
  )
  expect(expandedStates.every((s) => s === 'false')).toBe(true)

  // When: user clicks "Expand All"
  await pantry.clickExpandAll()

  // Then: all shelves are expanded and item cards are visible
  await expect(pantry.getItemCard('Milk')).toBeVisible()
  await expect(pantry.getItemCard('Rice')).toBeVisible()
  // Wait for all shelf buttons to reflect expanded state before checking
  await expect(shelfButtons.first()).toHaveAttribute('aria-expanded', 'true')
  const expandedStates2 = await shelfButtons.evaluateAll((btns) =>
    btns.map((b) => b.getAttribute('aria-expanded')),
  )
  expect(expandedStates2.every((s) => s === 'true')).toBe(true)

  // When: user clicks "Collapse All"
  await pantry.clickCollapseAll()

  // Then: all shelves are collapsed and item cards are hidden
  await expect(pantry.getItemCard('Milk')).not.toBeVisible()
  await expect(pantry.getItemCard('Rice')).not.toBeVisible()
  // Wait for all shelf buttons to reflect collapsed state before checking
  await expect(shelfButtons.first()).toHaveAttribute('aria-expanded', 'false')
  const expandedStates3 = await shelfButtons.evaluateAll((btns) =>
    btns.map((b) => b.getAttribute('aria-expanded')),
  )
  expect(expandedStates3.every((s) => s === 'false')).toBe(true)
})

test('user can add a shelf from the pantry page', async ({ page }) => {
  const pantry = new PantryPage(page)

  // Given: the pantry page is open (with at least one item so it's not empty)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const now = new Date()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('items', 'readwrite')
      tx.objectStore('items').put({
        id: crypto.randomUUID(),
        name: 'Butter',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 0,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
        createdAt: now,
        updatedAt: now,
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  })

  await pantry.navigateTo()
  await page.waitForLoadState('networkidle')

  // When: the user clicks "Add shelf"
  await pantry.clickAddShelf()

  // Then: the Add Shelf dialog opens
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Create Shelf' })).toBeVisible()

  // When: the user types a shelf name and submits
  await page.getByLabel('Name').fill('Freezer')
  await page.getByRole('button', { name: 'Create Shelf' }).click()

  // Then: the dialog closes and the new shelf appears on the pantry page
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(
    page.locator('button[aria-expanded]').filter({ hasText: 'Freezer' }),
  ).toBeVisible()
})

test('user can navigate to shelf settings from the pantry page', async ({
  page,
}) => {
  // Given: a shelf "Fridge" exists
  const { shelfId } = await seedShelfWithItem(page, 'Fridge', 'Milk')

  // When: the user navigates to the pantry page
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Then: the settings icon link for the "Fridge" shelf is visible
  const settingsLink = page.getByRole('link', { name: 'Shelf settings' })
  await expect(settingsLink).toBeVisible()

  // When: the user clicks the settings icon
  await settingsLink.click()

  // Then: the user is navigated to the shelf settings page
  await expect(page).toHaveURL(new RegExp(`/settings/shelves/${shelfId}`))
})
