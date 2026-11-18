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

// Clerk's `<SignIn>` is replaced by a stub that shows the two redirect props
// it was given, so the test can read them.
const authState = vi.hoisted(() => ({ isSignedIn: false }))
vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn }),
  useUser: () => ({ user: null, isLoaded: true, isSignedIn: false }),
  useClerk: () => ({ signOut: vi.fn() }),
  SignIn: (props: {
    forceRedirectUrl?: string | null
    signUpForceRedirectUrl?: string | null
  }) => (
    <div data-testid="clerk-sign-in">
      <span data-testid="sign-in-target">{props.forceRedirectUrl}</span>
      <span data-testid="sign-up-target">{props.signUpForceRedirectUrl}</span>
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
  it('user who signs in or signs up from an invite link goes back to it', async () => {
    // Given a signed-out person sent to sign-in from the join page
    renderAt('/sign-in?redirect=%2Fjoin%2Fabc%3Fx%3D1')

    // Then Clerk is told to return to the join page after a sign-in AND
    // after a sign-up (a brand-new person signs up)
    expect(await screen.findByTestId('sign-in-target')).toHaveTextContent(
      '/join/abc?x=1',
    )
    expect(screen.getByTestId('sign-up-target')).toHaveTextContent(
      '/join/abc?x=1',
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
