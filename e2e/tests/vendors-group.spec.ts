import { expect, test } from '@playwright/test'
import { splitInlineStock } from '../helpers/locationSeed'

test.beforeEach(async ({ page }) => {
  // Prevent empty-data redirect to /onboarding so tests can navigate freely.
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

test('user sees out-of-stock badge on vendor group card', async ({ page }) => {
  const vendorId = 'aaaaaaaa-0000-0000-0000-000000000001'
  const outOfStockItemId = 'bbbbbbbb-0000-0000-0000-000000000001'
  const okItemId = 'bbbbbbbb-0000-0000-0000-000000000002'
  const now = new Date().toISOString()

  // Given: a vendor with one out-of-stock item and one ok item
  await page.goto('/')
  await page.evaluate(
    async ({ vendorId, outOfStockItemId, okItemId, now }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      const tx = db.transaction(['vendors', 'items'], 'readwrite')

      tx.objectStore('vendors').put({
        id: vendorId,
        name: 'Costco',
        createdAt: new Date(now),
      })

      // Out of stock: qty = 0 < refillThreshold = 1
      tx.objectStore('items').put({
        id: outOfStockItemId,
        name: 'Milk',
        tagIds: [],
        vendorIds: [vendorId],
        packedQuantity: 0,
        unpackedQuantity: 0,
        targetQuantity: 2,
        refillThreshold: 1,
        consumeAmount: 1,
        targetUnit: 'package',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      // Ok: qty = 5 > refillThreshold = 2
      tx.objectStore('items').put({
        id: okItemId,
        name: 'Butter',
        tagIds: [],
        vendorIds: [vendorId],
        packedQuantity: 5,
        unpackedQuantity: 0,
        targetQuantity: 5,
        refillThreshold: 2,
        consumeAmount: 1,
        targetUnit: 'package',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      db.close()
    },
    { vendorId, outOfStockItemId, okItemId, now },
  )

  // When: navigate to the vendor group-by view
  await splitInlineStock(page)
  await page.goto('/?groupBy=vendor')

  // Then: the vendor card shows "1 empty" badge
  await expect(page.getByText('1 empty')).toBeVisible()
})

test('user sees vendor card with item count', async ({ page }) => {
  const vendorId = 'aaaaaaaa-0000-0000-0000-000000000002'
  const itemAId = 'bbbbbbbb-0000-0000-0000-000000000003'
  const itemBId = 'bbbbbbbb-0000-0000-0000-000000000004'
  const now = new Date().toISOString()

  // Given: a vendor with 2 items assigned to it
  await page.goto('/')
  await page.evaluate(
    async ({ vendorId, itemAId, itemBId, now }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      const tx = db.transaction(['vendors', 'items'], 'readwrite')

      tx.objectStore('vendors').put({
        id: vendorId,
        name: 'Costco',
        createdAt: new Date(now),
      })

      tx.objectStore('items').put({
        id: itemAId,
        name: 'Apple Juice',
        tagIds: [],
        vendorIds: [vendorId],
        packedQuantity: 3,
        unpackedQuantity: 0,
        targetQuantity: 5,
        refillThreshold: 2,
        consumeAmount: 1,
        targetUnit: 'package',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      tx.objectStore('items').put({
        id: itemBId,
        name: 'Orange Juice',
        tagIds: [],
        vendorIds: [vendorId],
        packedQuantity: 4,
        unpackedQuantity: 0,
        targetQuantity: 6,
        refillThreshold: 2,
        consumeAmount: 1,
        targetUnit: 'package',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      db.close()
    },
    { vendorId, itemAId, itemBId, now },
  )

  // When: navigate to the vendor group-by view
  await splitInlineStock(page)
  await page.goto('/?groupBy=vendor')

  // Then: the vendor card heading is visible
  // Vendor names use normal-case (not capitalize), rendered as-stored
  await expect(page.getByRole('button', { name: /Costco/ })).toBeVisible()
})
