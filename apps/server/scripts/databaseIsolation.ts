// The safety guard for `verify-migration.ts`, the one script in this repo that
// runs a migration against real SQL. That script opens with
// `prisma migrate reset --force`, which DROPS AND RECREATES the public schema
// of whatever it is pointed at. This module decides whether it is pointed at
// the right database.
//
// It lives in `scripts/`, not `src/`, on purpose. `apps/server`'s build runs
// `tsc` twice — once over `src`, once over `scripts` via
// `tsconfig.scripts.json` — and the second pass is cheap only because the two
// do not overlap. A module here that `scripts/` imports stays inside the second
// pass. The same module under `src/` would be pulled into both programs and
// checked twice.

/**
 * Environment variable names that hold the TEST database's own URLs. These are
 * the target of the check, so they are never compared against themselves.
 *
 * Both are excluded, and both are still checked as targets.
 *
 * `TEST_DATABASE_URL` and `TEST_DIRECT_URL` may legitimately share an identity
 * or legitimately differ. On Neon the pooled host and the direct host are often
 * different hostnames for the same database. Neither case is an error, so
 * comparing the two against each other would reject a correct setup.
 */
export const TEST_URL_VAR_NAMES = ['TEST_DATABASE_URL', 'TEST_DIRECT_URL'] as const

/**
 * Identity of the database a connection string points at, independent of
 * pooling mode or query-string differences (e.g. `?sslmode=require` on one but
 * not the other) — just enough to catch "this is secretly the same database"
 * without being fooled by cosmetic string differences.
 */
export function databaseIdentity(rawUrl: string): string {
  const parsed = new URL(rawUrl)
  return `${parsed.host}${parsed.pathname}`
}

/** `databaseIdentity`, but returns undefined instead of throwing on a value
 * that is not a URL. An unrelated variable whose name ends in `_URL` may hold
 * anything, and `new URL()` throws on a malformed value. Such a variable is
 * skipped: it names no database, so it can collide with none. */
function databaseIdentityOrUndefined(rawUrl: string): string | undefined {
  try {
    return databaseIdentity(rawUrl)
  } catch {
    return undefined
  }
}

/**
 * Throws if `rawUrl` resolves to the same database as any OTHER database URL in
 * `env`. The error names the offending variable, so the person knows which
 * paste caused it.
 *
 * Every variable whose name ends in `_URL` is compared, found by name rather
 * than from a hardcoded list. The hardcoded list this replaced held
 * `DATABASE_URL` and `DIRECT_URL` only, so `PROD_COPY_DATABASE_URL` and
 * `PROD_COPY_DIRECT_URL` — which sit in the same `apps/server/.env` — were not
 * compared at all. Pasting one of those into `TEST_DATABASE_URL` would have
 * dropped the schema of a copy of production without complaint.
 *
 * Prisma Migrate uses `directUrl` for all DDL (migrate reset/deploy), and the
 * pooled `url` only for the query engine — so BOTH `TEST_DATABASE_URL` and
 * `TEST_DIRECT_URL` must be passed here. Checking only the pooled URL misses
 * the connection that actually issues the destructive DDL.
 */
export function assertNotAnotherDatabase(
  label: string,
  rawUrl: string,
  env: Record<string, string | undefined>,
): void {
  const target = databaseIdentityOrUndefined(rawUrl)
  if (target === undefined) {
    throw new Error(`${label} is not a valid URL — refusing to run, this script drops the schema`)
  }

  // Sorted so the named variable is the same on every run when more than one
  // matches. `Object.entries(process.env)` order is not something to rely on.
  for (const otherLabel of Object.keys(env).sort()) {
    if (!otherLabel.endsWith('_URL')) continue
    if ((TEST_URL_VAR_NAMES as readonly string[]).includes(otherLabel)) continue
    const otherUrl = env[otherLabel]
    if (!otherUrl) continue
    if (databaseIdentityOrUndefined(otherUrl) !== target) continue
    throw new Error(
      `${label} resolves to the same database (${target}) as ${otherLabel} — refusing to run, this script drops the schema`,
    )
  }
}
