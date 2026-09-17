import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import { requireLocationRole } from '../lib/authz.js'
import { ensureDefaultLocation } from '../lib/defaultLocation.js'
import { prisma } from '../lib/prisma.js'
import { mirrorStock } from '../lib/stockDualWrite.js'
import { requireAuth } from '../context.js'
import type { Recipe, Resolvers } from '../generated/graphql.js'

export const recipeResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Recipe'> = {
  Query: {
    recipes: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const recipes = await prisma.recipe.findMany({
        where: { userId },
        include: { items: true },
      })
      return recipes as unknown as Recipe[]
    },
    recipe: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      const recipe = await prisma.recipe.findFirst({
        where: { id, userId },
        include: { items: true },
      })
      return recipe as unknown as Recipe | null
    },
  },
  Mutation: {
    createRecipe: async (_, { name, items }, ctx) => {
      const userId = requireAuth(ctx)
      const recipe = await prisma.recipe.create({ data: { name, userId } })
      if (items?.length) {
        await prisma.recipeItem.createMany({
          data: items.map(i => ({ recipeId: recipe.id, itemId: i.itemId, defaultAmount: i.defaultAmount })),
        })
      }
      return prisma.recipe.findUniqueOrThrow({ where: { id: recipe.id }, include: { items: true } }) as unknown as Promise<Recipe>
    },
    updateRecipe: async (_, { id, name, items }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.recipe.findFirst({ where: { id, userId } })
      if (!existing) throw new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } })
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
      const userId = requireAuth(ctx)
      const existing = await prisma.recipe.findFirst({ where: { id, userId } })
      if (!existing) throw new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } })
      return prisma.recipe.update({
        where: { id },
        data: { lastCookedAt: new Date() },
        include: { items: true },
      }) as unknown as Promise<Recipe>
    },
    consumeRecipes: async (_, { input }, ctx) => {
      const userId = requireAuth(ctx)
      const { occurredAt, recipeIds, items, locationId = null } = input
      const occurredAtDate = new Date(occurredAt)

      const itemResults: Array<{ itemId: string; success: boolean; error?: string }> = []

      // The location the cook names, since PR 3b Task 3. It used to be the
      // caller's DEFAULT location, because `ConsumeRecipesInput` carried no
      // location at all — so cooking while viewing the Garage took the stock
      // out of the Kitchen. Task 3 added the field.
      //
      // `locationId` is nullable for one PR-3b task only — see the doc string
      // on this field in src/schema/recipe.graphql. Task 4 passes the active
      // location from the web client and tightens the schema to `ID!`.
      const consumeLocationId = locationId ?? (await ensureDefaultLocation(userId))

      // `member`, not `viewer`: this mutation writes stock and log rows there.
      // The id arrives from the client, so it goes through the one
      // authorization seam (lib/authz.ts) before any query sees it. This throws
      // out of the WHOLE mutation rather than landing in one item's
      // `itemResults` entry — a caller who may not write this location has not
      // partly succeeded.
      await requireLocationRole(ctx, consumeLocationId, 'member')

      for (const item of items) {
        try {
          await prisma.item.updateMany({
            where: { id: item.itemId, userId },
            data: {
              packedQuantity: item.packedQuantity,
              unpackedQuantity: item.unpackedQuantity,
              updatedAt: occurredAtDate,
            },
          })

          // DUAL-WRITE, REMOVED IN PR 5 (lib/stockDualWrite.ts).
          // Absolute values, not a delta: the client has already computed the
          // post-cooking quantities, and `Item`'s write above sets the very
          // same two numbers. A failure here lands in this item's
          // `itemResults` entry, exactly as an `Item` write failure does.
          await mirrorStock(item.itemId, consumeLocationId, {
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
              // The cook's own location, the same one the stock mirror above
              // wrote. A log row and the stock move it explains must never name
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
            where: { id: recipeId, userId },
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
      const userId = requireAuth(ctx)
      const existing = await prisma.recipe.findFirst({ where: { id, userId } })
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
