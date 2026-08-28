import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Resolvers, Shelf } from '../generated/graphql.js'
import { toGraphQL as itemToGraphQL } from './item.resolver.js'

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
    createShelf: async (_, { name, type, filterConfig, itemIds }, ctx) => {
      const userId = requireAuth(ctx)
      const count = await prisma.shelf.count({ where: { userId } })
      return prisma.shelf.create({
        data: {
          name,
          type,
          order: count + 1,
          filterConfig: filterConfig ?? undefined,
          itemIds: itemIds ?? [],
          userId,
        },
      }) as unknown as Promise<Shelf>
    },
    updateShelf: async (_, { id, name, type, order, filterConfig, itemIds }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.shelf.findFirst({ where: { id, userId } })
      if (!existing) throw new GraphQLError('Shelf not found', { extensions: { code: 'NOT_FOUND' } })
      const data: Record<string, unknown> = {}
      if (name != null) data.name = name
      if (type != null) data.type = type
      if (order != null) data.order = order
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
    // Joins an item to a filter shelf's picks: adds tag/vendor ids onto the
    // Item and (optionally) membership onto a Recipe, in one DB transaction —
    // the cloud counterpart to local mode's applyShelfFilterPicksBatch
    // (apps/web/src/db/operations.ts). Wrapped in prisma.$transaction so a
    // failing recipe write rolls back the tag/vendor writes rather than
    // leaving the item half-updated.
    applyShelfFilterPicks: async (_, { input }, ctx) => {
      const userId = requireAuth(ctx)
      const { itemId, addTagIds, addVendorIds, addRecipeId } = input

      const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const item = await tx.item.findFirst({
          where: { id: itemId, userId },
          include: { tags: true, vendors: true },
        })
        if (!item) {
          throw new GraphQLError('Item not found', { extensions: { code: 'NOT_FOUND' } })
        }

        // Read-then-union, not client-supplied merge — mirrors
        // applyShelfFilterPicksBatch's idempotency so a duplicate call
        // (e.g. two quick presses) cannot duplicate an id.
        const tagIds = [...new Set([...item.tags.map((t) => t.tagId), ...addTagIds])]
        const vendorIds = [...new Set([...item.vendors.map((v) => v.vendorId), ...addVendorIds])]

        await tx.itemTag.deleteMany({ where: { itemId } })
        if (tagIds.length) {
          await tx.itemTag.createMany({ data: tagIds.map((tagId) => ({ itemId, tagId })) })
        }

        await tx.itemVendor.deleteMany({ where: { itemId } })
        if (vendorIds.length) {
          await tx.itemVendor.createMany({ data: vendorIds.map((vendorId) => ({ itemId, vendorId })) })
        }

        if (addRecipeId) {
          const recipe = await tx.recipe.findFirst({
            where: { id: addRecipeId, userId },
            include: { items: true },
          })
          if (!recipe) {
            throw new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } })
          }
          const alreadyHasItem = recipe.items.some((ri) => ri.itemId === itemId)
          if (!alreadyHasItem) {
            await tx.recipeItem.create({
              data: {
                recipeId: addRecipeId,
                itemId,
                // `|| 1`, NOT `?? 1`: consumeAmount 0 is legitimate, and
                // defaultAmount 0 means "optional, unchecked" in cooking —
                // same operator and rationale as applyShelfFilterPicksBatch.
                defaultAmount: item.consumeAmount || 1,
              },
            })
          }
        }

        return tx.item.findUniqueOrThrow({
          where: { id: itemId },
          include: { tags: true, vendors: true },
        })
      })

      return itemToGraphQL(updated)
    },
  },
}
