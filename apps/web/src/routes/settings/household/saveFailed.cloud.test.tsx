import { useApolloClient } from '@apollo/client/react'
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
  cloudStock,
  cloudTag,
  cloudTagType,
  cloudVendor,
  LOC_A,
} from '@/test/cloudFixtures'
import {
  cloudServer,
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'
import { watchUnhandledRejections } from '@/test/unhandledRejections'

// A failed save on the household settings pages, in CLOUD mode
// (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
//
// The generated mutation rejects with `FORBIDDEN`, and the app hook's cloud
// branch passes it on to the page. Deletes are in `deleteFailed.cloud.test.tsx`.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const SAVE_FAILED = 'Could not save the change. Please try again.'

const MILK = cloudItem('item-milk', 'Milk')
const NOODLES = cloudItem('item-noodles', 'Noodles', { consumeAmount: 1 })
const MILK_A = cloudStock('stock-milk-a', 'item-milk', LOC_A, {
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
})
const DAIRY_TYPE = cloudTagType('type-food', 'Food')
const DAIRY = cloudTag('tag-dairy', 'Dairy', 'type-food')
const COSTCO = cloudVendor('vendor-costco', 'Costco')
const SOUP = cloudRecipe('recipe-soup', 'Soup', [
  { itemId: 'item-noodles', defaultAmount: 2 },
])
const FRIDGE = cloudShelf('shelf-fridge', 'Fridge', { itemIds: [] })

describe('Household settings - a failed cloud save', () => {
  let rejections: ReturnType<typeof watchUnhandledRejections>

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    sessionStorage.clear()
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    cloudServer.queries.useGetItemsQuery = { items: [MILK, NOODLES] }
    cloudServer.queries.usePantryDataQuery = {
      items: [MILK, NOODLES],
      itemStocks: [MILK_A],
    }
    cloudServer.queries.useGetTagTypesQuery = { tagTypes: [DAIRY_TYPE] }
    cloudServer.queries.useGetTagsQuery = { tags: [DAIRY] }
    cloudServer.queries.useGetVendorsQuery = { vendors: [COSTCO] }
    cloudServer.queries.useGetRecipesQuery = { recipes: [SOUP] }
    cloudServer.queries.useGetRecipeQuery = { recipe: SOUP }
    cloudServer.queries.useGetShelvesQuery = { shelves: [FRIDGE] }
    cloudServer.queries.useGetShelfQuery = { shelf: FRIDGE }
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    // Back to the stub from `src/test/setup.ts` (one test replaces it)
    vi.mocked(useApolloClient).mockReset()
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

  async function expectSaveFailedAndNoRejection() {
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    await rejections.settle()
    expect(rejections.list).toEqual([])
  }

  describe('Info tabs', () => {
    it.each([
      [
        'recipe',
        {
          path: '/settings/household/recipes/recipe-soup',
          mutation: 'useUpdateRecipeMutation',
          newName: 'Noodle soup',
        },
      ],
      [
        'tag',
        {
          path: '/settings/household/tags/tag-dairy',
          mutation: 'useUpdateTagMutation',
          newName: 'Milk products',
        },
      ],
      [
        'vendor',
        {
          path: '/settings/household/vendors/vendor-costco',
          mutation: 'useUpdateVendorMutation',
          newName: 'Costco Wholesale',
        },
      ],
    ])('user sees a message when the server refuses a %s rename, and the name is kept', async (_page, {
      path,
      mutation,
      newName,
    }) => {
      const user = userEvent.setup()
      // Given a server that refuses the write
      cloudServer.failing.add(mutation)
      const router = renderPage(path)

      // When the user renames it and saves
      const nameInput = await screen.findByLabelText('Name')
      await user.clear(nameInput)
      await user.type(nameInput, newName)
      await user.click(screen.getByRole('button', { name: /save/i }))

      // Then the write was sent, a message shows, and the page stays with
      // the typed name and Save enabled again
      await expectSaveFailedAndNoRejection()
      expect(cloudServer.calls[mutation]).toHaveLength(1)
      expect(router.state.location.pathname).toBe(path)
      expect(screen.getByLabelText('Name')).toHaveValue(newName)
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /save/i })).toBeEnabled(),
      )
    })
  })

  describe('Items tabs', () => {
    it.each([
      [
        'recipe',
        {
          path: '/settings/household/recipes/recipe-soup/items',
          mutation: 'useUpdateRecipeMutation',
        },
      ],
      [
        'tag',
        {
          path: '/settings/household/tags/tag-dairy/items',
          mutation: 'useUpdateItemMutation',
        },
      ],
      [
        'vendor',
        {
          path: '/settings/household/vendors/vendor-costco/items',
          mutation: 'useUpdateItemMutation',
        },
      ],
      [
        'shelf',
        {
          path: '/settings/household/shelves/shelf-fridge/items',
          mutation: 'useUpdateShelfMutation',
        },
      ],
    ])('user sees a message when the server refuses adding an item on the %s Items tab', async (_page, {
      path,
      mutation,
    }) => {
      const user = userEvent.setup()
      // Given a server that refuses the write
      cloudServer.failing.add(mutation)
      renderPage(path)

      // When the user checks Milk
      await user.click(await screen.findByLabelText('Add Milk'))

      // Then the write was sent, a message shows, and Milk is still unchecked
      await expectSaveFailedAndNoRejection()
      expect(cloudServer.calls[mutation]).toHaveLength(1)
      await waitFor(() =>
        expect(screen.getByLabelText('Add Milk')).not.toBeChecked(),
      )
    })

    it('user sees a message when the server refuses a new default amount on the recipe Items tab', async () => {
      const user = userEvent.setup()
      // Given Noodles in the recipe, and a server that refuses the write
      cloudServer.failing.add('useUpdateRecipeMutation')
      renderPage('/settings/household/recipes/recipe-soup/items')

      // When the user raises the amount of Noodles
      await user.click(
        await screen.findByLabelText('Increase quantity of Noodles'),
      )

      // Then the write was sent, and a message shows
      await expectSaveFailedAndNoRejection()
      expect(cloudServer.calls.useUpdateRecipeMutation).toEqual([
        expect.objectContaining({
          items: [{ itemId: 'item-noodles', defaultAmount: 3 }],
        }),
      ])
    })

    it.each([
      ['recipe', { path: '/settings/household/recipes/recipe-soup/items' }],
      ['tag', { path: '/settings/household/tags/tag-dairy/items' }],
      [
        'vendor',
        {
          path: '/settings/household/vendors/vendor-costco/items',
        },
      ],
      ['shelf', { path: '/settings/household/shelves/shelf-fridge/items' }],
    ])('user sees a message when the server refuses an item created from search on the %s Items tab', async (_page, {
      path,
    }) => {
      const user = userEvent.setup()
      // Given a server that refuses the new item
      cloudServer.failing.add('useCreateItemMutation')
      renderPage(`${path}?q=Butter`)

      // When the user presses Create
      await user.click(
        await screen.findByRole('button', { name: 'Create item' }),
      )

      // Then the write was sent, a message shows, and the typed name stays
      await expectSaveFailedAndNoRejection()
      expect(cloudServer.calls.useCreateItemMutation).toHaveLength(1)
      expect(screen.getByPlaceholderText(/search items/i)).toHaveValue('Butter')
    })

    it('user sees a message when the server refuses to put an item created from search on the shelf', async () => {
      const user = userEvent.setup()
      // Given a server that creates the item but refuses the shelf write
      cloudServer.results.useCreateItemMutation = (vars) => ({
        createItem: cloudItem(
          'item-butter',
          String((vars.input as { name: string }).name),
        ),
      })
      cloudServer.failing.add('useUpdateShelfMutation')
      renderPage('/settings/household/shelves/shelf-fridge/items?q=Butter')

      // When the user presses Create
      await user.click(
        await screen.findByRole('button', { name: 'Create item' }),
      )

      // Then both writes were sent, and a message shows
      await expectSaveFailedAndNoRejection()
      expect(cloudServer.calls.useCreateItemMutation).toHaveLength(1)
      expect(cloudServer.calls.useUpdateShelfMutation).toEqual([
        expect.objectContaining({ itemIds: ['item-butter'] }),
      ])
    })
  })

  describe('Shelves', () => {
    it('user sees a message when the server refuses a new shelf, and the dialog keeps the name', async () => {
      const user = userEvent.setup()
      // Given a server that refuses the new shelf
      cloudServer.failing.add('useCreateShelfMutation')
      renderPage('/settings/household/shelves')

      // When the user adds a shelf named "Snacks"
      await user.click(await screen.findByRole('button', { name: 'Add shelf' }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText(/name/i), 'Snacks')
      await user.click(
        within(dialog).getByRole('button', { name: 'Create Shelf' }),
      )

      // Then the write was sent, a message shows, and the dialog stays open
      await expectSaveFailedAndNoRejection()
      expect(cloudServer.calls.useCreateShelfMutation).toHaveLength(1)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(dialog).getByLabelText(/name/i)).toHaveValue('Snacks')
    })

    it.each([
      ['selection', FRIDGE],
      [
        'filter',
        cloudShelf('shelf-fridge', 'Fridge', {
          type: 'filter',
          filterConfig: {
            __typename: 'FilterConfig',
            tagIds: ['tag-dairy'],
            vendorIds: [],
            recipeIds: [],
          },
        }),
      ],
    ])('user sees a message when the server refuses a %s shelf rename, and the name is kept', async (_type, shelf) => {
      const user = userEvent.setup()
      // Given a server that refuses the shelf write
      cloudServer.queries.useGetShelfQuery = { shelf }
      cloudServer.queries.useGetShelvesQuery = { shelves: [shelf] }
      cloudServer.failing.add('useUpdateShelfMutation')
      const router = renderPage('/settings/household/shelves/shelf-fridge')

      // When the user renames the shelf and saves
      const nameInput = await screen.findByLabelText('Shelf name')
      await waitFor(() => expect(nameInput).toHaveValue('Fridge'))
      await user.clear(nameInput)
      await user.type(nameInput, 'Pantry')
      await user.click(screen.getByRole('button', { name: /save/i }))

      // Then the write was sent, a message shows, and the page stays
      await expectSaveFailedAndNoRejection()
      expect(cloudServer.calls.useUpdateShelfMutation).toHaveLength(1)
      expect(router.state.location.pathname).toBe(
        '/settings/household/shelves/shelf-fridge',
      )
      expect(screen.getByLabelText('Shelf name')).toHaveValue('Pantry')
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /save/i })).toBeEnabled(),
      )
    })

    it('user sees a message when the server refuses a filter change', async () => {
      const user = userEvent.setup()
      // Given a filter shelf, and a server that refuses the shelf write
      const shelf = cloudShelf('shelf-fridge', 'Fridge', {
        type: 'filter',
        filterConfig: {
          __typename: 'FilterConfig',
          tagIds: [],
          vendorIds: [],
          recipeIds: [],
        },
      })
      cloudServer.queries.useGetShelfQuery = { shelf }
      cloudServer.queries.useGetShelvesQuery = { shelves: [shelf] }
      cloudServer.failing.add('useUpdateShelfMutation')
      renderPage('/settings/household/shelves/shelf-fridge/filters')

      // When the user presses the Dairy badge
      await user.click(
        await screen.findByRole('button', { name: /dairy \(\d+\)/i }),
      )

      // Then the write was sent, and a message shows
      await expectSaveFailedAndNoRejection()
      expect(cloudServer.calls.useUpdateShelfMutation).toHaveLength(1)
    })
  })

  describe('Tags page', () => {
    it('user sees a message when the server refuses a new tag type, and the dialog keeps the name', async () => {
      const user = userEvent.setup()
      // Given a server that refuses the new tag type
      cloudServer.failing.add('useCreateTagTypeMutation')
      renderPage('/settings/household/tags')

      // When the user adds a tag type named "Storage"
      await user.click(
        await screen.findByRole('button', { name: 'New Tag Type' }),
      )
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText(/name/i), 'Storage')
      await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

      // Then the write was sent, a message shows, and the dialog stays open
      await expectSaveFailedAndNoRejection()
      expect(cloudServer.calls.useCreateTagTypeMutation).toHaveLength(1)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(dialog).getByLabelText(/name/i)).toHaveValue('Storage')
    })

    it('user sees a message when the server refuses a new tag, and the dialog keeps the name', async () => {
      const user = userEvent.setup()
      // Given a server that refuses the new tag
      cloudServer.failing.add('useCreateTagMutation')
      renderPage('/settings/household/tags')

      // When the user adds a tag named "Apples"
      await user.click(
        await screen.findByRole('button', { name: /^new tag$/i }),
      )
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText(/name/i), 'Apples')
      await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

      // Then the write was sent, a message shows, and the dialog stays open
      // with Save enabled again
      await expectSaveFailedAndNoRejection()
      expect(cloudServer.calls.useCreateTagMutation).toHaveLength(1)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(dialog).getByLabelText(/name/i)).toHaveValue('Apples')
      await waitFor(() =>
        expect(
          within(dialog).getByRole('button', { name: /^save$/i }),
        ).toBeEnabled(),
      )
    })

    it('user sees a message when the server refuses a tag type rename', async () => {
      const user = userEvent.setup()
      // Given a server that refuses the tag type write
      cloudServer.failing.add('useUpdateTagTypeMutation')
      renderPage('/settings/household/tags')

      // When the user renames the tag type "Food" to "Fruit"
      await user.click(await screen.findByRole('button', { name: /^edit$/i }))
      const dialog = await screen.findByRole('dialog')
      const input = within(dialog).getByLabelText(/name/i)
      await user.clear(input)
      await user.type(input, 'Fruit')
      await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

      // Then the write was sent, and a message shows
      await expectSaveFailedAndNoRejection()
      expect(cloudServer.calls.useUpdateTagTypeMutation).toHaveLength(1)
    })
  })

  it('user sees a message when the server refuses a new recipe, and the dialog keeps the name', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the new recipe
    cloudServer.failing.add('useCreateRecipeMutation')
    const router = renderPage('/settings/household/recipes')

    // When the user opens New Recipe, types "Pasta" and saves
    await user.click(await screen.findByRole('button', { name: /new recipe/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'Pasta')
    await user.click(
      within(dialog).getByRole('button', { name: /new recipe/i }),
    )

    // Then the write was sent, a message shows, and the dialog stays open
    await expectSaveFailedAndNoRejection()
    expect(cloudServer.calls.useCreateRecipeMutation).toHaveLength(1)
    expect(within(dialog).getByRole('textbox')).toHaveValue('Pasta')
    expect(router.state.location.pathname).toBe('/settings/household/recipes')
  })

  // A negative control. A failed REFRESH after a write that worked is not a
  // failed save (docs/global/bugs/2026-11-18-bug-failed-refetch-rejects-saved-write.md),
  // so no message may show.
  it('user sees no message when the save works and only the refresh after it fails', async () => {
    const user = userEvent.setup()
    // Given a server that takes the recipe write, and a refresh that fails
    const query = vi.fn().mockRejectedValue(new Error('network down'))
    const original = vi.mocked(useApolloClient).getMockImplementation()
    vi.mocked(useApolloClient).mockImplementation(
      (...args: Parameters<typeof useApolloClient>) =>
        ({
          ...(original?.(...args) as object),
          query,
          refetchQueries: query,
        }) as unknown as ReturnType<typeof useApolloClient>,
    )
    renderPage('/settings/household/recipes/recipe-soup/items')

    // When the user checks Milk
    await user.click(await screen.findByLabelText('Add Milk'))

    // Then the write was sent and the refresh was tried
    await waitFor(() => expect(query).toHaveBeenCalled())
    expect(cloudServer.calls.useUpdateRecipeMutation).toHaveLength(1)
    // And no message says the save failed
    await rejections.settle()
    expect(screen.queryByText(SAVE_FAILED)).not.toBeInTheDocument()
    expect(rejections.list).toEqual([])
  })
})
