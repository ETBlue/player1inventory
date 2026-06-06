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
    // aria-label='Delete "{vendor.name}"' on the trash button
    // (src/components/vendor/VendorCard/index.tsx:37)
    await this.page.getByRole('button', { name: `Delete "${name}"` }).click()
  }

  async confirmDelete() {
    // AlertDialog confirm button — DeleteButton uses confirmLabel="Delete" by default
    // (src/components/DeleteButton/index.tsx:37, AlertDialogAction renders the label)
    await this.page.getByRole('button', { name: 'Delete' }).click()
  }

  async fillVendorName(name: string) {
    // Name input in NewVendorDialog: label "Name" linked to id="new-vendor-name"
    // (src/components/vendor/NewVendorDialog/NewVendorDialog.tsx)
    await this.page.getByLabel('Name').fill(name)
  }

  async clickSave() {
    // Submit button in NewVendorDialog renders as <Button>New Vendor</Button>
    // (src/components/vendor/NewVendorDialog/NewVendorDialog.tsx)
    await this.page.getByRole('button', { name: 'New Vendor' }).click()
  }

  async cancelDeleteDialog() {
    // Cancel button in the AlertDialog (src/components/ui/alert-dialog.tsx)
    await this.page.getByRole('button', { name: 'Cancel' }).click()
  }

  getDeleteDialog(): Locator {
    // The AlertDialog element — use to scope content assertions inside the dialog
    // (src/components/DeleteButton/index.tsx, src/components/ui/alert-dialog.tsx)
    return this.page.getByRole('alertdialog')
  }
}
