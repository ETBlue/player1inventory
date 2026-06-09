import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useActiveCart,
  useAddToCart,
  useCheckout,
  useRemoveFromCart,
  useUpdateCartItem,
} from './useShoppingCart'

vi.mock('@/db/operations', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/db/operations')>()
  return {
    ...original,
    checkout: vi.fn().mockResolvedValue(undefined),
    getCart: vi.fn().mockResolvedValue({ id: 'cart-1' }),
    getCartItems: vi.fn().mockResolvedValue([]),
    addToCart: vi.fn().mockResolvedValue(undefined),
    updateCartItem: vi.fn().mockResolvedValue(undefined),
    removeFromCart: vi.fn().mockResolvedValue(undefined),
    abandonCart: vi.fn().mockResolvedValue(undefined),
  }
})

const mockCloudCheckout = vi.fn().mockResolvedValue({
  data: { checkout: { id: 'cart-1', status: 'completed' } },
})
const mockUseActiveCartQuery = vi.fn()
const mockAddToCartFn = vi
  .fn()
  .mockResolvedValue({ data: { addToCart: { id: 'ci-1' } } })
const mockRemoveFromCartFn = vi
  .fn()
  .mockResolvedValue({ data: { removeFromCart: true } })
const mockUpdateCartItemFn = vi
  .fn()
  .mockResolvedValue({ data: { updateCartItem: { id: 'ci-1' } } })

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useActiveCartQuery: () => mockUseActiveCartQuery(),
    useCartItemsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useAddToCartMutation: () => [mockAddToCartFn, { loading: false }],
    useUpdateCartItemMutation: () => [mockUpdateCartItemFn, { loading: false }],
    useRemoveFromCartMutation: () => [mockRemoveFromCartFn, { loading: false }],
    useCheckoutMutation: () => [mockCloudCheckout, {}],
    useAbandonCartMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
  }
})

function createWrapper(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
}

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

// ─── useActiveCart ────────────────────────────────────────────────────────────

describe('useActiveCart (cloud mode)', () => {
  it('deserializes ISO lastPurchasedAt string to Date in cloud mode', async () => {
    localStorage.setItem('data-mode', 'cloud')
    mockUseActiveCartQuery.mockReturnValue({
      data: {
        activeCart: {
          id: 'vendor-1',
          lastPurchasedAt: '2026-01-15T10:00:00.000Z',
        },
      },
      loading: false,
      error: undefined,
    })

    const { result } = renderHook(() => useActiveCart(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.data).toBeDefined())
    const cart = result.current.data as { lastPurchasedAt: unknown } | undefined
    expect(cart?.lastPurchasedAt).toBeInstanceOf(Date)
    expect((cart?.lastPurchasedAt as Date).getTime()).toBe(
      new Date('2026-01-15T10:00:00.000Z').getTime(),
    )
  })
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
      await result.current.mutateAsync({ cartId: 'cart-123' })
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
    const queriedDocs = callArgs.refetchQueries
      .filter(
        (rq: unknown) => typeof rq === 'object' && rq !== null && 'query' in rq,
      )
      .map(
        (rq: { query: { definitions: Array<{ name?: { value: string } }> } }) =>
          rq.query.definitions[0]?.name?.value,
      )
    expect(queriedDocs).toContain('GetItems')
  })
})

// ─── useCheckout — lastPurchase invalidation ──────────────────────────────────

describe('useCheckout (local mode) — refetches lastPurchase for inactive queries', () => {
  it('user can checkout — inactive lastPurchase queries are background-refetched so pantry badge shows fresh data immediately on next view', async () => {
    // Given local mode and a QueryClient with production staleTime
    localStorage.setItem('data-mode', 'local')
    const stalePurchaseDate = new Date('2026-01-01T00:00:00.000Z') // old purchase date
    const freshPurchaseDate = new Date('2026-04-07T10:00:00.000Z') // today (post-checkout)

    const lastPurchaseFn = vi.fn().mockResolvedValue(freshPurchaseDate)

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 1000 * 60 * 5, // same as production main.tsx
        },
      },
    })

    // Prime the cache with the stale (pre-checkout) data.
    // prefetchQuery also registers the queryFn on the cache entry, which is required
    // for background-refetch (invalidateQueries with refetchType: 'all') to work.
    // This simulates an ItemCard that was visited on the pantry page before the user
    // navigated to the shopping page (observer unsubscribed, data still in cache).
    await queryClient.prefetchQuery({
      queryKey: ['items', 'item-1', 'lastPurchase'],
      queryFn: lastPurchaseFn,
    })

    // Reset: the prefetch above counts as 1 call; we only care about post-checkout calls
    lastPurchaseFn.mockClear()

    // Sanity: data is cached and NOT invalidated (within staleTime window)
    expect(
      queryClient.getQueryData(['items', 'item-1', 'lastPurchase']),
    ).toEqual(freshPurchaseDate)
    // Force the cache to show the stale date so we can detect the refetch
    queryClient.setQueryData(
      ['items', 'item-1', 'lastPurchase'],
      stalePurchaseDate,
    )

    // When the checkout mutation fires (user is on shopping page; pantry is unmounted — no active observers)
    const { result } = renderHook(() => useCheckout(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({ cartId: 'cart-1' })
    })

    // Then: the lastPurchase queryFn must have been called (background refetch fired).
    // Without refetchType: 'all', invalidateQueries only marks active queries stale
    // and skips inactive ones — the stale date stays in cache until the user opens pantry,
    // causing a visible flash of old expiration data on the badge.
    await waitFor(() => expect(lastPurchaseFn).toHaveBeenCalled())

    // And the cached value must be the fresh post-checkout date (not the stale one)
    expect(
      queryClient.getQueryData(['items', 'item-1', 'lastPurchase']),
    ).toEqual(freshPurchaseDate)
  })
})

describe('useAddToCart (cloud mode)', () => {
  it('user can add to cart — refetches AllCartItems and AllCarts as DocumentNodes so stale shopping index cache is always refreshed even when unmounted', async () => {
    // Given cloud mode
    localStorage.setItem('data-mode', 'cloud')

    // When useAddToCart fires the mutation
    const { result } = renderHook(() => useAddToCart(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({
        cartId: 'c-1',
        itemId: 'i-1',
        quantity: 1,
      })
    })

    // Then the mutation call must include AllCartItems and AllCarts as DocumentNodes
    // (not strings). String-based refetchQueries are silently skipped when the
    // shopping index is unmounted — DocumentNode-based refetches always fire.
    expect(mockAddToCartFn).toHaveBeenCalled()
    const callArgs = mockAddToCartFn.mock.calls[0][0]
    const refetchQueries: unknown[] = callArgs?.refetchQueries ?? []
    const docNames = refetchQueries
      .filter(
        (
          rq,
        ): rq is {
          query: { definitions: Array<{ name?: { value: string } }> }
        } => typeof rq === 'object' && rq !== null && 'query' in rq,
      )
      .map((rq) => rq.query.definitions[0]?.name?.value)
    expect(docNames).toContain('AllCartItems')
    expect(docNames).toContain('AllCarts')
  })
})

describe('useRemoveFromCart (cloud mode)', () => {
  it('user can remove from cart — refetches AllCartItems and AllCarts as DocumentNodes so stale shopping index cache is always refreshed even when unmounted', async () => {
    // Given cloud mode
    localStorage.setItem('data-mode', 'cloud')

    // When useRemoveFromCart fires the mutation
    const { result } = renderHook(() => useRemoveFromCart(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync('ci-1')
    })

    // Then the mutation call must include AllCartItems and AllCarts as DocumentNodes
    expect(mockRemoveFromCartFn).toHaveBeenCalled()
    const callArgs = mockRemoveFromCartFn.mock.calls[0][0]
    const refetchQueries: unknown[] = callArgs?.refetchQueries ?? []
    const docNames = refetchQueries
      .filter(
        (
          rq,
        ): rq is {
          query: { definitions: Array<{ name?: { value: string } }> }
        } => typeof rq === 'object' && rq !== null && 'query' in rq,
      )
      .map((rq) => rq.query.definitions[0]?.name?.value)
    expect(docNames).toContain('AllCartItems')
    expect(docNames).toContain('AllCarts')
  })
})

describe('useUpdateCartItem (cloud mode)', () => {
  it('user can update cart item — refetches AllCartItems and AllCarts as DocumentNodes so stale shopping index cache is always refreshed even when unmounted', async () => {
    // Given cloud mode
    localStorage.setItem('data-mode', 'cloud')

    // When useUpdateCartItem fires the mutation
    const { result } = renderHook(() => useUpdateCartItem(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ cartItemId: 'ci-1', quantity: 2 })
    })

    // Then the mutation call must include AllCartItems and AllCarts as DocumentNodes
    expect(mockUpdateCartItemFn).toHaveBeenCalled()
    const callArgs = mockUpdateCartItemFn.mock.calls[0][0]
    const refetchQueries: unknown[] = callArgs?.refetchQueries ?? []
    const docNames = refetchQueries
      .filter(
        (
          rq,
        ): rq is {
          query: { definitions: Array<{ name?: { value: string } }> }
        } => typeof rq === 'object' && rq !== null && 'query' in rq,
      )
      .map((rq) => rq.query.definitions[0]?.name?.value)
    expect(docNames).toContain('AllCartItems')
    expect(docNames).toContain('AllCarts')
  })
})
