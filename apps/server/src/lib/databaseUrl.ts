// Checks on database URLs, shared by the server and by `scripts/`.
//
// | Who | What it checks |
// |---|---|
// | `scripts/verify-migration.ts`, through `scripts/databaseIsolation.ts` | `TEST_DATABASE_URL` and `TEST_DIRECT_URL` are not another database of `.env` (that script DROPS the schema) |
// | `lib/prisma.ts`, `resolveDatasourceUrl` | with `E2E_DATABASE=local`, `E2E_LOCAL_DATABASE_URL` is on this computer and is not another database of `.env` (E2E speed plan, task S.6, decision D10) |
//
// This file lives in `src/` since task S.6, and `scripts/databaseIsolation.ts`
// re-exports it. So the `scripts` type-check pass also checks this one `src`
// file (root CLAUDE.md, *The no-overlap trick*). Keep it free of imports: an
// import here would pull more `src` files into that pass.
//
// No message here prints a URL, a host or a password, EXCEPT the old
// `assertNotAnotherDatabase` message, which prints the host and database name
// (`host/db`) and is kept as it was for `verify-migration.ts`. New code calls
// `findSameDatabase` and names only the variable.

/**
 * Environment variable names that hold the TEST database's own URLs. For
 * `assertNotAnotherDatabase` they are the target of the check, so they are
 * never compared against themselves.
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
 * The name of the first variable in `env` (sorted by name) whose name ends in
 * `_URL`, is not in `skip`, and points at the same database as `rawUrl`. Or
 * `undefined` when there is none, or when `rawUrl` is not a URL.
 *
 * Every variable whose name ends in `_URL` is compared, found by name rather
 * than from a hardcoded list. A hardcoded list once held `DATABASE_URL` and
 * `DIRECT_URL` only, so `PROD_COPY_DATABASE_URL` and `PROD_COPY_DIRECT_URL`
 * were not compared at all.
 */
export function findSameDatabase(
  rawUrl: string,
  env: Record<string, string | undefined>,
  skip: readonly string[],
): string | undefined {
  const target = databaseIdentityOrUndefined(rawUrl)
  if (target === undefined) return undefined
  // Sorted so the named variable is the same on every run when more than one
  // matches. `Object.entries(process.env)` order is not something to rely on.
  for (const otherLabel of Object.keys(env).sort()) {
    if (!otherLabel.endsWith('_URL')) continue
    if (skip.includes(otherLabel)) continue
    const otherUrl = env[otherLabel]
    if (!otherUrl) continue
    if (databaseIdentityOrUndefined(otherUrl) === target) return otherLabel
  }
  return undefined
}

/**
 * Throws if `rawUrl` resolves to the same database as any OTHER database URL in
 * `env`, except the two `TEST_URL_VAR_NAMES`. The error names the offending
 * variable, so the person knows which paste caused it.
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
  const otherLabel = findSameDatabase(rawUrl, env, TEST_URL_VAR_NAMES)
  if (otherLabel !== undefined) {
    throw new Error(
      `${label} resolves to the same database (${target}) as ${otherLabel} — refusing to run, this script drops the schema`,
    )
  }
}

/** Host names that mean "this computer". `URL` keeps IPv6 hosts in brackets. */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const

/** `true` for a loopback name, or a Unix socket path (it starts with `/`). */
function isLocalHost(host: string): boolean {
  if ((LOOPBACK_HOSTS as readonly string[]).includes(host.toLowerCase())) return true
  let decoded: string
  try {
    decoded = decodeURIComponent(host)
  } catch {
    return false
  }
  return decoded.startsWith('/')
}

/**
 * `true` when every host the URL names is on this computer: `localhost`,
 * `127.0.0.1`, `::1`, or a Unix socket path. Checked:
 *
 * - the host in the URL itself. An empty host (`postgresql:///db`) means the
 *   default socket, which is local. A percent-encoded socket path
 *   (`postgresql://%2Ftmp/db`) is local too;
 * - every `host` and `hostaddr` query parameter. Postgres clients connect to
 *   these instead of the URL's host, so a Neon host hidden in `?host=` would
 *   otherwise pass.
 *
 * Several hosts in one URL (`h1,h2`) are one host string here, so they fail.
 * A value that is not a URL is `false`.
 */
export function isLocalDatabaseUrl(rawUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') return false
  if (parsed.hostname !== '' && !isLocalHost(parsed.hostname)) return false
  for (const name of ['host', 'hostaddr']) {
    for (const value of parsed.searchParams.getAll(name)) {
      if (!isLocalHost(value)) return false
    }
  }
  return true
}

/** The two E2E databases (E2E speed plan, decision D9). */
export const E2E_DATABASE_KINDS = ['local', 'neon'] as const
export type E2eDatabaseKind = (typeof E2E_DATABASE_KINDS)[number]

/**
 * Which E2E database `env.E2E_DATABASE` asks for. Unset or empty means
 * `local` (owner answer P7-A: the fast path is the default, and a missing
 * local database stops the run with a message that names the fix).
 *
 * Any other value throws. The message does NOT repeat the value: a URL pasted
 * into the wrong variable would otherwise land in the log.
 */
export function e2eDatabaseKind(env: Record<string, string | undefined>): E2eDatabaseKind {
  const value = env.E2E_DATABASE
  if (value === undefined || value === '') return 'local'
  if ((E2E_DATABASE_KINDS as readonly string[]).includes(value)) return value as E2eDatabaseKind
  throw new Error('E2E_DATABASE must be "local" or "neon" (or unset, which means "local").')
}
