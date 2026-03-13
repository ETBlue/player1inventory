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
import { createTag, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { TagColor } from '@/types/index'

describe('Tag settings page - context-aware back navigation', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderTagSettingsPage = (initialPath = '/settings/tags') => {
    const history = createMemoryHistory({ initialEntries: [initialPath] })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    return router
  }

  it('user can navigate back to /settings when no navigation history exists', async () => {
    // Given tag settings page with no navigation history
    const router = renderTagSettingsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    // When user clicks back button (ArrowLeft icon button)
    const allButtons = screen.getAllByRole('button')
    const backButton = allButtons[0] // First button is the back button
    await user.click(backButton)

    // Then navigates to settings page
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings')
    })
  })

  it('user can navigate back to /shopping when coming from shopping page', async () => {
    // Given navigation history: shopping -> tags
    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify(['/shopping', '/settings/tags']),
    )

    const router = renderTagSettingsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    // When user clicks back button
    const allButtons = screen.getAllByRole('button')
    const backButton = allButtons[0] // First button is the back button
    await user.click(backButton)

    // Then navigates back to shopping page
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/shopping')
    })
  })

  it('user can navigate back to / (pantry) when coming from pantry page', async () => {
    // Given navigation history: pantry -> tags
    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify(['/', '/settings/tags']),
    )

    const router = renderTagSettingsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    // When user clicks back button
    const allButtons = screen.getAllByRole('button')
    const backButton = allButtons[0] // First button is the back button
    await user.click(backButton)

    // Then navigates back to pantry page
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
  })
})

describe('Tags List Page - Database Operations', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  it('tag type can be updated in database', async () => {
    // Given two tag types with tags
    const type1 = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const type2 = await createTagType({
      name: 'Location',
      color: TagColor.green,
    })
    const tag = await createTag({ name: 'Organic', typeId: type1.id })

    const history = createMemoryHistory({ initialEntries: ['/settings/tags'] })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // Wait for page to load
    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    // When tag type is updated in database
    await db.tags.update(tag.id, { typeId: type2.id })

    // Then tag is moved to new type in database
    const updatedTag = await db.tags.get(tag.id)
    expect(updatedTag?.typeId).toBe(type2.id)

    // Note: Testing the full drag-and-drop UI interaction would require
    // @dnd-kit testing utilities or manual event simulation.
    // The drag-and-drop UX will be verified in Task 7 manual testing.
  })
})
