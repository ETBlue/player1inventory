import { ApolloClient, ApolloLink } from '@apollo/client'
import { SetContextLink } from '@apollo/client/link/context'
import { HttpLink } from '@apollo/client/link/http'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { createClient } from 'graphql-ws'
import { isOffline } from '@/hooks/useIsOffline'
import i18n from '@/i18n'
import { CLIENT_ID } from './clientId'
import { cloudCache, createCache } from './cloudCache'
import { DEFAULT_GRAPHQL_HTTP_URL, DEFAULT_GRAPHQL_WS_URL } from './constants'
import { registerLiveSocket } from './liveSocket'
import { offlineWriteLink } from './offlineWriteLink'
import { createStaleReadRetryLink } from './staleReadRetryLink'

// `createCache` moved to `./cloudCache` so `persistence.ts` can reset the cache
// without importing this file. There is no import cycle between the two —
// `client.ts` does not import `persistence.ts`. The real reason is that
// importing `client.ts` runs its module-level side effects: `new HttpLink`
// below, plus `graphql-ws`. `persistence.ts` only needs the cache object, and
// is used from sign-out cleanup and from tests, so it should not drag the
// network layer in. It is re-exported here because callers outside this folder
// import it from `@/apollo/client`, which is where it used to live.
export { createCache } from './cloudCache'

/**
 * How long to wait for Clerk before giving up, in milliseconds.
 *
 * This is deliberately generous. The timeout exists for one case: Clerk's
 * script never loaded, so `getToken()` never settles. It is NOT meant to fire
 * on a slow but working connection.
 *
 * Clerk session tokens are short-lived, so `getToken()` hits the network to
 * refresh them from time to time. On a bad mobile connection that refresh can
 * take several seconds. If this value were low, a signed-in user who is ONLINE
 * would get an unauthenticated request and a failed load. A user staring at a
 * spinner for a few extra seconds is a much smaller problem than a user who is
 * signed in being told they are not.
 */
const TOKEN_TIMEOUT_MS = 10_000

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

/**
 * Sends the app's current language with every GraphQL request, in the
 * `x-app-language` header (households H3a, decision H3).
 *
 * The server uses it on a person's first request to name their new household
 * and its first location in that language. It accepts only `en` and `tw`, and
 * reads anything else as `en`.
 *
 * The language is read when each request is sent, not when the client is
 * built, so a language change in Settings applies to the next request.
 */
function currentLanguage(): string | undefined {
  return i18n.resolvedLanguage ?? i18n.language ?? undefined
}

const languageLink = new SetContextLink(({ headers }) => {
  const language = currentLanguage()
  return {
    headers: {
      ...headers,
      ...(language ? { 'x-app-language': language } : {}),
    },
  }
})

/**
 * Sends this tab's id (`clientId.ts`) with every HTTP request, in the
 * `x-client-id` header (households H3c-1, decision P4). The server then does
 * not send this tab's own changes back to it over the live-updates socket.
 */
const clientIdLink = new SetContextLink(({ headers }) => ({
  headers: { ...headers, 'x-client-id': CLIENT_ID },
}))

/**
 * The live-updates socket (households H3c-1). Same URL and path as HTTP.
 *
 * `connectionParams` runs again for every new socket, including each
 * reconnect, so a reconnect after the server's 60-minute age limit sends a
 * fresh token. The server refuses a socket with no `clientId` (close code
 * 4401, which the client never retries).
 *
 * `lazy` is left at its default, `true`: the socket opens with the first
 * subscription and closes as soon as the last one ends. That is what closes
 * the socket on sign-out: `LiveUpdatesRunner` unsubscribes when the user id goes
 * away. `dispose()` is NOT used for that, because a disposed client never
 * retries again, and React's StrictMode runs every effect cleanup once on
 * mount, which would leave the socket without retries for the whole session.
 */
function createLiveSocket(identity: () => Promise<Record<string, string>>) {
  return createClient({
    url: import.meta.env.VITE_GRAPHQL_WS_URL ?? DEFAULT_GRAPHQL_WS_URL,
    connectionParams: async () => {
      const language = currentLanguage()
      return {
        ...(await identity()),
        clientId: CLIENT_ID,
        ...(language ? { language } : {}),
      }
    },
  })
}

/** Subscriptions go to the socket, everything else over HTTP. */
function isSubscription({ query }: ApolloLink.Operation) {
  const def = getMainDefinition(query)
  return def.kind === 'OperationDefinition' && def.operation === 'subscription'
}

// E2E test client: sends a static x-e2e-user-id header instead of a Clerk JWT.
// Used by main.tsx when VITE_E2E_TEST_USER_ID is set (never in production).
export function createApolloClientForE2E(userId: string) {
  const e2eLink = new SetContextLink(({ headers }) => ({
    headers: { ...headers, 'x-e2e-user-id': userId },
  }))
  // The server reads `e2eUserId` only when it runs in E2E mode.
  const socket = createLiveSocket(async () => ({ e2eUserId: userId }))
  const splitLink = ApolloLink.split(
    isSubscription,
    new GraphQLWsLink(socket),
    languageLink.concat(clientIdLink).concat(e2eLink).concat(httpLink),
  )
  const client = new ApolloClient({
    // The same stale-read guard, language header, tab id and socket as the
    // production client, so cloud E2E runs the code users run.
    link: createStaleReadRetryLink().concat(splitLink),
    cache: createCache(),
  })
  registerLiveSocket(client, socket)
  return client
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

  const socket = createLiveSocket(async () => {
    const token = await resolveToken(getToken)
    return token ? { authorization: `Bearer ${token}` } : {}
  })

  const splitLink = ApolloLink.split(
    isSubscription,
    new GraphQLWsLink(socket),
    languageLink.concat(clientIdLink).concat(authLink).concat(httpLink),
  )

  const client = new ApolloClient({
    // `createStaleReadRetryLink` sits after `offlineWriteLink`, so a mutation
    // refused offline never reaches the server and is not counted. Pinned by
    // "does not make a waiting query send again" in `client.test.ts`.
    link: offlineWriteLink.concat(createStaleReadRetryLink()).concat(splitLink),
    cache: cloudCache,
  })
  registerLiveSocket(client, socket)
  return client
}
