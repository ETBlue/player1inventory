import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useCreateTag,
  useCreateTagType,
  useDeleteTag,
  useDeleteTagType,
  useItemCountByTag,
  useTagCountByType,
  useTags,
  useTagsByType,
  useTagTypes,
  useUpdateTag,
  useUpdateTagType,
} from './useTags'

const mockUseGetTagTypesQuery = vi.fn()
const mockUseGetTagsQuery = vi.fn()
const mockUseGetTagsByTypeQuery = vi.fn()
const mockUseItemCountByTagQuery = vi.fn()
const mockUseTagCountByTypeQuery = vi.fn()
const mockCloudCreateTagType = vi.fn()
const mockCloudUpdateTagType = vi.fn()
const mockCloudDeleteTagType = vi.fn()
const mockCloudCreateTag = vi.fn()
const mockCloudUpdateTag = vi.fn()
const mockCloudDeleteTag = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetTagTypesQuery: () => mockUseGetTagTypesQuery(),
    useGetTagsQuery: () => mockUseGetTagsQuery(),
    useGetTagsByTypeQuery: () => mockUseGetTagsByTypeQuery(),
    useItemCountByTagQuery: () => mockUseItemCountByTagQuery(),
    useTagCountByTypeQuery: () => mockUseTagCountByTypeQuery(),
    useCreateTagTypeMutation: () => [mockCloudCreateTagType, {}],
    useUpdateTagTypeMutation: () => [mockCloudUpdateTagType, {}],
    useDeleteTagTypeMutation: () => [mockCloudDeleteTagType, {}],
    useCreateTagMutation: () => [mockCloudCreateTag, {}],
    useUpdateTagMutation: () => [mockCloudUpdateTag, {}],
    useDeleteTagMutation: () => [mockCloudDeleteTag, {}],
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

// ─── useTagTypes ──────────────────────────────────────────────────────────────

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

// ─── useCreateTagType ─────────────────────────────────────────────────────────

describe('useCreateTagType (cloud mode)', () => {
  it('user can create a tag type via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudCreateTagType.mockResolvedValue({
      data: {
        createTagType: {
          id: 'tt-new',
          name: 'Category',
          color: 'teal',
          userId: 'u1',
        },
      },
    })
    mockUseGetTagTypesQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useCreateTagType(), {
      wrapper: createWrapper(),
    })
    const created = await result.current.mutateAsync({
      name: 'Category',
      color: 'teal',
    })

    // Then it delegates to cloudCreate
    expect(mockCloudCreateTagType).toHaveBeenCalledWith({
      variables: { name: 'Category', color: 'teal' },
    })
    expect((created as { name: string } | undefined)?.name).toBe('Category')
  })
})

// ─── useUpdateTagType ─────────────────────────────────────────────────────────

describe('useUpdateTagType (cloud mode)', () => {
  it('user can update a tag type via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudUpdateTagType.mockResolvedValue({
      data: { updateTagType: { id: 'tt-1', name: 'New Name', color: 'red' } },
    })
    mockUseGetTagTypesQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useUpdateTagType(), {
      wrapper: createWrapper(),
    })
    const updated = await result.current.mutateAsync({
      id: 'tt-1',
      updates: { name: 'New Name', color: 'red' },
    })

    // Then it delegates to cloudUpdate
    expect(mockCloudUpdateTagType).toHaveBeenCalledWith({
      variables: { id: 'tt-1', name: 'New Name', color: 'red' },
    })
    expect((updated as { name: string } | undefined)?.name).toBe('New Name')
  })
})

// ─── useDeleteTagType ─────────────────────────────────────────────────────────

describe('useDeleteTagType (cloud mode)', () => {
  it('user can delete a tag type via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudDeleteTagType.mockResolvedValue({ data: { deleteTagType: true } })
    mockUseGetTagTypesQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })
    mockUseGetTagsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useDeleteTagType(), {
      wrapper: createWrapper(),
    })
    const deleted = await result.current.mutateAsync('tt-1')

    // Then it delegates to cloudDelete
    expect(mockCloudDeleteTagType).toHaveBeenCalledWith({
      variables: { id: 'tt-1' },
    })
    expect(deleted).toBe(true)
  })
})

// ─── useTags ──────────────────────────────────────────────────────────────────

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

// ─── useTagsByType ────────────────────────────────────────────────────────────

describe('useTagsByType (cloud mode)', () => {
  it('user can fetch tags filtered by type via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns tags for the given type
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetTagsByTypeQuery.mockReturnValue({
      data: {
        tagsByType: [
          { id: 'tag-1', name: 'Dairy', typeId: 'tt-1', userId: 'u1' },
        ],
      },
      loading: false,
      error: undefined,
    })

    // When the hook is called with a typeId
    const { result } = renderHook(() => useTagsByType('tt-1'), {
      wrapper: createWrapper(),
    })

    // Then it returns filtered tags from Apollo
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.[0]?.name).toBe('Dairy')
  })
})

// ─── useCreateTag ─────────────────────────────────────────────────────────────

describe('useCreateTag (cloud mode)', () => {
  it('user can create a tag via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudCreateTag.mockResolvedValue({
      data: {
        createTag: {
          id: 'tag-new',
          name: 'Dairy',
          typeId: 'tt-1',
          userId: 'u1',
        },
      },
    })
    mockUseGetTagsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useCreateTag(), {
      wrapper: createWrapper(),
    })
    const created = await result.current.mutateAsync({
      name: 'Dairy',
      typeId: 'tt-1',
      userId: 'u1',
    })

    // Then it delegates to cloudCreate
    expect(mockCloudCreateTag).toHaveBeenCalledWith({
      variables: { name: 'Dairy', typeId: 'tt-1' },
    })
    expect((created as { name: string } | undefined)?.name).toBe('Dairy')
  })
})

// ─── useUpdateTag ─────────────────────────────────────────────────────────────

describe('useUpdateTag (cloud mode)', () => {
  it('user can update a tag via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudUpdateTag.mockResolvedValue({
      data: { updateTag: { id: 'tag-1', name: 'Meat', typeId: 'tt-1' } },
    })
    mockUseGetTagsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useUpdateTag(), {
      wrapper: createWrapper(),
    })
    const updated = await result.current.mutateAsync({
      id: 'tag-1',
      updates: { name: 'Meat' },
    })

    // Then it delegates to cloudUpdate
    expect(mockCloudUpdateTag).toHaveBeenCalledWith({
      variables: { id: 'tag-1', name: 'Meat' },
    })
    expect((updated as { name: string } | undefined)?.name).toBe('Meat')
  })
})

// ─── useDeleteTag ─────────────────────────────────────────────────────────────

describe('useDeleteTag (cloud mode)', () => {
  it('user can delete a tag via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudDeleteTag.mockResolvedValue({ data: { deleteTag: true } })
    mockUseGetTagsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useDeleteTag(), {
      wrapper: createWrapper(),
    })
    const deleted = await result.current.mutateAsync('tag-1')

    // Then it delegates to cloudDelete
    expect(mockCloudDeleteTag).toHaveBeenCalledWith({
      variables: { id: 'tag-1' },
    })
    expect(deleted).toBe(true)
  })
})

// ─── useItemCountByTag ────────────────────────────────────────────────────────

describe('useItemCountByTag (cloud mode)', () => {
  it('user can get item count for a tag via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns item count
    localStorage.setItem('data-mode', 'cloud')
    mockUseItemCountByTagQuery.mockReturnValue({
      data: { itemCountByTag: 3 },
      loading: false,
      error: undefined,
    })

    // When the hook is called with a tagId
    const { result } = renderHook(() => useItemCountByTag('tag-1'), {
      wrapper: createWrapper(),
    })

    // Then it returns the count from Apollo
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toBe(3)
  })
})

// ─── useTagCountByType ────────────────────────────────────────────────────────

describe('useTagCountByType (cloud mode)', () => {
  it('user can get tag count for a type via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns tag count
    localStorage.setItem('data-mode', 'cloud')
    mockUseTagCountByTypeQuery.mockReturnValue({
      data: { tagCountByType: 5 },
      loading: false,
      error: undefined,
    })

    // When the hook is called with a typeId
    const { result } = renderHook(() => useTagCountByType('tt-1'), {
      wrapper: createWrapper(),
    })

    // Then it returns the count from Apollo
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toBe(5)
  })
})
