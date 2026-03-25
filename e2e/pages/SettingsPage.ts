import type { Download, Page } from '@playwright/test'

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
    await this.page.getByRole('heading', { name, level: 2 }).first().waitFor()
  }

  async navigateTo() {
    // Navigate to the settings page
    await this.page.goto('/settings')
  }

  async triggerExport(): Promise<Download> {
    // ExportCard button: t('settings.export.button') = "Download" (apps/web/src/i18n/locales/en.json)
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.page.getByRole('button', { name: 'Download' }).click(),
    ])
    return download
  }

  async triggerImport(filePath: string): Promise<void> {
    // Hidden file input in ImportCard (apps/web/src/components/settings/ImportCard/index.tsx)
    await this.page.locator('input[type="file"][accept=".json"]').setInputFiles(filePath)
  }

  async waitForImportDone(mode: 'local' | 'cloud'): Promise<void> {
    if (mode === 'local') {
      // Local import fires toast.success then resets to idle — no inline text shown
      // t('settings.import.success') = "Data imported successfully"
      await this.page.getByText('Data imported successfully').waitFor({ state: 'visible', timeout: 15000 })
    } else {
      // Cloud import sets phase:'done' which renders inline text for 2 seconds
      // t('settings.import.importDone') = "Import complete."
      await this.page.getByText('Import complete.').waitFor({ state: 'visible', timeout: 30000 })
    }
  }
}
