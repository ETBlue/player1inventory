import { test, expect } from '@playwright/test'
import { PantryPage } from '../pages/PantryPage'

// Seed tag types directly into IndexedDB.
// Requires navigating to '/' first so Dexie initialises the schema.
async function seedTagTypes(page: import('@playwright/test').Page, names: string[]) {
  await page.evaluate(async (typeNames) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const now = new Date().toISOString()
    const tx = db.transaction('tagTypes', 'readwrite')
    const store = tx.objectStore('tagTypes')
    const colors = ['red', 'blue', 'green', 'orange', 'purple']

    for (let i = 0; i < typeNames.length; i++) {
      store.put({
        id: `seed-tagtype-${i}`,
        name: typeNames[i],
        color: colors[i % colors.length],
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

  // When user scrolls to the bottom so the last item is in the viewport
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }))
  await page.waitForFunction(() => window.scrollY > 0)
  const lastItemHeading = page.getByRole('heading', { level: 3 }).last()
  const lastItemName = await lastItemHeading.textContent()
  await expect(lastItemHeading).toBeInViewport()

  // And navigates to the last item
  await lastItemHeading.click()
  await page.waitForURL(/\/items\//)

  // And clicks back
  await page.getByRole('button', { name: 'Go back' }).click()
  await page.waitForURL('/')

  // Wait for items to load (useScrollRestoration triggers after isLoading → false)
  await expect(pantry.getItemCard('Item 01')).toBeVisible()
  await page.waitForTimeout(400)

  // Then the last item is still in the viewport
  await expect(pantry.getItemCard(lastItemName!)).toBeInViewport()
})

test('user can navigate to item detail and back with scroll position restored when filter panel is open', async ({ page }) => {
  const pantry = new PantryPage(page)

  // Given many items exist and several tag types (so filter panel has real content)
  const itemNames = Array.from({ length: 40 }, (_, i) => `Item ${String(i + 1).padStart(2, '0')}`)
  await seedItems(page, itemNames)
  // Tag types populate the filter panel — seeded after items to maximise chance
  // of tagTypes query resolving after items query on back navigation
  await seedTagTypes(page, ['Category', 'Location', 'Diet', 'Store', 'Season'])
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Item 01')).toBeVisible()

  // When user opens the filter panel (adds a row above the item list)
  // Filter toggle: aria-label="Toggle filters" (src/components/item/ItemListToolbar/index.tsx:207)
  await page.getByRole('button', { name: 'Toggle filters' }).click()
  await page.waitForTimeout(100) // let URL param update settle

  // Wait for filter panel content to be visible (tag type buttons rendered by ItemFilters)
  // "Category" is the first seeded tag type name
  await expect(page.getByRole('button', { name: 'Category' })).toBeVisible()

  // Wait until the page is scrollable
  await page.waitForFunction(() => document.body.scrollHeight > window.innerHeight)

  // And user scrolls down so the filter panel is no longer in the viewport,
  // but stops at a position where some items are still in the viewport (so we
  // can click one without Playwright auto-scrolling it into view)
  await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }))
  await page.waitForFunction(() => window.scrollY > 0)

  // Record the scroll position before navigating
  const scrollYBefore = await page.evaluate(() => window.scrollY)

  // And navigates to an item that is currently in the viewport.
  // IMPORTANT: do NOT click an off-screen element — Playwright auto-scrolls it into
  // view before clicking, which changes window.scrollY and corrupts scrollYBefore.
  const headings = page.getByRole('heading', { level: 3 })
  const headingCount = await headings.count()
  let headingToClick = headings.nth(0) // fallback (will be auto-scrolled into view if needed)
  for (let i = 0; i < headingCount; i++) {
    const h = headings.nth(i)
    const inViewport = await h.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.top >= 0 && rect.top < window.innerHeight
    })
    if (inViewport) {
      headingToClick = h
      break
    }
  }
  await headingToClick.click()
  await page.waitForURL(/\/items\//)

  // And clicks back
  await page.getByRole('button', { name: 'Go back' }).click()
  await page.waitForURL((url) => url.pathname === '/')

  // Verify the filter panel is open (back navigation preserved URL params)
  // If this fails, the filter panel state was not preserved — a separate navigation bug
  await expect(page).toHaveURL(/filters=1/)
  await expect(page.getByRole('button', { name: 'Category' })).toBeVisible()

  // Wait for items and scroll restoration to complete
  await expect(pantry.getItemCard('Item 01')).toBeVisible()
  await page.waitForTimeout(400)

  // Then scroll position is restored to approximately where it was before navigation.
  // Bug: restoreScroll() fires before tagTypes loads, filter panel is not yet rendered,
  // so scroll lands at scrollYBefore - filterPanelHeight (wrong position).
  // Fix: wait for all layout-affecting data before restoring scroll.
  const scrollYAfter = await page.evaluate(() => window.scrollY)
  expect(scrollYAfter).toBeGreaterThanOrEqual(scrollYBefore - 30)
  expect(scrollYAfter).toBeLessThanOrEqual(scrollYBefore + 30)
})
