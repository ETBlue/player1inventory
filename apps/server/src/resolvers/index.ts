import type { Resolvers } from '../generated/graphql.js'
import { itemResolvers } from './item.resolver.js'

export const resolvers: Resolvers = {
  Query: {
    health: () => 'ok',
    ...itemResolvers.Query,
  },
  Mutation: {
    ...itemResolvers.Mutation,
  },
  Item: itemResolvers.Item,
}
