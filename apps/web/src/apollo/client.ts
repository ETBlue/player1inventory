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

// E2E test client: sends a static x-e2e-user-id header instead of a Clerk JWT.
// Used by main.tsx when VITE_E2E_TEST_USER_ID is set (never in production).
export function createApolloClientForE2E(userId: string) {
  const e2eLink = new SetContextLink(({ headers }) => ({
    headers: { ...headers, 'x-e2e-user-id': userId },
  }))
  return new ApolloClient({
    link: e2eLink.concat(httpLink),
    cache: new InMemoryCache(),
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
    cache: new InMemoryCache(),
  })
}
