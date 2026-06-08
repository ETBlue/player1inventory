import type { Page, Locator } from '@playwright/test'

export class ShoppingPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    // networkidle ensures initial GraphQL queries (activeCart, items) have resolved
    // before any interaction, preventing clicks on an uninitialized cart
    await this.page.goto('/shopping', { waitUntil: 'networkidle' })
  }

  async navigateToVendorCart(vendorId: string) {
    // Navigate directly to a vendor's cart page
    // vendorId: use 'no-vendor' for items with no vendor assigned
    await this.page.goto(`/shopping/${vendorId}`, { waitUntil: 'networkidle' })
  }

  getVendorCartCard(vendorName: string): Locator {
    // VendorCartCard renders vendor name as a button
    // (src/routes/shopping/index.tsx: VendorCartCard onClick triggers navigation)
    return this.page.getByRole('button', { name: vendorName })
  }

  async clickVendorCartCard(vendorName: string) {
    await this.getVendorCartCard(vendorName).click()
    await this.page.waitForURL(/\/shopping\/.+/)
  }

  async clickBack() {
    // Back button on vendor cart page: aria-label="Go back"
    await this.page.getByRole('button', { name: 'Go back' }).click()
    await this.page.waitForURL(/\/shopping(\?|$)/)
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
    // Wait for the mutation to complete: checkbox flips to "Remove {name}" once item is in cart
    await this.page.getByLabel(`Remove ${name}`).waitFor({ state: 'visible' })
  }

  async clickDone() {
    // Toolbar "Done" button — visible when cart has items
    // Text: "Done" with Check icon (src/routes/shopping/$vendorId.tsx)
    await this.page.getByRole('button', { name: 'Done' }).click()
  }

  async confirmCheckout() {
    // Checkout dialog title: "Complete shopping trip?"
    // Confirm button text: "Confirm" scoped inside alertdialog
    await this.page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  }
}
