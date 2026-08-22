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

  async clickQuickUpdate(itemName: string) {
    // Quick update button: aria-label="Update quantity of {name}", mode='pantry' in ItemCard
    // (src/.worktrees/.../ItemCard/ItemCard.tsx — onQuickUpdate prop renders Pencil icon button)
    await this.page.getByRole('button', { name: `Update quantity of ${itemName}` }).click()
  }

  getItemCard(name: string): Locator {
    // ItemCard renders as a <div> (via Card component, src/components/ui/card.tsx)
    // The item name is in an <h3> with capitalize CSS (src/components/item/ItemCard/index.tsx:192)
    // Match the heading element which is unique per item
    return this.page.getByRole('heading', { name, level: 3 })
  }

  async navigateToGroupBy(groupBy: 'shelf' | 'vendor' | 'recipe') {
    // Group-by views are selected by the `groupBy` search param on the pantry
    // route (src/routes/index.tsx — dispatches to ShelfGroupView /
    // VendorGroupView / RecipeGroupView)
    await this.page.goto(`/?groupBy=${groupBy}`)
  }

  getGroupCard(name: string): Locator {
    // GroupCard's clickable body: role="button" aria-label={name}
    // (src/components/shared/GroupCard/GroupCard.tsx:56-57).
    // The unfiled buckets carry literal names: "Unsorted" (shelf group-by,
    // ShelfGroupView.tsx:217), "No vendor" (VendorGroupView.tsx:113) and
    // "Not added to recipe" (RecipeGroupView.tsx:123).
    return this.page.getByRole('button', { name, exact: true })
  }

  getNotStockedHereDivider(): Locator {
    // ListSectionDivider carrying t('common.notStockedHere') — "{{count}} not
    // stocked here" (src/components/pantry/ShelfGroupView.tsx:279,
    // VendorGroupView.tsx:206, RecipeGroupView.tsx:216)
    return this.page.getByText(/\d+ not stocked here/)
  }
}
