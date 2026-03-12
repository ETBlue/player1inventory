import { GraphQLError } from 'graphql'
import { ItemModel } from '../models/Item.model.js'
import { requireAuth } from '../context.js'
import type { Context } from '../context.js'

interface UpdateItemInput {
  name?: string
  tagIds?: string[]
  vendorIds?: string[]
  targetUnit?: string
  targetQuantity?: number
  refillThreshold?: number
  packedQuantity?: number
  unpackedQuantity?: number
  consumeAmount?: number
  packageUnit?: string
  measurementUnit?: string
  amountPerPackage?: number
  dueDate?: string
  estimatedDueDays?: number
  expirationThreshold?: number
}

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
      { id, input }: { id: string; input: UpdateItemInput },
      ctx: Context,
    ) => {
      const userId = requireAuth(ctx)
      const item = await ItemModel.findOneAndUpdate(
        { _id: id, userId },
        { $set: input },
        { new: true },
      )
      if (!item) throw new GraphQLError('Item not found', { extensions: { code: 'NOT_FOUND' } })
      return item
    },
    deleteItem: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const userId = requireAuth(ctx)
      const result = await ItemModel.deleteOne({ _id: id, userId })
      return result.deletedCount > 0
    },
  },
  Item: {
    id: (item: { _id: { toString(): string } }) => item._id.toString(),
    createdAt: (item: { createdAt: Date }) => item.createdAt.toISOString(),
    updatedAt: (item: { updatedAt: Date }) => item.updatedAt.toISOString(),
    dueDate: (item: { dueDate?: Date }) =>
      item.dueDate ? item.dueDate.toISOString() : null,
  },
}
