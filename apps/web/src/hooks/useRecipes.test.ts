import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as operations from '@/db/operations'
import { callArgs } from '@/test/narrow'
import {
  useConsumeRecipes,
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
let capturedItemCountByRecipeOptions: Record<string, unknown> | undefined
const mockCloudCreateRecipe = vi.fn()
const mockCloudUpdateRecipe = vi.fn()
const mockCloudDeleteRecipe = vi.fn()
const mockCloudUpdateRecipeLastCookedAt = vi.fn()
const mockCloudConsumeRecipes = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetRecipesQuery: () => mockUseGetRecipesQuery(),
    useGetRecipeQuery: () => mockUseGetRecipeQuery(),
    useItemCountByRecipeQuery: (options?: Record<string, unknown>) => {
      capturedItemCountByRecipeOptions = options
      return mockUseItemCountByRecipeQuery()
    },
    useCreateRecipeMutation: () => [mockCloudCreateRecipe, {}],
    useUpdateRecipeMutation: () => [mockCloudUpdateRecipe, {}],
    useDeleteRecipeMutation: () => [mockCloudDeleteRecipe, {}],
    useUpdateRecipeLastCookedAtMutation: () => [
      mockCloudUpdateRecipeLastCookedAt,
      {},
    ],
    useConsumeRecipesMutation: () => [mockCloudConsumeRecipes, {}],
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
  capturedItemCountByRecipeOptions = undefined
})

// ─── useRecipes ───────────────────────────────────────────────────────────────

describe('useRecipes (cloud mode)', () => {
  it('user can fetch recipes via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns recipes
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetRecipesQuery.mockReturnValue({
      data: {
        recipes: [{ id: 'r-1', name: 'Pancakes', items: [] }],
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

  it('deserializes ISO date strings to Date objects in cloud mode', async () => {
    // Given cloud mode and Apollo returns recipes with ISO date strings
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetRecipesQuery.mockReturnValue({
      data: {
        recipes: [
          {
            id: 'r-1',
            name: 'Pancakes',
            items: [],
            createdAt: '2026-01-15T10:00:00.000Z',
            updatedAt: '2026-01-16T10:00:00.000Z',
            lastCookedAt: '2026-01-17T10:00:00.000Z',
          },
        ],
      },
      loading: false,
      error: undefined,
    })

    // When the hook is called
    const { result } = renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    })

    // Then date fields are Date instances, not strings
    await waitFor(() => expect(result.current.data).toBeDefined())
    const recipe = result.current.data?.[0] as
      | {
          createdAt: unknown
          updatedAt: unknown
          lastCookedAt: unknown
        }
      | undefined
    expect(recipe?.createdAt).toBeInstanceOf(Date)
    expect((recipe?.createdAt as Date).getTime()).toBe(
      new Date('2026-01-15T10:00:00.000Z').getTime(),
    )
    expect(recipe?.updatedAt).toBeInstanceOf(Date)
    expect(recipe?.lastCookedAt).toBeInstanceOf(Date)
  })
})

// ─── useRecipe ────────────────────────────────────────────────────────────────

describe('useRecipe (cloud mode)', () => {
  it('user can fetch a single recipe via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns a recipe
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetRecipeQuery.mockReturnValue({
      data: {
        recipe: { id: 'r-1', name: 'Pancakes', items: [] },
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

  it('deserializes ISO date strings to Date objects for a single recipe in cloud mode', async () => {
    // Given cloud mode and Apollo returns a recipe with ISO date strings
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetRecipeQuery.mockReturnValue({
      data: {
        recipe: {
          id: 'r-1',
          name: 'Pancakes',
          items: [],
          createdAt: '2026-01-15T10:00:00.000Z',
          updatedAt: '2026-01-16T10:00:00.000Z',
        },
      },
      loading: false,
      error: undefined,
    })

    // When the hook is called
    const { result } = renderHook(() => useRecipe('r-1'), {
      wrapper: createWrapper(),
    })

    // Then date fields are Date instances, not strings
    await waitFor(() => expect(result.current.data).toBeDefined())
    const recipe = result.current.data as
      | { createdAt: unknown; updatedAt: unknown }
      | null
      | undefined
    expect(recipe?.createdAt).toBeInstanceOf(Date)
    expect((recipe?.createdAt as Date).getTime()).toBe(
      new Date('2026-01-15T10:00:00.000Z').getTime(),
    )
    expect(recipe?.updatedAt).toBeInstanceOf(Date)
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

    // Then it delegates to cloudUpdate with the variables only. The reads
    // after the write are sent by `refetchAfterWrite`, not by the mutation's
    // own `refetchQueries`, so a failed read cannot reject the save. That
    // behaviour, and the wait for the reads, is tested against real Apollo in
    // `useUpdateRecipe.cloud.test.tsx`.
    expect(mockCloudUpdateRecipe).toHaveBeenCalledWith({
      variables: { id: 'r-1', name: 'Waffles' },
    })
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

  it('useItemCountByRecipeQuery is called with fetchPolicy cache-and-network to avoid stale counts after recipe update', () => {
    // Given cloud mode — item counts can go stale after useUpdateRecipe because
    // the previous cache.modify() DELETE approach has been replaced by
    // cache-and-network to fetch fresh counts on mount
    localStorage.setItem('data-mode', 'cloud')
    mockUseItemCountByRecipeQuery.mockReturnValue({
      data: { itemCountByRecipe: 3 },
      loading: false,
      error: undefined,
    })

    // When the hook is rendered
    renderHook(() => useItemCountByRecipe('r-1'), {
      wrapper: createWrapper(),
    })

    // Then Apollo is called with fetchPolicy: 'cache-and-network'
    expect(capturedItemCountByRecipeOptions).toMatchObject({
      fetchPolicy: 'cache-and-network',
    })
  })
})

// ─── useConsumeRecipes ────────────────────────────────────────────────────────
//
// Households H3b task B.6 moved the final-number computation for LOCAL mode
// from `cooking.tsx` into this hook. The page sends `delta` (minus the amount
// used); the local branch computes the new stock and the log total from
// `localStock` with the shared `consumeItem` and `getPackedTotal`. These pin
// the exact numbers, with an item that tracks in measurement, so that opening
// a package and converting the log total to packages are both visible.

describe('useConsumeRecipes (local mode)', () => {
  // 6 per package, tracked in measurement: 2 packages and 1 loose unit.
  const OIL = {
    id: 'item-oil',
    targetUnit: 'measurement' as const,
    measurementUnit: 'ml',
    amountPerPackage: 6,
    consumeAmount: 1,
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 2,
    unpackedQuantity: 1,
  }

  it('user cooking in local mode writes the numbers consumeItem computes from the stock shown', async () => {
    // Given local mode, and a batch write that records what it is given
    const batch = vi
      .spyOn(operations, 'consumeRecipesBatch')
      .mockResolvedValue(undefined)
    const { result } = renderHook(() => useConsumeRecipes(), {
      wrapper: createWrapper(),
    })
    const occurredAt = new Date('2026-11-15T00:00:00.000Z')

    // When 4 ml are used
    await result.current.mutateAsync({
      occurredAt,
      recipeIds: ['recipe-1'],
      items: [
        {
          itemId: OIL.id,
          delta: -4,
          note: 'consumed via Salad',
          logKey: 'cooking.log.consumedVia',
          logParams: { recipes: 'Salad' },
        },
      ],
      localStock: [OIL],
    })

    // Then the 1 loose ml is used, one package is opened for the other 3,
    // and 3 ml of it are left: 1 package + 3 ml. The log total in packages
    // is 1 + 3/6 = 1.5. The log keeps the full delta.
    expect(batch).toHaveBeenCalledTimes(1)
    expect(callArgs(batch.mock, 0)[0]).toEqual({
      occurredAt,
      recipeIds: ['recipe-1'],
      locationId: 'local',
      items: [
        {
          itemId: OIL.id,
          packedQuantity: 1,
          unpackedQuantity: 3,
          delta: -4,
          quantity: 1.5,
          note: 'consumed via Salad',
          logKey: 'cooking.log.consumedVia',
          logParams: { recipes: 'Salad' },
        },
      ],
    })
    // And the cloud mutation is not called
    expect(mockCloudConsumeRecipes).not.toHaveBeenCalled()
    batch.mockRestore()
  })
})
