import type { Page, Locator } from '@playwright/test'

export class TagDetailPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo(id: string) {
    await this.page.goto(`/settings/tags/${id}`)
  }

  async navigateToItems(id: string) {
    await this.page.goto(`/settings/tags/${id}/items`)
  }

  async fillName(name: string) {
    // Label htmlFor="tag-name" (src/routes/settings/tags/$id/index.tsx:119)
    await this.page.getByLabel('Name').fill(name)
  }

  async selectType(typeName: string) {
    // Label htmlFor="tag-type" (src/routes/settings/tags/$id/index.tsx:93)
    await this.page.getByLabel('Tag Type').click()
    await this.page.getByRole('option', { name: typeName }).click()
  }

  async clickSave() {
    await this.page.getByRole('button', { name: 'Save' }).click()
  }

  getItemCheckbox(name: string): Locator {
    // Unchecked: aria-label="Add {name}" (src/components/item/ItemCard/index.tsx:143)
    return this.page.getByLabel(`Add ${name}`)
  }

  getAssignedItemCheckbox(name: string): Locator {
    // Checked: aria-label="Remove {name}" (src/components/item/ItemCard/index.tsx:143)
    return this.page.getByLabel(`Remove ${name}`)
  }

  async toggleItem(name: string) {
    const addCheckbox = this.page.getByLabel(`Add ${name}`)
    const removeCheckbox = this.page.getByLabel(`Remove ${name}`)
    const isAdd = await addCheckbox.isVisible()
    if (isAdd) {
      await addCheckbox.click()
    } else {
      await removeCheckbox.click()
    }
  }
}
