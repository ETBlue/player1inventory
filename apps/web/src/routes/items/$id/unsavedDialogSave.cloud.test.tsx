import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
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
  holdMutation,
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'
import { watchUnhandledRejections } from '@/test/unhandledRejections'

// Save in the item page's unsaved-changes dialog, in CLOUD mode
// (design docs/global/ui-polish/2026-11-25-unsaved-dialog-save-design.md).
//
// The cloud stub can hold a write in flight and make it fail, so these tests
// check WHEN the page moves: only after the save worked, never on a failure.
// The successful paths with real data are in `unsavedDialogSave.test.tsx`.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const SAVE_FAILED = 'Could not save the change. Please try again.'
const UNSAVED = 'Unsaved changes'

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
// Uses flour at 4, so changing the amount per consume to 3 moves it to 3 and
// the save asks first in the converted amounts dialog.
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

describe('Item page - Save in the unsaved-changes dialog (cloud)', () => {
  let rejections: ReturnType<typeof watchUnhandledRejections>

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    sessionStorage.clear()
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
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  function renderPage(path: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  async function openDialogFromInfo(user: ReturnType<typeof userEvent.setup>) {
    const nameInput = await screen.findByRole('textbox', { name: /^name/i })
    await user.clear(nameInput)
    await user.type(nameInput, 'Rye flour')
    await user.click(screen.getByRole('link', { name: /^stock$/i }))
    return screen.findByRole('alertdialog', { name: UNSAVED })
  }

  it('user stays on the Info tab until the dialog save has finished', async () => {
    const user = userEvent.setup()
    // Given a server that holds the item write
    const held = holdMutation('useUpdateItemMutation')
    const router = renderPage('/items/item-flour')

    // When the user renames the item, opens Stock and presses Save
    const dialog = await openDialogFromInfo(user)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    // Then, while the write is in flight, the page stays and the dialog
    // shows the save running
    await waitFor(() =>
      expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1),
    )
    expect(router.state.location.pathname).toBe('/items/item-flour')
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(
      within(dialog).getByRole('button', { name: 'Discard' }),
    ).toBeDisabled()

    // And only after it is answered does the page go to Stock
    held.release()
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/items/item-flour/stock'),
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees a message when the dialog save fails, and stays in the dialog', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the item write
    cloudServer.failing.add('useUpdateItemMutation')
    const router = renderPage('/items/item-flour')

    // When the user renames the item, opens Stock and presses Save
    const dialog = await openDialogFromInfo(user)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    // Then a message says it was not saved, the page stays, and the dialog
    // is still open with Save ready to try again
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1)
    expect(router.state.location.pathname).toBe('/items/item-flour')
    const still = screen.getByRole('alertdialog', { name: UNSAVED })
    await waitFor(() =>
      expect(within(still).getByRole('button', { name: 'Save' })).toBeEnabled(),
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user whose converted amounts save fails is back in the unsaved-changes dialog', async () => {
    const user = userEvent.setup()
    // Given an item used by a recipe, and a server that refuses the switch
    cloudServer.failing.add('useApplyUnitSwitchMutation')
    const router = renderPage('/items/item-flour')

    // When the user changes the amount per consume, opens Stock, presses
    // Save in the dialog and confirms the converted amounts
    const consumeInput = await screen.findByLabelText(/amount per consume/i)
    await user.clear(consumeInput)
    await user.type(consumeInput, '3')
    await user.click(screen.getByRole('link', { name: /^stock$/i }))
    const dialog = await screen.findByRole('alertdialog', { name: UNSAVED })
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Update recipe amounts?',
    })
    await user.click(
      within(confirm).getByRole('button', { name: /update & save/i }),
    )

    // Then the write was sent, a message shows, the converted amounts
    // dialog is gone, the unsaved-changes dialog stays, and the page stays
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    expect(cloudServer.calls.useApplyUnitSwitchMutation).toHaveLength(1)
    expect(
      screen.queryByRole('alertdialog', { name: 'Update recipe amounts?' }),
    ).not.toBeInTheDocument()
    const still = await screen.findByRole('alertdialog', { name: UNSAVED })
    await waitFor(() =>
      expect(within(still).getByRole('button', { name: 'Save' })).toBeEnabled(),
    )
    expect(router.state.location.pathname).toBe('/items/item-flour')
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user stays on this location page when the pager dialog save fails', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the stock write
    cloudServer.failing.add('useUpsertItemStockMutation')
    renderPage('/items/item-flour/stock')

    // When the user changes the packed amount, pages to the garage and
    // presses Save in the dialog
    const packed = await screen.findByLabelText(/^packed/i)
    await user.clear(packed)
    await user.type(packed, '6')
    await user.click(screen.getByRole('tab', { name: /cloud garage/i }))
    const dialog = await screen.findByRole('alertdialog', { name: UNSAVED })
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    // Then a message shows, the dialog stays, and the kitchen page and its
    // typed amount stay
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    expect(cloudServer.calls.useUpsertItemStockMutation).toHaveLength(1)
    expect(
      screen.getByRole('alertdialog', { name: UNSAVED }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: /cloud kitchen/i, hidden: true }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByLabelText(/^packed/i, { selector: 'input' }),
    ).toHaveValue(6)
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user moves to the next location page only after the pager dialog save', async () => {
    const user = userEvent.setup()
    // Given a server that holds the stock write
    const held = holdMutation('useUpsertItemStockMutation')
    renderPage('/items/item-flour/stock')

    const packed = await screen.findByLabelText(/^packed/i)
    await user.clear(packed)
    await user.type(packed, '6')
    await user.click(screen.getByRole('tab', { name: /cloud garage/i }))
    const dialog = await screen.findByRole('alertdialog', { name: UNSAVED })
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    // Then, while the write is in flight, the kitchen page stays
    await waitFor(() =>
      expect(cloudServer.calls.useUpsertItemStockMutation).toHaveLength(1),
    )
    expect(
      screen.getByRole('tab', { name: /cloud kitchen/i, hidden: true }),
    ).toHaveAttribute('aria-selected', 'true')

    // And after it is answered the garage page shows
    held.release()
    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: /cloud garage/i }),
      ).toHaveAttribute('aria-selected', 'true'),
    )
  })
})
