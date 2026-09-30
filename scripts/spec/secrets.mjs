// The patterns of the secret guard (`guard.mjs`), for both sites.
//
// The developer Vitest report (`spec-dist-dev/`) contains the full test source
// and Vitest's `config.env`. Every `VITE_` value is public by design, but a
// real secret added with a `VITE_` prefix by mistake would be published too.
// The Playwright reports (`spec-dist/`) can show spec source and error text.
// `build.mjs` runs the guard before it writes anything, and stops the build on
// any match.
//
// Plain substrings, on purpose. A false match only stops a publish, which is
// safe. A clever pattern that misses a real key is not.
//
// A Clerk publishable key (`pk_test_…`, `pk_live_…`) is public and must not match.
export const SECRET_PATTERNS = [
  'sk_live',
  'sk_test',
  'DATABASE_URL',
  'postgres://',
  'postgresql://',
  'BEGIN PRIVATE KEY',
]

/** The patterns found in `text`, in the order of `SECRET_PATTERNS`. Empty when clean. */
export function findSecrets(text) {
  const haystack = String(text)
  return SECRET_PATTERNS.filter((pattern) => haystack.includes(pattern))
}
