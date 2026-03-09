import type { Page } from '@playwright/test'

export class SettingsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async createTagType(name: string) {
    await this.page.goto('/settings/tags')
    // Input has id="newTagTypeName" (src/routes/settings/tags/index.tsx:422)
    await this.page.locator('#newTagTypeName').fill(name)
    // Button label is "New Tag Type" (src/routes/settings/tags/index.tsx:435)
    await this.page.getByRole('button', { name: /new tag type/i }).click()
    // Wait for the tag type card heading to appear
    await this.page.getByRole('heading', { name, level: 3 }).waitFor()
  }
}
