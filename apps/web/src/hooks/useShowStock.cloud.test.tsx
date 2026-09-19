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
import { useItems } from './useItems'
import { useShowStock } from './useShowStock'

// Restore the REAL generated Apollo hooks: `src/test/setup.ts` stubs
// `usePantryDataQuery` to `data: undefined`, and a predicate fed no items at
// all cannot tell a stocked row from an unstocked one. Everything below runs
// through `MockedProvider` and the real `PantryData` document, so the items
// this predicate judges are the ones the cloud join actually produces.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

const MILK = cloudItem('item-milk', 'Milk')
// Rice carries INLINE stock values on the cloud `Item` — the shape that made
// the old bypass look harmless. Read from a location where it has no row it
// must still read as unstocked.
const RICE = cloudItem('item-rice', 'Rice', {
  targetQuantity: 9,
  packedQuantity: 5,
})

const MILK_STOCK_A = cloudStock('stock-milk-a', 'item-milk', LOC_A, {
  targetQuantity: 4,
  refillThreshold: 1,
  packedQuantity: 2,
  unpackedQuantity: 0,
})
const RICE_STOCK_B = cloudStock('stock-rice-b', 'item-rice', LOC_B, {
  targetQuantity: 5,
  refillThreshold: 2,
  packedQuantity: 4,
  unpackedQuantity: 1,
})

const pantryMock = (locationId: string, stocks: unknown[]) => ({
  request: { query: PantryDataDocument, variables: { locationId } },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: { data: { items: [MILK, RICE], itemStocks: stocks } },
})

const MOCKS = [
  bootstrapCartsMock,
  getLocationsMock,
  pantryMock(LOC_A, [MILK_STOCK_A]),
  pantryMock(LOC_B, [RICE_STOCK_B]),
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

describe('useShowStock (cloud mode)', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    localStorage.clear()
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
  })

  it('user in cloud mode sees no stock figures on an item stocked only elsewhere', async () => {
    // Given a cloud catalog where Milk is stocked in the active location and
    // Rice is stocked ONLY in the other one
    const { result } = renderHook(
      () => ({ items: useItems(), showStock: useShowStock() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.items.data).toHaveLength(2))

    // When each is put to the predicate the tail rows are rendered behind
    const milk = result.current.items.data?.find((i) => i.name === 'Milk')
    const rice = result.current.items.data?.find((i) => i.name === 'Rice')

    // Then only the item with a row HERE shows its stock. Rice's zeroes are an
    // absence, not a reading, and rendering them would be a lie — the same rule
    // local mode has always followed.
    expect(rice?.stockId).toBeUndefined()
    expect(result.current.showStock(rice as { stockId?: string })).toBe(false)
    expect(result.current.showStock(milk as { stockId?: string })).toBe(true)
  })
})
