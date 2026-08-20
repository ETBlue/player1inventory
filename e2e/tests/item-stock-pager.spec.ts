import { expect, type Page, test } from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'
import { readRows, seedRows } from '../helpers/locationSeed'
import { StockPagerPage } from '../pages/StockPagerPage'

// The item-detail Stock tab (`/items/$id/stock`) is an all-locations pager
// (Location feature, PR E): one page per location, opening on the ACTIVE one,
// with "Add to location" on a not-stocked page and "Remove from location" on a
// stocked one. Locations are local-first — there is no cloud Location or
// ItemStock backend — so every flow here is local-only.

const HOME = 'local' // DEFAULT_LOCATION_ID, seeded as "My Home"
const OFFICE = 'office-loc'
const ITEM = 'item-milk'

test.beforeEach(async ({ page }) => {
  // Prevent the empty-data redirect to /onboarding so tests can navigate freely.
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

function stock(
  id: string,
  locationId: string,
  packedQuantity = 0,
): Record<string, unknown> {
  const now = new Date()
  return {
    id,
    itemId: ITEM,
    locationId,
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: now,
    updatedAt: now,
  }
}

// Seed one item and the requested locations. `stockedIn` decides which of them
// get an ItemStock row — an item is "stocked at" a location iff that row exists.
async function seedFixture(
  page: Page,
  {
    locations,
    stockedIn,
  }: {
    locations: Array<{ id: string; name: string }>
    stockedIn: string[]
  },
) {
  // Dexie must have created the schema before we open the database by name.
  await page.goto('/')
  const now = new Date()

  await seedRows(
    page,
    'locations',
    locations.map((l, order) => ({
      id: l.id,
      name: l.name,
      order,
      createdAt: now,
      updatedAt: now,
    })),
  )
  await seedRows(page, 'items', [
    {
      id: ITEM,
      name: 'Milk',
      tagIds: [],
      vendorIds: [],
      createdAt: now,
      updatedAt: now,
    },
  ])
  await seedRows(
    page,
    'itemStocks',
    stockedIn.map((locationId, i) => stock(`stock-${i}`, locationId, i + 1)),
  )
}

// The describe title must contain "items". The project's documented E2E gate grep is
// `--grep "items|shopping|cooking|settings|a11y"`, and Playwright matches it against
// the joined title path — project, FILE PATH, describes, test title. Every other file
// the gate selects matches through its filename (`a11y.spec.ts`, `shopping.spec.ts`,
// `cooking.spec.ts`, `settings/*`); `item-stock-pager.spec.ts` does not, because
// "item-stock-pager" has no "items" in it. Without "items" here, `--grep "items"`
// selects ZERO of the specs below and the whole file silently never runs under the
// convention — it only passes when invoked directly. Verified: `--grep "items"` now
// selects all 5.
test.describe('items stock tab — location pager', () => {
  test('user can add an item to a location from the not-stocked page', async ({
    page,
    baseURL,
  }) => {
    test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

    // Given Milk is stocked only in My Home, and a second location exists
    await seedFixture(page, {
      locations: [
        { id: HOME, name: 'My Home' },
        { id: OFFICE, name: 'Office' },
      ],
      stockedIn: [HOME],
    })

    const stockTab = new StockPagerPage(page)
    await stockTab.navigateTo(ITEM)

    // Then it opens on the active location (My Home) with its stock form
    await expect(stockTab.getStockForm()).toBeVisible()

    // When the user pages to Office
    await stockTab.goToNext()

    // Then that page is the not-stocked empty state with an Add CTA
    await expect(stockTab.getNotStockedEmptyState()).toBeVisible()
    await expect(stockTab.getStockForm()).toHaveCount(0)

    // When the user adds the item to this location
    await stockTab.addToLocation()

    // Then the page becomes the stock form for Office, with no navigation
    await expect(stockTab.getStockForm()).toBeVisible()
    await expect(stockTab.getNotStockedEmptyState()).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/items/${ITEM}/stock$`))

    // And a stock row now exists for (Milk × Office) — copy-on-add inherits the
    // source location's goals but starts the quantities at zero
    const stocks = await readRows(page, 'itemStocks')
    const office = stocks.find((s) => s.locationId === OFFICE)
    expect(office).toBeDefined()
    expect(office?.targetQuantity).toBe(4)
    expect(office?.packedQuantity).toBe(0)
  })

  test('user can remove an item from a location and lose only that location’s logs and cart entries', async ({
    page,
    baseURL,
  }) => {
    test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

    // Given Milk is stocked in both locations, with one log and one cart entry
    // in each
    await seedFixture(page, {
      locations: [
        { id: HOME, name: 'My Home' },
        { id: OFFICE, name: 'Office' },
      ],
      stockedIn: [HOME, OFFICE],
    })
    const now = new Date()
    await seedRows(page, 'inventoryLogs', [
      {
        id: 'log-home',
        itemId: ITEM,
        locationId: HOME,
        delta: 1,
        quantity: 1,
        note: 'Home purchase',
        occurredAt: now,
        createdAt: now,
      },
      {
        id: 'log-office',
        itemId: ITEM,
        locationId: OFFICE,
        delta: 2,
        quantity: 2,
        note: 'Office purchase',
        occurredAt: now,
        createdAt: now,
      },
    ])
    await seedRows(page, 'shoppingCarts', [
      { id: `${HOME}:no-vendor` },
      { id: `${OFFICE}:no-vendor` },
    ])
    await seedRows(page, 'cartItems', [
      { id: 'ci-home', cartId: `${HOME}:no-vendor`, itemId: ITEM, quantity: 1 },
      {
        id: 'ci-office',
        cartId: `${OFFICE}:no-vendor`,
        itemId: ITEM,
        quantity: 3,
      },
    ])

    const stockTab = new StockPagerPage(page)
    await stockTab.navigateTo(ITEM)

    // When the user opens the remove confirmation on the My Home page
    await stockTab.openRemoveDialog()

    // Then it names the item and the location, and reports what else goes —
    // scoped to this location, so exactly one log and one cart entry
    await expect(
      stockTab.getRemoveDialog().getByText('Remove Milk from My Home?'),
    ).toBeVisible()
    await expect(stockTab.getAffectedCounts()).toHaveText(
      'Inventory logs: 1 · Cart entries: 1',
    )

    // When the user confirms
    await stockTab.confirmRemove()

    // Then this page becomes the not-stocked state
    await expect(stockTab.getNotStockedEmptyState()).toBeVisible()

    // And the My Home log is gone while the Office one survives — the Log tab
    // reads the ACTIVE location, which is still My Home
    await page.goto(`/items/${ITEM}/log`)
    await expect(page.getByText('No history yet.')).toBeVisible()

    // And at the data layer, only this location's rows were destroyed
    const stocks = await readRows(page, 'itemStocks')
    expect(stocks.map((s) => s.locationId)).toEqual([OFFICE])

    const logs = await readRows(page, 'inventoryLogs')
    expect(logs.map((l) => l.id)).toEqual(['log-office'])

    const cartItems = await readRows(page, 'cartItems')
    expect(cartItems.map((c) => c.id)).toEqual(['ci-office'])

    // And the carts themselves survive — they are shared by every item in the
    // location, so removing one item must not delete them
    const carts = await readRows(page, 'shoppingCarts')
    expect(carts.map((c) => c.id)).toEqual(
      expect.arrayContaining([`${HOME}:no-vendor`, `${OFFICE}:no-vendor`]),
    )
  })

  test('user can page between locations with the dots and the chevrons', async ({
    page,
    baseURL,
  }) => {
    test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

    // Given three locations, with Milk stocked only in the first
    await seedFixture(page, {
      locations: [
        { id: HOME, name: 'My Home' },
        { id: OFFICE, name: 'Office' },
        { id: 'storage-loc', name: 'Storage' },
      ],
      stockedIn: [HOME],
    })

    const stockTab = new StockPagerPage(page)
    await stockTab.navigateTo(ITEM)

    // Then the pager opens on the active location, which is also page 1 —
    // so the left chevron is disabled and the right one is not
    await expect(stockTab.getViewedLocationCaption()).toHaveText(
      'Viewing stock for My Home',
    )
    await expect(stockTab.getPreviousButton()).toBeDisabled()
    await expect(stockTab.getNextButton()).toBeEnabled()

    // And the active location is named on its own dot's accessible name — the
    // dots draw only page position, so this is where the fact lives for AT
    await expect(stockTab.getActiveDot()).toHaveAccessibleName(
      'My Home (active location)',
    )

    // When the user pages right twice with the chevron
    await stockTab.goToNext()
    await expect(stockTab.getViewedLocationCaption()).toHaveText(
      'Viewing stock for Office',
    )
    await stockTab.goToNext()

    // Then the last page is reached and the right chevron disables — movement
    // clamps at the ends rather than wrapping
    await expect(stockTab.getViewedLocationCaption()).toHaveText(
      'Viewing stock for Storage',
    )
    await expect(stockTab.getNextButton()).toBeDisabled()
    await expect(stockTab.getPreviousButton()).toBeEnabled()

    // And the active location is still marked while viewing another page,
    // named in words as well as on the dot
    await expect(stockTab.getActiveHint()).toHaveText('Active: My Home')
    await expect(stockTab.getActiveDot()).toHaveAccessibleName(
      'My Home (active location)',
    )

    // When the user jumps straight back with a dot
    await stockTab.goToLocation('My Home')

    // Then that page is shown, with its stock form and its dot selected
    await expect(stockTab.getViewedLocationCaption()).toHaveText(
      'Viewing stock for My Home',
    )
    await expect(stockTab.getStockForm()).toBeVisible()
    await expect(stockTab.getDot('My Home')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  test('user can re-add an item removed from its last location', async ({
    page,
    baseURL,
  }) => {
    test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

    // Given Milk is stocked in My Home only, and it shows in the pantry
    await seedFixture(page, {
      locations: [
        { id: HOME, name: 'My Home' },
        { id: OFFICE, name: 'Office' },
      ],
      stockedIn: [HOME],
    })
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'Milk', level: 3 }),
    ).toBeVisible()

    // When the user removes it from that last location
    const stockTab = new StockPagerPage(page)
    await stockTab.navigateTo(ITEM)
    await stockTab.openRemoveDialog()
    await stockTab.confirmRemove()

    // Then the pantry hides it — it has no stock anywhere
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'Milk', level: 3 }),
    ).toHaveCount(0)

    // But the global item survives, so the Add combobox still finds it
    await page.getByRole('button', { name: 'Add item' }).click()
    const dialog = page.getByRole('dialog')
    // Combobox labelled "Name" (src/components/item/NewItemDialog/NewItemDialog.tsx)
    await dialog.getByRole('combobox').fill('Mil')
    const option = dialog.getByRole('option', { name: /milk/i })
    await expect(option).toBeVisible()
    // Selectable, not the disabled "already here" state
    await expect(option).not.toHaveAttribute('aria-disabled', 'true')

    // When the user re-adds it
    await option.click()

    // Then it is back in the pantry
    await expect(
      page.getByRole('heading', { name: 'Milk', level: 3 }),
    ).toBeVisible()
  })

  test('user with a single location sees no pager chrome', async ({
    page,
    baseURL,
  }) => {
    test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

    // Given only the default location exists
    await seedFixture(page, {
      locations: [{ id: HOME, name: 'My Home' }],
      stockedIn: [HOME],
    })

    const stockTab = new StockPagerPage(page)
    await stockTab.navigateTo(ITEM)

    // Then the stock form renders with no dots and no chevrons at all
    await expect(stockTab.getStockForm()).toBeVisible()
    await expect(stockTab.getTablist()).toHaveCount(0)
    await expect(stockTab.getPreviousButton()).toHaveCount(0)
    await expect(stockTab.getNextButton()).toHaveCount(0)

    // And removal is still offered — a single location is still a location
    await expect(stockTab.getRemoveFromLocationButton()).toBeVisible()
  })
})
