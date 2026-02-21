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

  it('user can see all active items sorted by stock percentage', async () => {
    // Given three items with different stock levels
    await createItem({
      name: 'Eggs',
      tagIds: [],
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 2, // 20% — should be first
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    await createItem({
      name: 'Bread',
      tagIds: [],
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3, // 75% — should be last
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })
    await createItem({
      name: 'Milk',
      tagIds: [],
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 1, // 25% — should be second
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
    })

    // When rendering the shopping page
    renderShoppingPage()

    await waitFor(() => {
      expect(screen.getByText('Eggs')).toBeInTheDocument()
    })

    // Then items are sorted by stock percentage ascending
    const cards = screen.getAllByRole('heading', { level: 3 })
    const names = cards.map((el) => el.textContent)
    expect(names.indexOf('Eggs')).toBeLessThan(names.indexOf('Milk'))
    expect(names.indexOf('Milk')).toBeLessThan(names.indexOf('Bread'))
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
      name: /Add Butter to cart/i,
    })
    await user.click(checkbox)

    // Then the item moves to the cart section
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Remove Butter from cart/i }),
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
        screen.getByRole('checkbox', { name: /Remove Cheese from cart/i }),
      ).toBeChecked()
    })

    // When user unchecks the checkbox
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('checkbox', { name: /Remove Cheese from cart/i }),
    )

    // Then the item is removed from cart
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Add Cheese to cart/i }),
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

    // Then the count shows 1 of 2 items (Dairy filter applied to Costco's 2 items)
    // This proves both vendor and tag filters are active simultaneously
    await waitFor(() => {
      expect(screen.getByText(/showing 1 of 2 items/i)).toBeInTheDocument()
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
