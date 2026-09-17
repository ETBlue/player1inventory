import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AddItemToLocationDocument,
  ItemStocksForItemDocument,
  PantryDataDocument,
  RemoveItemFromLocationDocument,
} from '@/generated/graphql'
import {
  bootstrapCartsMock,
  cloudItem,
  cloudStock,
  getLocationsMock,
  LOC_A,
  LOC_B,
} from '@/test/cloudFixtures'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from './useActiveLocation'
import * as dataModeHooks from './useDataMode'
import { useItemStocks } from './useItemStocks'
import {
  useAddItemToLocation,
  useRemoveItemFromLocation,
  useStockedItems,
} from './useItems'

// Real generated hooks throughout: these two mutations used to throw, so the
// only thing worth asserting is that the real cloud documents are sent and that
// the lists reading `itemStocks` / `itemStocksForItem` agree afterwards. A
// stubbed mutation hook would pass against a hook that sent nothing.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

const MILK = cloudItem('item-milk', 'Milk')
const RICE = cloudItem('item-rice', 'Rice')
const CATALOG = [MILK, RICE]

const MILK_STOCK_A = cloudStock('stock-milk-a', 'item-milk', LOC_A, {
  targetQuantity: 4,
  refillThreshold: 1,
  packedQuantity: 2,
  unpackedQuantity: 0,
})
// Rice is stocked ONLY in Cloud Garage. Adding it to Cloud Kitchen is the
// mutation under test; with one location there would be nothing to add from.
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

// The server's state, mutated by the mutation mocks below so the refetches
// have something new to find. Asserting on the refetched LISTS is what pins
// the cache invalidation — a mutation that resolved but refreshed nothing
// would leave these unchanged.
let stocks: Record<string, ReturnType<typeof cloudStock>[]> = {}
let riceStocks: ReturnType<typeof cloudStock>[] = []

const pantryMock = (locationId: string) => ({
  request: { query: PantryDataDocument, variables: { locationId } },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => ({
    data: { items: CATALOG, itemStocks: stocks[locationId] ?? [] },
  }),
})

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
    stocks[LOC_A] = [...(stocks[LOC_A] ?? []), RICE_STOCK_A]
    riceStocks = [RICE_STOCK_A, RICE_STOCK_B]
    return { data: { addItemToLocation: RICE_STOCK_A } }
  },
}

const removeMock = {
  request: {
    query: RemoveItemFromLocationDocument,
    variables: { itemId: 'item-rice', locationId: LOC_B },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => {
    stocks[LOC_B] = (stocks[LOC_B] ?? []).filter(
      (s) => s.itemId !== 'item-rice',
    )
    riceStocks = riceStocks.filter((s) => s.locationId !== LOC_B)
    return { data: { removeItemFromLocation: true } }
  },
}

const MOCKS = [
  bootstrapCartsMock,
  getLocationsMock,
  pantryMock(LOC_A),
  pantryMock(LOC_B),
  riceStocksMock,
  addMock,
  removeMock,
]

function makeWrapper(mocks: MockedProviderProps['mocks'] = MOCKS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <MockedProvider mocks={mocks} mockLinkDefaultOptions={{ delay: 0 }}>
      <QueryClientProvider client={queryClient}>
        <ActiveLocationProvider>{children}</ActiveLocationProvider>
      </QueryClientProvider>
    </MockedProvider>
  )
}

const names = (list: { name: string }[] | undefined) => list?.map((i) => i.name)

describe('cloud location stock mutations', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    localStorage.clear()
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    stocks = { [LOC_A]: [MILK_STOCK_A], [LOC_B]: [RICE_STOCK_B] }
    riceStocks = [RICE_STOCK_B]
  })

  it('user in cloud mode can stock an item that lives only in another location', async () => {
    // Given a cloud pantry showing only Milk — Rice is stocked in Cloud Garage
    const { result } = renderHook(
      () => ({
        pantry: useStockedItems(),
        add: useAddItemToLocation(),
        riceStocks: useItemStocks('item-rice'),
      }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() =>
      expect(names(result.current.pantry.data)).toEqual(['Milk']),
    )

    // When the user adds Rice to the active location
    await result.current.add.mutateAsync({ itemId: 'item-rice' })

    // Then the mutation ran (it used to throw), and both lists that read stock
    // have been refreshed: the pantry now holds Rice, and the item's own
    // all-locations list holds a row for each location
    await waitFor(() =>
      expect(names(result.current.pantry.data)).toEqual(['Milk', 'Rice']),
    )
    await waitFor(() =>
      expect(
        result.current.riceStocks.data?.map((s) => s.locationId).sort(),
      ).toEqual([LOC_A, LOC_B].sort()),
    )
  })

  it('user in cloud mode can un-stock an item from a location that is not the active one', async () => {
    // Given the Stock tab paged to Cloud Garage, where Rice is stocked
    const { result } = renderHook(
      () => ({
        remove: useRemoveItemFromLocation(),
        riceStocks: useItemStocks('item-rice'),
      }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.riceStocks.data).toHaveLength(1))

    // When the user removes it from the location being VIEWED, not the active one
    await result.current.remove.mutateAsync({
      itemId: 'item-rice',
      locationId: LOC_B,
    })

    // Then the row is gone from that location and the list has refreshed
    await waitFor(() => expect(result.current.riceStocks.data).toHaveLength(0))
  })
})
