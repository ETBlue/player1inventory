import type { Download, Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { withSteps } from './step'

export class SettingsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
    withSteps(this)
  }

  async createTagType(name: string) {
    await this.page.goto('/settings/household/tags')
    // "New Tag Type" button opens a dialog (src/routes/settings/household/tags/index.tsx)
    await this.page.getByRole('button', { name: /new tag type/i }).click()
    // Name field inside the dialog — label from t('settings.tags.tagType.nameLabel') = "Name"
    // (src/components/tag/TagTypeInfoForm/TagTypeInfoForm.tsx)
    await this.page.getByLabel('Name').fill(name)
    // Save button submits the form
    await this.page
      .getByRole('dialog')
      .getByRole('button', { name: /save/i })
      .click()
    // Wait for the tag type card heading to appear.
    // Use .first() to avoid strict-mode violations when a same-named default tag type is already seeded.
    await this.page.getByRole('heading', { name, level: 2 }).first().waitFor()
  }

  /**
   * The household config page, `/settings/household`. It holds the Export and
   * Import cards (src/routes/settings/household/index.tsx).
   *
   * Not `/settings`: on desktop that page only redirects here, and on mobile
   * it is an accordion with no Export or Import card.
   */
  async navigateTo() {
    await this.page.goto('/settings/household')
  }

  /**
   * Open the 👤 user view of the desktop sidebar: Theme, Language and Data
   * mode (src/components/global/Sidebar/UserSidebar.tsx). These cards are on
   * no page of their own any more. Desktop viewport only: the sidebar is
   * `hidden lg:flex`.
   *
   * The button label is t('settings.user.title') = "Preferences" in local
   * mode and in E2E cloud mode, where there is no Clerk user name
   * (src/components/settings/UserSettingsPanel/UserSettingsPanel.tsx).
   */
  async openUserSidebar(): Promise<Locator> {
    await this.page.goto('/')
    const sidebar = this.page.getByRole('navigation', {
      name: 'Sidebar navigation',
    })
    await sidebar.getByRole('button', { name: 'Preferences' }).click()
    // The user view replaces the main view, and its Back button takes focus.
    await sidebar.getByRole('button', { name: 'Back' }).waitFor()
    return sidebar
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
    await this.page
      .locator('input[type="file"][accept=".json"]')
      .setInputFiles(filePath)
  }

  /**
   * `ImportCard`'s conflict dialog.
   *
   * SCOPED TO role="dialog" ON PURPOSE. "Clear & import" is the same visible
   * string in two different dialogs, and the role is what separates them:
   *
   *   - `ConflictDialog` (src/components/settings/ConflictDialog) is built on
   *     src/components/ui/dialog.tsx, which wraps `DialogPrimitive.Content`
   *     from @radix-ui/react-dialog -> role="dialog";
   *   - `DataModeCard`'s three dialogs are built on
   *     src/components/ui/alert-dialog.tsx, which wraps
   *     `AlertDialogPrimitive.Content` -> role="alertdialog".
   *
   * Before H1, `/settings` rendered both cards on one page. Now `ImportCard`
   * lives on `/settings/household` and `DataModeCard` in the 👤 sidebar view,
   * which that page never shows (it shows the household view). The role is
   * kept anyway, so the locator stays safe if the two cards meet again:
   * `ConflictDialog` is the only role="dialog" on the page.
   */
  getConflictDialog(): Locator {
    return this.page.getByRole('dialog')
  }

  /**
   * Press one of the four strategy buttons in the conflict dialog.
   *
   * The labels are `settings.import.conflictDialog.{cancel,skip,replace,clear}`
   * in apps/web/src/i18n/locales/en.json. They are typed as a union so a typo
   * is a compile error. The root `pnpm build` type-checks this directory
   * (`pnpm typecheck:e2e`, since issue #322).
   */
  async chooseConflictStrategy(
    label: 'Cancel' | 'Skip conflicts' | 'Replace matches' | 'Clear & import',
  ): Promise<void> {
    await this.getConflictDialog()
      .getByRole('button', { name: label, exact: true })
      .click()
  }

  /**
   * Press "Clear & import" in the conflict dialog and, in cloud mode, pass
   * the typed-name confirm that follows it (owner decision O40, households H6
   * task K.0). Pass the household name in cloud, and `null` in local mode,
   * which has no household and still runs the import on the first press.
   *
   * The confirm is `DeleteButton`'s typed-name mode (`ConflictDialog.tsx`).
   * It opens as a `role="alertdialog"` on top of the conflict dialog, with a
   * text field labelled "Type {name} to confirm"
   * (`settings.household.danger.typeName`) and its own "Clear & import"
   * button. This checks that button is DISABLED before the name is typed, so
   * a confirm that let the import run at once would fail here.
   *
   * `beforeTyping` runs while the confirm is open and the name is not typed
   * yet, so a spec can check that nothing was cleared at that point.
   */
  async chooseClearAndImport(
    householdName: string | null,
    beforeTyping?: () => Promise<void>,
  ): Promise<void> {
    await this.chooseConflictStrategy('Clear & import')
    if (householdName === null) return
    const confirm = this.page.getByRole('alertdialog')
    const button = confirm.getByRole('button', {
      name: 'Clear & import',
      exact: true,
    })
    await expect(
      confirm.getByLabel(`Type ${householdName} to confirm`),
    ).toBeVisible()
    await expect(button).toBeDisabled()
    if (beforeTyping) await beforeTyping()
    await confirm.getByRole('textbox').fill(householdName)
    await button.click()
  }

  /**
   * "Import into which location?" (`ImportLocationDialog`,
   * src/components/settings/ImportLocationDialog, households H4 task E.4).
   * Cloud mode only. It opens before the import of a LOCAL backup (a location
   * with the id `'local'`) or of a file with no locations, except on
   * "Clear & import". Its accessible name is its title,
   * t('settings.import.locationDialog.title').
   */
  getImportLocationDialog(): Locator {
    return this.page.getByRole('dialog', {
      name: 'Import into which location?',
    })
  }

  /**
   * Pick a location in "Import into which location?" and press Import.
   * `name` is a location name as stored, or "New location".
   */
  async chooseImportLocation(name: string): Promise<void> {
    const dialog = this.getImportLocationDialog()
    await dialog.getByRole('radio', { name, exact: true }).click()
    // t('settings.import.locationDialog.confirm') = "Import"
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  }

  async waitForImportDone(mode: 'local' | 'cloud'): Promise<void> {
    if (mode === 'local') {
      // Local import fires toast.success then resets to idle — no inline text shown
      // t('settings.import.success') = "Data imported successfully"
      await this.page
        .getByText('Data imported successfully')
        .waitFor({ state: 'visible', timeout: 15000 })
    } else {
      // Cloud import sets phase:'done' which renders inline text for 2 seconds
      // t('settings.import.importDone') = "Import complete."
      await this.page
        .getByText('Import complete.')
        .waitFor({ state: 'visible', timeout: 30000 })
    }
  }
}
