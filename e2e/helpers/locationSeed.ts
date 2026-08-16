import type { Page } from '@playwright/test'

// Helpers for the Location feature (PR D): stock now lives on a per-(item ×
// location) `itemStocks` store, and carts are keyed `${locationId}:${vendorId|'no-vendor'}`.
//
// Existing E2E specs seed items with stock fields inline on the item record and
// seed carts under the raw vendor id / 'no-vendor'. Rather than rewrite every
// inline `page.evaluate` seed block, these helpers post-process the seeded
// IndexedDB to the new schema: call them once, after a spec's seed block runs.

const DEFAULT_LOCATION_ID = 'local'

// For every item carrying inline stock fields, create a matching itemStocks row
// in the default location (idempotent). Run after seeding `items`.
export async function splitInlineStock(page: Page): Promise<void> {
  await page.evaluate(async (locationId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const getAll = (store: string) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    const put = (store: string, record: object) =>
      new Promise<void>((resolve, reject) => {
        const req = db
          .transaction(store, 'readwrite')
          .objectStore(store)
          .put(record)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })

    const STOCK_KEYS = [
      'packageUnit',
      'measurementUnit',
      'amountPerPackage',
      'targetUnit',
      'targetQuantity',
      'refillThreshold',
      'packedQuantity',
      'unpackedQuantity',
      'consumeAmount',
      'dueDate',
      'estimatedDueDays',
      'expirationThreshold',
      'expirationMode',
    ]

    const items = await getAll('items')
    const stocks = await getAll('itemStocks')
    const stocked = new Set(
      stocks.map((s) => `${s.itemId as string}:${s.locationId as string}`),
    )

    for (const item of items) {
      const id = item.id as string
      if (stocked.has(`${id}:${locationId}`)) continue
      const now = (item.updatedAt as Date) ?? new Date()
      const stock: Record<string, unknown> = {
        id: `stock-${id}`,
        itemId: id,
        locationId,
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        createdAt: (item.createdAt as Date) ?? now,
        updatedAt: now,
      }
      for (const key of STOCK_KEYS) {
        if (item[key] !== undefined) stock[key] = item[key]
      }
      await put('itemStocks', stock)
    }
  }, DEFAULT_LOCATION_ID)
}

// Re-key any carts seeded under a raw vendor id / 'no-vendor' to the
// location-scoped `${locationId}:${vendorId|'no-vendor'}` scheme, moving their
// cart items along. Run after seeding `shoppingCarts` / `cartItems`.
export async function relocateCarts(page: Page): Promise<void> {
  await page.evaluate(async (locationId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const getAll = (store: string) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    const run = (store: string, fn: (s: IDBObjectStore) => IDBRequest) =>
      new Promise<unknown>((resolve, reject) => {
        const req = fn(db.transaction(store, 'readwrite').objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

    const carts = await getAll('shoppingCarts')
    const cartItems = await getAll('cartItems')
    for (const cart of carts) {
      const oldId = cart.id as string
      if (oldId.startsWith(`${locationId}:`)) continue
      const newId = `${locationId}:${oldId}`
      await run('shoppingCarts', (s) => s.put({ ...cart, id: newId }))
      await run('shoppingCarts', (s) => s.delete(oldId))
      for (const ci of cartItems) {
        if (ci.cartId === oldId) {
          await run('cartItems', (s) => s.put({ ...ci, cartId: newId }))
        }
      }
    }
  }, DEFAULT_LOCATION_ID)
}
