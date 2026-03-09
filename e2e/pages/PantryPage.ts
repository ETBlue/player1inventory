import type { Page, Locator } from '@playwright/test'

export class PantryPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/')
  }

  async clickAddItem() {
    // The add-item button uses aria-label="Add item" (src/routes/index.tsx:201)
    await this.page.getByRole('button', { name: 'Add item' }).click()
  }

  async searchFor(name: string) {
    await this.page.getByRole('searchbox').fill(name)
  }

  getItemCard(name: string): Locator {
    // Item cards are rendered as list items containing the item name
    return this.page.getByRole('listitem').filter({ hasText: name })
  }
}
