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

// Clerk's `<SignIn>` is replaced by a stub that shows the redirect props and
// the sign-up link it was given, so the test can read them.
const authState = vi.hoisted(() => ({ isSignedIn: false }))
vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn }),
  useUser: () => ({ user: null, isLoaded: true, isSignedIn: false }),
  useClerk: () => ({ signOut: vi.fn() }),
  SignIn: (props: {
    forceRedirectUrl?: string | null
    signUpForceRedirectUrl?: string | null
    signUpUrl?: string
  }) => (
    <div data-testid="clerk-sign-in">
      <span data-testid="sign-in-target">{props.forceRedirectUrl}</span>
      <span data-testid="sign-up-target">{props.signUpForceRedirectUrl}</span>
      <span data-testid="sign-up-link">{props.signUpUrl}</span>
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

describe('sign-in return path', () => {
  it('user who signs in from an invite link goes back to it', async () => {
    // Given a signed-out person sent to sign-in from the join page
    renderAt('/sign-in?redirect=%2Fjoin%2Fabc%3Fx%3D1')

    // Then Clerk is told to return to the join page after a sign-in. The
    // sign-up prop is also set, but Clerk does not put it on its "Sign up"
    // link (docs/global/bugs/2026-11-23-bug-join-redirect-lost-on-sign-up.md),
    // so it does not prove that a sign-up returns. The next test does.
    expect(await screen.findByTestId('sign-in-target')).toHaveTextContent(
      '/join/abc?x=1',
    )
    expect(screen.getByTestId('sign-up-target')).toHaveTextContent(
      '/join/abc?x=1',
    )
  })

  it('user who chooses Sign up from an invite link keeps the return path', async () => {
    // Given a signed-out person sent to sign-in from the join page
    renderAt('/sign-in?redirect=%2Fjoin%2Fabc')

    // Then Clerk's "Sign up" link goes to OUR sign-up page, with the same
    // return path, not to Clerk's hosted page, which would lose it
    expect(await screen.findByTestId('sign-up-link')).toHaveTextContent(
      /^\/sign-up\?redirect=%2Fjoin%2Fabc$/,
    )
  })

  it.each([
    ['no return path', '/sign-in'],
    ['a return path to another site', '/sign-in?redirect=%2F%2Fevil.example'],
  ])('user with %s gets a plain sign-up link', async (_label, url) => {
    // Given the sign-in page with nothing safe to return to
    renderAt(url)

    // Then the "Sign up" link carries no return path
    expect(await screen.findByTestId('sign-up-link')).toHaveTextContent(
      /^\/sign-up$/,
    )
  })

  it('user is sent to the pantry when the return path points to another site', async () => {
    // Given a link that tries to send the person elsewhere after sign-in
    renderAt('/sign-in?redirect=%2F%2Fevil.example')

    // Then Clerk is told to go to `/` instead
    expect(await screen.findByTestId('sign-in-target')).toHaveTextContent(
      /^\/$/,
    )
    expect(screen.getByTestId('sign-up-target')).toHaveTextContent(/^\/$/)
  })

  it('user who is already signed in goes straight to the return path', async () => {
    // Given a signed-in person on the sign-in page with a return path
    authState.isSignedIn = true

    // When the page renders
    const router = renderAt('/sign-in?redirect=%2Fjoin%2Fabc')

    // Then they are sent to the join page
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/join/abc'),
    )
  })

  it('user who is already signed in goes to the pantry when the return path is not on this site', async () => {
    // Given a signed-in person and a return path to another site
    authState.isSignedIn = true

    // When the page renders
    const router = renderAt('/sign-in?redirect=https%3A%2F%2Fevil.example')

    // Then they go to `/`
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(router.state.location.href).not.toContain('evil')
  })
})
