import { InventoryLogModel } from '../models/InventoryLog.model.js'
import { requireAuth } from '../context.js'
import type { Resolvers } from '../generated/graphql.js'

export const inventoryLogResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'InventoryLog'> = {
  Query: {
    itemLogs: async (_, { itemId }, ctx) => {
      const userId = requireAuth(ctx)
      const logs = await InventoryLogModel.find({ itemId, userId }).sort({ occurredAt: 1 })
      return logs.map(l => ({ ...l.toObject(), id: l._id.toString() }))
    },

    inventoryLogCountByItem: async (_, { itemId }, ctx) => {
      const userId = requireAuth(ctx)
      return InventoryLogModel.countDocuments({ itemId, userId })
    },

    inventoryLogs: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const logs = await InventoryLogModel.find({ userId }).sort({ occurredAt: 1 })
      return logs.map(l => ({ ...l.toObject(), id: l._id.toString() }))
    },

    lastPurchaseDates: async (_, { itemIds }, ctx) => {
      const userId = requireAuth(ctx)
      const results = await Promise.all(
        itemIds.map(async (itemId) => {
          const log = await InventoryLogModel.findOne(
            { itemId, userId, delta: { $gt: 0 } },
            null,
            { sort: { occurredAt: -1 } },
          )
          return { itemId, date: log ? log.occurredAt.toISOString() : null }
        }),
      )
      return results
    },
  },

  Mutation: {
    addInventoryLog: async (_, { itemId, delta, quantity, occurredAt, note }, ctx) => {
      const userId = requireAuth(ctx)
      const log = await InventoryLogModel.create({
        itemId,
        delta,
        quantity,
        occurredAt: new Date(occurredAt),
        userId,
        ...(note ? { note } : {}),
      })
      return { ...log.toObject(), id: log._id.toString() }
    },
  },

  InventoryLog: {
    id: (log) => (log as unknown as { _id: { toString(): string } })._id.toString(),
    occurredAt: (log) => (log as unknown as { occurredAt: Date }).occurredAt.toISOString(),
  },
}
