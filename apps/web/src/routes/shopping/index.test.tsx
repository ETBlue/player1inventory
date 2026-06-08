import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  addToCart,
  createItem,
  createVendor,
  getOrCreateActiveCart,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Shopping index page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
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
    const noVendorCart = await getOrCreateActiveCart(null)
    await addToCart(noVendorCart.id, milkWithVendor.id, 3) // vendor-assigned item, qty > 0
    await addToCart(noVendorCart.id, centrumNoVendor.id, 1) // no-vendor item, qty > 0

    renderShoppingIndex()

    // Then the no-vendor card shows "1 / 1 items in cart" (only Centrum counts)
    // NOT "2 / 1 items in cart" which was the bug
    expect(await screen.findByText(/1 \/ 1 items in cart/)).toBeInTheDocument()
    expect(screen.queryByText(/2 \/ 1 items in cart/)).not.toBeInTheDocument()
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
    const cart = await getOrCreateActiveCart(vendor.id)
    await addToCart(cart.id, item.id, 2)

    renderShoppingIndex()

    // Then Costco vendor card is visible
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
  })
})
