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

// The Members page in LOCAL mode (households H5b, task G.9). Local mode has
// one person and no households (design, *Local mode*), so the page is not
// listed there, and opening its URL goes to the household page.

afterEach(async () => {
  cleanup()
  localStorage.clear()
  await db.delete()
  await db.open()
})

describe('Members page — local mode', () => {
  it('user in local mode who opens the members URL lands on the household page', async () => {
    // Given local mode
    localStorage.setItem('data-mode', 'local')
    localStorage.setItem('e2e-skip-onboarding', 'true')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/settings/household/members'],
      }),
      context: { queryClient },
    })

    // When they open /settings/household/members
    render(
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApolloProvider>,
    )

    // Then they are on the household page, and nothing of the members page
    // shows
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/settings/household'),
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'General' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Members' })).toBeNull()
  })
})
