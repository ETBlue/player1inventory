import type { Locator, Page } from '@playwright/test'

// The item-detail Stock tab (`/items/$id/stock`) in local mode: a pager across
// every location. Chrome is rendered only when more than one location exists.
// (src/routes/items/$id/stock.tsx, src/components/item/LocationPager/LocationPager.tsx)
export class StockPagerPage {
  constructor(readonly page: Page) {}

  async navigateTo(itemId: string) {
    await this.page.goto(`/items/${itemId}/stock`)
  }

  // ── Pager chrome ────────────────────────────────────────────────────────────

  getTablist(): Locator {
    // role="tablist" aria-label={t('items.detail.locationPager.label')} → "Stock by location"
    // (LocationPager.tsx:132-133)
    return this.page.getByRole('tablist', { name: 'Stock by location' })
  }

  getDot(locationName: string): Locator {
    // Each dot is role="tab". Its accessible name is the location name, or
    // "{{location}} (current location)" for the globally active one
    // (items.detail.locationPager.pageCurrent — LocationPager.tsx:149-159).
    // The regex matches both forms so callers need not know which is active.
    return this.getTablist().getByRole('tab', {
      name: new RegExp(`^${escapeRegExp(locationName)}( \\(current location\\))?$`),
    })
  }

  getActiveDot(): Locator {
    // Only the globally active location's dot carries the "(current location)"
    // suffix — it keeps it while the user pages elsewhere (LocationPager.tsx:153-158).
    // This is a name-only distinction: the dots themselves draw page position
    // and nothing else, so there is no visual active marker to locate.
    return this.getTablist().getByRole('tab', { name: /\(current location\)$/ })
  }

  getPreviousButton(): Locator {
    // aria-label={t('items.detail.locationPager.previous')} → "Previous location"
    // (LocationPager.tsx:108)
    return this.page.getByRole('button', { name: 'Previous location' })
  }

  getNextButton(): Locator {
    // aria-label={t('items.detail.locationPager.next')} → "Next location"
    // (LocationPager.tsx:192)
    return this.page.getByRole('button', { name: 'Next location' })
  }

  getViewedLocationCaption(): Locator {
    // Visually hidden aria-live region: items.detail.locationPager.viewing
    // → "Viewing stock for {{location}}" (LocationPager.tsx:199-201)
    return this.page.getByText(/^Viewing stock for /)
  }

  getActiveHint(): Locator {
    // The caption under the viewed location's name. "Current location" when
    // standing on it, "Current location: {{name}}" while viewing another page
    // (items.detail.locationPager.currentHint / .currentElsewhere — LocationPager.tsx:119-127).
    return this.page.getByText(/^Current location(: .+)?$/)
  }

  async goToNext() {
    await this.getNextButton().click()
  }

  async goToPrevious() {
    await this.getPreviousButton().click()
  }

  async goToLocation(locationName: string) {
    await this.getDot(locationName).click()
  }

  // ── Page content ────────────────────────────────────────────────────────────

  getStockForm(): Locator {
    // The stocked page renders ItemForm sections={['stock']}, whose packed
    // quantity input is id="packedQuantity"
    // (src/components/item/ItemForm/ItemForm.tsx via stock.tsx StockFormPanel).
    return this.page.locator('#packedQuantity')
  }

  getNotStockedEmptyState(): Locator {
    // EmptyState title: items.detail.locationPager.notStockedTitle
    // → "Not stocked here" (stock.tsx:572-578)
    return this.page.getByText('Not stocked here')
  }

  getAddToLocationButton(): Locator {
    // items.detail.locationPager.addToLocation → "Add to location" (stock.tsx:585)
    return this.page.getByRole('button', { name: 'Add to location' })
  }

  getRemoveFromLocationButton(): Locator {
    // DeleteButton trigger: items.detail.locationPager.removeFromLocation
    // → "Remove from location" (stock.tsx:425, via RemoveFromLocationButton)
    return this.page.getByRole('button', { name: 'Remove from location' })
  }

  async addToLocation() {
    await this.getAddToLocationButton().click()
    // The page swaps the empty state for the stock form once the copy-on-add lands.
    await this.getStockForm().waitFor({ state: 'visible' })
  }

  // ── Remove confirmation ─────────────────────────────────────────────────────

  getRemoveDialog(): Locator {
    // DeleteButton renders an AlertDialog (role="alertdialog")
    // (src/components/shared/DeleteButton/index.tsx)
    return this.page.getByRole('alertdialog')
  }

  async openRemoveDialog() {
    await this.getRemoveFromLocationButton().click()
    await this.getRemoveDialog().waitFor({ state: 'visible' })
  }

  getAffectedCounts(): Locator {
    // items.detail.removeLocationDialog.affected — rendered only once BOTH count
    // queries resolve (stock.tsx:438-447). Format: "Inventory logs: N · Cart entries: N".
    return this.getRemoveDialog().getByText(/Inventory logs:/)
  }

  async confirmRemove() {
    // confirmLabel: items.detail.removeLocationDialog.confirm
    await this.getRemoveDialog()
      .getByRole('button', { name: /^remove$/i })
      .click()
    // Removal swaps the form for the not-stocked empty state in place — the
    // pager does not navigate away.
    await this.getNotStockedEmptyState().waitFor({ state: 'visible' })
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
