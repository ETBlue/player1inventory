import type { Page, Locator } from '@playwright/test'

export class ShoppingPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    // networkidle ensures initial GraphQL queries (allCarts, items) have resolved
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

  getNotStockedHereDivider(): Locator {
    // ListSectionDivider carrying t('common.notStockedHere') — "{{count}} not
    // stocked here"; separates vendors with something stocked in the active
    // location from those with nothing (src/routes/shopping/index.tsx:288-292)
    return this.page.getByText(/\d+ not stocked here/)
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

  async searchInCart(vendorId: string, query: string) {
    // The cart page reads its search from ?q= (useUrlSearchAndFilters), and
    // ItemListToolbar opens the search row whenever it is non-empty — far more
    // robust than driving the collapse toggle.
    await this.page.goto(
      `/shopping/${vendorId}?q=${encodeURIComponent(query)}`,
      { waitUntil: 'networkidle' },
    )
  }

  getNotInThisListDivider(): Locator {
    // ListSectionDivider carrying t('common.notInThisList') — "{{count}} not in
    // this list"; ItemSearchTail's in-location section
    // (src/components/item/ItemSearchTail/ItemSearchTail.tsx)
    return this.page.getByText(/\d+ not in this list/)
  }

  getTailActionButton(action: string, itemName: string): Locator {
    // Every row's button carries the same visible label, so the accessible
    // name is t('items.searchTail.rowAction') = "{{action}}: {{name}}"
    // (src/components/item/ItemSearchTail/ItemSearchTail.tsx)
    return this.page.getByRole('button', { name: `${action}: ${itemName}` })
  }

  getCreateItemButton(): Locator {
    // aria-label={t('itemListToolbar.createItem')} — "Create item"
    // (src/components/item/ItemListToolbar/ItemListToolbar.tsx)
    return this.page.getByRole('button', { name: 'Create item' })
  }
}
