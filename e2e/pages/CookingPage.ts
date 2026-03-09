import type { Page } from '@playwright/test'

export class CookingPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/cooking')
  }

  async checkRecipe(name: string) {
    // Recipe-level checkbox: aria-label={recipe.name} (src/routes/cooking.tsx:438)
    await this.page.getByLabel(name).click()
  }

  async expandRecipe(name: string) {
    // Expand/collapse chevron: aria-label=`Expand ${recipe.name}` (src/routes/cooking.tsx:456)
    await this.page.getByLabel(`Expand ${name}`).click()
  }

  async uncheckItem(name: string) {
    // Per-item checkbox when item is checked: aria-label=`Remove ${item.name}` (src/components/item/ItemCard/index.tsx:143)
    await this.page.getByLabel(`Remove ${name}`).click()
  }

  async increaseServings() {
    // Serving stepper + button: aria-label="Increase servings" (src/routes/cooking.tsx:489)
    await this.page.getByLabel('Increase servings').click()
  }

  async clickDone() {
    // Done button in toolbar — always visible, disabled when nothing checked (src/routes/cooking.tsx)
    await this.page.getByRole('button', { name: 'Done' }).click()
  }

  async confirmDone() {
    // Done confirmation dialog title: "Consume from N recipe(s)?" — confirm button: "Confirm"
    // (src/routes/cooking.tsx:601)
    await this.page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  }
}
