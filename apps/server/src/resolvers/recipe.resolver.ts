import { GraphQLError } from 'graphql'
import { prisma } from '../lib/prisma.js'
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
