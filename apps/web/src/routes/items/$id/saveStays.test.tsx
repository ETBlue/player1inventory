// Save stays on the page (local mode).
// Design: docs/features/items/2026-11-24-item-tabs-flat-design.md, part A.
//
// Until 2026-11-24 a successful save on Info and on Stock called `goBack()`,
// so the person had to open the item again for every tab. Now the page
// stays, the form takes the saved values as its clean state, Save is
// disabled again, and a "Saved" toast shows. Cloud mode is in
// `saveStays.cloud.test.tsx`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  addItemToLocation,
  createItem,
  createLocation,
  getItem,
  getItemStock,
  upsertItemStock,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { DEFAULT_LOCATION_ID } from '@/types'

const SAVED = 'Saved'

// Each test types into a whole item form and saves. Alone they take 1 to 3 s;
// with the machine under load (another session's E2E run, load average 50)
// two of them passed the 5 s default and failed with "Test timed out".
describe(
  'Item pages - save stays on the page (local)',
  { timeout: 15_000 },
  () => {
    let queryClient: QueryClient

    beforeEach(async () => {
      await db.items.clear()
      await db.itemStocks.clear()
      await db.recipes.clear()
      await db.tags.clear()
      await db.tagTypes.clear()
      await db.inventoryLogs.clear()
      await db.locations.where('id').notEqual(DEFAULT_LOCATION_ID).delete()
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      // The person came from the pantry, so `goBack()` WOULD have a place to
      // go. Without this history the old code would also leave the page (to
      // `/`), so the test proves the same thing either way, but this is the
      // real case.
      sessionStorage.setItem('app-navigation-history', JSON.stringify(['/']))
    })

    function renderPage(path: string) {
      const router = createRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: ['/', path] }),
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
      // Given an item
      const item = await createItem({
        name: 'Milk',
        packageUnit: 'bottle',
        targetUnit: 'package',
        consumeAmount: 1,
        tagIds: [],
      })
      const router = renderPage(`/items/${item.id}`)

      // When the user renames it and saves
      const nameInput = await screen.findByRole('textbox', { name: /^name/i })
      await user.clear(nameInput)
      await user.type(nameInput, 'Oat milk')
      await user.click(screen.getByRole('button', { name: /save/i }))

      // Then the name is saved and a "Saved" message shows
      await waitFor(async () => {
        expect((await getItem(item.id))?.name).toBe('Oat milk')
      })
      expect(await screen.findByText(SAVED)).toBeInTheDocument()
      // And the page stays on Info, with the saved value in the field
      expect(router.state.location.pathname).toBe(`/items/${item.id}`)
      expect(screen.getByRole('textbox', { name: /^name/i })).toHaveValue(
        'Oat milk',
      )
      // And the form is clean: Save is disabled again
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()

      // And leaving the tab asks nothing: the dirty guard is not armed
      await user.click(screen.getByRole('link', { name: /^stock$/i }))
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(`/items/${item.id}/stock`),
      )
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('user stays on the same location page of the Stock tab after saving', async () => {
      const user = userEvent.setup()
      // Given an item stocked in the default location and in a cabin
      const cabin = await createLocation('Cabin')
      const item = await createItem({
        name: 'Milk',
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
        tagIds: [],
      })
      await addItemToLocation(item.id, cabin.id)
      await upsertItemStock(item.id, cabin.id, { packedQuantity: 7 })
      const router = renderPage(`/items/${item.id}/stock`)
      await screen.findByLabelText(/^packed/i)

      // When the user pages to the cabin, edits its stock and saves
      await user.click(screen.getByRole('tab', { name: 'Cabin' }))
      await waitFor(() =>
        expect(screen.getByLabelText(/^packed/i)).toHaveValue(7),
      )
      const packedInput = screen.getByLabelText(/^packed/i)
      await user.clear(packedInput)
      await user.type(packedInput, '9')
      await user.click(screen.getByRole('button', { name: /save/i }))

      // Then the cabin's stock is saved and a "Saved" message shows
      await waitFor(async () => {
        expect((await getItemStock(item.id, cabin.id))?.packedQuantity).toBe(9)
      })
      expect(await screen.findByText(SAVED)).toBeInTheDocument()
      // And the page stays on Stock, still on the cabin's page
      expect(router.state.location.pathname).toBe(`/items/${item.id}/stock`)
      expect(screen.getByRole('tab', { name: 'Cabin' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(screen.getByLabelText(/^packed/i)).toHaveValue(9)
      // And the form is clean: Save is disabled again
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  },
)
