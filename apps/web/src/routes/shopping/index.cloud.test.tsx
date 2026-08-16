import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '@/routeTree.gen'

// Cloud carts have **bare** ids (`'no-vendor'` / `<vendorId>`) — the server keys
// them that way and PR D did not change it (ItemStock/locations are deferred in
// the cloud). Only local Dexie carts carry the `${locationId}:` prefix. These
// tests pin the shopping index to matching cloud cart ids un-prefixed, so the
// pack/checked stats keep rendering for cloud users (PR D review C-1).

const emptyQuery = { data: undefined, loading: false, error: undefined }

const mockUseGetItemsQuery = vi.fn()
const mockUseGetVendorsQuery = vi.fn()
const mockUseAllCartsQuery = vi.fn()
const mockUseAllCartItemsQuery = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetItemsQuery: () => mockUseGetItemsQuery(),
    useGetVendorsQuery: () => mockUseGetVendorsQuery(),
    useAllCartsQuery: () => mockUseAllCartsQuery(),
    useAllCartItemsQuery: () => mockUseAllCartItemsQuery(),
    useGetTagsQuery: () => emptyQuery,
    useGetTagTypesQuery: () => emptyQuery,
    useGetRecipesQuery: () => emptyQuery,
    useLastPurchaseDatesQuery: () => emptyQuery,
  }
})

const CLOUD_VENDOR = { id: 'vendor-costco', name: 'Costco' }

const CLOUD_ITEM = {
  id: 'item-flour',
  name: 'Flour',
  tagIds: [],
  vendorIds: [CLOUD_VENDOR.id],
  targetUnit: 'package',
  targetQuantity: 10,
  refillThreshold: 2,
  packedQuantity: 5,
  unpackedQuantity: 0,
  consumeAmount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

// Bare cart id — exactly what apps/server/src/resolvers/cart.resolver.ts returns.
const CLOUD_CART = {
  id: CLOUD_VENDOR.id,
  completedAt: null,
  lastPurchasedAt: null,
}

const CLOUD_CART_ITEM = {
  id: 'cart-item-1',
  cartId: CLOUD_CART.id,
  itemId: CLOUD_ITEM.id,
  quantity: 3,
}

describe('Shopping index page — cloud mode', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetItemsQuery.mockReturnValue({
      ...emptyQuery,
      data: { items: [CLOUD_ITEM] },
      networkStatus: 7,
      refetch: vi.fn(),
    })
    mockUseGetVendorsQuery.mockReturnValue({
      ...emptyQuery,
      data: { vendors: [CLOUD_VENDOR] },
    })
    mockUseAllCartsQuery.mockReturnValue({
      ...emptyQuery,
      data: { allCarts: [CLOUD_CART] },
    })
    mockUseAllCartItemsQuery.mockReturnValue({
      ...emptyQuery,
      data: { allCartItems: [CLOUD_CART_ITEM] },
    })
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
    vi.clearAllMocks()
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

  it('user can see cart pack totals on a vendor card in cloud mode', async () => {
    // Given a cloud cart (bare id) holding 3 packs of a Costco item
    renderShoppingIndex()

    // Then the vendor card shows the pack badge for that cloud cart
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
    expect(await screen.findByText(/3 packs/i)).toBeInTheDocument()
  })

  it('user can see the checked-item count on a vendor card in cloud mode', async () => {
    // Given a cloud cart with one checked item (quantity > 0)
    renderShoppingIndex()

    // Then the card metadata reports it as in the cart
    expect(await screen.findByText(/1 in cart/i)).toBeInTheDocument()
  })
})
