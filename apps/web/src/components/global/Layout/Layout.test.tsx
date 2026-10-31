import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActiveLocationProvider } from '@/hooks/useActiveLocation'
import { noopApolloClient } from '@/test/apolloStub'
import { mockScreen } from '@/test/viewport'
import { Layout } from './Layout'

// Layout is rendered standalone with a stand-in page, not through the app
// routeTree, so the only <h1> inside <main> is the Layout's own sr-only one.
async function renderLayout(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const rootRoute = createRootRoute({
    component: () => (
      <ActiveLocationProvider>
        <Layout>
          <p>page body</p>
        </Layout>
      </ActiveLocationProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <ApolloProvider client={noopApolloClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>,
  )
  // Wait for the route to render, so an absent heading means "not there",
  // not "not rendered yet".
  await screen.findByText('page body')
  return within(screen.getByRole('main'))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Layout', () => {
  it('user with a screen reader finds the app heading on a normal page', async () => {
    // Given a mobile screen on the pantry
    mockScreen({ desktop: false })

    // When the layout renders
    const main = await renderLayout('/')

    // Then the sr-only <h1> is inside <main>
    const heading = main.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Player 1 Inventory')
    expect(heading).toHaveClass('sr-only', 'lg:hidden')
  })

  it('renders no app heading on a full-screen page', async () => {
    // Given a mobile screen on an item page, which is full-screen
    mockScreen({ desktop: false })

    // When the layout renders
    const main = await renderLayout('/items/abc')

    // Then <main> has no layout <h1>; the page brings its own title
    expect(main.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('renders no app heading on a household list page on mobile', async () => {
    // Given a mobile screen on the tags list, which is full-screen on mobile
    mockScreen({ desktop: false })

    const main = await renderLayout('/settings/household/tags')

    expect(main.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('renders the app heading on a household list page on desktop', async () => {
    // Given a desktop screen on the tags list, which keeps the sidebar there
    mockScreen({ desktop: true })

    const main = await renderLayout('/settings/household/tags')

    // Then the heading is in the DOM (CSS hides it at lg, where the sidebar
    // shows its own <h1>)
    expect(main.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})
