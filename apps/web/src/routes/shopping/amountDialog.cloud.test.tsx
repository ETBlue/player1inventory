import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import {
  CLOUD_LOCATIONS,
  cloudItem,
  cloudStock,
  cloudVendor,
  LOC_A,
} from '@/test/cloudFixtures'
import {
  cloudServer,
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'

// The cart amount dialog in CLOUD mode
// (docs/features/shopping/2026-11-25-cart-amount-dialog-design.md): each
// Save sends exactly one mutation, with the amount in the field.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const COSTCO = cloudVendor('vendor-costco', 'Costco')
const CART_ID = `${LOC_A}:vendor-costco`
const MILK = cloudItem('item-milk', 'Milk', { vendorIds: ['vendor-costco'] })
const EGGS = cloudItem('item-eggs', 'Eggs', { vendorIds: ['vendor-costco'] })
const stockHere = (itemId: string) =>
  cloudStock(`stock-${itemId}`, itemId, LOC_A, {
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 1,
    unpackedQuantity: 0,
  })
// Eggs are already in the cart; Milk is not.
const EGGS_IN_CART = {
  __typename: 'CartItem' as const,
  id: 'cart-item-eggs',
  cartId: CART_ID,
  itemId: 'item-eggs',
  quantity: 1,
}

describe('Cart page - the cart amount dialog in cloud mode', () => {
  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    sessionStorage.clear()
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    cloudServer.queries.useGetItemsQuery = { items: [MILK, EGGS] }
    cloudServer.queries.usePantryDataQuery = {
      items: [MILK, EGGS],
      itemStocks: [stockHere('item-milk'), stockHere('item-eggs')],
    }
    cloudServer.queries.useGetVendorsQuery = { vendors: [COSTCO] }
    cloudServer.queries.useGetTagsQuery = { tags: [] }
    cloudServer.queries.useGetTagTypesQuery = { tagTypes: [] }
    cloudServer.queries.useGetRecipesQuery = { recipes: [] }
    cloudServer.queries.useVendorCartQuery = {
      vendorCart: { __typename: 'Cart', id: CART_ID, lastPurchasedAt: null },
    }
    cloudServer.queries.useCartItemsQuery = { cartItems: [EGGS_IN_CART] }
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  function renderCart() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/shopping/vendor-costco'],
      }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can set a cart amount to 10 and the server gets one update', async () => {
    const user = userEvent.setup()
    // Given Eggs in the cart with 1 pack
    renderCart()

    // When the user opens the amount, steps up twice, types 10 and saves
    await user.click(
      await screen.findByRole('button', { name: /^Edit amount of Eggs/ }),
    )
    const dialog = await screen.findByRole('dialog')
    const increase = within(dialog).getByRole('button', {
      name: 'Increase amount',
    })
    await user.click(increase)
    await user.click(increase)
    const field = within(dialog).getByRole('spinbutton', { name: /^Buy/ })
    await user.clear(field)
    await user.type(field, '10')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    // Then ONE update with 10 was sent, and the dialog closed
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(cloudServer.calls.useUpdateCartItemMutation).toEqual([
      { id: 'cart-item-eggs', quantity: 10 },
    ])
  })

  it('user can tick an item and the server gets one add with the suggested amount', async () => {
    const user = userEvent.setup()
    // Given Milk not in the cart (target 4, 1 in stock)
    renderCart()

    // When the user ticks it and saves the suggested amount
    await user.click(await screen.findByRole('checkbox', { name: 'Add Milk' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('spinbutton', { name: /^Buy/ }),
    ).toHaveValue(3)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    // Then ONE add with 3 was sent
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(cloudServer.calls.useAddToCartMutation).toEqual([
      { cartId: CART_ID, itemId: 'item-milk', quantity: 3 },
    ])
  })

  it('user can cancel ticking an item, and nothing is sent', async () => {
    const user = userEvent.setup()
    // Given Milk not in the cart
    renderCart()

    // When the user ticks it and presses Cancel
    await user.click(await screen.findByRole('checkbox', { name: 'Add Milk' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    // Then nothing was sent, and Milk is still unticked
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(cloudServer.calls.useAddToCartMutation).toBeUndefined()
    expect(screen.getByRole('checkbox', { name: 'Add Milk' })).not.toBeChecked()
  })
})
