import type { Resolvers } from '../generated/graphql.js'
import { familyGroupResolvers } from './familyGroup.resolver.js'
import { importResolvers } from './import.resolver.js'
import { itemResolvers } from './item.resolver.js'

export const resolvers: Resolvers = {
  Query: {
    health: () => 'ok',
    ...itemResolvers.Query,
    ...familyGroupResolvers.Query,
  },
  Mutation: {
    ...itemResolvers.Mutation,
    ...familyGroupResolvers.Mutation,
    ...importResolvers.Mutation,
  },
  Item: itemResolvers.Item,
  FamilyGroup: familyGroupResolvers.FamilyGroup,
}
