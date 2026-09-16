import { ApolloClient, ApolloLink } from '@apollo/client'
import { SetContextLink } from '@apollo/client/link/context'
import { HttpLink } from '@apollo/client/link/http'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { createClient } from 'graphql-ws'
import { isOffline } from '@/hooks/useIsOffline'
import { cloudCache, createCache } from './cloudCache'
import { DEFAULT_GRAPHQL_HTTP_URL, DEFAULT_GRAPHQL_WS_URL } from './constants'
import { offlineWriteLink } from './offlineWriteLink'

/** How long to wait for Clerk before giving up, in milliseconds. */
const TOKEN_TIMEOUT_MS = 3000

/**
 * Gets an auth token, but never waits forever.
 *
 * Two cases make `getToken()` hang instead of fail:
 * - The device is offline, so Clerk cannot reach its server.
 * - Clerk's script failed to load, so `useAuth()` stays at `isLoaded: false`.
 *   Task 1 confirmed this happens and does not time out on its own.
 *
 * `SetContextLink` awaits this before every request, so a hang here shows the
 * user a loading spinner that never stops. Returning null instead lets the
 * request fail, which the UI can show as an error.
 */
export async function resolveToken(
  getToken: () => Promise<string | null>,
  timeoutMs: number = TOKEN_TIMEOUT_MS,
): Promise<string | null> {
  // Return at once when offline. The timeout below would also return null,
  // but only after waiting. There is nothing to wait for with no connection.
  if (isOffline()) return null

  return Promise.race([
    getToken().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])
}

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_GRAPHQL_HTTP_URL ?? DEFAULT_GRAPHQL_HTTP_URL,
})

// E2E test client: sends a static x-e2e-user-id header instead of a Clerk JWT.
// Used by main.tsx when VITE_E2E_TEST_USER_ID is set (never in production).
export function createApolloClientForE2E(userId: string) {
  const e2eLink = new SetContextLink(({ headers }) => ({
    headers: { ...headers, 'x-e2e-user-id': userId },
  }))
  return new ApolloClient({
    link: e2eLink.concat(httpLink),
    cache: createCache(),
  })
}

export function createApolloClient(getToken: () => Promise<string | null>) {
  const authLink = new SetContextLink(async ({ headers }) => {
    const token = await resolveToken(getToken)
    return {
      headers: {
        ...headers,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }
  })

  const wsLink = new GraphQLWsLink(
    createClient({
      url: import.meta.env.VITE_GRAPHQL_WS_URL ?? DEFAULT_GRAPHQL_WS_URL,
      connectionParams: async () => {
        const token = await resolveToken(getToken)
        return token ? { authorization: `Bearer ${token}` } : {}
      },
    }),
  )

  const splitLink = ApolloLink.split(
    ({ query }) => {
      const def = getMainDefinition(query)
      return (
        def.kind === 'OperationDefinition' && def.operation === 'subscription'
      )
    },
    wsLink,
    authLink.concat(httpLink),
  )

  return new ApolloClient({
    link: offlineWriteLink.concat(splitLink),
    cache: cloudCache,
  })
}
