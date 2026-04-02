import type { Locator, Page } from '@playwright/test'

export class ItemPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async fillName(name: string) {
    // Label text is "Name" (src/components/item/ItemForm/index.tsx:358)
    await this.page.getByLabel('Name').fill(name)
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
    // Confirm inside the alertdialog (scoped to avoid matching other delete buttons).
    // Wait for navigation away from /items/... — this confirms onSuccess fired and the
    // TanStack Query cache was invalidated before the caller checks the pantry list.
    await Promise.all([
      this.page.waitForURL((url) => !url.pathname.startsWith('/items/'), { timeout: 10000 }),
      this.page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click(),
    ])
  }

  async createAndAssignTag(name: string) {
    // Navigate to the tags tab and create + assign the tag inline.
    // Caller is responsible for ensuring at least one tag type exists first
    // (tags tab shows "No tags yet. Create tags in Settings." when tagTypes.length === 0).
    await this.navigateToTab('tags')
    // "New Tag" button lives inside the tag type section
    await this.page.getByRole('button', { name: /new tag/i }).first().click()
    // AddNameDialog label is "Name" (src/components/AddNameDialog/index.tsx:41)
    await this.page.getByRole('dialog').getByLabel('Name').fill(name)
    await this.page.getByRole('dialog').getByRole('button', { name: /add tag/i }).click()
    // Tag is created and immediately assigned (pressed: true) — no extra click needed.
  }

  getPackedQuantityInput(): Locator {
    // Label text starts with "Packed" (e.g., "Packed (pkg)")
    // Use start-anchor regex to avoid matching the "Unpacked" label
    // (src/components/item/ItemForm/index.tsx:235)
    return this.page.getByLabel(/^Packed/i)
  }

  async createAndAssignVendor(name: string) {
    // Navigate to Vendors tab, open AddNameDialog, fill and submit
    await this.navigateToTab('vendors')
    await this.page.getByRole('button', { name: /new vendor/i }).click()
    await this.page.getByRole('dialog').getByLabel('Name').fill(name)
    await this.page.getByRole('dialog').getByRole('button', { name: /add/i }).click()
  }

  async assignVendor(name: string) {
    // Click the vendor badge (role="button" aria-pressed=false) to assign it to the item
    // Badge: role="button" aria-pressed={isAssigned} (src/routes/items/$id/vendors.tsx:65)
    await this.page.getByRole('button', { name, exact: false, pressed: false }).click()
  }

  // ── Recipes tab ───────────────────────────────────────────────────────────────

  async clickNewRecipeButton() {
    // "New Recipe" button inline with recipe badges (src/routes/items/$id/recipes.tsx:80-88)
    await this.page.getByRole('button', { name: /new recipe/i }).click()
  }

  async fillRecipeName(name: string) {
    // AddNameDialog input: label "Name", placeholder "e.g., Pasta Sauce, Smoothie"
    // (src/routes/items/$id/recipes.tsx:91-103, src/components/AddNameDialog/index.tsx)
    await this.page.getByRole('dialog').getByLabel('Name').fill(name)
  }

  async submitRecipeDialog() {
    // "Add Recipe" submit button in AddNameDialog (src/routes/items/$id/recipes.tsx:94)
    await this.page.getByRole('dialog').getByRole('button', { name: /add recipe/i }).click()
  }

  getRecipeBadge(name: string) {
    // Recipe badge: role="button" aria-pressed={isAssigned} (src/routes/items/$id/recipes.tsx:68-69)
    return this.page.getByRole('button', { name, exact: false, pressed: true })
  }

  getRecipeDialog() {
    // The AddNameDialog rendered as a dialog (src/components/AddNameDialog/index.tsx)
    return this.page.getByRole('dialog')
  }

  // ── Log tab ──────────────────────────────────────────────────────────────────

  async navigateToLogTab() {
    // Log tab: navigates directly to /items/{id}/log (src/routes/items/$id/log.tsx)
    await this.navigateToTab('log')
  }

  getEmptyLogMessage() {
    // Empty state: text "No history yet." (src/routes/items/$id/log.tsx:21)
    return this.page.getByText('No history yet.')
  }

  getLogEntries() {
    // Each log entry shows a quantity change line like "+1 → 1 pkg" (src/routes/items/$id/log.tsx:34-38)
    // The → character (Unicode U+2192) is the reliable unique identifier for log entry quantity lines.
    // We use getByText with the arrow character since Tailwind v4 class names may not be stable DOM selectors.
    return this.page.getByText(/→\s*\d+/)
  }

  getLogEntryByText(text: string) {
    // Find a log entry containing specific text (note, quantity, etc.) (src/routes/items/$id/log.tsx)
    return this.page.getByText(text)
  }

  getTagBadge(name: string): Locator {
    // Assigned tag badge: role="button" aria-pressed=true (src/routes/items/$id/tags.tsx)
    return this.page.getByRole('button', { name, exact: false, pressed: true })
  }

  getAssignedVendorBadge(name: string): Locator {
    // Assigned vendor badge: role="button" aria-pressed=true (src/routes/items/$id/vendors.tsx)
    return this.page.getByRole('button', { name, exact: false, pressed: true })
  }

  // ── Expiration mode ──────────────────────────────────────────────────────────

  async selectExpirationMode(mode: 'Specific Date' | 'Days from Purchase') {
    // Expiration mode Select trigger: id="expirationMode", role="combobox"
    // Label: "Calculate Expiration based on" (src/components/item/ItemForm/index.tsx:459-461)
    // Modes available: "Specific Date" (value="date"), "Days from Purchase" (value="days")
    // Default is "Specific Date", so selecting "Specific Date" when it's already selected
    // will not appear as an option in the Radix dropdown (Radix hides the selected option).
    //
    // Radix Select also renders a visually-hidden native <select> for form compatibility.
    // To avoid clicking the native <option>, we scope the option click to inside the
    // visible Radix listbox (role="listbox") rather than using getByRole('option') globally.
    //
    // Pattern: click trigger → wait for listbox → click option scoped to listbox
    const trigger = this.page.locator('#expirationMode')
    await trigger.click()
    // Wait for the Radix listbox portal to appear
    const listbox = this.page.getByRole('listbox')
    await listbox.waitFor({ state: 'visible' })
    // Click the option scoped inside the listbox to avoid the hidden native <option>
    await listbox.getByRole('option', { name: mode }).click()
  }

  async fillExpirationDueDate(date: string) {
    // "Expires on" date input: id="expirationDueDate", type="date"
    // In the Stock section — only visible on the item detail page (/items/$id),
    // NOT on the new item page (/items/new). Shown when expirationMode === 'date'.
    // (src/components/item/ItemForm/index.tsx:332-344)
    await this.page.locator('#expirationDueDate').fill(date)
  }

  async fillEstimatedDueDays(days: string) {
    // "Expires in (days)" input: id="expirationDueDays", type="number"
    // In the Item Info section — visible on both new item and detail pages.
    // Shown when expirationMode === 'days' (src/components/item/ItemForm/index.tsx:488-503)
    await this.page.locator('#expirationDueDays').fill(days)
  }

  async fillTargetQuantity(quantity: string) {
    // Target Quantity input: id="targetQuantity" (src/components/item/ItemForm/index.tsx:383)
    await this.page.locator('#targetQuantity').fill(quantity)
  }

  async fillPackedQuantity(quantity: string) {
    // Packed quantity input: id="packedQuantity", in Stock section
    // Only visible on item detail page (/items/$id), not on /items/new
    // (src/components/item/ItemForm/index.tsx:253-264)
    await this.page.locator('#packedQuantity').fill(quantity)
  }

  getExpirationModeSelector(): Locator {
    // The Select trigger for expiration mode: id="expirationMode", role="combobox"
    // (src/components/item/ItemForm/index.tsx:468)
    return this.page.locator('#expirationMode')
  }
}
