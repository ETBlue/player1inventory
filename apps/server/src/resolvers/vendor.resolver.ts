import { GraphQLError } from 'graphql'
import {
  requireCatalogRole,
  requireLocationRole,
  requireOwnRowOrUnclaimed,
} from '../lib/authz.js'
import { cartIdFor, parseCartId } from '@p1i/types'
import { prisma } from '../lib/prisma.js'
import { type ChangedLocation, publishChange } from '../lib/publishChange.js'
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
      const householdId = await requireCatalogRole(ctx, 'manager')
      // The row check FIRST, outside the try below: a refused call must change
      // nothing — not even the caller's own carts that name this vendor id —
      // and its FORBIDDEN must reach the client rather than become `false`.
      // A missing vendor returns false, as it did before.
      if ((await requireOwnRowOrUnclaimed(ctx, 'vendor', id)) === 'unclaimed') return false
      // ItemVendor rows cascade automatically (onDelete: Cascade on ItemVendor.vendor)
      let cartsDeletedAt: ChangedLocation[] = []
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
        // The vendor's carts at EVERY location of the caller's household
        // (households H3b task B.7, decision D8), including a location where
        // the caller holds no location role. The vendor is a catalog row of
        // the household, and `requireCatalogRole` above asked for `manager`,
        // so deleting it takes its carts everywhere it has one. A cart left
        // behind would name a vendor that no longer exists.
        //
        // `householdId` is the one `requireCatalogRole` returned, and the
        // vendor passed `requireOwnRowOrUnclaimed` above, so it is this
        // household's vendor. Another household's carts are not read: their
        // locations are not in this list. (Until task B.7 this read the carts
        // at `locationIdsWithRole`, a stopgap from task B.3.)
        const locations = await prisma.location.findMany({
          where: { householdId },
          select: { id: true },
        })
        const carts = await prisma.cart.findMany({
          where: { locationId: { in: locations.map((l) => l.id) } },
          select: { id: true, locationId: true },
        })
        const vendorCarts = carts.filter((c) => parseCartId(c.id).vendorId === id)
        const cartIds = vendorCarts.map((c) => c.id)
        if (cartIds.length > 0) {
          // Set BEFORE the deletes. These writes are not one transaction, so
          // when the second delete or the vendor delete fails, rows are
          // already gone. An extra event costs other tabs one refetch; a
          // missing one leaves them showing a cart that is gone.
          cartsDeletedAt = vendorCarts.map((c) => ({ locationId: c.locationId, householdId }))
          await prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } })
          await prisma.cart.deleteMany({ where: { id: { in: cartIds } } })
        }
        await prisma.vendor.delete({ where: { id } })
        return true
      } catch {
        return false
      } finally {
        // `CART` for each location whose carts this deleted (households
        // H3c-1, task C.4). The household is known: the carts were read
        // from this household's locations. H3c-2 adds `CATALOG`.
        await publishChange(ctx, 'CART', cartsDeletedAt)
      }
    },
  },
}
