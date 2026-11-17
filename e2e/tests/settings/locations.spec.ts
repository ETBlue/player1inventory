import { expect, type Page, test } from '@playwright/test'
import { checkA11y, injectAxe } from 'axe-playwright'
import { CLOUD_WEB_URL, homeLocationName } from '../../constants'
import { AXE_OPTIONS } from '../../helpers/axe'
import { cleanupCloudData } from '../../helpers/cloudTeardown'
import { makeGql } from '../../utils/cloud'

// Runs in BOTH projects, local and cloud.
//
// Every test here is UI-driven: it opens /settings/household/locations and clicks "Add
// location". Nothing in this file seeds a database. The only `page.evaluate()`
// call is the local-mode teardown below.
//
// An earlier version of this comment said the fixtures seed IndexedDB and that
// the file is therefore local-only. That was false — the file never seeded
// anything.
//
// Cloud isolation is by row ownership, not by database: `/e2e/cleanup` deletes
// the household E2E_USER_ID owns, its locations included. The next request
// then runs first sign-in, which makes a new household with one location,
// "Home". Without that cleanup run 2 would see run 1's "Office" and fail.
//
// THE STARTING LOCATION HAS A DIFFERENT NAME IN EACH MODE: "My Home" in local
// (Dexie's `on('populate')`), "Home" in cloud (first sign-in,
// `firstLocationName` in apps/server/src/lib/household.ts). `homeLocationName`
// in e2e/constants.ts picks the right one. They also follow different delete
// rules: local's "My Home" is the default and cannot be deleted; cloud has no
// default location, and since households H5 task F.7 any location may go,
// the last one too (before, the server refused it with `LAST_LOCATION`). The
// two delete tests at the end of this file cover one mode each.
//
// Name lookups are scoped to <main>: /settings/household/locations is not a fullscreen
// page, so at Playwright's default (desktop) viewport the sidebar's
// LocationSwitcher also renders the active location's name.

test.beforeEach(async ({ page, request, baseURL }) => {
  // Prevent empty-data redirect to /onboarding so tests can navigate freely.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  if (baseURL === CLOUD_WEB_URL) {
    // Guards against a previous run that crashed before its teardown.
    await cleanupCloudData(request)
  }
})

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: delete this user's rows through the E2E cleanup endpoint.
    await cleanupCloudData(request)
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
              `[afterEach] IndexedDB delete blocked for "${name}"...`,
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

test('user can create a location', async ({ page, baseURL }) => {
  // Given the locations settings page is open, showing the starting location
  await page.goto('/settings/household/locations')
  await expect(
    page
      .getByRole('main')
      .getByText(homeLocationName(baseURL), { exact: true }),
  ).toBeVisible()

  // When the user adds a location named "Office"
  // Add button aria-label: settings.locations.addLabel = "Add location" (src/routes/settings/household/locations/index.tsx)
  await page.getByRole('button', { name: 'Add location' }).click()
  // AddNameDialog input: label "Name" (src/components/shared/AddNameDialog/AddNameDialog.tsx)
  await page.getByRole('dialog').getByLabel('Name').fill('Office')
  // Submit: common.add = "Add"
  await page.getByRole('dialog').getByRole('button', { name: /^add$/i }).click()

  // Then "Office" appears in the list
  await expect(page.getByText('Office')).toBeVisible()
})

test('user can rename a location', async ({ page, baseURL }) => {
  await page.goto('/settings/household/locations')
  await expect(
    page
      .getByRole('main')
      .getByText(homeLocationName(baseURL), { exact: true }),
  ).toBeVisible()

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
  await page.goto('/settings/household/locations')
  await expect(
    page
      .getByRole('main')
      .getByText(homeLocationName(baseURL), { exact: true }),
  ).toBeVisible()

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
  // LOCAL ONLY. Cloud has no default location; its rule is the test below.
  test.skip(
    baseURL === CLOUD_WEB_URL,
    'cloud has no default location; see the last-location test',
  )

  // Given the locations page with only the default location
  await page.goto('/settings/household/locations')
  await expect(page.getByRole('main').getByText('My Home')).toBeVisible()

  // Then there is no delete control for the default location
  await expect(
    page.getByRole('button', { name: 'Delete My Home' }),
  ).toHaveCount(0)
})

test('user can delete the last location and sees the empty pantry', async ({
  page,
  baseURL,
}) => {
  // CLOUD ONLY. Local keeps a default location that is never deletable; see
  // the test above. Households H5 task F.7 (owner answer O8): until then the
  // server refused this delete with LAST_LOCATION.
  test.skip(
    baseURL !== CLOUD_WEB_URL,
    'local has a default location; see the test above',
  )
  const main = page.getByRole('main')

  // Given the household has one location, "Home" (made by first sign-in)
  await page.goto('/settings/household/locations')
  await expect(main.getByText('Home', { exact: true })).toBeVisible()

  // When the user deletes it and confirms
  // Delete button aria-label: settings.locations.deleteLabel = "Delete {{name}}"
  await main.getByRole('button', { name: 'Delete Home' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^delete$/i })
    .click()

  // Then the list is empty. The empty-state text is asserted first, so a list
  // that has not rendered yet cannot satisfy the absence check. It is checked
  // before the reload too: a click resolves when it is dispatched, not when
  // the delete has landed, so a reload right after it could abort it.
  // t('settings.locations.emptyTitle')
  await expect(main.getByText('No locations yet')).toBeVisible()
  await expect(main.getByText('Home', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(main.getByText('No locations yet')).toBeVisible()
  await expect(main.getByText('Home', { exact: true })).toHaveCount(0)

  // And the pantry shows the empty screen, not a spinner
  // t('noLocations.title') / t('noLocations.create')
  await page.goto('/')
  await expect(
    main.getByText('You have no locations in this household yet.'),
  ).toBeVisible()

  // When the user creates a location from there
  await main.getByRole('button', { name: 'Create a location' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Office')
  await page.getByRole('dialog').getByRole('button', { name: /^add$/i }).click()

  // Then the pantry is back, on the new location
  await expect(
    page.getByRole('button', { name: /current: Office/ }).first(),
  ).toBeVisible()
  await expect(
    main.getByText('You have no locations in this household yet.'),
  ).toHaveCount(0)
})

test('user can reorder locations', async ({ page, baseURL }) => {
  await page.goto('/settings/household/locations')
  await expect(
    page
      .getByRole('main')
      .getByText(homeLocationName(baseURL), { exact: true }),
  ).toBeVisible()

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
  const cabinHandle = page.getByRole('button', {
    name: 'Drag to reorder Cabin',
  })
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
  await page.mouse.move(officeBox.x + officeBox.width / 2, officeBox.y - 4, {
    steps: 10,
  })
  await page.mouse.up()

  // Then the order is Cabin before Office, and it persists across reload.
  await expect
    .poll(async () => page.locator('text=/^(Office|Cabin)$/').allTextContents())
    .toEqual(['Cabin', 'Office'])

  await page.reload()
  await expect(page.getByText('Cabin')).toBeVisible()
  const names = await page.locator('text=/^(Office|Cabin)$/').allTextContents()
  expect(names.indexOf('Cabin')).toBeLessThan(names.indexOf('Office'))
})

// The empty locations screen (households H5 task F.7). `a11y.spec.ts` runs in
// `local` and `pwa` only, and there a location list is never empty (local
// mode keeps its default location). So its scans, light and dark, live here
// in cloud, with the same axe rules (`e2e/helpers/axe.ts`), the way task F.4
// put the View only scans in `location-switcher.spec.ts`.
test.describe('cloud: the empty locations screen is accessible', () => {
  test.beforeEach(async ({ request, baseURL }) => {
    test.skip(baseURL !== CLOUD_WEB_URL, 'an empty list exists in cloud only')
    // The household's only location, "Home", is deleted through GraphQL.
    // The first request runs first sign-in, which makes it.
    const gql = makeGql(request)
    const { locations } = await gql<{ locations: { id: string }[] }>(
      `query { locations { id } }`,
    )
    const home = locations[0]
    if (!home) throw new Error('no Home after first sign-in')
    await gql(`mutation ($id: ID!) { deleteLocation(id: $id) }`, {
      id: home.id,
    })
  })

  async function scanEmptyPantry(page: Page) {
    await page.goto('/')
    await expect(
      page
        .getByRole('main')
        .getByText('You have no locations in this household yet.'),
    ).toBeVisible()
    await page.waitForLoadState('networkidle')
    await injectAxe(page)
    await checkA11y(page, undefined, AXE_OPTIONS)
  }

  test('user can view the empty locations screen without accessibility violations', async ({
    page,
  }) => {
    await scanEmptyPantry(page)
  })

  test('user can view the empty locations screen without accessibility violations in dark mode', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('theme-preference', 'dark')
    })
    await scanEmptyPantry(page)
  })
})
