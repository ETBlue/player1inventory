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

  async saveExisting() {
    // For saving an already-existing item (not /items/new).
    // After saving, the app navigates back (via goBack()) — typically to the pantry (/).
    // We wait for any URL change away from the current item page.
    const currentUrl = this.page.url()
    await this.page.getByRole('button', { name: /save/i }).click()
    // Wait for navigation away from the current URL
    await this.page.waitForURL((url) => url.toString() !== currentUrl, { timeout: 10000 })
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

  getCurrentItemId(): string {
    // Extract item ID from the current URL (/items/{id} or /items/{id}/*)
    const url = this.page.url()
    const match = url.match(/\/items\/([^/?]+)/)
    if (!match) throw new Error(`Not on an item page. Current URL: ${url}`)
    return match[1]
  }

  async delete() {
    // Trigger the delete confirmation dialog
    await this.page.getByRole('button', { name: /delete/i }).click()
    // Confirm inside the alertdialog (scoped to avoid matching other delete buttons)
    await this.page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click()
  }

  async createAndAssignTag(tagName: string, tagTypeName = 'Category') {
    // Tags tab requires at least one tag type to exist before "New Tag" button appears.
    // (src/routes/items/$id/tags.tsx: shows "No tags yet. Create tags in Settings."
    //  when tagTypes.length === 0)
    // So we first navigate to /settings/tags to create a tag type, then return to the
    // item's tags tab to create and assign the tag.

    // Store item ID before navigating away
    const itemId = this.getCurrentItemId()

    // Step 1: Create a tag type at /settings/tags
    // The form has id="newTagTypeName" input and a "New Tag Type" submit button.
    await this.page.goto('/settings/tags')
    const tagTypeInput = this.page.locator('#newTagTypeName')
    await tagTypeInput.fill(tagTypeName)
    await this.page.getByRole('button', { name: /new tag type/i }).click()
    // Wait for the tag type card to appear
    await this.page.getByRole('heading', { name: tagTypeName, level: 3 }).waitFor()

    // Step 2: Navigate to item's tags tab and create + assign the tag
    await this.page.goto(`/items/${itemId}/tags`)
    // "New Tag" button lives inside the tag type section
    await this.page.getByRole('button', { name: /new tag/i }).first().click()
    // AddNameDialog label is "Name" (src/components/AddNameDialog/index.tsx:41)
    await this.page.getByRole('dialog').getByLabel('Name').fill(tagName)
    await this.page.getByRole('dialog').getByRole('button', { name: /add tag/i }).click()
    // Tag is created but NOT yet assigned — click the badge to assign it
    await this.page.getByRole('main').getByText(tagName, { exact: false }).click()
  }

  async createAndAssignVendor(name: string) {
    // Navigate to Vendors tab, open AddNameDialog, fill and submit
    await this.navigateToTab('vendors')
    await this.page.getByRole('button', { name: /new vendor/i }).click()
    await this.page.getByRole('dialog').getByLabel('Name').fill(name)
    await this.page.getByRole('dialog').getByRole('button', { name: /add/i }).click()
  }
}
