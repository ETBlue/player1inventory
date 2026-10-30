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
import { callArgs } from '@/test/narrow'
import type { Item, StockFields } from '@/types'
import { toUpdateItemInput, useDeleteItem } from './useItems'

// `toUpdateItemInput` accepts `Partial<Item> & Partial<StockFields>` — the
// joined shape a `PantryItem` edit produces (src/hooks/useItems.ts:165-167).
type ItemUpdate = Partial<Item> & Partial<StockFields>

// Add clearable keys with the value `undefined`, as own enumerable properties.
//
// `buildInfoUpdates` (src/routes/items/$id/index.tsx:112-134) sets a clearable
// key to `undefined` rather than deleting it, because `toUpdateItemInput` tests
// `'packageUnit' in rest` (src/hooks/useItems.ts:184-201) and sends `null` only
// when the key is PRESENT. Omitting the key would test the opposite branch.
//
// `exactOptionalPropertyTypes: true` makes the literal `{ packageUnit:
// undefined }` unassignable to `Partial<Item>`, which is why the production
// call site casts (`buildInfoUpdates(values) as Partial<Item>`,
// src/routes/items/$id/index.tsx:227). `Object.assign` produces the same
// runtime shape with no cast: it sets each key through [[Set]], so the key
// exists and its value is `undefined`.
function withClearedKeys<T extends ItemUpdate>(
  base: T,
  keys: readonly (keyof Item)[],
): T {
  return Object.assign(
    base,
    Object.fromEntries(keys.map((key) => [key, undefined])),
  )
}

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
    const callArg = callArgs(mockCloudDeleteItem.mock, 0)[0]
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

    // Then the 9 optional clearable fields must be absent from the output
    expect(result).not.toHaveProperty('wikidataUrl')
    expect(result).not.toHaveProperty('note')
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
    const input = withClearedKeys<ItemUpdate>({ packedQuantity: 3 }, [
      'packageUnit',
    ])

    // When converted to GraphQL input
    const result = toUpdateItemInput(input)

    // Then packageUnit is present with value null
    expect(result).toHaveProperty('packageUnit', null)
  })

  // Issue #335. `buildInfoUpdates` (routes/items/$id/index.tsx) sets the key to
  // `undefined` when the user empties the Info-tab field. Apollo DROPS an
  // undefined-valued key from its JSON variables, so without a `?? null` guard
  // the server reads the field as absent and keeps the old text. These two
  // fields had no guard until #335, because until then the cloud `Item` type
  // declared neither and every such save failed outright.
  it('user can clear a saved note and wikidata URL in cloud mode', () => {
    // Given an Info-tab save where the user emptied both fields
    const input = withClearedKeys<ItemUpdate>({ name: 'Oat Milk' }, [
      'wikidataUrl',
      'note',
    ])

    // When converted to GraphQL input
    const result = toUpdateItemInput(input)

    // Then both are sent as null, which is the server's instruction to clear
    // the column. `undefined` would be dropped and change nothing.
    expect(result).toHaveProperty('wikidataUrl', null)
    expect(result).toHaveProperty('note', null)
  })

  it('passes a filled note and wikidata URL straight through', () => {
    // Given an Info-tab save with both fields filled
    const input: ItemUpdate = {
      wikidataUrl: 'https://www.wikidata.org/wiki/Q8495',
      note: 'Buy the 1L carton.',
    }

    // When converted to GraphQL input
    const result = toUpdateItemInput(input)

    // Then the values reach the server unchanged
    expect(result.wikidataUrl).toBe('https://www.wikidata.org/wiki/Q8495')
    expect(result.note).toBe('Buy the 1L carton.')
  })

  it('serializes a full payload including all optional fields', () => {
    // Given a complete update payload from the full ItemForm
    const dueDate = new Date('2026-12-01')
    const input: ItemUpdate = {
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
    // `UpdateItemInput` declares no `dueDate` (src/generated/graphql.ts:1078)
    // even though `toUpdateItemInput` writes one — `toConfigInput` strips it
    // again before the mutation (src/hooks/useItems.ts:308-312). So the read
    // goes through `toHaveProperty`, which checks the same exact value and
    // matches the sibling test at line 195.
    expect(result).toHaveProperty('dueDate', dueDate.toISOString())
  })
})
