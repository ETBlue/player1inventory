import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '@/routeTree.gen'

// Cloud mode has no ItemStock backend yet (deferred in the Location feature,
// PR D): `useItems()` returns cloud items with inline stock and no `stockId`.
// These tests pin the pre-split cooking behaviour for cloud users.

const emptyQuery = { data: undefined, loading: false, error: undefined }

const mockUseGetItemsQuery = vi.fn()
const mockUseGetRecipesQuery = vi.fn()
const mockConsumeRecipes = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetItemsQuery: () => mockUseGetItemsQuery(),
    useGetRecipesQuery: () => mockUseGetRecipesQuery(),
    useConsumeRecipesMutation: () => [mockConsumeRecipes, {}],
    useGetTagsQuery: () => emptyQuery,
    useGetTagTypesQuery: () => emptyQuery,
    useGetVendorsQuery: () => emptyQuery,
    useLastPurchaseDatesQuery: () => emptyQuery,
    useCreateRecipeMutation: () => [vi.fn(), {}],
  }
})

const CLOUD_ITEM = {
  id: 'item-flour',
  name: 'Flour',
  tagIds: [],
  targetUnit: 'package',
  targetQuantity: 10,
  refillThreshold: 2,
  packedQuantity: 5,
  unpackedQuantity: 0,
  consumeAmount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const CLOUD_RECIPE = {
  id: 'recipe-pasta',
  name: 'Pasta',
  items: [{ itemId: CLOUD_ITEM.id, defaultAmount: 2 }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastCookedAt: null,
}

describe('Use (Cooking) Page — cloud mode', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetItemsQuery.mockReturnValue({
      ...emptyQuery,
      data: { items: [CLOUD_ITEM] },
      networkStatus: 7,
      refetch: vi.fn(),
    })
    mockUseGetRecipesQuery.mockReturnValue({
      ...emptyQuery,
      data: { recipes: [CLOUD_RECIPE] },
    })
    mockConsumeRecipes.mockResolvedValue({ data: undefined })
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    sessionStorage.clear()
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
    vi.clearAllMocks()
  })

  const renderPage = () => {
    const history = createMemoryHistory({ initialEntries: ['/cooking'] })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can check a recipe item in cloud mode', async () => {
    // Given a cloud recipe whose item is not marked as stocked anywhere
    renderPage()
    const user = userEvent.setup()

    // When the user expands the recipe
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Expand Pasta/i }),
      ).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))

    // Then the item is shown as available (no "not stocked" note)
    await waitFor(() => expect(screen.getByText('Flour')).toBeInTheDocument())
    expect(
      screen.queryByText(/not stocked in this location/i),
    ).not.toBeInTheDocument()

    // And checking the recipe checks its item, enabling Done
    await user.click(screen.getByLabelText('Pasta'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /done/i })).toBeEnabled(),
    )
  })

  it('user can consume a recipe in cloud mode', async () => {
    // Given a cloud recipe with one item at defaultAmount 2
    renderPage()
    const user = userEvent.setup()

    // When the user checks the recipe and confirms Done
    await waitFor(() =>
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument(),
    )
    await user.click(screen.getByLabelText('Pasta'))
    await user.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /confirm/i }),
      ).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    // Then the consume mutation is sent with the item's consumed quantity
    await waitFor(() => expect(mockConsumeRecipes).toHaveBeenCalled())
    const variables = mockConsumeRecipes.mock.calls[0][0].variables
    expect(variables.input.recipeIds).toEqual([CLOUD_RECIPE.id])
    expect(variables.input.items).toHaveLength(1)
    expect(variables.input.items[0]).toMatchObject({
      itemId: CLOUD_ITEM.id,
      delta: -2,
      packedQuantity: 3,
    })
  })
})
