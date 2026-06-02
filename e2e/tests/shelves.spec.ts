import { expect, test } from '@playwright/test'

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

test('user sees out-of-stock and low-stock badges on shelf cards', async ({ page }) => {
  const shelfId = 'cccccccc-0000-0000-0000-000000000001'
  const outOfStockItemId = 'dddddddd-0000-0000-0000-000000000001'
  const lowStockItemId = 'dddddddd-0000-0000-0000-000000000002'
  const okItemId = 'dddddddd-0000-0000-0000-000000000003'
  const now = new Date().toISOString()

  // Given: a selection shelf with one out-of-stock item, one low-stock item, and one ok item
  await page.goto('/')
  await page.evaluate(
    async ({ shelfId, outOfStockItemId, lowStockItemId, okItemId, now }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      const tx = db.transaction(['shelves', 'items'], 'readwrite')

      tx.objectStore('shelves').put({
        id: shelfId,
        name: 'Stock Test Shelf',
        type: 'selection',
        order: 1,
        itemIds: [outOfStockItemId, lowStockItemId, okItemId],
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      // Out of stock: qty = 0
      tx.objectStore('items').put({
        id: outOfStockItemId,
        name: 'Milk',
        tagIds: [],
        vendorIds: [],
        packedQuantity: 0,
        unpackedQuantity: 0,
        targetQuantity: 2,
        refillThreshold: 1,
        consumeAmount: 1,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      // Low stock: qty = 2, refillThreshold = 2 (qty === threshold, per getLowStockCount)
      tx.objectStore('items').put({
        id: lowStockItemId,
        name: 'Eggs',
        tagIds: [],
        vendorIds: [],
        packedQuantity: 2,
        unpackedQuantity: 0,
        targetQuantity: 6,
        refillThreshold: 2,
        consumeAmount: 1,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      // Ok: qty = 5, refillThreshold = 2
      tx.objectStore('items').put({
        id: okItemId,
        name: 'Butter',
        tagIds: [],
        vendorIds: [],
        packedQuantity: 5,
        unpackedQuantity: 0,
        targetQuantity: 5,
        refillThreshold: 2,
        consumeAmount: 1,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      db.close()
    },
    { shelfId, outOfStockItemId, lowStockItemId, okItemId, now },
  )

  // When: navigate to the shelves page
  await page.goto('/shelves')

  // Then: the shelf card shows stock status badges
  // ShelfCard renders error-inverse badge for out-of-stock, warning-inverse for low stock
  await expect(page.getByText('1 out of stock')).toBeVisible()
  await expect(page.getByText('1 low stock')).toBeVisible()
})

test('user sees packed progress label on shelf card', async ({ page }) => {
  const shelfId = 'cccccccc-0000-0000-0000-000000000002'
  const itemAId = 'dddddddd-0000-0000-0000-000000000004'
  const itemBId = 'dddddddd-0000-0000-0000-000000000005'
  const now = new Date().toISOString()

  // Given: a selection shelf with two package-unit items
  // Item A: 3 packed / 5 target; Item B: 2 packed / 4 target → totals: 5/9 pack
  await page.goto('/')
  await page.evaluate(
    async ({ shelfId, itemAId, itemBId, now }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      const tx = db.transaction(['shelves', 'items'], 'readwrite')

      tx.objectStore('shelves').put({
        id: shelfId,
        name: 'Fruit Shelf',
        type: 'selection',
        order: 2,
        itemIds: [itemAId, itemBId],
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      tx.objectStore('items').put({
        id: itemAId,
        name: 'Apple',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        packedQuantity: 3,
        unpackedQuantity: 0,
        targetQuantity: 5,
        refillThreshold: 2,
        consumeAmount: 1,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      tx.objectStore('items').put({
        id: itemBId,
        name: 'Melon',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        packedQuantity: 2,
        unpackedQuantity: 0,
        targetQuantity: 4,
        refillThreshold: 1,
        consumeAmount: 1,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      db.close()
    },
    { shelfId, itemAId, itemBId, now },
  )

  // When: navigate to the shelves page
  await page.goto('/shelves')

  // Then: the shelf card shows packed totals (5 packed / 9 target) and "pack" unit
  const fruitShelfCard = page.getByRole('button', { name: /Fruit Shelf/ })
  await expect(fruitShelfCard).toBeVisible()
  await expect(fruitShelfCard.getByText('5/9')).toBeVisible()
  await expect(fruitShelfCard.getByText('pack')).toBeVisible()
})
