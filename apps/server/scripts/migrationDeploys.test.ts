// Checks the deploy groups of `verify-migration.ts` with no database.
// See `migrationDeploys.ts` for why the groups are explicit.
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MIGRATION_DEPLOYS, MIGRATIONS, migrationsOfDeploy } from './migrationDeploys.js'

const MIGRATIONS_DIR = fileURLToPath(new URL('../prisma/migrations', import.meta.url))

/** Every migration folder on disk, sorted by name, which is Prisma's apply order. */
function migrationFolders(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

describe('the deploy groups of verify-migration.ts', () => {
  it('list every migration folder from the first one under test onward, each once', () => {
    // Given the folders on disk from the first migration under test onward
    const folders = migrationFolders()
    const first = MIGRATIONS[0] ?? ''
    const underTest = folders.filter((name) => name >= first)

    // Then the groups name exactly those, with no name twice. A new migration
    // folder that is in no group fails here, before anyone runs the script.
    expect(new Set(MIGRATIONS).size).toBe(MIGRATIONS.length)
    expect([...MIGRATIONS].sort()).toEqual(underTest)
  })

  it('are in name order, so no group holds a migration that sorts before an earlier group', () => {
    // Prisma applies pending migrations in name order. If a later group held
    // a name that sorts before one an earlier group already applied, Prisma
    // would see a migration "missing" from history.
    expect(MIGRATIONS).toEqual([...MIGRATIONS].sort())
  })

  it('keep add_household_invites out of the first deploy, after add_households', () => {
    // The bug a reviewer found in H5b task G.1: its CREATE TABLE needs the
    // "HouseholdRole" type, which add_households creates.
    expect(migrationsOfDeploy('first')).not.toContain('20261118000000_add_household_invites')
    expect(migrationsOfDeploy('last')).toContain('20261118000000_add_household_invites')
    expect(MIGRATIONS.indexOf('20261118000000_add_household_invites')).toBeGreaterThan(
      MIGRATIONS.indexOf('20261104000000_add_households'),
    )
  })

  it('have four groups, matching the four migrate deploy calls in main()', () => {
    expect(MIGRATION_DEPLOYS.map((d) => d.label)).toEqual([
      'first',
      'households',
      'drop user scope',
      'last',
    ])
  })
})
