import { GraphQLError } from 'graphql'
import { ItemModel } from '../models/Item.model.js'
import { VendorModel } from '../models/Vendor.model.js'
import { requireAuth } from '../context.js'
import type { Resolvers, Vendor } from '../generated/graphql.js'

export const vendorResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Vendor'> = {
  Query: {
    vendors: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return VendorModel.find({ userId }) as unknown as Promise<Vendor[]>
    },
  },
  Mutation: {
    createVendor: async (_, { name }, ctx) => {
      const userId = requireAuth(ctx)
      return VendorModel.create({ name, userId }) as unknown as Promise<Vendor>
    },
    updateVendor: async (_, { id, name }, ctx) => {
      const userId = requireAuth(ctx)
      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name
      const vendor = await VendorModel.findOneAndUpdate(
        { _id: id, userId },
        { $set: updates },
        { new: true },
      )
      if (!vendor) throw new GraphQLError('Vendor not found', { extensions: { code: 'NOT_FOUND' } })
      return vendor as unknown as Vendor
    },
    deleteVendor: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      // Cascade: remove vendorId from all items before deleting
      await ItemModel.updateMany({ userId, vendorIds: id }, { $pull: { vendorIds: id } })
      const result = await VendorModel.deleteOne({ _id: id, userId })
      return result.deletedCount > 0
    },
  },
  Vendor: {
    id: (vendor) => (vendor as unknown as { _id: { toString(): string } })._id.toString(),
  },
}
