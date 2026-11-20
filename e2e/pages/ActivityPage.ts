import type { Locator, Page } from '@playwright/test'
import { withSteps } from './step'

/**
 * The household Activity page, `/settings/household/activity`, cloud only
 * (apps/web/src/routes/settings/household/activity.tsx, households H6 task
 * J.6). The owner and managers read the log there; anyone else gets the
 * no-access text.
 */
export class ActivityPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
    withSteps(this)
  }

  /**
   * The route `/settings/household/activity` (`createFileRoute` in
   * apps/web/src/routes/settings/household/activity.tsx:27). In local mode it
   * redirects to `/settings/household`.
   */
  async navigateTo() {
    await this.page.goto('/settings/household/activity')
  }

  /** The app's `<main>` (apps/web/src/components/global/Layout/Layout.tsx:36). */
  main(): Locator {
    return this.page.getByRole('main')
  }

  /** The page title "Activity" (`settings.household.activity.title`, activity.tsx:131-133). */
  heading(): Locator {
    return this.main().getByRole('heading', { level: 1, name: 'Activity' })
  }

  /**
   * Every row of the log. Each is an `<li>` of the `<ol>` in `ActivityList`
   * (apps/web/src/components/household/ActivityList/ActivityList.tsx:39-56).
   * The page has no other list in `main`.
   */
  entries(): Locator {
    return this.main().getByRole('listitem')
  }

  /**
   * The row whose sentence is exactly `sentence` (`activitySentence`,
   * apps/web/src/components/household/ActivityList/activitySentence.ts).
   * The row also holds the time, so the sentence is matched on its own
   * `<p data-activity-sentence>` (ActivityList.tsx:46-48).
   */
  entry(sentence: string): Locator {
    return this.entries().filter({
      has: this.page.getByText(sentence, { exact: true }),
    })
  }

  /**
   * "Only the owner and managers can see the activity."
   * (`settings.household.activity.noAccess`, activity.tsx:69-80).
   */
  noAccess(): Locator {
    return this.main().getByText(
      'Only the owner and managers can see the activity.',
      { exact: true },
    )
  }

  /**
   * The Activity link of the household sidebar ("Activity",
   * `settings.household.activity.title`, in `HOUSEHOLD_LINKS` of
   * apps/web/src/components/global/Sidebar/HouseholdSidebar.tsx:88-93). It is
   * listed for an owner or a manager only (`readsActivity`).
   */
  sidebarLink(): Locator {
    return this.page
      .getByRole('navigation', { name: 'Sidebar navigation' })
      .getByRole('link', { name: 'Activity', exact: true })
  }
}
