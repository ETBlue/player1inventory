import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCheckout } from './useShoppingCart'

const mockCloudCheckout = vi
  .fn()
  .mockResolvedValue({
    data: { checkout: { id: 'cart-1', status: 'completed' } },
  })

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useActiveCartQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useCartItemsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useAddToCartMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useUpdateCartItemMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useRemoveFromCartMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useCheckoutMutation: () => [mockCloudCheckout, {}],
    useAbandonCartMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
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

describe('useCheckout (cloud mode)', () => {
  it('user can checkout — refetches items so packedQuantity updates on screen', async () => {
    // Given cloud mode
    localStorage.setItem('data-mode', 'cloud')

    // When checkout is called
    const { result } = renderHook(() => useCheckout(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync('cart-123')
    })

    // Then the Apollo mutation must be called with GetItemsDocument in refetchQueries
    // so that item packedQuantity values are refreshed after checkout
    expect(mockCloudCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchQueries: expect.arrayContaining([
          expect.objectContaining({
            query: expect.objectContaining({ kind: 'Document' }),
          }),
        ]),
      }),
    )

    // More specifically: GetItemsDocument must be included (not just Cart-related docs)
    const callArgs = mockCloudCheckout.mock.calls[0][0]
    const queriedDocs = callArgs.refetchQueries.map(
      (rq: { query: { definitions: Array<{ name?: { value: string } }> } }) =>
        rq.query.definitions[0]?.name?.value,
    )
    expect(queriedDocs).toContain('GetItems')
  })
})
