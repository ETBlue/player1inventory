import { ItemModel } from '../models/Item.model.js'
import { requireAuth } from '../context.js'
import type { Context } from '../context.js'

export const itemResolvers = {
  Query: {
    items: async (_: unknown, __: unknown, ctx: Context) => {
      const userId = requireAuth(ctx)
      return ItemModel.find({ userId })
    },
    item: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const userId = requireAuth(ctx)
      return ItemModel.findOne({ _id: id, userId })
    },
  },
  Mutation: {
    createItem: async (_: unknown, { name }: { name: string }, ctx: Context) => {
      const userId = requireAuth(ctx)
      return ItemModel.create({
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
    },
    updateItem: async (
      _: unknown,
      { id, input }: { id: string; input: Record<string, unknown> },
      ctx: Context,
    ) => {
      const userId = requireAuth(ctx)
      return ItemModel.findOneAndUpdate(
        { _id: id, userId },
        { $set: input },
        { new: true },
      )
    },
    deleteItem: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const userId = requireAuth(ctx)
      await ItemModel.deleteOne({ _id: id, userId })
      return true
    },
  },
  Item: {
    id: (item: { _id: { toString(): string } }) => item._id.toString(),
    createdAt: (item: { createdAt: Date }) => item.createdAt.toISOString(),
    updatedAt: (item: { updatedAt: Date }) => item.updatedAt.toISOString(),
  },
}
