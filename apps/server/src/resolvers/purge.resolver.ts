import { ItemModel } from '../models/Item.model.js'
import { TagModel, TagTypeModel } from '../models/Tag.model.js'
import { VendorModel } from '../models/Vendor.model.js'
import { RecipeModel } from '../models/Recipe.model.js'
import { CartModel, CartItemModel } from '../models/Cart.model.js'
import { InventoryLogModel } from '../models/InventoryLog.model.js'
import { requireAuth } from '../context.js'
import type { Resolvers } from '../generated/graphql.js'

export const purgeResolvers: Pick<Resolvers, 'Mutation'> = {
  Mutation: {
    purgeUserData: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const [items, tags, tagTypes, vendors, recipes, carts, cartItems, inventoryLogs] =
        await Promise.all([
          ItemModel.deleteMany({ userId }),
          TagModel.deleteMany({ userId }),
          TagTypeModel.deleteMany({ userId }),
          VendorModel.deleteMany({ userId }),
          RecipeModel.deleteMany({ userId }),
          CartModel.deleteMany({ userId }),
          CartItemModel.deleteMany({ userId }),
          InventoryLogModel.deleteMany({ userId }),
        ])
      return {
        items: items.deletedCount,
        tags: tags.deletedCount,
        tagTypes: tagTypes.deletedCount,
        vendors: vendors.deletedCount,
        recipes: recipes.deletedCount,
        carts: carts.deletedCount,
        cartItems: cartItems.deletedCount,
        inventoryLogs: inventoryLogs.deletedCount,
      }
    },
  },
}
