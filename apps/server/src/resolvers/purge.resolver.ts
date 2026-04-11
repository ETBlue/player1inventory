import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Resolvers } from '../generated/graphql.js'

export const purgeResolvers: Pick<Resolvers, 'Mutation'> = {
  Mutation: {
    purgeUserData: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const [
        inventoryLogs,
        cartItems,
        carts,
        recipeItems,
        recipes,
        itemTags,
        itemVendors,
        items,
        tags,
        tagTypes,
        vendors,
      ] = await prisma.$transaction([
        prisma.inventoryLog.deleteMany({ where: { userId } }),
        prisma.cartItem.deleteMany({ where: { userId } }),
        prisma.cart.deleteMany({ where: { userId } }),
        prisma.recipeItem.deleteMany({ where: { recipe: { userId } } }),
        prisma.recipe.deleteMany({ where: { userId } }),
        prisma.itemTag.deleteMany({ where: { item: { userId } } }),
        prisma.itemVendor.deleteMany({ where: { item: { userId } } }),
        prisma.item.deleteMany({ where: { userId } }),
        prisma.tag.deleteMany({ where: { userId } }),
        prisma.tagType.deleteMany({ where: { userId } }),
        prisma.vendor.deleteMany({ where: { userId } }),
      ])
      // recipeItems, itemTags, itemVendors are junction rows — rolled into items/recipes counts
      void recipeItems
      void itemTags
      void itemVendors
      return {
        items: items.count,
        tags: tags.count,
        tagTypes: tagTypes.count,
        vendors: vendors.count,
        recipes: recipes.count,
        carts: carts.count,
        cartItems: cartItems.count,
        inventoryLogs: inventoryLogs.count,
      }
    },
  },
}
