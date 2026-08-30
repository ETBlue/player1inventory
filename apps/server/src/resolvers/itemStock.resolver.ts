import { requireAuth } from '../context.js'
import { requireLocationRole } from '../lib/authz.js'
import { prisma } from '../lib/prisma.js'
import type { ItemStock, Resolvers } from '../generated/graphql.js'

// The five state fields, all optional on input. A key absent from `input` is
// left untouched on an existing row — this is a merge, not a replace.
type StockInput = {
  targetQuantity?: number | null
  refillThreshold?: number | null
  packedQuantity?: number | null
  unpackedQuantity?: number | null
  dueDate?: string | null
}

function toData(input: StockInput): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (input.targetQuantity != null) data.targetQuantity = input.targetQuantity
  if (input.refillThreshold != null) data.refillThreshold = input.refillThreshold
  if (input.packedQuantity != null) data.packedQuantity = input.packedQuantity
  if (input.unpackedQuantity != null) data.unpackedQuantity = input.unpackedQuantity
  if ('dueDate' in input) data.dueDate = input.dueDate ? new Date(input.dueDate) : null
  return data
}

export const itemStockResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    itemStocks: async (_, { locationId }, ctx) => {
      await requireLocationRole(ctx, locationId, 'viewer')
      return prisma.itemStock.findMany({ where: { locationId } }) as unknown as Promise<ItemStock[]>
    },

    itemStocksForItem: async (_, { itemId }, ctx) => {
      const userId = requireAuth(ctx)
      // Scoped THROUGH the location — ItemStock has no userId of its own.
      return prisma.itemStock.findMany({
        where: { itemId, location: { userId } },
      }) as unknown as Promise<ItemStock[]>
    },
  },

  Mutation: {
    upsertItemStock: async (_, { itemId, locationId, input }, ctx) => {
      await requireLocationRole(ctx, locationId, 'member')
      const data = toData(input as StockInput)
      const existing = await prisma.itemStock.findUnique({
        where: { itemId_locationId: { itemId, locationId } },
      })
      if (existing) {
        return prisma.itemStock.update({
          where: { itemId_locationId: { itemId, locationId } },
          data,
        }) as unknown as Promise<ItemStock>
      }
      return prisma.itemStock.create({
        data: {
          itemId,
          locationId,
          targetQuantity: 0,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          dueDate: null,
          ...data,
        },
      }) as unknown as Promise<ItemStock>
    },

    // Copy-on-add, matching local `addItemToLocation` (db/operations.ts:152).
    // Since the v16 split there is nothing to copy for units, packaging,
    // expiration mode or consume amount — those are global Item fields the new
    // location shares automatically. Only targetQuantity, refillThreshold and
    // dueDate are inherited; on-hand quantities always start at 0.
    addItemToLocation: async (_, { itemId, locationId, sourceLocationId }, ctx) => {
      const userId = requireAuth(ctx)
      await requireLocationRole(ctx, locationId, 'member')

      const existing = await prisma.itemStock.findUnique({
        where: { itemId_locationId: { itemId, locationId } },
      })
      if (existing) return existing as unknown as ItemStock

      const all = await prisma.itemStock.findMany({ where: { itemId, location: { userId } } })
      const source =
        (sourceLocationId ? all.find((s) => s.locationId === sourceLocationId) : undefined) ??
        [...all].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]

      return prisma.itemStock.create({
        data: {
          itemId,
          locationId,
          targetQuantity: source?.targetQuantity ?? 0,
          refillThreshold: source?.refillThreshold ?? 0,
          dueDate: source?.dueDate ?? null,
          packedQuantity: 0,
          unpackedQuantity: 0,
        },
      }) as unknown as Promise<ItemStock>
    },

    removeItemFromLocation: async (_, { itemId, locationId }, ctx) => {
      await requireLocationRole(ctx, locationId, 'member')
      // Only the stock row here. The global Item survives — an item removed
      // from its last location becomes an orphan: absent from the pantry but
      // still in the catalog, so it can be re-added. The location's inventory
      // logs and cart entries cascade in PR 3, when they gain a locationId.
      await prisma.itemStock.deleteMany({ where: { itemId, locationId } })
      return true
    },
  },
}
