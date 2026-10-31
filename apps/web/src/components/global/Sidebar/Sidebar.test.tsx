import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from '@/hooks/useActiveLocation'
import { saveNavigationHistory } from '@/lib/sessionStorage'
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
  return router
}

// The six household links, in order, as [label, href].
const HOUSEHOLD_LINKS = [
  ['General', '/settings/household'],
  ['Locations', '/settings/household/locations'],
  ['Shelves', '/settings/household/shelves'],
  ['Vendors', '/settings/household/vendors'],
  ['Recipes', '/settings/household/recipes'],
  ['Tags', '/settings/household/tags'],
]

async function findSidebar() {
  return screen.findByRole('navigation', { name: 'Sidebar navigation' })
}

// Every link label in the sidebar, with whether it is marked active. Read
// from both channels: `aria-current` and the active background class.
function linkStates(nav: HTMLElement) {
  return within(nav)
    .getAllByRole('link')
    .map((link) => ({
      label: link.textContent?.trim(),
      ariaCurrent: link.getAttribute('aria-current'),
      styledActive: link.classList.contains('bg-background-elevated'),
    }))
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
    sessionStorage.clear()
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

  it('user sees My data pinned to the bottom, below the location-aware links', async () => {
    // Given a desktop screen on the pantry
    mockScreen({ desktop: true })
    renderSidebar('/')
    const nav = await findSidebar()

    // When the nav links are read in DOM order
    const links = within(nav).getAllByRole('link')
    const labels = links.map((link) => link.textContent?.trim())

    // Then the three location-aware links come first and My data is last.
    // There is no Settings link any more. DOM order is asserted rather than
    // the pinning class alone, so a link that is visually last but not last
    // in the tree still fails.
    expect(labels).toEqual(['Pantry', 'Shopping', 'Cooking', 'My data'])

    // And My data goes to the household config page
    const myDataLink = elementAt(links, links.length - 1)
    expect(myDataLink).toHaveAttribute('href', '/settings/household')

    // And it lives in its own block, separated from the three location-aware
    // links and pushed to the bottom of the flex column.
    const pantryLink = elementAt(links, 0)
    const bottomBlock = myDataLink.parentElement
    expect(bottomBlock).not.toBe(pantryLink.parentElement)
    // jsdom applies no layout, so "pinned to the bottom" is only observable as
    // the auto top margin on the block — checked together with the DOM-order
    // assertion above, never on its own.
    expect(bottomBlock).toHaveClass('mt-auto')
  })

  it('user sees Back, My data and the six household links on a household list page', async () => {
    // Given a desktop screen on the tags list
    mockScreen({ desktop: true })
    renderSidebar('/settings/household/tags')
    const nav = await findSidebar()

    // Then the household view replaces the main view: exactly the six
    // household links, in order, with their hrefs. Reading every link (not
    // looking up six by name) means a leftover Pantry or My data link also
    // fails, and it fails on the list of values rather than on a lookup.
    const links = within(nav)
      .getAllByRole('link')
      .map((link) => [link.textContent?.trim(), link.getAttribute('href')])
    expect(links).toEqual(HOUSEHOLD_LINKS)

    // And Back comes before the heading
    const back = within(nav).getByRole('button', { name: 'Back' })
    const heading = within(nav).getByRole('heading', { name: 'My data' })
    expect(
      back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    // And the location switcher belongs to the main view only
    expect(
      within(nav).queryByRole('button', { name: /switch location/i }),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['/settings/household/tags', 'Tags'],
    ['/settings/household/tags/', 'Tags'],
    ['/settings/household/locations', 'Locations'],
    ['/settings/household', 'General'],
    ['/settings/household/', 'General'],
  ])('at %s only %s is marked active', async (path, activeLabel) => {
    // Given a desktop screen on a household page
    mockScreen({ desktop: true })
    renderSidebar(path)
    const nav = await findSidebar()

    // Then exactly one link is active, in both aria-current and styling
    expect(linkStates(nav)).toEqual(
      HOUSEHOLD_LINKS.map(([label]) => ({
        label,
        ariaCurrent: label === activeLabel ? 'page' : null,
        styledActive: label === activeLabel,
      })),
    )
  })

  it('user goes Back to the last pantry page, with its search string', async () => {
    // Given the user came to settings from the pantry grouped by vendor
    saveNavigationHistory([
      '/?groupBy=vendor',
      '/settings/household',
      '/settings/household/tags',
    ])
    mockScreen({ desktop: true })
    const router = renderSidebar('/settings/household/tags')
    const nav = await findSidebar()

    // When the user presses Back
    await userEvent.click(within(nav).getByRole('button', { name: 'Back' }))

    // Then they are on the pantry, grouped by vendor again
    await waitFor(() => {
      expect(router.state.location.href).toBe('/?groupBy=vendor')
    })
  })

  it('user goes Back to the pantry when the history holds only settings pages', async () => {
    // Given a history with no Pantry, Shopping or Cooking page in it
    saveNavigationHistory(['/settings/household', '/settings/household/tags'])
    mockScreen({ desktop: true })
    const router = renderSidebar('/settings/household/tags')
    const nav = await findSidebar()

    // When the user presses Back
    await userEvent.click(within(nav).getByRole('button', { name: 'Back' }))

    // Then they land on the pantry
    await waitFor(() => {
      expect(router.state.location.href).toBe('/')
    })
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
    const nav = await findSidebar()
    expect(within(nav).getByRole('link', { name: 'Vendors' })).toBeVisible()
  })

  it('renders no sidebar on a household detail page on desktop', async () => {
    // Given a desktop screen on a tag's detail page
    mockScreen({ desktop: true })
    renderSidebar('/settings/household/tags/t1')

    // Then, once the route has rendered, no sidebar is there
    await screen.findByText('route rendered')
    expect(
      screen.queryByRole('navigation', { name: 'Sidebar navigation' }),
    ).not.toBeInTheDocument()
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
