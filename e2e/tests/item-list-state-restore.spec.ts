import { test, expect } from '@playwright/test'
import { PantryPage } from '../pages/PantryPage'

test.afterEach(async ({ page }) => {
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

// Seed items directly into IndexedDB for fast setup.
// Navigate to '/' first so Dexie initialises the schema.
async function seedItems(page: import('@playwright/test').Page, names: string[]) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await page.evaluate(async (itemNames) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const now = new Date().toISOString()
    const tx = db.transaction('items', 'readwrite')
    const store = tx.objectStore('items')

    for (let i = 0; i < itemNames.length; i++) {
      const id = `seed-item-${i}`
      store.put({
        id,
        name: itemNames[i],
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 0,
        createdAt: now,
        updatedAt: now,
      })
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    db.close()
  }, names)
}

test('user can navigate to item detail and back with search state preserved', async ({ page }) => {
  const pantry = new PantryPage(page)

  // Given items exist including "Milk"
  await seedItems(page, ['Apple', 'Banana', 'Milk', 'Cheese', 'Bread'])
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Milk')).toBeVisible()

  // When user opens search (aria-label="Toggle search") and types "milk"
  // Search toggle: aria-label="Toggle search" (src/components/item/ItemListToolbar/index.tsx:217)
  await page.getByRole('button', { name: 'Toggle search' }).click()
  // The search input is a plain <Input> without type="search" → role=textbox, not searchbox
  // (src/components/item/ItemListToolbar/index.tsx:259)
  await page.getByPlaceholder('Search items...').fill('milk')
  await page.waitForTimeout(200) // let URL param update settle

  // And navigates to the milk item detail
  await pantry.getItemCard('Milk').click()
  await page.waitForURL(/\/items\//)

  // And clicks the back button (aria-label="Go back", src/routes/items/$id.tsx:111)
  await page.getByRole('button', { name: 'Go back' }).click()
  // Wait for URL to return to pantry root — pathname is '/' but may include '?q=milk'
  await page.waitForURL((url) => url.pathname === '/')

  // Then the search input still shows "milk" (URL param ?q=milk is preserved via router.history.push)
  await expect(page.getByPlaceholder('Search items...')).toHaveValue('milk')
})

test('user can navigate to item detail and back with sort state preserved', async ({ page }) => {
  const pantry = new PantryPage(page)

  // Given a few items exist
  await seedItems(page, ['Apple', 'Banana', 'Milk'])
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Apple')).toBeVisible()

  // When user changes sort to "Name" via the sort dropdown
  // Sort trigger: aria-label="Sort by criteria" (src/components/item/ItemListToolbar/index.tsx:140)
  await page.getByRole('button', { name: 'Sort by criteria' }).click()
  // Menu item label: sortLabels['name'] = 'Name' (src/components/item/ItemListToolbar/index.tsx:27)
  await page.getByRole('menuitem', { name: 'Name' }).click()
  await page.waitForTimeout(100)

  // And navigates to an item detail
  await pantry.getItemCard('Apple').click()
  await page.waitForURL(/\/items\//)

  // And clicks back
  await page.getByRole('button', { name: 'Go back' }).click()
  await page.waitForURL('/')

  // Then sort preference is still "name" in localStorage (persisted by useSortFilter)
  // pantry uses storageKey='pantry', so key is 'pantry-sort-prefs'
  const sortPrefs = await page.evaluate(() => localStorage.getItem('pantry-sort-prefs'))
  expect(sortPrefs).not.toBeNull()
  expect(JSON.parse(sortPrefs!).sortBy).toBe('name')
})

test('user can navigate to item detail and back with scroll position restored', async ({ page }) => {
  const pantry = new PantryPage(page)

  // Given many items exist (enough to make the page scrollable)
  const itemNames = Array.from({ length: 40 }, (_, i) => `Item ${String(i + 1).padStart(2, '0')}`)
  await seedItems(page, itemNames)
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Item 01')).toBeVisible()

  // Wait until the page is actually scrollable (content taller than viewport)
  await page.waitForFunction(() => document.body.scrollHeight > window.innerHeight)

  // When user scrolls down
  await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }))
  // Verify the scroll actually happened before navigating
  await page.waitForFunction(() => window.scrollY > 0)

  // And navigates to an item detail (Item 40 is at the bottom of the sorted list)
  await pantry.getItemCard('Item 40').click()
  await page.waitForURL(/\/items\//)

  // And clicks back
  await page.getByRole('button', { name: 'Go back' }).click()
  await page.waitForURL('/')

  // Wait for items to load (useScrollRestoration triggers after isLoading → false)
  await expect(pantry.getItemCard('Item 01')).toBeVisible()
  await page.waitForTimeout(400)

  // Then scroll position is restored to approximately where it was
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBeGreaterThan(100)
})
