import { ApolloProvider } from '@apollo/client/react'
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
import { saveNavigationHistory } from '@/lib/sessionStorage'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

describe('Household config page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.delete()
    await db.open()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  function renderPage() {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/settings/household'],
      }),
      context: { queryClient },
    })
    render(
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApolloProvider>,
    )
    return router
  }

  it('user sees the "General" title with the export and import cards', async () => {
    // Given the household config page
    renderPage()

    // Then the title is "General", the label of this page's sidebar link
    expect(
      await screen.findByRole('heading', { level: 1, name: 'General' }),
    ).toBeInTheDocument()

    // And the export and import cards are shown
    expect(screen.getByText('Download my data')).toBeInTheDocument()
    expect(screen.getByText('Import data')).toBeInTheDocument()
  })

  it('user on mobile sees a Go back icon and no bottom bar on the household config page', async () => {
    // Given the household config page on a phone (tests render the mobile
    // layout unless told otherwise)
    renderPage()
    const title = await screen.findByRole('heading', {
      level: 1,
      name: 'General',
    })

    // Then the bottom bar is gone, and a Back icon comes before the title,
    // the same as on the other household pages
    expect(
      screen.queryByRole('navigation', { name: 'Bottom navigation' }),
    ).toBeNull()
    const back = screen.getByRole('button', { name: 'Go back' })
    expect(back).toHaveClass('lg:hidden')
    expect(
      back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('user goes back from the household config page to the settings menu', async () => {
    // Given the user came from the mobile /settings menu
    sessionStorage.clear()
    saveNavigationHistory(['/', '/settings', '/settings/household'])
    const router = renderPage()
    await screen.findByRole('heading', { level: 1, name: 'General' })

    // When the user presses Go back
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }))

    // Then they are on the settings menu again
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings')
    })
  })

  it('user sees no danger zone on the household config page yet', async () => {
    // Given the household config page has rendered
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'General' }),
    ).toBeInTheDocument()

    // Then there is no danger zone (it arrives with the purges in H6)
    expect(screen.queryByText(/danger/i)).not.toBeInTheDocument()
  })
})
