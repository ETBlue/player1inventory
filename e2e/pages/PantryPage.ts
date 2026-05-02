import type { Locator, Page } from '@playwright/test'

export class PantryPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/')
    await this.page.waitForLoadState('networkidle')
  }

  async navigateToExpanded() {
    // Navigate to pantry with all shelves expanded.
    // Used when tests need to access item cards directly without expanding shelves manually.
    // The ?expanded URL param lists shelf IDs; using Expand All button to expand all shelves.
    await this.page.goto('/')
    await this.page.waitForLoadState('networkidle')
    // Click Expand All if it's enabled (i.e. there are shelves to expand)
    const expandAll = this.page.getByRole('button', { name: /expand all/i })
    try {
      await expandAll.waitFor({ state: 'visible', timeout: 2000 })
      if (await expandAll.isEnabled()) {
        await expandAll.click()
        // Wait for Expand All to become disabled — confirms all shelves are now expanded
        // (PantryControlBar disables it when expandedIds.size === allShelfIds.length)
        // Wait for Expand All to become disabled — confirms all shelves are now expanded
        // (PantryControlBar disables it when expandedIds.size === allShelfIds.length)
        await this.page.waitForFunction(() => {
          const btn = document.querySelector('button[aria-label="Expand All"]')
          return btn !== null && btn.hasAttribute('disabled')
        }, { timeout: 3000 })
      }
    } catch {
      // No Expand All button or already all expanded — that's fine
    }
  }

  async clickAddItem() {
    // The add-item button uses aria-label="Add item" (src/routes/index.tsx)
    await this.page.getByRole('button', { name: 'Add item' }).click()
  }

  async clickAddShelf() {
    // The add-shelf button uses aria-label="Add shelf" (src/routes/index.tsx)
    await this.page.getByRole('button', { name: 'Add shelf' }).click()
  }

  async searchFor(name: string) {
    await this.page.getByRole('searchbox').fill(name)
  }

  getItemCard(name: string): Locator {
    // ItemCard renders as a <div> (via Card component, src/components/ui/card.tsx)
    // The item name is in an <h3> with capitalize CSS (src/components/item/ItemCard/index.tsx)
    // Match the heading element which is unique per item
    return this.page.getByRole('heading', { name, level: 3 })
  }

  getShelfCard(shelfName: string): Locator {
    // PantryShelfCard header button has aria-expanded attr; the shelf name is in a <p>
    // Use the button wrapping the shelf name (src/components/pantry/PantryShelfCard/PantryShelfCard.tsx)
    return this.page.locator('button[aria-expanded]').filter({ hasText: shelfName })
  }

  async expandShelf(shelfName: string) {
    // Click a collapsed shelf to expand it
    const shelfButton = this.getShelfCard(shelfName)
    const isExpanded = await shelfButton.getAttribute('aria-expanded')
    if (isExpanded === 'false') {
      await shelfButton.click()
    }
  }

  async collapseShelf(shelfName: string) {
    // Click an expanded shelf to collapse it
    const shelfButton = this.getShelfCard(shelfName)
    const isExpanded = await shelfButton.getAttribute('aria-expanded')
    if (isExpanded === 'true') {
      await shelfButton.click()
    }
  }

  async clickExpandAll() {
    // PantryControlBar expand all button (src/components/pantry/PantryControlBar/PantryControlBar.tsx)
    await this.page.getByRole('button', { name: /expand all/i }).click()
  }

  async clickCollapseAll() {
    // PantryControlBar collapse all button (src/components/pantry/PantryControlBar/PantryControlBar.tsx)
    await this.page.getByRole('button', { name: /collapse all/i }).click()
  }

  getShelfSettingsLink(shelfName: string): Locator {
    // Settings icon link on a PantryShelfCard (aria-label from t('pantry.shelfCard.settings'))
    // Uses aria-label from the i18n key; default English is "Shelf settings"
    return this.page.getByRole('link', { name: /shelf settings/i })
      .filter({ has: this.page.locator('..').filter({ hasText: shelfName }) })
  }
}
