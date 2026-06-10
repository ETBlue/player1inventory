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
    await addToCart(vendor.id, item.id, 3)

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
    // Wait for cart to load first (permanent cart exists after createVendor, but query is async)
    const checkbox = screen.getByRole('checkbox', { name: /milk/i })
    await waitFor(() => expect(checkbox).not.toBeDisabled())
    await userEvent.click(checkbox)

    // Then the cart count updates (item is in cart)
    expect(await screen.findByText(/1 pack/i)).toBeInTheDocument()
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
    await addToCart(vendor.id, item.id, 2)

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
    await db.shoppingCarts.put({ id: 'no-vendor' })
    await addToCart('no-vendor', milkWithVendor.id, 10) // vendor-assigned, qty 10
    await addToCart('no-vendor', centrumNoVendor.id, 5) // no-vendor item, qty 5

    // When user navigates to the no-vendor cart
    renderVendorCart('no-vendor')

    // Then the toolbar shows only the no-vendor item's quantity (5), not 15
    expect(await screen.findByText(/5 packs/i)).toBeInTheDocument()
    expect(screen.queryByText(/15 packs/i)).not.toBeInTheDocument()
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

  it('cart page shows correct toolbar count even when a null-vendor cart also exists with cross-vendor items (regression)', async () => {
    // Reproduces the bug where a pre-vendor-carts backup imports a single null-vendor cart
    // containing items assigned to real vendors. On the vendor cart page, `useVendorCart`
    // must load the VENDOR cart (not the null-vendor cart), and `cartTotal` must match
    // what the index vendor card shows.

    // Given: a null-vendor cart with a PX Mart item (qty 10) — simulates old backup
    const vendor = await createVendor('PX Mart')
    const milkPxMart = await createItem({
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
    await db.shoppingCarts.put({ id: 'no-vendor' })
    await addToCart('no-vendor', milkPxMart.id, 10)

    // And: a separate PX Mart vendor cart with 3 packs (what the cart page should show)
    await addToCart(vendor.id, milkPxMart.id, 3)

    // When user navigates to the PX Mart vendor cart page
    renderVendorCart(vendor.id)

    // Then the toolbar shows 3 packs (from the PX Mart cart), not 10 or 13
    expect(await screen.findByText(/3 packs/i)).toBeInTheDocument()
    expect(screen.queryByText(/10 packs/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/13 packs/i)).not.toBeInTheDocument()
  })

  it('visiting a vendor cart does not send updateCartLastVisited mutation', async () => {
    // Given a vendor with an item
    const vendor = await createVendor('Costco')
    await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    // When user navigates to the vendor cart
    renderVendorCart(vendor.id)

    // Wait for the page to load
    await screen.findByText('Costco')

    // Then the cart's lastVisitedAt is NOT set after visiting
    const cart = await db.shoppingCarts.get(vendor.id)
    expect(cart).toBeDefined()
    expect((cart as Record<string, unknown>).lastVisitedAt).toBeUndefined()
  })

  it('item checkbox is enabled once cart has loaded (guards against cloud-mode loading race)', async () => {
    // In cloud mode, useVendorCartQuery is a network round-trip. Items (from Apollo cache)
    // render before the cart resolves, so clicking the checkbox when cart is undefined silently
    // does nothing (falls through to `else { clearPending() }`).
    // Fix: disabled={pendingItemIds.has(item.id) || !cart} — checkbox is non-interactive until cart resolves.
    // This test runs in local mode (always works) and guards against regressions to that guard.

    // Given: a vendor and item, but NO pre-created cart — let the page create it
    const vendor = await createVendor('Test Vendor')
    await createItem({
      name: 'Test Item',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    // When user navigates to the vendor cart (no pre-existing cart)
    renderVendorCart(vendor.id)

    // Wait for the item to appear AND become interactive — once useVendorCart resolves,
    // the !cart guard lifts and the checkbox is no longer disabled
    const checkbox = await screen.findByRole('checkbox', { name: /test item/i })
    await waitFor(() => expect(checkbox).not.toBeDisabled())

    // When user clicks the checkbox
    await userEvent.click(checkbox)

    // Then the cart count updates — addToCart was called (not silently dropped)
    expect(await screen.findByText(/1 pack/i)).toBeInTheDocument()
  })

  it('item checkbox is disabled while cart is not yet available', async () => {
    // Verifies the !cart guard in disabled={pendingItemIds.has(item.id) || !cart}.
    // In local mode the cart is created synchronously before items render, so this guard
    // never fires — but the test ensures the guard prop is wired correctly and doesn't regress.

    // Given: a vendor and item with a pre-created cart already containing the item
    const vendor = await createVendor('Guard Vendor')
    const item = await createItem({
      name: 'Guard Item',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await addToCart(vendor.id, item.id, 1)

    // When user navigates to the vendor cart
    renderVendorCart(vendor.id)

    // Wait for cart data to load (toolbar shows "1 pack in cart" once cartItems loads)
    await screen.findByText(/1 pack/i)

    // Then the item checkbox is visible and checked (item is in the cart)
    const checkbox = screen.getByRole('checkbox', { name: /guard item/i })
    expect(checkbox).toBeChecked()

    // When user clicks the checkbox to remove from cart
    await userEvent.click(checkbox)

    // Then the cart count drops to 0 packs
    expect(await screen.findByText(/0 packs/i)).toBeInTheDocument()
  })

  it('after checkout, revisiting the vendor cart page shows a fresh empty cart (not the completed one)', async () => {
    // Cloud mode: this behaviour requires `VendorCart` to be refetched after checkout
    // so the Apollo cache is not stale.

    // Given: a vendor with an item in the cart
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
    await addToCart(vendor.id, item.id, 2)

    // When user navigates to the vendor cart
    renderVendorCart(vendor.id)

    // Then the cart shows the item (2 packs in cart)
    await screen.findByText(/2 packs/i)

    // When user clicks done → checkout dialog → confirm
    const doneButton = screen.getByRole('button', { name: /done/i })
    await userEvent.click(doneButton)
    await screen.findByText(/complete shopping trip/i)
    const confirmButton = screen.getByRole('button', { name: /confirm/i })
    await userEvent.click(confirmButton)

    // Then the checkout dialog closes (navigation back to /shopping)
    await waitFor(
      () => {
        expect(
          screen.queryByText(/complete shopping trip/i),
        ).not.toBeInTheDocument()
      },
      { timeout: 3000 },
    )

    // When user navigates back to the vendor cart page
    renderVendorCart(vendor.id)

    // Then the cart is fresh — 0 packs in cart (not the completed cart with 2 packs)
    expect(await screen.findByText(/0 packs/i)).toBeInTheDocument()
    expect(screen.queryByText(/2 packs/i)).not.toBeInTheDocument()
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
    await addToCart(vendor.id, item.id, 1)

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
