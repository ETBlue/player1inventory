import { GraphQLError } from 'graphql'
import { requireAuth } from '../context.js'
import { requireLocationRole } from '../lib/authz.js'
import { prisma } from '../lib/prisma.js'
import type { Location, Resolvers } from '../generated/graphql.js'
import type { Location as PrismaLocation } from '@prisma/client'

const DEFAULT_LOCATION_NAME = 'My Home'

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

/**
 * Give a user a default location if they have none.
 *
 * Mirrors local mode, where `ensureDefaultLocation` is called from BOTH the
 * Dexie upgrade and `on('populate')` because a fresh database never runs
 * upgrade functions. The cloud equivalents are the migration backfill (users
 * who existed then) and this call (everyone who signs up after).
 *
 * Race-safe by the database, not by check-then-act: the migration adds a
 * partial unique index on ("userId") WHERE "isDefault", so a concurrent second
 * insert loses with P2002 and we simply proceed — the winner's row is the one
 * the subsequent read returns.
 */
export async function ensureDefaultLocation(userId: string): Promise<void> {
  const existing = await prisma.location.findFirst({ where: { userId } })
  if (existing) return
  try {
    await prisma.location.create({
      data: { name: DEFAULT_LOCATION_NAME, order: 0, isDefault: true, userId },
    })
  } catch {
    // Lost the race; the other caller created it.
  }
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
      // ItemStock cascades via the FK. Carts and inventory logs gain their
      // locationId — and therefore their cascade — in PR 3.
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
