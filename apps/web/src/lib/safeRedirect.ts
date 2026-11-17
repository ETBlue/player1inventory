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
 *   a URL, so `/<tab>/evil.example` would become `//evil.example`).
 */
export function safeRedirectPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/'
  if (!raw.startsWith('/')) return '/'
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the check is about control characters
  if (/[\u0000-\u001f\u007f]/.test(raw)) return '/'
  return raw
}
