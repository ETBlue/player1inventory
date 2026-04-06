import { test, expect } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
import { ItemPage } from '../pages/ItemPage'
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
    await shopping.addItemToCart('Test Yogurt')
    await shopping.clickDone()
    await shopping.confirmCheckout()
  } else {
    // Local mode: navigate first so Dexie initialises the schema, then seed IndexedDB directly.
    await pantry.navigateTo()

    const itemId = 'expiry-test-item-1'
    const cartId = 'expiry-test-cart-1'
    const cartItemId = 'expiry-test-cart-item-1'

    // Seed item (packedQuantity=0, no inventory logs) + active cart entry so the item
    // appears pre-checked in the shopping cart and can be checked out immediately.
    // No prior purchase history → no estimatedDueDate → badge is hidden before checkout.
    await page.evaluate(
      async ({ itemId, cartId, cartItemId }) => {
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

        // Active shopping cart
        await put('shoppingCarts', {
          id: cartId,
          status: 'active',
          createdAt: now,
        })

        // Cart item linking the item to the cart with quantity 1
        await put('cartItems', {
          id: cartItemId,
          cartId,
          itemId,
          quantity: 1,
        })
      },
      { itemId, cartId, cartItemId },
    )

    // Reload pantry after seeding so React Query fetches fresh data from the populated DB.
    await pantry.navigateTo()

    // Item is visible but no expiration badge (packedQuantity=0 → badge hidden)
    await expect(pantry.getItemCard('Test Yogurt')).toBeVisible()
    await expect(page.getByText(/Expires in \d+ days/)).not.toBeVisible()

    // Shopping: the item is pre-seeded into the active cart, so it appears checked already
    await shopping.navigateTo()
    const removeCheckbox = page.getByLabel('Remove Test Yogurt')
    await expect(removeCheckbox).toBeVisible()
    await shopping.clickDone()
    await shopping.confirmCheckout()
  }

  // Wait for the checkout to visually complete: the Done button becomes disabled
  // because the cart is now empty.
  await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled()

  // After checkout, navigate to pantry WITHOUT refreshing the page
  await pantry.navigateTo()

  // The expiration badge should now show the updated state based on today's purchase.
  // New expiry = today + 7 days → "Expires in 7 days" (within expirationThreshold=30 → warning badge).
  // Before the fix: cache staleness caused lastPurchaseDate to remain null → badge hidden.
  // After the fix: cache is evicted/invalidated → fresh fetch → badge visible.
  await expect(page.getByText(/Expires in \d+ days/)).toBeVisible()
})

test('user can checkout items from shopping cart', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)
  const shopping = new ShoppingPage(page)

  // Given: item "Test Milk" exists with 0 packed quantity (default)
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Test Milk')
  await item.save()
  // item.save() waits for navigation to /items/$id — packed quantity defaults to 0

  // When: navigate to shopping page, add item to cart, checkout
  await shopping.navigateTo()
  await shopping.addItemToCart('Test Milk')
  await shopping.clickDone()
  await shopping.confirmCheckout()

  // Then: cart is empty — Done button is disabled
  await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled()

  // And: navigate to pantry and open the item — packed quantity is now 1
  await pantry.navigateTo()
  await pantry.getItemCard('Test Milk').click()
  await expect(item.getPackedQuantityInput()).toHaveValue('1')
})

