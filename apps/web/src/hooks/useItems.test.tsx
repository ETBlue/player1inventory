import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useCreateItem,
  useDeleteItem,
  useItem,
  useItems,
  useUpdateItem,
} from './useItems'

const mockUseGetItemQuery = vi.fn()
const mockUseGetItemsQuery = vi.fn()
const mockCloudCreate = vi.fn()
const mockCloudUpdate = vi.fn()
const mockCloudDelete = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetItemQuery: () => mockUseGetItemQuery(),
    useGetItemsQuery: () => mockUseGetItemsQuery(),
    useCreateItemMutation: () => [mockCloudCreate, {}],
    useUpdateItemMutation: () => [mockCloudUpdate, {}],
    useDeleteItemMutation: () => [mockCloudDelete, {}],
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

    // When the mutation is called
    const { result } = renderHook(() => useCreateItem(), {
      wrapper: createWrapper(),
    })
    const created = await result.current.mutateAsync({ name: 'Cheese' })

    // Then it delegates to cloudCreate
    expect(mockCloudCreate).toHaveBeenCalledWith({
      variables: { name: 'Cheese' },
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

    // When the mutation is called
    const { result } = renderHook(() => useDeleteItem(), {
      wrapper: createWrapper(),
    })
    const deleted = await result.current.mutateAsync('item-1')

    // Then it delegates to cloudDelete
    expect(mockCloudDelete).toHaveBeenCalledWith({
      variables: { id: 'item-1' },
    })
    expect(deleted).toBe(true)
  })
})
