import type { Resolvers } from '../generated/graphql.js'
import { cartResolvers } from './cart.resolver.js'
import { familyGroupResolvers } from './familyGroup.resolver.js'
import { importResolvers } from './import.resolver.js'
import { inventoryLogResolvers } from './inventoryLog.resolver.js'
import { itemResolvers } from './item.resolver.js'
import { purgeResolvers } from './purge.resolver.js'
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
    ...cartResolvers.Query,
    ...inventoryLogResolvers.Query,
  },
  Mutation: {
    ...itemResolvers.Mutation,
    ...tagResolvers.Mutation,
    ...vendorResolvers.Mutation,
    ...recipeResolvers.Mutation,
    ...familyGroupResolvers.Mutation,
    ...importResolvers.Mutation,
    ...cartResolvers.Mutation,
    ...inventoryLogResolvers.Mutation,
    ...purgeResolvers.Mutation,
  },
  Recipe: recipeResolvers.Recipe,
  FamilyGroup: familyGroupResolvers.FamilyGroup,
  Cart: cartResolvers.Cart,
  CartItem: cartResolvers.CartItem,
  InventoryLog: inventoryLogResolvers.InventoryLog,
}
