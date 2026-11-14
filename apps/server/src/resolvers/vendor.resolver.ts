import { GraphQLError } from 'graphql'
import {
  locationIdsWithRole,
  requireCatalogRole,
  requireLocationRole,
  requireOwnRowOrUnclaimed,
} from '../lib/authz.js'
import { cartIdFor, parseCartId } from '@p1i/types'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Resolvers, Vendor } from '../generated/graphql.js'

// ── Household scope (households H3a, task 3.7) ──
//
// Reading vendors needs household role `member`; every write needs `manager`
// (design, *Household roles*), through `requireCatalogRole` (lib/authz.ts).
// `Cart.userId` was dropped in households H3b task B.3; carts are scoped by
// their location.
export const vendorResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    vendors: async (_, __, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'member')
      return prisma.vendor.findMany({ where: { householdId } }) as unknown as Promise<Vendor[]>
    },
  },
  Mutation: {
    // `locationId` is REQUIRED since PR 3b Task 4. There is no default-location
    // fallback any more: the web client sends the active location, so a vendor
    // created while viewing the Garage gets its cart in the Garage.
    createVendor: async (_, { name, locationId }, ctx) => {
      requireAuth(ctx)

      // Two checks, because this mutation writes at two levels: a Vendor in
      // the household's catalog needs household role `manager`, and a Cart
      // row at the location needs location role `participant` (not `viewer`).
      // The location id arrives from the client, so it goes through the one
      // authorization seam (lib/authz.ts) before it reaches any query.
      const householdId = await requireCatalogRole(ctx, 'manager')
      await requireLocationRole(ctx, locationId, 'participant')

      const vendor = await prisma.vendor.create({ data: { name, householdId } })

      // ONE cart, at the location the caller is looking at — the same half
      // local mode does (createVendor, apps/web/src/db/operations.ts). The
      // other locations get this vendor's cart from the `bootstrapCarts`
      // mutation (cart.resolver.ts) when they become active. It is NOT done
      // lazily from a read path; local mode's comment says why.
      await prisma.cart.upsert({
        where: { id: cartIdFor(locationId, vendor.id) },
        create: {
          id: cartIdFor(locationId, vendor.id),
          locationId,
        },
        update: {},
      })
      return vendor as unknown as Vendor
    },
    // The row is checked by `requireOwnRowOrUnclaimed` (lib/authz.ts), which
    // throws FORBIDDEN for another household's vendor. No call site compares a
    // `userId` or a `householdId`. Before 2026-11-04 both writes below used
    // `where: { id }` alone — docs/global/bugs/2026-11-04-bug-unscoped-catalog-writes.md.
    updateVendor: async (_, { id, name }, ctx) => {
      await requireCatalogRole(ctx, 'manager')
      if ((await requireOwnRowOrUnclaimed(ctx, 'vendor', id)) === 'unclaimed') {
        throw new GraphQLError('Vendor not found', { extensions: { code: 'NOT_FOUND' } })
      }
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
      await requireCatalogRole(ctx, 'manager')
      // The row check FIRST, outside the try below: a refused call must change
      // nothing — not even the caller's own carts that name this vendor id —
      // and its FORBIDDEN must reach the client rather than become `false`.
      // A missing vendor returns false, as it did before.
      if ((await requireOwnRowOrUnclaimed(ctx, 'vendor', id)) === 'unclaimed') return false
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
        // and the split rule is "first colon only" (`parseCartId` in `@p1i/types`).
        //
        // STOPGAP (households H3b task B.3), finished by task B.7: the carts
        // at every location the caller has a role on. `Cart.userId` is gone,
        // so this can no longer read "the caller's carts". Task B.7 widens it
        // to every location of the caller's household (decision D8), so a
        // location the caller holds no role on also loses this vendor's cart.
        // Nobody can share a household before H5, so today the two give the
        // same answer.
        const carts = await prisma.cart.findMany({
          where: { locationId: { in: await locationIdsWithRole(ctx) } },
          select: { id: true },
        })
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
