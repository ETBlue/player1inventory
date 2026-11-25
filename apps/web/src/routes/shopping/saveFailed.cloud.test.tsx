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
import { watchUnhandledRejections } from '@/test/unhandledRejections'

// A failed save on the cart page, in CLOUD mode
// (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
//
// The generated mutation rejects with `FORBIDDEN` (not `CART_CHANGED`, which
// has its own message), and the cloud branch of the cart hook passes it on.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const SAVE_FAILED = 'Could not save the change. Please try again.'

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

describe('Cart page - a failed cloud save', () => {
  let rejections: ReturnType<typeof watchUnhandledRejections>

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
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  function renderCart(search = '') {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: [`/shopping/vendor-costco${search}`],
      }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  async function expectSaveFailedAndNoRejection() {
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    await rejections.settle()
    expect(rejections.list).toEqual([])
  }

  it('user sees a message when the server refuses an item created from search', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the new item
    cloudServer.failing.add('useCreateItemMutation')
    renderCart('?q=Butter')

    // When the user presses Create
    await user.click(await screen.findByRole('button', { name: 'Create item' }))

    // Then the write was sent, a message shows, and Create can be pressed again
    await expectSaveFailedAndNoRejection()
    expect(cloudServer.calls.useCreateItemMutation).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Create item' })).toBeEnabled()
  })

  it('user sees a message when the server refuses adding an item to the cart', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the add
    cloudServer.failing.add('useAddToCartMutation')
    renderCart()

    // When the user checks Milk and saves the suggested amount (target 4,
    // 1 in stock: 3)
    await user.click(await screen.findByRole('checkbox', { name: /milk/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    // Then ONE write was sent, the message shows in the dialog, which stays
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      SAVE_FAILED,
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
    expect(cloudServer.calls.useAddToCartMutation).toEqual([
      { cartId: CART_ID, itemId: 'item-milk', quantity: 3 },
    ])

    // And after Cancel, Milk is unchecked and can be pressed again
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /milk/i })).toBeEnabled(),
    )
    expect(screen.getByRole('checkbox', { name: /milk/i })).not.toBeChecked()
  })

  it('user sees a message when the server refuses removing an item from the cart', async () => {
    const user = userEvent.setup()
    // Given Eggs in the cart, and a server that refuses the remove
    cloudServer.failing.add('useRemoveFromCartMutation')
    renderCart()
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /eggs/i })).toBeChecked(),
    )

    // When the user unchecks Eggs
    await user.click(screen.getByRole('checkbox', { name: /eggs/i }))

    // Then the write was sent, a message shows, and Eggs stay checked
    await expectSaveFailedAndNoRejection()
    expect(cloudServer.calls.useRemoveFromCartMutation).toEqual([
      { id: 'cart-item-eggs' },
    ])
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /eggs/i })).toBeEnabled(),
    )
    expect(screen.getByRole('checkbox', { name: /eggs/i })).toBeChecked()
  })

  it('user sees a message when the server refuses a new amount in the cart', async () => {
    const user = userEvent.setup()
    // Given Eggs in the cart, and a server that refuses the update
    cloudServer.failing.add('useUpdateCartItemMutation')
    renderCart()

    // When the user raises the amount of Eggs to 2 in the dialog and saves
    await user.click(
      await screen.findByRole('button', { name: /^Edit amount of Eggs/ }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Increase amount' }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    // Then the write was sent, and a message shows in the dialog
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      SAVE_FAILED,
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
    expect(cloudServer.calls.useUpdateCartItemMutation).toEqual([
      { id: 'cart-item-eggs', quantity: 2 },
    ])
  })

  it('user sees a message when the server refuses to abandon the cart, and the dialog stays', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the abandon
    cloudServer.failing.add('useAbandonCartMutation')
    const router = renderCart()

    // When the user presses Cancel and confirms
    await user.click(await screen.findByRole('button', { name: /cancel/i }))
    await screen.findByText(/abandon this shopping trip/i)
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    // Then the write was sent, a message shows, and the dialog and the page stay
    await expectSaveFailedAndNoRejection()
    expect(cloudServer.calls.useAbandonCartMutation).toHaveLength(1)
    expect(screen.getByText(/abandon this shopping trip/i)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/shopping/vendor-costco')
  })

  it('user sees a message when the server refuses the checkout, and the dialog stays', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the checkout for a reason other than
    // CART_CHANGED
    cloudServer.failing.add('useCheckoutMutation')
    const router = renderCart()

    // When the user presses Done and confirms
    await user.click(await screen.findByRole('button', { name: /done/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /confirm/i }))

    // Then the checkout was sent with the row on screen, a message shows, and
    // the dialog and the page stay
    await expectSaveFailedAndNoRejection()
    expect(cloudServer.calls.useCheckoutMutation).toEqual([
      expect.objectContaining({
        cartId: CART_ID,
        items: [{ cartItemId: 'cart-item-eggs', quantity: 1 }],
      }),
    ])
    expect(screen.getByText(/complete shopping trip/i)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/shopping/vendor-costco')
  })
})
