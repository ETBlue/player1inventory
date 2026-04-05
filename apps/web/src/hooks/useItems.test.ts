import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GetItemsDocument,
  GetRecipesDocument,
  ItemCountByTagDocument,
  ItemCountByVendorDocument,
} from '@/generated/graphql'
import type { Item } from '@/types'
import { toUpdateItemInput, useDeleteItem } from './useItems'

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

  it('refetches ItemCountByTagDocument for each tagId when deleting in cloud mode', async () => {
    // Given cloud mode and an item that belongs to two tags
    localStorage.setItem('data-mode', 'cloud')
    mockCloudDeleteItem.mockResolvedValue({ data: { deleteItem: true } })

    // When deleteItem.mutate is called with tagIds
    const { result } = renderHook(() => useDeleteItem(), {
      wrapper: createWrapper(),
    })

    await result.current.mutate({
      id: 'item-1',
      tagIds: ['tag-a', 'tag-b'],
    })

    // Then cloudDelete is called with refetchQueries that include
    // ItemCountByTagDocument for each tag
    expect(mockCloudDeleteItem).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { id: 'item-1' },
        refetchQueries: expect.arrayContaining([
          { query: GetItemsDocument },
          { query: GetRecipesDocument },
          {
            query: ItemCountByTagDocument,
            variables: { tagId: 'tag-a' },
          },
          {
            query: ItemCountByTagDocument,
            variables: { tagId: 'tag-b' },
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

// ─── toUpdateItemInput ─────────────────────────────────────────────────────────

describe('toUpdateItemInput', () => {
  it('does not include optional fields absent from the payload', () => {
    // Given a partial update that only sets quantity fields
    const input = { packedQuantity: 3, unpackedQuantity: 0 }

    // When converted to GraphQL input
    const result = toUpdateItemInput(input)

    // Then the 7 optional clearable fields must be absent from the output
    expect(result).not.toHaveProperty('packageUnit')
    expect(result).not.toHaveProperty('measurementUnit')
    expect(result).not.toHaveProperty('amountPerPackage')
    expect(result).not.toHaveProperty('estimatedDueDays')
    expect(result).not.toHaveProperty('expirationThreshold')
    expect(result).not.toHaveProperty('expirationMode')
    expect(result).not.toHaveProperty('dueDate')
  })

  it('sends null for an optional field explicitly set to undefined', () => {
    // Given an update that deliberately includes packageUnit as undefined
    // (meaning: clear this field in the DB)
    const input: Partial<Item> = { packedQuantity: 3, packageUnit: undefined }

    // When converted to GraphQL input
    const result = toUpdateItemInput(input)

    // Then packageUnit is present with value null
    expect(result).toHaveProperty('packageUnit', null)
  })

  it('serializes a full payload including all optional fields', () => {
    // Given a complete update payload from the full ItemForm
    const dueDate = new Date('2026-12-01')
    const input: Partial<Item> = {
      packedQuantity: 2,
      unpackedQuantity: 0,
      packageUnit: 'pack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      estimatedDueDays: 7,
      expirationThreshold: 3,
      expirationMode: 'date',
      dueDate,
    }

    // When converted to GraphQL input
    const result = toUpdateItemInput(input)

    // Then all optional fields are present with correct values
    expect(result.packageUnit).toBe('pack')
    expect(result.measurementUnit).toBe('g')
    expect(result.amountPerPackage).toBe(500)
    expect(result.estimatedDueDays).toBe(7)
    expect(result.expirationThreshold).toBe(3)
    expect(result.expirationMode).toBe('date')
    expect(result.dueDate).toBe(dueDate.toISOString())
  })
})
