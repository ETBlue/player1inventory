import { GraphQLError } from 'graphql'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Resolvers, Shelf } from '../generated/graphql.js'

export const shelfResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    shelves: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.shelf.findMany({
        where: { userId },
        orderBy: { order: 'asc' },
      }) as unknown as Promise<Shelf[]>
    },
    shelf: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      const shelf = await prisma.shelf.findFirst({ where: { id, userId } })
      return shelf as unknown as Shelf | null
    },
  },
  Mutation: {
    createShelf: async (_, { name, type, sortBy, sortDir, filterConfig, itemIds }, ctx) => {
      const userId = requireAuth(ctx)
      const count = await prisma.shelf.count({ where: { userId } })
      return prisma.shelf.create({
        data: {
          name,
          type,
          order: count + 1,
          sortBy: sortBy ?? undefined,
          sortDir: sortDir ?? undefined,
          filterConfig: filterConfig ?? undefined,
          itemIds: itemIds ?? [],
          userId,
        },
      }) as unknown as Promise<Shelf>
    },
    updateShelf: async (_, { id, name, type, order, sortBy, sortDir, filterConfig, itemIds }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.shelf.findFirst({ where: { id, userId } })
      if (!existing) throw new GraphQLError('Shelf not found', { extensions: { code: 'NOT_FOUND' } })
      const data: Record<string, unknown> = {}
      if (name != null) data.name = name
      if (type != null) data.type = type
      if (order != null) data.order = order
      if (sortBy !== undefined) data.sortBy = sortBy
      if (sortDir !== undefined) data.sortDir = sortDir
      if (filterConfig != null) data.filterConfig = filterConfig
      if (itemIds != null) data.itemIds = itemIds
      return prisma.shelf.update({ where: { id }, data }) as unknown as Promise<Shelf>
    },
    deleteShelf: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.shelf.findFirst({ where: { id, userId } })
      if (!existing) return false
      await prisma.shelf.delete({ where: { id } })
      return true
    },
    reorderShelves: async (_, { orderedIds }, ctx) => {
      const userId = requireAuth(ctx)
      await Promise.all(
        orderedIds.map((shelfId, index) =>
          prisma.shelf.updateMany({
            where: { id: shelfId, userId },
            data: { order: index },
          })
        )
      )
      return true
    },
    reorderShelfItems: async (_, { shelfId, orderedItemIds }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.shelf.findFirst({ where: { id: shelfId, userId } })
      if (!existing) throw new GraphQLError('Shelf not found', { extensions: { code: 'NOT_FOUND' } })
      await prisma.shelf.update({
        where: { id: shelfId },
        data: { itemIds: orderedItemIds },
      })
      return true
    },
  },
}
