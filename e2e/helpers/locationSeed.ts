import type { Page } from '@playwright/test'

// Helpers for the Location feature (PR D): stock now lives on a per-(item ×
// location) `itemStocks` store, and carts are keyed `${locationId}:${vendorId|'no-vendor'}`.
//
// Existing E2E specs seed items with stock fields inline on the item record and
// seed carts under the raw vendor id / 'no-vendor'. Rather than rewrite every
// inline `page.evaluate` seed block, these helpers post-process the seeded
// IndexedDB to the new schema: call them once, after a spec's seed block runs.

const DEFAULT_LOCATION_ID = 'local'

// Generic table seed/read against the app's Dexie database. Multi-location
// fixtures (several `locations`, one `itemStocks` row per location, per-location
// logs and cart items) run to well past the 10-step UI budget the E2E convention
// sets for UI-driven setup, so the Stock-pager spec seeds them directly.
//
// Navigate to '/' first so Dexie has created the schema at the current version —
// `indexedDB.open` without a version opens whatever exists, and on a cold
// profile that is nothing.
export async function seedRows(
  page: Page,
  store: string,
  rows: object[],
): Promise<void> {
  await page.evaluate(
    async ({ store, rows }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      // One transaction for all rows, resolved on COMMIT rather than on each
      // request's success event. IDBRequest fires success while the
      // transaction is still open, so resolving there reports a write that has
      // not landed — and the navigation that follows a seed destroys the
      // document, aborting the open transaction and discarding those rows.
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        const objectStore = tx.objectStore(store)
        for (const row of rows) objectStore.put(row)
        tx.oncomplete = () => resolve()
        tx.onerror = () =>
          reject(tx.error ?? new Error(`IndexedDB transaction failed for "${store}"`))
        tx.onabort = () =>
          reject(tx.error ?? new Error(`IndexedDB transaction aborted for "${store}"`))
      })
    },
    { store, rows },
  )
}

export async function readRows(
  page: Page,
  store: string,
): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (store) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const req = db.transaction(store).objectStore(store).getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }, store)
}

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
    // Resolved on COMMIT — see `seedRows` above.
    const put = (store: string, record: object) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put(record)
        tx.oncomplete = () => resolve()
        tx.onerror = () =>
          reject(tx.error ?? new Error(`IndexedDB transaction failed for "${store}"`))
        tx.onabort = () =>
          reject(tx.error ?? new Error(`IndexedDB transaction aborted for "${store}"`))
      })

    // Only the per-location STATE moves onto the stock row. The eight
    // configuration fields (packageUnit, measurementUnit, amountPerPackage,
    // targetUnit, consumeAmount, estimatedDueDays, expirationThreshold,
    // expirationMode) are global Item fields since v16 — they stay on the
    // seeded item, and a copy left on the row would shadow it in the join.
    const STOCK_KEYS = [
      'targetQuantity',
      'refillThreshold',
      'packedQuantity',
      'unpackedQuantity',
      'dueDate',
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
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
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
    // Resolved on COMMIT — see `seedRows` above. The request's result is
    // captured when it succeeds but only handed back once the write is
    // durable, so a caller can never act on a value that a later abort undoes.
    const run = (store: string, fn: (s: IDBObjectStore) => IDBRequest) =>
      new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        const req = fn(tx.objectStore(store))
        let result: unknown
        req.onsuccess = () => {
          result = req.result
        }
        tx.oncomplete = () => resolve(result)
        tx.onerror = () =>
          reject(tx.error ?? new Error(`IndexedDB transaction failed for "${store}"`))
        tx.onabort = () =>
          reject(tx.error ?? new Error(`IndexedDB transaction aborted for "${store}"`))
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
