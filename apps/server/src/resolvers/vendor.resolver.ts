import { GraphQLError } from 'graphql'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Resolvers, Vendor } from '../generated/graphql.js'

export const vendorResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    vendors: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.vendor.findMany({ where: { userId } }) as unknown as Promise<Vendor[]>
    },
  },
  Mutation: {
    createVendor: async (_, { name }, ctx) => {
      const userId = requireAuth(ctx)
      const vendor = await prisma.vendor.create({ data: { name, userId } })
      // Create permanent cart with same ID
      await prisma.cart.upsert({
        where: { id: vendor.id },
        create: { id: vendor.id, userId },
        update: {},
      })
      return vendor as unknown as Vendor
    },
    updateVendor: async (_, { id, name }, ctx) => {
      requireAuth(ctx)
      const data: Record<string, unknown> = {}
      if (name !== undefined) data.name = name
      try {
        return await prisma.vendor.update({ where: { id }, data }) as unknown as Vendor
      } catch {
        throw new GraphQLError('Vendor not found', { extensions: { code: 'NOT_FOUND' } })
      }
    },
    deleteVendor: async (_, { id }, ctx) => {
      requireAuth(ctx)
      // ItemVendor rows cascade automatically (onDelete: Cascade on ItemVendor.vendor)
      try {
        // Delete cart items then cart before deleting vendor
        await prisma.cartItem.deleteMany({ where: { cartId: id } })
        await prisma.cart.delete({ where: { id } }).catch(() => {}) // cart may not exist
        await prisma.vendor.delete({ where: { id } })
        return true
      } catch {
        return false
      }
    },
  },
}
