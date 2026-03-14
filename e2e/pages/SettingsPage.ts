import type { Page } from '@playwright/test'

export class SettingsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async createTagType(name: string) {
    await this.page.goto('/settings/tags')
    // Label text is "Name" (src/routes/settings/tags/index.tsx:421)
    await this.page.getByLabel('Name').fill(name)
    // Button label is "New Tag Type" (src/routes/settings/tags/index.tsx:435)
    await this.page.getByRole('button', { name: /new tag type/i }).click()
    // Wait for the tag type card heading to appear.
    // Use .first() to avoid strict-mode violations when a same-named default tag type is already seeded.
    await this.page.getByRole('heading', { name, level: 3 }).first().waitFor()
  }
}
