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
  cloudRecipe,
  cloudStock,
  cloudTag,
  cloudTagType,
  cloudVendor,
  LOC_A,
  LOC_B,
} from '@/test/cloudFixtures'
import {
  cloudServer,
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'
import { watchUnhandledRejections } from '@/test/unhandledRejections'

// A failed save on the item pages, in CLOUD mode
// (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
//
// The local tests make the Dexie write fail. These make the server refuse:
// the generated mutation rejects with `FORBIDDEN`, and the app hook's cloud
// branch (`useUpdateItem`, `useApplyUnitSwitch`, …) passes it on to the page.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const SAVE_FAILED = 'Could not save the change. Please try again.'
// The stub refuses with `FORBIDDEN`. A catalog write passes
// `{ catalog: true }` to `showSaveError`, so it says why (owner answer 6A of
// `docs/features/items/2026-11-27-item-relations-save-design.md`)
const CATALOG_FORBIDDEN = 'Only a household owner or manager can change this.'

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

describe('Item pages - a failed cloud save', () => {
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

  it('user sees a message when the server refuses the Stock tab save, and the edit is kept', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the stock write
    cloudServer.failing.add('useUpsertItemStockMutation')
    const router = renderPage('/items/item-flour/stock')

    // When the user changes the packed quantity and saves
    const packedInput = await screen.findByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '7')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the write was sent, and a message says it was not saved
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    expect(cloudServer.calls.useUpsertItemStockMutation).toHaveLength(1)
    // And the page stays, with the typed value and Save enabled again
    expect(router.state.location.pathname).toBe('/items/item-flour/stock')
    expect(screen.getByLabelText(/^packed/i)).toHaveValue(7)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save/i })).toBeEnabled(),
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees a message when the server refuses the Info tab save, and the edit is kept', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the item write
    cloudServer.failing.add('useUpdateItemMutation')
    const router = renderPage('/items/item-flour')

    // When the user renames the item and saves
    const nameInput = await screen.findByRole('textbox', { name: /^name/i })
    await user.clear(nameInput)
    await user.type(nameInput, 'Rye flour')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the write was sent, and a message says it was not saved
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1)
    // And the page stays, with the typed name and Save enabled again
    expect(router.state.location.pathname).toBe('/items/item-flour')
    expect(screen.getByRole('textbox', { name: /^name/i })).toHaveValue(
      'Rye flour',
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save/i })).toBeEnabled(),
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees a message when the server refuses the recipe update on confirm', async () => {
    const user = userEvent.setup()
    // Given an item used by a recipe, and a server that refuses the switch
    cloudServer.failing.add('useApplyUnitSwitchMutation')
    const router = renderPage('/items/item-flour')

    // When the user changes the consume amount, saves and confirms
    const consumeInput = await screen.findByLabelText(/amount per consume/i)
    await user.clear(consumeInput)
    await user.type(consumeInput, '3')
    await user.click(screen.getByRole('button', { name: /save/i }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then the write was sent, a message shows, and the page stays
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    expect(cloudServer.calls.useApplyUnitSwitchMutation).toHaveLength(1)
    expect(router.state.location.pathname).toBe('/items/item-flour')
    expect(screen.getByLabelText(/amount per consume/i)).toHaveValue(3)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save/i })).toBeEnabled(),
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  // The Tags, Vendors and Recipes tabs (under a "Relation" tab until
  // 2026-11-24). Each "New …" dialog is its own write. Since the item
  // relations Save the badge presses of the three tabs are written by their
  // top bar Save, so a refused Save keeps the presses on screen.
  describe('Tags, Vendors and Recipes tabs', () => {
    beforeEach(() => {
      cloudServer.queries.useGetTagTypesQuery = {
        tagTypes: [cloudTagType('type-label', 'Label')],
      }
      cloudServer.queries.useGetTagsQuery = {
        tags: [cloudTag('tag-frozen', 'frozen', 'type-label')],
      }
      cloudServer.queries.useGetVendorsQuery = {
        vendors: [cloudVendor('vendor-costco', 'Costco')],
      }
      cloudServer.queries.useGetRecipesQuery = {
        recipes: [cloudRecipe('recipe-sauce', 'Pasta Sauce')],
      }
    })

    async function expectSaveFailedAndNoRejection(message = SAVE_FAILED) {
      expect(await screen.findByText(message)).toBeInTheDocument()
      await rejections.settle()
      expect(rejections.list).toEqual([])
    }

    it('user sees a message when the server refuses the Tags Save, and the press is kept', async () => {
      const user = userEvent.setup()
      // Given a server that refuses the item write
      cloudServer.failing.add('useUpdateItemMutation')
      const router = renderPage('/items/item-flour/tags')

      // When the user presses the tag badge and Save
      await user.click(await screen.findByRole('button', { name: /frozen/i }))
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      // Then the write was sent, and a message says why it was refused
      await expectSaveFailedAndNoRejection(CATALOG_FORBIDDEN)
      expect(cloudServer.calls.useUpdateItemMutation).toEqual([
        { id: 'item-flour', input: { tagIds: ['tag-frozen'] } },
      ])
      // And the page stays, the badge is still pressed, and Save is on again
      expect(router.state.location.pathname).toBe('/items/item-flour/tags')
      expect(
        screen.getByRole('button', { name: /frozen/i, pressed: true }),
      ).toBeInTheDocument()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled(),
      )
    })

    it('user sees a message when the server refuses a new tag, and the dialog keeps the name', async () => {
      const user = userEvent.setup()
      // Given a server that refuses the new tag
      cloudServer.failing.add('useCreateTagMutation')
      renderPage('/items/item-flour/tags')

      // When the user adds a tag named "dairy"
      await user.click(await screen.findByRole('button', { name: /new tag$/i }))
      await user.type(screen.getByLabelText(/name/i), 'dairy')
      await user.click(screen.getByRole('button', { name: /^add tag$/i }))

      // Then the write was sent, a message says why, and the dialog stays open
      await expectSaveFailedAndNoRejection(CATALOG_FORBIDDEN)
      expect(cloudServer.calls.useCreateTagMutation).toHaveLength(1)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText(/name/i)).toHaveValue('dairy')
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /^add tag$/i }),
        ).toBeEnabled(),
      )
    })

    it('user sees a message when the server refuses a new tag type, and the dialog keeps the name', async () => {
      const user = userEvent.setup()
      // Given a household with no tag types (the button shows only then), and
      // a server that refuses the new one
      cloudServer.queries.useGetTagTypesQuery = { tagTypes: [] }
      cloudServer.queries.useGetTagsQuery = { tags: [] }
      cloudServer.failing.add('useCreateTagTypeMutation')
      renderPage('/items/item-flour/tags')

      // When the user adds a tag type named "Season"
      await user.click(
        await screen.findByRole('button', { name: /new tag type/i }),
      )
      await user.type(screen.getByLabelText(/name/i), 'Season')
      await user.click(screen.getByRole('button', { name: /^add$/i }))

      // Then the write was sent, a message says why, and the dialog stays open
      await expectSaveFailedAndNoRejection(CATALOG_FORBIDDEN)
      expect(cloudServer.calls.useCreateTagTypeMutation).toHaveLength(1)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText(/name/i)).toHaveValue('Season')
    })

    it('user sees a message when the server refuses the Vendors Save, and the press is kept', async () => {
      const user = userEvent.setup()
      // Given a server that refuses the item write
      cloudServer.failing.add('useUpdateItemMutation')
      const router = renderPage('/items/item-flour/vendors')

      // When the user presses the vendor badge and Save
      await user.click(await screen.findByRole('button', { name: /costco/i }))
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      // Then the write was sent, and a message says why it was refused
      await expectSaveFailedAndNoRejection(CATALOG_FORBIDDEN)
      expect(cloudServer.calls.useUpdateItemMutation).toEqual([
        { id: 'item-flour', input: { vendorIds: ['vendor-costco'] } },
      ])
      // And the page stays, the badge is still pressed, and Save is on again
      expect(router.state.location.pathname).toBe('/items/item-flour/vendors')
      expect(
        screen.getByRole('button', { name: /costco/i, pressed: true }),
      ).toBeInTheDocument()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled(),
      )
    })

    it('user sees a message when the server refuses the Recipes Save, and the press is kept', async () => {
      const user = userEvent.setup()
      // Given a server that refuses the recipe write
      cloudServer.failing.add('useSetItemRecipesMutation')
      const router = renderPage('/items/item-flour/recipes')

      // When the user presses the recipe badge and Save
      await user.click(
        await screen.findByRole('button', { name: /pasta sauce/i }),
      )
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      // Then the write was sent, and a message says why it was refused
      await expectSaveFailedAndNoRejection(CATALOG_FORBIDDEN)
      expect(cloudServer.calls.useSetItemRecipesMutation).toEqual([
        { itemId: 'item-flour', recipeIds: ['recipe-sauce'] },
      ])
      // And the page stays, the badge is still pressed, and Save is on again
      expect(router.state.location.pathname).toBe('/items/item-flour/recipes')
      expect(
        screen.getByRole('button', { name: /pasta sauce/i, pressed: true }),
      ).toBeInTheDocument()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled(),
      )
    })

    it('user sees a message when the server refuses a new recipe, and the dialog keeps the name', async () => {
      const user = userEvent.setup()
      // Given a server that refuses the new recipe
      cloudServer.failing.add('useCreateRecipeMutation')
      renderPage('/items/item-flour/recipes')

      // When the user adds a recipe named "Soup"
      await user.click(
        await screen.findByRole('button', { name: /new recipe/i }),
      )
      await user.type(screen.getByLabelText(/name/i), 'Soup')
      await user.click(screen.getByRole('button', { name: /add recipe/i }))

      // Then the write was sent, a message says why, and the dialog stays open
      await expectSaveFailedAndNoRejection(CATALOG_FORBIDDEN)
      expect(cloudServer.calls.useCreateRecipeMutation).toEqual([
        { name: 'Soup', items: [] },
      ])
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText(/name/i)).toHaveValue('Soup')
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /add recipe/i }),
        ).toBeEnabled(),
      )
    })
  })
})
