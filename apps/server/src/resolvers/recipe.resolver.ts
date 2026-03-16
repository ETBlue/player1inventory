import { GraphQLError } from 'graphql'
import { RecipeModel } from '../models/Recipe.model.js'
import { requireAuth } from '../context.js'
import type { Resolvers } from '../generated/graphql.js'

export const recipeResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Recipe'> = {
  Query: {
    recipes: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return RecipeModel.find({ userId })
    },
    recipe: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      return RecipeModel.findOne({ _id: id, userId })
    },
  },
  Mutation: {
    createRecipe: async (_, { name, items }, ctx) => {
      const userId = requireAuth(ctx)
      return RecipeModel.create({ name, items: items ?? [], userId })
    },
    updateRecipe: async (_, { id, name, items }, ctx) => {
      const userId = requireAuth(ctx)
      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name
      if (items !== undefined) updates.items = items
      const recipe = await RecipeModel.findOneAndUpdate(
        { _id: id, userId },
        { $set: updates },
        { new: true },
      )
      if (!recipe) throw new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } })
      return recipe
    },
    updateRecipeLastCookedAt: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      const recipe = await RecipeModel.findOneAndUpdate(
        { _id: id, userId },
        { $set: { lastCookedAt: new Date() } },
        { new: true },
      )
      if (!recipe) throw new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } })
      return recipe
    },
    deleteRecipe: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      // No outward cascade — items do not reference recipes by ID
      const result = await RecipeModel.deleteOne({ _id: id, userId })
      return result.deletedCount > 0
    },
  },
  Recipe: {
    id: (recipe) => (recipe as unknown as { _id: { toString(): string } })._id.toString(),
    lastCookedAt: (recipe) =>
      recipe.lastCookedAt ? (recipe.lastCookedAt as unknown as Date).toISOString() : null,
  },
}
