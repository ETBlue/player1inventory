import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AddItemToLocationDocument,
  GetItemDocument,
  ItemStocksForItemDocument,
} from '@/generated/graphql'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import {
  bootstrapCartsMock,
  cloudItem,
  cloudStock,
  getLocationsMock,
  LOC_A,
  LOC_B,
} from '@/test/cloudFixtures'

// Five hooks stay REAL and are served by `MockedProvider` — the locations, the
// item, its all-locations stock, and the two location mutations. Everything
// else keeps the inert stub `src/test/setup.ts` uses, so the ancestor routes
// rendering around the Stock tab (__root's pantry/tags/vendors) cannot reach a
// real Apollo hook and demand a mock of their own. Same shape as the per-file
// factory in `stock.test.tsx`, built by iteration rather than by hand.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  const REAL = new Set([
    'useGetLocationsQuery',
    'useGetItemQuery',
    'useItemStocksForItemQuery',
    'useAddItemToLocationMutation',
    'useRemoveItemFromLocationMutation',
  ])
  const queryStub = () => ({
    data: undefined,
    loading: false,
    error: undefined,
  })
  const mutationStub = () => [
    vi.fn().mockResolvedValue({ data: undefined }),
    {},
  ]
  const stubbed: Record<string, unknown> = { ...original }
  for (const key of Object.keys(stubbed)) {
    if (!key.startsWith('use') || REAL.has(key)) continue
    if (key.endsWith('Mutation')) stubbed[key] = mutationStub
    else if (key.endsWith('Query')) stubbed[key] = queryStub
  }
  return stubbed
})

// Rice is stocked ONLY in Cloud Garage. Opened from Cloud Kitchen, the tab must
// show the not-stocked empty state — with one cloud location the pager could
// not tell "stocked here" from "exists" and every assertion would be vacuous.
const RICE = cloudItem('item-rice', 'Rice')
const RICE_STOCK_B = cloudStock('stock-rice-b', 'item-rice', LOC_B, {
  targetQuantity: 5,
  refillThreshold: 2,
  packedQuantity: 4,
  unpackedQuantity: 1,
})
const RICE_STOCK_A = cloudStock('stock-rice-a', 'item-rice', LOC_A, {
  targetQuantity: 5,
  refillThreshold: 2,
  packedQuantity: 0,
  unpackedQuantity: 0,
})

let riceStocks: ReturnType<typeof cloudStock>[] = []

const getRiceMock = {
  request: { query: GetItemDocument, variables: { id: 'item-rice' } },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: { data: { item: RICE } },
}

const riceStocksMock = {
  request: {
    query: ItemStocksForItemDocument,
    variables: { itemId: 'item-rice' },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => ({ data: { itemStocksForItem: riceStocks } }),
}

const addMock = {
  request: {
    query: AddItemToLocationDocument,
    variables: { itemId: 'item-rice', locationId: LOC_A },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => {
    riceStocks = [RICE_STOCK_A, RICE_STOCK_B]
    return { data: { addItemToLocation: RICE_STOCK_A } }
  },
}

const MOCKS = [
  bootstrapCartsMock,
  getLocationsMock,
  getRiceMock,
  riceStocksMock,
  addMock,
]

function renderStockTab(mocks: MockedProviderProps['mocks'] = MOCKS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/items/item-rice/stock'],
    }),
  })
  render(
    <MockedProvider mocks={mocks} mockLinkDefaultOptions={{ delay: 0 }}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MockedProvider>,
  )
}

describe('Item stock tab — cloud mode', () => {
  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    sessionStorage.clear()
    riceStocks = [RICE_STOCK_B]
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
  })

  it('user in cloud mode can page across every cloud location', async () => {
    const user = userEvent.setup()

    // Given a cloud item stocked only in Cloud Garage, opened from Cloud Kitchen
    renderStockTab()

    // When the tab loads
    const tablist = await screen.findByRole('tablist', {
      name: /stock by location/i,
    })

    // Then there is one page per CLOUD location, opened on the active one,
    // which shows the not-stocked empty state rather than a form full of zeros
    expect(within(tablist).getAllByRole('tab')).toHaveLength(2)
    expect(
      screen.getByRole('tab', { name: /cloud kitchen.*current location/i }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText(/not stocked here/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /add to location/i }),
    ).toBeInTheDocument()

    // When the user pages to the location it IS stocked in
    await user.click(screen.getByRole('tab', { name: 'Cloud Garage' }))

    // Then that location's own stock is on screen, with the un-stock action
    expect(await screen.findByLabelText(/^packed/i)).toHaveValue(4)
    expect(
      screen.getByRole('button', { name: /remove from location/i }),
    ).toBeInTheDocument()
  })

  it('user in cloud mode can add the item to a location it is not stocked in', async () => {
    const user = userEvent.setup()

    // Given the tab open on Cloud Kitchen, where Rice has no stock row
    renderStockTab()
    await screen.findByText(/not stocked here/i)

    // When the user presses "Add to location"
    await user.click(screen.getByRole('button', { name: /add to location/i }))

    // Then the cloud mutation ran and the page becomes that location's form —
    // copy-on-add inherits the target but starts the on-hand count at 0
    await waitFor(() =>
      expect(screen.getByLabelText(/^packed/i)).toHaveValue(0),
    )
    expect(
      screen.getByRole('spinbutton', { name: /target quantity/i }),
    ).toHaveValue(5)
    expect(
      screen.queryByRole('button', { name: /add to location/i }),
    ).not.toBeInTheDocument()
  })
})
