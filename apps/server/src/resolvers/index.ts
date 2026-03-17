import type { Resolvers } from '../generated/graphql.js'
import { familyGroupResolvers } from './familyGroup.resolver.js'
import { importResolvers } from './import.resolver.js'
import { itemResolvers } from './item.resolver.js'
import { recipeResolvers } from './recipe.resolver.js'
import { tagResolvers } from './tag.resolver.js'
import { vendorResolvers } from './vendor.resolver.js'

export const resolvers: Resolvers = {
  Query: {
    health: () => 'ok',
    ...itemResolvers.Query,
    ...tagResolvers.Query,
    ...vendorResolvers.Query,
    ...recipeResolvers.Query,
    ...familyGroupResolvers.Query,
  },
  Mutation: {
    ...itemResolvers.Mutation,
    ...tagResolvers.Mutation,
    ...vendorResolvers.Mutation,
    ...recipeResolvers.Mutation,
    ...familyGroupResolvers.Mutation,
    ...importResolvers.Mutation,
  },
  Item: itemResolvers.Item,
  TagType: tagResolvers.TagType,
  Tag: tagResolvers.Tag,
  Vendor: vendorResolvers.Vendor,
  Recipe: recipeResolvers.Recipe,
  FamilyGroup: familyGroupResolvers.FamilyGroup,
}
