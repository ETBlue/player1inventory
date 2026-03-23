import { GraphQLError } from 'graphql'
import { ItemModel } from '../models/Item.model.js'
import { RecipeModel } from '../models/Recipe.model.js'
import { InventoryLogModel } from '../models/InventoryLog.model.js'
import { requireAuth } from '../context.js'
import type { Item, Resolvers, UpdateItemInput } from '../generated/graphql.js'

export const itemResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Item'> = {
  Query: {
    items: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return ItemModel.find({ userId })
    },
    item: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      return ItemModel.findOne({ _id: id, userId })
    },
    itemCountByTag: async (_, { tagId }, ctx) => {
      const userId = requireAuth(ctx)
      return ItemModel.countDocuments({ userId, tagIds: tagId })
    },
    itemCountByVendor: async (_, { vendorId }, ctx) => {
      const userId = requireAuth(ctx)
      return ItemModel.countDocuments({ userId, vendorIds: vendorId })
    },
    itemCountByRecipe: async (_, { recipeId }, ctx) => {
      const userId = requireAuth(ctx)
      const recipe = await RecipeModel.findOne({ _id: recipeId, userId })
      return recipe?.items.length ?? 0
    },
  },
  Mutation: {
    createItem: async (_, { name }, ctx) => {
      const userId = requireAuth(ctx)
      const doc = await ItemModel.create({
        name,
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        userId,
      })
      // Cast needed: Mongoose document has Date fields; Item field resolvers convert them to strings
      return doc as unknown as Item
    },
    updateItem: async (_, { id, input }, ctx) => {
      const userId = requireAuth(ctx)
      const item = await ItemModel.findOneAndUpdate(
        { _id: id, userId },
        { $set: input as UpdateItemInput },
        { new: true },
      )
      if (!item) throw new GraphQLError('Item not found', { extensions: { code: 'NOT_FOUND' } })
      // Cast needed: Mongoose document has Date fields; Item field resolvers convert them to strings
      return item as unknown as Item
    },
    deleteItem: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      // Cascade: remove itemId from all recipes before deleting
      await RecipeModel.updateMany(
        { userId, 'items.itemId': id },
        { $pull: { items: { itemId: id } } },
      )
      // Cascade: delete all inventory logs for this item
      await InventoryLogModel.deleteMany({ itemId: id, userId })
      const result = await ItemModel.deleteOne({ _id: id, userId })
      return result.deletedCount > 0
    },
  },
  Item: {
    id: (item) => (item as unknown as { _id: { toString(): string } })._id.toString(),
    createdAt: (item) => (item as unknown as { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (item) => (item as unknown as { updatedAt: Date }).updatedAt.toISOString(),
    dueDate: (item) => {
      const d = (item as unknown as { dueDate?: Date }).dueDate
      return d ? d.toISOString() : null
    },
  },
}
