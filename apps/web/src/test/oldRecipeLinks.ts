import { db } from '@/db'
import type { Recipe, RecipeItem } from '@/types'

/**
 * Write a recipe straight to Dexie, with no check.
 *
 * Only consumable items can be in a recipe (owner decision 2026-11-26), so
 * `createRecipe` and `updateRecipe` refuse a non-consumable item. Data saved
 * before that rule may still hold such a link ("an old link"). Tests and
 * stories that show how the app treats one use this to make it.
 *
 * Never use it for a recipe a normal write could make: use `createRecipe`.
 */
export async function addRecipeWithOldLinks(input: {
  name: string
  items: RecipeItem[]
}): Promise<Recipe> {
  const now = new Date()
  const recipe: Recipe = {
    id: crypto.randomUUID(),
    name: input.name,
    items: input.items,
    createdAt: now,
    updatedAt: now,
  }
  await db.recipes.add(recipe)
  return recipe
}
