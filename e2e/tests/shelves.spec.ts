import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'
import { seedCloudFixture } from '../helpers/cloudSeed'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import type { Fixture } from '../helpers/fixture'
import { seedLocalFixture } from '../helpers/localSeed'

// The pantry's "group by shelf" view: one card per shelf, with stock-health
// badges and a packed total summarising the items on that shelf.
//
// RUNS IN BOTH PROJECTS as of cloud-locations issue #284 task 4. It used to
// seed IndexedDB by hand with `page.evaluate` + `indexedDB.open`, write stock
// inline on the item row, and then call `splitInlineStock(page)` to move that
// stock onto the hardcoded `DEFAULT_LOCATION_ID = 'local'` sentinel. That
// sentinel names nothing in cloud, where a location id is a server-generated
// cuid.
//
// The fixture is now described ONCE as plain data (helpers/fixture.ts) and
// translated per mode — `seedLocalFixture` writes IndexedDB, `seedCloudFixture`
// writes Postgres through GraphQL. `vendors-group.spec.ts` and
// `recipes-group.spec.ts` were converted the same way;
// `location-not-stocked-here.spec.ts` is the original reference.
//
// The fixture lists its default location explicitly. The old seed listed none
// and leaned on Dexie's `on('populate')` to create "My Home" — cloud has no
// such hook, and `Fixture` requires exactly one `isDefault` location anyway.
//
// WHAT THE CLOUD RUN ADDS: badge and total maths summed from `ItemStock` rows.
// Both numbers are the point of this spec — the `1 empty` / `1 low stock`
// badges, including the boundary rule that a quantity EQUAL to the refill
// threshold counts as low, and the `5 / 9 pack` total.
//
// WHAT THIS SPEC CANNOT CATCH: it seeds ONE location. With one location,
// "count items stocked here" and "count every item" give the same number, so no
// location-scoping mutation can make it go red. It covers badge and total
// maths, not location scoping — `location-not-stocked-here.spec.ts` and
// `location-scoped-writes.spec.ts` cover that.

const BADGE_SHELF = 'cccccccc-0000-0000-0000-000000000001'
const MILK = 'dddddddd-0000-0000-0000-000000000001'
const EGGS = 'dddddddd-0000-0000-0000-000000000002'
const BUTTER = 'dddddddd-0000-0000-0000-000000000003'

const FRUIT_SHELF = 'cccccccc-0000-0000-0000-000000000002'
const APPLE = 'dddddddd-0000-0000-0000-000000000004'
const MELON = 'dddddddd-0000-0000-0000-000000000005'

// THE QUANTITIES ARE THE TEST. They are carried over unchanged from the
// hand-written seed this fixture replaces:
//
//   Milk    0 of 2, refill below 1  -> EMPTY   (quantity < refillThreshold)
//   Eggs    2 of 6, refill below 2  -> LOW     (quantity === refillThreshold)
//   Butter  5 of 5, refill below 2  -> ok, counts toward neither badge
//
// Eggs is the boundary case and the reason this spec exists: `isLowStock`
// (apps/web/src/lib/quantityUtils.ts line 512) counts a quantity EQUAL to the
// refill threshold as low. Raise Eggs to 3 and the `1 low stock` badge is gone.
// Do not round these numbers.
const FIXTURE_BADGES: Fixture = {
  locations: [{ key: 'HOME', name: 'My Home', isDefault: true }],
  vendors: [],
  // `targetUnit` and `consumeAmount` are written out rather than left to the
  // helpers' defaults, so a reader can see what this spec runs against. They
  // are the defaults: both seed helpers write 'package' and 1 for an omitted
  // key, matching `createItem` (see the items seed comment in localSeed.ts).
  items: [
    { id: MILK, name: 'Milk', targetUnit: 'package', consumeAmount: 1 },
    { id: EGGS, name: 'Eggs', targetUnit: 'package', consumeAmount: 1 },
    { id: BUTTER, name: 'Butter', targetUnit: 'package', consumeAmount: 1 },
  ],
  stocks: [
    {
      itemId: MILK,
      location: 'HOME',
      packedQuantity: 0,
      unpackedQuantity: 0,
      targetQuantity: 2,
      refillThreshold: 1,
    },
    {
      itemId: EGGS,
      location: 'HOME',
      packedQuantity: 2,
      unpackedQuantity: 0,
      targetQuantity: 6,
      refillThreshold: 2,
    },
    {
      itemId: BUTTER,
      location: 'HOME',
      packedQuantity: 5,
      unpackedQuantity: 0,
      targetQuantity: 5,
      refillThreshold: 2,
    },
  ],
  shelves: [
    {
      id: BADGE_SHELF,
      name: 'Stock Test Shelf',
      type: 'selection',
      order: 1,
      itemIds: [MILK, EGGS, BUTTER],
    },
  ],
  recipes: [],
}

// Two package-unit items on one shelf: 3 packed of a target of 5, plus 2 packed
// of a target of 4, so the card reads "5 / 9 pack".
//
// Kept in its own fixture so a page-wide locator in the other test cannot match
// these rows.
const FIXTURE_PACK_TOTAL: Fixture = {
  locations: [{ key: 'HOME', name: 'My Home', isDefault: true }],
  vendors: [],
  items: [
    { id: APPLE, name: 'Apple', targetUnit: 'package', consumeAmount: 1 },
    { id: MELON, name: 'Melon', targetUnit: 'package', consumeAmount: 1 },
  ],
  stocks: [
    {
      itemId: APPLE,
      location: 'HOME',
      packedQuantity: 3,
      unpackedQuantity: 0,
      targetQuantity: 5,
      refillThreshold: 2,
    },
    {
      itemId: MELON,
      location: 'HOME',
      packedQuantity: 2,
      unpackedQuantity: 0,
      targetQuantity: 4,
      refillThreshold: 1,
    },
  ],
  shelves: [
    {
      id: FRUIT_SHELF,
      name: 'Fruit Shelf',
      type: 'selection',
      order: 2,
      itemIds: [APPLE, MELON],
    },
  ],
  recipes: [],
}

/** Seed `fixture` into whichever backend this project runs against. */
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

test('user sees out-of-stock and low-stock badges on shelf cards', async ({
  page,
  request,
  baseURL,
}) => {
  // Given: a selection shelf with one out-of-stock item, one low-stock item, and one ok item
  await seedFixture(page, request, baseURL, FIXTURE_BADGES)

  // When: navigate to the shelves group-by view
  await page.goto('/?groupBy=shelf')

  // Then: the shelf card shows stock status badges
  // GroupCard renders "N empty" for out-of-stock, "N low stock" for low stock
  await expect(page.getByText('1 empty')).toBeVisible()
  await expect(page.getByText('1 low stock')).toBeVisible()
})

test('user sees packed progress label on shelf card', async ({
  page,
  request,
  baseURL,
}) => {
  // Given: a selection shelf with two package-unit items
  // Item A: 3 packed / 5 target; Item B: 2 packed / 4 target → totals: 5/9 pack
  await seedFixture(page, request, baseURL, FIXTURE_PACK_TOTAL)

  // When: navigate to the shelves group-by view
  await page.goto('/?groupBy=shelf')

  // Then: the shelf card shows packed totals (5 packed / 9 target) and "pack" unit
  const fruitShelfCard = page.getByRole('button', { name: /Fruit Shelf/ })
  await expect(fruitShelfCard).toBeVisible()
  await expect(fruitShelfCard.getByText('5 / 9')).toBeVisible()
  await expect(fruitShelfCard.getByText('pack')).toBeVisible()
})
