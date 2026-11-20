import type { Resolvers } from '../generated/graphql.js'
import { cartResolvers } from './cart.resolver.js'
import { importResolvers } from './import.resolver.js'
import { importCheckResolvers } from './importCheck.resolver.js'
import { inventoryLogResolvers, JSONScalar } from './inventoryLog.resolver.js'
import { itemResolvers } from './item.resolver.js'
import { itemStockResolvers } from './itemStock.resolver.js'
import { locationResolvers } from './location.resolver.js'
import { recipeResolvers } from './recipe.resolver.js'
import { tagResolvers } from './tag.resolver.js'
import { vendorResolvers } from './vendor.resolver.js'
import { shelfResolvers } from './shelf.resolver.js'
import { householdResolvers } from './household.resolver.js'
import { inviteResolvers } from './invite.resolver.js'
import { liveResolvers } from './live.resolver.js'
import { activityResolvers } from './activity.resolver.js'
import { ownershipResolvers } from './ownership.resolver.js'
import { forgetRolesAroundEach } from '../lib/mutationRoleCache.js'

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
    ...itemStockResolvers.Query,
    ...householdResolvers.Query,
    ...inviteResolvers.Query,
    ...importCheckResolvers.Query,
    ...activityResolvers.Query,
    ...ownershipResolvers.Query,
  },
  // Every root mutation field forgets the role caches before and after it
  // runs (lib/mutationRoleCache.ts), so no resolver has to remember to.
  Mutation: forgetRolesAroundEach({
    ...itemResolvers.Mutation,
    ...tagResolvers.Mutation,
    ...vendorResolvers.Mutation,
    ...recipeResolvers.Mutation,
    ...importResolvers.Mutation,
    ...cartResolvers.Mutation,
    ...inventoryLogResolvers.Mutation,
    ...shelfResolvers.Mutation,
    ...locationResolvers.Mutation,
    ...itemStockResolvers.Mutation,
    ...householdResolvers.Mutation,
    ...inviteResolvers.Mutation,
    ...ownershipResolvers.Mutation,
  }),
  Recipe: recipeResolvers.Recipe,
  InventoryLog: inventoryLogResolvers.InventoryLog,
  Cart: cartResolvers.Cart,
  Location: locationResolvers.Location,
  // `hasOwner` and `pendingTransfer` (households H6b task K.3).
  Household: ownershipResolvers.Household,
  Subscription: liveResolvers.Subscription,
}

export const resolvers = {
  ...(resolversObject as Resolvers),
  JSON: JSONScalar,
}
