import {
  ApolloClient,
  createHttpLink,
  InMemoryCache,
  split,
} from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { createClient } from 'graphql-ws'

const httpLink = createHttpLink({
  uri: import.meta.env.VITE_GRAPHQL_HTTP_URL ?? 'http://localhost:4000/graphql',
})

export function createApolloClient(getToken: () => Promise<string | null>) {
  const authLink = setContext(async (_, { headers }) => {
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
      url: import.meta.env.VITE_GRAPHQL_WS_URL ?? 'ws://localhost:4000/graphql',
      connectionParams: async () => {
        const token = await getToken()
        return token ? { authorization: `Bearer ${token}` } : {}
      },
    }),
  )

  const splitLink = split(
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
