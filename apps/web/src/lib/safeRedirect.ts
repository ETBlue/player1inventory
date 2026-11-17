/**
 * The path to go to after sign-in, from the `redirect` search value of
 * `/sign-in` (households H5b, decision T24).
 *
 * `redirect` comes from the URL, so anyone can write a link with any value
 * in it. Following it as it is would be an open redirect: a link to our
 * sign-in page that sends the person to another site after they sign in.
 * So only a path on this site is kept. Anything else gives `/`.
 *
 * A path is kept only when it:
 * - is a string that starts with `/`,
 * - does not start with `//` or `/\` (a browser reads both as "another
 *   host", for example `//evil.example`),
 * - holds no control character (a browser drops a tab or a new line inside
 *   a URL, so `/<tab>/evil.example` would become `//evil.example`),
 * - still names this site, and still does not start with `//`, AFTER the
 *   browser's own rules are applied. `/..//evil.example` passes the checks
 *   above, but the browser removes the `..` and goes to `//evil.example`.
 *   `%2e%2e` counts as `..` too. So the path is resolved with `new URL`,
 *   checked again, and the RESOLVED path is returned: what is checked is
 *   what is followed.
 */
export function safeRedirectPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/'
  if (!raw.startsWith('/')) return '/'
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the check is about control characters
  if (/[\u0000-\u001f\u007f]/.test(raw)) return '/'
  const origin = window.location.origin
  let url: URL
  try {
    url = new URL(raw, origin)
  } catch {
    return '/'
  }
  if (url.origin !== origin) return '/'
  if (url.pathname.startsWith('//')) return '/'
  return url.pathname + url.search + url.hash
}
