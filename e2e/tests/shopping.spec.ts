import { test, expect } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { PantryPage } from '../pages/PantryPage'
import { ShoppingPage } from '../pages/ShoppingPage'
import { ensureCloudDefaultLocation } from '../helpers/cloudSeed'
import { splitInlineStock, relocateCarts } from '../helpers/locationSeed'
import { makeGql } from '../utils/cloud'

test.beforeEach(async ({ page, request, baseURL }) => {
  // Prevent empty-data redirect to /onboarding so tests can navigate freely.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  if (baseURL === CLOUD_WEB_URL) {
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
  }
})

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: delete all test data from the database via the E2E cleanup endpoint.
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
    return
  }
  // Local mode: clear IndexedDB, localStorage, and sessionStorage.
  // Navigate to the app origin so IndexedDB API is accessible, then clear all databases.
  // We must stay on the same origin to call indexedDB.databases().
  // Use onblocked to force-close any lingering connections before the delete proceeds.
  await page.goto('/')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map(({ name }) => {
      return new Promise<void>((resolve, reject) => {
        if (!name) { resolve(); return }
        const req = indexedDB.deleteDatabase(name)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
        // If existing connections block deletion, the blocked event fires.
        // We resolve anyway since the app will be reset on next navigation.
        req.onblocked = () => {
          console.warn(`[afterEach] IndexedDB delete blocked for "${name}" — data may persist`)
          resolve()
        }
      })
    }))
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('user can see expiration badge updated after checkout without manual refresh', async ({ page, request, baseURL }) => {
  const pantry = new PantryPage(page)
  const shopping = new ShoppingPage(page)

  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: seed "Test Yogurt" via GraphQL mutation (packedQuantity=0, no purchase history)
    const gql = makeGql(request)
    const { createItem: testItem } = await gql<{ createItem: { id: string } }>(
      `mutation CreateItem($input: CreateItemInput!) {
        createItem(input: $input) { id }
      }`,
      {
        input: {
          name: 'Test Yogurt',
          expirationMode: 'days from purchase',
          estimatedDueDays: 7,
          expirationThreshold: 30,
          packedQuantity: 0,
          targetQuantity: 1,
          refillThreshold: 1,
        },
      },
    )
    expect(testItem.id).toBeDefined()

    // Stock it in the account's default location. Since cloud-locations PR 2
    // the cloud pantry reads `PantryData` and shows only items with an
    // `ItemStock` row HERE — the raw `createItem` mutation writes the Item's
    // legacy inline columns and no stock row, so without this the item is
    // created and invisible. The app itself never takes this path:
    // `useCreateItem`'s cloud branch always follows the create with an
    // `upsertItemStock` (see apps/web/src/hooks/useItems.ts). This seed has to
    // do the same two steps to stand in for it.
    const { locations } = await gql<{
      locations: { id: string; isDefault: boolean }[]
    }>(`query { locations { id isDefault } }`, {})
    const defaultLocationId = (locations.find((l) => l.isDefault) ?? locations[0]).id
    await gql(
      `mutation Upsert($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
        upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
      }`,
      {
        itemId: testItem.id,
        locationId: defaultLocationId,
        input: { packedQuantity: 0, targetQuantity: 1, refillThreshold: 1 },
      },
    )

    // Pantry: item is visible but no expiration badge (no purchase yet → no lastPurchaseDate)
    await pantry.navigateTo()
    await expect(pantry.getItemCard('Test Yogurt')).toBeVisible()
    await expect(page.getByText(/Expires in \d+ days/)).not.toBeVisible()

    // Shopping: add to cart and checkout
    await shopping.navigateTo()
    await shopping.navigateToVendorCart('no-vendor')  // items with no vendor are in no-vendor cart
    await shopping.addItemToCart('Test Yogurt')
    await shopping.clickDone()
    await shopping.confirmCheckout()
  } else {
    // Local mode: navigate first so Dexie initialises the schema, then seed IndexedDB directly.
    await pantry.navigateTo()

    const itemId = 'expiry-test-item-1'
    const cartItemId = 'expiry-test-cart-item-1'
    // Permanent cart: ID = 'no-vendor' (the no-vendor permanent cart)

    // Seed item (packedQuantity=0, no inventory logs) + permanent no-vendor cart entry
    // so the item appears pre-checked in the shopping cart and can be checked out immediately.
    // No prior purchase history → no estimatedDueDate → badge is hidden before checkout.
    await page.evaluate(
      async ({ itemId, cartItemId }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('Player1Inventory')
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        })

        // Resolve on transaction COMMIT, not on request success — request
        // success fires while the transaction is still open, and the
        // navigation that follows a seed can abort an open transaction and
        // silently discard its rows.
        const put = (storeName: string, record: object) =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite')
            tx.objectStore(storeName).put(record)
            tx.oncomplete = () => resolve()
            tx.onerror = () =>
              reject(tx.error ?? new Error(`IndexedDB transaction failed for "${storeName}"`))
            tx.onabort = () =>
              reject(tx.error ?? new Error(`IndexedDB transaction aborted for "${storeName}"`))
          })

        const now = new Date()

        await put('items', {
          id: itemId,
          name: 'Test Yogurt',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 1,
          refillThreshold: 1,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
          expirationMode: 'days from purchase',
          estimatedDueDays: 7,
          expirationThreshold: 30,
          createdAt: now,
          updatedAt: now,
        })

        // Permanent no-vendor cart (cart ID = 'no-vendor')
        await put('shoppingCarts', { id: 'no-vendor' })

        // Cart item linking the item to the no-vendor permanent cart
        await put('cartItems', {
          id: cartItemId,
          cartId: 'no-vendor',
          itemId,
          quantity: 1,
        })
      },
      { itemId, cartItemId },
    )

    // Location PR D: migrate inline stock + raw-id carts to the new schema.
    await splitInlineStock(page)
    await relocateCarts(page)

    // Reload pantry after seeding so React Query fetches fresh data from the populated DB.
    await pantry.navigateTo()

    // Item is visible but no expiration badge (packedQuantity=0 → badge hidden)
    await expect(pantry.getItemCard('Test Yogurt')).toBeVisible()
    await expect(page.getByText(/Expires in \d+ days/)).not.toBeVisible()

    // Shopping: the item is pre-seeded into the active no-vendor cart
    await shopping.navigateTo()
    await shopping.navigateToVendorCart('no-vendor')  // items with no vendor are in no-vendor cart
    const removeCheckbox = page.getByLabel('Remove Test Yogurt')
    await expect(removeCheckbox).toBeVisible()
    await shopping.clickDone()
    await shopping.confirmCheckout()
  }

  // After checkout, the vendor cart page navigates back to the shopping index
  await page.waitForURL(/\/shopping(\?|$)/)

  // After checkout, navigate to pantry WITHOUT refreshing the page
  await pantry.navigateTo()

  // The expiration badge should now show the updated state based on today's purchase.
  // New expiry = today + 7 days → "Expires in 7 days" (within expirationThreshold=30 → warning badge).
  // Before the fix: cache staleness caused lastPurchaseDate to remain null → badge hidden.
  // After the fix: cache is evicted/invalidated → fresh fetch → badge visible.
  await expect(page.getByText(/Expires in \d+ days/)).toBeVisible()
})

test('user can checkout items from shopping cart', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'IndexedDB seeding not applicable in cloud mode')
  const pantry = new PantryPage(page)
  const shopping = new ShoppingPage(page)

  // Given: item "Test Milk" exists with 0 packed quantity (default), no vendor
  await pantry.navigateTo()

  const itemId = 'checkout-milk-item-1'

  await page.evaluate(async ({ itemId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    // Resolve on transaction COMMIT, not on request success — request
    // success fires while the transaction is still open, and the navigation
    // that follows a seed can abort an open transaction and silently discard
    // its rows.
    const put = (storeName: string, record: object) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        tx.objectStore(storeName).put(record)
        tx.oncomplete = () => resolve()
        tx.onerror = () =>
          reject(tx.error ?? new Error(`IndexedDB transaction failed for "${storeName}"`))
        tx.onabort = () =>
          reject(tx.error ?? new Error(`IndexedDB transaction aborted for "${storeName}"`))
      })
    const now = new Date()
    await put('items', {
      id: itemId,
      name: 'Test Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: now,
      updatedAt: now,
    })
  }, { itemId })

  await splitInlineStock(page)
  await relocateCarts(page)

  // When: navigate to no-vendor cart (Test Milk has no vendor), add to cart, checkout
  await shopping.navigateToVendorCart('no-vendor')
  await shopping.addItemToCart('Test Milk')
  await shopping.clickDone()
  await shopping.confirmCheckout()

  // Then: checkout navigates back to the shopping index
  await page.waitForURL(/\/shopping(\?|$)/)

  // And: navigate to pantry and verify the item card is visible
  await pantry.navigateTo()
  const itemCard = pantry.getItemCard('Test Milk')
  await expect(itemCard).toBeVisible()
})

test('user can see vendor cart cards on the shopping page', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'IndexedDB seeding not applicable in cloud mode')
  const pantry = new PantryPage(page)
  const shopping = new ShoppingPage(page)

  // Given: items exist assigned to two different vendors
  // Seed via IndexedDB directly (same pattern as test 1 local mode)
  await pantry.navigateTo()

  const vendorAId = 'vendor-a-e2e'
  const vendorBId = 'vendor-b-e2e'

  await page.evaluate(async ({ vendorAId, vendorBId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    // Resolve on transaction COMMIT, not on request success — request
    // success fires while the transaction is still open, and the navigation
    // that follows a seed can abort an open transaction and silently discard
    // its rows.
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
    const now = new Date()
    await put('vendors', { id: vendorAId, name: 'Costco E2E', createdAt: now, updatedAt: now })
    await put('vendors', { id: vendorBId, name: 'iHerb E2E', createdAt: now, updatedAt: now })
    await put('items', {
      id: 'item-a-e2e', name: 'Milk E2E', tagIds: [], vendorIds: [vendorAId],
      targetUnit: 'package', targetQuantity: 1, refillThreshold: 1,
      packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1,
      createdAt: now, updatedAt: now,
    })
    await put('items', {
      id: 'item-b-e2e', name: 'Vitamin C E2E', tagIds: [], vendorIds: [vendorBId],
      targetUnit: 'package', targetQuantity: 1, refillThreshold: 1,
      packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1,
      createdAt: now, updatedAt: now,
    })
  }, { vendorAId, vendorBId })

  await splitInlineStock(page)
  await relocateCarts(page)

  // When: navigate to shopping index
  await shopping.navigateTo()

  // Then: both vendor cart cards are visible
  await expect(shopping.getVendorCartCard('Costco E2E')).toBeVisible()
  await expect(shopping.getVendorCartCard('iHerb E2E')).toBeVisible()
})

test('user can navigate into a vendor cart and back to the list', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'IndexedDB seeding not applicable in cloud mode')
  const pantry = new PantryPage(page)
  const shopping = new ShoppingPage(page)

  await pantry.navigateTo()

  const vendorId = 'vendor-nav-e2e'
  await page.evaluate(async ({ vendorId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    // Resolve on transaction COMMIT, not on request success — request
    // success fires while the transaction is still open, and the navigation
    // that follows a seed can abort an open transaction and silently discard
    // its rows.
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
    const now = new Date()
    await put('vendors', { id: vendorId, name: 'Nav Vendor E2E', createdAt: now, updatedAt: now })
    await put('items', {
      id: 'item-nav-e2e', name: 'Nav Item E2E', tagIds: [], vendorIds: [vendorId],
      targetUnit: 'package', targetQuantity: 1, refillThreshold: 1,
      packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1,
      createdAt: now, updatedAt: now,
    })
  }, { vendorId })

  await splitInlineStock(page)
  await relocateCarts(page)

  // Navigate to shopping index
  await shopping.navigateTo()
  await expect(shopping.getVendorCartCard('Nav Vendor E2E')).toBeVisible()

  // Click into the vendor cart
  await shopping.clickVendorCartCard('Nav Vendor E2E')
  await expect(page).toHaveURL(/\/shopping\/.+/)

  // The vendor name appears in the toolbar
  await expect(page.getByText('Nav Vendor E2E')).toBeVisible()

  // Go back to the list
  await shopping.clickBack()
  await expect(page).toHaveURL(/\/shopping(\?|$)/)
  await expect(shopping.getVendorCartCard('Nav Vendor E2E')).toBeVisible()
})

test('user can checkout from a vendor cart without affecting another vendor cart', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'IndexedDB seeding not applicable in cloud mode')
  const pantry = new PantryPage(page)
  const shopping = new ShoppingPage(page)

  await pantry.navigateTo()

  const vendorAId = 'vendor-checkout-a'
  const vendorBId = 'vendor-checkout-b'

  await page.evaluate(async ({ vendorAId, vendorBId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    // Resolve on transaction COMMIT, not on request success — request
    // success fires while the transaction is still open, and the navigation
    // that follows a seed can abort an open transaction and silently discard
    // its rows.
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
    const now = new Date()
    await put('vendors', { id: vendorAId, name: 'Checkout Vendor A', createdAt: now, updatedAt: now })
    await put('vendors', { id: vendorBId, name: 'Checkout Vendor B', createdAt: now, updatedAt: now })
    await put('items', {
      id: 'checkout-item-a', name: 'Item A E2E', tagIds: [], vendorIds: [vendorAId],
      targetUnit: 'package', targetQuantity: 1, refillThreshold: 1,
      packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1,
      createdAt: now, updatedAt: now,
    })
    await put('items', {
      id: 'checkout-item-b', name: 'Item B E2E', tagIds: [], vendorIds: [vendorBId],
      targetUnit: 'package', targetQuantity: 1, refillThreshold: 1,
      packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1,
      createdAt: now, updatedAt: now,
    })
    // Pre-seed permanent vendor carts (cart ID = vendor ID) with items
    await put('shoppingCarts', { id: vendorAId })
    await put('shoppingCarts', { id: vendorBId })
    await put('cartItems', { id: 'ci-a-e2e', cartId: vendorAId, itemId: 'checkout-item-a', quantity: 1 })
    await put('cartItems', { id: 'ci-b-e2e', cartId: vendorBId, itemId: 'checkout-item-b', quantity: 1 })
  }, { vendorAId, vendorBId })

  await splitInlineStock(page)
  await relocateCarts(page)

  // Navigate to Vendor A's cart and checkout
  await shopping.navigateToVendorCart(vendorAId)
  await shopping.clickDone()
  await shopping.confirmCheckout()

  // After checkout: back on the index
  await page.waitForURL(/\/shopping(\?|$)/)

  // Vendor B's cart card is still visible (not affected by Vendor A checkout)
  await expect(shopping.getVendorCartCard('Checkout Vendor B')).toBeVisible()

  // Navigate to Vendor B's cart — item B is still there
  await shopping.navigateToVendorCart(vendorBId)
  await expect(page.getByLabel('Remove Item B E2E')).toBeVisible()
})

// Create a cloud item AND stock it at `locationId` — the two steps
// `useCreateItem`'s cloud branch performs (apps/web/src/hooks/useItems.ts).
// `createItem` alone writes the Item's legacy inline columns and no `ItemStock`
// row, so the item exists but is stocked nowhere and the pantry, the vendor
// cart page and the vendor card's count all leave it out.
async function createStockedItem(
  gql: ReturnType<typeof makeGql>,
  locationId: string,
  input: { name: string; vendorIds?: string[] },
): Promise<string> {
  const { createItem } = await gql<{ createItem: { id: string } }>(
    `mutation CreateItem($input: CreateItemInput!) { createItem(input: $input) { id } }`,
    { input: { targetQuantity: 1, refillThreshold: 1, ...input } },
  )
  await gql(
    `mutation Upsert($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
      upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
    }`,
    {
      itemId: createItem.id,
      locationId,
      input: { packedQuantity: 0, targetQuantity: 1, refillThreshold: 1 },
    },
  )
  return createItem.id
}

test.describe('cloud mode vendor carts', () => {
  test('user can see vendor cart cards (cloud mode)', async ({ page, request, baseURL }) => {
    test.skip(baseURL !== CLOUD_WEB_URL, 'cloud mode only')
    const shopping = new ShoppingPage(page)
    const gql = makeGql(request)

    // `createVendor(locationId:)` is `ID!` since cloud-locations PR 3b Task 4 —
    // the server pre-creates the vendor's cart AT that location, so the seed has
    // to name the one the app will be viewing.
    const home = await ensureCloudDefaultLocation(request)
    const CREATE_VENDOR = `mutation CreateVendor($name: String!, $locationId: ID!) {
      createVendor(name: $name, locationId: $locationId) { id }
    }`
    const { createVendor: vendorA } = await gql<{ createVendor: { id: string } }>(
      CREATE_VENDOR,
      { name: 'Cloud Vendor A', locationId: home.id },
    )
    const { createVendor: vendorB } = await gql<{ createVendor: { id: string } }>(
      CREATE_VENDOR,
      { name: 'Cloud Vendor B', locationId: home.id },
    )
    // Two steps per item, exactly as `useCreateItem`'s cloud branch does: the
    // raw `createItem` mutation writes the Item's legacy inline columns and NO
    // stock row, and since cloud-locations PR 3b this page is scoped to items
    // stocked in the ACTIVE location — an item with no `ItemStock` row here is
    // not listed. See the sibling seed at the top of this file.
    await createStockedItem(gql, home.id, {
      name: 'Cloud Item A',
      vendorIds: [vendorA.id],
    })
    await createStockedItem(gql, home.id, {
      name: 'Cloud Item B',
      vendorIds: [vendorB.id],
    })

    await shopping.navigateTo()

    await expect(shopping.getVendorCartCard('Cloud Vendor A')).toBeVisible()
    await expect(shopping.getVendorCartCard('Cloud Vendor B')).toBeVisible()
  })

  test('user can checkout from vendor cart in cloud mode', async ({ page, request, baseURL }) => {
    test.skip(baseURL !== CLOUD_WEB_URL, 'cloud mode only')
    const shopping = new ShoppingPage(page)
    const gql = makeGql(request)

    // See the note on the sibling test: `locationId` is required since PR 3b.
    const home = await ensureCloudDefaultLocation(request)
    const { createVendor: vendor } = await gql<{ createVendor: { id: string } }>(
      `mutation CreateVendor($name: String!, $locationId: ID!) {
        createVendor(name: $name, locationId: $locationId) { id }
      }`,
      { name: 'Cloud Checkout Vendor', locationId: home.id },
    )
    await createStockedItem(gql, home.id, {
      name: 'Cloud Checkout Item',
      vendorIds: [vendor.id],
    })

    await shopping.navigateToVendorCart(vendor.id)
    await shopping.addItemToCart('Cloud Checkout Item')
    await shopping.clickDone()
    await shopping.confirmCheckout()

    await page.waitForURL(/\/shopping(\?|$)/)
  })
})
