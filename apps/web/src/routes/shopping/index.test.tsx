import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { addToCart, createItem, createVendor } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { cartIdFor, DEFAULT_LOCATION_ID } from '@/types'

describe('Shopping index page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
    await db.vendors.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderShoppingIndex = () => {
    const history = createMemoryHistory({ initialEntries: ['/shopping'] })
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see the shopping page title', async () => {
    // Given an empty database
    renderShoppingIndex()

    // Then at least one Shopping text is visible (toolbar title + nav links)
    const shoppingElements = await screen.findAllByText(/shopping/i)
    expect(shoppingElements.length).toBeGreaterThan(0)
  })

  it('user can see vendor names in the cart list', async () => {
    // Given two vendors exist
    await createVendor('Costco')
    await createVendor('iHerb')

    renderShoppingIndex()

    // Then both vendor names are displayed
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
    expect(await screen.findByText(/iherb/i)).toBeInTheDocument()
  })

  it('user can see no-vendor card when items have no vendor', async () => {
    // Given an item with no vendor assigned
    await createItem({
      name: 'Unassigned Item',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    renderShoppingIndex()

    // Then the no-vendor card is visible
    expect(await screen.findByText(/no vendor/i)).toBeInTheDocument()
  })

  it('user does not see no-vendor card when all items have vendors', async () => {
    // Given a vendor and items all assigned to it
    const vendor = await createVendor('Costco')
    await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    renderShoppingIndex()

    // Then Costco is visible
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()

    // And the no-vendor card is NOT visible
    const noVendorTexts = screen.queryAllByText(/no vendor/i)
    expect(noVendorTexts).toHaveLength(0)
  })

  it('user can see no-vendor card counts only items with no vendor (regression: imported backup cart)', async () => {
    // Reproduces the bug where a backup imported before vendor-carts existed creates a
    // single no-vendor cart containing items that belong to vendors. The no-vendor card
    // should only count items that actually have no vendor, matching what the cart page shows.

    // Given a vendor + two items: one assigned to Costco, one with no vendor
    const vendor = await createVendor('Costco')
    const milkWithVendor = await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const centrumNoVendor = await createItem({
      name: 'Centrum',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    // Both items added to the no-vendor cart (simulating a pre-vendor-carts backup import)
    await db.shoppingCarts.put({ id: cartIdFor(DEFAULT_LOCATION_ID, null) })
    await addToCart(cartIdFor(DEFAULT_LOCATION_ID, null), milkWithVendor.id, 3) // vendor-assigned item, qty > 0
    await addToCart(cartIdFor(DEFAULT_LOCATION_ID, null), centrumNoVendor.id, 1) // no-vendor item, qty > 0

    renderShoppingIndex()

    // Then the no-vendor card shows "1 item · 1 in cart" (only Centrum counts)
    // NOT "1 item · 2 in cart" which was the bug
    expect(await screen.findByText(/1 item · 1 in cart/)).toBeInTheDocument()
    expect(screen.queryByText(/1 item · 2 in cart/)).not.toBeInTheDocument()
  })

  it('user can see cart with checked items reflected in vendor card', async () => {
    // Given a vendor with an item in its cart
    const vendor = await createVendor('Costco')
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await addToCart(cartIdFor(DEFAULT_LOCATION_ID, vendor.id), item.id, 2)

    renderShoppingIndex()

    // Then Costco vendor card is visible
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
  })

  it('last purchased sort orders vendor cards by most recently completed cart', async () => {
    // Given two vendors: Costco and iHerb
    const costco = await createVendor('Costco')
    const iherb = await createVendor('iHerb')

    // Costco: older lastPurchasedAt; iHerb: newer lastPurchasedAt
    const olderDate = new Date('2025-01-01T00:00:00Z')
    const newerDate = new Date('2025-06-01T00:00:00Z')
    await db.shoppingCarts.update(cartIdFor(DEFAULT_LOCATION_ID, costco.id), {
      lastPurchasedAt: olderDate,
    })
    await db.shoppingCarts.update(cartIdFor(DEFAULT_LOCATION_ID, iherb.id), {
      lastPurchasedAt: newerDate,
    })

    // Render shopping index with ?sort=recent
    const history = createMemoryHistory({
      initialEntries: ['/shopping?sort=recent&dir=desc'],
    })
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // Assert iHerb appears before Costco (more recently purchased)
    const iherbEl = await screen.findByText(/iherb/i)
    const costcoEl = await screen.findByText(/costco/i)
    expect(iherbEl.compareDocumentPosition(costcoEl)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('vendor card shows updated item count after user adds item in vendor cart and returns to shopping page (regression)', async () => {
    // Given: a vendor with one item, no active cart yet
    const vendor = await createVendor('PX Mart')
    await createItem({
      name: 'Pineapple Cake',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    // Mount the full app starting at /shopping (uses the full routeTree + shared queryClient)
    const history = createMemoryHistory({ initialEntries: ['/shopping'] })
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // 1. Vendor card appears — no items in cart yet
    expect(await screen.findByText(/px mart/i)).toBeInTheDocument()

    // 2. Navigate to the vendor cart
    history.push(`/shopping/${vendor.id}`)

    // 3. Wait for the vendor cart page to appear
    expect(await screen.findByText(/pineapple cake/i)).toBeInTheDocument()

    // 4. Add item to cart — wait for cart to resolve (checkbox disabled until cart loads)
    const checkbox = screen.getByRole('checkbox', { name: /pineapple cake/i })
    await waitFor(() => expect(checkbox).not.toBeDisabled())
    await userEvent.click(checkbox)
    expect(await screen.findByText(/1 pack/i)).toBeInTheDocument()

    // 5. Navigate back to shopping index
    history.push('/shopping')

    // 6. Vendor card must now show updated count — this is the regression assertion
    await waitFor(
      () => {
        expect(screen.getByText(/1 item · 1 in cart/)).toBeInTheDocument()
      },
      { timeout: 3000 },
    )
  })

  it('vendor card counts only items in its own cart, not items from the null-vendor cart (regression)', async () => {
    // Reproduces the bug where a null-vendor cart (from a pre-vendor-carts backup import)
    // contains a vendor-assigned item. The vendor card should show 0 checked items —
    // only the vendor's own cart items count toward the vendor card stats.

    // Given: a Costco vendor with one item, and a no-vendor cart that also contains that item
    const vendor = await createVendor('Costco')
    const milk = await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    // Null-vendor cart (simulates imported backup with 7 packs)
    await db.shoppingCarts.put({ id: cartIdFor(DEFAULT_LOCATION_ID, null) })
    await addToCart(cartIdFor(DEFAULT_LOCATION_ID, null), milk.id, 7)

    renderShoppingIndex()

    // Then the Costco vendor card shows 0 checked (no Costco cart exists with items)
    // NOT "1 item · 1 in cart (7 packs)" — those belong to the null-vendor cart
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
    expect(screen.queryByText(/1 item · 1 in cart/)).not.toBeInTheDocument()
    expect(screen.queryByText(/7 packs/i)).not.toBeInTheDocument()
  })
})
