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
  cloudShelf,
  cloudStock,
  cloudVendor,
  LOC_A,
} from '@/test/cloudFixtures'
import {
  cloudServer,
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'
import { watchUnhandledRejections } from '@/test/unhandledRejections'

// A failed save on the pantry, in CLOUD mode
// (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
//
// The generated mutation rejects with `FORBIDDEN`; the app hook's cloud
// branch (`useUpdateItem`, `useCreateItem`, `useUpdateShelfMutation`) passes it
// on to the pantry view. The search tail's "Add to location" is covered in
// `hooks/useItemSearchTailWiring.cloud.test.tsx`, through `MockedProvider`.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const SAVE_FAILED = 'Could not save the change. Please try again.'

const FLOUR = cloudItem('item-flour', 'Flour')
const FLOUR_A = cloudStock('stock-flour-a', 'item-flour', LOC_A, {
  targetQuantity: 5,
  refillThreshold: 2,
  packedQuantity: 1,
  unpackedQuantity: 0,
})
const FRIDGE = cloudShelf('shelf-fridge', 'Fridge', {
  itemIds: ['item-flour'],
})

describe('Pantry - a failed cloud save', () => {
  let rejections: ReturnType<typeof watchUnhandledRejections>

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    sessionStorage.clear()
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    cloudServer.queries.useGetItemsQuery = { items: [FLOUR] }
    cloudServer.queries.usePantryDataQuery = {
      items: [FLOUR],
      itemStocks: [FLOUR_A],
    }
    cloudServer.queries.useGetTagsQuery = { tags: [] }
    cloudServer.queries.useGetTagTypesQuery = { tagTypes: [] }
    cloudServer.queries.useGetVendorsQuery = { vendors: [] }
    cloudServer.queries.useGetRecipesQuery = { recipes: [] }
    cloudServer.queries.useGetShelvesQuery = { shelves: [FRIDGE] }
    cloudServer.queries.useGetShelfQuery = { shelf: FRIDGE }
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

  it('user sees a message in the quick update dialog when the server refuses the save', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the stock write
    cloudServer.failing.add('useUpsertItemStockMutation')
    renderPage('/')

    // When the user opens the quick update dialog, adds a pack and presses Update
    await user.click(
      await screen.findByRole('button', { name: 'Update quantity of Flour' }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Increase packed' }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Update' }))

    // Then the write was sent, and the dialog says it was not saved
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      SAVE_FAILED,
    )
    expect(cloudServer.calls.useUpsertItemStockMutation).toHaveLength(1)
    // And it stays open, and Update can be pressed again
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Update' }),
      ).toBeEnabled(),
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees a message when the server refuses an item created from a shelf search', async () => {
    const user = userEvent.setup()
    // Given a selection shelf, and a server that refuses the new item
    cloudServer.failing.add('useCreateItemMutation')
    renderPage('/?groupBy=shelf&id=shelf-fridge&q=Butter')

    // When the user presses Create
    await user.click(await screen.findByRole('button', { name: 'Create item' }))

    // Then the write was sent, and a message says it was not saved
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    expect(cloudServer.calls.useCreateItemMutation).toHaveLength(1)
    // And the typed name stays, so Create can be pressed again
    expect(screen.getByRole('button', { name: 'Create item' })).toBeEnabled()
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees a message when the server refuses to put the new item on the shelf', async () => {
    const user = userEvent.setup()
    // Given a server that creates the item but refuses the shelf write
    cloudServer.results.useCreateItemMutation = (vars) => ({
      createItem: cloudItem(
        'item-butter',
        String((vars.input as { name: string }).name),
      ),
    })
    cloudServer.failing.add('useUpdateShelfMutation')
    renderPage('/?groupBy=shelf&id=shelf-fridge&q=Butter')

    // When the user presses Create
    await user.click(await screen.findByRole('button', { name: 'Create item' }))

    // Then both writes were sent, and a message says it was not saved
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    expect(cloudServer.calls.useCreateItemMutation).toHaveLength(1)
    expect(cloudServer.calls.useUpdateShelfMutation).toEqual([
      expect.objectContaining({
        itemIds: ['item-flour', 'item-butter'],
      }),
    ])
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees a message when the server refuses a search tail group action', async () => {
    const user = userEvent.setup()
    // Given Flour is stocked here with no vendor, and a server that refuses
    // the item write
    cloudServer.queries.useGetVendorsQuery = {
      vendors: [cloudVendor('vendor-costco', 'Costco')],
    }
    cloudServer.failing.add('useUpdateItemMutation')
    renderPage('/?groupBy=vendor&id=vendor-costco&q=flour')

    // When the user presses "Apply Costco" on the Flour row
    await user.click(
      await screen.findByRole('button', { name: 'Apply Costco: Flour' }),
    )

    // Then the write was sent, and a message says it was not saved
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1)
    // And the row is not stuck
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Apply Costco: Flour' }),
      ).toBeEnabled(),
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })
})
