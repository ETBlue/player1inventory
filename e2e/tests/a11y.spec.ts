import { test } from '@playwright/test'
import { checkA11y, injectAxe } from 'axe-playwright'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'

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
