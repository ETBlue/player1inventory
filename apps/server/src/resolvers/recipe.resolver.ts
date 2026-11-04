import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import {
  requireCatalogIds,
  requireCatalogRole,
  requireHousehold,
  requireLocationItems,
  requireLocationRole,
} from '../lib/authz.js'
import { prisma } from '../lib/prisma.js'
import { writeStock } from '../lib/itemStockWrite.js'
import { requireAuth } from '../context.js'
import type { Recipe, Resolvers } from '../generated/graphql.js'

// ── Household scope (households H3a, task 3.7) ──
//
// Reading recipes needs household role `member`; creating, editing and
// deleting one needs `manager` (design, *Household roles*), through
// `requireCatalogRole` (lib/authz.ts). Reads are filtered by the household.
//
// Marking a recipe as cooked is NOT a catalog edit. `updateRecipeLastCookedAt`
// and the `lastCookedAt` write in `consumeRecipes` record that someone
// cooked, which is a location right (design, *Location roles*: participants
// "edit pantry, shopping, cooking"). So they need only `member`. Asking for
// `manager` there would stop a member who may cook from cooking.
export const recipeResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Recipe'> = {
  Query: {
    recipes: async (_, __, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'member')
      const recipes = await prisma.recipe.findMany({
        where: { householdId },
        include: { items: true },
      })
      return recipes as unknown as Recipe[]
    },
    recipe: async (_, { id }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'member')
      const recipe = await prisma.recipe.findFirst({
        where: { id, householdId },
        include: { items: true },
      })
      return recipe as unknown as Recipe | null
    },
  },
  Mutation: {
    createRecipe: async (_, { name, items }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireCatalogRole(ctx, 'manager')
      // Issue #273: every item the recipe names must be the household's.
      // Checked BEFORE the recipe is created, so a refused call writes nothing.
      await requireCatalogIds(ctx, householdId, 'item', (items ?? []).map((i) => i.itemId))
      // `userId` is still written until task 3.14 drops the column.
      const recipe = await prisma.recipe.create({ data: { name, householdId, userId } })
      if (items?.length) {
        await prisma.recipeItem.createMany({
          data: items.map(i => ({ recipeId: recipe.id, itemId: i.itemId, defaultAmount: i.defaultAmount })),
        })
      }
      return prisma.recipe.findUniqueOrThrow({ where: { id: recipe.id }, include: { items: true } }) as unknown as Promise<Recipe>
    },
    updateRecipe: async (_, { id, name, items }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'manager')
      const existing = await prisma.recipe.findFirst({ where: { id, householdId } })
      if (!existing) throw new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } })
      // Issue #273: checked BEFORE any write, so a refused call changes nothing.
      await requireCatalogIds(ctx, householdId, 'item', (items ?? []).map((i) => i.itemId))
      const data: { name?: string } = {}
      if (name != null) data.name = name
      await prisma.recipe.update({ where: { id }, data })
      if (items != null) {
        await prisma.recipeItem.deleteMany({ where: { recipeId: id } })
        if (items.length) {
          await prisma.recipeItem.createMany({
            data: items.map(i => ({ recipeId: id, itemId: i.itemId, defaultAmount: i.defaultAmount })),
          })
        }
      }
      return prisma.recipe.findUniqueOrThrow({ where: { id }, include: { items: true } }) as unknown as Promise<Recipe>
    },
    updateRecipeLastCookedAt: async (_, { id }, ctx) => {
      // `member`, not `manager`: see the comment at the top of this file.
      const householdId = await requireCatalogRole(ctx, 'member')
      const existing = await prisma.recipe.findFirst({ where: { id, householdId } })
      if (!existing) throw new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } })
      return prisma.recipe.update({
        where: { id },
        data: { lastCookedAt: new Date() },
        include: { items: true },
      }) as unknown as Promise<Recipe>
    },
    consumeRecipes: async (_, { input }, ctx) => {
      const userId = requireAuth(ctx)
      const { occurredAt, recipeIds, items, locationId: consumeLocationId } = input
      const occurredAtDate = new Date(occurredAt)

      const itemResults: Array<{ itemId: string; success: boolean; error?: string }> = []

      // `consumeLocationId` is the location the cook names. It used to be the
      // caller's DEFAULT location, because `ConsumeRecipesInput` carried no
      // location at all — so cooking while viewing the Garage took the stock
      // out of the Kitchen. Task 3 added the field; Task 4 made it REQUIRED and
      // removed the default-location fallback.

      // `participant`, not `viewer`: this mutation writes stock and log rows there.
      // The id arrives from the client, so it goes through the one
      // authorization seam (lib/authz.ts) before any query sees it. This throws
      // out of the WHOLE mutation rather than landing in one item's
      // `itemResults` entry — a caller who may not write this location has not
      // partly succeeded.
      await requireLocationRole(ctx, consumeLocationId, 'participant')
      // Every item cooked must be an item of the cook location's household
      // (households H3a, task 3.8). Like the role check above, a refusal
      // throws out of the WHOLE mutation before the first write, rather than
      // landing in one item's `itemResults` entry: a request that names
      // another household's item is not a partial success.
      await requireLocationItems(
        ctx,
        consumeLocationId,
        items.map((item) => item.itemId),
      )
      // Only the household's recipes are marked as cooked, below. Read here,
      // before any write. `requireHousehold` is the `member` check: see the
      // comment at the top of this file.
      const householdId = await requireHousehold(ctx)

      for (const item of items) {
        try {
          // The cook location's own stock row, and since PR 5 the ONLY place
          // the cook is recorded — `Item`'s five stock columns are gone, and
          // with them the `prisma.item.updateMany` that used to run here first.
          //
          // Absolute values, not a delta: the client has already computed the
          // post-cooking quantities. A failure here lands in this item's
          // `itemResults` entry and leaves the other items alone.
          await writeStock(item.itemId, consumeLocationId, {
            packedQuantity: item.packedQuantity,
            unpackedQuantity: item.unpackedQuantity,
          })

          await prisma.inventoryLog.create({
            data: {
              itemId: item.itemId,
              delta: item.delta,
              quantity: item.quantity,
              occurredAt: occurredAtDate,
              userId,
              // The cook's own location, the same one the stock write above
              // used. A log row and the stock move it explains must never name
              // different locations.
              locationId: consumeLocationId,
              ...(item.note ? { note: item.note } : {}),
              ...(item.logKey ? { logKey: item.logKey } : {}),
              ...(item.logParams ? { logParams: item.logParams as Prisma.InputJsonValue } : {}),
            },
          })
          itemResults.push({ itemId: item.itemId, success: true })
        } catch (err) {
          itemResults.push({ itemId: item.itemId, success: false, error: String(err) })
        }
      }

      for (const recipeId of recipeIds) {
        try {
          await prisma.recipe.updateMany({
            where: { id: recipeId, householdId },
            data: { lastCookedAt: new Date() },
          })
        } catch {
          // best-effort — ignore
        }
      }

      return {
        itemResults,
        allSucceeded: itemResults.every((r) => r.success),
      }
    },
    deleteRecipe: async (_, { id }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'manager')
      const existing = await prisma.recipe.findFirst({ where: { id, householdId } })
      if (!existing) return false
      // RecipeItem rows cascade-delete via DB constraint
      await prisma.recipe.delete({ where: { id } })
      return true
    },
  },
  Recipe: {
    lastCookedAt: (recipe) => {
      const d = (recipe as unknown as { lastCookedAt: Date | null }).lastCookedAt
      return d != null ? d.toISOString() : null
    },
    // Map Prisma RecipeItem[] (junction rows) to GraphQL RecipeItem[] shape
    items: (recipe) => {
      const r = recipe as unknown as { items: { itemId: string; defaultAmount: number }[] }
      return r.items?.map(i => ({ itemId: i.itemId, defaultAmount: i.defaultAmount })) ?? []
    },
  },
}
