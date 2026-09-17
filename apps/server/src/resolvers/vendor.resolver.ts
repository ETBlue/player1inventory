import { GraphQLError } from 'graphql'
import { cartIdFor, parseCartId } from '../lib/cartId.js'
import { ensureDefaultLocation } from '../lib/defaultLocation.js'
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
      // Create the permanent cart for this vendor.
      //
      // PR 3b Task 1 gave the id its new `${locationId}:${vendorId}` shape, so
      // this writer can no longer produce an id the migration's guard forbids.
      // It still creates ONE cart, in the caller's DEFAULT location.
      //
      // PR 3b: local mode creates the cart for the ACTIVE location
      // (createVendor, apps/web/src/db/operations.ts:968) and fills in the
      // other locations from bootstrapCarts (operations.ts:864) when the active
      // location changes. Cloud needs both halves. Task 2.
      const locationId = await ensureDefaultLocation(userId)
      await prisma.cart.upsert({
        where: { id: cartIdFor(locationId, vendor.id) },
        create: { id: cartIdFor(locationId, vendor.id), userId, locationId },
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
      const userId = requireAuth(ctx)
      // ItemVendor rows cascade automatically (onDelete: Cascade on ItemVendor.vendor)
      try {
        // A vendor has one cart PER LOCATION since PR 3b re-keyed Cart.id, so
        // there is no single `id` to delete any more. Before the re-key this
        // deleted `where: { id }`; after it, that matched nothing and every one
        // of the vendor's carts was left behind with its items — silently, since
        // no foreign key ties Cart to Vendor.
        //
        // The vendor part is read back with `parseCartId` rather than matched
        // with `endsWith(':' + id)`, because a vendor id may itself contain ':'
        // and the split rule is "first colon only" (lib/cartId.ts).
        const carts = await prisma.cart.findMany({ where: { userId }, select: { id: true } })
        const cartIds = carts.filter((c) => parseCartId(c.id).vendorId === id).map((c) => c.id)
        if (cartIds.length > 0) {
          await prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } })
          await prisma.cart.deleteMany({ where: { id: { in: cartIds } } })
        }
        await prisma.vendor.delete({ where: { id } })
        return true
      } catch {
        return false
      }
    },
  },
}
