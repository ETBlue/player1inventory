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
    // ItemCard renders as a <div> (via Card component, src/components/ui/card.tsx)
    // The item name is in an <h3> with capitalize CSS (src/components/item/ItemCard/index.tsx:192)
    // Match the heading element which is unique per item
    return this.page.getByRole('heading', { name, level: 3 })
  }
}
