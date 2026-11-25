import {
  type APIRequestContext,
  expect,
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
import { ItemPage } from '../pages/ItemPage'
import { PantryPage } from '../pages/PantryPage'

// Consumable items, PR 2 (docs/features/items/2026-11-25-item-consumable-design.md).
//
// RUNS IN BOTH PROJECTS. The fixture is plain data (helpers/fixture.ts), so
// local writes IndexedDB and cloud writes Postgres through GraphQL. In cloud
// this is the first real-SQL run of `consumable` through `updateItem`,
// `applyUnitSwitch` and the item reads.
//
// What the tests can tell apart:
// - the squares: Cups is seeded CONSUMABLE, so a card with squares after the
//   save proves the switch was saved and read back, not seeded.
// - the filter: Tissue (consumable) and Cups (not) share one vendor, so the
//   cart shows both until the filter hides one. Cups is checked PRESENT
//   before Tissue is checked absent, so an empty list in the middle of a
//   refetch cannot pass the absence check.

const COSTCO = 'cccccccc-0000-0000-0000-000000000001'
const CUPS = 'dddddddd-0000-0000-0000-000000000001'
const TISSUE = 'dddddddd-0000-0000-0000-000000000002'
const FLOUR = 'dddddddd-0000-0000-0000-000000000003'

const FIXTURE: Fixture = {
  locations: [{ key: 'HOME', name: 'My Home', isDefault: true }],
  vendors: [{ id: COSTCO, name: 'Costco' }],
  items: [
    // Seeded consumable on purpose: test 1 turns it off in the UI.
    { id: CUPS, name: 'Cups', vendorIds: [COSTCO] },
    { id: TISSUE, name: 'Tissue', vendorIds: [COSTCO] },
    // Tracked in grams, 500 g per pack: turning Consumable off must move it
    // to packs and convert the amounts.
    {
      id: FLOUR,
      name: 'Flour',
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: 500,
      consumeAmount: 100,
    },
  ],
  stocks: [
    {
      itemId: CUPS,
      location: 'HOME',
      packedQuantity: 3,
      unpackedQuantity: 0,
      targetQuantity: 5,
      refillThreshold: 1,
    },
    {
      itemId: TISSUE,
      location: 'HOME',
      packedQuantity: 2,
      unpackedQuantity: 0,
      targetQuantity: 4,
      refillThreshold: 1,
    },
    {
      itemId: FLOUR,
      location: 'HOME',
      packedQuantity: 2,
      unpackedQuantity: 250,
      targetQuantity: 2000,
      refillThreshold: 500,
    },
  ],
  shelves: [],
  recipes: [],
}

// The same fixture, with Cups already not consumable: for the filter and the
// axe scans, which do not test the switch.
const FIXTURE_CUPS_NOT_CONSUMABLE: Fixture = {
  ...FIXTURE,
  items: FIXTURE.items.map((item) =>
    item.id === CUPS ? { ...item, consumable: false } : item,
  ),
}

async function seedFixture(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  fixture: Fixture,
): Promise<void> {
  if (baseURL === CLOUD_WEB_URL) {
    await seedCloudFixture(request, fixture)
    return
  }
  await seedLocalFixture(page, fixture)
}

/** The count squares of one item card on the pantry. */
function squaresOf(page: Page, name: string) {
  // The heading is inside the card's link; the squares are in the same link.
  return page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name, level: 3 }) })
    .getByTestId('count-square')
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

test('user can make an item not consumable and see one square per piece', async ({
  page,
  request,
  baseURL,
}) => {
  // Given Cups, consumable, 3 of 5 in stock
  await seedFixture(page, request, baseURL, FIXTURE)
  const pantry = new PantryPage(page)
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Cups')).toBeVisible()
  // The control: a consumable card has no squares
  await expect(squaresOf(page, 'Cups')).toHaveCount(0)

  // When the user turns Consumable off on the Info tab and saves
  await page.goto(`/items/${CUPS}`)
  const consumable = page.getByRole('switch', { name: /^consumable$/i })
  await expect(consumable).toBeChecked()
  // The expiration setting shows before, so its absence after means
  // something
  const expiration = page.getByLabel('Calculate Expiration based on')
  await expect(expiration).toBeVisible()
  await consumable.click()
  // The expiration settings are hidden with it
  await expect(expiration).toHaveCount(0)
  await new ItemPage(page).saveExisting()

  // Then, after a new page load, the pantry card shows 5 squares, 3 filled
  await pantry.navigateTo()
  await expect(squaresOf(page, 'Cups')).toHaveCount(5)
  await expect(
    squaresOf(page, 'Cups').and(page.locator('[data-filled="true"]')),
  ).toHaveCount(3)
  // And the switch reads back off
  await page.goto(`/items/${CUPS}`)
  await expect(
    page.getByRole('switch', { name: /^consumable$/i }),
  ).not.toBeChecked()
})

test('user turning Consumable off on an item tracked in grams sees the converted amounts', async ({
  page,
  request,
  baseURL,
}) => {
  // Given Flour: 2 packs and 250 g open, target 2000 g, 500 g per pack
  await seedFixture(page, request, baseURL, FIXTURE)
  await page.goto(`/items/${FLOUR}`)
  const consumable = page.getByRole('switch', { name: /^consumable$/i })
  await expect(consumable).toBeChecked()

  // When the user turns Consumable off and saves
  await consumable.click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // Then the converted amounts dialog shows the location's new numbers:
  // 250 g -> 0.5 pack, 2000 g -> 4 packs, 500 g -> 1 pack
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/250\D+0\.5/)).toBeVisible()
  await expect(dialog.getByText(/2000\D+4/)).toBeVisible()

  // When the user confirms
  await dialog.getByRole('button', { name: /update & save/i }).click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()

  // Then the pantry card counts whole packs: 2.5 packs is 2 pieces of 4
  const pantry = new PantryPage(page)
  await pantry.navigateTo()
  await expect(squaresOf(page, 'Flour')).toHaveCount(4)
  await expect(
    squaresOf(page, 'Flour').and(page.locator('[data-filled="true"]')),
  ).toHaveCount(2)
  // Scoped to the Flour card: Tissue reads "2 / 4 pack" too
  await expect(
    page.getByRole('link', { name: /^Flour 2 \/ 4 pack/ }),
  ).toBeVisible()
})

test('user can filter the shopping cart to items that are not consumable', async ({
  page,
  request,
  baseURL,
}) => {
  // Given Tissue (consumable) and Cups (not), both sold at Costco
  await seedFixture(page, request, baseURL, FIXTURE_CUPS_NOT_CONSUMABLE)
  await page.goto(`/shopping/${COSTCO}`)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Tissue' })).toBeVisible()
  await expect(main.getByRole('heading', { name: 'Cups' })).toBeVisible()

  // When the user picks Not consumable in the filters
  await page.getByRole('button', { name: 'Toggle filters' }).click()
  await page.getByRole('button', { name: 'Consumable' }).click()
  await page.getByRole('menuitemradio', { name: /Not consumable/ }).click()

  // Then only Cups is listed. Present first, so the absence below is not
  // satisfied by an empty list.
  await expect(main.getByRole('heading', { name: 'Cups' })).toBeVisible()
  await expect(main.getByRole('heading', { name: 'Tissue' })).toHaveCount(0)
  await expect(page).toHaveURL(/f_consumable=no/)

  // And the choice is remembered in the URL: a reload keeps it
  await page.reload()
  await expect(main.getByRole('heading', { name: 'Cups' })).toBeVisible()
  await expect(main.getByRole('heading', { name: 'Tissue' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Not consumable' }),
  ).toBeVisible()
})

test('user sees one square per piece in the quick edit dialog and on the Stock tab', async ({
  page,
  request,
  baseURL,
}) => {
  // Given Cups, not consumable, 3 of 5 in stock
  await seedFixture(page, request, baseURL, FIXTURE_CUPS_NOT_CONSUMABLE)
  const pantry = new PantryPage(page)
  await pantry.navigateTo()
  await expect(squaresOf(page, 'Cups')).toHaveCount(5)

  // When the user opens the quick edit dialog for Cups
  await pantry.clickQuickUpdate('Cups')
  const dialog = pantry.getQuickUpdateDialog()
  await expect(dialog).toBeVisible()

  // Then its stock row shows 5 squares, 3 filled
  const dialogSquares = dialog.getByTestId('count-square')
  await expect(dialogSquares).toHaveCount(5)
  await expect(
    dialogSquares.and(page.locator('[data-filled="true"]')),
  ).toHaveCount(3)
  // And the squares follow the stepper before Update is pressed
  await dialog.getByRole('button', { name: /increase packed/i }).click()
  await expect(
    dialogSquares.and(page.locator('[data-filled="true"]')),
  ).toHaveCount(4)
  await page.keyboard.press('Escape')

  // When the user opens the Stock tab of Cups
  await page.goto(`/items/${CUPS}/stock`)

  // Then the stock row there shows the same squares
  const main = page.getByRole('main')
  await expect(main.getByTestId('count-square')).toHaveCount(5)
  await expect(
    main.getByTestId('count-square').and(page.locator('[data-filled="true"]')),
  ).toHaveCount(3)

  // The control: Tissue, which is consumable, has no squares on its Stock tab
  await page.goto(`/items/${TISSUE}/stock`)
  await expect(main.getByLabel(/^packed/i)).toBeVisible()
  await expect(main.getByTestId('count-square')).toHaveCount(0)
})

async function scanConsumableUi(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
) {
  await seedFixture(page, request, baseURL, FIXTURE_CUPS_NOT_CONSUMABLE)

  // The pantry with a count bar, then the open Consumable menu alone (a
  // whole-page scan with a menu open is not what this checks)
  const pantry = new PantryPage(page)
  await pantry.navigateTo()
  await expect(squaresOf(page, 'Cups')).toHaveCount(5)
  await page.getByRole('button', { name: 'Toggle filters' }).click()
  await expect(page.getByRole('button', { name: 'Consumable' })).toBeVisible()
  await injectAxe(page)
  await checkA11y(page, undefined, AXE_OPTIONS)
  await page.getByRole('button', { name: 'Consumable' }).click()
  await expect(page.getByRole('menuitemradio')).toHaveCount(3)
  await checkA11y(page, '[role="menu"]', AXE_OPTIONS)
  await page.keyboard.press('Escape')

  // The Info tab with the switch off
  await page.goto(`/items/${CUPS}`)
  await expect(
    page.getByRole('switch', { name: /^consumable$/i }),
  ).not.toBeChecked()
  await injectAxe(page)
  await checkA11y(page, undefined, AXE_OPTIONS)

  // The converted amounts dialog
  await page.goto(`/items/${FLOUR}`)
  await page.getByRole('switch', { name: /^consumable$/i }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await injectAxe(page)
  await checkDialogA11y(page, '[role="alertdialog"]')
}

test('user can use the consumable controls without accessibility violations', async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(60000)
  await scanConsumableUi(page, request, baseURL)
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('theme-preference', 'dark')
    })
  })

  test('user can use the consumable controls in dark mode without accessibility violations', async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(60000)
    await scanConsumableUi(page, request, baseURL)
  })
})
