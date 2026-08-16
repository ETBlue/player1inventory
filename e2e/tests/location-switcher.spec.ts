import { expect, test } from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'

// The LocationSwitcher is a global active-location selector shown at the left of
// the pantry/shopping/cooking toolbars. PR B made it persist the active location
// and update its trigger label; PR D made it LIVE — switching the active location
// re-scopes the pantry to items stocked in that location. Locations are
// local-first (no cloud backend yet), so these flows are local-only.

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

// Switch the active location to a fresh one via the switcher dropdown.
async function switchTo(
  page: import('@playwright/test').Page,
  name: string,
  letter: string,
) {
  const trigger = page.getByRole('button', { name: /switch location/i }).first()
  await trigger.click()
  await page.getByRole('menuitem', { name }).click()
  await expect(trigger).toHaveText(letter)
}

test('switching the active location re-scopes the pantry to stocked items', async ({
  page,
  baseURL,
}) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

  // Given a second location "Office" and an item created in "My Home"
  await seedOfficeLocation(page)
  await page.goto('/')

  // Create "Yogurt" in the active (My Home) location via the Add combobox.
  // Add-item button: aria-label="Add item" (src/components/pantry/PantryListView.tsx)
  await page.getByRole('button', { name: 'Add item' }).click()
  const dialog = page.getByRole('dialog')
  // Combobox: role="combobox" aria-label via the Name label (NewItemDialog.tsx)
  await dialog.getByRole('combobox').fill('Yogurt')
  // No catalog match → "Create" button appears in the dialog footer; clicking it
  // creates the item and navigates to its detail page.
  await Promise.all([
    page.waitForURL(/\/items\/(?!new)[^/]+$/, { timeout: 10000 }),
    dialog.getByRole('button', { name: /create/i }).click(),
  ])

  // Go back to the pantry.
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Yogurt', level: 3 }),
  ).toBeVisible()

  // When the user switches to the empty "Office" location
  await switchTo(page, 'Office', 'O')

  // Then the pantry is empty there (Yogurt is stocked only in My Home)
  await expect(
    page.getByRole('heading', { name: 'Yogurt', level: 3 }),
  ).toHaveCount(0)

  // When the user adds the existing "Yogurt" here via the combobox (copy-on-add)
  await page.getByRole('button', { name: 'Add item' }).click()
  const officeDialog = page.getByRole('dialog')
  await officeDialog.getByRole('combobox').fill('Yog')
  // Existing global item shows up as a selectable option
  await officeDialog.getByRole('option', { name: /yogurt/i }).click()

  // Then it now appears in the Office pantry
  await expect(
    page.getByRole('heading', { name: 'Yogurt', level: 3 }),
  ).toBeVisible()

  // And switching back to "My Home" still shows the original item (unaffected)
  await switchTo(page, 'My Home', 'M')
  await expect(
    page.getByRole('heading', { name: 'Yogurt', level: 3 }),
  ).toBeVisible()
})

test('an item already stocked in the active location is shown disabled in the Add combobox', async ({
  page,
  baseURL,
}) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

  // Given an item created in the active (My Home) location
  await page.goto('/')
  await page.getByRole('button', { name: 'Add item' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox').fill('Oats')
  await Promise.all([
    page.waitForURL(/\/items\/(?!new)[^/]+$/, { timeout: 10000 }),
    dialog.getByRole('button', { name: /create/i }).click(),
  ])
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Oats', level: 3 }),
  ).toBeVisible()

  // When the user re-opens Add and searches for the same item
  await page.getByRole('button', { name: 'Add item' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox').fill('Oats')

  // Then the matching option is marked disabled (already stocked here)
  const option = dialog.getByRole('option', { name: /oats/i })
  await expect(option).toHaveAttribute('aria-disabled', 'true')
})
