import type { Locator, Page } from '@playwright/test'
import { withSteps } from './step'

/**
 * The ownership offer banner (households H6b task K.6,
 * apps/web/src/components/household/OwnershipOfferBanner). It is mounted in
 * `__root.tsx`, so it shows on every cloud page, above the page itself.
 *
 * It is a `<section>` with `aria-label` "Ownership offers"
 * (`ownership.banner.label`), so its role is `region`. It renders NOTHING
 * when there is no open offer and no notice, so `region()` has a count of 0
 * then. After an answer the section unmounts and mounts again with the
 * notice, so always look it up again; never keep an old Locator result.
 */
export class OwnershipBanner {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
    withSteps(this)
  }

  region(): Locator {
    return this.page.getByRole('region', { name: 'Ownership offers' })
  }

  /**
   * The transfer text (`ownership.banner.transfer`):
   * "{name} wants to make you the owner of {household}."
   */
  transferText(fromName: string, household: string): Locator {
    return this.region().getByText(
      `${fromName} wants to make you the owner of ${household}.`,
      { exact: true },
    )
  }

  /**
   * The hand-over text (`ownership.banner.handover`): "The owner of
   * {household} deleted their account. Do you want to become the owner?"
   */
  handoverText(household: string): Locator {
    return this.region().getByText(
      `The owner of ${household} deleted their account. Do you want to become the owner?`,
      { exact: true },
    )
  }

  /** "You are now the owner of {household}." (`ownership.accepted`). */
  acceptedNotice(household: string): Locator {
    return this.region().getByText(`You are now the owner of ${household}.`, {
      exact: true,
    })
  }

  /** The Accept button. With one offer on screen there is one. */
  acceptButton(): Locator {
    return this.region().getByRole('button', { name: 'Accept', exact: true })
  }

  /** Decline, shown for a transfer offer only. */
  declineButton(): Locator {
    return this.region().getByRole('button', { name: 'Decline', exact: true })
  }

  async accept() {
    await this.acceptButton().click()
  }

  async decline() {
    await this.declineButton().click()
  }
}
