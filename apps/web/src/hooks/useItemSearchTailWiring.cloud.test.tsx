import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AddItemToLocationDocument,
  PantryDataDocument,
} from '@/generated/graphql'
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
import { useItemSearchTailWiring } from './useItemSearchTailWiring'

// The whole chain is real here — the generated hooks, `useItemSearchTail`,
// `useItems` and `useAddItemToLocation` — because the thing under test is
// whether cloud mode can actually stock an item from the tail. Stubbing the
// mutation would assert the button exists while proving nothing about the
// press, and `src/test/setup.ts` stubs every generated hook by default.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

const MILK = cloudItem('item-milk', 'Milk')
const MILK_POWDER = cloudItem('item-powder', 'Milk Powder')
const CATALOG = [MILK, MILK_POWDER]

const MILK_STOCK_A = cloudStock('stock-milk-a', 'item-milk', LOC_A, {
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
})
// Milk Powder lives ONLY in Cloud Garage — the bucket-3 row this tail exists
// for, and the one the "Add to Cloud Kitchen" press has to stock here.
const POWDER_STOCK_B = cloudStock('stock-powder-b', 'item-powder', LOC_B, {
  targetQuantity: 3,
  refillThreshold: 1,
  packedQuantity: 2,
  unpackedQuantity: 0,
})
const POWDER_STOCK_A = cloudStock('stock-powder-a', 'item-powder', LOC_A, {
  targetQuantity: 3,
  refillThreshold: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
})

const STOCKS: Record<string, ReturnType<typeof cloudStock>[]> = {
  [LOC_A]: [MILK_STOCK_A],
  [LOC_B]: [POWDER_STOCK_B],
}

const pantryMock = (locationId: string) => ({
  request: { query: PantryDataDocument, variables: { locationId } },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => ({
    data: { items: CATALOG, itemStocks: STOCKS[locationId] ?? [] },
  }),
})

let addCalls = 0
const addMock = {
  request: {
    query: AddItemToLocationDocument,
    variables: { itemId: 'item-powder', locationId: LOC_A },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => {
    addCalls += 1
    // The server's copy-on-add; the refetched pantry must now see it here.
    STOCKS[LOC_A] = [MILK_STOCK_A, POWDER_STOCK_A]
    return { data: { addItemToLocation: POWDER_STOCK_A } }
  },
}

const MOCKS = [getLocationsMock, pantryMock(LOC_A), pantryMock(LOC_B), addMock]

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

function renderWiring() {
  return renderHook(
    () =>
      useItemSearchTailWiring({
        inGroupIds: new Set(['item-milk']),
        query: 'milk',
        renderItem: () => null,
      }),
    { wrapper: makeWrapper() },
  )
}

describe('useItemSearchTailWiring (cloud mode)', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    localStorage.clear()
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    addCalls = 0
    STOCKS[LOC_A] = [MILK_STOCK_A]
    STOCKS[LOC_B] = [POWDER_STOCK_B]
  })

  it('user in cloud mode is offered "Add to <location>" on a bucket-3 row', async () => {
    // Given a cloud pantry where Milk Powder is stocked only in Cloud Garage
    const { result } = renderWiring()

    // When the search tail resolves
    await waitFor(() =>
      expect(result.current.tailProps.notStockedHereItems).toHaveLength(1),
    )

    // Then the action is offered, named after the active cloud location — not
    // omitted the way it is when no location has resolved
    expect(result.current.tailProps.addToLocationAction).toBeDefined()
    expect(result.current.tailProps.addToLocationAction?.label).toBe(
      'Add to Cloud Kitchen',
    )
  })

  it('user in cloud mode can stock a bucket-3 item in the active location', async () => {
    // Given the same tail, with Milk Powder in bucket 3
    const { result } = renderWiring()
    await waitFor(() =>
      expect(result.current.tailProps.notStockedHereItems).toHaveLength(1),
    )
    const powder = result.current.tailProps.notStockedHereItems[0]

    // When the user presses "Add to Cloud Kitchen"
    await act(async () => {
      await result.current.tailProps.addToLocationAction?.onAction(
        powder as never,
      )
    })

    // Then the cloud mutation ran (it used to throw), and by the time the press
    // resolves the refetched pantry already shows the item as stocked here — so
    // the row is not re-enabled while still sitting in bucket 3
    expect(addCalls).toBe(1)
    expect(result.current.tailProps.notStockedHereItems).toHaveLength(0)
    expect(result.current.tailProps.inLocationItems.map((i) => i.id)).toEqual([
      'item-powder',
    ])
  })
})
