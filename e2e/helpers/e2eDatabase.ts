import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Which database the cloud E2E run uses (E2E speed plan, task S.8, decisions
// D9 and D11). One rule for `e2e/playwright.config.ts` (which cloud project
// exists, and the API server's `E2E_DATABASE`) and `e2e/global-setup.ts` (what
// `GET /e2e/database` must answer).
//
// The same rule as the server's `e2eDatabaseKind`
// (apps/server/src/lib/databaseUrl.ts): unset or empty means `local` (owner
// answer P7-A), `local` and `neon` are themselves, anything else throws. The
// message does not repeat the value.

export type E2eDatabaseKind = 'local' | 'neon'

export function e2eDatabaseKind(
  env: Record<string, string | undefined> = process.env,
): E2eDatabaseKind {
  const value = env.E2E_DATABASE
  if (value === undefined || value === '' || value === 'local') return 'local'
  if (value === 'neon') return 'neon'
  throw new Error('E2E_DATABASE must be "local", "neon" or unset (local).')
}

/** The project that runs the cloud specs for this database (decision D11). */
export function cloudProjectFor(kind: E2eDatabaseKind): 'cloud' | 'cloud-neon' {
  return kind === 'neon' ? 'cloud-neon' : 'cloud'
}

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/server/prisma/migrations',
)

/**
 * The migration folders of this branch: the directories in
 * `apps/server/prisma/migrations`, sorted by name. `migration_lock.toml` is a
 * file and does not count. (`ls … | grep -c _` counts it, so it gives one
 * more than this.)
 */
export function migrationFolders(dir: string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}
