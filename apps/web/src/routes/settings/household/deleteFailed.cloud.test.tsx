import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
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
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'
import { watchUnhandledRejections } from '@/test/unhandledRejections'

// A failed delete, in CLOUD mode
// (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md). The local
// version of each test is in `deleteFailed.test.tsx`.
//
// `DeleteButton` shows `common.deleteFailed` when the caller's promise
// rejects. Here the generated delete mutation rejects with `FORBIDDEN`, and
// the cloud branch of the delete hook passes it on. A page that went back to
// `mutate` would swallow it in cloud too: the cloud `mutate` hands the error
// only to an `onError` the caller does not pass.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const DELETE_FAILED = 'Could not delete. Please try again.'

const MILK = cloudItem('item-milk', 'Milk')
const PRODUCE = cloudTagType('type-produce', 'Produce')
const FRUIT = cloudTag('tag-fruit', 'Fruit', 'type-produce')
const APPLES = cloudTag('tag-apples', 'Apples', 'type-produce', 'tag-fruit')
const COSTCO = cloudVendor('vendor-costco', 'Costco')
const PASTA = cloudRecipe('recipe-pasta', 'Pasta')
const FRIDGE = cloudShelf('shelf-fridge', 'Fridge')

describe('Deletes - a failed cloud delete', () => {
  let rejections: ReturnType<typeof watchUnhandledRejections>

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    sessionStorage.clear()
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    cloudServer.queries.useGetItemQuery = { item: MILK }
    cloudServer.queries.useGetItemsQuery = { items: [MILK] }
    cloudServer.queries.usePantryDataQuery = { items: [MILK], itemStocks: [] }
    cloudServer.queries.useItemStocksForItemQuery = { itemStocksForItem: [] }
    cloudServer.queries.useGetTagTypesQuery = { tagTypes: [PRODUCE] }
    cloudServer.queries.useGetTagsQuery = { tags: [FRUIT, APPLES] }
    cloudServer.queries.useGetVendorsQuery = { vendors: [COSTCO] }
    cloudServer.queries.useGetRecipesQuery = { recipes: [PASTA] }
    cloudServer.queries.useGetRecipeQuery = { recipe: PASTA }
    cloudServer.queries.useGetShelvesQuery = { shelves: [FRIDGE] }
    cloudServer.queries.useGetShelfQuery = { shelf: FRIDGE }
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  function renderAt(path: string) {
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

  it.each([
    [
      'a vendor from the vendor list',
      '/settings/household/vendors',
      'Delete "Costco"',
      'useDeleteVendorMutation',
    ],
    [
      'a recipe from the recipe list',
      '/settings/household/recipes',
      'Delete "Pasta"',
      'useDeleteRecipeMutation',
    ],
    [
      'a shelf from the shelf list',
      '/settings/household/shelves',
      'Delete Fridge',
      'useDeleteShelfMutation',
    ],
    [
      'a shelf from its own page',
      '/settings/household/shelves/shelf-fridge',
      /delete shelf/i,
      'useDeleteShelfMutation',
    ],
    [
      'a tag type',
      '/settings/household/tags',
      'Delete Produce',
      'useDeleteTagTypeMutation',
    ],
    [
      'a tag from the tags page',
      '/settings/household/tags',
      'Delete "Apples"',
      'useDeleteTagMutation',
    ],
    [
      'a vendor from its own page',
      '/settings/household/vendors/vendor-costco',
      /^delete$/i,
      'useDeleteVendorMutation',
    ],
    [
      'a recipe from its own page',
      '/settings/household/recipes/recipe-pasta',
      /^delete$/i,
      'useDeleteRecipeMutation',
    ],
    [
      'a tag from its own page',
      '/settings/household/tags/tag-apples',
      /^delete$/i,
      'useDeleteTagMutation',
    ],
    [
      'an item from its own page',
      '/items/item-milk',
      /^delete$/i,
      'useDeleteItemMutation',
    ],
  ])('user sees a message when the server refuses to delete %s', async (_what, path, trigger, mutation) => {
    const user = userEvent.setup()
    // Given a server that refuses the delete
    cloudServer.failing.add(mutation)
    const router = renderAt(path)

    // When the user deletes it and confirms
    await user.click(await screen.findByRole('button', { name: trigger }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }))

    // Then the delete was sent, a message says it did not happen, and the
    // page stays
    expect(await screen.findByText(DELETE_FAILED)).toBeInTheDocument()
    expect(cloudServer.calls[mutation]).toHaveLength(1)
    expect(router.state.location.pathname).toBe(path)
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  // A tag with child tags asks what to do with them in its own dialog, not
  // through `DeleteButton`.
  it.each([
    ['Keep child tags (make them top-level)', false],
    ['Delete all child tags', true],
  ])('user sees a message when the server refuses "%s"', async (choice, deleteChildren) => {
    const user = userEvent.setup()
    // Given a tag with a child tag, and a server that refuses the delete
    cloudServer.failing.add('useDeleteTagMutation')
    const router = renderAt('/settings/household/tags/tag-fruit')

    // When the user deletes it and picks what happens to the child tag
    await user.click(await screen.findByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: choice }))

    // Then the delete was sent, a message shows, and the page stays
    expect(await screen.findByText(DELETE_FAILED)).toBeInTheDocument()
    expect(cloudServer.calls.useDeleteTagMutation).toEqual([
      expect.objectContaining({ id: 'tag-fruit', deleteChildren }),
    ])
    expect(router.state.location.pathname).toBe(
      '/settings/household/tags/tag-fruit',
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })
})
