import { expect, test } from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'
import { cleanupCloudData } from '../helpers/cloudTeardown'

// The LocationSwitcher is a global active-location selector. PR B made it persist
// the active location and update its trigger label; PR D made it LIVE — switching
// the active location re-scopes the pantry to items stocked in that location.
//
// Runs in BOTH projects, local and cloud.
//
// Every fixture here is UI-driven. `seedOfficeLocation()` below clicks through
// /settings/locations, and items are created through the pantry's Add combobox.
// The only `page.evaluate()` call in this file is the local-mode teardown in
// `afterEach`.
//
// An earlier version of this comment said every fixture seeds IndexedDB through
// `page.evaluate()`, and that the file is local-only for that reason. That was
// false — no fixture here seeds anything.
//
// Cloud isolation is by row ownership, not by database: every write is owned by
// E2E_USER_ID, and `/e2e/cleanup` deletes that user's rows. As of this branch
// that endpoint also deletes `Location` and `ItemStock`. Without it,
// `ensureDefaultLocation` (location.resolver.ts) returns early whenever the user
// already has a location, so run 2 would see run 1's "Office" and fail.
//
// IT IS MOUNTED TWICE, and exactly one copy is visible at any width:
//   - `< lg`  — compact glyph trigger in the page toolbar (inside <main>); no sidebar.
//   - `>= lg` — full-width trigger with the location NAME in the sidebar; the
//               toolbar copy is `lg:hidden`, i.e. display:none, so it is out of the
//               accessibility tree and Playwright's role queries do not match it.
//
// Playwright's default viewport is 1280×720, which is `>= lg`, so every test in
// this file that does not override the viewport drives the SIDEBAR switcher and
// asserts on the full location name — not the single letter it used to show.
// The two locators below make that choice explicit rather than relying on
// `.first()`, which would silently follow whichever copy is first in the DOM.

type Page = import('@playwright/test').Page

/** The desktop sidebar copy (`variant="full"` — shows the whole location name). */
const sidebarSwitcher = (page: Page) =>
  page
    .getByRole('navigation', { name: 'Sidebar navigation' })
    .getByRole('button', { name: /switch location/i })

/** The page-toolbar copy (`variant="compact"` — shows the first letter only). */
const toolbarSwitcher = (page: Page) =>
  page.getByRole('main').getByRole('button', { name: /switch location/i })

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
async function seedOfficeLocation(page: Page) {
  await page.goto('/settings/locations')
  // Scoped to <main>: /settings/locations is not a fullscreen page, so at a
  // desktop viewport the sidebar switcher shows the active location's name too.
  const list = page.getByRole('main')
  await expect(list.getByText('My Home')).toBeVisible()
  await page.getByRole('button', { name: 'Add location' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Office')
  await page.getByRole('dialog').getByRole('button', { name: /^add$/i }).click()
  await expect(list.getByText('Office')).toBeVisible()
}

test('sidebar switcher shows the active location name and lists locations', async ({
  page,
}) => {
  // Given a second location exists
  await seedOfficeLocation(page)

  // When the user opens the pantry page at the default (desktop) viewport
  await page.goto('/')
  // Sidebar trigger, variant="full". aria-label: locationSwitcher.triggerLabel
  // (src/components/shared/LocationSwitcher/LocationSwitcher.tsx)
  const trigger = sidebarSwitcher(page)

  // Then the trigger shows the default location's full name, not its initial
  await expect(trigger).toHaveText('My Home')

  // And opening it lists all locations
  await trigger.click()
  await expect(page.getByRole('menuitem', { name: 'My Home' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Office' })).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: /manage locations/i }),
  ).toBeVisible()
})

test('switching location persists across reload', async ({ page }) => {
  await seedOfficeLocation(page)
  await page.goto('/')

  // Desktop viewport → the sidebar copy is the reachable one
  const trigger = sidebarSwitcher(page)
  await expect(trigger).toHaveText('My Home')

  // When the user switches to "Office"
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Office' }).click()

  // Then the trigger label updates
  await expect(trigger).toHaveText('Office')

  // And the choice persists across a reload
  await page.reload()
  await expect(sidebarSwitcher(page)).toHaveText('Office')
})

test('"Manage" navigates to the locations settings page', async ({ page }) => {
  await page.goto('/')
  // Desktop viewport → the sidebar copy is the reachable one
  const trigger = sidebarSwitcher(page)
  await trigger.click()
  await page.getByRole('menuitem', { name: /manage locations/i }).click()

  // Then the locations settings page is shown (scoped to <main> — the sidebar
  // switcher shows the same name)
  await expect(page).toHaveURL(/\/settings\/locations$/)
  await expect(page.getByRole('main').getByText('My Home')).toBeVisible()
})

// Switch the active location via the sidebar switcher dropdown (desktop viewport).
async function switchTo(page: Page, name: string) {
  const trigger = sidebarSwitcher(page)
  await trigger.click()
  await page.getByRole('menuitem', { name }).click()
  await expect(trigger).toHaveText(name)
}

// Create a brand-new item in whatever location is active right now, through the
// pantry's Add combobox. The item ends up stocked ONLY in that location, which
// is what lets a test hold "stocked here" and "stocked elsewhere" side by side.
// Clicking "Create" navigates to the new item's detail page, so callers that
// need the pantry again must navigate back themselves.
async function createItemHere(page: Page, name: string) {
  // Add-item button: aria-label="Add item" (src/components/pantry/PantryListView.tsx)
  await page.getByRole('button', { name: 'Add item' }).click()
  const dialog = page.getByRole('dialog')
  // Combobox: role="combobox" aria-label via the Name label (NewItemDialog.tsx)
  await dialog.getByRole('combobox').fill(name)
  // No catalog match -> a "Create" button appears in the dialog footer.
  await Promise.all([
    page.waitForURL(/\/items\/(?!new)[^/]+$/, { timeout: 10000 }),
    dialog.getByRole('button', { name: /create/i }).click(),
  ])
}

test('switching the active location re-scopes the pantry to stocked items', async ({
  page,
}) => {
  // Given a second location "Office" and an item created in "My Home"
  await seedOfficeLocation(page)
  await page.goto('/')
  await createItemHere(page, 'Yogurt')

  // Go back to the pantry.
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Yogurt', level: 3 }),
  ).toBeVisible()

  // When the user switches to the empty "Office" location
  await switchTo(page, 'Office')

  // Then the pantry shows its empty state there — Yogurt is stocked only in
  // My Home.
  //
  // ASSERT THE EMPTY STATE FIRST, and only then that Yogurt is gone. The empty
  // state renders only after the location's stock query resolves with zero rows
  // (PantryListView returns <LoadingSpinner /> while `isLoading`), so it proves
  // the page settled. `toHaveCount(0)` on its own does not: it passes on the
  // first frame where the count is 0, which right after a location switch is the
  // loading frame, before the response arrives. That is why this test still
  // passed here when the server's `itemStocks` query was made to ignore its
  // `locationId` filter — it failed ~40 lines later instead, at the
  // `aria-disabled` click, pointing at the wrong code.
  // Empty-state title: t('pantry.empty.title') (src/components/pantry/PantryListView.tsx)
  await expect(page.getByText('Your pantry is empty')).toBeVisible()
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
  await switchTo(page, 'My Home')
  await expect(
    page.getByRole('heading', { name: 'Yogurt', level: 3 }),
  ).toBeVisible()
})

// TWO locations, and an item stocked in each — not one location.
//
// With a single location "stocked here" and "stocked anywhere" return the same
// answer, so the test passed against a server that ignored `locationId`
// entirely. It stayed green under exactly that mutation. The pair below is what
// a one-location fixture cannot produce: an implementation that disables
// nothing fails the first assertion, and one that disables everything fails the
// second.
test('an item already stocked in the active location is shown disabled in the Add combobox', async ({
  page,
}) => {
  // Given a second location "Office"
  await seedOfficeLocation(page)

  // And "Oats" created in the active (My Home) location
  await page.goto('/')
  await createItemHere(page, 'Oats')

  // And "Oat Milk" created while "Office" is active, so it is stocked THERE and
  // not in My Home
  await page.goto('/')
  await switchTo(page, 'Office')
  await createItemHere(page, 'Oat Milk')

  // Back in My Home, where Oats is stocked and Oat Milk is not
  await page.goto('/')
  await switchTo(page, 'My Home')
  await expect(
    page.getByRole('heading', { name: 'Oats', level: 3 }),
  ).toBeVisible()

  // When the user opens Add and searches for "Oat", which matches both
  await page.getByRole('button', { name: 'Add item' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox').fill('Oat')

  // Then the item stocked HERE is marked disabled
  // aria-disabled={stocked} on role="option" (NewItemDialog.tsx)
  await expect(
    dialog.getByRole('option', { name: /oats/i }),
  ).toHaveAttribute('aria-disabled', 'true')

  // And the item stocked only in Office stays selectable
  await expect(
    dialog.getByRole('option', { name: /oat milk/i }),
  ).toHaveAttribute('aria-disabled', 'false')
})

// ---------------------------------------------------------------------------
// Where the switcher lives, at each breakpoint.
//
// This pair is the assertion that actually pins the requirement: a test at a
// single width cannot tell "moved to the sidebar" apart from "no change", since
// an unscoped query would find *a* switcher either way. Each test asserts both
// halves — the copy that must be there, and the copy that must not.
// ---------------------------------------------------------------------------

const pagesWithASwitcher = [
  { name: 'pantry (flat list)', path: '/' },
  { name: 'pantry (shelf group-by)', path: '/?groupBy=shelf' },
  { name: 'shopping', path: '/shopping' },
  { name: 'cooking', path: '/cooking' },
]

test.describe('desktop (>= lg): the switcher lives in the sidebar', () => {
  for (const { name, path } of pagesWithASwitcher) {
    test(`user sees exactly one switcher — in the sidebar, not the ${name} toolbar`, async ({
      page,
    }) => {
      // Given the page at Playwright's default 1280×720 viewport (>= lg)
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      // Then the sidebar carries the switcher, labelled with the full name
      await expect(sidebarSwitcher(page)).toBeVisible()
      await expect(sidebarSwitcher(page)).toHaveText('My Home')

      // And the page toolbar has none — its copy is `lg:hidden` (display:none),
      // so it is out of the accessibility tree entirely
      await expect(toolbarSwitcher(page)).toHaveCount(0)
    })
  }
})

test.describe('mobile (< lg): the switcher stays in the page toolbar', () => {
  // 390×844 — iPhone 14 Pro, matching the `mobile viewport a11y` block
  test.use({ viewport: { width: 390, height: 844 } })

  for (const { name, path } of pagesWithASwitcher) {
    test(`user sees exactly one switcher — in the ${name} toolbar, and there is no sidebar`, async ({
      page,
    }) => {
      // Given the page at a mobile viewport
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      // Then the toolbar carries the compact switcher, labelled with the initial
      await expect(toolbarSwitcher(page)).toBeVisible()
      await expect(toolbarSwitcher(page)).toHaveText('M')

      // And there is no sidebar at all (`hidden lg:flex`)
      await expect(
        page.getByRole('navigation', { name: 'Sidebar navigation' }),
      ).toHaveCount(0)
    })
  }

  test('user can still switch the active location from the mobile toolbar', async ({
    page,
  }) => {
    // Given a second location exists
    await seedOfficeLocation(page)
    await page.goto('/')

    // When the user switches to "Office" from the toolbar switcher
    await toolbarSwitcher(page).click()
    await page.getByRole('menuitem', { name: 'Office' }).click()

    // Then the compact trigger shows the new initial
    await expect(toolbarSwitcher(page)).toHaveText('O')
  })
})
