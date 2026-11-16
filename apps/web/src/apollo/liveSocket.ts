import type { ApolloClient } from '@apollo/client'
import type { Client } from 'graphql-ws'

/**
 * Which `graphql-ws` client belongs to which Apollo client (households H3c-1).
 *
 * The live-updates runner (`liveUpdates.ts`) needs the socket client itself,
 * not only the Apollo link around it, to hear the `connected` event: a
 * reconnect after the first connect refetches every active query. Apollo has
 * no public way to reach a link's socket, so both factories in `client.ts`
 * record theirs here.
 *
 * A `WeakMap`, so a replaced Apollo client and its socket client can be
 * garbage collected. An Apollo client with no entry (the local-mode client,
 * a test client) simply gets no live updates.
 */
const sockets = new WeakMap<ApolloClient, Client>()

export function registerLiveSocket(client: ApolloClient, socket: Client) {
  sockets.set(client, socket)
}

export function liveSocketOf(client: ApolloClient): Client | undefined {
  return sockets.get(client)
}
