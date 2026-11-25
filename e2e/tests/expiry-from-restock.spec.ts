import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'
import { ensureCloudHomeLocation } from '../helpers/cloudSeed'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { PantryPage } from '../pages/PantryPage'
import { makeGql } from '../utils/cloud'

// Expiry from the last restock (docs/features/items/
// 2026-11-26-expiry-from-last-restock-design.md, owner decision 2026-11-26).
//
// RUNS IN BOTH PROJECTS. The last purchase date is the newest log at the
// location with `delta > 0`, a stock count included. So a stock count that
// raises the amount moves the "days from purchase" expiry AND the Purchased
// sort.
//
// WHY THE SEED IS HAND-WRITTEN, not `seedCloudFixture`: that helper stocks an
// item with `upsertItemStock`, and since 2026-11-25 that write adds a stock
// count row dated NOW. Under the new rule that row is a restock, so both items
// would start at "Expires in 30 days" and the test could not see a change.
// Cloud seeds the stock with `bulkCreateItemStocks` (an import writes no log)
// and the old purchases with `bulkCreateInventoryLogs`, which keeps a date in
// the past.
//
// What the test can tell apart: Yogurt was bought 20 days ago and Kefir 5
// days ago, so before the save they show 10 and 25 days and sort Yogurt
// first. After the stock count only Yogurt moves, to 30 days, and the order
// flips. The page is not reloaded, so the save itself must refresh the date.

const DAY = 24 * 60 * 60 * 1000
const YOGURT = 'eeeeeeee-0000-0000-0000-000000000001'
const KEFIR = 'eeeeeeee-0000-0000-0000-000000000002'

type Seed = { id: string; name: string; boughtDaysAgo: number }
const SEEDS: Seed[] = [
  { id: YOGURT, name: 'Yogurt', boughtDaysAgo: 20 },
  { id: KEFIR, name: 'Kefir', boughtDaysAgo: 5 },
]

async function seedCloud(request: APIRequestContext): Promise<void> {
  const gql = makeGql(request)
  const home = await ensureCloudHomeLocation(request)
  const now = Date.now()
  const ids = new Map<string, string>()
  for (const seed of SEEDS) {
    const { createItem } = await gql<{ createItem: { id: string } }>(
      `mutation CreateItem($input: CreateItemInput!) {
        createItem(input: $input) { id }
      }`,
      {
        input: {
          name: seed.name,
          expirationMode: 'days from purchase',
          estimatedDueDays: 30,
        },
      },
    )
    ids.set(seed.id, createItem.id)
  }
  const idOf = (seed: Seed) => ids.get(seed.id) as string
  const stamp = new Date(now).toISOString()
  await gql(
    `mutation BulkCreateItemStocks($itemStocks: [ItemStockImportInput!]!) {
      bulkCreateItemStocks(itemStocks: $itemStocks) { id }
    }`,
    {
      itemStocks: SEEDS.map((seed) => ({
        id: `stock-${seed.id}`,
        itemId: idOf(seed),
        locationId: home.id,
        targetQuantity: 5,
        refillThreshold: 0,
        packedQuantity: 1,
        unpackedQuantity: 0,
        createdAt: stamp,
        updatedAt: stamp,
      })),
    },
  )
  await gql(
    `mutation BulkCreateInventoryLogs($logs: [InventoryLogInput!]!) {
      bulkCreateInventoryLogs(logs: $logs) { id }
    }`,
    {
      logs: SEEDS.map((seed) => ({
        id: `log-${seed.id}`,
        itemId: idOf(seed),
        locationId: home.id,
        delta: 1,
        quantity: 1,
        occurredAt: new Date(now - seed.boughtDaysAgo * DAY).toISOString(),
        logKey: 'purchase',
      })),
    },
  )
}

async function seedLocal(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(
    async ({ seeds, day }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      // Resolve on COMMIT, not on request success (root CLAUDE.md, E2E Test
      // Format).
      const putAll = (storeName: string, rows: object[]) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite')
          for (const row of rows) tx.objectStore(storeName).put(row)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error)
        })
      const now = Date.now()
      await putAll(
        'items',
        seeds.map((seed) => ({
          id: seed.id,
          name: seed.name,
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          consumeAmount: 1,
          expirationMode: 'days from purchase',
          estimatedDueDays: 30,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })),
      )
      await putAll(
        'itemStocks',
        seeds.map((seed) => ({
          id: `stock-${seed.id}`,
          itemId: seed.id,
          locationId: 'local',
          targetQuantity: 5,
          refillThreshold: 0,
          packedQuantity: 1,
          unpackedQuantity: 0,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })),
      )
      await putAll(
        'inventoryLogs',
        seeds.map((seed) => ({
          id: `log-${seed.id}`,
          itemId: seed.id,
          locationId: 'local',
          delta: 1,
          quantity: 1,
          occurredAt: new Date(now - seed.boughtDaysAgo * day),
          createdAt: new Date(now),
          logKey: 'purchase',
        })),
      )
    },
    { seeds: SEEDS, day: DAY },
  )
}

test.beforeEach(async ({ page, request, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
    // Sort the pantry by last purchase, oldest first.
    localStorage.setItem(
      'pantry-sort-prefs',
      JSON.stringify({ sortBy: 'purchased', sortDirection: 'asc' }),
    )
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

test('user sees the expiry and the Purchased sort move after a stock count raises the amount', async ({
  page,
  request,
  baseURL,
}) => {
  // Given Yogurt bought 20 days ago and Kefir 5 days ago, both "30 days from
  // purchase", one pack each
  if (baseURL === CLOUD_WEB_URL) {
    await seedCloud(request)
  } else {
    await seedLocal(page)
  }
  const pantry = new PantryPage(page)
  await pantry.navigateTo()
  const names = page.getByRole('heading', { level: 3 })
  await expect(page.getByText('Expires in 10 days')).toBeVisible()
  await expect(page.getByText('Expires in 25 days')).toBeVisible()
  await expect(names).toHaveText(['Yogurt', 'Kefir'])

  // When the user counts Yogurt and saves one more pack
  await pantry.clickQuickUpdate('Yogurt')
  await pantry
    .getQuickUpdateDialog()
    .getByRole('button', { name: 'Increase packed' })
    .click()
  await pantry.submitQuickUpdate()
  await expect(pantry.getQuickUpdateDialog()).toHaveCount(0)

  // Then, with no reload, Yogurt's expiry counts from today, Kefir's does
  // not move, and Yogurt now sorts after Kefir
  await expect(page.getByText('Expires in 30 days')).toBeVisible()
  await expect(page.getByText('Expires in 25 days')).toBeVisible()
  await expect(page.getByText('Expires in 10 days')).toHaveCount(0)
  await expect(names).toHaveText(['Kefir', 'Yogurt'])
})
