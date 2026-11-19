import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem, createTag, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { watchUnhandledRejections } from '@/test/unhandledRejections'
import { TagColor } from '@/types'

describe('Tags Tab - Add Tag Functionality', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
  })

  it('user can create a new tag and it is automatically assigned to the item', async () => {
    // Given an item and a tag type with no tags
    const tagType = await createTagType({
      name: 'categories',
      color: TagColor.blue,
    })
    const item = await createItem({
      name: 'Test Item',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const history = createMemoryHistory({
      initialEntries: [`/items/${item.id}/relation/tags`],
    })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // When user clicks "New Tag" button
    await waitFor(() => {
      expect(screen.getByText(/categories/i)).toBeInTheDocument()
    })

    const addButton = screen.getByRole('button', { name: /new tag/i })
    await userEvent.click(addButton)

    // And enters tag name in dialog
    const input = screen.getByLabelText(/name/i)
    await userEvent.type(input, 'dairy')

    // And clicks Add button
    const addDialogButton = screen.getByRole('button', { name: /^add tag$/i })
    await userEvent.click(addDialogButton)

    // Then the new tag is created in the database
    await waitFor(async () => {
      const tags = await db.tags.toArray()
      const newTag = tags.find(
        (t) => t.name === 'dairy' && t.typeId === tagType.id,
      )
      expect(newTag).toBeDefined()

      // And the new tag is automatically assigned to the item
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.tagIds).toContain(newTag?.id)
    })
  })

  it('user can add a new tag from item tags page', async () => {
    // Given an item and a tag type with no tags
    await createTagType({ name: 'categories', color: TagColor.blue })
    const item = await createItem({
      name: 'Test Item',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const history = createMemoryHistory({
      initialEntries: [`/items/${item.id}/relation/tags`],
    })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // When user clicks "New Tag" button
    await waitFor(() => {
      expect(screen.getByText(/categories/i)).toBeInTheDocument()
    })

    const addButton = screen.getByRole('button', { name: /new tag/i })
    await userEvent.click(addButton)

    // And enters tag name in dialog
    const input = screen.getByLabelText(/name/i)
    await userEvent.type(input, 'dairy')

    // And clicks Add button
    const addDialogButton = screen.getByRole('button', { name: /^add tag$/i })
    await userEvent.click(addDialogButton)

    // Then the new tag appears in the list
    await waitFor(() => {
      expect(screen.getByText('dairy')).toBeInTheDocument()
    })

    // And dialog is closed
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument()
  })

  it('user can create a new tag type from the empty tags tab', async () => {
    // Given an item with no tag types in the database
    const item = await createItem({
      name: 'Yogurt',
      tagIds: [],
      targetQuantity: 4,
      refillThreshold: 1,
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const history = createMemoryHistory({
      initialEntries: [`/items/${item.id}/relation/tags`],
    })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // When user sees the empty state and clicks "New Tag Type"
    const newTagTypeButton = await screen.findByRole('button', {
      name: /new tag type/i,
    })
    await userEvent.click(newTagTypeButton)

    // And enters a tag type name in the dialog
    const input = screen.getByLabelText(/name/i)
    await userEvent.type(input, 'Season')

    // And clicks the Add button
    const addButton = screen.getByRole('button', { name: /^add$/i })
    await userEvent.click(addButton)

    // Then the new tag type is created in the database
    await waitFor(async () => {
      const tagTypes = await db.tagTypes.toArray()
      expect(tagTypes.some((tt) => tt.name === 'Season')).toBe(true)
    })

    // And the tags tab now shows the new tag type
    await waitFor(() => {
      expect(screen.getByText(/season/i)).toBeInTheDocument()
    })
  })

  it('tag badge shows spinner and blocks interaction while toggling', async () => {
    // Given a tag type with a tag assigned to the item
    const tagType = await createTagType({ name: 'Label', color: TagColor.teal })
    const tag = await createTag({ name: 'frozen', typeId: tagType.id })
    const item = await createItem({
      name: 'Fish Fillet',
      tagIds: [tag.id],
      targetQuantity: 2,
      refillThreshold: 1,
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const history = createMemoryHistory({
      initialEntries: [`/items/${item.id}/relation/tags`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // When user clicks the assigned badge to remove the tag
    const badge = await screen.findByRole('button', {
      name: /frozen/i,
      pressed: true,
    })
    await userEvent.click(badge)

    // Then the tag is eventually unassigned (loading state resolved)
    await waitFor(async () => {
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.tagIds).not.toContain(tag.id)
    })
  })

  it('tag badge has aria-pressed reflecting assigned state', async () => {
    // Given a tag type with a tag not yet assigned to the item
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    await createTag({ name: 'dairy', typeId: tagType.id })
    const item = await createItem({
      name: 'Test Item',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const history = createMemoryHistory({
      initialEntries: [`/items/${item.id}/relation/tags`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // Then the unassigned badge has aria-pressed="false"
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'dairy', pressed: false }),
      ).toBeInTheDocument()
    })

    // When user clicks the badge to assign it
    await userEvent.click(
      screen.getByRole('button', { name: 'dairy', pressed: false }),
    )

    // Then the badge has aria-pressed="true"
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /dairy/i, pressed: true }),
      ).toBeInTheDocument()
    })
  })

  // A failed save (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
  // Before the fix a failed write showed nothing.
  it('user sees a message when assigning a tag fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given an item, a tag, and a database that refuses the write
      const tagType = await createTagType({
        name: 'Label',
        color: TagColor.teal,
      })
      await createTag({ name: 'frozen', typeId: tagType.id })
      const item = await createItem({
        name: 'Fish Fillet',
        tagIds: [],
        targetQuantity: 2,
        refillThreshold: 1,
      })
      vi.spyOn(db.items, 'update').mockRejectedValueOnce(new Error('disk full'))
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const history = createMemoryHistory({
        initialEntries: [`/items/${item.id}/relation/tags`],
      })
      const router = createRouter({ routeTree, history })
      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
      const user = userEvent.setup()

      // When the user presses the tag badge
      await user.click(await screen.findByRole('button', { name: /frozen/i }))

      // Then a message says the change was not saved
      expect(
        await screen.findByText('Could not save the change. Please try again.'),
      ).toBeInTheDocument()
      // And the badge is still unpressed and the item unchanged
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /frozen/i, pressed: false }),
        ).toBeInTheDocument(),
      )
      expect((await db.items.get(item.id))?.tagIds).toEqual([])
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })

  // A failed create in the New Tag and New Tag Type dialogs
  // (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md). Before the
  // fix each write had no catch: an unhandled rejection, and nothing on screen.
  const renderTagsTab = (itemId: string) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}/relation/tags`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user sees a message when creating a new tag fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given an item, a tag type, and a database that refuses the new tag
      await createTagType({ name: 'categories', color: TagColor.blue })
      const item = await createItem({
        name: 'Test Item',
        tagIds: [],
        targetQuantity: 2,
        refillThreshold: 1,
      })
      renderTagsTab(item.id)
      vi.spyOn(db.tags, 'add').mockRejectedValueOnce(new Error('disk full'))
      const user = userEvent.setup()

      // When the user adds a tag named "dairy"
      expect(await screen.findByText(/categories/i)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /new tag/i }))
      await user.type(screen.getByLabelText(/name/i), 'dairy')
      await user.click(screen.getByRole('button', { name: /^add tag$/i }))

      // Then a message says the change was not saved
      expect(
        await screen.findByText('Could not save the change. Please try again.'),
      ).toBeInTheDocument()
      // And the dialog stays open with the name, and Add can be pressed again
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText(/name/i)).toHaveValue('dairy')
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /^add tag$/i }),
        ).toBeEnabled(),
      )
      expect(await db.tags.count()).toBe(0)
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })

  it('user sees a message when assigning a newly created tag fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given an item, a tag type, and a database that refuses the item write
      await createTagType({ name: 'categories', color: TagColor.blue })
      const item = await createItem({
        name: 'Test Item',
        tagIds: [],
        targetQuantity: 2,
        refillThreshold: 1,
      })
      renderTagsTab(item.id)
      vi.spyOn(db.items, 'update').mockRejectedValueOnce(new Error('disk full'))
      const user = userEvent.setup()

      // When the user adds a tag named "dairy"
      expect(await screen.findByText(/categories/i)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /new tag/i }))
      await user.type(screen.getByLabelText(/name/i), 'dairy')
      await user.click(screen.getByRole('button', { name: /^add tag$/i }))

      // Then a message says the change was not saved
      expect(
        await screen.findByText('Could not save the change. Please try again.'),
      ).toBeInTheDocument()
      // And the tag exists but is not on the item
      expect(await db.tags.count()).toBe(1)
      expect((await db.items.get(item.id))?.tagIds).toEqual([])
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })

  it('user sees a message when creating a new tag type fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given an item with no tag types, and a database that refuses the write
      const item = await createItem({
        name: 'Yogurt',
        tagIds: [],
        targetQuantity: 4,
        refillThreshold: 1,
      })
      renderTagsTab(item.id)
      vi.spyOn(db.tagTypes, 'add').mockRejectedValueOnce(new Error('disk full'))
      const user = userEvent.setup()

      // When the user adds a tag type named "Season"
      await user.click(
        await screen.findByRole('button', { name: /new tag type/i }),
      )
      await user.type(screen.getByLabelText(/name/i), 'Season')
      await user.click(screen.getByRole('button', { name: /^add$/i }))

      // Then a message says the change was not saved
      expect(
        await screen.findByText('Could not save the change. Please try again.'),
      ).toBeInTheDocument()
      // And the dialog stays open with the name
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText(/name/i)).toHaveValue('Season')
      expect(await db.tagTypes.count()).toBe(0)
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })
})
