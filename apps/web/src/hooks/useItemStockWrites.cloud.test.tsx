import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CreateItemDocument,
  GetItemsDocument,
  ItemStocksForItemDocument,
  PantryDataDocument,
  UpdateItemDocument,
  UpsertItemStockDocument,
} from '@/generated/graphql'
import {
  bootstrapCartsMock,
  type CloudStock,
  cloudItem,
  cloudStock,
  getLocationsMock,
  LOC_A,
  LOC_B,
} from '@/test/cloudFixtures'
import { DEFAULT_LOCATION_ID } from '@/types'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from './useActiveLocation'
import * as dataModeHooks from './useDataMode'
import { useItemStocks } from './useItemStocks'
import { useCreateItem, useStockedItems, useUpdateItem } from './useItems'

// The REAL generated hooks, driven through `MockedProvider` with the real
// documents. `src/test/setup.ts` stubs every generated hook, and a stubbed
// `useUpsertItemStockMutation` would swallow the variables — so "the save went
// to the location being viewed" could pass against a hook that sent no
// `locationId` at all, which is exactly the bug this task fixes.
//
// The cache eviction runs off the `update` callback's own `cache` argument, but
// the location resolution added by the fresh-session fix does call
// `useApolloClient` — see the unmock below.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

// `@apollo/client/react` IS unmocked here now: since the FRESH-SESSION fix the
// cloud write paths call `useApolloClient()` to resolve the target location
// (`useCloudLocationId`), and setup.ts's stub returns `{ data: {} }` from
// `query`, which would silently take the degraded fall-through branch and make
// the fresh-session test below unable to fail.
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

const MILK = cloudItem('item-milk', 'Milk')
const RICE = cloudItem('item-rice', 'Rice')

// THE FIXTURE IS THE TEST. Milk is stocked in BOTH locations with different
// numbers, so "wrote the right row" is distinguishable from "wrote a row".
// Rice is stocked ONLY in Cloud Garage, so the pantry's before/after list is
// not the whole catalog either.
const MILK_A = cloudStock('stock-milk-a', 'item-milk', LOC_A, {
  targetQuantity: 4,
  refillThreshold: 1,
  packedQuantity: 2,
  unpackedQuantity: 0,
})
const MILK_B = cloudStock('stock-milk-b', 'item-milk', LOC_B, {
  targetQuantity: 7,
  refillThreshold: 2,
  packedQuantity: 6,
  unpackedQuantity: 0,
})
const RICE_B = cloudStock('stock-rice-b', 'item-rice', LOC_B, {
  targetQuantity: 5,
  refillThreshold: 2,
  packedQuantity: 4,
  unpackedQuantity: 1,
})

// The server's state. Every mutation mock below edits it and every query mock
// reads it, so the assertions are on what the server ENDED UP holding rather
// than on the arguments a spy recorded — a hook that sent the right variables
// to the wrong field would still be caught.
let catalog: ReturnType<typeof cloudItem>[] = []
let stocks: CloudStock[] = []
// Served requests, per operation, so "no stock write was sent" is assertable.
let served: Record<string, number> = {}

function count(op: string) {
  served[op] = (served[op] ?? 0) + 1
}

const stocksIn = (locationId: string) =>
  stocks.filter((s) => s.locationId === locationId)

const rowAt = (itemId: string, locationId: string) =>
  stocks.find((s) => s.itemId === itemId && s.locationId === locationId)

const pantryMock = (locationId: string) => ({
  request: { query: PantryDataDocument, variables: { locationId } },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => ({
    data: { items: catalog, itemStocks: stocksIn(locationId) },
  }),
})

const getItemsMock = {
  request: { query: GetItemsDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => ({ data: { items: catalog } }),
}

const milkStocksMock = {
  request: {
    query: ItemStocksForItemDocument,
    variables: { itemId: 'item-milk' },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => ({
    data: { itemStocksForItem: stocks.filter((s) => s.itemId === 'item-milk') },
  }),
}

// One upsert mock PER LOCATION, both wired to the same state. Registering only
// the expected location would make the test pass for the wrong reason: an
// unmatched mock is a link error, which is indistinguishable from a hundred
// other failures. With both registered, a save that went to the wrong location
// resolves happily — and is caught by the row assertions instead.
const upsertMock = (locationId: string) => ({
  request: {
    query: UpsertItemStockDocument,
    // A function `variables` is Apollo 4's variable matcher.
    variables: (vars: Record<string, unknown>) =>
      vars.locationId === locationId,
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: (vars: Record<string, unknown>) => {
    count('UpsertItemStock')
    const itemId = vars.itemId as string
    const input = vars.input as Record<string, number | string | null>
    const existing = rowAt(itemId, locationId)
    const merged = {
      ...(existing ??
        cloudStock(`stock-${itemId}-${locationId}`, itemId, locationId, {
          targetQuantity: 0,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
        })),
      ...input,
    } as CloudStock
    stocks = [...stocks.filter((s) => s !== existing), merged]
    return { data: { upsertItemStock: merged } }
  },
})

// `UpdateItem`'s selection set omits `userId` and `createdAt`; `CreateItem`'s
// omits `userId`, `vendorIds`, `packageUnit`, `measurementUnit` and
// `amountPerPackage` (but DOES ask for `createdAt`). Returning the full item
// shape either way would be a mock the server could never produce.
function pick<T extends Record<string, unknown>>(source: T, drop: string[]) {
  const out = { ...source } as Record<string, unknown>
  for (const key of drop) delete out[key]
  return out
}

const updateItemMock = {
  request: { query: UpdateItemDocument, variables: () => true },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: (vars: Record<string, unknown>) => {
    count('UpdateItem')
    const id = vars.id as string
    const input = vars.input as Record<string, unknown>
    const next = { ...catalog.find((i) => i.id === id), ...input }
    catalog = catalog.map((i) => (i.id === id ? (next as typeof i) : i))
    return { data: { updateItem: pick(next, ['userId', 'createdAt']) } }
  },
}

const NEW_ITEM = cloudItem('item-new', 'Oat milk')

const createItemMock = {
  request: { query: CreateItemDocument, variables: () => true },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: (vars: Record<string, unknown>) => {
    count('CreateItem')
    const input = vars.input as Record<string, unknown>
    const created = { ...NEW_ITEM, ...input } as typeof NEW_ITEM
    catalog = [...catalog, created]
    return {
      data: {
        createItem: pick(created, [
          'userId',
          'vendorIds',
          'packageUnit',
          'measurementUnit',
          'amountPerPackage',
        ]),
      },
    }
  },
}

const MOCKS = [
  bootstrapCartsMock,
  getLocationsMock,
  getItemsMock,
  pantryMock(LOC_A),
  pantryMock(LOC_B),
  milkStocksMock,
  upsertMock(LOC_A),
  upsertMock(LOC_B),
  updateItemMock,
  createItemMock,
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

describe('cloud stock writes go to one location', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    localStorage.clear()
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    catalog = [MILK, RICE]
    stocks = [MILK_A, MILK_B, RICE_B]
    served = {}
  })

  it('user editing stock saves it to the ACTIVE location only', async () => {
    // Given Milk stocked in both Cloud Kitchen (2 packed) and Cloud Garage (6),
    // with Cloud Kitchen active
    const { result } = renderHook(
      () => ({ update: useUpdateItem(), rows: useItemStocks('item-milk') }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.rows.data).toHaveLength(2))

    // When the user saves 9 packed from the pantry (no location named)
    await result.current.update.mutateAsync({
      id: 'item-milk',
      updates: { packedQuantity: 9 },
    })

    // Then the active location's row moved and the OTHER location's did not —
    // the assertion a one-location fixture could not make
    await waitFor(() =>
      expect(rowAt('item-milk', LOC_A)?.packedQuantity).toBe(9),
    )
    expect(rowAt('item-milk', LOC_B)?.packedQuantity).toBe(6)
    // And the pager's list reflects it without a manual refetch
    await waitFor(() =>
      expect(
        result.current.rows.data?.find((s) => s.locationId === LOC_A)
          ?.packedQuantity,
      ).toBe(9),
    )
  })

  it('user editing stock from the Stock tab saves it to the location being VIEWED', async () => {
    // Given the pager is showing Cloud Garage while Cloud Kitchen is active
    const { result } = renderHook(
      () => ({ update: useUpdateItem(), rows: useItemStocks('item-milk') }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.rows.data).toHaveLength(2))

    // When the user saves 11 packed on that page
    await result.current.update.mutateAsync({
      id: 'item-milk',
      updates: { packedQuantity: 11 },
      locationId: LOC_B,
    })

    // Then the viewed location's row moved, and the ACTIVE one did not
    await waitFor(() =>
      expect(rowAt('item-milk', LOC_B)?.packedQuantity).toBe(11),
    )
    expect(rowAt('item-milk', LOC_A)?.packedQuantity).toBe(2)
  })

  it('a pure stock edit sends no updateItem, and a rename sends no stock write', async () => {
    const { result } = renderHook(
      () => ({ update: useUpdateItem(), pantry: useStockedItems() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.pantry.data).toHaveLength(1))

    // When the quantity buttons save nothing but stock
    await result.current.update.mutateAsync({
      id: 'item-milk',
      updates: { packedQuantity: 3, unpackedQuantity: 1 },
    })

    // Then only the stock mutation was sent — sending the five state fields to
    // `updateItem` as well would give one value two writers until PR 5
    expect(served.UpsertItemStock).toBe(1)
    expect(served.UpdateItem).toBeUndefined()

    // And when a configuration-only edit is saved
    await result.current.update.mutateAsync({
      id: 'item-milk',
      updates: { name: 'Whole milk', tagIds: ['tag-dairy'] },
    })

    // Then no stock row was touched — a rename must not create or overwrite an
    // ItemStock anywhere
    expect(served.UpdateItem).toBe(1)
    expect(served.UpsertItemStock).toBe(1)
    expect(rowAt('item-milk', LOC_A)?.packedQuantity).toBe(3)
  })

  it('user creating an item has it stocked in the active location', async () => {
    // Given a pantry holding only Milk in Cloud Kitchen
    const { result } = renderHook(
      () => ({ create: useCreateItem(), pantry: useStockedItems() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() =>
      expect(names(result.current.pantry.data)).toEqual(['Milk']),
    )

    // When the user creates Oat milk with an opening target of 3
    const created = await result.current.create.mutateAsync({
      name: 'Oat milk',
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      targetQuantity: 3,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
    })

    // Then it is stocked HERE and nowhere else
    expect(rowAt('item-new', LOC_A)).toMatchObject({
      targetQuantity: 3,
      refillThreshold: 1,
      packedQuantity: 0,
    })
    expect(rowAt('item-new', LOC_B)).toBeUndefined()
    // And the returned item carries the row that was just written, so callers
    // reading `stockId` off it (NewItemDialog's onSuccess) see the real one
    expect(created?.stockId).toBe(`stock-item-new-${LOC_A}`)
    expect(created?.locationId).toBe(LOC_A)
    // And the pantry shows it without a manual refetch
    await waitFor(() =>
      expect(names(result.current.pantry.data)?.sort()).toEqual([
        'Milk',
        'Oat milk',
      ]),
    )
  })

  it('a catalogOnly create leaves the new item unstocked everywhere', async () => {
    // Given the Settings assignment tabs, which create catalog entries only
    const { result } = renderHook(
      () => ({
        create: useCreateItem({ catalogOnly: true }),
        pantry: useStockedItems(),
      }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() =>
      expect(names(result.current.pantry.data)).toEqual(['Milk']),
    )

    // When an item is created there
    const created = await result.current.create.mutateAsync({
      name: 'Oat milk',
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      targetQuantity: 3,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
    })

    // Then no stock write was sent at all, and the pantry is unchanged
    expect(served.UpsertItemStock).toBeUndefined()
    expect(created?.stockId).toBeUndefined()
    expect(rowAt('item-new', LOC_A)).toBeUndefined()
    expect(names(result.current.pantry.data)).toEqual(['Milk'])
  })

  // ── The FRESH cloud session ────────────────────────────────────────────────
  //
  // THE FIXTURE IS THE TEST, and every test above has the wrong one: they seed
  // `active-location-id:cloud` with a real cuid, which pre-resolves the very
  // thing that breaks. A fresh cloud sign-in has NO such slot, so
  // `readStoredLocationId('cloud')` hands back `DEFAULT_LOCATION_ID` — the local
  // `'local'` sentinel — until `GetLocations` resolves and the provider corrects
  // it. A write issued inside that window was sent with `'local'` and refused by
  // `requireLocationRole`; thirteen cloud E2E specs failed on it.
  //
  // These tests mutate on the FIRST render pass, before `GetLocations` has
  // landed, which is what the E2E was doing by clicking Add immediately after
  // load. There is deliberately no `waitFor` before the mutation.
  describe('a fresh cloud session, before GetLocations has resolved', () => {
    beforeEach(() => {
      // No stored slot at all — the state a first cloud sign-in is actually in.
      localStorage.removeItem(activeLocationStorageKey('cloud'))
    })

    it('user creating an item has it stocked in the real default location', async () => {
      // Given a brand-new cloud session with no remembered location
      const { result } = renderHook(() => useCreateItem(), {
        wrapper: makeWrapper(),
      })

      // When the user creates an item immediately, without waiting for the
      // location list to load
      const created = await result.current.mutateAsync({
        name: 'Oat milk',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
      })

      // Then the stock landed in the isDefault location — NOT under the
      // `'local'` sentinel, which names no cloud Location and whose upsert the
      // server refuses
      expect(rowAt('item-new', LOC_A)?.targetQuantity).toBe(3)
      expect(rowAt('item-new', DEFAULT_LOCATION_ID)).toBeUndefined()
      expect(created?.stockId).toBeDefined()
      expect(created?.locationId).toBe(LOC_A)
    })

    it('user editing stock has it written to the real default location', async () => {
      // Given the same fresh session
      const { result } = renderHook(() => useUpdateItem(), {
        wrapper: makeWrapper(),
      })

      // When a quantity is saved before the location list has loaded
      await result.current.mutateAsync({
        id: 'item-milk',
        updates: { packedQuantity: 9 },
      })

      // Then Cloud Kitchen's row moved and Cloud Garage's did not
      expect(rowAt('item-milk', LOC_A)?.packedQuantity).toBe(9)
      expect(rowAt('item-milk', LOC_B)?.packedQuantity).toBe(6)
      expect(rowAt('item-milk', DEFAULT_LOCATION_ID)).toBeUndefined()
    })
  })
})
