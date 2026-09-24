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

// The pantry's "group by vendor" view: one card per vendor, with a stock-health
// badge summarising the items that vendor sells.
//
// RUNS IN BOTH PROJECTS as of cloud-locations issue #284 task 3. It used to
// seed IndexedDB by hand with `page.evaluate` + `indexedDB.open`, write stock
// inline on the item row, and then call `splitInlineStock(page)` to move that
// stock onto the hardcoded `DEFAULT_LOCATION_ID = 'local'` sentinel. That
// sentinel names nothing in cloud, where a location id is a server-generated
// cuid.
//
// The fixture is now described ONCE as plain data (helpers/fixture.ts) and
// translated per mode — `seedLocalFixture` writes IndexedDB, `seedCloudFixture`
// writes Postgres through GraphQL. `recipes-group.spec.ts` is the nearest
// example, and `location-not-stocked-here.spec.ts` is the original reference.
//
// The fixture lists its default location explicitly. The old seed listed none
// and leaned on Dexie's `on('populate')` to create "My Home" — cloud has no
// such hook, and `Fixture` requires exactly one `isDefault` location anyway.
//
// WHAT THE CLOUD RUN ADDS: the "1 empty" badge is stock-health maths summed
// from `ItemStock` rows. It proves vendor grouping sums stock health from those
// rows in cloud.
//
// WHAT THIS SPEC CANNOT CATCH: it seeds ONE location. With one location,
// "count items stocked here" and "count every item" give the same number, so no
// location-scoping mutation can make it go red. It covers badge maths, not
// location scoping — `location-not-stocked-here.spec.ts` and
// `location-scoped-writes.spec.ts` cover that.

const COSTCO_BADGE = 'aaaaaaaa-0000-0000-0000-000000000001'
const MILK = 'bbbbbbbb-0000-0000-0000-000000000001'
const BUTTER = 'bbbbbbbb-0000-0000-0000-000000000002'

const COSTCO_CARD = 'aaaaaaaa-0000-0000-0000-000000000002'
const APPLE_JUICE = 'bbbbbbbb-0000-0000-0000-000000000003'
const ORANGE_JUICE = 'bbbbbbbb-0000-0000-0000-000000000004'

// THE QUANTITIES ARE THE TEST. Milk is stocked HERE with a quantity of 0, which
// is what makes the card read "1 empty" — an item with no stock row at all would
// instead sink the whole group below the "not stocked here" divider and the
// badge would never render. Butter sits well above its refill threshold, so it
// contributes nothing to the badge and "1" counts exactly Milk.
const FIXTURE_BADGE: Fixture = {
  locations: [{ key: 'HOME', name: 'My Home', isDefault: true }],
  vendors: [{ id: COSTCO_BADGE, name: 'Costco' }],
  // `targetUnit` and `consumeAmount` are written out rather than left to the
  // helpers' defaults, so a reader can see what this spec runs against. They
  // are the defaults: both seed helpers write 'package' and 1 for an omitted
  // key, matching `createItem` (see the items seed comment in localSeed.ts).
  items: [
    {
      id: MILK,
      name: 'Milk',
      vendorIds: [COSTCO_BADGE],
      targetUnit: 'package',
      consumeAmount: 1,
    },
    {
      id: BUTTER,
      name: 'Butter',
      vendorIds: [COSTCO_BADGE],
      targetUnit: 'package',
      consumeAmount: 1,
    },
  ],
  stocks: [
    // Empty: quantity 0 is below a refill threshold of 1.
    {
      itemId: MILK,
      location: 'HOME',
      packedQuantity: 0,
      unpackedQuantity: 0,
      targetQuantity: 2,
      refillThreshold: 1,
    },
    // Ok: quantity 5 is above a refill threshold of 2.
    {
      itemId: BUTTER,
      location: 'HOME',
      packedQuantity: 5,
      unpackedQuantity: 0,
      targetQuantity: 5,
      refillThreshold: 2,
    },
  ],
  shelves: [],
  recipes: [],
}

// One vendor selling two items, both comfortably stocked. Kept in its own
// fixture so a page-wide locator in the other test cannot match these rows.
const FIXTURE_CARD: Fixture = {
  locations: [{ key: 'HOME', name: 'My Home', isDefault: true }],
  vendors: [{ id: COSTCO_CARD, name: 'Costco' }],
  items: [
    {
      id: APPLE_JUICE,
      name: 'Apple Juice',
      vendorIds: [COSTCO_CARD],
      targetUnit: 'package',
      consumeAmount: 1,
    },
    {
      id: ORANGE_JUICE,
      name: 'Orange Juice',
      vendorIds: [COSTCO_CARD],
      targetUnit: 'package',
      consumeAmount: 1,
    },
  ],
  stocks: [
    {
      itemId: APPLE_JUICE,
      location: 'HOME',
      packedQuantity: 3,
      unpackedQuantity: 0,
      targetQuantity: 5,
      refillThreshold: 2,
    },
    {
      itemId: ORANGE_JUICE,
      location: 'HOME',
      packedQuantity: 4,
      unpackedQuantity: 0,
      targetQuantity: 6,
      refillThreshold: 2,
    },
  ],
  shelves: [],
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

test('user sees out-of-stock badge on vendor group card', async ({
  page,
  request,
  baseURL,
}) => {
  // Given: a vendor with one out-of-stock item and one ok item
  await seedFixture(page, request, baseURL, FIXTURE_BADGE)

  // When: navigate to the vendor group-by view
  await page.goto('/?groupBy=vendor')

  // Then: the vendor card shows "1 empty" badge
  await expect(page.getByText('1 empty')).toBeVisible()
})

test('user sees vendor card with item count', async ({
  page,
  request,
  baseURL,
}) => {
  // Given: a vendor with 2 items assigned to it
  await seedFixture(page, request, baseURL, FIXTURE_CARD)

  // When: navigate to the vendor group-by view
  await page.goto('/?groupBy=vendor')

  // Then: the vendor card heading is visible
  // Vendor names use normal-case (not capitalize), rendered as-stored
  await expect(page.getByRole('button', { name: /Costco/ })).toBeVisible()
})
