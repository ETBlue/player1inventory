import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import { requireCatalogIds, requireCatalogRole } from '../lib/authz.js'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type Context } from '../context.js'
import type { FilterConfigInput, Resolvers, Shelf } from '../generated/graphql.js'
import { toGraphQL as itemToGraphQL } from './item.resolver.js'

// ── Household scope (households H3a, task 3.7) ──
//
// Reading shelves needs household role `member`; every write needs `manager`
// (design, *Household roles*), through `requireCatalogRole` (lib/authz.ts).
// Every read and every `updateMany` is filtered by the household.

/**
 * A shelf's `itemIds` and the ids inside its `filterConfig` must be the
 * household's. Another household's id is refused with FORBIDDEN
 * (`requireCatalogIds`). Found by `fix/catalog-write-scope`; issue #273 did
 * not list it.
 *
 * An id NO row holds is let through (`missing: 'allow'`). These are plain
 * arrays, not foreign keys, and nothing removes an id from them when its row
 * is deleted. So a shelf the client saves may still name a deleted item, and
 * refusing it would refuse the user's own edit. That is also what the shelf
 * did before.
 */
async function requireShelfIds(
  ctx: Context,
  householdId: string,
  itemIds: readonly string[] | null | undefined,
  filterConfig: FilterConfigInput | null | undefined,
): Promise<void> {
  const allow = { missing: 'allow' } as const
  await requireCatalogIds(ctx, householdId, 'item', itemIds ?? [], allow)
  await requireCatalogIds(ctx, householdId, 'tag', filterConfig?.tagIds ?? [], allow)
  await requireCatalogIds(ctx, householdId, 'vendor', filterConfig?.vendorIds ?? [], allow)
  await requireCatalogIds(ctx, householdId, 'recipe', filterConfig?.recipeIds ?? [], allow)
}

export const shelfResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    shelves: async (_, __, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'member')
      return prisma.shelf.findMany({
        where: { householdId },
        orderBy: { order: 'asc' },
      }) as unknown as Promise<Shelf[]>
    },
    shelf: async (_, { id }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'member')
      const shelf = await prisma.shelf.findFirst({ where: { id, householdId } })
      return shelf as unknown as Shelf | null
    },
  },
  Mutation: {
    createShelf: async (_, { name, type, filterConfig, itemIds }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireCatalogRole(ctx, 'manager')
      await requireShelfIds(ctx, householdId, itemIds, filterConfig)
      const count = await prisma.shelf.count({ where: { householdId } })
      return prisma.shelf.create({
        data: {
          name,
          type,
          order: count + 1,
          filterConfig: filterConfig ?? undefined,
          itemIds: itemIds ?? [],
          householdId,
          // Still written until task 3.14 drops the column.
          userId,
        },
      }) as unknown as Promise<Shelf>
    },
    updateShelf: async (_, { id, name, type, order, filterConfig, itemIds }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'manager')
      const existing = await prisma.shelf.findFirst({ where: { id, householdId } })
      if (!existing) throw new GraphQLError('Shelf not found', { extensions: { code: 'NOT_FOUND' } })
      // Checked BEFORE the write, so a refused call changes nothing.
      await requireShelfIds(ctx, householdId, itemIds, filterConfig)
      const data: Record<string, unknown> = {}
      if (name != null) data.name = name
      if (type != null) data.type = type
      if (order != null) data.order = order
      if (filterConfig != null) data.filterConfig = filterConfig
      if (itemIds != null) data.itemIds = itemIds
      return prisma.shelf.update({ where: { id }, data }) as unknown as Promise<Shelf>
    },
    deleteShelf: async (_, { id }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'manager')
      const existing = await prisma.shelf.findFirst({ where: { id, householdId } })
      if (!existing) return false
      await prisma.shelf.delete({ where: { id } })
      return true
    },
    reorderShelves: async (_, { orderedIds }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'manager')
      await Promise.all(
        orderedIds.map((shelfId, index) =>
          prisma.shelf.updateMany({
            where: { id: shelfId, householdId },
            data: { order: index },
          })
        )
      )
      return true
    },
    reorderShelfItems: async (_, { shelfId, orderedItemIds }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'manager')
      const existing = await prisma.shelf.findFirst({ where: { id: shelfId, householdId } })
      if (!existing) throw new GraphQLError('Shelf not found', { extensions: { code: 'NOT_FOUND' } })
      // The same check as `itemIds` in `updateShelf`: this writes that column.
      await requireShelfIds(ctx, householdId, orderedItemIds, null)
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
      const householdId = await requireCatalogRole(ctx, 'manager')
      const { itemId, addTagIds, addVendorIds, addRecipeId } = input

      // Issue #273: every tag, vendor and recipe this adds must be the
      // household's. Checked BEFORE the transaction, so a refused call writes
      // nothing. Tags and vendors are foreign keys, so an id no row holds is
      // refused too (BAD_USER_INPUT) instead of failing inside the
      // transaction. A recipe no row holds is let through here, so it keeps
      // the NOT_FOUND the transaction below has always given it.
      await requireCatalogIds(ctx, householdId, 'tag', addTagIds)
      await requireCatalogIds(ctx, householdId, 'vendor', addVendorIds)
      if (addRecipeId) {
        await requireCatalogIds(ctx, householdId, 'recipe', [addRecipeId], { missing: 'allow' })
      }

      const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const item = await tx.item.findFirst({
          where: { id: itemId, householdId },
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

        // Guard each axis on its OWN `addXIds.length`, not on whether the
        // union changed anything — a recipe-only pick (both arrays empty)
        // must issue no itemTag/itemVendor writes at all. Rewriting every row
        // unconditionally would race a concurrent plain `updateItem` on the
        // same item under Postgres READ COMMITTED: two writers deleting then
        // recreating the same composite-key rows can deadlock into a
        // duplicate-key abort, or silently drop whichever writer's rows lose
        // the race. The read-then-union above is unchanged — this only skips
        // the delete+recreate when this axis added nothing.
        if (addTagIds.length) {
          await tx.itemTag.deleteMany({ where: { itemId } })
          if (tagIds.length) {
            await tx.itemTag.createMany({ data: tagIds.map((tagId) => ({ itemId, tagId })) })
          }
        }

        if (addVendorIds.length) {
          await tx.itemVendor.deleteMany({ where: { itemId } })
          if (vendorIds.length) {
            await tx.itemVendor.createMany({ data: vendorIds.map((vendorId) => ({ itemId, vendorId })) })
          }
        }

        if (addRecipeId) {
          const recipe = await tx.recipe.findFirst({
            where: { id: addRecipeId, householdId },
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
