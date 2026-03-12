import { itemResolvers } from './item.resolver.js'

export const resolvers = {
  Query: {
    health: () => 'ok',
    ...itemResolvers.Query,
  },
  Mutation: {
    ...itemResolvers.Mutation,
  },
  Item: itemResolvers.Item,
}
