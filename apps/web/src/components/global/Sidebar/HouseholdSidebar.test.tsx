import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { saveNavigationHistory } from '@/lib/sessionStorage'
import { HouseholdSidebar } from './HouseholdSidebar'

// HouseholdSidebar on its own, at any screen size. Which view the sidebar
// shows, and on which screens, is tested in Sidebar.test.tsx.
function renderHouseholdSidebar(path: string) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <nav aria-label="Sidebar navigation">
          <HouseholdSidebar />
        </nav>
      ),
    }),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  // `usePermissions` (the Activity item) reads the location list through
  // TanStack Query in local mode.
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('HouseholdSidebar', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('puts Back first, then the heading, then the links', async () => {
    // Given the household view
    renderHouseholdSidebar('/settings/household/shelves')
    const nav = await screen.findByRole('navigation')

    // Then Back comes before the heading, and the heading before every link
    const back = within(nav).getByRole('button', { name: 'Back' })
    const heading = within(nav).getByRole('heading', { name: 'My data' })
    const firstLink = within(nav).getByRole('link', { name: 'General' })
    expect(
      back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      heading.compareDocumentPosition(firstLink) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('user sees Back as an icon in the same row as the heading', async () => {
    // Given the household view
    renderHouseholdSidebar('/settings/household')
    const nav = await screen.findByRole('navigation')

    // Then Back keeps its accessible name, but shows no text, only its icon
    const back = within(nav).getByRole('button', { name: 'Back' })
    expect(back).toHaveAttribute('aria-label', 'Back')
    expect(back).toHaveTextContent(/^$/)
    expect(back.querySelector('svg')).not.toBeNull()

    // And Back and the heading share one flex row
    const heading = within(nav).getByRole('heading', { name: 'My data' })
    const row = back.parentElement
    expect(row).toBe(heading.parentElement)
    expect(row).toHaveClass('flex')
  })

  it('user goes Back to the last shopping cart, skipping newer non-app pages', async () => {
    // Given the user opened a cart, then an item, then settings
    saveNavigationHistory([
      '/cooking',
      '/shopping/v1?q=milk',
      '/items/i1',
      '/settings/household/shelves',
    ])
    const router = renderHouseholdSidebar('/settings/household/shelves')

    // When the user presses Back
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))

    // Then they are on that cart again, with its search string
    await waitFor(() => {
      expect(router.state.location.href).toBe('/shopping/v1?q=milk')
    })
  })

  // Households H5b task G.9: Members is second, and cloud only (design,
  // *Local mode*: the household sidebar hides Members).
  describe('the Members item', () => {
    function linkHrefs() {
      return within(screen.getByRole('navigation'))
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
    }

    it('user in cloud mode sees Members second', async () => {
      localStorage.setItem('data-mode', 'cloud')
      try {
        renderHouseholdSidebar('/settings/household')
        await screen.findByRole('link', { name: 'Members' })
        expect(linkHrefs()).toEqual([
          '/settings/household',
          '/settings/household/members',
          '/settings/household/locations',
          '/settings/household/shelves',
          '/settings/household/vendors',
          '/settings/household/recipes',
          '/settings/household/tags',
        ])
      } finally {
        localStorage.removeItem('data-mode')
      }
    })

    it('user in local mode does not see Members', async () => {
      localStorage.setItem('data-mode', 'local')
      try {
        renderHouseholdSidebar('/settings/household')
        // Present first: the list has rendered
        await screen.findByRole('link', { name: 'General' })
        expect(screen.queryByRole('link', { name: 'Members' })).toBeNull()
        expect(linkHrefs()).toHaveLength(6)
      } finally {
        localStorage.removeItem('data-mode')
      }
    })
  })
})
