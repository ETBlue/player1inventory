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
import {
  addToCart,
  createItem,
  createVendor,
  getOrCreateActiveCart,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Vendor cart page', () => {
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

  const renderVendorCart = (vendorId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/shopping/${vendorId}`],
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
  }

  it('user can see vendor name in toolbar', async () => {
    // Given a vendor exists
    const vendor = await createVendor('Costco')

    // When user navigates to the vendor cart
    renderVendorCart(vendor.id)

    // Then the vendor name is shown in the toolbar
    expect(await screen.findByText('Costco')).toBeInTheDocument()
  })

  it('user can see cart items for the correct vendor', async () => {
    // Given a vendor with items in its cart
    const vendor = await createVendor('iHerb')
    const item = await createItem({
      name: 'Vitamin C',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const cart = await getOrCreateActiveCart(vendor.id)
    await addToCart(cart.id, item.id, 3)

    // When user navigates to the vendor cart
    renderVendorCart(vendor.id)

    // Then the item is visible (in cart or pending section)
    await waitFor(() => {
      expect(screen.getByText(/vitamin c/i)).toBeInTheDocument()
    })
  })

  it('user can toggle an item into the vendor cart', async () => {
    // Given a vendor with an item (not yet in cart)
    const vendor = await createVendor('Costco')
    await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    // When user navigates to the vendor cart
    renderVendorCart(vendor.id)

    // Then the item is visible in the pending section
    const milkText = await screen.findByText(/milk/i)
    expect(milkText).toBeInTheDocument()

    // When user clicks the item checkbox to add it to cart
    const checkbox = screen.getByRole('checkbox', { name: /milk/i })
    await userEvent.click(checkbox)

    // Then the cart count updates (item is in cart)
    expect(await screen.findByText(/1 pack in cart/i)).toBeInTheDocument()
  })

  it('user can checkout from the vendor cart', async () => {
    // Given a vendor with an item in the cart
    const vendor = await createVendor('Costco')
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const cart = await getOrCreateActiveCart(vendor.id)
    await addToCart(cart.id, item.id, 2)

    // When user navigates to the vendor cart
    renderVendorCart(vendor.id)

    // Then the done button is visible
    const doneButton = await screen.findByRole('button', { name: /done/i })
    expect(doneButton).toBeInTheDocument()

    // When user clicks done
    await userEvent.click(doneButton)

    // Then the checkout confirmation dialog appears
    expect(
      await screen.findByText(/complete shopping trip/i),
    ).toBeInTheDocument()

    // When user confirms checkout
    const confirmButton = screen.getByRole('button', { name: /confirm/i })
    await userEvent.click(confirmButton)

    // Then the user is navigated away (dialog closes)
    await waitFor(
      () => {
        expect(
          screen.queryByText(/complete shopping trip/i),
        ).not.toBeInTheDocument()
      },
      { timeout: 3000 },
    )
  })

  it('cart total in toolbar counts only vendor-scoped items (regression: imported backup cart)', async () => {
    // Reproduces the bug where a no-vendor cart imported from a pre-vendor-carts backup
    // contains items belonging to vendors. The toolbar "N packs in cart" should only count
    // items that belong to this vendor (no-vendor = items with no vendors), not all cart items.

    // Given: a no-vendor cart containing both a vendor-assigned item and a no-vendor item
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
    const noVendorCart = await getOrCreateActiveCart(null)
    await addToCart(noVendorCart.id, milkWithVendor.id, 10) // vendor-assigned, qty 10
    await addToCart(noVendorCart.id, centrumNoVendor.id, 5) // no-vendor item, qty 5

    // When user navigates to the no-vendor cart
    renderVendorCart('no-vendor')

    // Then the toolbar shows only the no-vendor item's quantity (5), not 15
    expect(await screen.findByText(/5 packs in cart/i)).toBeInTheDocument()
    expect(screen.queryByText(/15 packs in cart/i)).not.toBeInTheDocument()
  })

  it('vendor cart URL does not include legacy ?vendor= search param', async () => {
    // The validateSearch on this route used to carry over a legacy ?vendor= param from the
    // old single-cart shopping page. It was never used and auto-serialized to ?vendor= in the URL.

    // Given a vendor cart page is rendered
    const vendor = await createVendor('Costco')
    renderVendorCart(vendor.id)

    // When the page loads
    await screen.findByText('Costco')

    // Then the URL does not contain ?vendor=
    expect(window.location.search).not.toContain('vendor=')
  })

  it('user can abandon the vendor cart', async () => {
    // Given a vendor with an item in the cart
    const vendor = await createVendor('Costco')
    const item = await createItem({
      name: 'Eggs',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const cart = await getOrCreateActiveCart(vendor.id)
    await addToCart(cart.id, item.id, 1)

    // When user navigates to the vendor cart
    renderVendorCart(vendor.id)

    // Then the cancel button is visible
    const cancelButton = await screen.findByRole('button', { name: /cancel/i })
    expect(cancelButton).toBeInTheDocument()

    // When user clicks cancel
    await userEvent.click(cancelButton)

    // Then the abandon confirmation dialog appears
    expect(
      await screen.findByText(/abandon this shopping trip/i),
    ).toBeInTheDocument()

    // When user confirms abandoning
    const confirmButton = screen.getByRole('button', { name: /confirm/i })
    await userEvent.click(confirmButton)

    // Then the abandon dialog closes
    await waitFor(() => {
      expect(
        screen.queryByText(/abandon this shopping trip/i),
      ).not.toBeInTheDocument()
    })
  })
})
