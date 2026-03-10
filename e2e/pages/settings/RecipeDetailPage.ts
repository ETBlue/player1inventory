import type { Page, Locator } from '@playwright/test'

export class RecipeDetailPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo(id: string) {
    await this.page.goto(`/settings/recipes/${id}`)
  }

  async navigateToItems(id: string) {
    await this.page.goto(`/settings/recipes/${id}/items`)
  }

  async fillName(name: string) {
    // Name input: label htmlFor="recipe-name" (src/components/recipe/RecipeNameForm/index.tsx:29)
    await this.page.getByLabel('Name').fill(name)
  }

  async clickSave() {
    // Save button in RecipeNameForm (src/components/recipe/RecipeNameForm/index.tsx:38)
    await this.page.getByRole('button', { name: 'Save' }).click()
  }

  getItemCheckbox(name: string): Locator {
    // Unchecked: aria-label="Add {name}" (src/components/item/ItemCard/index.tsx:143)
    return this.page.getByLabel(`Add ${name}`)
  }

  getAssignedItemCheckbox(name: string): Locator {
    // Checked: aria-label="Remove {name}" (src/components/item/ItemCard/index.tsx:143)
    return this.page.getByLabel(`Remove ${name}`)
  }

  async toggleItem(name: string) {
    // Click whichever checkbox state is currently showing
    const addCheckbox = this.page.getByLabel(`Add ${name}`)
    const removeCheckbox = this.page.getByLabel(`Remove ${name}`)
    const isAdd = await addCheckbox.isVisible()
    if (isAdd) {
      await addCheckbox.click()
    } else {
      await removeCheckbox.click()
    }
  }

  async clickIncreaseAmount(name: string) {
    // aria-label="Increase quantity of {name}" (src/components/item/ItemCard/index.tsx:173)
    await this.page.getByRole('button', { name: `Increase quantity of ${name}` }).click()
  }

  async clickDecreaseAmount(name: string) {
    // aria-label="Decrease quantity of {name}" (src/components/item/ItemCard/index.tsx:157)
    await this.page.getByRole('button', { name: `Decrease quantity of ${name}` }).click()
  }

  getAmountDisplay(name: string): Locator {
    // The <span> showing controlAmount between ±buttons, scoped to the item row
    return this.page.getByRole('button', { name: `Decrease quantity of ${name}` })
      .locator('xpath=following-sibling::span[1]')
  }
}
