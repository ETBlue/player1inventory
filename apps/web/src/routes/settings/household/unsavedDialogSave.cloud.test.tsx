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
  cloudRecipe,
  cloudShelf,
  cloudTag,
  cloudTagType,
  cloudVendor,
  LOC_A,
} from '@/test/cloudFixtures'
import {
  cloudServer,
  holdMutation,
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'
import { watchUnhandledRejections } from '@/test/unhandledRejections'

// Save in the unsaved-changes dialog on the four household detail pages, in
// CLOUD mode (design docs/global/ui-polish/2026-11-25-unsaved-dialog-save-design.md).
//
// The cloud stub lets a test hold a write in flight (`holdMutation`) and make
// it fail (`failing`), so these tests can check WHEN the page navigates, not
// only where it ends up.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const SAVE_FAILED = 'Could not save the change. Please try again.'

const NOODLES = cloudItem('item-noodles', 'Noodles', { consumeAmount: 1 })
const FOOD = cloudTagType('type-food', 'Food')
const DAIRY = cloudTag('tag-dairy', 'Dairy', 'type-food')
const COSTCO = cloudVendor('vendor-costco', 'Costco')
const SOUP = cloudRecipe('recipe-soup', 'Soup', [
  { itemId: 'item-noodles', defaultAmount: 2 },
])
const FRIDGE = cloudShelf('shelf-fridge', 'Fridge', { itemIds: [] })

const PAGES = [
  {
    page: 'tag',
    list: '/settings/household/tags',
    path: '/settings/household/tags/tag-dairy',
    itemsTab: 'Tag items tab',
    nameLabel: 'Name',
    mutation: 'useUpdateTagMutation',
    newName: 'Milk products',
  },
  {
    page: 'vendor',
    list: '/settings/household/vendors',
    path: '/settings/household/vendors/vendor-costco',
    itemsTab: 'Vendor items tab',
    nameLabel: 'Name',
    mutation: 'useUpdateVendorMutation',
    newName: 'Costco Wholesale',
  },
  {
    page: 'recipe',
    list: '/settings/household/recipes',
    path: '/settings/household/recipes/recipe-soup',
    itemsTab: 'Recipe items tab',
    nameLabel: 'Name',
    mutation: 'useUpdateRecipeMutation',
    newName: 'Noodle soup',
  },
  {
    page: 'shelf',
    list: '/settings/household/shelves',
    path: '/settings/household/shelves/shelf-fridge',
    itemsTab: 'Shelf items tab',
    nameLabel: 'Shelf name',
    mutation: 'useUpdateShelfMutation',
    newName: 'Freezer',
  },
] as const

type Page = (typeof PAGES)[number]

describe('Household detail pages - Save in the unsaved-changes dialog (cloud)', () => {
  let rejections: ReturnType<typeof watchUnhandledRejections>

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    sessionStorage.clear()
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    cloudServer.queries.useGetItemsQuery = { items: [NOODLES] }
    cloudServer.queries.usePantryDataQuery = {
      items: [NOODLES],
      itemStocks: [],
    }
    cloudServer.queries.useGetTagTypesQuery = { tagTypes: [FOOD] }
    cloudServer.queries.useGetTagsQuery = { tags: [DAIRY] }
    cloudServer.queries.useGetVendorsQuery = { vendors: [COSTCO] }
    cloudServer.queries.useGetRecipesQuery = { recipes: [SOUP] }
    cloudServer.queries.useGetRecipeQuery = { recipe: SOUP }
    cloudServer.queries.useGetShelvesQuery = { shelves: [FRIDGE] }
    cloudServer.queries.useGetShelfQuery = { shelf: FRIDGE }
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  // The person came from the list page, so `goBack()` goes there. A dialog
  // Save after a tab press must go to the tab instead.
  function renderPage({ list, path }: Page) {
    sessionStorage.setItem('app-navigation-history', JSON.stringify([list]))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [list, path] }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  async function editName(
    user: ReturnType<typeof userEvent.setup>,
    page: Page,
    value: string,
  ) {
    const input = await screen.findByLabelText(page.nameLabel)
    await waitFor(() => expect(input).not.toHaveValue(''))
    await user.clear(input)
    if (value) await user.type(input, value)
  }

  function sentNames(mutation: string) {
    return (cloudServer.calls[mutation] ?? []).map((v) => JSON.stringify(v))
  }

  it.each(
    PAGES,
  )('user can save the $page from the dialog and go to the tab they pressed', async (page) => {
    const user = userEvent.setup()
    // Given the Info tab with a renamed entity
    const router = renderPage(page)
    await editName(user, page, page.newName)

    // When the user presses the Items tab and then Save in the dialog
    await user.click(screen.getByRole('link', { name: page.itemsTab }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    // Then the new name is sent, and the page goes to the Items tab, not back
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`${page.path}/items`),
    )
    expect(sentNames(page.mutation)).toHaveLength(1)
    expect(sentNames(page.mutation)[0]).toContain(page.newName)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it.each(
    PAGES,
  )('user can save the $page from the dialog when pressing Back', async (page) => {
    const user = userEvent.setup()
    const router = renderPage(page)
    await editName(user, page, page.newName)

    // When the user presses Back and then Save in the dialog
    await user.click(screen.getByRole('button', { name: /go back/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    // Then the name is sent and the page goes back to the list
    await waitFor(() => expect(router.state.location.pathname).toBe(page.list))
    expect(sentNames(page.mutation)).toHaveLength(1)
  })

  it.each(
    PAGES,
  )('user stays on the $page until the dialog save has finished', async (page) => {
    const user = userEvent.setup()
    // Given a server that holds the write
    const held = holdMutation(page.mutation)
    const router = renderPage(page)
    await editName(user, page, page.newName)

    // When the user presses the Items tab and Save in the dialog
    await user.click(screen.getByRole('link', { name: page.itemsTab }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    // Then, while the write is in flight, the page stays and the dialog
    // shows the save running: every button is off
    await waitFor(() => expect(sentNames(page.mutation)).toHaveLength(1))
    expect(router.state.location.pathname).toBe(page.path)
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(
      within(dialog).getByRole('button', { name: 'Discard' }),
    ).toBeDisabled()

    // And only once it is answered does the page move
    held.release()
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`${page.path}/items`),
    )
  })

  it.each(
    PAGES,
  )('user sees a message when the dialog save of the $page fails, and the dialog stays', async (page) => {
    const user = userEvent.setup()
    // Given a server that refuses the write
    cloudServer.failing.add(page.mutation)
    const router = renderPage(page)
    await editName(user, page, page.newName)

    // When the user presses the Items tab and Save in the dialog
    await user.click(screen.getByRole('link', { name: page.itemsTab }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    // Then a message says it was not saved, the page stays, and the dialog
    // is still open with Save ready to try again
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    expect(sentNames(page.mutation)).toHaveLength(1)
    expect(router.state.location.pathname).toBe(page.path)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Save',
        }),
      ).toBeEnabled(),
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it.each(
    PAGES,
  )('user sees Save off in the dialog while the $page name is empty', async (page) => {
    const user = userEvent.setup()
    const router = renderPage(page)
    // Given an empty name: a field error
    await editName(user, page, '')

    // When the user presses the Items tab
    await user.click(screen.getByRole('link', { name: page.itemsTab }))
    const dialog = await screen.findByRole('alertdialog')

    // Then Save is off, and pressing it sends nothing
    const save = within(dialog).getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await user.click(save)
    expect(sentNames(page.mutation)).toHaveLength(0)
    expect(router.state.location.pathname).toBe(page.path)
  })

  it.each(
    PAGES,
  )('user can still discard or cancel on the $page', async (page) => {
    const user = userEvent.setup()
    const router = renderPage(page)
    await editName(user, page, page.newName)

    // Cancel: the dialog closes and the edit stays
    await user.click(screen.getByRole('link', { name: page.itemsTab }))
    let dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expect(router.state.location.pathname).toBe(page.path)
    expect(screen.getByLabelText(page.nameLabel)).toHaveValue(page.newName)

    // Discard: the page moves and nothing is sent
    await user.click(screen.getByRole('link', { name: page.itemsTab }))
    dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`${page.path}/items`),
    )
    expect(sentNames(page.mutation)).toHaveLength(0)
  })
})
