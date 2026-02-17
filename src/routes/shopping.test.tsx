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
import { createItem, getOrCreateActiveCart } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Shopping page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.inventoryLogs.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
    await db.vendors.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderShopping = () => {
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
    renderShopping()

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
    renderShopping()

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
    renderShopping()

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
    renderShopping()

    // Then inactive items are always visible (no toggle needed)
    await waitFor(() => {
      expect(screen.getByText('Seasonal Jam')).toBeInTheDocument()
    })
  })

  it('checkout button is disabled when cart is empty', async () => {
    // When rendering the shopping page with no cart items
    renderShopping()

    // Then checkout button is disabled
    await waitFor(() => {
      const checkoutBtn = screen.getByRole('button', {
        name: /Confirm purchase/i,
      })
      expect(checkoutBtn).toBeDisabled()
    })
  })
})
