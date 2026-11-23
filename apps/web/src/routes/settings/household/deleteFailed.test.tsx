import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  createItem,
  createRecipe,
  createShelf,
  createTag,
  createTagType,
  createVendor,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { watchUnhandledRejections } from '@/test/unhandledRejections'
import { TagColor } from '@/types'

// A failed delete, on every page whose delete goes through a confirm button
// (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
//
// Before the fix there were two shapes of the same bug:
// - pages that passed `mutate` to `DeleteButton`: the error came back through
//   an `onError` nobody gave, so nothing on screen said the delete failed;
// - pages that passed `mutateAsync`: `DeleteButton` had no catch, so the
//   rejection was unhandled, and still nothing on screen.
// `DeleteButton` now shows `common.deleteFailed`, and every caller awaits the
// delete so the button can see a failure.
//
// Each test is local mode: the Dexie delete is made to fail.
const DELETE_FAILED = 'Could not delete. Please try again.'

describe('a failed delete', () => {
  let queryClient: QueryClient
  let rejections: ReturnType<typeof watchUnhandledRejections>

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.vendors.clear()
    await db.recipes.clear()
    await db.shelves.clear()
    await db.inventoryLogs.clear()
    await db.cartItems.clear()
    await db.shoppingCarts.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
    vi.restoreAllMocks()
  })

  const renderAt = (path: string) => {
    const history = createMemoryHistory({ initialEntries: [path] })
    const router = createRouter({ routeTree, history })
    render(
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApolloProvider>,
    )
    return router
  }

  // Opens the confirm dialog with `trigger`, then presses its Delete button
  const confirmDelete = async (
    user: ReturnType<typeof userEvent.setup>,
    trigger: HTMLElement,
  ) => {
    await user.click(trigger)
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }))
  }

  const expectMessageAndNoRejection = async () => {
    expect(await screen.findByText(DELETE_FAILED)).toBeInTheDocument()
    await rejections.settle()
    expect(rejections.list).toEqual([])
  }

  it('user sees a message when deleting a vendor from the vendor list fails', async () => {
    // Given a vendor, and a database that refuses the delete
    const vendor = await createVendor('Costco')
    renderAt('/settings/household/vendors')
    vi.spyOn(db.vendors, 'delete').mockRejectedValueOnce(new Error('disk full'))
    const user = userEvent.setup()

    // When the user deletes it
    await confirmDelete(
      user,
      await screen.findByRole('button', { name: 'Delete "Costco"' }),
    )

    // Then a message says the delete did not happen, and the vendor stays
    await expectMessageAndNoRejection()
    expect(await db.vendors.get(vendor.id)).toBeDefined()
    expect(
      screen.getByRole('button', { name: 'Delete "Costco"' }),
    ).toBeInTheDocument()
  })

  it('user sees a message when deleting a recipe from the recipe list fails', async () => {
    // Given a recipe, and a database that refuses the delete
    const recipe = await createRecipe({ name: 'Pasta' })
    renderAt('/settings/household/recipes')
    vi.spyOn(db.recipes, 'delete').mockRejectedValueOnce(new Error('disk full'))
    const user = userEvent.setup()

    // When the user deletes it
    await confirmDelete(
      user,
      await screen.findByRole('button', { name: 'Delete "Pasta"' }),
    )

    // Then a message says the delete did not happen, and the recipe stays
    await expectMessageAndNoRejection()
    expect(await db.recipes.get(recipe.id)).toBeDefined()
  })

  it('user sees a message when deleting a shelf from the shelf list fails', async () => {
    // Given a shelf, and a database that refuses the delete
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [],
    })
    renderAt('/settings/household/shelves')
    vi.spyOn(db.shelves, 'delete').mockRejectedValueOnce(new Error('disk full'))
    const user = userEvent.setup()

    // When the user deletes it
    await confirmDelete(
      user,
      await screen.findByRole('button', { name: 'Delete Fridge' }),
    )

    // Then a message says the delete did not happen, and the shelf stays
    await expectMessageAndNoRejection()
    expect(await db.shelves.get(shelf.id)).toBeDefined()
  })

  it('user sees a message when deleting a shelf from its own page fails', async () => {
    // Given a shelf, and a database that refuses the delete
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [],
    })
    const router = renderAt(`/settings/household/shelves/${shelf.id}`)
    await waitFor(() =>
      expect(screen.getByLabelText('Shelf name')).toHaveValue('Fridge'),
    )
    vi.spyOn(db.shelves, 'delete').mockRejectedValueOnce(new Error('disk full'))
    const user = userEvent.setup()

    // When the user deletes it
    await confirmDelete(
      user,
      screen.getByRole('button', { name: /delete shelf/i }),
    )

    // Then a message says the delete did not happen, and the page stays
    await expectMessageAndNoRejection()
    expect(router.state.location.pathname).toBe(
      `/settings/household/shelves/${shelf.id}`,
    )
    expect(await db.shelves.get(shelf.id)).toBeDefined()
  })

  it('user sees a message when deleting a tag type fails', async () => {
    // Given a tag type, and a database that refuses the delete
    const tagType = await createTagType({
      name: 'Produce',
      color: TagColor.green,
    })
    renderAt('/settings/household/tags')
    vi.spyOn(db.tagTypes, 'delete').mockRejectedValueOnce(
      new Error('disk full'),
    )
    const user = userEvent.setup()

    // When the user deletes it
    await confirmDelete(
      user,
      await screen.findByRole('button', { name: 'Delete Produce' }),
    )

    // Then a message says the delete did not happen, and the tag type stays
    await expectMessageAndNoRejection()
    expect(await db.tagTypes.get(tagType.id)).toBeDefined()
  })

  it('user sees a message when deleting a tag from the tags page fails', async () => {
    // Given a tag, and a database that refuses the delete
    const tagType = await createTagType({
      name: 'Produce',
      color: TagColor.green,
    })
    const tag = await createTag({ name: 'Apples', typeId: tagType.id })
    renderAt('/settings/household/tags')
    vi.spyOn(db.tags, 'delete').mockRejectedValueOnce(new Error('disk full'))
    const user = userEvent.setup()

    // When the user deletes it
    await confirmDelete(
      user,
      await screen.findByRole('button', { name: 'Delete "Apples"' }),
    )

    // Then a message says the delete did not happen, and the tag stays
    await expectMessageAndNoRejection()
    expect(await db.tags.get(tag.id)).toBeDefined()
  })

  it('user sees a message when deleting a vendor from its own page fails', async () => {
    // Given a vendor, and a database that refuses the delete
    const vendor = await createVendor('Costco')
    const router = renderAt(`/settings/household/vendors/${vendor.id}`)
    vi.spyOn(db.vendors, 'delete').mockRejectedValueOnce(new Error('disk full'))
    const user = userEvent.setup()

    // When the user deletes it
    await confirmDelete(
      user,
      await screen.findByRole('button', { name: /^delete$/i }),
    )

    // Then a message says the delete did not happen, and the page stays
    await expectMessageAndNoRejection()
    expect(router.state.location.pathname).toBe(
      `/settings/household/vendors/${vendor.id}`,
    )
    expect(await db.vendors.get(vendor.id)).toBeDefined()
  })

  it('user sees a message when deleting a recipe from its own page fails', async () => {
    // Given a recipe, and a database that refuses the delete
    const recipe = await createRecipe({ name: 'Pasta' })
    const router = renderAt(`/settings/household/recipes/${recipe.id}`)
    vi.spyOn(db.recipes, 'delete').mockRejectedValueOnce(new Error('disk full'))
    const user = userEvent.setup()

    // When the user deletes it
    await confirmDelete(
      user,
      await screen.findByRole('button', { name: /^delete$/i }),
    )

    // Then a message says the delete did not happen, and the page stays
    await expectMessageAndNoRejection()
    expect(router.state.location.pathname).toBe(
      `/settings/household/recipes/${recipe.id}`,
    )
    expect(await db.recipes.get(recipe.id)).toBeDefined()
  })

  it('user sees a message when deleting a tag from its own page fails', async () => {
    // Given a tag with no child tags, and a database that refuses the delete
    const tagType = await createTagType({
      name: 'Produce',
      color: TagColor.green,
    })
    const tag = await createTag({ name: 'Apples', typeId: tagType.id })
    const router = renderAt(`/settings/household/tags/${tag.id}`)
    vi.spyOn(db.tags, 'delete').mockRejectedValueOnce(new Error('disk full'))
    const user = userEvent.setup()

    // When the user deletes it
    await confirmDelete(
      user,
      await screen.findByRole('button', { name: /^delete$/i }),
    )

    // Then a message says the delete did not happen, and the page stays
    await expectMessageAndNoRejection()
    expect(router.state.location.pathname).toBe(
      `/settings/household/tags/${tag.id}`,
    )
    expect(await db.tags.get(tag.id)).toBeDefined()
  })

  // A tag with child tags asks what to do with them in its own dialog, not
  // through `DeleteButton`. Both of its buttons had the same unhandled
  // rejection.
  it.each([
    'Keep child tags (make them top-level)',
    'Delete all child tags',
  ])('user sees a message when "%s" fails', async (choice) => {
    // Given a tag with a child tag, and a database that refuses the delete
    const tagType = await createTagType({
      name: 'Produce',
      color: TagColor.green,
    })
    const parent = await createTag({ name: 'Fruit', typeId: tagType.id })
    await createTag({ name: 'Apples', typeId: tagType.id, parentId: parent.id })
    const router = renderAt(`/settings/household/tags/${parent.id}`)
    vi.spyOn(db.tags, 'delete').mockRejectedValueOnce(new Error('disk full'))
    const user = userEvent.setup()

    // When the user deletes it and picks what happens to the child tag
    await user.click(await screen.findByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: choice }))

    // Then a message says the delete did not happen, and the page stays
    await expectMessageAndNoRejection()
    expect(router.state.location.pathname).toBe(
      `/settings/household/tags/${parent.id}`,
    )
    expect(await db.tags.get(parent.id)).toBeDefined()
  })

  it('user sees a message when deleting an item from its own page fails', async () => {
    // Given an item, and a database that refuses the delete
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })
    const router = renderAt(`/items/${item.id}`)
    vi.spyOn(db.items, 'delete').mockRejectedValueOnce(new Error('disk full'))
    const user = userEvent.setup()

    // When the user deletes it
    await confirmDelete(
      user,
      await screen.findByRole('button', { name: /^delete$/i }),
    )

    // Then a message says the delete did not happen, and the page stays
    await expectMessageAndNoRejection()
    expect(router.state.location.pathname).toBe(`/items/${item.id}`)
    expect(await db.items.get(item.id)).toBeDefined()
  })
})
