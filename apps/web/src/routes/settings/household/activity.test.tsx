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

// The Activity page in LOCAL mode (households H6, task J.6). Local mode has
// no roles and no activity log (Global Constraints), so the page is not
// listed there, and opening its URL goes to the household page.

afterEach(async () => {
  cleanup()
  localStorage.clear()
  await db.delete()
  await db.open()
})

describe('Activity page — local mode', () => {
  it('user in local mode who opens the activity URL lands on the household page', async () => {
    // Given local mode
    localStorage.setItem('data-mode', 'local')
    localStorage.setItem('e2e-skip-onboarding', 'true')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/settings/household/activity'],
      }),
      context: { queryClient },
    })

    // When they open /settings/household/activity
    render(
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApolloProvider>,
    )

    // Then they are on the household page, and nothing of the activity page
    // shows
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/settings/household'),
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My data' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Activity' })).toBeNull()
  })
})
