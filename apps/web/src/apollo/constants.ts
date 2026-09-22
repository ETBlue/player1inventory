export const DEFAULT_GRAPHQL_HTTP_URL = 'http://localhost:4000/graphql'
export const DEFAULT_GRAPHQL_WS_URL = 'ws://localhost:4000/graphql'

// Marker for "do not refetch this query when the app comes back to the front".
//
// Pass it as a query's `context`. `ApolloWrapper`'s resume refetch reads it in
// `onQueryUpdated` and skips those queries. The key lives here, not in
// `ApolloWrapper.tsx`, so the hook that sets it does not have to import a React
// component that pulls in Clerk and the Apollo client.
//
// The object is module-level so its identity is stable across renders.
export const SKIP_RESUME_REFETCH_KEY = 'skipResumeRefetch'
export const SKIP_RESUME_REFETCH_CONTEXT = { [SKIP_RESUME_REFETCH_KEY]: true }
