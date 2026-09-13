import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { SetContextLink } from '@apollo/client/link/context'
import { HttpLink } from '@apollo/client/link/http'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { createClient } from 'graphql-ws'
import { DEFAULT_GRAPHQL_HTTP_URL, DEFAULT_GRAPHQL_WS_URL } from './constants'

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
export function createCache() {
  return new InMemoryCache({
    typePolicies: {
      Query: { fields: { itemStocks: { keyArgs: ['locationId'] } } },
    },
  })
}

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
    const token = await getToken()
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
        const token = await getToken()
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
    link: splitLink,
    cache: createCache(),
  })
}
