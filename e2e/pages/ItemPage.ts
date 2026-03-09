import type { Page } from '@playwright/test'

export class ItemPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async fillName(name: string) {
    // The name field has id="name" in ItemForm (src/components/item/ItemForm/index.tsx:360)
    // Label text is "Name *" — using locator('#name') is more reliable than getByLabel
    await this.page.locator('#name').fill(name)
  }

  async save() {
    // Submit button renders as <Button type="submit">Save</Button>
    // (src/components/item/ItemForm/index.tsx:577)
    // After save on /items/new, the app navigates to /items/$id —
    // wait for that navigation so callers can rely on the item being persisted.
    // The regex excludes /items/new so waitForURL only resolves after save navigates
    // to a real item detail page (e.g. /items/abc123).
    await Promise.all([
      this.page.waitForURL(/\/items\/(?!new)[^/]+$/, { timeout: 10000 }),
      this.page.getByRole('button', { name: /save/i }).click(),
    ])
  }

  async navigateToTab(tab: 'tags' | 'vendors' | 'recipes' | 'log') {
    // Tabs are icon-only links without ARIA tab role, so we navigate directly.
    // Note: this bypasses the dirty-state navigation guard — do not use to test guard behavior.
    const url = this.page.url()
    const match = url.match(/\/items\/([^/?]+)/)
    if (!match) throw new Error(`Not on an item page. Current URL: ${url}`)
    const id = match[1]
    await this.page.goto(`/items/${id}/${tab}`)
  }

  async delete() {
    // Trigger the delete confirmation dialog
    await this.page.getByRole('button', { name: /delete/i }).click()
    // Confirm inside the alertdialog (scoped to avoid matching other delete buttons)
    await this.page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click()
  }

  async createAndAssignTag(name: string) {
    // Navigate to Tags tab, open AddNameDialog, fill and submit
    // AddNameDialog label is "Name" (src/components/AddNameDialog/index.tsx:41)
    // Submit button uses submitLabel prop (typically "Add")
    await this.navigateToTab('tags')
    await this.page.getByRole('button', { name: /new tag/i }).click()
    await this.page.getByRole('dialog').getByLabel('Name').fill(name)
    await this.page.getByRole('dialog').getByRole('button', { name: /add/i }).click()
  }

  async createAndAssignVendor(name: string) {
    // Navigate to Vendors tab, open AddNameDialog, fill and submit
    await this.navigateToTab('vendors')
    await this.page.getByRole('button', { name: /new vendor/i }).click()
    await this.page.getByRole('dialog').getByLabel('Name').fill(name)
    await this.page.getByRole('dialog').getByRole('button', { name: /add/i }).click()
  }
}
