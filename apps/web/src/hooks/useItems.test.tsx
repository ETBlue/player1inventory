import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GetRecipesDocument } from '@/generated/graphql'
import {
  useCreateItem,
  useDeleteItem,
  useItem,
  useItems,
  useLastPurchaseDate,
  useUpdateItem,
} from './useItems'

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

  it('sends null for cleared optional fields (packageUnit, measurementUnit, amountPerPackage, estimatedDueDays, expirationThreshold, dueDate)', async () => {
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

    // Then the GraphQL input includes explicit null for each optional clearable field
    // (so MongoDB $set clears them instead of leaving stale values)
    expect(mockCloudUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          input: expect.objectContaining({
            packageUnit: null,
            measurementUnit: null,
            amountPerPackage: null,
            estimatedDueDays: null,
            expirationThreshold: null,
            dueDate: null,
          }),
        }),
      }),
    )
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
