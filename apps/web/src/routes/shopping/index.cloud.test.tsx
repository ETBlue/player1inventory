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

// A cloud item with targetQuantity: 0 — real user data (the item is simply
// inactive), not the "not stocked here" ZERO_STOCK trap local items hit. Cloud
// has no Location/ItemStock backend, so a cloud item never carries a stockId;
// the inactive segment must stay hidden and the vendor count must stay global.
const CLOUD_ITEM_INACTIVE = {
  ...CLOUD_ITEM,
  id: 'item-expired-snack',
  name: 'Expired Snack',
  targetQuantity: 0,
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

  it('vendor card stays visible in cloud mode as long as it has any globally-assigned item (no location gate)', async () => {
    // Given a second cloud vendor with zero items assigned anywhere, alongside
    // Costco which has one item (CLOUD_ITEM, seeded in beforeEach). Cloud has
    // no locations, so the gate must fall back to the global count — a cloud
    // user must not lose a vendor they can still shop just because this page
    // now hides zero-count vendors.
    const EMPTY_VENDOR = { id: 'vendor-empty', name: 'Empty Mart' }
    mockUseGetVendorsQuery.mockReturnValue({
      ...emptyQuery,
      data: { vendors: [CLOUD_VENDOR, EMPTY_VENDOR] },
    })

    renderShoppingIndex()

    // Then Costco (global count 1) still renders...
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
    // ...while Empty Mart (global count 0) is hidden — same rule as local mode,
    // just evaluated against the global count instead of a location-scoped one.
    expect(screen.queryByText(/empty mart/i)).not.toBeInTheDocument()
  })

  it('vendor card keeps the global item count and omits the inactive segment in cloud mode, even for a targetQuantity: 0 item', async () => {
    // Given two Costco items in cloud mode: one active, one with targetQuantity: 0.
    // Cloud items never carry a stockId, so the location-scoped inactive count
    // must not apply here — the count stays global and no inactive segment shows.
    mockUseGetItemsQuery.mockReturnValue({
      ...emptyQuery,
      data: { items: [CLOUD_ITEM, CLOUD_ITEM_INACTIVE] },
      networkStatus: 7,
      refetch: vi.fn(),
    })

    renderShoppingIndex()

    // Then the card shows the global count of 2 items and 1 in cart, with no
    // inactive segment anywhere on the page.
    expect(await screen.findByText(/2 items · 1 in cart/)).toBeInTheDocument()
    expect(screen.queryByText(/inactive/)).not.toBeInTheDocument()
  })
})
