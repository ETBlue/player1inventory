import type { Page, Locator } from '@playwright/test'

export class ShoppingPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/shopping')
  }

  getItemCard(name: string): Locator {
    // ItemCard renders item name as <h3> (same pattern as PantryPage)
    return this.page.getByRole('heading', { name, level: 3 })
  }

  getItemCheckbox(name: string): Locator {
    // Checkbox aria-label is "Add {name}" when unchecked (pending section)
    // (src/components/item/ItemCard/index.tsx: aria-label computed from isChecked)
    return this.page.getByLabel(`Add ${name}`)
  }

  async addItemToCart(name: string) {
    await this.getItemCheckbox(name).click()
  }

  async clickDone() {
    // Toolbar "Done" button — visible when cart has items
    // Text: "Done" with Check icon (src/routes/shopping.tsx)
    await this.page.getByRole('button', { name: 'Done' }).click()
  }

  async confirmCheckout() {
    // Checkout dialog title: "Complete shopping trip?"
    // Confirm button text: "Done" scoped inside alertdialog
    await this.page.getByRole('alertdialog').getByRole('button', { name: 'Done' }).click()
  }
}
