import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, ensureDefaultLocationRow } from '@/db'
import { addToCart, createItem, createVendor } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { cartIdFor, DEFAULT_LOCATION_ID } from '@/types'

// What the shopping page sends to `checkout`, and what it does when the server
// answers `CART_CHANGED` (households H3b task B.5).
//
// The page renders from local Dexie data, but `useCheckout` is replaced, so
// the test can read the arguments and make the call fail the way the CLOUD
// server does. The cloud reload of the cart lives in the hook and is tested
// in `hooks/useShoppingCart.test.ts`; this file tests the page's half: the
// rows it sends, and the message it shows.
const mockCheckoutAsync = vi.fn()

vi.mock('@/hooks/useShoppingCart', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/hooks/useShoppingCart')>()
  return {
    ...original,
    useCheckout: () => ({
      mutate: vi.fn(),
      mutateAsync: mockCheckoutAsync,
      isPending: false,
    }),
  }
})

function cartChangedError() {
  return new CombinedGraphQLErrors({
    errors: [{ message: 'refused', extensions: { code: 'CART_CHANGED' } }],
  })
}

describe('Vendor cart page checkout', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.inventoryLogs.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
    await db.vendors.clear()
    await db.locations.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    await ensureDefaultLocationRow()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    mockCheckoutAsync.mockReset()
  })

  function renderVendorCart(vendorId: string) {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: [`/shopping/${vendorId}`],
      }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  async function seedCart() {
    const vendor = await createVendor('Costco')
    const base = {
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package' as const,
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
    }
    const milk = await createItem({ ...base, name: 'Milk' })
    const eggs = await createItem({ ...base, name: 'Eggs' })
    const cartId = cartIdFor(DEFAULT_LOCATION_ID, vendor.id)
    await addToCart(cartId, milk.id, 2)
    // A pinned row: in the cart, not being bought.
    await addToCart(cartId, eggs.id, 0)
    const milkRow = await db.cartItems.where({ itemId: milk.id }).first()
    if (!milkRow) throw new Error('fixture: milk cart row missing')
    return { vendor, cartId, milkRowId: milkRow.id }
  }

  async function confirmCheckout() {
    await screen.findByText(/2 packs/i)
    await userEvent.click(screen.getByRole('button', { name: /done/i }))
    await screen.findByText(/complete shopping trip/i)
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))
  }

  it('user checking out sends each row being bought, with the amount shown, and no stock total', async () => {
    // Given a cart with Milk at 2 and pinned Eggs
    const { vendor, cartId, milkRowId } = await seedCart()
    mockCheckoutAsync.mockResolvedValue(undefined)
    renderVendorCart(vendor.id)

    // When the user confirms checkout
    await confirmCheckout()

    // Then the page sends the Milk row by its cart row id and the amount it
    // showed. The pinned row is not sent.
    await waitFor(() => expect(mockCheckoutAsync).toHaveBeenCalledTimes(1))
    expect(mockCheckoutAsync.mock.calls[0]?.[0]).toMatchObject({
      cartId,
      items: [{ cartItemId: milkRowId, quantity: 2 }],
    })
  })

  it('user whose cart changed sees a message, and the dialog closes so they can check the cart', async () => {
    // Given the server refuses: the cart changed after this screen loaded
    const { vendor } = await seedCart()
    mockCheckoutAsync.mockRejectedValue(cartChangedError())
    const errorToast = vi.spyOn(toast, 'error')
    renderVendorCart(vendor.id)

    // When the user confirms checkout
    await confirmCheckout()

    // Then the page says what happened
    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith(
        'This cart changed. Please check and try again.',
      ),
    )
    // And the dialog closes, so the reloaded cart is in view
    await waitFor(() =>
      expect(
        screen.queryByText(/complete shopping trip/i),
      ).not.toBeInTheDocument(),
    )
  })

  it('any other failure keeps the dialog open and shows no cart-changed message', async () => {
    // A negative control for the test above: the message belongs to
    // CART_CHANGED only.
    const { vendor } = await seedCart()
    mockCheckoutAsync.mockRejectedValue(new Error('network down'))
    const errorToast = vi.spyOn(toast, 'error')
    renderVendorCart(vendor.id)

    await confirmCheckout()

    await waitFor(() => expect(mockCheckoutAsync).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/complete shopping trip/i)).toBeInTheDocument()
    expect(errorToast).not.toHaveBeenCalled()
  })
})
