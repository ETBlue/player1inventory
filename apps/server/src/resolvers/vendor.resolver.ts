import { GraphQLError } from 'graphql'
import {
  requireCatalogRole,
  requireLocationInHousehold,
  requireLocationRole,
  requireOwnRowOrUnclaimed,
  roleAtLeast,
  type LocationRole,
} from '../lib/authz.js'
import { cartIdFor, parseCartId } from '@p1i/types'
import { prisma } from '../lib/prisma.js'
import { type ChangedLocation, publishChange, publishHouseholdChange } from '../lib/publishChange.js'
import { requireAuth } from '../context.js'
import type { Resolvers, Vendor } from '../generated/graphql.js'

// ── Household scope (households H3a, task 3.7) ──
//
// Reading vendors needs household role `member`; every write needs `manager`
// (design, *Household roles*), through `requireCatalogRole` (lib/authz.ts).
// `Cart.userId` was dropped in households H3b task B.3; carts are scoped by
// their location.
//
// Live events (households H3c-2 task D.4): every write sends a
// household-level `CATALOG` event after it has saved, for the household
// `requireCatalogRole` returned. `createVendor` and `deleteVendor` also send
// `CART`, because they make or delete carts (`createVendor` only when it
// made one: not for a location viewer, since households H5).
export const vendorResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    vendors: async (_, __, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'member')
      return prisma.vendor.findMany({ where: { householdId } }) as unknown as Promise<Vendor[]>
    },
  },
  Mutation: {
    // `locationId` is OPTIONAL since households H5 (review of task F.7). It
    // was required from PR 3b Task 4. There is still no default-location
    // fallback: when the web knows a location it sends the active one, so a
    // vendor created while viewing the Garage gets its cart in the Garage.
    // When the household has NO location (an empty household is real since
    // F.7), the web sends none, and the vendor is written with no cart.
    createVendor: async (_, { name, locationId }, ctx) => {
      requireAuth(ctx)

      // This mutation writes at two levels. The Vendor is a catalog row and
      // needs household role `manager`. The Cart it pre-creates is a location
      // row and needs location role `participant`.
      //
      // Since households H5 (review of task F.6) the location role decides
      // only the CART, not the vendor. A household manager who is a `viewer`
      // of the active location gets the vendor and no cart. Before that the
      // whole mutation asked `participant` and was refused, so the vendor
      // dialog stayed open with no message.
      //
      // When a location is named, the location check still asks `viewer`,
      // not nothing:
      // - it reads the caller's role there in the same query, which decides
      //   the cart below;
      // - it runs BEFORE `requireLocationInHousehold`, so a caller with no
      //   role on a location learns nothing about which household it is in;
      // - a location the caller has no role on is refused, the same as
      //   before. The web sends only a location from the switcher, which
      //   lists only locations with a role.
      //
      // When no location is named, only the household role is checked, no
      // cart is written, and only `CATALOG` is sent. Before this the web sent
      // the `'local'` sentinel in an empty household, and an owner was told
      // "Only a household owner or manager can add a vendor."
      //
      // `requireLocationInHousehold` (households H4 task E.3, decision T14,
      // issue #381 gap 2): a person in households A and B holds roles in
      // both, so the role check alone would let them make a vendor of A with
      // its cart at a location of B. All three checks refuse with FORBIDDEN,
      // and all run before any write.
      const householdId = await requireCatalogRole(ctx, 'manager')
      let role: LocationRole | null = null
      if (locationId != null) {
        role = (await requireLocationRole(ctx, locationId, 'viewer')).role
        await requireLocationInHousehold(ctx, locationId, householdId)
      }

      const vendor = await prisma.vendor.create({ data: { name, householdId } })

      // ONE cart, at the location the caller is looking at — the same half
      // local mode does (createVendor, apps/web/src/db/operations.ts). The
      // other locations get this vendor's cart from the `bootstrapCarts`
      // mutation (cart.resolver.ts) when they become active. It is NOT done
      // lazily from a read path; local mode's comment says why.
      //
      // Only for `participant` or higher. For a viewer no cart is written:
      // `vendorCart` returns an unsaved empty cart for a viewer, and
      // `bootstrapCarts` makes the row when a participant opens the location.
      const cartLocationId =
        locationId != null && role !== null && roleAtLeast(role, 'participant') ? locationId : null
      if (cartLocationId !== null) {
        await prisma.cart.upsert({
          where: { id: cartIdFor(cartLocationId, vendor.id) },
          create: {
            id: cartIdFor(cartLocationId, vendor.id),
            locationId: cartLocationId,
          },
          update: {},
        })
      }
      // `CATALOG` for the new vendor. `CART` only when a cart was written
      // at `locationId` (never when no location was named). The cart is empty, but `bootstrapCarts` sends `CART`
      // for the empty carts it makes too, so both behave the same. The
      // location is passed without a household, so `publishChange` reads the
      // LOCATION's household. Since households H4 task E.3 that is always
      // `householdId`, because `requireLocationInHousehold` above refuses any
      // other.
      await publishHouseholdChange(ctx, ['CATALOG'], householdId)
      if (cartLocationId !== null) await publishChange(ctx, ['CART'], [{ locationId: cartLocationId }])
      return vendor as unknown as Vendor
    },
    // The row is checked by `requireOwnRowOrUnclaimed` (lib/authz.ts), which
    // throws FORBIDDEN for another household's vendor. No call site compares a
    // `userId` or a `householdId`. Before 2026-11-04 both writes below used
    // `where: { id }` alone — docs/global/bugs/2026-11-04-bug-unscoped-catalog-writes.md.
    updateVendor: async (_, { id, name }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'manager')
      if ((await requireOwnRowOrUnclaimed(ctx, 'vendor', id, householdId)) === 'unclaimed') {
        throw new GraphQLError('Vendor not found', { extensions: { code: 'NOT_FOUND' } })
      }
      const data: Record<string, unknown> = {}
      if (name !== undefined) data.name = name
      let saved: unknown
      try {
        saved = await prisma.vendor.update({ where: { id }, data })
      } catch {
        throw new GraphQLError('Vendor not found', { extensions: { code: 'NOT_FOUND' } })
      }
      await publishHouseholdChange(ctx, ['CATALOG'], householdId)
      return saved as Vendor
    },
    deleteVendor: async (_, { id }, ctx) => {
      requireAuth(ctx)
      const householdId = await requireCatalogRole(ctx, 'manager')
      // The row check FIRST, outside the try below: a refused call must change
      // nothing — not even the caller's own carts that name this vendor id —
      // and its FORBIDDEN must reach the client rather than become `false`.
      // A missing vendor returns false, as it did before.
      if ((await requireOwnRowOrUnclaimed(ctx, 'vendor', id, householdId)) === 'unclaimed') return false
      // ItemVendor rows cascade automatically (onDelete: Cascade on ItemVendor.vendor)
      let cartsDeletedAt: ChangedLocation[] = []
      let vendorDeleted = false
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
        vendorDeleted = true
        return true
      } catch {
        return false
      } finally {
        // `CART` for each location whose carts this deleted (households
        // H3c-1, task C.4). The household is known: the carts were read
        // from this household's locations. `CATALOG` only when the vendor
        // itself is gone (households H3c-2 task D.4).
        await publishChange(ctx, ['CART'], cartsDeletedAt)
        if (vendorDeleted) await publishHouseholdChange(ctx, ['CATALOG'], householdId)
      }
    },
  },
}
