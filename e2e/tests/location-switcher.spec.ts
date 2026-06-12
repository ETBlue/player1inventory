import { expect, test } from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'

// PR B: the LocationSwitcher is an INERT global active-location selector shown at
// the left of the pantry/shopping/cooking toolbars. It persists the active
// location and updates its trigger label, but does NOT scope any displayed data.
// Locations are local-first (no cloud backend yet), so these flows are local-only.

test.beforeEach(async ({ page }) => {
  // Prevent empty-data redirect to /onboarding so tests can navigate freely.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
})

test.afterEach(async ({ page }) => {
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
})

// Seed a second location ("Office") via the settings page so the switcher has
// more than one option to choose from.
async function seedOfficeLocation(page: import('@playwright/test').Page) {
  await page.goto('/settings/locations')
  await expect(page.getByText('My Home')).toBeVisible()
  await page.getByRole('button', { name: 'Add location' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Office')
  await page.getByRole('dialog').getByRole('button', { name: /^add$/i }).click()
  await expect(page.getByText('Office')).toBeVisible()
}

test('switcher shows the active location first letter and lists locations', async ({
  page,
  baseURL,
}) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

  // Given a second location exists
  await seedOfficeLocation(page)

  // When the user opens the pantry page
  await page.goto('/')
  // Trigger aria-label: locationSwitcher.triggerLabel (src/components/shared/LocationSwitcher/LocationSwitcher.tsx)
  const trigger = page.getByRole('button', { name: /switch location/i }).first()

  // Then the trigger shows the default location's first letter "M" (My Home)
  await expect(trigger).toHaveText('M')

  // And opening it lists all locations
  await trigger.click()
  await expect(page.getByRole('menuitem', { name: 'My Home' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Office' })).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: /manage locations/i }),
  ).toBeVisible()
})

test('switching location persists across reload', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

  await seedOfficeLocation(page)
  await page.goto('/')

  const trigger = page.getByRole('button', { name: /switch location/i }).first()
  await expect(trigger).toHaveText('M')

  // When the user switches to "Office"
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Office' }).click()

  // Then the trigger letter updates to "O"
  await expect(trigger).toHaveText('O')

  // And the choice persists across a reload
  await page.reload()
  await expect(
    page.getByRole('button', { name: /switch location/i }).first(),
  ).toHaveText('O')
})

test('"Manage" navigates to the locations settings page', async ({
  page,
  baseURL,
}) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

  await page.goto('/')
  const trigger = page.getByRole('button', { name: /switch location/i }).first()
  await trigger.click()
  await page.getByRole('menuitem', { name: /manage locations/i }).click()

  // Then the locations settings page is shown
  await expect(page).toHaveURL(/\/settings\/locations$/)
  await expect(page.getByText('My Home')).toBeVisible()
})
