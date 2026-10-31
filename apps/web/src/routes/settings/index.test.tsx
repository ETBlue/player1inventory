import { ApolloProvider } from '@apollo/client/react'
import { useUser } from '@clerk/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { mockScreen } from '@/test/viewport'

describe('Settings page (/settings)', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.delete()
    await db.open()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    localStorage.removeItem('data-mode')
    // restoreAllMocks does not undo mockReturnValue on setup.ts's vi.fn, so
    // put back its signed-in user with no name.
    vi.mocked(useUser).mockReturnValue({
      user: {
        id: 'test-user-id',
        primaryEmailAddress: { emailAddress: 'test@example.com' },
      },
      isLoaded: true,
      isSignedIn: true,
    } as unknown as ReturnType<typeof useUser>)
  })

  function renderSettings() {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/settings'] }),
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

  describe('on desktop', () => {
    it('user lands on the household config page', async () => {
      // Given a desktop screen
      mockScreen({ desktop: true })

      // When the user opens /settings
      const router = renderSettings()

      // Then the router moves to /settings/household
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/settings/household')
      })
      expect(
        await screen.findByRole('heading', { level: 1, name: 'My data' }),
      ).toBeInTheDocument()
    })
  })

  describe('on mobile', () => {
    it('user stays on /settings and sees the two accordion items', async () => {
      // Given a mobile screen
      mockScreen({ desktop: false })

      // When the user opens /settings
      const router = renderSettings()

      // Then the page shows the two accordion triggers
      const household = await screen.findByRole('button', { name: /My data/ })
      // Scoped to <main>: the full route tree also mounts the desktop
      // sidebar, whose 👤 button has the same name (jsdom loads no CSS, so
      // its `hidden lg:flex` hides nothing here).
      const user = within(screen.getByRole('main')).getByRole('button', {
        name: /Preferences/,
      })

      // And the household item is open, the user item is closed
      expect(household).toHaveAttribute('aria-expanded', 'true')
      expect(user).toHaveAttribute('aria-expanded', 'false')

      // And the page did not move away
      expect(router.state.location.pathname).toBe('/settings')
    })

    it('user sees six household links pointing at the household pages', async () => {
      // Given a mobile screen
      mockScreen({ desktop: false })

      // When the user opens /settings
      renderSettings()

      // Then the open household item holds six links, in this order
      const household = await screen.findByRole('button', { name: /My data/ })
      const regionId = household.getAttribute('aria-controls')
      expect(regionId).toBeTruthy()
      const region = document.getElementById(regionId ?? '')
      expect(region).not.toBeNull()
      const links = within(region as HTMLElement).getAllByRole('link')
      expect(
        links.map((link) => [
          link.textContent?.match(
            /^(General|Locations|Shelves|Vendors|Recipes|Tags)/,
          )?.[0],
          link.getAttribute('href'),
        ]),
      ).toEqual([
        ['General', '/settings/household'],
        ['Locations', '/settings/household/locations'],
        ['Shelves', '/settings/household/shelves'],
        ['Vendors', '/settings/household/vendors'],
        ['Recipes', '/settings/household/recipes'],
        ['Tags', '/settings/household/tags'],
      ])
    })

    it('user can open the preferences item to see theme, language and data mode', async () => {
      // Given a mobile screen with /settings open
      mockScreen({ desktop: false })
      renderSettings()
      const user = userEvent.setup()
      const trigger = await within(await screen.findByRole('main')).findByRole(
        'button',
        { name: /Preferences/ },
      )

      // The preference cards are not shown while the item is closed
      expect(screen.getByText('Locations')).toBeInTheDocument()
      expect(screen.queryByText('Theme')).not.toBeInTheDocument()

      // When the user opens the item
      await user.click(trigger)

      // Then the theme, language and data mode cards are shown
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('Theme')).toBeInTheDocument()
      expect(screen.getByText('Language')).toBeInTheDocument()
      expect(screen.getByText('Offline Mode')).toBeInTheDocument()

      // And no account details, which are cloud only
      expect(screen.queryByText('Account')).not.toBeInTheDocument()
    })

    it('user in cloud mode sees their name on the preferences item, and their account inside it', async () => {
      // Given a mobile screen in cloud mode, signed in as Ada
      mockScreen({ desktop: false })
      localStorage.setItem('data-mode', 'cloud')
      vi.stubEnv('VITE_E2E_TEST_USER_ID', '')
      vi.mocked(useUser).mockReturnValue({
        user: {
          id: 'user_ada',
          fullName: 'Ada Lovelace',
          primaryEmailAddress: { emailAddress: 'ada@example.com' },
          lastSignInAt: new Date(2026, 9, 30),
          createdAt: new Date(2025, 0, 15),
        },
        isLoaded: true,
        isSignedIn: true,
      } as unknown as ReturnType<typeof useUser>)
      renderSettings()
      const user = userEvent.setup()

      // When the user opens the item, which carries their name
      const main = await screen.findByRole('main')
      const trigger = await within(main).findByRole('button', {
        name: /Ada Lovelace/,
      })
      expect(
        within(main).queryByRole('button', { name: /Preferences/ }),
      ).not.toBeInTheDocument()
      await user.click(trigger)

      // Then the account card and the preference cards are inside it
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('ada@example.com')).toBeInTheDocument()
      expect(screen.getByText('Oct 30, 2026')).toBeInTheDocument()
      expect(screen.getByText('Jan 15, 2025')).toBeInTheDocument()
      expect(screen.getByText('Theme')).toBeInTheDocument()
      expect(screen.getByText('Cloud Mode')).toBeInTheDocument()
    })
  })
})
