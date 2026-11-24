import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { injectAxe } from 'axe-playwright'
import { CLOUD_WEB_URL } from '../constants'
import { checkDialogA11y } from '../helpers/axe'
import { seedCloudFixture } from '../helpers/cloudSeed'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import type { Fixture } from '../helpers/fixture'
import { seedLocalFixture } from '../helpers/localSeed'
import { readStockAt } from '../helpers/stockReadback'
import { StockPagerPage } from '../pages/StockPagerPage'

// Save in the "Unsaved changes" dialog (design
// docs/global/ui-polish/2026-11-25-unsaved-dialog-save-design.md).
//
// The dialog has Cancel · Discard · Save. Save runs the page's own save and
// then goes where the user pressed. One test per kind of page: the item Info
// tab, the item Stock location pager, and one settings detail page (vendor).
// Each test RELOADS (or reads the backend) before it checks the value, so it
// proves the save reached storage, not only the screen.
//
// Runs in `local` and `cloud`. The axe scans are here, not in `a11y.spec.ts`,
// because that file does not run in `cloud`.

const HOME = 'HOME'
const OFFICE = 'OFFICE'
const ITEM = 'item-milk'
const VENDOR = 'vendor-costco'

const FIXTURE: Fixture = {
  // Keep the default location first (see `item-stock-pager.spec.ts`).
  locations: [
    { key: HOME, name: 'My Home', isDefault: true },
    { key: OFFICE, name: 'Office' },
  ],
  vendors: [{ id: VENDOR, name: 'Costco' }],
  items: [{ id: ITEM, name: 'Milk' }],
  stocks: [
    {
      itemId: ITEM,
      location: HOME,
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
    },
    {
      itemId: ITEM,
      location: OFFICE,
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
    },
  ],
  shelves: [],
  recipes: [],
}

async function seed(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<Record<string, string>> {
  if (baseURL === CLOUD_WEB_URL) return seedCloudFixture(request, FIXTURE)
  return seedLocalFixture(page, FIXTURE)
}

function unsavedDialog(page: Page) {
  return page.getByRole('alertdialog', { name: 'Unsaved changes' })
}

test.beforeEach(async ({ page, request, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  // The only cloud cleanup of each test (E2E speed plan, decision D7)
  if (baseURL === CLOUD_WEB_URL) await cleanupCloudData(request)
})

test.afterEach(async ({ page, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) return
  // Local mode: clear IndexedDB, localStorage and sessionStorage
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
          req.onblocked = () => resolve()
        })
      }),
    )
    localStorage.clear()
    sessionStorage.clear()
  })
})

test.describe('items and settings — Save in the unsaved-changes dialog', () => {
  test('user can save the item Info tab from the unsaved-changes dialog', async ({
    page,
    request,
    baseURL,
  }) => {
    // Given an item, renamed on the Info tab and not saved
    await seed(page, request, baseURL)
    await page.goto(`/items/${ITEM}`)
    const name = page.getByRole('textbox', { name: /^name/i })
    await expect(name).toHaveValue('Milk')
    await name.fill('Oat milk')

    // When the user opens the Stock tab and presses Save in the dialog
    await page.getByRole('link', { name: /^stock$/i }).click()
    await unsavedDialog(page).getByRole('button', { name: 'Save' }).click()

    // Then the page goes to the Stock tab
    await expect(page).toHaveURL(new RegExp(`/items/${ITEM}/stock$`))
    await expect(unsavedDialog(page)).toHaveCount(0)

    // And after a reload the Info tab shows the saved name
    await page.goto(`/items/${ITEM}`)
    await page.reload()
    await expect(page.getByRole('textbox', { name: /^name/i })).toHaveValue(
      'Oat milk',
    )
  })

  test('user can save a location page from the unsaved-changes dialog before paging', async ({
    page,
    request,
    baseURL,
  }) => {
    // Given Milk stocked at My Home (1 packed) and at Office (2 packed)
    const locationIds = await seed(page, request, baseURL)
    const stockTab = new StockPagerPage(page)
    await stockTab.navigateTo(ITEM)
    await expect(stockTab.getStockForm()).toBeVisible()

    // When the user changes My Home's packed amount to 5
    const packed = page.getByLabel(/^packed/i)
    await expect(packed).toHaveValue('1')
    await packed.fill('5')

    // And pages to Office and presses Save in the dialog
    await stockTab.goToNext()
    await unsavedDialog(page).getByRole('button', { name: 'Save' }).click()

    // Then the Office page shows, with its own amount
    await expect(stockTab.getViewedLocationCaption()).toContainText('Office')
    await expect(page.getByLabel(/^packed/i)).toHaveValue('2')

    // And My Home's row holds the saved amount in storage
    const homeId = locationIds[HOME]
    if (!homeId) throw new Error('no home location id')
    await expect
      .poll(
        async () =>
          (await readStockAt(page, request, baseURL, ITEM, homeId))
            ?.packedQuantity,
      )
      .toBe(5)
  })

  test('user can save a vendor from the unsaved-changes dialog and open the tab they pressed', async ({
    page,
    request,
    baseURL,
  }) => {
    // Given a vendor, renamed on its Info tab and not saved
    await seed(page, request, baseURL)
    await page.goto(`/settings/household/vendors/${VENDOR}`)
    const name = page.getByLabel('Name')
    await expect(name).toHaveValue('Costco')
    await name.fill('Costco Wholesale')

    // When the user opens the Items tab and presses Save in the dialog
    await page.getByRole('link', { name: 'Vendor items tab' }).click()
    await unsavedDialog(page).getByRole('button', { name: 'Save' }).click()

    // Then the page goes to the Items tab (not back to the vendor list)
    await expect(page).toHaveURL(
      new RegExp(`/settings/household/vendors/${VENDOR}/items$`),
    )

    // And after a reload the Info tab shows the saved name
    await page.goto(`/settings/household/vendors/${VENDOR}`)
    await page.reload()
    await expect(page.getByLabel('Name')).toHaveValue('Costco Wholesale')
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`user sees an accessible unsaved-changes dialog in ${theme} mode`, async ({
      page,
      request,
      baseURL,
    }) => {
      if (theme === 'dark') {
        await page.addInitScript(() => {
          localStorage.setItem('theme-preference', 'dark')
        })
      }
      await seed(page, request, baseURL)
      await page.goto(`/settings/household/vendors/${VENDOR}`)
      const name = page.getByLabel('Name')
      await expect(name).toHaveValue('Costco')
      await name.fill('Costco Wholesale')
      await page.getByRole('link', { name: 'Vendor items tab' }).click()
      await expect(
        unsavedDialog(page).getByRole('button', { name: 'Save' }),
      ).toBeEnabled()

      await injectAxe(page)
      await checkDialogA11y(page, '[role="alertdialog"]')
    })
  }
})
