import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import { CLOUD_LOCATIONS, LOC_A } from '@/test/cloudFixtures'
import { asPantryDataResult } from '@/test/pantryData'

// The cooking page in CLOUD mode, after PR 3b gave the cook its own location.
//
// Cloud used to bypass the location gate here — not because a cloud item had no
// `stockId` (it has carried one since PR 2) but because `consumeRecipes` wrote
// the caller's DEFAULT location, so the list was scoped to one location and the
// cook took stock out of another. Task 3 added `ConsumeRecipesInput.locationId`
// and Task 4 made it required, so both halves name the same location and the
// gate — with its "not stocked here" divider — runs in cloud too.
//
// THE FIXTURE IS THE TEST. Flour is stocked at LOC_A, the active location.
// "Cold Brew" needs Coffee, which is stocked NOWHERE the active location can
// see, so it must sink. Without an item the gate can exclude, every assertion
// below would pass against the old bypass.

const emptyQuery = { data: undefined, loading: false, error: undefined }

const mockUseGetItemsQuery = vi.fn()
const mockUseGetRecipesQuery = vi.fn()
const mockConsumeRecipes = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    // `useLocations` is dual-mode, so it calls `useGetLocationsQuery` in BOTH
    // modes (skipped in local). This per-file factory REPLACES the one in
    // `src/test/setup.ts` rather than layering on it, so the location stubs
    // have to be repeated here or the real Apollo hook runs and demands a
    // provider. Placed right after `...original` so this file's own overrides
    // below still win.
    // The REAL two-location list, so `useCloudLocationKnown` accepts LOC_A and
    // the location-scoped cloud reads are not skipped.
    useGetLocationsQuery: () => ({
      ...emptyQuery,
      data: { locations: CLOUD_LOCATIONS },
    }),
    useCreateLocationMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useUpdateLocationMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDeleteLocationMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useReorderLocationsMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    // `ActiveLocationProvider` calls this on every render (Rules of Hooks).
    useBootstrapCartsMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    // The pantry hooks read `PantryData` now, not `GetItems`. The fixture
    // below is still written as an item list; `asPantryDataResult` lifts each
    // item's inline stock values into the ItemStock row the join reads.
    usePantryDataQuery: () => asPantryDataResult(mockUseGetItemsQuery(), LOC_A),
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
    // LOC_A is the active location. Without this the provider starts on the
    // `'local'` sentinel and corrects itself a render later, which every
    // location-scoped read would have to wait out.
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
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
    localStorage.removeItem(activeLocationStorageKey('cloud'))
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
    // Given a cloud recipe whose item IS stocked in the active location
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

  it('cloud recipe card counts the items stocked here and stays checkable', async () => {
    // Given a cloud recipe whose single item has an `ItemStock` row at LOC_A
    renderPage()

    // Then the availability line counts it as stocked here
    await waitFor(() =>
      expect(screen.getByText('1 / 1 here')).toBeInTheDocument(),
    )

    // And the recipe checkbox is never disabled in cloud mode
    expect(screen.getByLabelText('Pasta')).toBeEnabled()
  })

  it('a recipe with nothing stocked here sinks below the divider in cloud mode', async () => {
    // Given Pasta, whose Flour IS stocked at the active LOC_A, and Cold Brew,
    // whose Coffee is a global item with no stock row here at all.
    //
    // Cloud used to skip this partition entirely, so BOTH recipes rendered in
    // the top section and no divider existed. `asPantryDataResult` gives every
    // item in the list a row, so Coffee is left OUT of the item list and fed to
    // the recipe by id only — which is exactly the shape of an item stocked at
    // another location: present in the catalog, absent from this location's
    // `itemStocks`.
    const COLD_BREW = {
      ...CLOUD_RECIPE,
      id: 'recipe-cold-brew',
      name: 'Cold Brew',
      items: [{ itemId: 'item-coffee', defaultAmount: 1 }],
    }
    mockUseGetRecipesQuery.mockReturnValue({
      ...emptyQuery,
      data: { recipes: [CLOUD_RECIPE, COLD_BREW] },
    })

    renderPage()

    // Then both recipes still render — sinking is not hiding
    await waitFor(() =>
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument(),
    )
    const pasta = screen.getByLabelText('Pasta')
    const coldBrew = screen.getByLabelText('Cold Brew')

    // And the divider counts exactly the one that sank
    const divider = screen.getByText(/1 not stocked here/i)

    // And Pasta is above it while Cold Brew is below
    expect(pasta.compareDocumentPosition(divider)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(divider.compareDocumentPosition(coldBrew)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )

    // And sinking it did not make it cookable
    expect(coldBrew).toBeDisabled()
    expect(pasta).toBeEnabled()
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

    // Then the consume mutation is sent with the item's consumed quantity, and
    // with the ACTIVE location — LOC_A, not the `'local'` sentinel and not the
    // caller's default resolved server-side. `ConsumeRecipesInput.locationId`
    // is `ID!` since PR 3b Task 4.
    await waitFor(() => expect(mockConsumeRecipes).toHaveBeenCalled())
    const variables = mockConsumeRecipes.mock.calls[0][0].variables
    expect(variables.input.locationId).toBe(LOC_A)
    expect(variables.input.recipeIds).toEqual([CLOUD_RECIPE.id])
    expect(variables.input.items).toHaveLength(1)
    expect(variables.input.items[0]).toMatchObject({
      itemId: CLOUD_ITEM.id,
      delta: -2,
      packedQuantity: 3,
    })
  })
})
