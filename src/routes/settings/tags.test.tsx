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
