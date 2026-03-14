import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTags, useTagTypes } from './useTags'

const mockUseGetTagTypesQuery = vi.fn()
const mockUseGetTagsQuery = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetTagTypesQuery: () => mockUseGetTagTypesQuery(),
    useGetTagsQuery: () => mockUseGetTagsQuery(),
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

describe('useTagTypes (cloud mode)', () => {
  it('user can fetch tag types via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns tag types
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetTagTypesQuery.mockReturnValue({
      data: {
        tagTypes: [
          { id: 'tt-1', name: 'Category', color: 'teal', userId: 'u1' },
        ],
      },
      loading: false,
      error: undefined,
    })

    // When the hook is called
    const { result } = renderHook(() => useTagTypes(), {
      wrapper: createWrapper(),
    })

    // Then it returns tag types from Apollo
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.[0]?.name).toBe('Category')
  })
})

describe('useTags (cloud mode)', () => {
  it('user can fetch tags via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns tags
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetTagsQuery.mockReturnValue({
      data: {
        tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'tt-1', userId: 'u1' }],
      },
      loading: false,
      error: undefined,
    })

    // When the hook is called
    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() })

    // Then it returns tags from Apollo
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.[0]?.name).toBe('Dairy')
  })
})
