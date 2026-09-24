import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'
import { seedCloudFixture } from '../helpers/cloudSeed'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import type { Fixture, FixtureLocation } from '../helpers/fixture'
import { seedLocalFixture } from '../helpers/localSeed'
import { readRows, seedRows } from '../helpers/locationSeed'
import { readStockAt } from '../helpers/stockReadback'
import { StockPagerPage } from '../pages/StockPagerPage'

// The item-detail Stock tab (`/items/$id/stock`) is an all-locations pager
// (Location feature, PR E): one page per location, opening on the ACTIVE one,
// with "Add to location" on a not-stocked page and "Remove from location" on a
// stocked one.
//
// FOUR OF THE FIVE TESTS RUN IN BOTH PROJECTS as of cloud-locations issue #284
// task 6. They used to be local-only, and the old header blamed the fixture:
// every seed wrote IndexedDB through `page.evaluate()`, which a cloud-mode app
// never reads. That is now fixed the same way the other converted specs fix it
// — the fixture is described ONCE as plain data (helpers/fixture.ts) and
// translated per mode, by `seedLocalFixture` into IndexedDB or by
// `seedCloudFixture` into Postgres through GraphQL. Location ids are never
// hardcoded: the seed helpers return a `key -> real id` map, because a cloud
// location id is a server-generated cuid and the local `'local'` sentinel names
// nothing there.
//
// WHAT THE CLOUD RUN ADDS: this is the FIRST spec in this branch that seeds more
// than one location, so it is the first that can catch a location-scoping
// regression in the Stock tab. `stock.tsx` line 283 picks the viewed page's row
// with `stocks.find((s) => s.locationId === viewed.id)`; the fixture below
// stocks Milk at ONE location and pages to another, so code that ignored
// location and showed any stock row would fail test 1. Also covered in cloud
// for the first time: `addItemToLocation` copy-on-add, `removeItemFromLocation`
// from the last location, and the pager's own page ORDER over server-assigned
// `Location.order` values.
//
// THE ONE LOCAL-ONLY TEST is "user can remove an item from a location and lose
// only that location's logs and cart entries". Its skip reason is written out
// on the test itself — read it there before trying to convert it.

const HOME = 'HOME'
const OFFICE = 'OFFICE'
const STORAGE = 'STORAGE'
const ITEM = 'item-milk'

// KEEP THE DEFAULT LOCATION FIRST IN EVERY `locations` ARRAY BELOW.
//
// The two modes assign `Location.order` differently, and they agree only in
// that one arrangement:
//
//   local  — `seedLocalFixture` writes `order: index` for every location
//            (helpers/localSeed.ts line 50), so the ARRAY order is the order,
//            default location included.
//   cloud  — the default location is pinned at `order: 0` by
//            `ensureDefaultLocation` (apps/server/src/lib/defaultLocation.ts
//            line 52) whatever the array says, because `seedCloudFixture` does
//            not create it — it reads back the one the server made. Every other
//            location is then appended by `createLocation` at `maxOrder + 1`
//            (apps/server/src/resolvers/location.resolver.ts lines 40-42), in
//            the array's own order.
//
// MEASURED 2026-09-24, by moving `HOME_LOCATION` to the middle of the page-order
// test's array and running both projects:
//
//   cloud — 4 passed, 1 skipped. UNCHANGED. Cloud ignores where the array puts
//           the default location; only the non-default ones move.
//   local — 1 FAILED. The pager opened on page 2, so "Previous location" was
//           enabled where the test expects it disabled.
//
// So the mode that breaks is LOCAL, not cloud. Reordering this array does not
// look like a product bug in cloud at all — it silently makes the two modes
// test different page orders, and only local says so.
const HOME_LOCATION: FixtureLocation = {
  key: HOME,
  name: 'My Home',
  isDefault: true,
}
const OFFICE_LOCATION: FixtureLocation = { key: OFFICE, name: 'Office' }
const STORAGE_LOCATION: FixtureLocation = { key: STORAGE, name: 'Storage' }

// Seed one item and the requested locations. `stockedIn` decides which of them
// get an ItemStock row — an item is "stocked at" a location iff that row exists.
//
// The quantities are the ones the hand-written seed this fixture replaces wrote:
// a target of 4 and a refill threshold of 1 everywhere, and a packed quantity of
// `index + 1` so the rows are not interchangeable. Test 1 reads the target back
// after copy-on-add, so the 4 is load-bearing.
function makeFixture(
  locations: FixtureLocation[],
  stockedIn: string[],
): Fixture {
  return {
    locations,
    vendors: [],
    items: [{ id: ITEM, name: 'Milk' }],
    stocks: stockedIn.map((key, index) => ({
      itemId: ITEM,
      location: key,
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: index + 1,
      unpackedQuantity: 0,
    })),
    shelves: [],
    recipes: [],
  }
}

/** Seed the fixture into whichever backend this project runs against. */
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

test.beforeEach(async ({ page, request, baseURL }) => {
  // Prevent the empty-data redirect to /onboarding so tests can navigate freely.
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
    request,
    baseURL,
  }) => {
    // Given Milk is stocked only in My Home, and a second location exists
    const locationIds = await seedFixture(
      page,
      request,
      baseURL,
      makeFixture([HOME_LOCATION, OFFICE_LOCATION], [HOME]),
    )

    const stockTab = new StockPagerPage(page)
    await stockTab.navigateTo(ITEM)

    // Then it opens on the active location (My Home) with its stock form
    await expect(stockTab.getStockForm()).toBeVisible()

    // When the user pages to Office
    await stockTab.goToNext()

    // Then that page is the not-stocked empty state with an Add CTA. This is
    // the location-scoping assertion: Milk HAS a stock row, just not at this
    // location, so an implementation that ignored `viewed.id` would show the
    // form here.
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
    await expect
      .poll(async () => {
        const office = await readStockAt(
          page,
          request,
          baseURL,
          ITEM,
          locationIds[OFFICE],
        )
        if (!office) return undefined
        return {
          targetQuantity: office.targetQuantity,
          packedQuantity: office.packedQuantity,
        }
      })
      .toEqual({ targetQuantity: 4, packedQuantity: 0 })
  })

  test('user can remove an item from a location and lose only that location’s logs and cart entries', async ({
    page,
    baseURL,
  }) => {
    // LOCAL-ONLY, and NOT because the fixture writes IndexedDB — the other four
    // tests in this file did too and now run in both projects. Two separate
    // reasons, either of which is enough:
    //
    // 1. THE CLOUD CASE IS ALREADY COVERED, against real SQL.
    //    `e2e/tests/location-scoped-writes.spec.ts` line 254 — "user can remove
    //    an item from one location and the other location keeps its stock, logs
    //    and cart entries" — asserts the same behaviour from the opposite side,
    //    and it runs in the `cloud` project today.
    //
    // 2. A CLOUD SEED CANNOT BUILD THIS FIXTURE THROUGH THE BULK IMPORT.
    //    The point of the test is a log and a cart entry at a NON-DEFAULT
    //    location, and the import surface cannot place one there:
    //      - `InventoryLogInput` (apps/server/src/schema/import.graphql) has no
    //        `locationId` field at all.
    //      - `bulkCreateInventoryLogs` and `bulkCreateShoppingCarts`
    //        (apps/server/src/resolvers/import.resolver.ts) both hardcode
    //        `locationId: await ensureDefaultLocation(userId)`.
    //    So every imported log and cart lands at the default location, and the
    //    fixture would silently become "both rows are at My Home" — a test that
    //    still passes while proving nothing.
    //
    // TO CONVERT IT ANYWAY, a cloud seed would have to skip the bulk import for
    // these two entity types and drive `addInventoryLog(..., locationId:)` and
    // `vendorCart(vendorId, locationId)` + `addToCart` instead, which is what
    // `location-scoped-writes.spec.ts` already does. Do that only if PR 4 gives
    // the import surface real locations and this coverage is still wanted here.
    test.skip(
      baseURL === CLOUD_WEB_URL,
      'covered in cloud by location-scoped-writes.spec.ts:254; the bulk import cannot place a log or a cart at a non-default location',
    )

    // Given Milk is stocked in both locations, with one log and one cart entry
    // in each
    const locationIds = await seedLocalFixture(
      page,
      makeFixture([HOME_LOCATION, OFFICE_LOCATION], [HOME, OFFICE]),
    )
    const home = locationIds[HOME]
    const office = locationIds[OFFICE]
    const now = new Date()
    await seedRows(page, 'inventoryLogs', [
      {
        id: 'log-home',
        itemId: ITEM,
        locationId: home,
        delta: 1,
        quantity: 1,
        note: 'Home purchase',
        occurredAt: now,
        createdAt: now,
      },
      {
        id: 'log-office',
        itemId: ITEM,
        locationId: office,
        delta: 2,
        quantity: 2,
        note: 'Office purchase',
        occurredAt: now,
        createdAt: now,
      },
    ])
    await seedRows(page, 'shoppingCarts', [
      { id: `${home}:no-vendor` },
      { id: `${office}:no-vendor` },
    ])
    await seedRows(page, 'cartItems', [
      { id: 'ci-home', cartId: `${home}:no-vendor`, itemId: ITEM, quantity: 1 },
      {
        id: 'ci-office',
        cartId: `${office}:no-vendor`,
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
    expect(stocks.map((s) => s.locationId)).toEqual([office])

    const logs = await readRows(page, 'inventoryLogs')
    expect(logs.map((l) => l.id)).toEqual(['log-office'])

    const cartItems = await readRows(page, 'cartItems')
    expect(cartItems.map((c) => c.id)).toEqual(['ci-office'])

    // And the carts themselves survive — they are shared by every item in the
    // location, so removing one item must not delete them
    const carts = await readRows(page, 'shoppingCarts')
    expect(carts.map((c) => c.id)).toEqual(
      expect.arrayContaining([`${home}:no-vendor`, `${office}:no-vendor`]),
    )
  })

  test('user can page between locations with the dots and the chevrons', async ({
    page,
    request,
    baseURL,
  }) => {
    // Given three locations, with Milk stocked only in the first.
    // The default location is listed FIRST on purpose — see the comment on
    // HOME_LOCATION above. This test asserts page order, and that is the one
    // arrangement where the two modes assign the same `Location.order`.
    await seedFixture(
      page,
      request,
      baseURL,
      makeFixture([HOME_LOCATION, OFFICE_LOCATION, STORAGE_LOCATION], [HOME]),
    )

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
      'My Home (current location)',
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
    await expect(stockTab.getActiveHint()).toHaveText('Current location: My Home')
    await expect(stockTab.getActiveDot()).toHaveAccessibleName(
      'My Home (current location)',
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
    request,
    baseURL,
  }) => {
    // Given Milk is stocked in My Home only, and it shows in the pantry
    await seedFixture(
      page,
      request,
      baseURL,
      makeFixture([HOME_LOCATION, OFFICE_LOCATION], [HOME]),
    )
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
    request,
    baseURL,
  }) => {
    // Given only the default location exists
    await seedFixture(
      page,
      request,
      baseURL,
      makeFixture([HOME_LOCATION], [HOME]),
    )

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
