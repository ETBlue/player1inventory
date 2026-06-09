import { test, expect } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { PantryPage } from '../pages/PantryPage'
import { ShoppingPage } from '../pages/ShoppingPage'
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
    // Cloud mode: delete all test data from MongoDB via the E2E cleanup endpoint.
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

        const put = (storeName: string, record: object) =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite')
            const req = tx.objectStore(storeName).put(record)
            req.onsuccess = () => resolve()
            req.onerror = () => reject(req.error)
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
    const put = (storeName: string, record: object) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        const req = tx.objectStore(storeName).put(record)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
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
    const put = (store: string, record: object) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        const req = tx.objectStore(store).put(record)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
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
    const put = (store: string, record: object) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        const req = tx.objectStore(store).put(record)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
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
    const put = (store: string, record: object) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        const req = tx.objectStore(store).put(record)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
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

test.describe('cloud mode vendor carts', () => {
  test('user can see vendor cart cards (cloud mode)', async ({ page, request, baseURL }) => {
    test.skip(!process.env.TEST_CLOUD_MODE, 'cloud mode only')
    const shopping = new ShoppingPage(page)
    const gql = makeGql(request)

    const { createVendor: vendorA } = await gql<{ createVendor: { id: string } }>(
      `mutation CreateVendor($name: String!) { createVendor(name: $name) { id } }`,
      { name: 'Cloud Vendor A' },
    )
    const { createVendor: vendorB } = await gql<{ createVendor: { id: string } }>(
      `mutation CreateVendor($name: String!) { createVendor(name: $name) { id } }`,
      { name: 'Cloud Vendor B' },
    )
    await gql(
      `mutation CreateItem($input: CreateItemInput!) { createItem(input: $input) { id } }`,
      { input: { name: 'Cloud Item A', vendorIds: [vendorA.id], targetQuantity: 1, refillThreshold: 1 } },
    )
    await gql(
      `mutation CreateItem($input: CreateItemInput!) { createItem(input: $input) { id } }`,
      { input: { name: 'Cloud Item B', vendorIds: [vendorB.id], targetQuantity: 1, refillThreshold: 1 } },
    )

    await shopping.navigateTo()

    await expect(shopping.getVendorCartCard('Cloud Vendor A')).toBeVisible()
    await expect(shopping.getVendorCartCard('Cloud Vendor B')).toBeVisible()
  })

  test('user can checkout from vendor cart in cloud mode', async ({ page, request, baseURL }) => {
    test.skip(!process.env.TEST_CLOUD_MODE, 'cloud mode only')
    const shopping = new ShoppingPage(page)
    const gql = makeGql(request)

    const { createVendor: vendor } = await gql<{ createVendor: { id: string } }>(
      `mutation CreateVendor($name: String!) { createVendor(name: $name) { id } }`,
      { name: 'Cloud Checkout Vendor' },
    )
    await gql(
      `mutation CreateItem($input: CreateItemInput!) { createItem(input: $input) { id } }`,
      { input: { name: 'Cloud Checkout Item', vendorIds: [vendor.id], targetQuantity: 1, refillThreshold: 1 } },
    )

    await shopping.navigateToVendorCart(vendor.id)
    await shopping.addItemToCart('Cloud Checkout Item')
    await shopping.clickDone()
    await shopping.confirmCheckout()

    await page.waitForURL(/\/shopping(\?|$)/)
  })
})
