import { GraphQLScalarType } from 'graphql'
import type { Prisma } from '@prisma/client'
import {
  type LocationRole,
  locationIdsWithRole,
  requireLocationItems,
  requireLocationRole,
} from '../lib/authz.js'
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
 * Check the caller may use `locationId`, then hand it back for the `where`.
 *
 * The id arrives from the client, so it goes through `requireLocationRole`
 * before it reaches any query. That call is the one authorization seam for
 * location data (lib/authz.ts). Do NOT replace it with a
 * `row.userId === ctx.userId` test — root CLAUDE.md forbids that, because it
 * denies a legitimate `participant` of a shared location.
 *
 * There is no "caller named no location" branch any more. The argument is
 * `ID!` in the schema, so GraphQL rejects a request that omits it before this
 * function runs. The default-location fallback that stood here for one commit
 * (PR 3a Task 2, while the client had not caught up) was removed by Task 4:
 * a silent fallback reads the wrong location without saying so.
 */
async function requireLocation(
  ctx: Context,
  locationId: string,
  role: LocationRole,
): Promise<string> {
  await requireLocationRole(ctx, locationId, role)
  return locationId
}

/**
 * `InventoryLog.userId` means the AUTHOR of a log, not its owner (households
 * H3a, task 3.8). A log belongs to its LOCATION. So no read below filters by
 * `userId`:
 *
 * | Query | Scope |
 * |---|---|
 * | `itemLogs`, `inventoryLogCountByItem`, `lastPurchaseDates` | the one location named, after `requireLocationRole(…, 'viewer')` |
 * | `inventoryLogs` | every location the caller holds a role on (`locationIdsWithRole`) |
 *
 * Until task 3.8 all four also filtered by `userId`. In a shared location
 * that hid every log a co-member wrote, and `inventoryLogs` (export) missed
 * them too. Every create still WRITES `userId`, as the author.
 */

export const inventoryLogResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'InventoryLog'> = {
  Query: {
    itemLogs: async (_, { itemId, locationId }, ctx) => {
      const scopedLocationId = await requireLocation(ctx, locationId, 'viewer')
      return prisma.inventoryLog.findMany({
        where: { itemId, locationId: scopedLocationId },
        orderBy: { occurredAt: 'asc' },
      }) as unknown as Promise<InventoryLog[]>
    },

    inventoryLogCountByItem: async (_, { itemId, locationId }, ctx) => {
      const scopedLocationId = await requireLocation(ctx, locationId, 'viewer')
      return prisma.inventoryLog.count({
        where: { itemId, locationId: scopedLocationId },
      })
    },

    // No location argument, and that is the intended behaviour — see the
    // schema doc string. Export and import both need every location: every
    // location the caller holds a role on, any role.
    inventoryLogs: async (_, __, ctx) => {
      const locationIds = await locationIdsWithRole(ctx)
      return prisma.inventoryLog.findMany({
        where: { locationId: { in: locationIds } },
        orderBy: { occurredAt: 'asc' },
      }) as unknown as Promise<InventoryLog[]>
    },

    lastPurchaseDates: async (_, { itemIds, locationId }, ctx) => {
      // Resolved once, before the loop: the role check does not depend on the
      // item, and repeating it per item would be one extra query per item.
      const scopedLocationId = await requireLocation(ctx, locationId, 'viewer')
      const results = await Promise.all(
        itemIds.map(async (itemId) => {
          const log = await prisma.inventoryLog.findFirst({
            where: { itemId, locationId: scopedLocationId, delta: { gt: 0 } },
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
      // A write needs `participant`, not `viewer`: a viewer may read a location's
      // logs but must not add one.
      const scopedLocationId = await requireLocation(ctx, locationId, 'participant')
      // The item must be an item of the location's household (households H3a,
      // task 3.8). Checked before the write, so a refusal writes nothing.
      await requireLocationItems(ctx, scopedLocationId, [itemId])
      return prisma.inventoryLog.create({
        data: {
          itemId,
          delta,
          quantity,
          occurredAt: new Date(occurredAt),
          // The AUTHOR of the log, not its owner: the log belongs to its
          // location.
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
