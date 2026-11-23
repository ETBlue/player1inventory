import { expect, type Locator, type Page } from '@playwright/test'
import { withSteps } from './step'

/**
 * The join page of an invite link, `/join/<token>`
 * (apps/web/src/routes/join/$token.tsx, households H5b task G.7).
 */
export class JoinPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
    withSteps(this)
  }

  async navigateTo(token: string) {
    await this.page.goto(`/join/${token}`)
  }

  /** The page's only `h1`: "Join a household", or "Join <household>". */
  heading(): Locator {
    return this.page.getByRole('heading', { level: 1 })
  }

  /**
   * Local mode: "Sign in to join" (`join.signIn`). It switches to cloud mode
   * and reloads. The E2E build has no Clerk, so the reload lands on this
   * page again, in cloud mode.
   */
  async signInToJoin() {
    await this.page.getByRole('button', { name: 'Sign in to join' }).click()
  }

  /**
   * Press Join (`join.join`), then wait for the page the join goes to: the
   * pantry, `/`, loaded with `location.replace` (a new document).
   */
  async join() {
    await this.page.getByRole('button', { name: 'Join', exact: true }).click()
    await this.page.waitForURL((url) => url.pathname === '/')
  }

  /** "This invite is no longer valid. Ask for a new one." (`join.invalid`). */
  invalidMessage(): Locator {
    return this.page.getByText(
      'This invite is no longer valid. Ask for a new one.',
    )
  }

  /** Wait until the page shows that the link is no longer valid. */
  async expectInvalid() {
    await expect(this.invalidMessage()).toBeVisible()
    await expect(this.heading()).toHaveText('Join a household')
  }
}
