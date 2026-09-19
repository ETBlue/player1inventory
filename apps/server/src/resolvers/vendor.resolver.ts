import { GraphQLError } from 'graphql'
import { requireLocationRole } from '../lib/authz.js'
import { cartIdFor, parseCartId } from '../lib/cartId.js'
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
    // `locationId` is REQUIRED since PR 3b Task 4. There is no default-location
    // fallback any more: the web client sends the active location, so a vendor
    // created while viewing the Garage gets its cart in the Garage.
    createVendor: async (_, { name, locationId }, ctx) => {
      const userId = requireAuth(ctx)

      // `member`, not `viewer`: this mutation writes a Cart row at that
      // location. The id arrives from the client, so it goes through the one
      // authorization seam (lib/authz.ts) before it reaches any query.
      await requireLocationRole(ctx, locationId, 'member')

      const vendor = await prisma.vendor.create({ data: { name, userId } })

      // ONE cart, at the location the caller is looking at — the same half
      // local mode does (createVendor, apps/web/src/db/operations.ts). The
      // other locations get this vendor's cart from the `bootstrapCarts`
      // mutation (cart.resolver.ts) when they become active. It is NOT done
      // lazily from a read path; local mode's comment says why.
      await prisma.cart.upsert({
        where: { id: cartIdFor(locationId, vendor.id) },
        create: {
          id: cartIdFor(locationId, vendor.id),
          userId,
          locationId,
        },
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
