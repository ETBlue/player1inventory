import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { SetContextLink } from '@apollo/client/link/context'
import { HttpLink } from '@apollo/client/link/http'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { createClient } from 'graphql-ws'
import { isOffline } from '@/hooks/useIsOffline'
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

// One cache configuration, shared by the production client and the E2E client, so
// cloud E2E exercises the same cache semantics production does. A policy added to
// only one of the two would make E2E prove nothing about the real client.
//
// `itemStocks(locationId:)` is keyed by location: two locations' stock lists are
// separate cache entries, so switching locations cannot serve the previous
// location's rows. Verified in `client.test.ts` against the exported factory.
//
// Measured caveat, so nobody mistakes this line for the thing holding the
// invariant up: Apollo already puts every argument of a root field into its store
// key, so with `locationId` as the field's only argument this `keyArgs` matches
// the default and removing it changes no behaviour (the cache test stays green
// without it). It is kept as an explicit statement of the location dimension —
// and it is load-bearing the moment `itemStocks` gains a second argument, at
// which point this list must be extended or the two calls collapse into one
// entry. The behaviour itself is guarded by `client.test.ts`, not by this line.
//
// The three inventory-log root fields are keyed the same way (PR 3a). Their
// `locationId` is one of SEVERAL arguments, so unlike `itemStocks` these lists
// are not a restatement of the default — drop `'locationId'` from one and the
// two locations collapse into a single cache entry, which serves another
// location's logs after a switch. `inventoryLogs` is absent on purpose: it
// takes no arguments and is whole-account.
//
// `vendorCart` joins them in PR 3b, and it has the same shape as `itemLogs`:
// two arguments, so dropping `'locationId'` keys every location's cart for one
// vendor into a single entry and the shopping page serves the Kitchen's cart
// while the user is looking at the Garage. Guarded by `client.test.ts`.
// `allCarts` and `allCartItems` are absent on purpose — no arguments,
// whole-account; `cartItems(cartId:)` too, because a cart id already names its
// location (`${locationId}:${vendorId | 'no-vendor'}`).
export function createCache() {
  return new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          itemStocks: { keyArgs: ['locationId'] },
          itemLogs: { keyArgs: ['itemId', 'locationId'] },
          inventoryLogCountByItem: { keyArgs: ['itemId', 'locationId'] },
          lastPurchaseDates: { keyArgs: ['itemIds', 'locationId'] },
          vendorCart: { keyArgs: ['vendorId', 'locationId'] },
        },
      },
    },
  })
}

/**
 * One cache instance for cloud mode, created before the client.
 *
 * Persistence needs to fill this in BEFORE Apollo mounts. If the first
 * queries run first, they write empty results and destroy the stored copy.
 */
export const cloudCache = createCache()

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
