import type { Locator, Page } from '@playwright/test'
import { withSteps } from './step'

/** `s` with every RegExp special character escaped. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * **Switch to…**, the **Create new** dialog and the one-time "household
 * changed" message (households H7 tasks L.3 and L.4).
 *
 * | Part | Where in apps/web/src | Found by |
 * |---|---|---|
 * | the trigger | `components/household/HouseholdSwitcher/HouseholdSwitcher.tsx`, the last item of the desktop household sidebar | button "Switch to…" (`householdSwitcher.trigger`) |
 * | one row per household | the same file | `menuitemradio`, named "{household} {role}", `aria-checked` on the current one |
 * | Create new | the same file | `menuitem` "Create new" (`householdSwitcher.createNew`) |
 * | the dialog | `components/household/CreateHouseholdDialog/CreateHouseholdDialog.tsx` | `dialog` "Create a new household" (`createHouseholdDialog.title`) |
 * | the message after a stale tab reloads | `components/global/HouseholdChangedNotice/HouseholdChangedNotice.tsx` | an `<output>` (role `status`) holding both household names |
 *
 * The household sidebar shows on `/settings/household` and its list pages,
 * on a desktop screen only (`hidden lg:flex`). The cloud project uses
 * Desktop Chrome, so `navigateTo` opens `/settings/household`.
 */
export class HouseholdSwitcher {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
    withSteps(this)
  }

  async navigateTo() {
    await this.page.goto('/settings/household')
  }

  sidebar(): Locator {
    return this.page.getByRole('navigation', { name: 'Sidebar navigation' })
  }

  trigger(): Locator {
    return this.sidebar().getByRole('button', {
      name: 'Switch to…',
      exact: true,
    })
  }

  /** The open menu. Radix names it by its trigger. */
  menu(): Locator {
    return this.page.getByRole('menu', { name: 'Switch to…' })
  }

  /**
   * The row of one household. Its accessible name is the household name as
   * stored, a space, then the person's role there ("The Lin home Owner").
   */
  row(householdName: string): Locator {
    return this.menu().getByRole('menuitemradio', {
      name: new RegExp(`^${escapeRegExp(householdName)} `),
    })
  }

  async open() {
    await this.trigger().click()
    await this.menu().waitFor()
  }

  /** Open the menu and choose another household. The page then loads `/`. */
  async switchTo(householdName: string) {
    await this.open()
    await this.row(householdName).click()
  }

  createDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Create a new household' })
  }

  async openCreateDialog() {
    await this.open()
    await this.menu()
      .getByRole('menuitem', { name: 'Create new', exact: true })
      .click()
    await this.createDialog().waitFor()
  }

  /** Create new, type the name, press Create. The page then loads `/`. */
  async createNew(name: string) {
    await this.openCreateDialog()
    await this.createDialog().getByLabel('Household name').fill(name)
    await this.createDialog()
      .getByRole('button', { name: 'Create', exact: true })
      .click()
  }

  /**
   * The one-time message after a stale tab was moved (owner decision O51).
   *
   * THE ONLY PLACE THAT MATCHES ITS TEXT. The sentence may still change
   * (owner question O56), so this looks for the `<output>` (role `status`)
   * that holds BOTH names, not for the full sentence. Today's English text
   * (`householdChanged.notice`): "You are now in {household}. Your last
   * change was not saved, because this page still showed {oldHousehold}."
   */
  changedNotice(nowIn: string, oldHousehold: string): Locator {
    return this.page
      .getByRole('status')
      .filter({ hasText: nowIn })
      .filter({ hasText: oldHousehold })
  }
}
