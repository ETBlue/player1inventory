import { GraphQLError } from 'graphql'
import { requireAuth } from '../context.js'
import { requireLocationRole } from '../lib/authz.js'
import { ensureDefaultLocation } from '../lib/defaultLocation.js'
import { prisma } from '../lib/prisma.js'
import type { Location, Resolvers } from '../generated/graphql.js'
import type { Location as PrismaLocation } from '@prisma/client'

// Map a Prisma Location row to the GraphQL shape. GraphQL schema types
// createdAt/updatedAt as String! — Date objects must be explicitly
// ISO-stringified here rather than left for the default String scalar
// serializer, which coerces via Date.valueOf() (epoch milliseconds) before
// it ever reaches toJSON(). Mirrors item.resolver.ts's and
// itemStock.resolver.ts's toGraphQL.
function toGraphQL(row: PrismaLocation): Location {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as unknown as Location
}

export const locationResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    locations: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      await ensureDefaultLocation(userId)
      const rows = await prisma.location.findMany({
        where: { userId },
        orderBy: { order: 'asc' },
      })
      return (rows as unknown as PrismaLocation[]).map(toGraphQL)
    },
  },

  Mutation: {
    createLocation: async (_, { name }, ctx) => {
      const userId = requireAuth(ctx)
      const siblings = await prisma.location.findMany({ where: { userId } })
      const maxOrder = siblings.reduce((max, l) => Math.max(max, l.order), -1)
      const row = await prisma.location.create({
        data: { name: name.trim(), order: maxOrder + 1, isDefault: false, userId },
      })
      return toGraphQL(row as unknown as PrismaLocation)
    },

    updateLocation: async (_, { id, input }, ctx) => {
      await requireLocationRole(ctx, id, 'member')
      const data: { name?: string } = {}
      if (typeof input.name === 'string') data.name = input.name.trim()
      const row = await prisma.location.update({ where: { id }, data })
      return toGraphQL(row as unknown as PrismaLocation)
    },

    deleteLocation: async (_, { id }, ctx) => {
      // Owner, not member: deleting a location is destructive and is the kind
      // of action location RBAC reserves for owners.
      const location = await requireLocationRole(ctx, id, 'owner')
      if (location.isDefault) {
        throw new GraphQLError('The default location cannot be deleted.', {
          extensions: { code: 'BAD_USER_INPUT' },
        })
      }
      // ItemStock, Cart and InventoryLog all cascade via their FKs, so this
      // one delete removes the location's stock rows, its carts (and through
      // Cart, its cart items) and its inventory logs. Cart.locationId and
      // InventoryLog.locationId were added in PR 3a
      // (20260916000000_add_location_to_log_and_cart). Matches local mode's
      // deleteLocation (apps/web/src/db/operations.ts:1215).
      await prisma.location.delete({ where: { id } })
      return true
    },

    reorderLocations: async (_, { orderedIds }, ctx) => {
      const userId = requireAuth(ctx)
      // Authorize EVERY id before writing ANY of them, so a batch containing
      // someone else's location changes nothing at all.
      for (const id of orderedIds) {
        await requireLocationRole(ctx, id, 'member')
      }
      await prisma.$transaction(
        orderedIds.map((id, index) =>
          prisma.location.update({ where: { id }, data: { order: index } }),
        ),
      )
      const rows = await prisma.location.findMany({
        where: { userId },
        orderBy: { order: 'asc' },
      })
      return (rows as unknown as PrismaLocation[]).map(toGraphQL)
    },
  },
}
