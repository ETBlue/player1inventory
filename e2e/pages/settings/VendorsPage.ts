import type { Locator, Page } from '@playwright/test'

export class VendorsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/settings/vendors')
  }

  async clickNewVendor() {
    // "New Vendor" button in toolbar (src/routes/settings/vendors/index.tsx:51)
    await this.page.getByRole('button', { name: /new vendor/i }).click()
  }

  getVendorCard(name: string): Locator {
    // VendorCard renders vendor name as a Link inside a Card
    // (src/components/vendor/VendorCard/index.tsx:19-25)
    return this.page.getByRole('link', { name, exact: true })
  }

  async clickDeleteVendor(name: string) {
    // aria-label="Delete {vendor.name}" on the trash button
    // (src/components/vendor/VendorCard/index.tsx:37)
    await this.page.getByRole('button', { name: `Delete ${name}` }).click()
  }

  async confirmDelete() {
    // AlertDialog confirm button — DeleteButton uses confirmLabel="Delete" by default
    // (src/components/DeleteButton/index.tsx:37, AlertDialogAction renders the label)
    await this.page.getByRole('button', { name: 'Delete' }).click()
  }

  async fillVendorName(name: string) {
    // Name input on the new vendor page (src/components/vendor/VendorNameForm/index.tsx)
    await this.page.getByLabel('Name').fill(name)
  }

  async clickSave() {
    // Save button in VendorNameForm (src/components/vendor/VendorNameForm/index.tsx)
    await this.page.getByRole('button', { name: 'Save' }).click()
  }
}
