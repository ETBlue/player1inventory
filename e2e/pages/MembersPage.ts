import { expect, type Locator, type Page } from '@playwright/test'
import { withSteps } from './step'

/**
 * The Members page, `/settings/household/members`, cloud only
 * (apps/web/src/routes/settings/household/members.tsx, households H5b task
 * G.9).
 *
 * Two traps from the review of G.9:
 * - Button names repeat: the row's "Leave household" and the confirm's
 *   "Leave household", and the same for Remove and Revoke. Every confirm is
 *   clicked inside `getByRole('alertdialog')`.
 * - The role pickers are Radix `Select`, not `<select>`: click the combobox,
 *   then the option. `selectOption` does not work.
 */
export class MembersPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
    withSteps(this)
  }

  async navigateTo() {
    await this.page.goto('/settings/household/members')
  }

  main(): Locator {
    return this.page.getByRole('main')
  }

  /** The row of one person, found by the name shown on it. */
  memberRow(name: string): Locator {
    return this.main().getByRole('listitem').filter({ hasText: name })
  }

  /** The open invite dialog, its form or its link step. */
  inviteDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Invite someone' })
  }

  /** The open confirm of Remove, Leave or Revoke (`DeleteButton`). */
  confirmDialog(): Locator {
    return this.page.getByRole('alertdialog')
  }

  /** Open the invite dialog (`settings.household.members.invite`). */
  async openInvite() {
    await this.page.getByRole('button', { name: 'Invite someone' }).click()
    await expect(this.inviteDialog()).toBeVisible()
  }

  /**
   * In the invite form, give `location` a role. The picker's accessible name
   * is the location's name; its options are "No access" and the three roles.
   */
  async chooseLocationRole(
    location: string,
    role: 'No access' | 'Organizer' | 'Participant' | 'Viewer',
  ) {
    await this.inviteDialog()
      .getByRole('combobox', { name: location, exact: true })
      .click()
    await this.page.getByRole('option', { name: role, exact: true }).click()
  }

  /**
   * Press "Create invite link" and return the token, read from the dialog's
   * read-only "Invite link" field (not the clipboard, which needs
   * permissions). The field holds `<origin>/join/<token>`.
   */
  async createLink(): Promise<string> {
    await this.inviteDialog()
      .getByRole('button', { name: 'Create invite link' })
      .click()
    const field = this.inviteDialog().getByRole('textbox', {
      name: 'Invite link',
    })
    await expect(field).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/)
    const link = await field.inputValue()
    const token = link.split('/join/')[1]
    if (!token) throw new Error(`no token in the invite link "${link}"`)
    return token
  }

  /** Close the invite dialog with Done (`common.done`). */
  async closeInvite() {
    await this.inviteDialog().getByRole('button', { name: 'Done' }).click()
    await expect(this.inviteDialog()).toHaveCount(0)
  }

  /** Open the Remove confirm of `name` (`removeLabel`, "Remove <name>"). */
  async openRemove(name: string) {
    await this.main()
      .getByRole('button', { name: `Remove ${name}`, exact: true })
      .click()
    await expect(this.confirmDialog()).toBeVisible()
  }

  /** Remove `name`: the row's button, then Remove in the confirm. */
  async removeMember(name: string) {
    await this.openRemove(name)
    await this.confirmDialog()
      .getByRole('button', { name: 'Remove', exact: true })
      .click()
  }

  /** Open the Leave confirm from the caller's own row. */
  async openLeave() {
    await this.main()
      .getByRole('button', { name: 'Leave household', exact: true })
      .click()
    await expect(this.confirmDialog()).toBeVisible()
  }

  /**
   * Leave the household. Leave ends in a full page load of `/`
   * (`useLeaveHousehold`), so this waits for that URL.
   */
  async leaveHousehold() {
    await this.openLeave()
    await this.confirmDialog()
      .getByRole('button', { name: 'Leave household', exact: true })
      .click()
    await this.page.waitForURL((url) => url.pathname === '/')
  }

  /** Set the household role of `name` with the row's picker (owner only). */
  async setHouseholdRole(name: string, role: 'Member' | 'Manager') {
    await this.main()
      .getByRole('combobox', { name: `Household role of ${name}` })
      .click()
    await this.page.getByRole('option', { name: role, exact: true }).click()
  }
}
