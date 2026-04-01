import { test } from '@playwright/test'
import { checkA11y, injectAxe } from 'axe-playwright'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'

// Prevent the empty-data redirect to /onboarding so tests can navigate to any
// page without being intercepted. Onboarding tests set this key themselves.
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
    return
  }
  // Local mode: clear IndexedDB, localStorage, and sessionStorage.
  // Navigate to the app origin so IndexedDB API is accessible, then clear all databases.
  // We must stay on the same origin to call indexedDB.databases().
  // Use onblocked to force-close any lingering connections before the delete proceeds.
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
          // If existing connections block deletion, the blocked event fires.
          // We resolve anyway since the app will be reset on next navigation.
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

// Pantry page (/)
test('user can view pantry page without accessibility violations', async ({ page }) => {
  // Given the user navigates to the pantry (home) page
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page)
})

// Shopping page (/shopping)
test('user can view shopping page without accessibility violations', async ({ page }) => {
  // Given the user navigates to the shopping page
  await page.goto('/shopping')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page)
})

// Cooking page (/cooking)
test('user can view cooking page without accessibility violations', async ({ page }) => {
  // Given the user navigates to the cooking page
  await page.goto('/cooking')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page)
})

// Settings main page (/settings)
test('user can view settings page without accessibility violations', async ({ page }) => {
  // Given the user navigates to the settings page
  await page.goto('/settings')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page)
})

// Settings > Tags list (/settings/tags)
test('user can view settings tags list without accessibility violations', async ({ page }) => {
  // Given the user navigates to the tags settings page
  await page.goto('/settings/tags')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page)
})

// Settings > Vendors list (/settings/vendors)
test('user can view settings vendors list without accessibility violations', async ({ page }) => {
  // Given the user navigates to the vendors settings page
  await page.goto('/settings/vendors')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page)
})

// Settings > Recipes list (/settings/recipes)
test('user can view settings recipes list without accessibility violations', async ({ page }) => {
  // Given the user navigates to the recipes settings page
  await page.goto('/settings/recipes')
  await page.waitForLoadState('networkidle')

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page)
})

// Onboarding page (/onboarding)
test('user can view onboarding page without accessibility violations', async ({ page }) => {
  // Given the user navigates directly to the onboarding page
  // Use a seeded item to prevent the empty-data redirect intercepting /onboarding
  // and sending us back to pantry. The skip flag prevents the redirect but we also
  // need data so the onboarding page doesn't auto-redirect itself.
  await page.goto('/onboarding')
  // Wait for the URL and a unique onboarding element to confirm the page rendered
  await page.waitForURL('**/onboarding', { timeout: 10000 })
  await page.getByRole('button', { name: 'Choose from a template...' }).waitFor({ timeout: 10000 })

  // When axe scans the page for accessibility violations
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page)
})

// Helper: seed an item into IndexedDB and return its ID
async function seedItem(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const id = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('items', 'readwrite')
      tx.objectStore('items').add({
        id,
        name: 'test item',
        tagIds: [],
        vendorIds: [],
        recipeIds: [],
        targetQuantity: 1,
        refillThreshold: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return id
  })
}

// Helper: seed a tag type + tag into IndexedDB and return the tag ID
async function seedTag(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const typeId = crypto.randomUUID()
    const tagId = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['tagTypes', 'tags'], 'readwrite')
      tx.objectStore('tagTypes').add({ id: typeId, name: 'test type', color: 'blue', createdAt: new Date() })
      tx.objectStore('tags').add({ id: tagId, name: 'test tag', tagTypeId: typeId, createdAt: new Date() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return tagId
  })
}

// Helper: seed a vendor into IndexedDB and return its ID
async function seedVendor(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const id = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('vendors', 'readwrite')
      tx.objectStore('vendors').add({ id, name: 'test vendor', createdAt: new Date() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return id
  })
}

// Helper: seed a recipe into IndexedDB and return its ID
async function seedRecipe(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const id = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('recipes', 'readwrite')
      tx.objectStore('recipes').add({ id, name: 'test recipe', items: [], createdAt: new Date() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return id
  })
}

test.describe('detail page a11y', () => {
  // Item new page (/items/new)
  test('user can view item new page without accessibility violations', async ({ page }) => {
    // Given the user navigates to the new item page
    await page.goto('/items/new')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Item detail page (/items/:id)
  test('user can view item detail page without accessibility violations', async ({ page, baseURL }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item detail page (use absolute URL to ensure SPA navigation works)
    await page.goto(`${baseURL}/items/${itemId}/`)
    await page.waitForURL(`**/items/${itemId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Item detail tags tab (/items/:id/tags)
  test('user can view item detail tags tab without accessibility violations', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item tags tab
    await page.goto(`/items/${itemId}/tags`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Item detail vendors tab (/items/:id/vendors)
  test('user can view item detail vendors tab without accessibility violations', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item vendors tab
    await page.goto(`/items/${itemId}/vendors`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Item detail recipes tab (/items/:id/recipes)
  test('user can view item detail recipes tab without accessibility violations', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item recipes tab
    await page.goto(`/items/${itemId}/recipes`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Tag detail (/settings/tags/:id)
  test('user can view settings tag detail page without accessibility violations', async ({ page }) => {
    // Given a seeded tag
    const tagId = await seedTag(page)

    // When the user navigates to the tag detail page (trailing slash required for TanStack Router index child)
    await page.goto(`/settings/tags/${tagId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Vendor new (/settings/vendors/new)
  test('user can view settings vendor new page without accessibility violations', async ({ page }) => {
    // Given the user navigates to the new vendor page
    await page.goto('/settings/vendors/new')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Vendor detail (/settings/vendors/:id)
  test('user can view settings vendor detail page without accessibility violations', async ({ page }) => {
    // Given a seeded vendor
    const vendorId = await seedVendor(page)

    // When the user navigates to the vendor detail page (trailing slash required for TanStack Router index child)
    await page.goto(`/settings/vendors/${vendorId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Recipe new (/settings/recipes/new)
  test('user can view settings recipe new page without accessibility violations', async ({ page }) => {
    // Given the user navigates to the new recipe page
    await page.goto('/settings/recipes/new')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Recipe detail (/settings/recipes/:id)
  test('user can view settings recipe detail page without accessibility violations', async ({ page }) => {
    // Given a seeded recipe
    const recipeId = await seedRecipe(page)

    // When the user navigates to the recipe detail page (trailing slash required for TanStack Router index child)
    await page.goto(`/settings/recipes/${recipeId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })
})

test.describe('dark mode a11y', () => {
  test.beforeEach(async ({ page }) => {
    // Set dark mode preference before page load so the inline script picks it up
    await page.addInitScript(() => {
      localStorage.setItem('theme-preference', 'dark')
    })
  })

  // Pantry page (/) in dark mode
  test('user can view pantry page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the pantry (home) page with dark mode enabled
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Shopping page (/shopping) in dark mode
  test('user can view shopping page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the shopping page with dark mode enabled
    await page.goto('/shopping')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Cooking page (/cooking) in dark mode
  test('user can view cooking page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the cooking page with dark mode enabled
    await page.goto('/cooking')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings main page (/settings) in dark mode
  test('user can view settings page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the settings page with dark mode enabled
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Tags list (/settings/tags) in dark mode
  test('user can view settings tags list without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the tags settings page with dark mode enabled
    await page.goto('/settings/tags')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Vendors list (/settings/vendors) in dark mode
  test('user can view settings vendors list without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the vendors settings page with dark mode enabled
    await page.goto('/settings/vendors')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Recipes list (/settings/recipes) in dark mode
  test('user can view settings recipes list without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the recipes settings page with dark mode enabled
    await page.goto('/settings/recipes')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Onboarding page (/onboarding) in dark mode
  test('user can view onboarding page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates directly to the onboarding page with dark mode enabled
    await page.goto('/onboarding')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Item new page (/items/new) in dark mode
  test('user can view item new page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the new item page with dark mode enabled
    await page.goto('/items/new')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Item detail page (/items/:id) in dark mode
  test('user can view item detail page without accessibility violations in dark mode', async ({ page, baseURL }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item detail page (use absolute URL to ensure SPA navigation works)
    await page.goto(`${baseURL}/items/${itemId}/`)
    await page.waitForURL(`**/items/${itemId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Item detail tags tab (/items/:id/tags) in dark mode
  test('user can view item detail tags tab without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item tags tab
    await page.goto(`/items/${itemId}/tags`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Item detail vendors tab (/items/:id/vendors) in dark mode
  test('user can view item detail vendors tab without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item vendors tab
    await page.goto(`/items/${itemId}/vendors`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Item detail recipes tab (/items/:id/recipes) in dark mode
  test('user can view item detail recipes tab without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded item
    const itemId = await seedItem(page)

    // When the user navigates to the item recipes tab
    await page.goto(`/items/${itemId}/recipes`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Tag detail (/settings/tags/:id) in dark mode
  test('user can view settings tag detail page without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded tag
    const tagId = await seedTag(page)

    // When the user navigates to the tag detail page (trailing slash required for TanStack Router index child)
    await page.goto(`/settings/tags/${tagId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Vendor new (/settings/vendors/new) in dark mode
  test('user can view settings vendor new page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the new vendor page with dark mode enabled
    await page.goto('/settings/vendors/new')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Vendor detail (/settings/vendors/:id) in dark mode
  test('user can view settings vendor detail page without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded vendor
    const vendorId = await seedVendor(page)

    // When the user navigates to the vendor detail page (trailing slash required for TanStack Router index child)
    await page.goto(`/settings/vendors/${vendorId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Recipe new (/settings/recipes/new) in dark mode
  test('user can view settings recipe new page without accessibility violations in dark mode', async ({ page }) => {
    // Given the user navigates to the new recipe page with dark mode enabled
    await page.goto('/settings/recipes/new')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })

  // Settings > Recipe detail (/settings/recipes/:id) in dark mode
  test('user can view settings recipe detail page without accessibility violations in dark mode', async ({ page }) => {
    // Given a seeded recipe
    const recipeId = await seedRecipe(page)

    // When the user navigates to the recipe detail page (trailing slash required for TanStack Router index child)
    await page.goto(`/settings/recipes/${recipeId}/`)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)

    // Then there should be no violations
    await checkA11y(page)
  })
})

test.describe('mobile viewport a11y', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone 14 Pro

  test('user can view pantry page without accessibility violations on mobile', async ({ page }) => {
    // Given the user navigates to the pantry (home) page on a mobile viewport
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations (including the bottom Navigation component)
    await checkA11y(page)
  })

  test('user can view shopping page without accessibility violations on mobile', async ({ page }) => {
    // Given the user navigates to the shopping page on a mobile viewport
    await page.goto('/shopping')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations (including the bottom Navigation component)
    await checkA11y(page)
  })

  test('user can view cooking page without accessibility violations on mobile', async ({ page }) => {
    // Given the user navigates to the cooking page on a mobile viewport
    await page.goto('/cooking')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations (including the bottom Navigation component)
    await checkA11y(page)
  })

  test('user can view settings page without accessibility violations on mobile', async ({ page }) => {
    // Given the user navigates to the settings page on a mobile viewport
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // When axe scans the page for accessibility violations
    await injectAxe(page)

    // Then there should be no violations (including the bottom Navigation component)
    await checkA11y(page)
  })
})
