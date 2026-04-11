import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { InventoryLog, Resolvers } from '../generated/graphql.js'

export const inventoryLogResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'InventoryLog'> = {
  Query: {
    itemLogs: async (_, { itemId }, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.inventoryLog.findMany({
        where: { itemId, userId },
        orderBy: { occurredAt: 'asc' },
      }) as unknown as Promise<InventoryLog[]>
    },

    inventoryLogCountByItem: async (_, { itemId }, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.inventoryLog.count({ where: { itemId, userId } })
    },

    inventoryLogs: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.inventoryLog.findMany({
        where: { userId },
        orderBy: { occurredAt: 'asc' },
      }) as unknown as Promise<InventoryLog[]>
    },

    lastPurchaseDates: async (_, { itemIds }, ctx) => {
      const userId = requireAuth(ctx)
      const results = await Promise.all(
        itemIds.map(async (itemId) => {
          const log = await prisma.inventoryLog.findFirst({
            where: { itemId, userId, delta: { gt: 0 } },
            orderBy: { occurredAt: 'desc' },
          })
          return { itemId, date: log?.occurredAt?.toISOString() ?? null }
        }),
      )
      return results
    },
  },

  Mutation: {
    addInventoryLog: async (_, { itemId, delta, quantity, occurredAt, note }, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.inventoryLog.create({
        data: {
          itemId,
          delta,
          quantity,
          occurredAt: new Date(occurredAt),
          userId,
          ...(note ? { note } : {}),
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
