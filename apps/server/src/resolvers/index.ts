import type { Resolvers } from '../generated/graphql.js'
import { cartResolvers } from './cart.resolver.js'
import { importResolvers } from './import.resolver.js'
import { inventoryLogResolvers, JSONScalar } from './inventoryLog.resolver.js'
import { itemResolvers } from './item.resolver.js'
import { locationResolvers } from './location.resolver.js'
import { purgeResolvers } from './purge.resolver.js'
import { recipeResolvers } from './recipe.resolver.js'
import { tagResolvers } from './tag.resolver.js'
import { vendorResolvers } from './vendor.resolver.js'
import { shelfResolvers } from './shelf.resolver.js'

const resolversObject: Resolvers = {
  Query: {
    health: () => 'ok',
    ...itemResolvers.Query,
    ...tagResolvers.Query,
    ...vendorResolvers.Query,
    ...recipeResolvers.Query,
    ...cartResolvers.Query,
    ...inventoryLogResolvers.Query,
    ...shelfResolvers.Query,
    ...locationResolvers.Query,
  },
  Mutation: {
    ...itemResolvers.Mutation,
    ...tagResolvers.Mutation,
    ...vendorResolvers.Mutation,
    ...recipeResolvers.Mutation,
    ...importResolvers.Mutation,
    ...cartResolvers.Mutation,
    ...inventoryLogResolvers.Mutation,
    ...purgeResolvers.Mutation,
    ...shelfResolvers.Mutation,
    ...locationResolvers.Mutation,
  },
  Recipe: recipeResolvers.Recipe,
  InventoryLog: inventoryLogResolvers.InventoryLog,
  Cart: cartResolvers.Cart,
}

export const resolvers = {
  ...(resolversObject as Resolvers),
  JSON: JSONScalar,
}
