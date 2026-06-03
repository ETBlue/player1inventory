// src/routes/items/new.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { routeTree } from '@/routeTree.gen'

describe('New item page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderNewItemPage = () => {
    const history = createMemoryHistory({ initialEntries: ['/items/new'] })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can create a new item by entering a name', async () => {
    const user = userEvent.setup()

    // Given the new item page
    renderNewItemPage()
    await waitFor(() => screen.getByLabelText(/name/i))

    // When user enters a name and submits
    await user.type(screen.getByLabelText(/name/i), 'Milk')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the item is saved
    await waitFor(async () => {
      const items = await db.items.toArray()
      expect(items).toHaveLength(1)
      expect(items[0].name).toBe('Milk')
    })
  })

  it('save button is disabled when name is empty', async () => {
    // Given the new item page with no fields filled
    renderNewItemPage()
    await waitFor(() => screen.getByLabelText(/name/i))

    // Then save button is disabled
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('new item page shows only name and package unit fields', async () => {
    // Given the new item page
    renderNewItemPage()
    await waitFor(() => screen.getByLabelText(/name/i))

    // Then name and package unit are shown
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/package unit/i)).toBeInTheDocument()

    // And measurement/expiration/stock fields are NOT shown (edit-only)
    expect(
      screen.queryByRole('switch', { name: /track in measurement/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('combobox', { name: /calculate expiration/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText(/amount per consume/i),
    ).not.toBeInTheDocument()
  })
})
