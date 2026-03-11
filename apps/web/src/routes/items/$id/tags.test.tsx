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
import { createItem, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Tags Tab - Add Tag Functionality', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
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
})
