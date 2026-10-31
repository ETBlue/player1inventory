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
  render(<RouterProvider router={router} />)
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
})
