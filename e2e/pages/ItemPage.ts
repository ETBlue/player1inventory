import type { Locator, Page } from '@playwright/test'

export class ItemPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async fillName(name: string) {
    // In the NewItemDialog the Name field is a search combobox (role="combobox"),
    // labelled "Name" (src/components/item/NewItemDialog/NewItemDialog.tsx). On the
    // item detail Info form it is a plain input also labelled "Name"
    // (src/components/item/ItemForm/ItemForm.tsx). getByLabel matches both.
    await this.page.getByLabel('Name').fill(name)
  }

  async fillWikidataUrl(url: string) {
    // Info-tab field: id="wikidataUrl" — only in the info section on /items/$id.
    // (src/components/item/ItemForm/ItemForm.tsx via ItemForm sections={['info']})
    await this.page.locator('#wikidataUrl').fill(url)
  }

  async fillNote(note: string) {
    // Info-tab field: id="note" (textarea) — only in the info section on /items/$id.
    // (src/components/item/ItemForm/ItemForm.tsx via ItemForm sections={['info']})
    await this.page.locator('#note').fill(note)
  }

  getWikidataUrlInput(): Locator {
    // Info-tab field: id="wikidataUrl" (src/components/item/ItemForm/ItemForm.tsx)
    return this.page.locator('#wikidataUrl')
  }

  getNoteInput(): Locator {
    // Info-tab field: id="note" (src/components/item/ItemForm/ItemForm.tsx)
    return this.page.locator('#note')
  }

  async save() {
    // The NewItemDialog is a search combobox. When the typed name matches no
    // existing item, the dialog footer shows a Create button labelled
    // Create "<name>" (src/components/item/NewItemDialog/NewItemDialog.tsx).
    // Clicking it creates the item and navigates to /items/$id — wait for that
    // navigation so callers can rely on the item being persisted. The regex
    // excludes /items/new so waitForURL only resolves after the dialog navigates
    // to a real item detail page (e.g. /items/abc123).
    await Promise.all([
      this.page.waitForURL(/\/items\/(?!new)[^/]+$/, { timeout: 10000 }),
      this.page
        .getByRole('dialog')
        .getByRole('button', { name: /create/i })
        .click(),
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

  async navigateToTab(tab: 'tags' | 'vendors' | 'recipes' | 'log' | 'stock') {
    // Tabs are icon-only links without ARIA tab role, so we navigate directly.
    // Note: this bypasses the dirty-state navigation guard — do not use to test guard behavior.
    // After the item-detail tab refactor, tags/vendors/recipes live under the
    // Relation submenu (/items/$id/relation/{tags,vendors,recipes}); stock has its
    // own tab (/items/$id/stock); log is unchanged (/items/$id/log).
    // (src/routes/items/$id/relation/*.tsx, src/routes/items/$id/stock.tsx, src/routes/items/$id/log.tsx)
    const url = this.page.url()
    const match = url.match(/\/items\/([^/?]+)/)
    if (!match) throw new Error(`Not on an item page. Current URL: ${url}`)
    const id = match[1]
    const isRelationTab = tab === 'tags' || tab === 'vendors' || tab === 'recipes'
    const path = isRelationTab ? `/items/${id}/relation/${tab}` : `/items/${id}/${tab}`
    await this.page.goto(path)
  }

  async navigateToStockTab() {
    // Stock fields (packed/unpacked, target, threshold, consume amount, package
    // unit, measurement, expiration) live on /items/$id/stock after the
    // item-detail tab refactor — NOT on the Info index route.
    // (src/routes/items/$id/stock.tsx)
    await this.navigateToTab('stock')
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
    // "New Tag" button lives inside the tag type section.
    // exact: true so it doesn't also match the page's "New Tag Type" button
    // (both render on /items/$id/relation/tags — src/routes/items/$id/relation/tags.tsx).
    await this.page.getByRole('button', { name: 'New Tag', exact: true }).first().click()
    // AddNameDialog label is "Name" (src/components/AddNameDialog/index.tsx:41)
    await this.page.getByRole('dialog').getByLabel('Name').fill(name)
    await this.page.getByRole('dialog').getByRole('button', { name: /add tag/i }).click()
    // Tag is created and immediately assigned (pressed: true) — no extra click needed.
  }

  async ensureStockTab() {
    // Stock fields moved to /items/$id/stock in the item-detail tab refactor.
    // Navigate there only if not already on the stock route — re-navigating would
    // discard unsaved field edits made by an earlier method call in the same test.
    // (src/routes/items/$id/stock.tsx)
    if (!/\/items\/[^/]+\/stock(?:[/?#]|$)/.test(this.page.url())) {
      await this.navigateToStockTab()
    }
  }

  async ensureInfoTab() {
    // The eight GLOBAL stock CONFIGURATION fields — expiration mode, "expires in
    // N days", the expiration threshold, target/measurement unit, amount per
    // package, consume amount, package unit — live on the Info index route
    // (/items/$id) since v16. Only the five genuinely per-location fields
    // (packed, unpacked, target, refill threshold and that location's own
    // "Expires on" date) stayed on the Stock tab.
    // (src/components/item/ItemForm/ItemForm.tsx — the `showInfo` block)
    //
    // Navigate only when not already on the Info route — re-navigating would
    // discard unsaved field edits made by an earlier method call in the same
    // test. Switching between the Info and Stock tabs unmounts the form, so a
    // test that edits both halves must save in between.
    if (!/\/items\/[^/?#]+\/?(?:[?#]|$)/.test(this.page.url())) {
      await this.page.goto(`/items/${this.getCurrentItemId()}`)
    }
  }

  getPackedQuantityInput(): Locator {
    // Label text starts with "Packed" (e.g., "Packed (pkg)")
    // Use start-anchor regex to avoid matching the "Unpacked" label.
    // Stock field — only on /items/$id/stock (src/routes/items/$id/stock.tsx via ItemForm sections={['stock']}).
    // Callers must navigate to the stock tab first (e.g. await item.navigateToStockTab()).
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
    // Badge: role="button" aria-pressed={isAssigned} (src/routes/items/$id/relation/vendors.tsx)
    await this.page.getByRole('button', { name, exact: false, pressed: false }).click()
  }

  // ── Recipes tab ───────────────────────────────────────────────────────────────

  async clickNewRecipeButton() {
    // "New Recipe" button inline with recipe badges (src/routes/items/$id/relation/recipes.tsx)
    await this.page.getByRole('button', { name: /new recipe/i }).click()
  }

  async fillRecipeName(name: string) {
    // AddNameDialog input: label "Name", placeholder "e.g., Pasta Sauce, Smoothie"
    // (src/routes/items/$id/relation/recipes.tsx, src/components/AddNameDialog/index.tsx)
    await this.page.getByRole('dialog').getByLabel('Name').fill(name)
  }

  async submitRecipeDialog() {
    // "Add Recipe" submit button in AddNameDialog (src/routes/items/$id/relation/recipes.tsx)
    await this.page.getByRole('dialog').getByRole('button', { name: /add recipe/i }).click()
  }

  getRecipeBadge(name: string) {
    // Recipe badge: role="button" aria-pressed={isAssigned} (src/routes/items/$id/relation/recipes.tsx)
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
    // Assigned tag badge: role="button" aria-pressed=true (src/routes/items/$id/relation/tags.tsx)
    return this.page.getByRole('button', { name, exact: false, pressed: true })
  }

  getAssignedVendorBadge(name: string): Locator {
    // Assigned vendor badge: role="button" aria-pressed=true (src/routes/items/$id/relation/vendors.tsx)
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
    // The expiration MODE is global and lives on the Info tab (/items/$id) since
    // v16 — only this location's "Expires on" date stayed on the Stock tab.
    await this.ensureInfoTab()
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
    // Stock field — lives on the Stock tab (/items/$id/stock).
    // Only rendered when expirationMode === 'date' (Specific Date).
    // (src/routes/items/$id/stock.tsx via ItemForm sections={['stock']})
    await this.ensureStockTab()
    await this.page.locator('#expirationDueDate').fill(date)
  }

  async fillEstimatedDueDays(days: string) {
    // "Expires in (days)" input: id="expirationDueDays", type="number"
    // GLOBAL configuration — lives on the Info tab (/items/$id) since v16.
    // Shown when expirationMode === 'days from purchase'
    // (src/components/item/ItemForm/ItemForm.tsx, inside the `showInfo` block)
    await this.ensureInfoTab()
    await this.page.locator('#expirationDueDays').fill(days)
  }

  getConsumeAmountInput() {
    // "Amount per Consume" input: id="consumeAmount" — GLOBAL configuration on
    // the Info tab (/items/$id).
    // (src/components/item/ItemForm/ItemForm.tsx, inside the `showInfo` block)
    return this.page.locator('#consumeAmount')
  }

  async fillConsumeAmount(amount: string) {
    // Sets "Amount per Consume" on the Info tab.
    //
    // NOTE: this used to be mandatory before saving any freshly created item —
    // new items defaulted to consumeAmount 0 and ItemForm's `consumeAmount > 0`
    // validation kept Save disabled. The designer reversed that on 2026-08-24:
    // both create paths now default to 1, so a new item is valid on arrival and
    // no test needs this just to unblock Save. Call it only when a test really
    // wants a specific step size.
    await this.ensureInfoTab()
    await this.getConsumeAmountInput().fill(amount)
  }

  async fillTargetQuantity(quantity: string) {
    // Target Quantity input: id="targetQuantity" — Stock field on /items/$id/stock.
    // (src/routes/items/$id/stock.tsx via ItemForm sections={['stock']})
    await this.ensureStockTab()
    await this.page.locator('#targetQuantity').fill(quantity)
  }

  getTargetQuantityInput(): Locator {
    // Target Quantity input: id="targetQuantity", label "Target Quantity" —
    // per-location Stock field on /items/$id/stock.
    // (src/components/item/ItemForm/ItemForm.tsx:738-755 via sections={['stock']})
    // Callers must navigate to the stock tab first (e.g. await item.navigateToStockTab()).
    return this.page.locator('#targetQuantity')
  }

  getRefillThresholdInput(): Locator {
    // Refill threshold input: id="refillThreshold", label "Refill When Below" —
    // per-location Stock field on /items/$id/stock.
    // (src/components/item/ItemForm/ItemForm.tsx:765-782 via sections={['stock']})
    // Callers must navigate to the stock tab first (e.g. await item.navigateToStockTab()).
    return this.page.locator('#refillThreshold')
  }

  async fillRefillThreshold(quantity: string) {
    // Refill threshold input: id="refillThreshold" — Stock field on /items/$id/stock.
    // (src/routes/items/$id/stock.tsx via ItemForm sections={['stock']})
    await this.ensureStockTab()
    await this.getRefillThresholdInput().fill(quantity)
  }

  async fillPackedQuantity(quantity: string) {
    // Packed quantity input: id="packedQuantity", in Stock section.
    // Lives on the Stock tab (/items/$id/stock), not on /items/$id or /items/new.
    // (src/routes/items/$id/stock.tsx via ItemForm sections={['stock']})
    await this.ensureStockTab()
    await this.page.locator('#packedQuantity').fill(quantity)
  }

  getExpirationModeSelector(): Locator {
    // The Select trigger for expiration mode: id="expirationMode", role="combobox".
    // GLOBAL configuration — only on the Info route /items/$id since v16.
    // Callers must be on the Info tab first.
    // (src/components/item/ItemForm/ItemForm.tsx, inside the `showInfo` block)
    return this.page.locator('#expirationMode')
  }
}
