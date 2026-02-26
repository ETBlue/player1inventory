import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  createItem,
  createTag,
  createTagType,
  createVendor,
  getOrCreateActiveCart,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Shopping page', () => {
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

  const renderShoppingPage = () => {
    const history = createMemoryHistory({ initialEntries: ['/shopping'] })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see all active items sorted by name (default)', async () => {
    // Given three items with different names
    await createItem({
      name: 'Eggs',
      tagIds: [],
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    await createItem({
      name: 'Bread',
      tagIds: [],
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    await createItem({
      name: 'Milk',
      tagIds: [],
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })

    // When rendering the shopping page (default sort is 'name' ascending)
    renderShoppingPage()

    await waitFor(() => {
      expect(screen.getByText('Eggs')).toBeInTheDocument()
    })

    // Then items are sorted alphabetically: Bread < Eggs < Milk
    const cards = screen.getAllByRole('heading', { level: 3 })
    const names = cards.map((el) => el.textContent)
    expect(names.indexOf('Bread')).toBeLessThan(names.indexOf('Eggs'))
    expect(names.indexOf('Eggs')).toBeLessThan(names.indexOf('Milk'))
  })

  it('user can add item to cart by checking checkbox', async () => {
    // Given an item and an active cart
    await createItem({
      name: 'Butter',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    await getOrCreateActiveCart()

    // When rendering the shopping page
    renderShoppingPage()

    await waitFor(() => {
      expect(screen.getByText('Butter')).toBeInTheDocument()
    })

    // When user checks the checkbox
    const user = userEvent.setup()
    const checkbox = screen.getByRole('checkbox', {
      name: /Add Butter/i,
    })
    await user.click(checkbox)

    // Then the item moves to the cart section
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Remove Butter/i }),
      ).toBeChecked()
    })
  })

  it('user can remove item from cart by unchecking checkbox', async () => {
    // Given an item already in cart
    const item = await createItem({
      name: 'Cheese',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    const cart = await getOrCreateActiveCart()
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cart.id,
      itemId: item.id,
      quantity: 1,
    })

    // When rendering the shopping page
    renderShoppingPage()

    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Remove Cheese/i }),
      ).toBeChecked()
    })

    // When user unchecks the checkbox
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: /Remove Cheese/i }))

    // Then the item is removed from cart
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Add Cheese/i }),
      ).not.toBeChecked()
    })
  })

  it('user can see inactive items always visible in pending section', async () => {
    // Given an inactive item (targetQuantity=0, currentQuantity=0)
    await createItem({
      name: 'Seasonal Jam',
      tagIds: [],
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })

    // When rendering the shopping page
    renderShoppingPage()

    // Then inactive items are always visible (no toggle needed)
    await waitFor(() => {
      expect(screen.getByText('Seasonal Jam')).toBeInTheDocument()
    })
  })

  it('checkout button is disabled when cart is empty', async () => {
    // When rendering the shopping page with no cart items
    renderShoppingPage()

    // Then checkout button is disabled
    await waitFor(() => {
      const checkoutBtn = screen.getByRole('button', {
        name: /Done/i,
      })
      expect(checkoutBtn).toBeDisabled()
    })
  })

  it('user can open abandon dialog by clicking cancel button', async () => {
    // Given an item in the cart
    const item = await createItem({
      name: 'Butter',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    const cart = await getOrCreateActiveCart()
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cart.id,
      itemId: item.id,
      quantity: 1,
    })

    // When rendering the shopping page and clicking Cancel
    renderShoppingPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Then the abandon dialog appears with the expected title
    await waitFor(() => {
      expect(
        screen.getByText('Abandon this shopping trip?'),
      ).toBeInTheDocument()
    })
  })

  it('user can dismiss abandon dialog without clearing cart', async () => {
    // Given an item in the cart
    const item = await createItem({
      name: 'Butter',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    const cart = await getOrCreateActiveCart()
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cart.id,
      itemId: item.id,
      quantity: 1,
    })

    // When rendering the shopping page
    renderShoppingPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument()
    })

    // When user clicks Cancel to open dialog, then clicks "Go back"
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => {
      expect(
        screen.getByText('Abandon this shopping trip?'),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /go back/i }))

    // Then the dialog closes and cart item is still present
    await waitFor(() => {
      expect(
        screen.queryByText('Abandon this shopping trip?'),
      ).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('checkbox', { name: /Remove Butter/i }),
    ).toBeInTheDocument()
  })

  it('user can abandon cart and stay on shopping page', async () => {
    // Given an item in the cart
    const item = await createItem({
      name: 'Butter',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    const cart = await getOrCreateActiveCart()
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cart.id,
      itemId: item.id,
      quantity: 1,
    })

    const history = createMemoryHistory({ initialEntries: ['/shopping'] })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument()
    })

    // When user clicks Cancel, then confirms Abandon
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => {
      expect(
        screen.getByText('Abandon this shopping trip?'),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /^abandon$/i }))

    // Then abandonCart was called (cart items removed) and route stays at /shopping
    await waitFor(() => {
      expect(
        screen.queryByRole('checkbox', { name: /Remove Butter/i }),
      ).not.toBeInTheDocument()
    })
    expect(router.state.location.pathname).toBe('/shopping')
  })

  it('user can open checkout dialog by clicking done button', async () => {
    // Given an item in the cart
    const item = await createItem({
      name: 'Butter',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    const cart = await getOrCreateActiveCart()
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cart.id,
      itemId: item.id,
      quantity: 1,
    })

    // When rendering the shopping page and clicking Done
    renderShoppingPage()
    const user = userEvent.setup()

    await waitFor(() => {
      const doneBtn = screen.getByRole('button', { name: /done/i })
      expect(doneBtn).not.toBeDisabled()
    })

    await user.click(screen.getByRole('button', { name: /done/i }))

    // Then the checkout dialog appears with the expected title
    await waitFor(() => {
      expect(screen.getByText('Complete shopping trip?')).toBeInTheDocument()
    })
  })

  it('user can dismiss checkout dialog without completing checkout', async () => {
    // Given an item in the cart
    const item = await createItem({
      name: 'Butter',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    const cart = await getOrCreateActiveCart()
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cart.id,
      itemId: item.id,
      quantity: 1,
    })

    // When rendering the shopping page
    renderShoppingPage()
    const user = userEvent.setup()

    await waitFor(() => {
      const doneBtn = screen.getByRole('button', { name: /done/i })
      expect(doneBtn).not.toBeDisabled()
    })

    // When user clicks Done to open dialog, then clicks "Go back"
    await user.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => {
      expect(screen.getByText('Complete shopping trip?')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /go back/i }))

    // Then the dialog closes and checkout was NOT called (cart item still present)
    await waitFor(() => {
      expect(
        screen.queryByText('Complete shopping trip?'),
      ).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('checkbox', { name: /Remove Butter/i }),
    ).toBeInTheDocument()
  })

  it('user can complete checkout and stay on shopping page', async () => {
    // Given an item in the cart
    const item = await createItem({
      name: 'Butter',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    const cart = await getOrCreateActiveCart()
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cart.id,
      itemId: item.id,
      quantity: 1,
    })

    const history = createMemoryHistory({ initialEntries: ['/shopping'] })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()

    await waitFor(() => {
      const doneBtn = screen.getByRole('button', { name: /done/i })
      expect(doneBtn).not.toBeDisabled()
    })

    // When user clicks Done, then confirms in dialog
    await user.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => {
      expect(screen.getByText('Complete shopping trip?')).toBeInTheDocument()
    })
    // Click the "Done" action button inside the dialog (AlertDialogAction)
    const dialogDoneBtn = screen.getByRole('button', { name: /^done$/i })
    await user.click(dialogDoneBtn)

    // Then checkout was called (cart items removed) and route stays at /shopping
    await waitFor(() => {
      expect(
        screen.queryByRole('checkbox', { name: /Remove Butter/i }),
      ).not.toBeInTheDocument()
    })
    expect(router.state.location.pathname).toBe('/shopping')
  })
})

describe('Shopping page tag filtering', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.vendors.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderShoppingPage = () => {
    const history = createMemoryHistory({ initialEntries: ['/shopping'] })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see the filters toggle button', async () => {
    // Given the shopping page
    renderShoppingPage()

    // Then the Filters toggle button is present
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /toggle filters/i }),
      ).toBeInTheDocument()
    })
  })

  it('user can show and hide the tag filter row', async () => {
    // Given a tag type with a tag exists
    const tagType = await createTagType({ name: 'Category', color: 'blue' })
    await createTag({ typeId: tagType.id, name: 'Dairy' })

    renderShoppingPage()
    const user = userEvent.setup()

    // When user clicks the Filters toggle
    const toggleBtn = await screen.findByRole('button', {
      name: /toggle filters/i,
    })
    await user.click(toggleBtn)

    // Then the tag filter row appears (Category dropdown visible)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /category/i }),
      ).toBeInTheDocument()
    })

    // When user clicks toggle again
    await user.click(toggleBtn)

    // Then the tag filter row is hidden
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /category/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('user can filter items by tag', async () => {
    // Given two items, one with a Dairy tag and one without
    const tagType = await createTagType({ name: 'Category', color: 'blue' })
    const dairyTag = await createTag({ typeId: tagType.id, name: 'Dairy' })

    await createItem({
      name: 'Milk',
      tagIds: [dairyTag.id],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await createItem({
      name: 'Bread',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    renderShoppingPage()
    const user = userEvent.setup()

    // When user opens filters and selects Dairy tag
    await user.click(
      await screen.findByRole('button', { name: /toggle filters/i }),
    )
    await user.click(await screen.findByRole('button', { name: /category/i }))
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: /dairy/i }),
    )

    // Then only Milk is shown, Bread is hidden
    await waitFor(() => {
      expect(screen.getByText('Milk')).toBeInTheDocument()
      expect(screen.queryByText('Bread')).not.toBeInTheDocument()
    })
  })

  it('user can filter by vendor and tag simultaneously', async () => {
    // Given three items: Milk (Dairy + Costco), Cheese (Dairy only), Bread (Costco only)
    const tagType = await createTagType({ name: 'Category', color: 'blue' })
    const dairyTag = await createTag({ typeId: tagType.id, name: 'Dairy' })
    const vendor = await createVendor('Costco')

    await createItem({
      name: 'Milk',
      tagIds: [dairyTag.id],
      vendorIds: [vendor.id],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await createItem({
      name: 'Cheese',
      tagIds: [dairyTag.id],
      vendorIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await createItem({
      name: 'Bread',
      tagIds: [],
      vendorIds: [vendor.id],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    renderShoppingPage()
    const user = userEvent.setup()

    // When user opens filters and selects Dairy tag
    await user.click(
      await screen.findByRole('button', { name: /toggle filters/i }),
    )
    await user.click(await screen.findByRole('button', { name: /category/i }))
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: /dairy/i }),
    )

    // Then the count shows 2 of 3 items (Dairy filter applied to all 3 items)
    // This proves tag filter is working
    await waitFor(() => {
      expect(screen.getByText(/showing 2 of 3 items/i)).toBeInTheDocument()
    })

    // When user also selects Costco vendor
    // jsdom doesn't implement pointer capture or scrollIntoView; polyfill them
    // so Radix UI Select can open without throwing
    window.HTMLElement.prototype.hasPointerCapture ??= () => false
    window.HTMLElement.prototype.setPointerCapture ??= () => {}
    window.HTMLElement.prototype.releasePointerCapture ??= () => {}
    window.HTMLElement.prototype.scrollIntoView ??= () => {}
    const vendorTrigger = screen.getByRole('combobox')
    await user.click(vendorTrigger)
    const costcoOption = await screen.findByRole('option', { name: /costco/i })
    await user.click(costcoOption)

    // Then the count shows 2 of 3 items (Dairy filter applied to all items — FilterStatus
    // counts are not scoped to the vendor selection, only the displayed list is)
    // This proves both vendor and tag filters are active simultaneously
    await waitFor(() => {
      expect(screen.getByText(/showing 2 of 3 items/i)).toBeInTheDocument()
    })
    // And Milk is visible (Dairy + Costco), Cheese and Bread are not
    expect(screen.getByText('Milk')).toBeInTheDocument()
    expect(screen.queryByText('Cheese')).not.toBeInTheDocument()
    expect(screen.queryByText('Bread')).not.toBeInTheDocument()
  })

  it('user can see empty list when all items are filtered out', async () => {
    // Given an item with a Dairy tag
    const tagType = await createTagType({ name: 'Category', color: 'blue' })
    const dairyTag = await createTag({ typeId: tagType.id, name: 'Dairy' })
    const _frozenTag = await createTag({ typeId: tagType.id, name: 'Frozen' })

    await createItem({
      name: 'Milk',
      tagIds: [dairyTag.id],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    renderShoppingPage()
    const user = userEvent.setup()

    // When user filters by Frozen tag (Milk doesn't have this tag)
    await user.click(
      await screen.findByRole('button', { name: /toggle filters/i }),
    )
    await user.click(await screen.findByRole('button', { name: /category/i }))
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: /frozen/i }),
    )

    // Then Milk is not shown
    await waitFor(() => {
      expect(screen.queryByText('Milk')).not.toBeInTheDocument()
    })
  })

  it('user can see item counts in vendor dropdown', async () => {
    // Given a vendor with 2 items
    const vendor = await createVendor('Costco')
    await createItem({
      name: 'Milk',
      vendorIds: [vendor.id],
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })
    await createItem({
      name: 'Eggs',
      vendorIds: [vendor.id],
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })

    renderShoppingPage()
    const user = userEvent.setup()

    // jsdom polyfills for Radix UI Select
    window.HTMLElement.prototype.hasPointerCapture ??= () => false
    window.HTMLElement.prototype.setPointerCapture ??= () => {}
    window.HTMLElement.prototype.releasePointerCapture ??= () => {}
    window.HTMLElement.prototype.scrollIntoView ??= () => {}

    // When user opens vendor dropdown
    const vendorTrigger = await screen.findByRole('combobox')
    await user.click(vendorTrigger)

    // Then vendor option should show count
    expect(
      await screen.findByRole('option', { name: /Costco.*2/i }),
    ).toBeInTheDocument()
  })

  it('user can see "Manage vendors..." option in dropdown', async () => {
    // Given a vendor exists
    await createVendor('Costco')

    renderShoppingPage()
    const user = userEvent.setup()

    // jsdom polyfills for Radix UI Select
    window.HTMLElement.prototype.hasPointerCapture ??= () => false
    window.HTMLElement.prototype.setPointerCapture ??= () => {}
    window.HTMLElement.prototype.releasePointerCapture ??= () => {}
    window.HTMLElement.prototype.scrollIntoView ??= () => {}

    // When user opens vendor dropdown
    const vendorTrigger = await screen.findByRole('combobox')
    await user.click(vendorTrigger)

    // Then "Manage vendors..." option appears in dropdown
    expect(
      await screen.findByRole('option', { name: /manage vendors/i }),
    ).toBeInTheDocument()
  })

  it('user can sort shopping items by name', async () => {
    // Given: two items exist in the pending section with different names
    await createItem({
      name: 'Zucchini',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    await createItem({
      name: 'Apple',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })

    // When: the page loads (default sort is 'name' ascending)
    renderShoppingPage()

    await waitFor(() => {
      expect(screen.getByText('Apple')).toBeInTheDocument()
      expect(screen.getByText('Zucchini')).toBeInTheDocument()
    })

    // Then: items appear in alphabetical order
    const cards = screen.getAllByRole('heading', { level: 3 })
    const names = cards.map((el) => el.textContent)
    expect(names.indexOf('Apple')).toBeLessThan(names.indexOf('Zucchini'))
  })

  it('user can navigate to vendor list from "Manage vendors..." option', async () => {
    // Given a vendor exists
    await createVendor('Costco')

    const history = createMemoryHistory({ initialEntries: ['/shopping'] })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()

    // jsdom polyfills for Radix UI Select
    window.HTMLElement.prototype.hasPointerCapture ??= () => false
    window.HTMLElement.prototype.setPointerCapture ??= () => {}
    window.HTMLElement.prototype.releasePointerCapture ??= () => {}
    window.HTMLElement.prototype.scrollIntoView ??= () => {}

    // When user opens vendor dropdown
    const vendorTrigger = await screen.findByRole('combobox')
    await user.click(vendorTrigger)

    // And clicks "Manage vendors..."
    const manageOption = await screen.findByRole('option', {
      name: /manage vendors/i,
    })
    await user.click(manageOption)

    // Then navigates to vendor list
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings/vendors')
    })
  })

  it('user can see vendor filter still works after adding "Manage vendors..." option', async () => {
    // Given two items with different vendors
    const vendor1 = await createVendor('Costco')
    const vendor2 = await createVendor("Trader Joe's")
    await createItem({
      name: 'Milk',
      vendorIds: [vendor1.id],
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await createItem({
      name: 'Bread',
      vendorIds: [vendor2.id],
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    renderShoppingPage()
    const user = userEvent.setup()

    // jsdom polyfills for Radix UI Select
    window.HTMLElement.prototype.hasPointerCapture ??= () => false
    window.HTMLElement.prototype.setPointerCapture ??= () => {}
    window.HTMLElement.prototype.releasePointerCapture ??= () => {}
    window.HTMLElement.prototype.scrollIntoView ??= () => {}

    // When user opens vendor dropdown and selects Costco
    const vendorTrigger = await screen.findByRole('combobox')
    await user.click(vendorTrigger)
    const costcoOption = await screen.findByRole('option', { name: /costco/i })
    await user.click(costcoOption)

    // Then only Milk is shown
    await waitFor(() => {
      expect(screen.getByText('Milk')).toBeInTheDocument()
      expect(screen.queryByText('Bread')).not.toBeInTheDocument()
    })
  })
})
