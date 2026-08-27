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

  getQuickUpdateDialog(): Locator {
    // QuickUpdateDialog renders inside a Radix Dialog — role="dialog"
    // (src/components/item/QuickUpdateDialog/QuickUpdateDialog.tsx)
    return this.page.getByRole('dialog')
  }

  getQuickUpdateTargetInput(): Locator {
    // Stock-settings row, Target stepper input:
    // aria-label={`Target quantity (${unpackedUnit})`} — the unit suffix varies per
    // item (package unit or measurement unit), so match the stable prefix.
    // (src/components/item/QuickUpdateDialog/QuickUpdateDialog.tsx — targetAriaLabel)
    return this.getQuickUpdateDialog().getByRole('spinbutton', {
      name: /^Target quantity/,
    })
  }

  getQuickUpdateRefillInput(): Locator {
    // Stock-settings row, Refill stepper input:
    // aria-label={`Refill threshold (${unpackedUnit})`}
    // (src/components/item/QuickUpdateDialog/QuickUpdateDialog.tsx — refillAriaLabel)
    return this.getQuickUpdateDialog().getByRole('spinbutton', {
      name: /^Refill threshold/,
    })
  }

  async clickQuickUpdateStepper(
    control:
      | 'Decrease target quantity'
      | 'Increase target quantity'
      | 'Decrease refill threshold'
      | 'Increase refill threshold',
  ) {
    // Stock-settings +/- buttons carry these exact aria-labels
    // (src/components/item/QuickUpdateDialog/QuickUpdateDialog.tsx — the
    // "Stock settings" grid below the progress bar)
    await this.getQuickUpdateDialog()
      .getByRole('button', { name: control })
      .click()
  }

  async submitQuickUpdate() {
    // Dialog footer submit button, label "Update" — disabled while the local
    // values are untouched (src/components/item/QuickUpdateDialog/QuickUpdateDialog.tsx)
    await this.getQuickUpdateDialog()
      .getByRole('button', { name: 'Update', exact: true })
      .click()
  }

  getNotStockedHereDivider(): Locator {
    // ListSectionDivider carrying t('common.notStockedHere') — "{{count}} not
    // stocked here" (src/components/pantry/ShelfGroupView.tsx:279,
    // VendorGroupView.tsx:206, RecipeGroupView.tsx:216). Also the search
    // tail's bucket-3 divider (ItemSearchTail.tsx) on the flat pantry and
    // shelf detail.
    return this.page.getByText(/\d+ not stocked here/)
  }

  async gotoWithSearch(params: Record<string, string>) {
    // useUrlSearchAndFilters reads the raw `?q=`/`?groupBy=`/`?id=` params
    // off the router location string (src/hooks/useUrlSearchAndFilters.ts),
    // and ItemListToolbar's searchVisible state initializes from `search !==
    // ''` on mount — so a direct navigation with `?q=` already set opens the
    // search row pre-populated, far more robust than driving the toggle.
    const qs = new URLSearchParams(params).toString()
    await this.page.goto(`/?${qs}`, { waitUntil: 'networkidle' })
  }

  getNotInThisListDivider(): Locator {
    // ListSectionDivider carrying t('common.notInThisList') — "{{count}} not
    // in this list"; ItemSearchTail's in-location section (bucket 2)
    // (src/components/item/ItemSearchTail/ItemSearchTail.tsx)
    return this.page.getByText(/\d+ not in this list/)
  }

  getTailActionButton(action: string, itemName: string): Locator {
    // Every row's button carries the same visible label, so the accessible
    // name is t('items.searchTail.rowAction') = "{{action}}: {{name}}"
    // (src/components/item/ItemSearchTail/ItemSearchTail.tsx)
    return this.page.getByRole('button', { name: `${action}: ${itemName}` })
  }

  getDetailHeading(name: string): Locator {
    // The <h1> in a detail view's toolbar `leading` slot, carrying the
    // group's own name: `vendor?.name ?? 'Vendor'`
    // (src/components/pantry/VendorDetailView.tsx:218,266) and
    // `recipe?.name ?? 'Recipe'`
    // (src/components/pantry/RecipeDetailView.tsx:237,292 — capitalized by
    // CSS only, so the accessible name is the stored casing).
    //
    // Worth asserting before any tail assertion: `?id=` is passed through
    // `validateSearch` as an arbitrary string with no existence check, so a
    // wrong id renders the FALLBACK title, resolves no vendor/recipe, and
    // suppresses the group action entirely — the tail spec would then fail on
    // a missing button and say nothing about why.
    return this.page.getByRole('heading', { name, level: 1, exact: true })
  }

  getCreateItemButton(): Locator {
    // aria-label={t('itemListToolbar.createItem')} — "Create item"
    // (src/components/item/ItemListToolbar/index.tsx)
    return this.page.getByRole('button', { name: 'Create item' })
  }
}
