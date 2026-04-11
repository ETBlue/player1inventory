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
      return prisma.vendor.create({ data: { name, userId } }) as unknown as Promise<Vendor>
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
        await prisma.vendor.delete({ where: { id } })
        return true
      } catch {
        return false
      }
    },
  },
}
