import { GraphQLError } from 'graphql'
import { type Context, requireAuth } from '../context.js'
import {
  forbidden,
  locationIdsWithRole,
  requireHousehold,
  requireHouseholdRole,
  requireLocationRole,
} from '../lib/authz.js'
import { lockHousehold } from '../lib/household.js'
import { prisma } from '../lib/prisma.js'
import type { Location, Resolvers } from '../generated/graphql.js'
import type { Prisma, Location as PrismaLocation } from '@prisma/client'

// Map a Prisma Location row to the GraphQL shape. GraphQL schema types
// createdAt/updatedAt as String! — Date objects must be explicitly
// ISO-stringified here rather than left for the default String scalar
// serializer, which coerces via Date.valueOf() (epoch milliseconds) before
// it ever reaches toJSON(). Mirrors item.resolver.ts's and
// itemStock.resolver.ts's toGraphQL.
// Exported because `import.resolver.ts`'s two bulk location mutations return
// `[Location!]!` and must serialize identically. Same reason
// `itemStock.resolver.ts` and `shelf.resolver.ts` import `item.resolver.ts`'s
// `toGraphQL` instead of copying it: a second copy is a second place for the
// ISO-string bug to come back.
export function toGraphQL(row: PrismaLocation): Location {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as unknown as Location
}

/**
 * The locations the caller sees, by `order`: every location on which they
 * hold a location role that still counts (decision H18). Ties are broken by
 * id, so the answer is the same every time.
 *
 * An owner or manager does NOT see a location they have no role on. That is
 * H5. Before H5 nobody can be in that state: whoever creates a location
 * organizes it.
 */
async function visibleLocations(ctx: Context): Promise<Location[]> {
  const ids = await locationIdsWithRole(ctx)
  if (ids.length === 0) return []
  const rows = await prisma.location.findMany({
    where: { id: { in: ids } },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
  return (rows as unknown as PrismaLocation[]).map(toGraphQL)
}

export const locationResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    locations: async (_, __, ctx) => {
      // First sign-in happens here for most people: a new person gets their
      // household, its first location "Home", and an `organizer` row on it
      // (lib/household.ts). So it must run before the role rows are read.
      await requireHousehold(ctx)
      return visibleLocations(ctx)
    },
  },

  Mutation: {
    // Household role `member`, the lowest: anyone in the household may add a
    // location. The creator organizes it.
    createLocation: async (_, { name }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      await requireHouseholdRole(ctx, householdId, 'member')

      // ONE transaction, so a location never exists without its organizer
      // row. Without that row nobody could rename it, stock it or see it:
      // every location check reads `LocationMember` (lib/authz.ts).
      const row = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // max + 1 within the HOUSEHOLD, including locations the caller has no
        // role on, so a new location never shares an order with one that
        // another member sees.
        const siblings = await tx.location.findMany({
          where: { householdId },
          select: { order: true },
        })
        const maxOrder = siblings.reduce((max, l) => Math.max(max, l.order), -1)
        // Both scope columns until task 3.14 drops `userId` (decision H16).
        // `isDefault` is left to its column default, `false`. So the partial
        // index "Location_one_default_per_user_key" (on `userId` WHERE
        // "isDefault") can never refuse this row.
        const created = await tx.location.create({
          data: { name: name.trim(), order: maxOrder + 1, userId, householdId },
        })
        await tx.locationMember.create({
          data: { locationId: created.id, userId, role: 'organizer' },
        })
        return created
      })
      return toGraphQL(row as unknown as PrismaLocation)
    },

    // Location role `organizer`: renaming changes the location for everyone
    // who shares it.
    updateLocation: async (_, { id, input }, ctx) => {
      await requireLocationRole(ctx, id, 'organizer')
      const data: { name?: string } = {}
      if (typeof input.name === 'string') data.name = input.name.trim()
      const row = await prisma.location.update({ where: { id }, data })
      return toGraphQL(row as unknown as PrismaLocation)
    },

    // Household role `manager`. The LOCATION role does not count here, either
    // way: a manager with no role on a location may delete it, and a
    // household `member` who organizes one may not.
    deleteLocation: async (_, { id }, ctx) => {
      const householdId = await requireHousehold(ctx)
      await requireHouseholdRole(ctx, householdId, 'manager')

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // FIRST, before the read and the count below, so two deletes at once
        // cannot both count 2 (lib/household.ts explains how).
        await lockHousehold(tx, householdId)

        // The location must be in the caller's household. A `where` filter,
        // and the same `Forbidden` for "another household's" and "no such
        // id", so a caller cannot probe for ids.
        const location = await tx.location.findFirst({
          where: { id, householdId },
          select: { id: true },
        })
        if (!location) throw forbidden()

        // Decision H13: a household always keeps one location, because
        // there is no screen for a household with none until H5. `isDefault`
        // is no longer read: any location may go, except the last one.
        const count = await tx.location.count({ where: { householdId } })
        if (count <= 1) {
          throw new GraphQLError("The household's last location cannot be deleted.", {
            extensions: { code: 'LAST_LOCATION' },
          })
        }

        // ItemStock, Cart, InventoryLog and LocationMember all cascade via
        // their foreign keys, so this one delete removes the location's stock
        // rows, its carts (and through Cart, its cart items), its inventory
        // logs and its role rows. Matches local mode's deleteLocation
        // (apps/web/src/db/operations.ts).
        await tx.location.delete({ where: { id } })
      })
      return true
    },

    // Household role `manager`. Order is one list for the whole household
    // until H7 brings each person their own (decision H5).
    reorderLocations: async (_, { orderedIds }, ctx) => {
      const householdId = await requireHousehold(ctx)
      await requireHouseholdRole(ctx, householdId, 'manager')

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // A repeated id is refused. With ['A', 'A', 'B'], A would get order 0
        // and then 1, and B 2: no order 0 left, and the list the caller sent
        // is not an order of the locations. The web app never sends one:
        // `LocationList` sends `arrayMove(locations, …).map((l) => l.id)`, a
        // new order of the list it shows, and `useReorderLocations` passes it
        // on unchanged. So a repeated id is a malformed request.
        if (new Set(orderedIds).size !== orderedIds.length) {
          throw new GraphQLError('Each location may appear only once.', {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }

        // Every id must be a location of the caller's household. Checked
        // before ANY write, so a batch with one foreign or unknown id changes
        // nothing at all.
        const found = await tx.location.findMany({
          where: { id: { in: orderedIds }, householdId },
          select: { id: true },
        })
        if (found.length !== orderedIds.length) throw forbidden()

        for (const [index, id] of orderedIds.entries()) {
          await tx.location.update({ where: { id }, data: { order: index } })
        }
      })
      return visibleLocations(ctx)
    },
  },
}
