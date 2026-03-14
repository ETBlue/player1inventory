import type { Resolvers } from '../generated/graphql.js'
import { familyGroupResolvers } from './familyGroup.resolver.js'
import { importResolvers } from './import.resolver.js'
import { itemResolvers } from './item.resolver.js'
import { tagResolvers } from './tag.resolver.js'

export const resolvers: Resolvers = {
  Query: {
    health: () => 'ok',
    ...itemResolvers.Query,
    ...tagResolvers.Query,
    ...familyGroupResolvers.Query,
  },
  Mutation: {
    ...itemResolvers.Mutation,
    ...tagResolvers.Mutation,
    ...familyGroupResolvers.Mutation,
    ...importResolvers.Mutation,
  },
  Item: itemResolvers.Item,
  TagType: tagResolvers.TagType,
  Tag: tagResolvers.Tag,
  FamilyGroup: familyGroupResolvers.FamilyGroup,
}
