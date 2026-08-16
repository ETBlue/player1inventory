import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  addInventoryLog,
  addItemToLocation,
  addToCart,
  createItem,
  createLocation,
  getItem,
  getItemStock,
} from '@/db/operations'
import { GetRecipesDocument } from '@/generated/graphql'
import type { PantryItem } from '@/types'
import { cartIdFor, DEFAULT_LOCATION_ID } from '@/types'
import { ACTIVE_LOCATION_STORAGE_KEY } from './useActiveLocation'
import { useItemSortData } from './useItemSortData'
import { useItemStocks } from './useItemStocks'
import {
  useAddItemToLocation,
  useCartItemCountByItem,
  useCreateItem,
  useDeleteItem,
  useInventoryLogCountByItem,
  useItem,
  useItems,
  useLastPurchaseDate,
  useRemoveItemFromLocation,
  useStockedItems,
  useUpdateItem,
} from './useItems'
import { useCartItems } from './useShoppingCart'

const mockUseGetItemQuery = vi.fn()
const mockUseGetItemsQuery = vi.fn()
const mockCloudCreate = vi.fn()
const mockCloudUpdate = vi.fn()
const mockCloudDelete = vi.fn()
const mockUseDeleteItemMutationOptions = vi.fn()
const mockUseLastPurchaseDatesQuery = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetItemQuery: () => mockUseGetItemQuery(),
    useGetItemsQuery: () => mockUseGetItemsQuery(),
    useCreateItemMutation: () => [mockCloudCreate, {}],
    useUpdateItemMutation: () => [mockCloudUpdate, {}],
    useDeleteItemMutation: (options: unknown) => {
      mockUseDeleteItemMutationOptions(options)
      return [mockCloudDelete, {}]
    },
    useLastPurchaseDatesQuery: (opts: unknown) =>
      mockUseLastPurchaseDatesQuery(opts),
    // Cloud read paths that are `skip`ped in local mode but would still demand
    // an ApolloProvider. Stubbed so local-mode hooks can be rendered here.
    useCartItemsQuery: () => ({ data: undefined, loading: false }),
  }
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

// ─── useItems ────────────────────────────────────────────────────────────────

describe('useItems (cloud mode)', () => {
  it('user can fetch items list via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns items
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetItemsQuery.mockReturnValue({
      data: {
        items: [
          {
            id: 'item-1',
            name: 'Milk',
            tagIds: [],
            targetUnit: 'package',
            targetQuantity: 2,
            refillThreshold: 1,
            packedQuantity: 0,
            unpackedQuantity: 0,
            consumeAmount: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    // When the hook is called
    const { result } = renderHook(() => useItems(), {
      wrapper: createWrapper(),
    })

    // Then it returns items from Apollo
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.[0]?.name).toBe('Milk')
  })
})

// ─── useItem ─────────────────────────────────────────────────────────────────

describe('useItem (cloud mode)', () => {
  it('user can fetch a single item via Apollo in cloud mode', async () => {
    // Given cloud mode is active and Apollo returns an item
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetItemQuery.mockReturnValue({
      data: {
        item: {
          id: 'item-1',
          name: 'Milk',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
      loading: false,
      error: undefined,
    })

    // When the hook is called with an item id
    const { result } = renderHook(() => useItem('item-1'), {
      wrapper: createWrapper(),
    })

    // Then it returns the item from Apollo
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.name).toBe('Milk')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it('returns undefined data while Apollo is loading in cloud mode', () => {
    // Given cloud mode and Apollo is still loading
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetItemQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    })

    // When the hook is called
    const { result } = renderHook(() => useItem('item-1'), {
      wrapper: createWrapper(),
    })

    // Then it shows loading state
    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(true)
  })
})

// ─── useCreateItem ────────────────────────────────────────────────────────────

describe('useCreateItem (cloud mode)', () => {
  it('user can create an item via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudCreate.mockResolvedValue({
      data: {
        createItem: {
          id: 'item-new',
          name: 'Cheese',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 0,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    })
    mockUseGetItemsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    // When the mutation is called with full item data
    const { result } = renderHook(() => useCreateItem(), {
      wrapper: createWrapper(),
    })
    const itemInput = {
      name: 'Cheese',
      tagIds: [],
      targetUnit: 'package' as const,
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    }
    const created = await result.current.mutateAsync(itemInput)

    // Then it delegates to cloudCreate with wrapped input
    expect(mockCloudCreate).toHaveBeenCalledWith({
      variables: { input: { ...itemInput, dueDate: null } },
    })
    expect((created as { name: string } | undefined)?.name).toBe('Cheese')
  })
})

// ─── useUpdateItem ────────────────────────────────────────────────────────────

describe('useUpdateItem (cloud mode)', () => {
  it('user can update an item via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudUpdate.mockResolvedValue({
      data: { updateItem: { id: 'item-1', name: 'Whole Milk' } },
    })
    mockUseGetItemsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    // When the mutation is called
    const { result } = renderHook(() => useUpdateItem(), {
      wrapper: createWrapper(),
    })
    await result.current.mutateAsync({
      id: 'item-1',
      updates: { name: 'Whole Milk' },
    })

    // Then it delegates to cloudUpdate
    expect(mockCloudUpdate).toHaveBeenCalled()
  })

  it('omits absent optional fields so the server leaves them untouched', async () => {
    // Given cloud mode and an update that omits all optional clearable fields
    localStorage.setItem('data-mode', 'cloud')
    mockCloudUpdate.mockResolvedValue({
      data: { updateItem: { id: 'item-1', name: 'Milk' } },
    })
    mockUseGetItemsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    // When the mutation is called with only required fields (no optional fields)
    const { result } = renderHook(() => useUpdateItem(), {
      wrapper: createWrapper(),
    })
    await result.current.mutateAsync({
      id: 'item-1',
      updates: { name: 'Milk' },
    })

    // Then the GraphQL input does NOT include optional clearable fields
    // (absent fields are omitted so the server leaves them untouched)
    const callArg = mockCloudUpdate.mock.calls[0][0]
    const input = callArg?.variables?.input ?? {}
    expect(input).not.toHaveProperty('packageUnit')
    expect(input).not.toHaveProperty('measurementUnit')
    expect(input).not.toHaveProperty('amountPerPackage')
    expect(input).not.toHaveProperty('estimatedDueDays')
    expect(input).not.toHaveProperty('expirationThreshold')
    expect(input).not.toHaveProperty('dueDate')
  })
})

// ─── useDeleteItem ────────────────────────────────────────────────────────────

describe('useDeleteItem (cloud mode)', () => {
  it('user can delete an item via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudDelete.mockResolvedValue({ data: { deleteItem: true } })
    mockUseGetItemsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    // When the mutation is called with id and no vendorIds
    const { result } = renderHook(() => useDeleteItem(), {
      wrapper: createWrapper(),
    })
    const deleted = await result.current.mutateAsync({ id: 'item-1' })

    // Then it delegates to cloudDelete with the correct variables
    expect(mockCloudDelete).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { id: 'item-1' } }),
    )
    expect(deleted).toBe(true)
  })

  it('user can delete an item in cloud mode — GetItemsDocument and GetRecipesDocument are refetched per call', async () => {
    // Given cloud mode
    localStorage.setItem('data-mode', 'cloud')
    mockCloudDelete.mockResolvedValue({ data: { deleteItem: true } })
    mockUseGetItemsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    // When deleteItem.mutate is called
    const { result } = renderHook(() => useDeleteItem(), {
      wrapper: createWrapper(),
    })
    await result.current.mutateAsync({ id: 'item-1' })

    // Then cloudDelete is called with GetItemsDocument and GetRecipesDocument in refetchQueries
    // (ensures cooking page item counts update after item deletion)
    expect(mockCloudDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchQueries: expect.arrayContaining([
          expect.objectContaining({ query: GetRecipesDocument }),
        ]),
      }),
    )
  })
})

// ─── useLastPurchaseDate ──────────────────────────────────────────────────────

describe('useLastPurchaseDate (cloud mode)', () => {
  it('user can get last purchase date via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns a last purchase date for the item
    localStorage.setItem('data-mode', 'cloud')
    const purchaseDate = new Date('2026-03-31T00:00:00.000Z')
    mockUseLastPurchaseDatesQuery.mockReturnValue({
      data: {
        lastPurchaseDates: [
          { itemId: 'item-1', date: purchaseDate.toISOString() },
        ],
      },
      loading: false,
      error: undefined,
    })

    // When the hook is called with an item id
    const { result } = renderHook(() => useLastPurchaseDate('item-1'), {
      wrapper: createWrapper(),
    })

    // Then it returns the date from Apollo as a Date object
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toBeInstanceOf(Date)
    expect(result.current.data?.toISOString()).toBe(purchaseDate.toISOString())

    // And it called the Apollo query with the correct itemIds
    expect(mockUseLastPurchaseDatesQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { itemIds: ['item-1'] },
      }),
    )
  })

  it('returns undefined when Apollo returns null date in cloud mode', async () => {
    // Given cloud mode and Apollo returns null for the item's last purchase date
    localStorage.setItem('data-mode', 'cloud')
    mockUseLastPurchaseDatesQuery.mockReturnValue({
      data: {
        lastPurchaseDates: [{ itemId: 'item-1', date: null }],
      },
      loading: false,
      error: undefined,
    })

    // When the hook is called
    const { result } = renderHook(() => useLastPurchaseDate('item-1'), {
      wrapper: createWrapper(),
    })

    // Then data is undefined (no purchase on record)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toBeUndefined()
  })
})

describe('useStockedItems (local mode)', () => {
  it('returns only items stocked in the active location', async () => {
    // Given local mode with one item stocked here and one stocked elsewhere
    await db.items.clear()
    await db.itemStocks.clear()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
    const cabin = await createLocation('Cabin')
    await createItem({ name: 'Milk', tagIds: [] }, DEFAULT_LOCATION_ID)
    await createItem({ name: 'Firewood', tagIds: [] }, cabin.id)

    // When the hook reads the active (default) location
    const { result } = renderHook(() => useStockedItems(), {
      wrapper: createWrapper(),
    })

    // Then only the default-location item is returned
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.map((i) => i.name)).toEqual(['Milk'])
  })
})

describe('useRemoveItemFromLocation (local mode)', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.inventoryLogs.clear()
    await db.locations.clear()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
  })

  it('user can remove an item from the active location and the pantry updates without a reload', async () => {
    // Given two items stocked in the active (default) location, already cached
    const milk = await createItem(
      { name: 'Milk', tagIds: [] },
      DEFAULT_LOCATION_ID,
    )
    await createItem({ name: 'Eggs', tagIds: [] }, DEFAULT_LOCATION_ID)

    const { result } = renderHook(
      () => ({
        stocked: useStockedItems(),
        remove: useRemoveItemFromLocation(),
      }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => expect(result.current.stocked.data).toHaveLength(2))

    // When the user removes one from the active location
    await result.current.remove.mutateAsync({ itemId: milk.id })

    // Then the cached pantry query re-resolves on its own (invalidated), with
    // no manual refetch and no page reload
    await waitFor(() =>
      expect(result.current.stocked.data?.map((i) => i.name)).toEqual(['Eggs']),
    )
    expect(await getItemStock(milk.id, DEFAULT_LOCATION_ID)).toBeUndefined()
  })

  it('user can remove an item from a non-active location by passing an explicit locationId', async () => {
    // Given an item stocked in both the active location and a cabin
    const cabin = await createLocation('Cabin')
    const beans = await createItem(
      { name: 'Beans', tagIds: [] },
      DEFAULT_LOCATION_ID,
    )
    await addItemToLocation(beans.id, cabin.id)

    const { result } = renderHook(() => useRemoveItemFromLocation(), {
      wrapper: createWrapper(),
    })

    // When the pager removes it from the cabin while the default is active
    await result.current.mutateAsync({
      itemId: beans.id,
      locationId: cabin.id,
    })

    // Then only the cabin's stock is gone
    expect(await getItemStock(beans.id, cabin.id)).toBeUndefined()
    expect(await getItemStock(beans.id, DEFAULT_LOCATION_ID)).toBeDefined()
  })
})

// Every query family the cascade changes must re-resolve after a removal from
// the active location. Asserted through the REAL consumer hooks sharing one
// QueryClient with the mutation — not by spying on invalidateQueries, which
// would only prove the call was made, not that anything re-read.
describe('useRemoveItemFromLocation invalidates every affected query family', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.inventoryLogs.clear()
    await db.cartItems.clear()
    await db.shoppingCarts.clear()
    await db.locations.clear()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
    // useItemSortData's cloud branch is skipped in local mode but still calls
    // the Apollo hook; give it a shape it can destructure.
    mockUseLastPurchaseDatesQuery.mockReturnValue({ data: undefined })
  })

  it('stock, cart, sort and count reads all re-resolve after a removal', async () => {
    // Given an item stocked in the active location, with a purchase log and a
    // cart entry — one live reader cached per affected key family
    const item = await createItem(
      { name: 'Beans', tagIds: [] },
      DEFAULT_LOCATION_ID,
    )
    await addInventoryLog({
      itemId: item.id,
      locationId: DEFAULT_LOCATION_ID,
      delta: 2,
      quantity: 2,
      occurredAt: new Date(),
    })
    const cartId = cartIdFor(DEFAULT_LOCATION_ID, null)
    await db.shoppingCarts.put({ id: cartId })
    await addToCart(cartId, item.id, 1)
    const pantryItems = [
      (await getItem(item.id, DEFAULT_LOCATION_ID)) as PantryItem,
    ]

    const { result } = renderHook(
      () => ({
        stocks: useItemStocks(item.id), // ['itemStocks', …]
        cartItems: useCartItems(cartId), // ['cart', …]
        sort: useItemSortData(pantryItems), // ['sort', …]
        logCount: useInventoryLogCountByItem(item.id), // ['inventoryLogs', …]
        cartCount: useCartItemCountByItem(item.id), // ['cartItems', …]
        remove: useRemoveItemFromLocation(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.stocks.data).toHaveLength(1)
      expect(result.current.cartItems.data).toHaveLength(1)
      expect(result.current.sort.purchaseDates?.get(item.id)).toBeInstanceOf(
        Date,
      )
      expect(result.current.logCount.data).toBe(1)
      expect(result.current.cartCount.data).toBe(1)
    })

    // When the item is removed from the active location
    await result.current.remove.mutateAsync({ itemId: item.id })

    // Then every cached reader re-resolves on its own
    await waitFor(() => {
      expect(result.current.stocks.data).toEqual([])
      expect(result.current.cartItems.data).toEqual([])
      expect(result.current.sort.purchaseDates?.get(item.id)).toBeNull()
      expect(result.current.logCount.data).toBe(0)
      expect(result.current.cartCount.data).toBe(0)
    })
  })

  // The remove confirmation names ONE location, so the counts it shows must be
  // scoped to it — an item-global count would tell the user more is being
  // deleted than actually is.
  it('the count hooks report per-location totals and re-resolve after that location is removed', async () => {
    // Given an item stocked in two locations, each with its own log and cart
    // entry
    const cabin = await createLocation('Cabin')
    const item = await createItem(
      { name: 'Beans', tagIds: [] },
      DEFAULT_LOCATION_ID,
    )
    await addItemToLocation(item.id, cabin.id)
    for (const locationId of [DEFAULT_LOCATION_ID, cabin.id]) {
      await addInventoryLog({
        itemId: item.id,
        locationId,
        delta: 1,
        quantity: 1,
        occurredAt: new Date(),
      })
      const cartId = cartIdFor(locationId, null)
      await db.shoppingCarts.put({ id: cartId })
      await addToCart(cartId, item.id, 1)
    }

    const { result } = renderHook(
      () => ({
        hereLogs: useInventoryLogCountByItem(item.id, DEFAULT_LOCATION_ID),
        hereCart: useCartItemCountByItem(item.id, DEFAULT_LOCATION_ID),
        cabinLogs: useInventoryLogCountByItem(item.id, cabin.id),
        cabinCart: useCartItemCountByItem(item.id, cabin.id),
        remove: useRemoveItemFromLocation(),
      }),
      { wrapper: createWrapper() },
    )

    // Then each location reports only its own rows
    await waitFor(() => {
      expect(result.current.hereLogs.data).toBe(1)
      expect(result.current.hereCart.data).toBe(1)
      expect(result.current.cabinLogs.data).toBe(1)
      expect(result.current.cabinCart.data).toBe(1)
    })

    // When the cabin's stock is removed
    await result.current.remove.mutateAsync({
      itemId: item.id,
      locationId: cabin.id,
    })

    // Then the cabin's counts drop to zero and the default location's are
    // untouched
    await waitFor(() => {
      expect(result.current.cabinLogs.data).toBe(0)
      expect(result.current.cabinCart.data).toBe(0)
    })
    expect(result.current.hereLogs.data).toBe(1)
    expect(result.current.hereCart.data).toBe(1)
  })
})

// Cloud mode has no locations and no ItemStock backend (deferred in PR D), so
// both location mutations are Dexie-only. Firing them in cloud mode would write
// to (or, for remove, irreversibly destroy) local rows the cloud UI never
// reads — a silent false success. They refuse loudly instead. Task 2 still owns
// the component-level guard that keeps the controls off screen in cloud mode;
// this is the safety net underneath it.
describe('location mutations refuse to run in cloud mode', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.inventoryLogs.clear()
    await db.locations.clear()
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
  })

  it('useRemoveItemFromLocation rejects in cloud mode and deletes nothing', async () => {
    // Given an item stocked locally, and the app in cloud mode
    const item = await createItem({ name: 'Milk', tagIds: [] })
    localStorage.setItem('data-mode', 'cloud')

    const { result } = renderHook(() => useRemoveItemFromLocation(), {
      wrapper: createWrapper(),
    })

    // When something tries to remove it anyway
    // Then the mutation rejects and the local stock row is untouched
    await expect(
      result.current.mutateAsync({ itemId: item.id }),
    ).rejects.toThrow(/local/i)
    expect(await getItemStock(item.id, DEFAULT_LOCATION_ID)).toBeDefined()
  })

  it('useAddItemToLocation rejects in cloud mode and writes no orphan stock', async () => {
    // Given a global item with no stock anywhere, and the app in cloud mode
    const item = await createItem({ name: 'Flour', tagIds: [] })
    await db.itemStocks.clear()
    localStorage.setItem('data-mode', 'cloud')

    const { result } = renderHook(() => useAddItemToLocation(), {
      wrapper: createWrapper(),
    })

    // When something tries to stock it anyway
    // Then the mutation rejects and no ItemStock row is written
    await expect(result.current.mutateAsync(item.id)).rejects.toThrow(/local/i)
    expect(await db.itemStocks.toArray()).toHaveLength(0)
  })
})
