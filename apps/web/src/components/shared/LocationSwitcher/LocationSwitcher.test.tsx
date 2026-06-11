import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  ACTIVE_LOCATION_STORAGE_KEY,
  ActiveLocationProvider,
} from '@/hooks/useActiveLocation'
import { noopApolloClient } from '@/test/apolloStub'
import { DEFAULT_LOCATION_ID } from '@/types'
import { LocationSwitcher } from './LocationSwitcher'

const now = new Date()

async function seedLocations() {
  await db.locations.clear()
  await db.locations.put({
    id: DEFAULT_LOCATION_ID,
    name: 'My Home',
    order: 0,
    createdAt: now,
    updatedAt: now,
  })
  await db.locations.put({
    id: 'loc-office',
    name: 'Office',
    order: 1,
    createdAt: now,
    updatedAt: now,
  })
}

function renderSwitcher() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <ActiveLocationProvider>
        <LocationSwitcher />
      </ActiveLocationProvider>
    ),
  })
  const settingsLocationsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings/locations',
    component: () => <div>Locations Settings Page</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, settingsLocationsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
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

describe('LocationSwitcher', () => {
  beforeEach(async () => {
    await seedLocations()
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
  })

  it("trigger shows the active location's first letter", async () => {
    // Given no stored active location (defaults to 'local' → "My Home")
    renderSwitcher()

    // Then the trigger shows the uppercase first letter "M"
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /switch location/i }),
      ).toHaveTextContent('M')
    })
  })

  it('defaults to the local location when nothing is stored', async () => {
    // Given no stored active location
    renderSwitcher()

    // Then the trigger aria-label references the default location name
    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: /switch location \(current: My Home\)/i,
        }),
      ).toBeInTheDocument()
    })
  })

  it('selecting a location updates the trigger and persists to localStorage', async () => {
    // Given the switcher is open
    const user = userEvent.setup()
    renderSwitcher()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /switch location/i }),
      ).toHaveTextContent('M'),
    )
    await user.click(screen.getByRole('button', { name: /switch location/i }))

    // When the user selects "Office"
    await user.click(await screen.findByText('Office'))

    // Then the trigger shows "O" and the choice is persisted
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /switch location/i }),
      ).toHaveTextContent('O')
    })
    expect(localStorage.getItem(ACTIVE_LOCATION_STORAGE_KEY)).toBe('loc-office')
  })

  it('falls back to the default when the stored id no longer exists', async () => {
    // Given a stored active id that does not match any location
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'deleted-location')
    renderSwitcher()

    // Then it falls back to the default and re-persists 'local'
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /switch location/i }),
      ).toHaveTextContent('M')
    })
    await waitFor(() => {
      expect(localStorage.getItem(ACTIVE_LOCATION_STORAGE_KEY)).toBe(
        DEFAULT_LOCATION_ID,
      )
    })
  })

  it('"Manage" navigates to /settings/locations', async () => {
    // Given the switcher is open
    const user = userEvent.setup()
    const router = renderSwitcher()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /switch location/i }),
      ).toHaveTextContent('M'),
    )
    await user.click(screen.getByRole('button', { name: /switch location/i }))

    // When the user clicks "Manage locations"
    await user.click(await screen.findByText(/manage locations/i))

    // Then the router navigates to the locations settings page
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings/locations')
    })
  })
})
