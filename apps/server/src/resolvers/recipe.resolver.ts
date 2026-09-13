import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { defaultLocationId, mirrorStock } from '../lib/stockDualWrite.js'
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
      const { occurredAt, recipeIds, items } = input
      const occurredAtDate = new Date(occurredAt)

      const itemResults: Array<{ itemId: string; success: boolean; error?: string }> = []

      // DUAL-WRITE, REMOVED IN PR 5 (lib/stockDualWrite.ts). Cooking has no
      // location in PR 2 — `ConsumeRecipesInput` carries none — so the mirror
      // goes to the caller's DEFAULT location regardless of which one they
      // were viewing. PR 3 gives the input a location and this becomes it.
      // Resolved once: every item in the batch mirrors to the same place.
      const mirrorLocationId = items.length > 0 ? await defaultLocationId(userId) : null

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

          // Absolute values, not a delta: the client has already computed the
          // post-cooking quantities, and `Item`'s write above sets the very
          // same two numbers. A failure here lands in this item's
          // `itemResults` entry, exactly as an `Item` write failure does.
          if (mirrorLocationId) {
            await mirrorStock(item.itemId, mirrorLocationId, {
              packedQuantity: item.packedQuantity,
              unpackedQuantity: item.unpackedQuantity,
            })
          }

          await prisma.inventoryLog.create({
            data: {
              itemId: item.itemId,
              delta: item.delta,
              quantity: item.quantity,
              occurredAt: occurredAtDate,
              userId,
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
