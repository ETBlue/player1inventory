import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'
import { seedCloudFixture } from '../helpers/cloudSeed'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { expectInDocumentOrder } from '../helpers/domOrder'
import type { Fixture } from '../helpers/fixture'
import { seedLocalFixture } from '../helpers/localSeed'
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
// WHAT CHANGED IN cloud-locations PR "cloud E2E location coverage" (issue
// #284): this file really does seed a database, so the old "WHY LOCAL-ONLY"
// note was accurate as far as it went. The fixture is now described ONCE as
// plain data (`FIXTURE` below, typed by `helpers/fixture.ts`) and translated
// per data mode — `seedLocalFixture` writes IndexedDB, `seedCloudFixture`
// writes Postgres through GraphQL. Location ids are never hardcoded: the seed
// functions hand back a `key -> real id` map, because a cloud location id is a
// server-generated cuid and the local `'local'` sentinel names nothing there.
//
// THE THREE PANTRY GROUP-BY TESTS RUN IN BOTH PROJECTS. The /shopping and
// /cooking tests stay local-only, and NOT because of their fixture: both pages
// switch the partition OFF in cloud mode until PR 3. `isUnstockedHere` in
// src/routes/shopping/index.tsx and `isRecipeUnstockedHere` in
// src/routes/cooking.tsx are both `!isCloud && ...`, because a cloud `Cart` has
// no `locationId` yet and `consumeRecipes` writes the caller's default
// location. With no partition there is no divider to assert on. Their skips
// name that, and PR 3 is what removes them.
//
// Cloud isolation is by row ownership: every write is owned by E2E_USER_ID and
// `/e2e/cleanup` deletes that user's rows, `Location` and `ItemStock` included
// as of this branch.

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

// Two locations, three items, and one "here" + one "elsewhere" group on each of
// the three grouping axes. Seeded directly rather than driven through the UI:
// building this by hand runs to well past the 10-step budget the E2E convention
// sets for UI-driven setup.
//
// 'HOME' and 'OFFICE' are symbolic keys, not ids. HOME is the default location,
// which is also the active one — local falls back to the `isDefault` row and so
// does cloud (src/hooks/useActiveLocation.tsx).
const FIXTURE: Fixture = {
  locations: [
    { key: 'HOME', name: 'My Home', isDefault: true },
    { key: 'OFFICE', name: 'Office' },
  ],
  vendors: [
    { id: COSTCO, name: HERE_VENDOR },
    { id: BODEGA, name: ELSEWHERE_VENDOR },
  ],
  items: [
    { id: MILK, name: 'Milk', vendorIds: [COSTCO] },
    { id: COFFEE, name: 'Coffee', vendorIds: [BODEGA] },
    { id: BREAD, name: 'Bread' },
  ],
  // The load-bearing row set: Coffee has stock at the OFFICE and none at HOME,
  // so every group that holds only Coffee is "not stocked here".
  stocks: [
    { itemId: MILK, location: 'HOME' },
    { itemId: BREAD, location: 'HOME' },
    { itemId: COFFEE, location: 'OFFICE' },
  ],
  shelves: [
    {
      id: 'shelf-fridge',
      name: HERE_SHELF,
      type: 'selection',
      order: 0,
      itemIds: [MILK],
    },
    {
      id: 'shelf-cellar',
      name: ELSEWHERE_SHELF,
      type: 'selection',
      order: 1,
      itemIds: [COFFEE],
    },
  ],
  recipes: [
    {
      id: 'recipe-pancakes',
      name: HERE_RECIPE,
      items: [{ itemId: MILK, defaultAmount: 1 }],
    },
    {
      id: 'recipe-cold-brew',
      name: ELSEWHERE_RECIPE,
      items: [{ itemId: COFFEE, defaultAmount: 1 }],
    },
  ],
}

/** Seed FIXTURE into whichever backend this project runs against. */
async function seedFixture(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<void> {
  if (baseURL === CLOUD_WEB_URL) {
    await seedCloudFixture(request, FIXTURE)
    return
  }
  await seedLocalFixture(page, FIXTURE)
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
      request,
      baseURL,
    }) => {
      // Given two locations, with "${elsewhere}" holding only an item stocked
      // at the Office and "${here}" holding one stocked in the active location
      await seedFixture(page, request, baseURL)
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
    request,
    baseURL,
  }) => {
    // /shopping switches the partition OFF in cloud mode: `isUnstockedHere` in
    // src/routes/shopping/index.tsx is `!isCloud && ...`, because a cloud Cart
    // has no locationId until PR 3 and `useVendorCartCounts()` keeps a global
    // tally there. With no partition no divider renders at all. PR 3 removes
    // this skip; the fixture is already mode-neutral and needs no change.
    test.skip(
      baseURL === CLOUD_WEB_URL,
      'cloud skips the vendor partition until PR 3 (Cart has no locationId)',
    )

    // Given "Bodega" sells only Coffee, which is stocked at the Office, while
    // "Costco" sells Milk, stocked in the active location
    await seedFixture(page, request, baseURL)
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
    request,
    baseURL,
  }) => {
    // /cooking switches the partition OFF in cloud mode: `isRecipeUnstockedHere`
    // in src/routes/cooking.tsx is `!isCloud && ...`, because `consumeRecipes`
    // writes the caller's default location rather than the active one until
    // PR 3. With no partition no divider renders at all. PR 3 removes this
    // skip; the fixture is already mode-neutral and needs no change.
    test.skip(
      baseURL === CLOUD_WEB_URL,
      'cloud skips the recipe partition until PR 3 (consumeRecipes is not location-scoped)',
    )

    // Given "Cold Brew" needs only Coffee, stocked at the Office, while
    // "Pancakes" needs Milk, stocked in the active location
    await seedFixture(page, request, baseURL)
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
