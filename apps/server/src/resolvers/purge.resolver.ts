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
        itemStocks,
        items,
        tags,
        tagTypes,
        vendors,
        shelves,
        locations,
      ] = await prisma.$transaction([
        prisma.inventoryLog.deleteMany({ where: { userId } }),
        prisma.cartItem.deleteMany({ where: { userId } }),
        prisma.cart.deleteMany({ where: { userId } }),
        prisma.recipeItem.deleteMany({ where: { recipe: { userId } } }),
        prisma.recipe.deleteMany({ where: { userId } }),
        prisma.itemTag.deleteMany({ where: { item: { userId } } }),
        prisma.itemVendor.deleteMany({ where: { item: { userId } } }),
        // ItemStock has no userId of its own — scoped through its location,
        // matching how recipeItem/itemTag/itemVendor are scoped through their
        // parent above. Must run before BOTH item.deleteMany and
        // location.deleteMany: ItemStock FKs to both, and ItemStock_itemId_fkey
        // is ON DELETE CASCADE — deleting items first would cascade-delete these
        // rows before this deleteMany counts them, so the count would be wrong
        // even though nothing is orphaned.
        prisma.itemStock.deleteMany({ where: { location: { userId } } }),
        prisma.item.deleteMany({ where: { userId } }),
        prisma.tag.deleteMany({ where: { userId } }),
        prisma.tagType.deleteMany({ where: { userId } }),
        prisma.vendor.deleteMany({ where: { userId } }),
        prisma.shelf.deleteMany({ where: { userId } }),
        prisma.location.deleteMany({ where: { userId } }),
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
        shelves: shelves.count,
        itemStocks: itemStocks.count,
        locations: locations.count,
      }
    },
  },
}
