import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test'
import { checkA11y, injectAxe } from 'axe-playwright'
import { CLOUD_WEB_URL } from '../constants'
import { AXE_OPTIONS, checkDialogA11y } from '../helpers/axe'
import { seedCloudFixture } from '../helpers/cloudSeed'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import type { Fixture } from '../helpers/fixture'
import { seedLocalFixture } from '../helpers/localSeed'
import { readStockAt } from '../helpers/stockReadback'
import { ItemPage } from '../pages/ItemPage'
import { PantryPage } from '../pages/PantryPage'
import { StockPagerPage } from '../pages/StockPagerPage'

// The "Active here" switch, PR 2 (docs/features/items/
// 2026-11-26-item-stock-active-design.md, Tests and E2E > PR 2).
//
// RUNS IN BOTH PROJECTS. The fixture is plain data (helpers/fixture.ts), so
// local writes IndexedDB and cloud writes Postgres through GraphQL. In cloud
// this is the first real-SQL run of `ItemStock.isActive` through
// `upsertItemStock` and `itemStocksForItem`.
//
// NOT IN THE NEON LIST (e2e/neonSpecs.ts). That list holds the files where
// the Neon pooler, the 52 ms per query or a lock race can change the result.
// This spec makes one `upsertItemStock` at a time and waits for each, so it
// has none of the three. It runs on Neon in the checkpoint gate.
//
// What the tests can tell apart:
// - Rice has a TARGET (5) while it is off. Under the old rule (target 0 =
//   inactive) Rice would stay in the active section, so the inactive section
//   proves the switch is read, not the target.
// - Salt is active with target 0 (owner answer 1, "active, no target"). Under
//   the old rule Salt would be in the inactive section. Its row sets
//   `isActive: true` on purpose: a local seed with no key reads target 0 as
//   inactive (`isStockActive`'s fallback).
// - The Stock tab test stocks Rice at TWO locations and turns it off at one.
//   Code that wrote or read the switch for the whole item would turn both off.

const HOME = 'HOME'
const OFFICE = 'OFFICE'
const RICE = 'aaaaaaaa-5ac7-0000-0000-000000000001'
const BEANS = 'aaaaaaaa-5ac7-0000-0000-000000000002'
const SALT = 'aaaaaaaa-5ac7-0000-0000-000000000003'

const FIXTURE: Fixture = {
  locations: [
    // Keep the default location first (e2e/CLAUDE.md, "Location order is
    // assigned differently in the two modes").
    { key: HOME, name: 'My Home', isDefault: true },
    { key: OFFICE, name: 'Office' },
  ],
  vendors: [],
  items: [
    { id: RICE, name: 'Rice' },
    { id: BEANS, name: 'Beans' },
    { id: SALT, name: 'Salt' },
  ],
  stocks: [
    {
      itemId: RICE,
      location: HOME,
      packedQuantity: 3,
      targetQuantity: 5,
      refillThreshold: 1,
      isActive: true,
    },
    {
      itemId: RICE,
      location: OFFICE,
      packedQuantity: 2,
      targetQuantity: 5,
      refillThreshold: 1,
      isActive: true,
    },
    {
      itemId: BEANS,
      location: HOME,
      packedQuantity: 2,
      targetQuantity: 4,
      refillThreshold: 1,
      isActive: true,
    },
    {
      itemId: SALT,
      location: HOME,
      packedQuantity: 2,
      targetQuantity: 0,
      refillThreshold: 0,
      isActive: true,
    },
  ],
  shelves: [],
  recipes: [],
}

/** The same fixture, with Rice already off at Home: for the axe scans. */
const FIXTURE_RICE_OFF: Fixture = {
  ...FIXTURE,
  stocks: FIXTURE.stocks.map((stock) =>
    stock.itemId === RICE && stock.location === HOME
      ? { ...stock, isActive: false }
      : stock,
  ),
}

async function seedFixture(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  fixture: Fixture,
): Promise<Record<string, string>> {
  if (baseURL === CLOUD_WEB_URL) {
    return seedCloudFixture(request, fixture)
  }
  return seedLocalFixture(page, fixture)
}

/** `isActive` and the target of one stock row, read from the backend. */
async function activeAndTarget(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  itemId: string,
  locationId: string,
) {
  const row = await readStockAt(page, request, baseURL, itemId, locationId)
  if (!row) return undefined
  return { isActive: row.isActive, targetQuantity: row.targetQuantity }
}

/** The item card on the pantry whose heading names `name`. */
function cardOf(page: Page, name: string) {
  return page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name, level: 3 }) })
}

function switchIn(scope: Locator) {
  // `items.form.isActive.label`. The dialog's switch is
  // id="quickUpdateIsActive" (QuickUpdateDialog.tsx), the Stock tab's
  // id="isActive" (ItemForm.tsx); both have a <Label htmlFor>.
  return scope.getByRole('switch', { name: 'Active here' })
}

test.beforeEach(async ({ page, request, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  if (baseURL === CLOUD_WEB_URL) {
    // The only cleanup of each test (E2E speed plan, decision D7).
    await cleanupCloudData(request)
  }
})

test.afterEach(async ({ page, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) return
  await page.goto('/')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(
      dbs.map(
        ({ name }) =>
          new Promise<void>((resolve, reject) => {
            if (!name) {
              resolve()
              return
            }
            const req = indexedDB.deleteDatabase(name)
            req.onsuccess = () => resolve()
            req.onerror = () => reject(req.error)
            req.onblocked = () => resolve()
          }),
      ),
    )
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('user can turn an item off in the quick edit dialog and see it in the inactive section with its target', async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(60000)
  // Given Rice (3 of 5), Beans (2 of 4) and Salt (2, no target), all active
  // at My Home
  const locationIds = await seedFixture(page, request, baseURL, FIXTURE)
  const home = locationIds[HOME] as string
  const pantry = new PantryPage(page)
  await pantry.navigateTo()
  const names = page.getByRole('heading', { level: 3 })
  await expect(names).toHaveCount(3)
  // An inactive card's heading starts with a hidden "Inactive "
  // (ItemStockSummary.tsx), so the exact names say all three are active.
  await expect(
    page.getByRole('heading', { name: 'Rice', exact: true, level: 3 }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Salt', exact: true, level: 3 }),
  ).toBeVisible()
  await expect(cardOf(page, 'Salt')).toContainText('2 / 0 pack')
  await expect(page.getByText(/\d+ inactive items?/)).toHaveCount(0)

  // When the user turns "Active here" off for Rice in the quick edit dialog
  await pantry.clickQuickUpdate('Rice')
  const dialog = pantry.getQuickUpdateDialog()
  await expect(switchIn(dialog)).toBeChecked()
  await switchIn(dialog).click()
  await expect(switchIn(dialog)).not.toBeChecked()
  // And the target stays editable with its value
  await expect(pantry.getQuickUpdateTargetInput()).toHaveValue('5')
  await expect(pantry.getQuickUpdateTargetInput()).toBeEnabled()
  await pantry.submitQuickUpdate()
  await expect(dialog).toHaveCount(0)

  // Then Rice is the one card in the inactive section, last on the page,
  // and it still shows its target
  await expect(page.getByText('1 inactive item', { exact: true })).toBeVisible()
  await expect(names.last()).toHaveText('Inactive Rice')
  await expect(cardOf(page, 'Rice')).toContainText('3 / 5 pack')
  // And Salt, active with no target, stays in the active section
  await expect(
    page.getByRole('heading', { name: 'Salt', exact: true, level: 3 }),
  ).toBeVisible()

  // And the stored row is off, with its target kept
  await expect
    .poll(() => activeAndTarget(page, request, baseURL, RICE, home))
    .toEqual({ isActive: false, targetQuantity: 5 })

  // When the user turns it on again
  await pantry.clickQuickUpdate('Rice')
  await expect(switchIn(dialog)).not.toBeChecked()
  await switchIn(dialog).click()
  await pantry.submitQuickUpdate()
  await expect(dialog).toHaveCount(0)

  // Then Rice is back in the active section with target 5. The present
  // check comes first, so an empty list in the middle of a refetch cannot
  // pass the absence check after it.
  await expect(
    page.getByRole('heading', { name: 'Rice', exact: true, level: 3 }),
  ).toBeVisible()
  await expect(cardOf(page, 'Rice')).toContainText('3 / 5 pack')
  await expect(page.getByText(/\d+ inactive items?/)).toHaveCount(0)
  await expect
    .poll(() => activeAndTarget(page, request, baseURL, RICE, home))
    .toEqual({ isActive: true, targetQuantity: 5 })
})

test('user can turn an item off on the Stock tab of one location while another location stays active', async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(60000)
  // Given Rice, active with target 5 at My Home and at Office
  const locationIds = await seedFixture(page, request, baseURL, FIXTURE)
  const home = locationIds[HOME] as string
  const office = locationIds[OFFICE] as string
  const stockTab = new StockPagerPage(page)
  const itemPage = new ItemPage(page)
  const main = page.getByRole('main')

  // When the user opens Rice's Stock tab, pages to Office and turns
  // "Active here" off
  await stockTab.navigateTo(RICE)
  await expect(stockTab.getStockForm()).toBeVisible()
  await stockTab.goToNext()
  await expect(stockTab.getViewedLocationCaption()).toContainText('Office')
  await expect(switchIn(main)).toBeChecked()
  await switchIn(main).click()
  await expect(switchIn(main)).not.toBeChecked()
  await itemPage.saveExisting()

  // Then Office's row is off with its target kept, and My Home's is still on
  await expect
    .poll(() => activeAndTarget(page, request, baseURL, RICE, office))
    .toEqual({ isActive: false, targetQuantity: 5 })
  expect(await activeAndTarget(page, request, baseURL, RICE, home)).toEqual({
    isActive: true,
    targetQuantity: 5,
  })

  // And the pantry at My Home shows Rice active
  const pantry = new PantryPage(page)
  await pantry.navigateTo()
  await expect(
    page.getByRole('heading', { name: 'Rice', exact: true, level: 3 }),
  ).toBeVisible()
  await expect(page.getByText(/\d+ inactive items?/)).toHaveCount(0)

  // And after a new page load Office's Stock tab shows the switch off and
  // the target 5
  await stockTab.navigateTo(RICE)
  await expect(stockTab.getStockForm()).toBeVisible()
  await stockTab.goToNext()
  await expect(stockTab.getViewedLocationCaption()).toContainText('Office')
  await expect(switchIn(main)).not.toBeChecked()
  await expect(main.locator('#targetQuantity')).toHaveValue('5')

  // When the user turns it on again
  await switchIn(main).click()
  await itemPage.saveExisting()

  // Then Office's row is on again with target 5
  await expect
    .poll(() => activeAndTarget(page, request, baseURL, RICE, office))
    .toEqual({ isActive: true, targetQuantity: 5 })
})

async function scanActiveSwitch(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
) {
  // Rice is off at My Home, so the scans see the switch off, the grey bar
  // and the inactive section
  await seedFixture(page, request, baseURL, FIXTURE_RICE_OFF)

  // The pantry with the inactive section, then the quick edit dialog alone
  const pantry = new PantryPage(page)
  await pantry.navigateTo()
  await expect(page.getByText('1 inactive item', { exact: true })).toBeVisible()
  await injectAxe(page)
  await checkA11y(page, undefined, AXE_OPTIONS)
  await pantry.clickQuickUpdate('Rice')
  const dialog = pantry.getQuickUpdateDialog()
  await expect(switchIn(dialog)).not.toBeChecked()
  await checkDialogA11y(page, '[role="dialog"]')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // The Stock tab with the switch off
  const stockTab = new StockPagerPage(page)
  await stockTab.navigateTo(RICE)
  await expect(stockTab.getStockForm()).toBeVisible()
  await expect(switchIn(page.getByRole('main'))).not.toBeChecked()
  await injectAxe(page)
  await checkA11y(page, undefined, AXE_OPTIONS)
}

test('user can use the Active here switch without accessibility violations', async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(60000)
  await scanActiveSwitch(page, request, baseURL)
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('theme-preference', 'dark')
    })
  })

  test('user can use the Active here switch in dark mode without accessibility violations', async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(60000)
    await scanActiveSwitch(page, request, baseURL)
  })
})
