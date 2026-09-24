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

// The pantry's "group by recipe" view: one card per recipe, with a stock-health
// badge summarising the items it needs.
//
// RUNS IN BOTH PROJECTS as of cloud-locations issue #284 task 2. It used to
// seed IndexedDB by hand with `page.evaluate` + `indexedDB.open`, write stock
// inline on the item row, and then call `splitInlineStock(page)` to move that
// stock onto the hardcoded `DEFAULT_LOCATION_ID = 'local'` sentinel. That
// sentinel names nothing in cloud, where a location id is a server-generated
// cuid.
//
// The fixture is now described ONCE as plain data (helpers/fixture.ts) and
// translated per mode — `seedLocalFixture` writes IndexedDB, `seedCloudFixture`
// writes Postgres through GraphQL. `location-not-stocked-here.spec.ts` is the
// reference for this shape.
//
// The fixture lists its default location explicitly. The old seed listed none
// and leaned on Dexie's `on('populate')` to create "My Home" — cloud has no
// such hook, and `Fixture` requires exactly one `isDefault` location anyway.
//
// WHAT THE CLOUD RUN ADDS: the "1 empty" badge is stock-health maths summed
// from `ItemStock` rows. `location-not-stocked-here.spec.ts` deliberately keeps
// badge text out of the way (its `STOCK_DEFAULTS` are neither empty nor low), so
// before this file joined the cloud project no cloud test checked a badge count
// at all.

const PASTA = 'recipe-pasta'
const SPAGHETTI = 'item-spaghetti'

const STIR_FRY = 'recipe-stir-fry'
const TOFU = 'item-tofu'
const SOY_SAUCE = 'item-soy-sauce'

// One recipe holding one item that is stocked in the active location.
const FIXTURE_CARD: Fixture = {
  locations: [{ key: 'HOME', name: 'My Home', isDefault: true }],
  vendors: [],
  // `targetUnit` and `consumeAmount` are written out rather than left to the
  // helpers' defaults, so a reader can see what this spec runs against. They
  // are the defaults: both seed helpers write 'package' and 1 for an omitted
  // key, matching `createItem` (see the items seed comment in localSeed.ts).
  items: [
    {
      id: SPAGHETTI,
      name: 'Spaghetti',
      targetUnit: 'package',
      consumeAmount: 1,
    },
  ],
  stocks: [
    {
      itemId: SPAGHETTI,
      location: 'HOME',
      packedQuantity: 3,
      unpackedQuantity: 0,
      targetQuantity: 5,
      refillThreshold: 2,
    },
  ],
  shelves: [],
  recipes: [
    {
      id: PASTA,
      name: 'Pasta',
      items: [{ itemId: SPAGHETTI, defaultAmount: 2 }],
    },
  ],
}

// THE QUANTITIES ARE THE TEST. Tofu is stocked HERE with a quantity of 0, which
// is what makes the card read "1 empty" — an item with no stock row at all would
// instead sink the whole group below the "not stocked here" divider and the
// badge would never render. Soy Sauce sits well above its refill threshold, so
// it contributes nothing to the badge and "1" counts exactly Tofu.
const FIXTURE_BADGE: Fixture = {
  locations: [{ key: 'HOME', name: 'My Home', isDefault: true }],
  vendors: [],
  items: [
    { id: TOFU, name: 'Tofu', targetUnit: 'package', consumeAmount: 1 },
    {
      id: SOY_SAUCE,
      name: 'Soy Sauce',
      targetUnit: 'package',
      consumeAmount: 1,
    },
  ],
  stocks: [
    // Empty: quantity 0 is below a refill threshold of 1.
    {
      itemId: TOFU,
      location: 'HOME',
      packedQuantity: 0,
      unpackedQuantity: 0,
      targetQuantity: 2,
      refillThreshold: 1,
    },
    // Ok: quantity 5 is above a refill threshold of 2.
    {
      itemId: SOY_SAUCE,
      location: 'HOME',
      packedQuantity: 5,
      unpackedQuantity: 0,
      targetQuantity: 5,
      refillThreshold: 2,
    },
  ],
  shelves: [],
  recipes: [
    {
      id: STIR_FRY,
      name: 'Stir Fry',
      items: [
        { itemId: TOFU, defaultAmount: 1 },
        { itemId: SOY_SAUCE, defaultAmount: 2 },
      ],
    },
  ],
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

test('user sees recipe group card', async ({ page, request, baseURL }) => {
  // Given: a recipe with one item in its items array
  await seedFixture(page, request, baseURL, FIXTURE_CARD)

  // When: navigate to the recipe group-by view
  await page.goto('/?groupBy=recipe')

  // Then: the recipe card heading is visible
  // Recipe names use capitalize (default nameClassName)
  await expect(page.getByRole('button', { name: /Pasta/i })).toBeVisible()
})

test('user sees out-of-stock badge on recipe group card', async ({
  page,
  request,
  baseURL,
}) => {
  // Given: a recipe with one out-of-stock item and one ok item
  await seedFixture(page, request, baseURL, FIXTURE_BADGE)

  // When: navigate to the recipe group-by view
  await page.goto('/?groupBy=recipe')

  // Then: the recipe card shows "1 empty" badge
  await expect(page.getByText('1 empty')).toBeVisible()
})
