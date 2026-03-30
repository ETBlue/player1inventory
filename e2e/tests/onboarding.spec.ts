import { test, expect } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { OnboardingPage } from '../pages/OnboardingPage'

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: delete all test data from MongoDB via the E2E cleanup endpoint.
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
    return
  }
  // Local mode for onboarding tests: clear all object stores within the DB
  // WITHOUT deleting the database itself.
  //
  // Rationale: the standard teardown (indexedDB.deleteDatabase) causes Dexie to
  // recreate the database on next load and fire the `populate` event, which seeds
  // default tag-type and tag data. That seeded data makes isEmpty=false, so the
  // onboarding redirect never fires. By clearing stores but keeping the DB, the
  // next test starts with a truly empty database and the redirect fires correctly.
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    const DB_NAME = 'Player1Inventory'
    const STORE_NAMES = [
      'items',
      'tags',
      'tagTypes',
      'inventoryLogs',
      'shoppingCarts',
      'cartItems',
      'vendors',
      'recipes',
    ]
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(STORE_NAMES, 'readwrite')
        for (const storeName of STORE_NAMES) {
          try {
            tx.objectStore(storeName).clear()
          } catch {
            // Store may not exist in this schema version — skip
          }
        }
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
      req.onerror = () => reject(req.error)
    })
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('user sees onboarding when app data is empty', async ({ page }) => {
  // Given the app has no items, tags, or vendors (clean state)

  // When the user navigates to the root
  await page.goto('/')

  // Then the user is redirected to the onboarding page
  // Use waitForURL with timeout to handle the async redirect from useEffect
  await page.waitForURL('**/onboarding', { timeout: 10000 })

  // And the app name heading is visible
  await expect(
    page.getByRole('heading', { name: 'Player 1 Inventory' }),
  ).toBeVisible()
})

test('user can start from scratch and land on pantry page', async ({ page }) => {
  const onboarding = new OnboardingPage(page)

  // Given the user is on the onboarding page
  await onboarding.navigateTo()
  await onboarding.waitForWelcomeScreen()

  // When the user clicks "Start from scratch"
  await onboarding.clickStartFromScratch()

  // Then the user is navigated directly to the pantry page
  // (no progress step — onboarding-dismissed flag is set and navigate({ to: '/' }) is called)
  await expect(page).toHaveURL('/')
})

test('user can select template items and complete onboarding', async ({ page }) => {
  const onboarding = new OnboardingPage(page)

  // Given the user is on the onboarding page
  await onboarding.navigateTo()
  await onboarding.waitForWelcomeScreen()

  // When the user chooses the template path
  await onboarding.clickChooseTemplate()

  // Then the template overview is shown
  await expect(page.getByRole('heading', { name: 'Set up your pantry' })).toBeVisible()

  // When the user opens the items browser
  await page.getByRole('button', { name: /template items/i }).click()
  await page.waitForLoadState('networkidle')

  // And selects a few items
  // ItemCard checkboxes in template mode use aria-label "Add <item name>"
  // (src/components/item/ItemCard/index.tsx:147)
  const addButtons = page.getByRole('checkbox', { name: /^Add /i })
  const first = addButtons.first()
  await first.check()

  // When the user goes back to the template overview
  await onboarding.clickBackFromBrowser()

  // And confirms
  await onboarding.clickConfirm()

  // Then the progress screen appears and completes
  await onboarding.waitForProgressComplete()

  // And the "Get started" button is shown
  await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible()

  // When the user clicks "Get started"
  await onboarding.clickGetStarted()

  // Then the user is redirected to the pantry
  await expect(page).toHaveURL('/')
})
