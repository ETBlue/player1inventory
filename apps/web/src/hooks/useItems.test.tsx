import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useItem } from './useItems'

const mockUseGetItemQuery = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetItemQuery: () => mockUseGetItemQuery(),
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
