// Layout, Sidebar and Navigation all ask these functions which pages are
// full-screen (no sidebar, no bottom bar), so a route move changes one place.

// `/settings/household` or `/settings/household/<section>`, with an optional
// trailing slash. TanStack renders a list route as `/…/tags/`.
const HOUSEHOLD_LIST_PAGE = /^\/settings\/household(?:\/[^/]+)?\/?$/

// Anything below a section: `/settings/household/<section>/<id>…`.
const HOUSEHOLD_DETAIL_PAGE = /^\/settings\/household\/[^/]+\/[^/]+/

// The list pages that are full-screen on mobile, with their own Back button.
// `/settings/household` and `/settings/household/locations` are not: on mobile
// they keep the bottom bar.
const MOBILE_FULLSCREEN_LIST_PAGE =
  /^\/settings\/household\/(?:tags|vendors|recipes|shelves)\/?$/

/**
 * True for a household settings list page: `/settings/household` and
 * `/settings/household/<section>`. False for a detail page below a section.
 */
export function isHouseholdSettingsPage(pathname: string): boolean {
  return HOUSEHOLD_LIST_PAGE.test(pathname)
}

/**
 * True when the page hides the sidebar and the bottom bar.
 *
 * `desktop` is required, so no caller can forget the screen size. Components
 * pass `useIsDesktop()`.
 *
 * - Onboarding, item pages and household detail pages are full-screen on
 *   every screen.
 * - On desktop, household list pages show the sidebar.
 * - On mobile, the tags, vendors, recipes and shelves lists stay full-screen.
 */
export function isFullscreenPage(
  pathname: string,
  options: { desktop: boolean },
): boolean {
  if (pathname === '/onboarding') return true
  if (pathname.startsWith('/items/')) return true
  if (HOUSEHOLD_DETAIL_PAGE.test(pathname)) return true
  if (options.desktop) return false
  return MOBILE_FULLSCREEN_LIST_PAGE.test(pathname)
}

// The pages "Back" in the household sidebar may return to: Pantry (`/`),
// Shopping (`/shopping` and the vendor carts below it) and Cooking.
const APP_PAGE = /^(?:\/|\/shopping(?:\/.*)?|\/cooking\/?)$/

/**
 * The URL that "Back" in the household sidebar goes to: the newest Pantry,
 * Shopping or Cooking URL in the navigation history, with its search string.
 * `/` when the history holds none (it keeps only the last 50 URLs).
 *
 * `history` is the `app-navigation-history` list, oldest first.
 */
export function lastAppPage(history: string[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const url = history[i] ?? ''
    const pathname = url.split('?')[0] ?? ''
    if (APP_PAGE.test(pathname)) return url
  }
  return '/'
}
