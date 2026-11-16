import { makeExecutableSchema } from '@graphql-tools/schema'
import type { GraphQLSchema } from 'graphql'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from './index.js'

/**
 * The one executable schema (households H3c-1, decision P2).
 *
 * `index.ts` gives the same object to Apollo (HTTP) and to `graphql-ws`
 * (WebSocket), so a query and a subscription run against the same types and
 * resolvers.
 *
 * Why `makeExecutableSchema` from `@graphql-tools/schema` version 9, and not
 * resolvers attached by hand: it is the exact call Apollo Server 4 made
 * before, when it was given `typeDefs` and `resolvers`
 * (`ApolloServer.constructSchema` in `@apollo/server` 4.13.0). The server
 * now depends on the same version, and pnpm resolves it to the same copy
 * Apollo uses (`@graphql-tools/schema@9.0.19`). So the scalar (`JSON`), the
 * type resolvers (`Recipe`, `InventoryLog`, `Cart`) and the subscription's
 * `subscribe` are attached the same way as before, and nothing has to be
 * copied by hand. Attaching by hand would need its own code for each of
 * those, and a missed one would fail only at run time.
 */
export function createExecutableSchema(): GraphQLSchema {
  return makeExecutableSchema({ typeDefs, resolvers })
}
