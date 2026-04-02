import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { PantryPage } from '../pages/PantryPage'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { makeGql } from '../utils/cloud'

// Seed tag types directly into IndexedDB.
// Clears existing tagTypes and tags first to avoid conflicts with Dexie's default
// populate event (which seeds 'Category', 'Diet', 'Storage' on fresh DBs).
// Requires navigating to '/' first so Dexie initialises the schema.
async function seedTagTypes(
  page: import('@playwright/test').Page,
  names: string[],
  options?: { request?: APIRequestContext; baseURL?: string },
): Promise<string[]> {
  if (options?.baseURL === CLOUD_WEB_URL && options.request) {
    const gql = makeGql(options.request)
    const colors = ['red', 'blue', 'green', 'orange', 'purple']
    const ids: string[] = []
    for (let i = 0; i < names.length; i++) {
      const result = await gql<{ createTagType: { id: string } }>(
        'mutation CreateTagType($name: String!, $color: String!) { createTagType(name: $name, color: $color) { id } }',
        { name: names[i], color: colors[i % colors.length] },
      )
      ids.push(result.createTagType.id)
    }
    return ids
  }

  await page.evaluate(async (typeNames) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    // Clear default-seeded tag types and tags first so there are no name duplicates
    const clearTx = db.transaction(['tagTypes', 'tags'], 'readwrite')
    clearTx.objectStore('tagTypes').clear()
    clearTx.objectStore('tags').clear()
    await new Promise<void>((resolve, reject) => {
      clearTx.oncomplete = () => resolve()
      clearTx.onerror = () => reject(clearTx.error)
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

  return names.map((_, i) => `seed-tagtype-${i}`)
}

// Seed tags into IndexedDB and assign them to every item already in the DB.
// Tag types (seed-tagtype-{typeIndex}) must exist before calling this.
// Requires the Dexie schema to be initialised (navigate to '/' first).
async function seedTagsForAllItems(
  page: import('@playwright/test').Page,
  tags: { typeIndex: number; name: string }[],
  options?: { request?: APIRequestContext; baseURL?: string; tagTypeIds?: string[] },
) {
  if (options?.baseURL === CLOUD_WEB_URL && options.request) {
    const gql = makeGql(options.request)
    const tagTypeIds = options.tagTypeIds ?? []

    // Get all item IDs
    const { items } = await gql<{ items: { id: string }[] }>('query { items { id } }')

    // Create tags
    const tagIds: string[] = []
    for (const tag of tags) {
      const result = await gql<{ createTag: { id: string } }>(
        'mutation CreateTag($name: String!, $typeId: String!) { createTag(name: $name, typeId: $typeId) { id } }',
        { name: tag.name, typeId: tagTypeIds[tag.typeIndex] },
      )
      tagIds.push(result.createTag.id)
    }

    // Assign all tags to every item
    for (const item of items) {
      await gql(
        'mutation UpdateItem($id: ID!, $input: UpdateItemInput!) { updateItem(id: $id, input: $input) { id } }',
        { id: item.id, input: { tagIds } },
      )
    }
    return
  }

  await page.evaluate(async (tagDefs) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    // Create tag records
    const tagIds: string[] = tagDefs.map((_, i) => `seed-tag-${i}`)
    const tagTx = db.transaction('tags', 'readwrite')
    const tagStore = tagTx.objectStore('tags')
    for (let i = 0; i < tagDefs.length; i++) {
      tagStore.put({
        id: tagIds[i],
        name: tagDefs[i].name,
        typeId: `seed-tagtype-${tagDefs[i].typeIndex}`,
      })
    }
    await new Promise<void>((resolve, reject) => {
      tagTx.oncomplete = () => resolve()
      tagTx.onerror = () => reject(tagTx.error)
    })

    // Read all items in a readonly transaction first (awaiting inside a readwrite
    // transaction auto-commits it, making subsequent puts silently fail).
    const items: object[] = await new Promise((resolve, reject) => {
      const readTx = db.transaction('items', 'readonly')
      const req = readTx.objectStore('items').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    // Write all items back with the new tagIds in a fresh readwrite transaction
    const writeTx = db.transaction('items', 'readwrite')
    const writeStore = writeTx.objectStore('items')
    for (const item of items) {
      writeStore.put({ ...(item as object), tagIds })
    }
    await new Promise<void>((resolve, reject) => {
      writeTx.oncomplete = () => resolve()
      writeTx.onerror = () => reject(writeTx.error)
    })

    db.close()
  }, tags)
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
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
    return
  }

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
async function seedItems(
  page: import('@playwright/test').Page,
  names: string[],
  options?: { request?: APIRequestContext; baseURL?: string },
) {
  if (options?.baseURL === CLOUD_WEB_URL && options.request) {
    const gql = makeGql(options.request)
    for (const name of names) {
      await gql('mutation CreateItem($name: String!) { createItem(input: { name: $name }) { id } }', { name })
    }
    return
  }

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

test('user can navigate to item detail and back with search state preserved', async ({ page, request, baseURL }) => {
  const pantry = new PantryPage(page)

  // Given items exist including "Milk"
  await seedItems(page, ['Apple', 'Banana', 'Milk', 'Cheese', 'Bread'], { request, baseURL })
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

test('user can navigate to item detail and back with sort state preserved', async ({ page, request, baseURL }) => {
  const pantry = new PantryPage(page)

  // Given a few items exist
  await seedItems(page, ['Apple', 'Banana', 'Milk'], { request, baseURL })
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

test('user can navigate to item detail and back with scroll position restored', async ({ page, request, baseURL }) => {
  const pantry = new PantryPage(page)

  // Given many items exist (enough to make the page scrollable), each with tags
  const itemNames = Array.from({ length: 40 }, (_, i) => `Item ${String(i + 1).padStart(2, '0')}`)
  await seedItems(page, itemNames, { request, baseURL })
  const tagTypeIds = await seedTagTypes(page, ['Category', 'Location'], { request, baseURL })
  await seedTagsForAllItems(page, [
    { typeIndex: 0, name: 'Pantry' },
    { typeIndex: 1, name: 'Fridge' },
  ], { request, baseURL, tagTypeIds })
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Item 01')).toBeVisible()

  // And tags are toggled visible (adds tag badges to each item card, increasing card height)
  // Tag toggle: aria-label="Toggle tags" (src/components/item/ItemListToolbar/index.tsx:198)
  await page.getByRole('button', { name: 'Toggle tags' }).click()
  await expect(page).toHaveURL(/tags=1/)

  // Wait until the page is actually scrollable (content taller than viewport)
  await page.waitForFunction(() => document.body.scrollHeight > window.innerHeight)

  // When user scrolls to the bottom so the last item is in the viewport
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }))
  await page.waitForFunction(() => window.scrollY > 0)

  // The last heading in the list (lexicographic key order: seed-item-9 / "Item 10" sorts last)
  const lastItemHeading = page.getByRole('heading', { level: 3 }).last()
  // Verify it is already in the viewport — Playwright will not auto-scroll it, so
  // scrollYBefore is not corrupted by the subsequent click
  await expect(lastItemHeading).toBeInViewport()

  // Record the scroll position before navigating
  const scrollYBefore = await page.evaluate(() => window.scrollY)

  // And navigates to the last item
  await lastItemHeading.click()
  await page.waitForURL(/\/items\//)

  // And clicks back
  await page.getByRole('button', { name: 'Go back' }).click()
  await page.waitForURL((url) => url.pathname === '/')

  // Wait for items and scroll restoration to complete
  // (useScrollRestoration waits for tags to finish loading since tag badges affect item height)
  await expect(pantry.getItemCard('Item 01')).toBeVisible()
  await page.waitForTimeout(400)

  // Then scroll position is restored to approximately where it was before navigation
  const scrollYAfter = await page.evaluate(() => window.scrollY)
  expect(scrollYAfter).toBeGreaterThanOrEqual(scrollYBefore - 30)
  expect(scrollYAfter).toBeLessThanOrEqual(scrollYBefore + 30)
})

test('user can navigate to item detail and back with scroll position restored when filter panel is open', async ({ page, request, baseURL }) => {
  const pantry = new PantryPage(page)

  // Given many items exist, each with tags, and several tag types (for the filter panel)
  const itemNames = Array.from({ length: 40 }, (_, i) => `Item ${String(i + 1).padStart(2, '0')}`)
  await seedItems(page, itemNames, { request, baseURL })
  // Tag types populate the filter panel — seeded after items to maximise chance
  // of tagTypes query resolving after items query on back navigation
  const tagTypeIds = await seedTagTypes(page, ['Category', 'Location', 'Diet', 'Store', 'Season'], { request, baseURL })
  await seedTagsForAllItems(page, [
    { typeIndex: 0, name: 'Pantry' },
    { typeIndex: 1, name: 'Fridge' },
    { typeIndex: 2, name: 'Vegan' },
  ], { request, baseURL, tagTypeIds })
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Item 01')).toBeVisible()

  // When user opens the filter panel (adds a row above the item list)
  // Filter toggle: aria-label="Toggle filters" (src/components/item/ItemListToolbar/index.tsx:207)
  await page.getByRole('button', { name: 'Toggle filters' }).click()
  await page.waitForTimeout(100) // let URL param update settle

  // Wait for filter panel content to be visible (tag type buttons rendered by ItemFilters)
  // "Category" is the first seeded tag type name
  await expect(page.getByRole('button', { name: 'Category' })).toBeVisible()

  // And tags are toggled visible (tag badges affect item card height, exercising the
  // allDataLoaded guard in useScrollRestoration)
  // Tag toggle: aria-label="Toggle tags" (src/components/item/ItemListToolbar/index.tsx:198)
  await page.getByRole('button', { name: 'Toggle tags' }).click()
  await expect(page).toHaveURL(/tags=1/)

  // Wait until the page is scrollable
  await page.waitForFunction(() => document.body.scrollHeight > window.innerHeight)

  // When user scrolls to the bottom so the last item is in the viewport
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }))
  await page.waitForFunction(() => window.scrollY > 0)

  // The last heading in the list (lexicographic key order: seed-item-9 / "Item 10" sorts last)
  const lastItemHeading = page.getByRole('heading', { level: 3 }).last()
  // Verify it is already in the viewport — Playwright will not auto-scroll it, so
  // scrollYBefore is not corrupted by the subsequent click
  await expect(lastItemHeading).toBeInViewport()

  // Record the scroll position before navigating
  const scrollYBefore = await page.evaluate(() => window.scrollY)

  // And navigates to the last item
  await lastItemHeading.click()
  await page.waitForURL(/\/items\//)

  // And clicks back
  await page.getByRole('button', { name: 'Go back' }).click()
  await page.waitForURL((url) => url.pathname === '/')

  // Verify URL params are preserved (filter panel and tag visibility)
  // If these fail, URL state was not preserved — a separate navigation bug
  await expect(page).toHaveURL(/filters=1/)
  await expect(page).toHaveURL(/tags=1/)
  // Use first() because with both ?filters=1 and ?tags=1 active, "Category" appears
  // in both the filter panel dropdown and the tags-visible row
  await expect(page.getByRole('button', { name: 'Category' }).first()).toBeVisible()

  // Wait for items and scroll restoration to complete
  await expect(pantry.getItemCard('Item 01')).toBeVisible()
  await page.waitForTimeout(400)

  // Then scroll position is restored to approximately where it was before navigation.
  // Bug: restoreScroll() fires before tagTypes/tags load, filter panel and tag badges are
  // not yet rendered, so scroll lands at scrollYBefore - (filterPanelHeight + tagBadgesHeight).
  // Fix: wait for all layout-affecting data before restoring scroll.
  const scrollYAfter = await page.evaluate(() => window.scrollY)
  expect(scrollYAfter).toBeGreaterThanOrEqual(scrollYBefore - 30)
  expect(scrollYAfter).toBeLessThanOrEqual(scrollYBefore + 30)
})
