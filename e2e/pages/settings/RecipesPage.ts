import type { Page, Locator } from '@playwright/test'

export class RecipesPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    // /settings/recipes uses parent layout route src/routes/settings/recipes.tsx
    await this.page.goto('/settings/recipes')
  }

  async clickNewRecipe() {
    // "New Recipe" button in toolbar (src/routes/settings/recipes/index.tsx:33)
    await this.page.getByRole('button', { name: /new recipe/i }).click()
  }

  async fillRecipeName(name: string) {
    // Name input: label htmlFor="recipe-name" (src/components/recipe/RecipeNameForm/index.tsx:29)
    await this.page.getByLabel('Name').fill(name)
  }

  async clickSave() {
    // Save button in RecipeNameForm (src/components/recipe/RecipeNameForm/index.tsx:38)
    await this.page.getByRole('button', { name: 'Save' }).click()
  }

  getRecipeCard(name: string): Locator {
    // RecipeCard link text (src/components/recipe/RecipeCard/index.tsx:19)
    return this.page.getByRole('link', { name })
  }

  async clickDeleteRecipe(name: string) {
    // buttonAriaLabel='Delete "${recipe.name}"' on trash DeleteButton (src/components/recipe/RecipeCard/index.tsx:38)
    await this.page.getByRole('button', { name: `Delete "${name}"` }).click()
  }

  async confirmDelete() {
    // AlertDialog confirm — DeleteButton confirmLabel defaults to 'Delete'
    // Scope to alertdialog to avoid strict-mode conflict with the trigger button
    await this.page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  }
}
