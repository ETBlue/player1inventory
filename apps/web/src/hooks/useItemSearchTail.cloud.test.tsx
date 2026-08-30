import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PantryDataDocument } from '@/generated/graphql'
import {
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
import { useItemSearchTail } from './useItemSearchTail'

// Real generated hooks + real `useItems`: the split under test is entirely a
// function of the `stockId` the cloud join produces, so a stubbed items hook
// would only prove that the test's own fixture splits the way the test wrote
// it. `src/test/setup.ts`'s `usePantryDataQuery` stub returns no items at all.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

const MILK = cloudItem('item-milk', 'Milk')
const MILK_CHOCOLATE = cloudItem('item-choc', 'Milk Chocolate')
const MILK_POWDER = cloudItem('item-powder', 'Milk Powder')
const BREAD = cloudItem('item-bread', 'Bread')
const CATALOG = [MILK, MILK_CHOCOLATE, MILK_POWDER, BREAD]

const stockA = (id: string, itemId: string) =>
  cloudStock(id, itemId, LOC_A, {
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 1,
    unpackedQuantity: 0,
  })

// Milk and Milk Chocolate are stocked in the ACTIVE location; Milk Powder is
// stocked ONLY in the other one. Three matches for "milk", split three ways:
// one already on the page, one in bucket 2, one in bucket 3. A fixture without
// the Cloud-Garage-only item cannot tell the two buckets apart.
const STOCKS: Record<string, ReturnType<typeof cloudStock>[]> = {
  [LOC_A]: [
    stockA('stock-milk-a', 'item-milk'),
    stockA('stock-choc-a', 'item-choc'),
  ],
  [LOC_B]: [
    cloudStock('stock-powder-b', 'item-powder', LOC_B, {
      targetQuantity: 3,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
    }),
  ],
}

const pantryMock = (locationId: string) => ({
  request: { query: PantryDataDocument, variables: { locationId } },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: {
    data: { items: CATALOG, itemStocks: STOCKS[locationId] ?? [] },
  },
})

const MOCKS = [getLocationsMock, pantryMock(LOC_A), pantryMock(LOC_B)]

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

const ids = (list: { id: string }[]) => list.map((i) => i.id)

describe('useItemSearchTail (cloud mode)', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    localStorage.clear()
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
  })

  it('user searching in cloud mode sees an item stocked elsewhere in the not-stocked-here bucket', async () => {
    // Given a cloud catalog where "milk" matches three items — one the page
    // already renders, one stocked here, one stocked only in Cloud Garage
    const { result } = renderHook(
      () =>
        useItemSearchTail({
          inGroupIds: new Set(['item-milk']),
          query: 'milk',
        }),
      { wrapper: makeWrapper() },
    )

    // When the tail resolves
    await waitFor(() =>
      expect(
        result.current.inLocation.length + result.current.notStockedHere.length,
      ).toBe(2),
    )

    // Then the split follows the stock rows, exactly as in local mode: the item
    // with a row here goes to bucket 2, the one without goes to bucket 3
    expect(ids(result.current.inLocation)).toEqual(['item-choc'])
    expect(ids(result.current.notStockedHere)).toEqual(['item-powder'])
    expect(result.current.hasExactGlobalMatch).toBe(true)
  })

  it('user switching location in cloud mode sees the two buckets swap', async () => {
    // Given the same catalog read from Cloud Garage instead
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_B)
    const { result } = renderHook(
      () =>
        useItemSearchTail({
          inGroupIds: new Set(['item-milk']),
          query: 'milk',
        }),
      { wrapper: makeWrapper() },
    )

    // When the tail resolves for that location
    await waitFor(() =>
      expect(ids(result.current.notStockedHere)).toEqual(['item-choc']),
    )

    // Then Milk Powder — stocked here — is the one that can be joined to the
    // page's group, and Milk Chocolate is the one that is not stocked here
    expect(ids(result.current.inLocation)).toEqual(['item-powder'])
  })
})
