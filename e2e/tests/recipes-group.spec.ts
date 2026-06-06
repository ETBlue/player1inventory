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

test('user sees recipe group card', async ({ page }) => {
  const recipeId = 'cccccccc-1111-0000-0000-000000000001'
  const itemId = 'dddddddd-1111-0000-0000-000000000001'
  const now = new Date().toISOString()

  // Given: a recipe with one item in its items array
  await page.goto('/')
  await page.evaluate(
    async ({ recipeId, itemId, now }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      const tx = db.transaction(['recipes', 'items'], 'readwrite')

      tx.objectStore('recipes').put({
        id: recipeId,
        name: 'Pasta',
        items: [{ itemId, defaultAmount: 2 }],
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      tx.objectStore('items').put({
        id: itemId,
        name: 'Spaghetti',
        tagIds: [],
        vendorIds: [],
        packedQuantity: 3,
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
    { recipeId, itemId, now },
  )

  // When: navigate to the recipe group-by view
  await page.goto('/?groupBy=recipe')

  // Then: the recipe card heading is visible
  // Recipe names use capitalize (default nameClassName)
  await expect(page.getByRole('button', { name: /Pasta/i })).toBeVisible()
})

test('user sees out-of-stock badge on recipe group card', async ({ page }) => {
  const recipeId = 'cccccccc-1111-0000-0000-000000000002'
  const outOfStockItemId = 'dddddddd-1111-0000-0000-000000000002'
  const okItemId = 'dddddddd-1111-0000-0000-000000000003'
  const now = new Date().toISOString()

  // Given: a recipe with one out-of-stock item and one ok item
  await page.goto('/')
  await page.evaluate(
    async ({ recipeId, outOfStockItemId, okItemId, now }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      const tx = db.transaction(['recipes', 'items'], 'readwrite')

      tx.objectStore('recipes').put({
        id: recipeId,
        name: 'Stir Fry',
        items: [
          { itemId: outOfStockItemId, defaultAmount: 1 },
          { itemId: okItemId, defaultAmount: 2 },
        ],
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      // Out of stock: qty = 0 < refillThreshold = 1
      tx.objectStore('items').put({
        id: outOfStockItemId,
        name: 'Tofu',
        tagIds: [],
        vendorIds: [],
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
        name: 'Soy Sauce',
        tagIds: [],
        vendorIds: [],
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
    { recipeId, outOfStockItemId, okItemId, now },
  )

  // When: navigate to the recipe group-by view
  await page.goto('/?groupBy=recipe')

  // Then: the recipe card shows "1 out of stock" badge
  await expect(page.getByText('1 out of stock')).toBeVisible()
})
