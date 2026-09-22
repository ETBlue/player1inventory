import type { DocumentNode } from '@apollo/client'
import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  AllCartsDocument,
  CartItemCountByItemDocument,
  CartItemsDocument,
  GetItemDocument,
  GetLocationsDocument,
  GetRecipeDocument,
  GetRecipesDocument,
  GetShelfDocument,
  GetShelvesDocument,
  GetTagsByTypeDocument,
  GetTagsDocument,
  GetTagTypesDocument,
  GetVendorsDocument,
  InventoryLogCountByItemDocument,
  ItemCountByRecipeDocument,
  ItemCountByTagDocument,
  ItemCountByVendorDocument,
  ItemLogsDocument,
  ItemStocksForItemDocument,
  LastPurchaseDatesDocument,
  PantryDataDocument,
  TagCountByTypeDocument,
  VendorCartDocument,
} from '@/generated/graphql'
import {
  bootstrapCartsMock,
  CLOUD_LOCATIONS,
  cloudItem,
  cloudStock,
  getLocationsMock,
  LOC_A,
} from '@/test/cloudFixtures'
import { DEFAULT_LOCATION_ID, type PantryItem } from '@/types'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from './useActiveLocation'
import * as dataModeHooks from './useDataMode'
import { useItemLogs } from './useInventoryLogs'
import { useItemSortData } from './useItemSortData'
import { useItemStocks } from './useItemStocks'
import {
  useCartItemCountByItem,
  useInventoryLogCountByItem,
  useItem,
  useItems,
  useStockedItems,
} from './useItems'
import { useItemCountByRecipe, useRecipe, useRecipes } from './useRecipes'
import { useShelfQuery, useShelvesQuery } from './useShelves'
import {
  useAllActiveCarts,
  useCartItems,
  useLastPurchasedByVendor,
  useVendorCart,
} from './useShoppingCart'
import {
  useItemCountByTag,
  useTagCountByType,
  useTags,
  useTagsByType,
  useTagTypes,
} from './useTags'
import { useItemCountByVendor, useVendors } from './useVendors'

// Every cloud READ hook, checked for the one thing Apollo's default
// `cache-first` gets wrong in this app: the cloud cache is restored from
// IndexedDB before React mounts (`apollo/persistence.ts`, no TTL, no schema
// version), so a complete cached answer means NO request is sent and the data
// the user sees is whatever this device last saw.
// See `docs/global/bugs/2026-09-22-bug-cloud-queries-cache-first.md`.
//
// THE FIXTURE IS THE TEST. Every case below warms an `InMemoryCache` with a
// SMALLER or OLDER answer than the `MockedProvider` link serves. Under
// `cache-first` the hook reads the warm cache and stops, so the assertion on
// the link's answer cannot pass. A fixture whose cache and link agree would
// pass under BOTH policies and prove nothing.
//
// The second test per case is the paired half of the fix: with
// `cache-and-network` the network leg runs on every mount and FAILS offline.
// `isError` must stay false while cached data is still on screen, and `data`
// must survive — which is also why none of these hooks sets `errorPolicy: 'all'`
// (measured in `useLocations.test.tsx`: it moves cached data into
// `previousData` and leaves `data` undefined).

// Restore the REAL generated Apollo hooks. `src/test/setup.ts` stubs every one
// of them and a stub ignores `fetchPolicy` entirely, so nothing here could fail.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

const NETWORK_DOWN = new Error('Failed to fetch')

// ─── fixture rows ────────────────────────────────────────────────────────────

const tagType = (id: string, name: string) => ({
  __typename: 'TagType' as const,
  id,
  name,
  color: 'blue',
  userId: 'user-1',
})

const tag = (id: string, name: string) => ({
  __typename: 'Tag' as const,
  id,
  name,
  typeId: 'tt-1',
  userId: 'user-1',
  parentId: null,
})

const vendor = (id: string, name: string) => ({
  __typename: 'Vendor' as const,
  id,
  name,
  userId: 'user-1',
})

const shelf = (id: string, name: string) => ({
  __typename: 'Shelf' as const,
  id,
  name,
  type: 'manual',
  order: 0,
  filterConfig: null,
  itemIds: [],
  userId: 'user-1',
})

const recipe = (id: string, name: string) => ({
  __typename: 'Recipe' as const,
  id,
  name,
  items: [],
  lastCookedAt: null,
  userId: 'user-1',
})

const cart = (id: string, lastPurchasedAt: string | null) => ({
  __typename: 'Cart' as const,
  id,
  lastPurchasedAt,
})

const logRow = (id: string) => ({
  __typename: 'InventoryLog' as const,
  id,
  itemId: 'item-milk',
  delta: 1,
  quantity: 1,
  occurredAt: '2026-09-01T00:00:00.000Z',
  note: null,
  logKey: null,
  logParams: null,
})

const cartItem = (id: string, cartId: string, itemId: string) => ({
  __typename: 'CartItem' as const,
  id,
  cartId,
  itemId,
  quantity: 1,
})

const MILK = cloudItem('item-milk', 'Milk')
const RICE = cloudItem('item-rice', 'Rice')

const MILK_STOCK_A = cloudStock('stock-milk-a', 'item-milk', LOC_A, {
  targetQuantity: 4,
  refillThreshold: 1,
  packedQuantity: 2,
  unpackedQuantity: 0,
})
const RICE_STOCK_A = cloudStock('stock-rice-a', 'item-rice', LOC_A, {
  targetQuantity: 9,
  refillThreshold: 3,
  packedQuantity: 5,
  unpackedQuantity: 1,
})

// `useItemSortData` takes already-joined pantry rows, not raw cloud items.
const SORT_ITEMS = [
  { id: 'item-milk', name: 'Milk', packedQuantity: 0, unpackedQuantity: 0 },
] as unknown as PantryItem[]

// The two `AllCarts` cases render WITHOUT `ActiveLocationProvider` (see
// `withProvider` below), so `useActiveLocation()` falls back to
// `DEFAULT_LOCATION_ID`. Cart ids are `${locationId}:${vendorId}`, and both
// hooks drop carts belonging to another location, so these ids have to be
// keyed on the fallback id rather than on `LOC_A`.
const CART_A = `${DEFAULT_LOCATION_ID}:vendor-costco`
const CART_A_AT_LOC_A = `${LOC_A}:vendor-costco`

// ─── the table ───────────────────────────────────────────────────────────────

type Case = {
  /** Hook name plus the query it runs, used as the describe title. */
  name: string
  document: DocumentNode
  variables?: Record<string, unknown>
  /** What the restored IndexedDB snapshot holds — the OLD answer. */
  stale: Record<string, unknown>
  /** What the server would answer now — the NEW answer. */
  fresh: Record<string, unknown>
  /** Extra mocks and extra warm-cache writes this hook needs to run at all. */
  extraMocks?: MockedProviderProps['mocks']
  extraCacheWrites?: {
    document: DocumentNode
    variables?: Record<string, unknown>
    data: Record<string, unknown>
  }[]
  use: () => unknown
  /** Reads the value under test out of the hook's return. */
  read: (result: unknown) => unknown
  staleValue: unknown
  freshValue: unknown
  /** Reads `isError`; omitted for hooks that do not report one. */
  readError?: (result: unknown) => boolean
  /**
   * Mount `ActiveLocationProvider`? Default true.
   *
   * The two `AllCarts` cases set it false, and that is the test working
   * rather than the test being trimmed. In CLOUD mode the provider fires
   * `bootstrapCarts` on every active-location change and then refetches
   * `AllCarts` BY NAME. That refetch delivers the fresh answer on its own, so
   * both cases stayed GREEN with the hook's `fetchPolicy` deleted — a vacuous
   * test. Without the provider the only thing that can reach the second cart
   * is the hook's own network leg.
   */
  withProvider?: boolean
}

// Every location-scoped read waits on `useCloudLocationKnown`, which reads
// `GetLocations` from the cache. Warming it means the offline cases do not
// need a working network to get past the gate — which is what being offline
// with a restored snapshot actually looks like.
const LOCATIONS_CACHE_WRITE = {
  document: GetLocationsDocument,
  data: { locations: CLOUD_LOCATIONS },
}

type HookResult = Record<string, unknown>
const asData = (r: unknown) => (r as HookResult).data
const asError = (r: unknown) => (r as HookResult).isError as boolean
const names = (r: unknown) =>
  (asData(r) as { name: string }[] | undefined)?.map((x) => x.name)

const CASES: Case[] = [
  {
    name: 'useTagTypes / GetTagTypes',
    document: GetTagTypesDocument,
    stale: { tagTypes: [tagType('tt-1', 'Category')] },
    fresh: {
      tagTypes: [tagType('tt-1', 'Category'), tagType('tt-2', 'Aisle')],
    },
    use: () => useTagTypes(),
    read: names,
    staleValue: ['Category'],
    freshValue: ['Category', 'Aisle'],
    readError: asError,
  },
  {
    name: 'useTags / GetTags',
    document: GetTagsDocument,
    stale: { tags: [tag('tag-1', 'Dairy')] },
    fresh: { tags: [tag('tag-1', 'Dairy'), tag('tag-2', 'Frozen')] },
    use: () => useTags(),
    read: names,
    staleValue: ['Dairy'],
    freshValue: ['Dairy', 'Frozen'],
    readError: asError,
  },
  {
    name: 'useTagsByType / GetTagsByType',
    document: GetTagsByTypeDocument,
    variables: { typeId: 'tt-1' },
    stale: { tagsByType: [tag('tag-1', 'Dairy')] },
    fresh: { tagsByType: [tag('tag-1', 'Dairy'), tag('tag-2', 'Frozen')] },
    use: () => useTagsByType('tt-1'),
    read: names,
    staleValue: ['Dairy'],
    freshValue: ['Dairy', 'Frozen'],
    readError: asError,
  },
  {
    name: 'useTagCountByType / TagCountByType',
    document: TagCountByTypeDocument,
    variables: { typeId: 'tt-1' },
    stale: { tagCountByType: 1 },
    fresh: { tagCountByType: 2 },
    use: () => useTagCountByType('tt-1'),
    read: asData,
    staleValue: 1,
    freshValue: 2,
    readError: asError,
  },
  {
    name: 'useVendors / GetVendors',
    document: GetVendorsDocument,
    stale: { vendors: [vendor('vendor-costco', 'Costco')] },
    fresh: {
      vendors: [
        vendor('vendor-costco', 'Costco'),
        vendor('vendor-aldi', 'Aldi'),
      ],
    },
    use: () => useVendors(),
    read: names,
    staleValue: ['Costco'],
    freshValue: ['Costco', 'Aldi'],
    readError: asError,
  },
  {
    name: 'useShelvesQuery / GetShelves',
    document: GetShelvesDocument,
    stale: { shelves: [shelf('shelf-1', 'Fridge')] },
    fresh: {
      shelves: [shelf('shelf-1', 'Fridge'), shelf('shelf-2', 'Freezer')],
    },
    use: () => useShelvesQuery(),
    read: names,
    staleValue: ['Fridge'],
    freshValue: ['Fridge', 'Freezer'],
    readError: asError,
  },
  {
    name: 'useShelfQuery / GetShelf',
    document: GetShelfDocument,
    variables: { id: 'shelf-1' },
    // One shelf, RENAMED on another device — a list cannot grow here, so the
    // difference the network leg has to deliver is the new name.
    stale: { shelf: shelf('shelf-1', 'Fridge') },
    fresh: { shelf: shelf('shelf-1', 'Fridge (renamed)') },
    use: () => useShelfQuery('shelf-1'),
    read: (r) => (asData(r) as { name: string } | undefined)?.name,
    staleValue: 'Fridge',
    freshValue: 'Fridge (renamed)',
    readError: asError,
  },
  {
    name: 'useRecipes / GetRecipes',
    document: GetRecipesDocument,
    stale: { recipes: [recipe('recipe-1', 'Curry')] },
    fresh: {
      recipes: [recipe('recipe-1', 'Curry'), recipe('recipe-2', 'Soup')],
    },
    use: () => useRecipes(),
    read: names,
    staleValue: ['Curry'],
    freshValue: ['Curry', 'Soup'],
    readError: asError,
  },
  {
    name: 'useRecipe / GetRecipe',
    document: GetRecipeDocument,
    variables: { id: 'recipe-1' },
    stale: { recipe: recipe('recipe-1', 'Curry') },
    fresh: { recipe: recipe('recipe-1', 'Curry (renamed)') },
    use: () => useRecipe('recipe-1'),
    read: (r) => (asData(r) as { name: string } | undefined)?.name,
    staleValue: 'Curry',
    freshValue: 'Curry (renamed)',
    readError: asError,
  },
  {
    name: 'useCartItems / CartItems',
    document: CartItemsDocument,
    variables: { cartId: CART_A_AT_LOC_A },
    stale: { cartItems: [cartItem('ci-1', CART_A_AT_LOC_A, 'item-milk')] },
    fresh: {
      cartItems: [
        cartItem('ci-1', CART_A_AT_LOC_A, 'item-milk'),
        cartItem('ci-2', CART_A_AT_LOC_A, 'item-rice'),
      ],
    },
    use: () => useCartItems(CART_A_AT_LOC_A),
    read: (r) => (asData(r) as { itemId: string }[] | undefined)?.length,
    staleValue: 1,
    freshValue: 2,
    readError: asError,
  },
  {
    name: 'useAllActiveCarts / AllCarts',
    document: AllCartsDocument,
    stale: { allCarts: [cart(CART_A, null)] },
    fresh: {
      allCarts: [
        cart(CART_A, null),
        cart(`${DEFAULT_LOCATION_ID}:vendor-aldi`, null),
      ],
    },
    withProvider: false,
    use: () => useAllActiveCarts(),
    read: (r) => (asData(r) as { id: string }[] | undefined)?.length,
    staleValue: 1,
    freshValue: 2,
    readError: asError,
  },
  {
    name: 'useLastPurchasedByVendor / AllCarts',
    document: AllCartsDocument,
    stale: { allCarts: [cart(CART_A, '2026-01-01T00:00:00.000Z')] },
    fresh: { allCarts: [cart(CART_A, '2026-09-20T00:00:00.000Z')] },
    withProvider: false,
    use: () => useLastPurchasedByVendor(),
    read: (r) =>
      (asData(r) as Map<string | null, Date | null> | undefined)
        ?.get('vendor-costco')
        ?.toISOString(),
    staleValue: '2026-01-01T00:00:00.000Z',
    freshValue: '2026-09-20T00:00:00.000Z',
    readError: asError,
  },
  {
    name: 'useItemStocks / ItemStocksForItem',
    document: ItemStocksForItemDocument,
    variables: { itemId: 'item-milk' },
    stale: { itemStocksForItem: [MILK_STOCK_A] },
    fresh: {
      itemStocksForItem: [
        { ...MILK_STOCK_A, packedQuantity: 11 },
        cloudStock('stock-milk-b', 'item-milk', 'loc-b', {
          targetQuantity: 1,
          refillThreshold: 0,
          packedQuantity: 1,
          unpackedQuantity: 0,
        }),
      ],
    },
    use: () => useItemStocks('item-milk'),
    read: (r) => (asData(r) as { id: string }[] | undefined)?.length,
    staleValue: 1,
    freshValue: 2,
    readError: asError,
  },
  {
    name: 'useItem / GetItem',
    document: GetItemDocument,
    variables: { id: 'item-milk' },
    stale: { item: MILK },
    fresh: { item: { ...MILK, name: 'Whole Milk' } },
    extraMocks: [
      {
        request: {
          query: ItemStocksForItemDocument,
          variables: { itemId: 'item-milk' },
        },
        maxUsageCount: Number.POSITIVE_INFINITY,
        result: { data: { itemStocksForItem: [MILK_STOCK_A] } },
      },
    ],
    extraCacheWrites: [
      LOCATIONS_CACHE_WRITE,
      {
        document: ItemStocksForItemDocument,
        variables: { itemId: 'item-milk' },
        data: { itemStocksForItem: [MILK_STOCK_A] },
      },
    ],
    use: () => useItem('item-milk'),
    read: (r) => (asData(r) as { name: string } | undefined)?.name,
    staleValue: 'Milk',
    freshValue: 'Whole Milk',
    readError: asError,
  },
  {
    name: 'useItem / ItemStocksForItem',
    document: ItemStocksForItemDocument,
    variables: { itemId: 'item-milk' },
    // The active location's stock row, changed on another device.
    stale: { itemStocksForItem: [MILK_STOCK_A] },
    fresh: {
      itemStocksForItem: [{ ...MILK_STOCK_A, packedQuantity: 11 }],
    },
    extraMocks: [
      {
        request: { query: GetItemDocument, variables: { id: 'item-milk' } },
        maxUsageCount: Number.POSITIVE_INFINITY,
        result: { data: { item: MILK } },
      },
    ],
    extraCacheWrites: [
      LOCATIONS_CACHE_WRITE,
      {
        document: GetItemDocument,
        variables: { id: 'item-milk' },
        data: { item: MILK },
      },
    ],
    use: () => useItem('item-milk'),
    read: (r) =>
      (asData(r) as { packedQuantity: number } | undefined)?.packedQuantity,
    staleValue: 2,
    freshValue: 11,
    readError: asError,
  },
  {
    name: 'useItems / PantryData',
    document: PantryDataDocument,
    variables: { locationId: LOC_A },
    stale: { items: [MILK], itemStocks: [MILK_STOCK_A] },
    fresh: {
      items: [MILK, RICE],
      itemStocks: [MILK_STOCK_A, RICE_STOCK_A],
    },
    extraCacheWrites: [LOCATIONS_CACHE_WRITE],
    use: () => useItems(),
    read: names,
    staleValue: ['Milk'],
    freshValue: ['Milk', 'Rice'],
    readError: asError,
  },
  {
    name: 'useStockedItems / PantryData',
    document: PantryDataDocument,
    variables: { locationId: LOC_A },
    stale: { items: [MILK], itemStocks: [MILK_STOCK_A] },
    fresh: {
      items: [MILK, RICE],
      itemStocks: [MILK_STOCK_A, RICE_STOCK_A],
    },
    extraCacheWrites: [LOCATIONS_CACHE_WRITE],
    use: () => useStockedItems(),
    read: names,
    staleValue: ['Milk'],
    freshValue: ['Milk', 'Rice'],
    readError: asError,
  },
  {
    name: 'useItemSortData / LastPurchaseDates',
    document: LastPurchaseDatesDocument,
    variables: { itemIds: ['item-milk'], locationId: LOC_A },
    stale: {
      lastPurchaseDates: [
        {
          __typename: 'LastPurchaseDate',
          itemId: 'item-milk',
          date: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
    fresh: {
      lastPurchaseDates: [
        {
          __typename: 'LastPurchaseDate',
          itemId: 'item-milk',
          date: '2026-09-20T00:00:00.000Z',
        },
      ],
    },
    extraCacheWrites: [LOCATIONS_CACHE_WRITE],
    use: () => useItemSortData(SORT_ITEMS),
    read: (r) =>
      (r as { purchaseDates?: Map<string, Date | null> }).purchaseDates
        ?.get('item-milk')
        ?.toISOString(),
    staleValue: '2026-01-01T00:00:00.000Z',
    freshValue: '2026-09-20T00:00:00.000Z',
    // `useItemSortData` reports no error state of its own.
  },
  {
    name: 'useInventoryLogCountByItem / InventoryLogCountByItem',
    document: InventoryLogCountByItemDocument,
    variables: { itemId: 'item-milk', locationId: LOC_A },
    stale: { inventoryLogCountByItem: 1 },
    fresh: { inventoryLogCountByItem: 7 },
    extraCacheWrites: [LOCATIONS_CACHE_WRITE],
    use: () => useInventoryLogCountByItem('item-milk', LOC_A),
    read: asData,
    staleValue: 1,
    freshValue: 7,
    // `isError` is hardcoded `false` in this hook's cloud branch.
  },
  {
    name: 'useCartItemCountByItem / CartItemCountByItem',
    document: CartItemCountByItemDocument,
    variables: { itemId: 'item-milk', locationId: LOC_A },
    stale: { cartItemCountByItem: 1 },
    fresh: { cartItemCountByItem: 5 },
    extraCacheWrites: [LOCATIONS_CACHE_WRITE],
    use: () => useCartItemCountByItem('item-milk', LOC_A),
    read: asData,
    staleValue: 1,
    freshValue: 5,
    // `isError` is hardcoded `false` in this hook's cloud branch.
  },
  // ── The five hooks below already ran `cache-and-network` before this fix.
  // Only their `isError` changed, so the OFFLINE test is the one that is new
  // here; the stale-cache test is free coverage of a policy nobody had pinned.
  {
    name: 'useItemLogs / ItemLogs',
    document: ItemLogsDocument,
    variables: { itemId: 'item-milk', locationId: LOC_A },
    stale: { itemLogs: [logRow('log-1')] },
    fresh: { itemLogs: [logRow('log-1'), logRow('log-2')] },
    extraCacheWrites: [LOCATIONS_CACHE_WRITE],
    use: () => useItemLogs('item-milk'),
    read: (r) => (asData(r) as { id: string }[] | undefined)?.length,
    staleValue: 1,
    freshValue: 2,
    readError: asError,
  },
  {
    name: 'useVendorCart / VendorCart',
    document: VendorCartDocument,
    variables: { vendorId: 'vendor-costco', locationId: LOC_A },
    stale: {
      vendorCart: cart(CART_A_AT_LOC_A, '2026-01-01T00:00:00.000Z'),
    },
    fresh: {
      vendorCart: cart(CART_A_AT_LOC_A, '2026-09-20T00:00:00.000Z'),
    },
    extraCacheWrites: [LOCATIONS_CACHE_WRITE],
    use: () => useVendorCart('vendor-costco'),
    read: (r) =>
      (
        asData(r) as { lastPurchasedAt?: Date } | undefined
      )?.lastPurchasedAt?.toISOString(),
    staleValue: '2026-01-01T00:00:00.000Z',
    freshValue: '2026-09-20T00:00:00.000Z',
    readError: asError,
  },
  {
    name: 'useItemCountByTag / ItemCountByTag',
    document: ItemCountByTagDocument,
    variables: { tagId: 'tag-1' },
    stale: { itemCountByTag: 1 },
    fresh: { itemCountByTag: 4 },
    use: () => useItemCountByTag('tag-1'),
    read: asData,
    staleValue: 1,
    freshValue: 4,
    readError: asError,
  },
  {
    name: 'useItemCountByVendor / ItemCountByVendor',
    document: ItemCountByVendorDocument,
    variables: { vendorId: 'vendor-costco' },
    stale: { itemCountByVendor: 1 },
    fresh: { itemCountByVendor: 4 },
    use: () => useItemCountByVendor('vendor-costco'),
    read: asData,
    staleValue: 1,
    freshValue: 4,
    readError: asError,
  },
  {
    name: 'useItemCountByRecipe / ItemCountByRecipe',
    document: ItemCountByRecipeDocument,
    variables: { recipeId: 'recipe-1' },
    stale: { itemCountByRecipe: 1 },
    fresh: { itemCountByRecipe: 4 },
    use: () => useItemCountByRecipe('recipe-1'),
    read: asData,
    staleValue: 1,
    freshValue: 4,
    readError: asError,
  },
]

// ─── harness ─────────────────────────────────────────────────────────────────

function warmCache(c: Case, data: Record<string, unknown>) {
  const cache = createCache()
  // Every hook here lives behind `useLocations` / `useCloudLocationKnown`
  // somewhere, so the location list is always warm.
  cache.writeQuery({
    query: GetLocationsDocument,
    data: LOCATIONS_CACHE_WRITE.data,
  })
  for (const w of c.extraCacheWrites ?? []) {
    cache.writeQuery({
      query: w.document,
      ...(w.variables ? { variables: w.variables } : {}),
      data: w.data,
    })
  }
  cache.writeQuery({
    query: c.document,
    ...(c.variables ? { variables: c.variables } : {}),
    data,
  })
  return cache
}

function makeWrapper(
  mocks: MockedProviderProps['mocks'],
  cache: ReturnType<typeof createCache>,
  withProvider: boolean,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <MockedProvider
      mocks={mocks}
      cache={cache}
      mockLinkDefaultOptions={{ delay: 0 }}
    >
      <QueryClientProvider client={queryClient}>
        {withProvider ? (
          <ActiveLocationProvider>{children}</ActiveLocationProvider>
        ) : (
          children
        )}
      </QueryClientProvider>
    </MockedProvider>
  )
}

const baseMocks = [getLocationsMock, bootstrapCartsMock]

describe.each(CASES)('$name — a stale persisted cache', (c) => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    localStorage.clear()
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
  })

  it('user reopening the app sees what another device changed', async () => {
    // Given a restored cache holding the answer this device last saw, while
    // the server now has a different one
    const cache = warmCache(c, c.stale)
    const mocks = [
      ...baseMocks,
      ...(c.extraMocks ?? []),
      {
        request: {
          query: c.document,
          ...(c.variables ? { variables: c.variables } : {}),
        },
        maxUsageCount: Number.POSITIVE_INFINITY,
        result: { data: c.fresh },
      },
    ]
    const { result } = renderHook(c.use, {
      wrapper: makeWrapper(mocks, cache, c.withProvider ?? true),
    })

    // Then the cached answer is what the hook starts from — proving the
    // fixture really is stale, so the assertion below cannot pass by accident
    expect(c.read(result.current)).toEqual(c.staleValue)

    // When the network leg lands, the new answer replaces it. Under
    // `cache-first` no request is sent at all and this never happens.
    await waitFor(() => expect(c.read(result.current)).toEqual(c.freshValue))
  })

  it('user offline still sees the cached data and no error', async () => {
    // Given a warm cache and a network that fails every request
    const cache = warmCache(c, c.fresh)
    const mocks = [
      ...baseMocks,
      ...(c.extraMocks ?? []),
      {
        request: {
          query: c.document,
          ...(c.variables ? { variables: c.variables } : {}),
        },
        maxUsageCount: Number.POSITIVE_INFINITY,
        error: NETWORK_DOWN,
      },
    ]
    const { result } = renderHook(c.use, {
      wrapper: makeWrapper(mocks, cache, c.withProvider ?? true),
    })

    // When the failed request has settled
    await waitFor(() =>
      expect((result.current as HookResult).isLoading ?? false).toBe(false),
    )

    // Then the cached answer is still on screen and nothing reports an error.
    // This is also why no hook sets `errorPolicy: 'all'` — measured on Apollo
    // Client 4.1.6 it moves the cached result into `previousData` and leaves
    // `data` undefined, which would blank the screen for an offline user.
    expect(c.read(result.current)).toEqual(c.freshValue)
    if (c.readError) expect(c.readError(result.current)).toBe(false)
  })
})

// Three documents are read by TWO hooks each, and both hooks in every pair now
// carry `cache-and-network`. The alternative was to give the network leg to
// only one of the pair and let the other ride the cache write, the way
// `useCloudLocationKnown` rides `useLocations`. This is the measurement that
// decided it: Apollo's `queryDeduplication` (on by default, never turned off in
// `apollo/client.ts`) collapses the identical in-flight operation, so the pair
// costs ONE request — and neither hook then depends on the other being mounted.
//
// The cache is WARM in all three, because that is the production shape: the
// snapshot is restored before React mounts, and a cold-cache count would not
// tell us what happens when both observers already have an answer to serve.
describe('two hooks on one document still cost one request', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    localStorage.clear()
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
  })

  function countingMock(
    document: DocumentNode,
    variables: Record<string, unknown> | undefined,
    data: Record<string, unknown>,
    counter: { n: number },
  ) {
    return {
      request: { query: document, ...(variables ? { variables } : {}) },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () => {
        counter.n += 1
        return { data }
      },
    }
  }

  it('useItems and useStockedItems share one PantryData request', async () => {
    // Given a warm cache holding only Milk, and a server that now has Rice too
    const counter = { n: 0 }
    const cache = createCache()
    cache.writeQuery({
      query: GetLocationsDocument,
      data: { locations: CLOUD_LOCATIONS },
    })
    cache.writeQuery({
      query: PantryDataDocument,
      variables: { locationId: LOC_A },
      data: { items: [MILK], itemStocks: [MILK_STOCK_A] },
    })
    const mocks = [
      ...baseMocks,
      countingMock(
        PantryDataDocument,
        { locationId: LOC_A },
        { items: [MILK, RICE], itemStocks: [MILK_STOCK_A, RICE_STOCK_A] },
        counter,
      ),
    ]

    // When both pantry hooks mount together, as the pantry mounts them
    const { result } = renderHook(
      () => ({ items: useItems(), stocked: useStockedItems() }),
      { wrapper: makeWrapper(mocks, cache, true) },
    )

    // Then both see the new item
    await waitFor(() => expect(names(result.current.items)).toHaveLength(2))
    await waitFor(() => expect(names(result.current.stocked)).toHaveLength(2))

    // And the link served exactly one request for the two of them
    expect(counter.n).toBe(1)
  })

  it('useItem and useItemStocks share one ItemStocksForItem request', async () => {
    // Given a warm cache holding one location's stock row for Milk
    const counter = { n: 0 }
    const otherStock = cloudStock('stock-milk-b', 'item-milk', 'loc-other', {
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
    })
    const cache = createCache()
    cache.writeQuery({
      query: GetLocationsDocument,
      data: { locations: CLOUD_LOCATIONS },
    })
    cache.writeQuery({
      query: GetItemDocument,
      variables: { id: 'item-milk' },
      data: { item: MILK },
    })
    cache.writeQuery({
      query: ItemStocksForItemDocument,
      variables: { itemId: 'item-milk' },
      data: { itemStocksForItem: [MILK_STOCK_A] },
    })
    const mocks = [
      ...baseMocks,
      {
        request: { query: GetItemDocument, variables: { id: 'item-milk' } },
        maxUsageCount: Number.POSITIVE_INFINITY,
        result: { data: { item: MILK } },
      },
      countingMock(
        ItemStocksForItemDocument,
        { itemId: 'item-milk' },
        { itemStocksForItem: [MILK_STOCK_A, otherStock] },
        counter,
      ),
    ]

    // When the item detail layout mounts both, as `routes/items/$id.tsx` does
    const { result } = renderHook(
      () => ({
        item: useItem('item-milk'),
        stocks: useItemStocks('item-milk'),
      }),
      { wrapper: makeWrapper(mocks, cache, true) },
    )

    // Then the pager sees the second location's row
    await waitFor(() =>
      expect((result.current.stocks.data ?? []).length).toBe(2),
    )
    expect(result.current.item.data?.name).toBe('Milk')

    // And the link served exactly one request for the two of them
    expect(counter.n).toBe(1)
  })

  it('useAllActiveCarts and useLastPurchasedByVendor share one AllCarts request', async () => {
    // Given a warm cache holding one cart, and a server that now has two
    const counter = { n: 0 }
    const second = `${DEFAULT_LOCATION_ID}:vendor-aldi`
    const cache = createCache()
    cache.writeQuery({
      query: GetLocationsDocument,
      data: { locations: CLOUD_LOCATIONS },
    })
    cache.writeQuery({
      query: AllCartsDocument,
      data: { allCarts: [cart(CART_A, null)] },
    })
    const mocks = [
      ...baseMocks,
      countingMock(
        AllCartsDocument,
        undefined,
        { allCarts: [cart(CART_A, null), cart(second, null)] },
        counter,
      ),
    ]

    // When the shopping index mounts both, as `routes/shopping/index.tsx` does.
    // No `ActiveLocationProvider`, for the reason `withProvider` records: its
    // cloud effect refetches `AllCarts` by name and would add a request of its
    // own to the count.
    const { result } = renderHook(
      () => ({
        carts: useAllActiveCarts(),
        lastPurchased: useLastPurchasedByVendor(),
      }),
      { wrapper: makeWrapper(mocks, cache, false) },
    )

    // Then both see the second cart
    await waitFor(() => expect(result.current.carts.data).toHaveLength(2))
    expect(result.current.lastPurchased.data?.size).toBe(2)

    // And the link served exactly one request for the two of them
    expect(counter.n).toBe(1)
  })
})
