import { expect, type Locator, type Page } from '@playwright/test'
import { withSteps } from './step'

/** A location role as the page shows it (`roles.location.*`). */
export type LocationRoleText = 'Organizer' | 'Participant' | 'Viewer'

/**
 * The people page of one location, `/settings/household/locations/$id`,
 * cloud only (apps/web/src/routes/settings/household/locations/$id.tsx,
 * households H5c task H.5).
 *
 * Two traps, the same as on the Members page (MembersPage.ts):
 * - Button names repeat. The row's "Leave location" and the confirm's
 *   "Leave location", and the same for Remove. Every confirm is clicked
 *   inside `getByRole('alertdialog')`.
 * - The role pickers are Radix `Select`, not `<select>`: click the combobox,
 *   then the option. `selectOption` does not work.
 */
export class LocationPeoplePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
    withSteps(this)
  }

  /**
   * The route `/settings/household/locations/$id` (`createFileRoute` in
   * apps/web/src/routes/settings/household/locations/$id.tsx:47). In local
   * mode it redirects to the list.
   */
  async navigateTo(locationId: string) {
    await this.page.goto(`/settings/household/locations/${locationId}`)
  }

  /** The app's `<main>` (apps/web/src/components/global/Layout/Layout.tsx:36). */
  main(): Locator {
    return this.page.getByRole('main')
  }

  /** The location name, as stored (`<h1>` in the toolbar, `$id.tsx`). */
  heading(): Locator {
    return this.main().getByRole('heading', { level: 1 })
  }

  /**
   * The row of one person, found by their name. Each row is an `<li>` of
   * `LocationPeopleList` (components/location/LocationPeopleList). The page
   * has no other list in `main`.
   */
  personRow(name: string): Locator {
    return this.main().getByRole('listitem').filter({ hasText: name })
  }

  /**
   * The role picker of a row: `aria-label` "Location role of {name}"
   * (`settings.locations.people.roleLabel`, LocationPeopleList.tsx). Absent
   * when the caller may not move the person to any other role.
   */
  rolePicker(name: string): Locator {
    return this.main().getByRole('combobox', {
      name: `Location role of ${name}`,
      exact: true,
    })
  }

  /**
   * The Remove button of a row: `aria-label` "Remove {name} from this
   * location" (`settings.locations.people.removeLabel`, LocationPeopleList.tsx).
   */
  removeButton(name: string): Locator {
    return this.main().getByRole('button', {
      name: `Remove ${name} from this location`,
      exact: true,
    })
  }

  /** The "No organizer" note (`settings.locations.people.noOrganizerNote`). */
  noOrganizerNote(): Locator {
    return this.main().getByText(
      'This location has no organizer. Only a household owner or manager can rename it or add people.',
    )
  }

  /** The Add person dialog (`AddLocationPersonDialog`, title "Add person"). */
  addDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Add person' })
  }

  /** The open confirm of Remove or Leave (`DeleteButton`). */
  confirmDialog(): Locator {
    return this.page.getByRole('alertdialog')
  }

  /** Open Add person (`settings.locations.people.add`, `$id.tsx`). */
  async openAddPerson() {
    await this.main()
      .getByRole('button', { name: 'Add person', exact: true })
      .click()
    await expect(this.addDialog()).toBeVisible()
  }

  /**
   * In the open Add person dialog, open the Role picker. Its accessible name
   * is "Role" (`aria-labelledby` on the label `settings.locations.people.addRole`).
   */
  async openAddRoleChoices() {
    await this.addDialog()
      .getByRole('combobox', { name: 'Role', exact: true })
      .click()
  }

  /**
   * Add `name` with `role`: Add person, the Person picker ("Person",
   * `settings.locations.people.addPerson`), the Role picker, then the
   * dialog's own Add person button. Waits for the dialog to close, which
   * happens only after the write and its reads (`AddPersonSection`).
   */
  async addPerson(name: string, role: LocationRoleText) {
    await this.openAddPerson()
    await this.addDialog()
      .getByRole('combobox', { name: 'Person', exact: true })
      .click()
    await this.page.getByRole('option', { name, exact: true }).click()
    await this.openAddRoleChoices()
    await this.page.getByRole('option', { name: role, exact: true }).click()
    await this.addDialog()
      .getByRole('button', { name: 'Add person', exact: true })
      .click()
    await expect(this.addDialog()).toHaveCount(0)
  }

  /**
   * Change the role of `name` with the row's picker: the `SelectTrigger`
   * and its `onValueChange` (components/location/LocationPeopleList/
   * LocationPeopleList.tsx:126-138).
   */
  async setRole(name: string, role: LocationRoleText) {
    await this.rolePicker(name).click()
    await this.page.getByRole('option', { name: role, exact: true }).click()
  }

  /** Open the Remove confirm of `name`. */
  async openRemove(name: string) {
    await this.removeButton(name).click()
    await expect(this.confirmDialog()).toBeVisible()
  }

  /**
   * Remove `name`: the row's button, then Remove in the confirm. The
   * confirm's button is `settings.household.members.remove`, "Remove"
   * (LocationPeopleList.tsx:169).
   */
  async removePerson(name: string) {
    await this.openRemove(name)
    await this.confirmDialog()
      .getByRole('button', { name: 'Remove', exact: true })
      .click()
  }

  /** Open the Leave confirm (`settings.locations.people.leave`, `$id.tsx`). */
  async openLeave() {
    await this.main()
      .getByRole('button', { name: 'Leave location', exact: true })
      .click()
    await expect(this.confirmDialog()).toBeVisible()
  }

  /**
   * Close an open confirm with Cancel: `AlertDialogCancel`, `common.cancel`
   * (components/shared/DeleteButton/DeleteButton.tsx:88).
   */
  async cancelConfirm() {
    await this.confirmDialog().getByRole('button', { name: 'Cancel' }).click()
    await expect(this.confirmDialog()).toHaveCount(0)
  }

  /**
   * Leave the location: the button, then Leave location in the confirm.
   * The confirm's button is `settings.locations.people.leave`, "Leave
   * location" (`$id.tsx:271`).
   */
  async leaveLocation() {
    await this.openLeave()
    await this.confirmDialog()
      .getByRole('button', { name: 'Leave location', exact: true })
      .click()
  }
}
