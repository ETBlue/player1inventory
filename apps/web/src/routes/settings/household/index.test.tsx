import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
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

  it('user sees the "My data" title with the export and import cards', async () => {
    // Given the household config page
    renderPage()

    // Then the title is "My data"
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My data' }),
    ).toBeInTheDocument()

    // And the export and import cards are shown
    expect(screen.getByText('Download my data')).toBeInTheDocument()
    expect(screen.getByText('Import data')).toBeInTheDocument()
  })

  it('user sees no danger zone on the household config page yet', async () => {
    // Given the household config page has rendered
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My data' }),
    ).toBeInTheDocument()

    // Then there is no danger zone (it arrives with the purges in H6)
    expect(screen.queryByText(/danger/i)).not.toBeInTheDocument()
  })
})
