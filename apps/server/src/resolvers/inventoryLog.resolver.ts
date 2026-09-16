import { GraphQLScalarType } from 'graphql'
import type { Prisma } from '@prisma/client'
import { type LocationRole, requireLocationRole } from '../lib/authz.js'
import { ensureDefaultLocation } from '../lib/defaultLocation.js'
import { prisma } from '../lib/prisma.js'
import { type Context, requireAuth } from '../context.js'
import type { InventoryLog, Resolvers } from '../generated/graphql.js'

export const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: () => null,
})

/**
 * Turn the caller's `locationId` argument into the location id to query with.
 *
 * Two paths, and they differ in trust:
 *
 * - The caller named a location. That id arrives from the client, so it goes
 *   through `requireLocationRole` before it reaches any `where`. That call is
 *   the one authorization seam for location data (lib/authz.ts). Do NOT
 *   replace it with a `row.userId === ctx.userId` test — root CLAUDE.md
 *   forbids that, because it denies a legitimate `member` of a shared
 *   location.
 * - The caller named none. Then the log belongs to the caller's own default
 *   location. No role check is owed: `ensureDefaultLocation` reads and writes
 *   only rows whose `userId` is the caller's, so it cannot return someone
 *   else's location.
 *
 * The argument is nullable only until the web client passes it everywhere
 * (PR 3a Task 4). See the note in schema/inventoryLog.graphql.
 */
async function resolveLocationId(
  ctx: Context,
  locationId: string | null | undefined,
  role: LocationRole,
): Promise<string> {
  if (locationId == null) return ensureDefaultLocation(requireAuth(ctx))
  await requireLocationRole(ctx, locationId, role)
  return locationId
}

/**
 * `userId` in the `where` clauses below is a query SCOPE, not an authorization
 * decision — the same distinction lib/stockDualWrite.ts records for
 * `mirrorItemStockToItem`. Authorization is `requireLocationRole` above.
 *
 * When location RBAC lands, these `userId` scopes must be dropped from the
 * three location-scoped queries: `InventoryLog.userId` records who WROTE the
 * log, and a member reading a shared location has to see logs their
 * co-members wrote. `inventoryLogs` keeps its `userId` — it names no location,
 * so `userId` is the only scope it has.
 */

export const inventoryLogResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'InventoryLog'> = {
  Query: {
    itemLogs: async (_, { itemId, locationId }, ctx) => {
      const userId = requireAuth(ctx)
      const scopedLocationId = await resolveLocationId(ctx, locationId, 'viewer')
      return prisma.inventoryLog.findMany({
        where: { itemId, userId, locationId: scopedLocationId },
        orderBy: { occurredAt: 'asc' },
      }) as unknown as Promise<InventoryLog[]>
    },

    inventoryLogCountByItem: async (_, { itemId, locationId }, ctx) => {
      const userId = requireAuth(ctx)
      const scopedLocationId = await resolveLocationId(ctx, locationId, 'viewer')
      return prisma.inventoryLog.count({
        where: { itemId, userId, locationId: scopedLocationId },
      })
    },

    // No location argument, and that is the intended behaviour — see the
    // schema doc string. Export and import both need every location.
    inventoryLogs: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.inventoryLog.findMany({
        where: { userId },
        orderBy: { occurredAt: 'asc' },
      }) as unknown as Promise<InventoryLog[]>
    },

    lastPurchaseDates: async (_, { itemIds, locationId }, ctx) => {
      const userId = requireAuth(ctx)
      // Resolved once, before the loop: the role check does not depend on the
      // item, and repeating it per item would be one extra query per item.
      const scopedLocationId = await resolveLocationId(ctx, locationId, 'viewer')
      const results = await Promise.all(
        itemIds.map(async (itemId) => {
          const log = await prisma.inventoryLog.findFirst({
            where: { itemId, userId, locationId: scopedLocationId, delta: { gt: 0 } },
            orderBy: { occurredAt: 'desc' },
          })
          return { itemId, date: log?.occurredAt?.toISOString() ?? null }
        }),
      )
      return results
    },
  },

  Mutation: {
    addInventoryLog: async (
      _,
      { itemId, delta, quantity, occurredAt, locationId, note, logKey, logParams },
      ctx,
    ) => {
      const userId = requireAuth(ctx)
      // A write needs `member`, not `viewer`: a viewer may read a location's
      // logs but must not add one.
      const scopedLocationId = await resolveLocationId(ctx, locationId, 'member')
      return prisma.inventoryLog.create({
        data: {
          itemId,
          delta,
          quantity,
          occurredAt: new Date(occurredAt),
          userId,
          locationId: scopedLocationId,
          ...(note ? { note } : {}),
          ...(logKey ? { logKey } : {}),
          ...(logParams ? { logParams: logParams as Prisma.InputJsonValue } : {}),
        },
      }) as unknown as Promise<InventoryLog>
    },
  },

  InventoryLog: {
    occurredAt: (log) => {
      const d = (log as unknown as { occurredAt: Date | null }).occurredAt
      return d != null ? d.toISOString() : new Date(0).toISOString()
    },
    quantity: (log) => (log as unknown as { quantity: number | null }).quantity ?? 0,
    delta: (log) => (log as unknown as { delta: number | null }).delta ?? 0,
  },
}
