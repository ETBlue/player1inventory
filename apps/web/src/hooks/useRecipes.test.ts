import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useCreateRecipe,
  useDeleteRecipe,
  useItemCountByRecipe,
  useRecipe,
  useRecipes,
  useUpdateRecipe,
  useUpdateRecipeLastCookedAt,
} from './useRecipes'

const mockUseGetRecipesQuery = vi.fn()
const mockUseGetRecipeQuery = vi.fn()
const mockUseItemCountByRecipeQuery = vi.fn()
const mockCloudCreateRecipe = vi.fn()
const mockCloudUpdateRecipe = vi.fn()
const mockCloudDeleteRecipe = vi.fn()
const mockCloudUpdateRecipeLastCookedAt = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetRecipesQuery: () => mockUseGetRecipesQuery(),
    useGetRecipeQuery: () => mockUseGetRecipeQuery(),
    useItemCountByRecipeQuery: () => mockUseItemCountByRecipeQuery(),
    useCreateRecipeMutation: () => [mockCloudCreateRecipe, {}],
    useUpdateRecipeMutation: () => [mockCloudUpdateRecipe, {}],
    useDeleteRecipeMutation: () => [mockCloudDeleteRecipe, {}],
    useUpdateRecipeLastCookedAtMutation: () => [
      mockCloudUpdateRecipeLastCookedAt,
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

// ─── useRecipes ───────────────────────────────────────────────────────────────

describe('useRecipes (cloud mode)', () => {
  it('user can fetch recipes via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns recipes
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetRecipesQuery.mockReturnValue({
      data: {
        recipes: [{ id: 'r-1', name: 'Pancakes', items: [], userId: 'u1' }],
      },
      loading: false,
      error: undefined,
    })

    // When the hook is called
    const { result } = renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    })

    // Then it returns recipes from Apollo
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.[0]?.name).toBe('Pancakes')
  })
})

// ─── useRecipe ────────────────────────────────────────────────────────────────

describe('useRecipe (cloud mode)', () => {
  it('user can fetch a single recipe via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns a recipe
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetRecipeQuery.mockReturnValue({
      data: {
        recipe: { id: 'r-1', name: 'Pancakes', items: [], userId: 'u1' },
      },
      loading: false,
      error: undefined,
    })

    // When the hook is called
    const { result } = renderHook(() => useRecipe('r-1'), {
      wrapper: createWrapper(),
    })

    // Then it returns the recipe from Apollo
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(
      (result.current.data as { name: string } | null | undefined)?.name,
    ).toBe('Pancakes')
  })
})

// ─── useCreateRecipe ──────────────────────────────────────────────────────────

describe('useCreateRecipe (cloud mode)', () => {
  it('user can create a recipe via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudCreateRecipe.mockResolvedValue({
      data: { createRecipe: { id: 'r-new', name: 'Waffles', items: [] } },
    })
    mockUseGetRecipesQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useCreateRecipe(), {
      wrapper: createWrapper(),
    })
    const created = await result.current.mutateAsync({ name: 'Waffles' })

    // Then it delegates to cloudCreate
    expect(mockCloudCreateRecipe).toHaveBeenCalledWith({
      variables: { name: 'Waffles' },
    })
    expect((created as { name: string } | undefined)?.name).toBe('Waffles')
  })

  it('user can create a recipe with items via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudCreateRecipe.mockResolvedValue({
      data: {
        createRecipe: {
          id: 'r-new',
          name: 'Omelette',
          items: [{ itemId: 'item-eggs', defaultAmount: 3 }],
        },
      },
    })
    mockUseGetRecipesQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called with items
    const { result } = renderHook(() => useCreateRecipe(), {
      wrapper: createWrapper(),
    })
    await result.current.mutateAsync({
      name: 'Omelette',
      items: [{ itemId: 'item-eggs', defaultAmount: 3 }],
    })

    // Then items are passed to cloudCreate
    expect(mockCloudCreateRecipe).toHaveBeenCalledWith({
      variables: {
        name: 'Omelette',
        items: [{ itemId: 'item-eggs', defaultAmount: 3 }],
      },
    })
  })
})

// ─── useUpdateRecipe ──────────────────────────────────────────────────────────

describe('useUpdateRecipe (cloud mode)', () => {
  it('user can update a recipe via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudUpdateRecipe.mockResolvedValue({
      data: { updateRecipe: { id: 'r-1', name: 'Waffles', items: [] } },
    })
    mockUseGetRecipesQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useUpdateRecipe(), {
      wrapper: createWrapper(),
    })
    const updated = await result.current.mutateAsync({
      id: 'r-1',
      updates: { name: 'Waffles' },
    })

    // Then it delegates to cloudUpdate with variables + refetch config
    expect(mockCloudUpdateRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { id: 'r-1', name: 'Waffles' },
        awaitRefetchQueries: true,
      }),
    )
    expect((updated as { name: string } | undefined)?.name).toBe('Waffles')
  })
})

// ─── useDeleteRecipe ──────────────────────────────────────────────────────────

describe('useDeleteRecipe (cloud mode)', () => {
  it('user can delete a recipe via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudDeleteRecipe.mockResolvedValue({ data: { deleteRecipe: true } })
    mockUseGetRecipesQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useDeleteRecipe(), {
      wrapper: createWrapper(),
    })
    const deleted = await result.current.mutateAsync('r-1')

    // Then it delegates to cloudDelete
    expect(mockCloudDeleteRecipe).toHaveBeenCalledWith({
      variables: { id: 'r-1' },
    })
    expect(deleted).toBe(true)
  })
})

// ─── useUpdateRecipeLastCookedAt ──────────────────────────────────────────────

describe('useUpdateRecipeLastCookedAt (cloud mode)', () => {
  it('user can mark a recipe as last cooked via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    const now = new Date().toISOString()
    mockCloudUpdateRecipeLastCookedAt.mockResolvedValue({
      data: { updateRecipeLastCookedAt: { id: 'r-1', lastCookedAt: now } },
    })
    mockUseGetRecipesQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useUpdateRecipeLastCookedAt(), {
      wrapper: createWrapper(),
    })
    const updated = await result.current.mutateAsync('r-1')

    // Then it delegates to cloudUpdate
    expect(mockCloudUpdateRecipeLastCookedAt).toHaveBeenCalledWith({
      variables: { id: 'r-1' },
    })
    expect(
      (updated as { lastCookedAt: string } | undefined)?.lastCookedAt,
    ).toBe(now)
  })
})

// ─── useItemCountByRecipe ─────────────────────────────────────────────────────

describe('useItemCountByRecipe (cloud mode)', () => {
  it('user can get item count for a recipe via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns item count
    localStorage.setItem('data-mode', 'cloud')
    mockUseItemCountByRecipeQuery.mockReturnValue({
      data: { itemCountByRecipe: 3 },
      loading: false,
      error: undefined,
    })

    // When the hook is called with a recipeId
    const { result } = renderHook(() => useItemCountByRecipe('r-1'), {
      wrapper: createWrapper(),
    })

    // Then it returns the count from Apollo
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toBe(3)
  })
})
