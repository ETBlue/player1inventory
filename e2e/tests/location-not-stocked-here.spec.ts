import { expect, type Page, test } from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'
import { expectInDocumentOrder } from '../helpers/domOrder'
import { seedRows } from '../helpers/locationSeed'
import { CookingPage } from '../pages/CookingPage'
import { PantryPage } from '../pages/PantryPage'
import { ShoppingPage } from '../pages/ShoppingPage'

// The "N not stocked here" divider (Location feature, PR F).
//
// Every group list in the app is partitioned by the ACTIVE LOCATION: a group
// whose items are all stocked somewhere else keeps rendering — an earlier
// design hid it, and that decision was reversed — but sinks below a divider
// counting how many groups did so.
//
// Five surfaces reach that behaviour through three different mechanisms:
//   - pantry shelf / vendor / recipe group-by — a group's item list resolved
//     against `useStockedItems()`, which is already location-scoped
//   - /shopping vendor list — `useVendorCartCounts()`, which filters on
//     `isStockedHere` and leaves a vendor with nothing here out of the map
//   - /cooking recipe list — `availableRecipeItems`, derived from the
//     `stockId` the active-location join sets
// All five are covered below, because each computes its own partition in its
// own file and can regress independently; they share one fixture rather than
// one copy of the test per file.
//
// THE FIXTURE IS THE TEST. Every case needs a group whose items are stocked
// only at a SECOND location — against a location-blind implementation that
// group counts as stocked, lands above the divider, and the assertions fail.
// A fixture with only empty groups would pass either way and prove nothing.
//
// Locations are local-first (no cloud Location/ItemStock backend), and both
// `/shopping` and `/cooking` skip the partition entirely in cloud mode, so
// these flows are local-only. The Playwright `cloud` project's `testMatch`
// does not select this file; the guard below is belt-and-braces.

const HOME = 'local' // DEFAULT_LOCATION_ID, seeded as "My Home" — the active location
const OFFICE = 'office-loc'

// Milk is stocked HERE, Coffee only at the OFFICE, Bread is stocked here but
// belongs to no group — it keeps each view's unfiled bucket ("Unsorted" /
// "No vendor" / "Not added to recipe") non-empty, and therefore above the
// divider, so the divider's count is exactly the groups that sank.
const MILK = 'item-milk'
const COFFEE = 'item-coffee'
const BREAD = 'item-bread'

const COSTCO = 'vendor-costco'
const BODEGA = 'vendor-bodega'

// One group per surface holding Milk (stays above) and one holding Coffee
// (sinks below).
const HERE_SHELF = 'Fridge'
const ELSEWHERE_SHELF = 'Cellar'
const HERE_VENDOR = 'Costco'
const ELSEWHERE_VENDOR = 'Bodega'
const HERE_RECIPE = 'Pancakes'
const ELSEWHERE_RECIPE = 'Cold Brew'

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

function stock(itemId: string, locationId: string): Record<string, unknown> {
  const now = new Date()
  return {
    id: `stock-${itemId}-${locationId}`,
    itemId,
    locationId,
    // Global configuration lives on the Item since v16.
    targetQuantity: 4,
    refillThreshold: 1,
    // 3 of a target of 4, above the refill threshold — neither empty nor low,
    // so no health badge text competes with the divider's own "N ..." string.
    packedQuantity: 3,
    unpackedQuantity: 0,
    createdAt: now,
    updatedAt: now,
  }
}

// Two locations, three items, and one "here" + one "elsewhere" group on each of
// the three grouping axes. Seeded directly rather than driven through the UI:
// building this by hand runs to well past the 10-step budget the E2E convention
// sets for UI-driven setup.
//
// `seedRows` resolves on the transaction's `oncomplete`, never on a request's
// `onsuccess` — the navigation that follows a seed aborts a still-open
// transaction and silently discards its rows.
async function seedFixture(page: Page) {
  // Dexie must have created the schema before opening the database by name.
  await page.goto('/')
  const now = new Date()

  await seedRows(page, 'locations', [
    { id: HOME, name: 'My Home', order: 0, createdAt: now, updatedAt: now },
    { id: OFFICE, name: 'Office', order: 1, createdAt: now, updatedAt: now },
  ])

  await seedRows(page, 'vendors', [
    { id: COSTCO, name: HERE_VENDOR, createdAt: now },
    { id: BODEGA, name: ELSEWHERE_VENDOR, createdAt: now },
  ])

  await seedRows(page, 'items', [
    {
      id: MILK,
      name: 'Milk',
      tagIds: [],
      vendorIds: [COSTCO],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: COFFEE,
      name: 'Coffee',
      tagIds: [],
      vendorIds: [BODEGA],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: BREAD,
      name: 'Bread',
      tagIds: [],
      vendorIds: [],
      createdAt: now,
      updatedAt: now,
    },
  ])

  // The load-bearing row set: Coffee has an ItemStock at the OFFICE and none at
  // HOME, so every group that holds only Coffee is "not stocked here".
  await seedRows(page, 'itemStocks', [
    stock(MILK, HOME),
    stock(BREAD, HOME),
    stock(COFFEE, OFFICE),
  ])

  await seedRows(page, 'shelves', [
    {
      id: 'shelf-fridge',
      name: HERE_SHELF,
      type: 'selection',
      order: 0,
      itemIds: [MILK],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'shelf-cellar',
      name: ELSEWHERE_SHELF,
      type: 'selection',
      order: 1,
      itemIds: [COFFEE],
      createdAt: now,
      updatedAt: now,
    },
  ])

  await seedRows(page, 'recipes', [
    {
      id: 'recipe-pancakes',
      name: HERE_RECIPE,
      items: [{ itemId: MILK, defaultAmount: 1 }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'recipe-cold-brew',
      name: ELSEWHERE_RECIPE,
      items: [{ itemId: COFFEE, defaultAmount: 1 }],
      createdAt: now,
      updatedAt: now,
    },
  ])
}

// The describe title carries both "location" and "items" so the documented
// verification greps (`--grep "items|shopping|cooking|settings|a11y"` and the
// location-aware variants) select this file — Playwright matches grep against
// the joined title path, and "location-not-stocked-here" alone would miss
// "items". Same trap `item-stock-pager.spec.ts` documents.
test.describe('location-scoped group lists — items not stocked here', () => {
  const pantryGroupViews = [
    {
      groupBy: 'shelf' as const,
      here: HERE_SHELF,
      elsewhere: ELSEWHERE_SHELF,
      unfiled: 'Unsorted',
    },
    {
      groupBy: 'vendor' as const,
      here: HERE_VENDOR,
      elsewhere: ELSEWHERE_VENDOR,
      unfiled: 'No vendor',
    },
    {
      groupBy: 'recipe' as const,
      here: HERE_RECIPE,
      elsewhere: ELSEWHERE_RECIPE,
      unfiled: 'Not added to recipe',
    },
  ]

  for (const { groupBy, here, elsewhere, unfiled } of pantryGroupViews) {
    test(`user sees a ${groupBy} group stocked only at another location below the divider`, async ({
      page,
      baseURL,
    }) => {
      test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

      // Given two locations, with "${elsewhere}" holding only an item stocked
      // at the Office and "${here}" holding one stocked in the active location
      await seedFixture(page)
      const pantry = new PantryPage(page)

      // When the user opens the pantry grouped by ${groupBy}
      await pantry.navigateToGroupBy(groupBy)

      // Then the group with nothing stocked here still RENDERS — it is not
      // hidden, only moved
      await expect(pantry.getGroupCard(elsewhere)).toBeVisible()

      // And the divider counts exactly it. The fixture has three groups in this
      // view (${here}, ${elsewhere} and the ${unfiled} bucket) and the two
      // assertions below place the other two above the line, so "1" is pinned
      // to the set of groups that actually sank.
      const divider = pantry.getNotStockedHereDivider()
      await expect(divider).toHaveText('1 not stocked here')

      // And it renders BELOW the divider
      await expectInDocumentOrder(divider, pantry.getGroupCard(elsewhere))

      // And the group stocked in the active location renders ABOVE it
      await expectInDocumentOrder(pantry.getGroupCard(here), divider)

      // As does the unfiled bucket, which holds an item stocked here
      await expectInDocumentOrder(pantry.getGroupCard(unfiled), divider)
    })
  }

  test('user sees a shopping vendor stocked only at another location below the divider', async ({
    page,
    baseURL,
  }) => {
    test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

    // Given "Bodega" sells only Coffee, which is stocked at the Office, while
    // "Costco" sells Milk, stocked in the active location
    await seedFixture(page)
    const shopping = new ShoppingPage(page)

    // When the user opens the shopping cart list
    await shopping.navigateTo()

    // Then the vendor with nothing stocked here still RENDERS
    await expect(shopping.getVendorCartCard(ELSEWHERE_VENDOR)).toBeVisible()

    // And the divider counts exactly it — the list holds three cards (Costco,
    // Bodega and the "No vendor" bucket, which has Bread stocked here)
    const divider = shopping.getNotStockedHereDivider()
    await expect(divider).toHaveText('1 not stocked here')

    // And it renders BELOW the divider
    await expectInDocumentOrder(
      divider,
      shopping.getVendorCartCard(ELSEWHERE_VENDOR),
    )

    // And the vendor stocked in the active location renders ABOVE it
    await expectInDocumentOrder(
      shopping.getVendorCartCard(HERE_VENDOR),
      divider,
    )

    // As does the "No vendor" bucket
    await expectInDocumentOrder(shopping.getVendorCartCard('No vendor'), divider)
  })

  test('user sees a recipe stocked only at another location below the divider, still disabled', async ({
    page,
    baseURL,
  }) => {
    test.skip(baseURL === CLOUD_WEB_URL, 'Locations have no cloud backend yet')

    // Given "Cold Brew" needs only Coffee, stocked at the Office, while
    // "Pancakes" needs Milk, stocked in the active location
    await seedFixture(page)
    const cooking = new CookingPage(page)

    // When the user opens the cooking page
    await cooking.navigateTo()

    // Then the recipe with nothing stocked here still RENDERS
    await expect(cooking.getRecipeCheckbox(ELSEWHERE_RECIPE)).toBeVisible()

    // And the divider counts exactly it — cooking has no unfiled bucket, so the
    // list is just the two seeded recipes
    const divider = cooking.getNotStockedHereDivider()
    await expect(divider).toHaveText('1 not stocked here')

    // And it renders BELOW the divider
    await expectInDocumentOrder(
      divider,
      cooking.getRecipeCheckbox(ELSEWHERE_RECIPE),
    )

    // And the recipe stocked in the active location renders ABOVE it
    await expectInDocumentOrder(cooking.getRecipeCheckbox(HERE_RECIPE), divider)

    // And sinking it did NOT make it cookable — visibility and interactivity
    // are independent axes here, so the sunk recipe stays disabled while the
    // one stocked here stays enabled
    await expect(cooking.getRecipeCheckbox(ELSEWHERE_RECIPE)).toBeDisabled()
    await expect(cooking.getRecipeCheckbox(HERE_RECIPE)).toBeEnabled()
  })
})
