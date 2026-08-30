import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GetItemDocument,
  GetLocationsDocument,
  ItemStocksForItemDocument,
  PantryDataDocument,
} from '@/generated/graphql'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
  useActiveLocation,
} from './useActiveLocation'
import * as dataModeHooks from './useDataMode'
import { useItem, useItems, useStockedItems } from './useItems'

// Restore the REAL generated Apollo hooks for this file. `src/test/setup.ts`
// stubs every one of them, and a stubbed `usePantryDataQuery` would hand back
// whatever shape the stub held no matter which `locationId` the hook asked
// for — so "switching the active location re-scopes the pantry" could pass
// against a hook that never sent the variable at all. Everything below runs
// through `MockedProvider` and the real `PantryData` document instead, so the
// variable is matched by Apollo rather than asserted by hand.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

function mockMode(mode: 'local' | 'cloud') {
  vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
    mode,
    setMode: vi.fn(),
  })
}

// Cloud location ids are server-generated cuids, never the local `'local'`
// sentinel. TWO of them, because with one location "stocked in the active
// location" and "exists at all" are the same set and every assertion below
// would pass against a join that ignored the location entirely.
const LOC_A = 'clw3loc0a0000s9f8h7g6d5e4' // Cloud Kitchen — the default, active first
const LOC_B = 'clw3loc0b0001s9f8h7g6d5e5' // Cloud Garage

const cloudLocation = (
  id: string,
  name: string,
  order: number,
  isDefault: boolean,
) => ({
  __typename: 'Location' as const,
  id,
  name,
  order,
  isDefault,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T11:00:00.000Z',
})

const getLocationsMock = {
  request: { query: GetLocationsDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: {
    data: {
      locations: [
        cloudLocation(LOC_A, 'Cloud Kitchen', 0, true),
        cloudLocation(LOC_B, 'Cloud Garage', 1, false),
      ],
    },
  },
}

// The cloud `Item` still declares the five stock STATE fields until PR 5. The
// defaults here are the zeroes the server sends for an item nobody has written
// inline stock to; `inline` is how a test gives an item the leftover values
// that `stripStockFields` has to remove.
const cloudItem = (
  id: string,
  name: string,
  inline: Record<string, unknown> = {},
) => ({
  __typename: 'Item' as const,
  id,
  name,
  tagIds: [],
  vendorIds: [],
  packageUnit: null,
  measurementUnit: null,
  amountPerPackage: null,
  targetUnit: 'package',
  targetQuantity: 0,
  refillThreshold: 0,
  packedQuantity: 0,
  unpackedQuantity: 0,
  consumeAmount: 1,
  expirationMode: null,
  dueDate: null,
  estimatedDueDays: null,
  expirationThreshold: null,
  userId: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...inline,
})

const cloudStock = (
  id: string,
  itemId: string,
  locationId: string,
  fields: {
    targetQuantity: number
    refillThreshold: number
    packedQuantity: number
    unpackedQuantity: number
    dueDate?: string | null
  },
) => ({
  __typename: 'ItemStock' as const,
  id,
  itemId,
  locationId,
  dueDate: null,
  ...fields,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-02T00:00:00.000Z',
})

// THE FIXTURE IS THE TEST. Rice is stocked ONLY in Cloud Garage, and it carries
// INLINE stock values on the `Item` itself — including a `dueDate`. Read from
// Cloud Kitchen it must come back with no stock row, zeroed quantities, and no
// due date: `ZERO_STOCK` has no `dueDate` key to overwrite the inline one with,
// so only `stripStockFields` can remove it (lib/itemStock.ts).
const MILK = cloudItem('item-milk', 'Milk')
const RICE = cloudItem('item-rice', 'Rice', {
  targetQuantity: 9,
  refillThreshold: 3,
  packedQuantity: 5,
  unpackedQuantity: 2,
  dueDate: '2026-12-24T00:00:00.000Z',
})
const FLOUR = cloudItem('item-flour', 'Flour')
const CATALOG = [MILK, RICE, FLOUR]

const MILK_STOCK_A = cloudStock('stock-milk-a', 'item-milk', LOC_A, {
  targetQuantity: 4,
  refillThreshold: 1,
  packedQuantity: 2,
  unpackedQuantity: 0,
  dueDate: '2026-09-10T00:00:00.000Z',
})
const FLOUR_STOCK_A = cloudStock('stock-flour-a', 'item-flour', LOC_A, {
  targetQuantity: 3,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
})
const MILK_STOCK_B = cloudStock('stock-milk-b', 'item-milk', LOC_B, {
  targetQuantity: 7,
  refillThreshold: 2,
  packedQuantity: 6,
  unpackedQuantity: 0,
  dueDate: '2026-10-05T00:00:00.000Z',
})
const RICE_STOCK_B = cloudStock('stock-rice-b', 'item-rice', LOC_B, {
  targetQuantity: 5,
  refillThreshold: 2,
  packedQuantity: 4,
  unpackedQuantity: 1,
})

const STOCKS_BY_LOCATION: Record<string, ReturnType<typeof cloudStock>[]> = {
  [LOC_A]: [MILK_STOCK_A, FLOUR_STOCK_A],
  [LOC_B]: [MILK_STOCK_B, RICE_STOCK_B],
}

// Counts the requests the mock LINK actually served, per location — the only
// honest way to check the design's "one round trip" claim, since Apollo's
// deduplication happens below the hooks.
const pantryRequests: Record<string, number> = {}

const pantryMock = (locationId: string) => ({
  request: { query: PantryDataDocument, variables: { locationId } },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => {
    pantryRequests[locationId] = (pantryRequests[locationId] ?? 0) + 1
    return {
      data: {
        items: CATALOG,
        itemStocks: STOCKS_BY_LOCATION[locationId] ?? [],
      },
    }
  },
})

const getItemMock = {
  request: { query: GetItemDocument, variables: { id: 'item-milk' } },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: { data: { item: MILK } },
}

const getRiceMock = {
  request: { query: GetItemDocument, variables: { id: 'item-rice' } },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: { data: { item: RICE } },
}

const riceStocksForItemMock = {
  request: {
    query: ItemStocksForItemDocument,
    variables: { itemId: 'item-rice' },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: { data: { itemStocksForItem: [RICE_STOCK_B] } },
}

// Every location's row for Milk, in ONE result — `useItem` picks the active
// location's row out of this set rather than asking again per location.
const itemStocksForItemMock = {
  request: {
    query: ItemStocksForItemDocument,
    variables: { itemId: 'item-milk' },
  },
  maxUsageCount: 1,
  result: {
    data: { itemStocksForItem: [MILK_STOCK_A, MILK_STOCK_B] },
  },
}

const ALL_MOCKS = [
  getLocationsMock,
  pantryMock(LOC_A),
  pantryMock(LOC_B),
  getItemMock,
  itemStocksForItemMock,
  getRiceMock,
  riceStocksForItemMock,
]

function makeWrapper(mocks: MockedProviderProps['mocks'] = ALL_MOCKS) {
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

// Both pantry hooks plus the switch, in one render — the pantry mounts them
// together, and the round-trip count below only means something that way.
function usePantry() {
  const items = useItems()
  const stocked = useStockedItems()
  const { activeLocationId, setActiveLocationId } = useActiveLocation()
  return { items, stocked, activeLocationId, setActiveLocationId }
}

const names = (list: { name: string }[] | undefined) => list?.map((i) => i.name)
const byName = (list: { name: string }[] | undefined, name: string) =>
  list?.find((i) => i.name === name)

describe('cloud pantry data (PantryData join)', () => {
  beforeEach(() => {
    mockMode('cloud')
    localStorage.clear()
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    for (const key of Object.keys(pantryRequests)) delete pantryRequests[key]
  })

  it('user in cloud mode sees every catalog item, stocked here or not', async () => {
    // Given a cloud catalog of three items, only two of them stocked in the
    // active location (Rice is stocked only in Cloud Garage)
    const { result } = renderHook(() => usePantry(), { wrapper: makeWrapper() })

    // When the pantry data loads
    await waitFor(() => expect(result.current.items.data).toHaveLength(3))

    // Then the whole catalog is present, and only the items with a row in THIS
    // location carry a stockId — the difference is the search tail's third bucket
    expect(names(result.current.items.data)).toEqual(['Milk', 'Rice', 'Flour'])
    expect(byName(result.current.items.data, 'Milk')?.stockId).toBe(
      'stock-milk-a',
    )
    expect(byName(result.current.items.data, 'Flour')?.stockId).toBe(
      'stock-flour-a',
    )
    expect(byName(result.current.items.data, 'Rice')?.stockId).toBeUndefined()
  })

  it('user in cloud mode sees only the items stocked here in the pantry', async () => {
    // Given the same catalog, with Rice stocked only in the other location
    const { result } = renderHook(() => usePantry(), { wrapper: makeWrapper() })

    // When the pantry list loads
    await waitFor(() => expect(result.current.stocked.data).toBeDefined())

    // Then the item stocked elsewhere is absent, and the active location's own
    // stock values are joined onto the ones that remain
    expect(names(result.current.stocked.data)).toEqual(['Milk', 'Flour'])
    expect(byName(result.current.stocked.data, 'Milk')).toMatchObject({
      stockId: 'stock-milk-a',
      locationId: LOC_A,
      targetQuantity: 4,
      packedQuantity: 2,
    })
  })

  it('user switching the active location re-scopes both lists', async () => {
    // Given the pantry loaded for Cloud Kitchen
    const { result } = renderHook(() => usePantry(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.stocked.data).toHaveLength(2))
    expect(names(result.current.stocked.data)).toEqual(['Milk', 'Flour'])

    // When the user switches to Cloud Garage
    act(() => result.current.setActiveLocationId(LOC_B))

    // Then the pantry shows THAT location's items, and the catalog's stockIds
    // move with it — Flour is now the item stocked somewhere else
    await waitFor(() =>
      expect(names(result.current.stocked.data)).toEqual(['Milk', 'Rice']),
    )
    expect(byName(result.current.stocked.data, 'Milk')).toMatchObject({
      stockId: 'stock-milk-b',
      locationId: LOC_B,
      targetQuantity: 7,
      packedQuantity: 6,
    })
    expect(names(result.current.items.data)).toEqual(['Milk', 'Rice', 'Flour'])
    expect(byName(result.current.items.data, 'Rice')?.stockId).toBe(
      'stock-rice-b',
    )
    expect(byName(result.current.items.data, 'Flour')?.stockId).toBeUndefined()
  })

  it('user sees no stock state at all on an item stocked only elsewhere', async () => {
    // Given Rice, stocked only in Cloud Garage, whose cloud Item still carries
    // leftover inline stock values including a due date
    const { result } = renderHook(() => usePantry(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.items.data).toHaveLength(3))

    // When it is read from Cloud Kitchen, where it has no row
    const rice = byName(result.current.items.data, 'Rice')

    // Then it reads as unstocked here: no row id, zeroed quantities, and NO due
    // date — the inline one must not survive the join (ZERO_STOCK has no
    // dueDate key to overwrite it, so only stripStockFields can remove it)
    expect(rice?.stockId).toBeUndefined()
    expect(rice).toMatchObject({
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      locationId: LOC_A,
    })
    expect(rice?.dueDate).toBeUndefined()
    // and its global configuration is untouched by the strip
    expect(rice?.consumeAmount).toBe(1)
    expect(rice?.targetUnit).toBe('package')
  })

  it('user opening an item sees the active location’s stock row', async () => {
    // Given Milk, stocked in both locations with different quantities and
    // different expiry dates
    const { result } = renderHook(
      () => ({ item: useItem('item-milk'), active: useActiveLocation() }),
      { wrapper: makeWrapper() },
    )

    // When the item page loads while Cloud Kitchen is active
    await waitFor(() => expect(result.current.item.data).toBeDefined())

    // Then it shows THIS location's row
    expect(result.current.item.data).toMatchObject({
      name: 'Milk',
      stockId: 'stock-milk-a',
      locationId: LOC_A,
      targetQuantity: 4,
      packedQuantity: 2,
    })
    expect(result.current.item.data?.dueDate).toEqual(
      new Date('2026-09-10T00:00:00.000Z'),
    )

    // When the user switches location
    act(() => result.current.active.setActiveLocationId(LOC_B))

    // Then the other location's row is picked out of the SAME result — the
    // ItemStocksForItem mock is capped at one use, so a second request would
    // fail the test rather than silently cost a round trip
    await waitFor(() =>
      expect(result.current.item.data?.stockId).toBe('stock-milk-b'),
    )
    expect(result.current.item.data).toMatchObject({
      locationId: LOC_B,
      targetQuantity: 7,
      packedQuantity: 6,
    })
    expect(result.current.item.data?.dueDate).toEqual(
      new Date('2026-10-05T00:00:00.000Z'),
    )
  })

  it('user opening an item not stocked here sees no stock state on it', async () => {
    // Given Rice — stocked only in Cloud Garage, with leftover inline stock
    // values (including a due date) on the cloud Item itself
    const { result } = renderHook(() => useItem('item-rice'), {
      wrapper: makeWrapper(),
    })

    // When its page is opened from Cloud Kitchen
    await waitFor(() => expect(result.current.data).toBeDefined())

    // Then the detail page agrees with the pantry: no row here, zeroed
    // quantities, and no expiry borrowed from the Item's inline fields
    expect(result.current.data?.stockId).toBeUndefined()
    expect(result.current.data).toMatchObject({
      name: 'Rice',
      locationId: LOC_A,
      targetQuantity: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
    })
    expect(result.current.data?.dueDate).toBeUndefined()
  })

  it('the catalog and the pantry list together cost ONE request', async () => {
    // Given both pantry hooks mounted in the same render
    const { result } = renderHook(() => usePantry(), { wrapper: makeWrapper() })

    // When both have resolved
    await waitFor(() => expect(result.current.items.data).toHaveLength(3))
    await waitFor(() => expect(result.current.stocked.data).toHaveLength(2))

    // Then the link served exactly one PantryData request for that location —
    // `useStockedItems` derives from the same result rather than asking again
    expect(pantryRequests[LOC_A]).toBe(1)
    expect(pantryRequests[LOC_B]).toBeUndefined()
  })
})
