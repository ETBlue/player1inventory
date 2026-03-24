import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem, createTag, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Tags Tab - Add Tag Functionality', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
  })

  it('user can create a new tag and it is automatically assigned to the item', async () => {
    // Given an item and a tag type with no tags
    const tagType = await createTagType({ name: 'categories', color: 'blue' })
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
      initialEntries: [`/items/${item.id}/tags`],
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
    const _tagType = await createTagType({ name: 'categories', color: 'blue' })
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
      initialEntries: [`/items/${item.id}/tags`],
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
      initialEntries: [`/items/${item.id}/tags`],
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

  it('tag badge has aria-pressed reflecting assigned state', async () => {
    // Given a tag type with a tag not yet assigned to the item
    const tagType = await createTagType({ name: 'Category', color: 'blue' })
    const _tag = await createTag({ name: 'dairy', typeId: tagType.id })
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
      initialEntries: [`/items/${item.id}/tags`],
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
})
