import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

// Clerk's `<SignUp>` is replaced by a stub that shows the props it was
// given, so the test can read them.
// docs/global/bugs/2026-11-23-bug-join-redirect-lost-on-sign-up.md
const authState = vi.hoisted(() => ({ isSignedIn: false }))
vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn }),
  useUser: () => ({ user: null, isLoaded: true, isSignedIn: false }),
  useClerk: () => ({ signOut: vi.fn() }),
  SignUp: (props: {
    forceRedirectUrl?: string | null
    signInForceRedirectUrl?: string | null
    signInUrl?: string
    routing?: string
  }) => (
    <div data-testid="clerk-sign-up">
      <span data-testid="sign-up-target">{props.forceRedirectUrl}</span>
      <span data-testid="sign-in-target">{props.signInForceRedirectUrl}</span>
      <span data-testid="sign-in-link">{props.signInUrl}</span>
      <span data-testid="routing">{props.routing}</span>
    </div>
  ),
}))

function renderAt(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
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

afterEach(() => {
  authState.isSignedIn = false
})

describe('sign-up return path', () => {
  it('user who signs up from an invite link goes back to it', async () => {
    // Given a brand-new person who chose "Sign up" on the sign-in page of an
    // invite link
    renderAt('/sign-up?redirect=%2Fjoin%2Fabc%3Fx%3D1')

    // Then Clerk is told to return to the join page after the sign-up, and
    // also after a sign-in (the person may find they already have an account)
    expect(await screen.findByTestId('sign-up-target')).toHaveTextContent(
      '/join/abc?x=1',
    )
    expect(screen.getByTestId('sign-in-target')).toHaveTextContent(
      '/join/abc?x=1',
    )
  })

  it('user who chooses Sign in instead keeps the return path', async () => {
    // Given the sign-up page of an invite link
    renderAt('/sign-up?redirect=%2Fjoin%2Fabc')

    // Then Clerk's "Sign in" link goes back to our sign-in page with the
    // same return path
    expect(await screen.findByTestId('sign-in-link')).toHaveTextContent(
      /^\/sign-in\?redirect=%2Fjoin%2Fabc$/,
    )
  })

  it('keeps every step of the sign-up on this page', async () => {
    // Given the sign-up page
    renderAt('/sign-up?redirect=%2Fjoin%2Fabc')

    // Then Clerk moves between its steps (the e-mail code) in the URL hash,
    // so the path and the `redirect` value stay in the address bar
    expect(await screen.findByTestId('routing')).toHaveTextContent(/^hash$/)
  })

  it('user is sent to the pantry when the return path points to another site', async () => {
    // Given a link that tries to send the person elsewhere after sign-up
    renderAt('/sign-up?redirect=%2F%2Fevil.example')

    // Then Clerk is told to go to `/` instead, and the "Sign in" link carries
    // no return path
    expect(await screen.findByTestId('sign-up-target')).toHaveTextContent(
      /^\/$/,
    )
    expect(screen.getByTestId('sign-in-target')).toHaveTextContent(/^\/$/)
    expect(screen.getByTestId('sign-in-link')).toHaveTextContent(/^\/sign-in$/)
  })

  it('user with no return path gets a plain sign-in link', async () => {
    // Given the sign-up page opened on its own
    renderAt('/sign-up')

    // Then both targets are the pantry and the link has no return path
    expect(await screen.findByTestId('sign-up-target')).toHaveTextContent(
      /^\/$/,
    )
    expect(screen.getByTestId('sign-in-link')).toHaveTextContent(/^\/sign-in$/)
  })

  it('user who is already signed in goes straight to the return path', async () => {
    // Given a signed-in person on the sign-up page with a return path
    authState.isSignedIn = true

    // When the page renders
    const router = renderAt('/sign-up?redirect=%2Fjoin%2Fabc')

    // Then they are sent to the join page
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/join/abc'),
    )
  })

  it('user who is already signed in goes to the pantry when the return path is not on this site', async () => {
    // Given a signed-in person and a return path to another site
    authState.isSignedIn = true

    // When the page renders
    const router = renderAt('/sign-up?redirect=https%3A%2F%2Fevil.example')

    // Then they go to `/`
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(router.state.location.href).not.toContain('evil')
  })
})
