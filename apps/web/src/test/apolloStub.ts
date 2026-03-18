import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'

// No-op Apollo client for local mode — satisfies Apollo context requirement
// for hooks called with skip:true inside routes rendered in Storybook.
// Tests don't need this because setup.ts mocks all generated Apollo hooks via vi.mock.
export const noopApolloClient = new ApolloClient({
  link: new ApolloLink(() => null),
  cache: new InMemoryCache(),
})
