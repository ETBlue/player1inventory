import { expect, test } from '@playwright/test'
import { CLOUD_WEB_URL } from '../../constants'

// Locations are local-first with NO cloud GraphQL backend yet (PR A). The page
// must still render in both modes (covered by a11y.spec.ts), but the CRUD flows
// only operate against local Dexie, so the functional tests are local-only.

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

test('user can create a location', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet (PR A)')

  // Given the locations settings page is open (default "My Home" seeded on first open)
  await page.goto('/settings/locations')
  // Default location is undeletable and visible
  await expect(page.getByText('My Home')).toBeVisible()

  // When the user adds a location named "Office"
  // Add button aria-label: settings.locations.addLabel = "Add location" (src/routes/settings/locations/index.tsx)
  await page.getByRole('button', { name: 'Add location' }).click()
  // AddNameDialog input: label "Name" (src/components/shared/AddNameDialog/AddNameDialog.tsx)
  await page.getByRole('dialog').getByLabel('Name').fill('Office')
  // Submit: common.add = "Add"
  await page.getByRole('dialog').getByRole('button', { name: /^add$/i }).click()

  // Then "Office" appears in the list
  await expect(page.getByText('Office')).toBeVisible()
})

test('user can rename a location', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet (PR A)')

  await page.goto('/settings/locations')
  await expect(page.getByText('My Home')).toBeVisible()

  // Given a location "Office" exists
  await page.getByRole('button', { name: 'Add location' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Office')
  await page.getByRole('dialog').getByRole('button', { name: /^add$/i }).click()
  await expect(page.getByText('Office')).toBeVisible()

  // When the user renames it to "Studio"
  // Rename button aria-label: settings.locations.renameLabel = "Rename {{name}}"
  await page.getByRole('button', { name: 'Rename Office' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Studio')
  // Submit: common.save = "Save"
  await dialog.getByRole('button', { name: /^save$/i }).click()

  // Then "Studio" is shown and "Office" is gone
  await expect(page.getByText('Studio')).toBeVisible()
  await expect(page.getByText('Office')).not.toBeVisible()
})

test('user can delete a non-default location', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet (PR A)')

  await page.goto('/settings/locations')
  await expect(page.getByText('My Home')).toBeVisible()

  // Given a location "Office" exists
  await page.getByRole('button', { name: 'Add location' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Office')
  await page.getByRole('dialog').getByRole('button', { name: /^add$/i }).click()
  await expect(page.getByText('Office')).toBeVisible()

  // When the user deletes it and confirms
  // Delete button aria-label: settings.locations.deleteLabel = "Delete {{name}}"
  await page.getByRole('button', { name: 'Delete Office' }).click()
  // Confirm: DeleteButton AlertDialogAction = common.delete = "Delete"
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^delete$/i })
    .click()

  // Then "Office" is gone
  await expect(page.getByText('Office')).not.toBeVisible()
})

test('the default location cannot be deleted', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet (PR A)')

  // Given the locations page with only the default location
  await page.goto('/settings/locations')
  await expect(page.getByText('My Home')).toBeVisible()

  // Then there is no delete control for the default location
  await expect(
    page.getByRole('button', { name: 'Delete My Home' }),
  ).toHaveCount(0)
})

test('user can reorder locations', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet (PR A)')

  await page.goto('/settings/locations')
  await expect(page.getByText('My Home')).toBeVisible()

  // Given two extra locations exist: "Office" then "Cabin"
  await page.getByRole('button', { name: 'Add location' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Office')
  await page.getByRole('dialog').getByRole('button', { name: /^add$/i }).click()
  await expect(page.getByText('Office')).toBeVisible()

  await page.getByRole('button', { name: 'Add location' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Cabin')
  await page.getByRole('dialog').getByRole('button', { name: /^add$/i }).click()
  await expect(page.getByText('Cabin')).toBeVisible()

  // Sanity: initial order is Office then Cabin (newest appended last)
  const initialNames = await page
    .locator('text=/^(Office|Cabin)$/')
    .allTextContents()
  expect(initialNames.indexOf('Office')).toBeLessThan(
    initialNames.indexOf('Cabin'),
  )

  // When the user drags "Cabin" above "Office" using the drag handle.
  // dnd-kit's PointerSensor has an 8px activation distance, so we move the
  // mouse in steps (down → small move to activate → move up → up).
  // Drag handle aria-label: settings.locations.dragToReorder = "Drag to reorder {{name}}"
  const cabinHandle = page.getByRole('button', { name: 'Drag to reorder Cabin' })
  const officeHandle = page.getByRole('button', {
    name: 'Drag to reorder Office',
  })
  const cabinBox = await cabinHandle.boundingBox()
  const officeBox = await officeHandle.boundingBox()
  if (!cabinBox || !officeBox) throw new Error('drag handles not found')

  await page.mouse.move(
    cabinBox.x + cabinBox.width / 2,
    cabinBox.y + cabinBox.height / 2,
  )
  await page.mouse.down()
  // Move past the 8px activation threshold first.
  await page.mouse.move(
    cabinBox.x + cabinBox.width / 2,
    cabinBox.y + cabinBox.height / 2 - 12,
    { steps: 5 },
  )
  // Then move above Office's row so Cabin sorts before it.
  await page.mouse.move(
    officeBox.x + officeBox.width / 2,
    officeBox.y - 4,
    { steps: 10 },
  )
  await page.mouse.up()

  // Then the order is Cabin before Office, and it persists across reload.
  await expect
    .poll(async () =>
      page.locator('text=/^(Office|Cabin)$/').allTextContents(),
    )
    .toEqual(['Cabin', 'Office'])

  await page.reload()
  await expect(page.getByText('Cabin')).toBeVisible()
  const names = await page
    .locator('text=/^(Office|Cabin)$/')
    .allTextContents()
  expect(names.indexOf('Cabin')).toBeLessThan(names.indexOf('Office'))
})
