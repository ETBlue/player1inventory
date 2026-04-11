import { ItemModel } from '../models/Item.model.js'
import { RecipeModel } from '../models/Recipe.model.js'
import { CartModel, CartItemModel } from '../models/Cart.model.js'
import { InventoryLogModel } from '../models/InventoryLog.model.js'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Resolvers } from '../generated/graphql.js'

export const purgeResolvers: Pick<Resolvers, 'Mutation'> = {
  Mutation: {
    purgeUserData: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const [items, recipes, carts, cartItems, inventoryLogs, tags, tagTypes, vendors] =
        await Promise.all([
          ItemModel.deleteMany({ userId }),
          RecipeModel.deleteMany({ userId }),
          CartModel.deleteMany({ userId }),
          CartItemModel.deleteMany({ userId }),
          InventoryLogModel.deleteMany({ userId }),
          prisma.tag.deleteMany({ where: { userId } }),
          prisma.tagType.deleteMany({ where: { userId } }),
          prisma.vendor.deleteMany({ where: { userId } }),
        ])
      return {
        items: items.deletedCount,
        tags: tags.count,
        tagTypes: tagTypes.count,
        vendors: vendors.count,
        recipes: recipes.deletedCount,
        carts: carts.deletedCount,
        cartItems: cartItems.deletedCount,
        inventoryLogs: inventoryLogs.deletedCount,
      }
    },
  },
}
