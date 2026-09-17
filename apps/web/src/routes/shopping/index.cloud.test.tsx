import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import { CLOUD_LOCATIONS, LOC_A, LOC_B } from '@/test/cloudFixtures'
import { cartIdFor } from '@/types'

// The shopping index in CLOUD mode, after PR 3b re-keyed `Cart.id`.
//
// Two things changed here and both are load-bearing for these tests:
//   1. A cloud cart id is `${locationId}:${vendorId | 'no-vendor'}`, the same
//      shape local mode uses. It used to be the bare vendor id, and this file
//      used to pin that.
//   2. The "not stocked here" partition runs in cloud. It used to be switched
//      off (`!isCloud && …`) because a cloud `Cart` had no location.
//
// THE FIXTURE IS THE TEST. There are TWO locations, LOC_A (the default, and the
// active one) and LOC_B, and one vendor whose only item is stocked at LOC_B.
// With a single location, "stocked in the active location" and "exists at all"
// are the same set, so every assertion below would pass against code that
// ignored the location entirely.

const emptyQuery = { data: undefined, loading: false, error: undefined }

const mockUsePantryDataQuery = vi.fn()
const mockUseGetVendorsQuery = vi.fn()
const mockUseAllCartsQuery = vi.fn()
const mockUseAllCartItemsQuery = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  const mutationStub = () => [
    vi.fn().mockResolvedValue({ data: undefined }),
    {},
  ]
  return {
    ...original,
    // `useLocations` is dual-mode, so it calls `useGetLocationsQuery` in BOTH
    // modes (skipped in local). This per-file factory REPLACES the one in
    // `src/test/setup.ts` rather than layering on it, so the location stubs
    // have to be repeated here or the real Apollo hook runs and demands a
    // provider. Placed right after `...original` so this file's own overrides
    // below still win.
    //
    // It returns the REAL two-location list, unlike most cloud fixtures, so
    // `useCloudLocationKnown` accepts LOC_A and the location-scoped cloud reads
    // are not skipped.
    useGetLocationsQuery: () => ({
      ...emptyQuery,
      data: { locations: CLOUD_LOCATIONS },
    }),
    useCreateLocationMutation: mutationStub,
    useUpdateLocationMutation: mutationStub,
    useDeleteLocationMutation: mutationStub,
    useReorderLocationsMutation: mutationStub,
    // `ActiveLocationProvider` calls this on every render (Rules of Hooks).
    useBootstrapCartsMutation: mutationStub,
    usePantryDataQuery: () => mockUsePantryDataQuery(),
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
// Sells only an item stocked at LOC_B, so it sinks below the divider.
const ELSEWHERE_VENDOR = { id: 'vendor-bodega', name: 'Bodega' }

function cloudItem(
  id: string,
  name: string,
  vendorIds: string[],
  overrides: Record<string, unknown> = {},
) {
  return {
    __typename: 'Item' as const,
    id,
    name,
    tagIds: [],
    vendorIds,
    targetUnit: 'package',
    targetQuantity: 10,
    refillThreshold: 2,
    packedQuantity: 5,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function stockRow(
  itemId: string,
  locationId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    __typename: 'ItemStock' as const,
    id: `stock-${itemId}-${locationId}`,
    itemId,
    locationId,
    targetQuantity: 10,
    refillThreshold: 2,
    packedQuantity: 5,
    unpackedQuantity: 0,
    dueDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const FLOUR = cloudItem('item-flour', 'Flour', [CLOUD_VENDOR.id])
// Bodega's only item, stocked at LOC_B and NOT at LOC_A.
const COFFEE = cloudItem('item-coffee', 'Coffee', [ELSEWHERE_VENDOR.id])

// `PantryData(locationId: LOC_A)` returns every global item plus only LOC_A's
// stock rows — which is why Coffee has no row here.
function pantryData(items: ReturnType<typeof cloudItem>[]) {
  return {
    ...emptyQuery,
    data: {
      items,
      itemStocks: items
        .filter((i) => i.id !== COFFEE.id)
        .map((i) =>
          stockRow(i.id, LOC_A, { targetQuantity: i.targetQuantity }),
        ),
    },
    networkStatus: 7,
    refetch: vi.fn(),
  }
}

// Composite cart id — exactly what apps/server/src/resolvers/cart.resolver.ts
// returns since PR 3b.
const CLOUD_CART = {
  id: cartIdFor(LOC_A, CLOUD_VENDOR.id),
  lastPurchasedAt: null,
}

const CLOUD_CART_ITEM = {
  id: 'cart-item-1',
  cartId: CLOUD_CART.id,
  itemId: FLOUR.id,
  quantity: 3,
}

// A cloud item with targetQuantity: 0 — stocked HERE but inactive. Since PR 3b
// the card counts it in `inactiveCount` exactly as local does.
const INACTIVE_SNACK = cloudItem(
  'item-expired-snack',
  'Expired Snack',
  [CLOUD_VENDOR.id],
  { targetQuantity: 0 },
)

describe('Shopping index page — cloud mode', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    // LOC_A is the active location. Without this the provider starts on the
    // `'local'` sentinel and corrects itself a render later, which every
    // location-scoped read would have to wait out.
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    mockUsePantryDataQuery.mockReturnValue(pantryData([FLOUR]))
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
    localStorage.removeItem(activeLocationStorageKey('cloud'))
    vi.clearAllMocks()
  })

  const renderShoppingIndex = (initialEntry = '/shopping') => {
    const history = createMemoryHistory({ initialEntries: [initialEntry] })
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
    // Given a cloud cart at the ACTIVE location holding 3 packs of a Costco item
    renderShoppingIndex()

    // Then the vendor card shows the pack badge for that cloud cart. The page
    // looks the cart up by `cartIdFor(activeLocationId, vendorId)`, so a cart
    // still keyed by the bare vendor id matches nothing and no badge renders.
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
    expect(await screen.findByText(/3 packs/i)).toBeInTheDocument()
  })

  it('user can see the checked-item count on a vendor card in cloud mode', async () => {
    // Given a cloud cart with one checked item (quantity > 0)
    renderShoppingIndex()

    // Then the card metadata reports it as in the cart
    expect(await screen.findByText(/1 in cart/i)).toBeInTheDocument()
  })

  it('a vendor stocked only at another location sinks below the divider in cloud mode', async () => {
    // Given Bodega, whose only item (Coffee) is stocked at LOC_B and not at the
    // active LOC_A, alongside Costco, whose Flour is stocked here.
    //
    // Cloud used to skip this partition entirely, so BOTH vendors rendered in
    // the top section and no divider existed at all.
    mockUseGetVendorsQuery.mockReturnValue({
      ...emptyQuery,
      data: { vendors: [CLOUD_VENDOR, ELSEWHERE_VENDOR] },
    })
    mockUsePantryDataQuery.mockReturnValue(pantryData([FLOUR, COFFEE]))

    renderShoppingIndex()

    // Then both vendors still render — sinking is not hiding
    const costco = await screen.findByText(/costco/i)
    const bodega = screen.getByText(/bodega/i)

    // And the divider counts exactly the one that sank
    const divider = screen.getByText(/1 not stocked here/i)

    // And Costco is above it while Bodega is below
    expect(costco.compareDocumentPosition(divider)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(divider.compareDocumentPosition(bodega)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('vendor card counts only items stocked here, and reports the inactive ones', async () => {
    // Given three Costco items: one active here, one inactive here
    // (targetQuantity: 0), and one stocked only at LOC_B.
    //
    // Cloud used to keep a GLOBAL count and hard-code `inactiveCount: 0`, so it
    // read "3 items" with no inactive segment.
    const ELSEWHERE_FLOUR = cloudItem('item-rye', 'Rye', [CLOUD_VENDOR.id])
    // `PantryData(locationId: LOC_A)` returns every global item but only LOC_A's
    // stock rows, so Rye — stocked at LOC_B — gets NO row here. That absence is
    // what makes it "not stocked here"; handing it a LOC_B row instead would
    // give it a `stockId` and the count would read 3.
    mockUsePantryDataQuery.mockReturnValue({
      ...emptyQuery,
      data: {
        items: [FLOUR, INACTIVE_SNACK, ELSEWHERE_FLOUR],
        itemStocks: [
          stockRow(FLOUR.id, LOC_A),
          stockRow(INACTIVE_SNACK.id, LOC_A, { targetQuantity: 0 }),
        ],
      },
      networkStatus: 7,
      refetch: vi.fn(),
    })

    renderShoppingIndex()

    // Then the card counts the two stocked here, names the inactive one, and
    // leaves the LOC_B item out
    expect(
      await screen.findByText(/2 items · 1 inactive · 1 in cart/),
    ).toBeInTheDocument()
  })

  it('user can sort vendor cards by last purchased in cloud mode', async () => {
    // Given two cloud vendors whose carts carry different lastPurchasedAt
    // values, seeded so the alphabetically FIRST vendor is the one purchased
    // LONGEST ago — a comparator that returns 0 for every pair leaves them in
    // this (wrong) order, so this test cannot pass vacuously.
    const ALPHA_VENDOR = { id: 'vendor-alpha', name: 'Alpha Mart' }
    const ZETA_VENDOR = { id: 'vendor-zeta', name: 'Zeta Mart' }
    const alphaItem = cloudItem('item-alpha', 'Alpha Item', [ALPHA_VENDOR.id])
    const zetaItem = cloudItem('item-zeta', 'Zeta Item', [ZETA_VENDOR.id])
    mockUseGetVendorsQuery.mockReturnValue({
      ...emptyQuery,
      data: { vendors: [ALPHA_VENDOR, ZETA_VENDOR] },
    })
    mockUsePantryDataQuery.mockReturnValue(pantryData([alphaItem, zetaItem]))
    // Composite cart ids. `allCarts` is whole-account, so it also carries the
    // SAME two vendors' carts at LOC_B with the OPPOSITE dates: if the hook
    // stopped filtering by the active location, the LOC_B rows would overwrite
    // the map and the order below would flip.
    mockUseAllCartsQuery.mockReturnValue({
      ...emptyQuery,
      data: {
        allCarts: [
          {
            id: cartIdFor(LOC_A, ALPHA_VENDOR.id),
            lastPurchasedAt: '2025-01-01T00:00:00.000Z',
          },
          {
            id: cartIdFor(LOC_A, ZETA_VENDOR.id),
            lastPurchasedAt: '2025-06-01T00:00:00.000Z',
          },
          { id: cartIdFor(LOC_A, null), lastPurchasedAt: null },
          {
            id: cartIdFor(LOC_B, ALPHA_VENDOR.id),
            lastPurchasedAt: '2025-12-01T00:00:00.000Z',
          },
          {
            id: cartIdFor(LOC_B, ZETA_VENDOR.id),
            lastPurchasedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      },
    })
    mockUseAllCartItemsQuery.mockReturnValue({
      ...emptyQuery,
      data: { allCartItems: [] },
    })

    renderShoppingIndex('/shopping?sort=recent&dir=desc')

    // Then the more recently purchased vendor AT THIS LOCATION (Zeta) renders
    // above Alpha
    const zeta = await screen.findByText(/zeta mart/i)
    const alpha = await screen.findByText(/alpha mart/i)
    expect(zeta.compareDocumentPosition(alpha)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })
})
