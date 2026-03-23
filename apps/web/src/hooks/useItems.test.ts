import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GetItemsDocument,
  GetRecipesDocument,
  ItemCountByVendorDocument,
} from '@/generated/graphql'
import { useDeleteItem } from './useItems'

const mockCloudDeleteItem = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetItemsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useGetItemQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useCreateItemMutation: () => [vi.fn(), {}],
    useUpdateItemMutation: () => [vi.fn(), {}],
    useDeleteItemMutation: () => [mockCloudDeleteItem, {}],
  }
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

// ─── useDeleteItem ─────────────────────────────────────────────────────────────

describe('useDeleteItem (cloud mode)', () => {
  it('user can delete an item via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudDeleteItem.mockResolvedValue({ data: { deleteItem: true } })

    // When the mutation is called
    const { result } = renderHook(() => useDeleteItem(), {
      wrapper: createWrapper(),
    })
    const deleted = await result.current.mutateAsync({ id: 'item-1' })

    // Then it delegates to cloudDelete with the correct variables
    expect(mockCloudDeleteItem).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { id: 'item-1' } }),
    )
    expect(deleted).toBe(true)
  })

  it('refetches ItemCountByVendorDocument for each vendorId when deleting in cloud mode', async () => {
    // Given cloud mode and an item that belongs to two vendors
    localStorage.setItem('data-mode', 'cloud')
    mockCloudDeleteItem.mockResolvedValue({ data: { deleteItem: true } })

    // When deleteItem.mutate is called with vendorIds
    const { result } = renderHook(() => useDeleteItem(), {
      wrapper: createWrapper(),
    })

    await result.current.mutate({
      id: 'item-1',
      vendorIds: ['vendor-a', 'vendor-b'],
    })

    // Then cloudDelete is called with refetchQueries that include
    // ItemCountByVendorDocument for each vendor
    expect(mockCloudDeleteItem).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { id: 'item-1' },
        refetchQueries: expect.arrayContaining([
          { query: GetItemsDocument },
          { query: GetRecipesDocument },
          {
            query: ItemCountByVendorDocument,
            variables: { vendorId: 'vendor-a' },
          },
          {
            query: ItemCountByVendorDocument,
            variables: { vendorId: 'vendor-b' },
          },
        ]),
      }),
    )
  })

  it('does not include ItemCountByVendorDocument when no vendorIds provided', async () => {
    // Given cloud mode and an item with no vendors
    localStorage.setItem('data-mode', 'cloud')
    mockCloudDeleteItem.mockResolvedValue({ data: { deleteItem: true } })

    const { result } = renderHook(() => useDeleteItem(), {
      wrapper: createWrapper(),
    })

    // When deleteItem.mutate is called without vendorIds
    await result.current.mutate({ id: 'item-2', vendorIds: [] })

    // Then cloudDelete refetchQueries only includes GetItemsDocument and GetRecipesDocument
    const callArg = mockCloudDeleteItem.mock.calls[0][0]
    const refetchQueries = callArg?.refetchQueries ?? []
    expect(
      refetchQueries.some(
        (q: { query: unknown }) => q.query === ItemCountByVendorDocument,
      ),
    ).toBe(false)
    expect(
      refetchQueries.some(
        (q: { query: unknown }) => q.query === GetItemsDocument,
      ),
    ).toBe(true)
    expect(
      refetchQueries.some(
        (q: { query: unknown }) => q.query === GetRecipesDocument,
      ),
    ).toBe(true)
  })
})
