import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { DEFAULT_LOCATION_ID } from '@/types'

// The location people page in LOCAL mode (households H5c, task H.5,
// decision T41). Local mode has one person and no roles, so the page does
// not exist there: its URL goes to the locations list.

afterEach(async () => {
  cleanup()
  localStorage.clear()
  await db.delete()
  await db.open()
})

describe('location people page — local mode', () => {
  it('user in local mode who opens a location page lands on the locations list', async () => {
    // Given local mode
    localStorage.setItem('data-mode', 'local')
    localStorage.setItem('e2e-skip-onboarding', 'true')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: [
          `/settings/household/locations/${DEFAULT_LOCATION_ID}`,
        ],
      }),
      context: { queryClient },
    })

    // When they open the people page of their default location
    render(
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApolloProvider>,
    )

    // Then they are on the locations list, and nothing of the people page
    // shows
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(
        /^\/settings\/household\/locations\/?$/,
      ),
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Locations' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('People')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Leave location' })).toBeNull()
  })
})
