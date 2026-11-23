/**
 * The app's own sign-in and sign-up pages (cloud mode).
 *
 * Both pages take `?redirect=<path>`: the page to go back to afterwards
 * (households H5b, decision T24). Each page links to the other one with the
 * same `redirect`, so a person who opens an invite link, then chooses
 * "Sign up", still comes back to the link.
 *
 * The sign-up page exists since 2026-11-23. Before, Clerk's "Sign up" link
 * went to Clerk's hosted page, which dropped `redirect`
 * (docs/global/bugs/2026-11-23-bug-join-redirect-lost-on-sign-up.md).
 */
export const SIGN_IN_PATH = '/sign-in'
export const SIGN_UP_PATH = '/sign-up'

/**
 * True on the sign-in page and the sign-up page. Pages that must not send a
 * signed-out person away, or ask anything yet, use this one rule.
 */
export function isAuthPage(pathname: string): boolean {
  return pathname === SIGN_IN_PATH || pathname === SIGN_UP_PATH
}

/**
 * The URL of an auth page that returns to `path` afterwards. `path` must
 * already be checked with `safeRedirectPath`. `/` needs no `redirect`, so
 * the plain page is returned.
 */
export function authPageUrl(
  page: typeof SIGN_IN_PATH | typeof SIGN_UP_PATH,
  path: string,
): string {
  if (path === '/') return page
  return `${page}?redirect=${encodeURIComponent(path)}`
}
