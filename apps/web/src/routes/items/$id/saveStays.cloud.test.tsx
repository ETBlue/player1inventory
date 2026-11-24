// Save stays on the page (cloud mode).
// Design: docs/features/items/2026-11-24-item-tabs-flat-design.md, part A.
// The local half is `saveStays.test.tsx`. The failed-save half (the page
// stays and the edit is kept) is `saveFailed.cloud.test.tsx`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import {
  CLOUD_LOCATIONS,
  cloudItem,
  cloudStock,
  LOC_A,
  LOC_B,
} from '@/test/cloudFixtures'
import {
  cloudServer,
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'
import { elementAt } from '@/test/narrow'

vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const SAVED = 'Saved'

const FLOUR = cloudItem('item-flour', 'Flour', { consumeAmount: 2 })
const FLOUR_A = cloudStock('stock-flour-a', 'item-flour', LOC_A, {
  targetQuantity: 5,
  refillThreshold: 2,
  packedQuantity: 2,
  unpackedQuantity: 0,
})
const FLOUR_B = cloudStock('stock-flour-b', 'item-flour', LOC_B, {
  targetQuantity: 1,
  refillThreshold: 0,
  packedQuantity: 1,
  unpackedQuantity: 0,
})
const BREAD = {
  __typename: 'Recipe' as const,
  id: 'recipe-bread',
  name: 'Bread',
  items: [
    {
      __typename: 'RecipeItem' as const,
      itemId: 'item-flour',
      defaultAmount: 4,
    },
  ],
  lastCookedAt: null,
}

// Each test types into a whole item form and saves. Alone they take 1 to 3 s;
// with the machine under load (another session's E2E run, load average 50)
// two of them passed the 5 s default and failed with "Test timed out".
describe(
  'Item pages - save stays on the page (cloud)',
  { timeout: 15_000 },
  () => {
    beforeEach(() => {
      localStorage.setItem('data-mode', 'cloud')
      localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
      // The person came from the pantry, so `goBack()` would have a place to go.
      sessionStorage.setItem('app-navigation-history', JSON.stringify(['/']))
      resetCloudServer()
      seedCloudHousehold(CLOUD_LOCATIONS)
      cloudServer.queries.useGetItemQuery = { item: FLOUR }
      cloudServer.queries.useGetItemsQuery = { items: [FLOUR] }
      cloudServer.queries.usePantryDataQuery = {
        items: [FLOUR],
        itemStocks: [FLOUR_A],
      }
      cloudServer.queries.useItemStocksForItemQuery = {
        itemStocksForItem: [FLOUR_A, FLOUR_B],
      }
      cloudServer.queries.useGetRecipesQuery = { recipes: [BREAD] }
      cloudServer.queries.useGetTagsQuery = { tags: [] }
      cloudServer.queries.useGetTagTypesQuery = { tagTypes: [] }
      cloudServer.queries.useGetVendorsQuery = { vendors: [] }
    })

    afterEach(() => {
      localStorage.removeItem('data-mode')
      localStorage.removeItem(activeLocationStorageKey('cloud'))
      sessionStorage.clear()
    })

    function renderPage(path: string) {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const router = createRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: ['/', path] }),
        context: { queryClient },
      })
      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
      return router
    }

    it('user stays on the Info tab after saving, with a clean form', async () => {
      const user = userEvent.setup()
      const router = renderPage('/items/item-flour')

      // When the user renames the item and saves
      const nameInput = await screen.findByRole('textbox', { name: /^name/i })
      await user.clear(nameInput)
      await user.type(nameInput, 'Rye flour')
      await user.click(screen.getByRole('button', { name: /save/i }))

      // Then the write was sent and a "Saved" message shows
      expect(await screen.findByText(SAVED)).toBeInTheDocument()
      expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1)
      // And the page stays, with the saved name and Save disabled again
      expect(router.state.location.pathname).toBe('/items/item-flour')
      expect(screen.getByRole('textbox', { name: /^name/i })).toHaveValue(
        'Rye flour',
      )
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled(),
      )
    })

    it('user stays on the Info tab after confirming the unit-switch dialog', async () => {
      const user = userEvent.setup()
      const router = renderPage('/items/item-flour')

      // When the user changes the consume amount, saves and confirms the
      // recipe update
      const consumeInput = await screen.findByLabelText(/amount per consume/i)
      await user.clear(consumeInput)
      await user.type(consumeInput, '3')
      await user.click(screen.getByRole('button', { name: /save/i }))
      await screen.findByRole('alertdialog')
      await user.click(screen.getByRole('button', { name: /update & save/i }))

      // Then the one atomic write was sent and a "Saved" message shows
      expect(await screen.findByText(SAVED)).toBeInTheDocument()
      expect(cloudServer.calls.useApplyUnitSwitchMutation).toHaveLength(1)
      // And the page stays, with the new value and Save disabled again
      expect(router.state.location.pathname).toBe('/items/item-flour')
      expect(screen.getByLabelText(/amount per consume/i)).toHaveValue(3)
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled(),
      )
    })

    it('user stays on the same location page of the Stock tab after saving', async () => {
      const user = userEvent.setup()
      const router = renderPage('/items/item-flour/stock')
      await screen.findByLabelText(/^packed/i)

      // When the user pages to the second location, edits its stock and saves
      const second = elementAt(CLOUD_LOCATIONS, 1)
      await user.click(screen.getByRole('tab', { name: second.name }))
      await waitFor(() =>
        expect(screen.getByLabelText(/^packed/i)).toHaveValue(1),
      )
      const packedInput = screen.getByLabelText(/^packed/i)
      await user.clear(packedInput)
      await user.type(packedInput, '6')
      await user.click(screen.getByRole('button', { name: /save/i }))

      // Then the write went to that location and a "Saved" message shows
      expect(await screen.findByText(SAVED)).toBeInTheDocument()
      const call = elementAt(
        cloudServer.calls.useUpsertItemStockMutation ?? [],
        0,
      )
      expect(call.locationId).toBe(LOC_B)
      // And the page stays on Stock, on the same location page, with Save
      // disabled again
      expect(router.state.location.pathname).toBe('/items/item-flour/stock')
      expect(screen.getByRole('tab', { name: second.name })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(screen.getByLabelText(/^packed/i)).toHaveValue(6)
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled(),
      )
    })
  },
)
