import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from '@/hooks/useActiveLocation'
import { noopApolloClient } from '@/test/apolloStub'
import { elementAt } from '@/test/narrow'
import { mockScreen } from '@/test/viewport'
import { DEFAULT_LOCATION_ID } from '@/types'
import { Sidebar } from './Sidebar'

// The Sidebar is rendered standalone (not through the app routeTree) so the
// page toolbars — which mount their own `lg:hidden` LocationSwitcher — are not
// in the DOM. jsdom loads no CSS, so rendering both would put two triggers with
// the same accessible name in the tree and break strict-mode queries.
function renderSidebar(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const rootRoute = createRootRoute({
    component: () => (
      <ActiveLocationProvider>
        <Sidebar />
        {/* Proves the route has rendered, so a test can check that the
            sidebar is absent rather than not rendered yet. */}
        <p>route rendered</p>
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
}

describe('Sidebar', () => {
  beforeEach(async () => {
    await db.locations.clear()
    const now = new Date()
    await db.locations.put({
      id: DEFAULT_LOCATION_ID,
      name: 'My Home',
      order: 0,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    })
    localStorage.removeItem(activeLocationStorageKey('local'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('user sees the location switcher in the sidebar on a normal page', async () => {
    // Given a normal (non-fullscreen) page
    renderSidebar('/')

    // Then the sidebar renders the full-name location switcher
    const nav = await screen.findByRole('navigation', {
      name: 'Sidebar navigation',
    })
    await waitFor(() => {
      expect(
        within(nav).getByRole('button', { name: /switch location/i }),
      ).toHaveTextContent('My Home')
    })
  })

  it('places the switcher between the app title and the nav links', async () => {
    // Given a normal page
    renderSidebar('/')
    const nav = await screen.findByRole('navigation', {
      name: 'Sidebar navigation',
    })
    await waitFor(() =>
      expect(
        within(nav).getByRole('button', { name: /switch location/i }),
      ).toBeInTheDocument(),
    )

    // Then the switcher sits after the <h1> and before the first nav link
    const heading = within(nav).getByRole('heading', { level: 1 })
    const trigger = within(nav).getByRole('button', {
      name: /switch location/i,
    })
    const pantryLink = within(nav).getByRole('link', { name: /pantry/i })
    expect(
      heading.compareDocumentPosition(trigger) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      trigger.compareDocumentPosition(pantryLink) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('user sees Settings pinned to the bottom, below the location-aware links', async () => {
    // Given a normal page
    renderSidebar('/')
    const nav = await screen.findByRole('navigation', {
      name: 'Sidebar navigation',
    })

    // When the nav links are read in DOM order
    const links = within(nav).getAllByRole('link')
    const labels = links.map((link) => link.textContent?.trim())

    // Then Pantry is still first and Settings is last. DOM order is asserted
    // rather than the pinning class alone, so a Settings link that is visually
    // last but not last in the tree still fails.
    expect(labels).toEqual(['Pantry', 'Shopping', 'Cooking', 'Settings'])

    // And Settings lives in its own block, separated from the three
    // location-aware links and pushed to the bottom of the flex column.
    const settingsLink = elementAt(links, links.length - 1)
    const pantryLink = elementAt(links, 0)
    const settingsBlock = settingsLink.parentElement
    expect(settingsBlock).not.toBe(pantryLink.parentElement)
    // jsdom applies no layout, so "pinned to the bottom" is only observable as
    // the auto top margin on the block that holds the Settings link — checked
    // together with the DOM-order assertion above, never on its own.
    expect(settingsBlock).toHaveClass('mt-auto')
  })

  it('renders no switcher on a fullscreen page, where there is no sidebar', async () => {
    // Given a desktop screen on a detail page, which is full-screen on every
    // screen (the Sidebar returns null there)
    mockScreen({ desktop: true })
    renderSidebar('/settings/household/vendors/v1')
    await screen.findByText('route rendered')

    // Then neither the sidebar nor a switcher is rendered
    await waitFor(() => {
      expect(
        screen.queryByRole('navigation', { name: 'Sidebar navigation' }),
      ).not.toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: /switch location/i }),
    ).not.toBeInTheDocument()
  })

  it('user sees the sidebar on a household list page on desktop', async () => {
    // Given a desktop screen
    mockScreen({ desktop: true })

    // When the user opens the vendors list
    renderSidebar('/settings/household/vendors')

    // Then the sidebar is there, with its links
    const nav = await screen.findByRole('navigation', {
      name: 'Sidebar navigation',
    })
    expect(within(nav).getByRole('link', { name: /settings/i })).toBeVisible()
  })

  it('keeps a household list page full-screen on mobile', async () => {
    // Given a mobile screen on the vendors list
    mockScreen({ desktop: false })
    renderSidebar('/settings/household/vendors')

    // Then, once the route has rendered, no sidebar is there
    await screen.findByText('route rendered')
    expect(
      screen.queryByRole('navigation', { name: 'Sidebar navigation' }),
    ).not.toBeInTheDocument()
  })
})
