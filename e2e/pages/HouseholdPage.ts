import { expect, type Locator, type Page } from '@playwright/test'
import { withSteps } from './step'

/** A button of the household danger zone (`settings.household.danger.*`). */
export type HouseholdPurge =
  | 'Clear household'
  | 'Delete all locations'
  | 'Delete household'

/**
 * The household page, `/settings/household`, and its danger zone, cloud only
 * (apps/web/src/routes/settings/household/index.tsx, households H6 task J.7).
 *
 * The danger zone is `HouseholdDangerZone`
 * (apps/web/src/components/settings/HouseholdDangerZone/HouseholdDangerZone.tsx).
 * It shows to the household OWNER only. Each button opens a `DeleteButton`
 * confirm in its typed-name mode
 * (apps/web/src/components/shared/DeleteButton/DeleteButton.tsx): a text
 * field, and a confirm button that stays disabled until the field equals the
 * household name exactly.
 *
 * Trap: the trigger and the confirm button have the SAME name ("Clear
 * household" twice). The confirm is always clicked inside
 * `getByRole('alertdialog')`.
 */
export class HouseholdPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
    withSteps(this)
  }

  /**
   * The route `/settings/household/` (`createFileRoute` in
   * apps/web/src/routes/settings/household/index.tsx:9).
   */
  async navigateTo() {
    await this.page.goto('/settings/household')
  }

  /** The app's `<main>` (apps/web/src/components/global/Layout/Layout.tsx:36). */
  main(): Locator {
    return this.page.getByRole('main')
  }

  /**
   * The danger zone: a `<section aria-labelledby>` named by its title
   * "Danger zone" (`settings.household.danger.title`,
   * HouseholdDangerZone.tsx:79-87), so its role is `region`.
   */
  dangerZone(): Locator {
    return this.main().getByRole('region', { name: 'Danger zone' })
  }

  /**
   * A trigger of the danger zone. Its text is the purge's label
   * (`settings.household.danger.clear` / `.deleteLocations` /
   * `.deleteHousehold`, HouseholdDangerZone.tsx:93-104).
   */
  purgeButton(purge: HouseholdPurge): Locator {
    return this.dangerZone().getByRole('button', { name: purge, exact: true })
  }

  /** The open confirm (`AlertDialogContent` in DeleteButton.tsx:135). */
  confirmDialog(): Locator {
    return this.page.getByRole('alertdialog')
  }

  /**
   * The text field of the typed-name confirm. Its label is "Type {name} to
   * confirm" (`settings.household.danger.typeName`, DeleteButton.tsx:145-162).
   */
  nameField(): Locator {
    return this.confirmDialog().getByRole('textbox')
  }

  /**
   * The confirm's own button, `AlertDialogAction` (DeleteButton.tsx:177-197).
   * Its text is the purge's label, the same as the trigger.
   */
  confirmButton(purge: HouseholdPurge): Locator {
    return this.confirmDialog().getByRole('button', {
      name: purge,
      exact: true,
    })
  }

  /** Open the confirm of one purge. */
  async openPurge(purge: HouseholdPurge) {
    await this.purgeButton(purge).click()
    await expect(this.confirmDialog()).toBeVisible()
  }

  /** Type `text` into the confirm's field, replacing what is there. */
  async typeName(text: string) {
    await this.nameField().fill(text)
  }

  /**
   * Confirm the purge: click the confirm's button, then wait for the dialog
   * to close. It closes only when the write has resolved
   * (`handleTypedConfirm`, DeleteButton.tsx:90-104).
   */
  async confirmPurge(purge: HouseholdPurge) {
    await this.confirmButton(purge).click()
    await expect(this.confirmDialog()).toHaveCount(0, { timeout: 15_000 })
  }

  /**
   * Close the confirm with Cancel: `AlertDialogCancel`, `common.cancel`
   * (DeleteButton.tsx:174-176).
   */
  async cancelConfirm() {
    await this.confirmDialog().getByRole('button', { name: 'Cancel' }).click()
    await expect(this.confirmDialog()).toHaveCount(0)
  }
}
