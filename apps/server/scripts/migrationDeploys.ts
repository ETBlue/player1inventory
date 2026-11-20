// Which migration `verify-migration.ts` applies in which `migrate deploy`.
//
// `verify-migration.ts` parks every migration under test, resets the test
// database, then puts the migrations back in GROUPS, one `migrate deploy` per
// group, with seed steps between the groups. Each group is listed here by name.
//
// WHY AN EXPLICIT LIST PER GROUP
//
// Until households H5b task G.1 the first deploy restored "every migration
// EXCEPT the ones named for a later deploy". So a NEW migration fell into the
// first deploy by default, and ran before the migrations it needs. G.1's
// add_household_invites did exactly that: it would have run right after
// add_user, and its CREATE TABLE fails because the "HouseholdRole" type that
// add_households creates did not exist yet. A reviewer found it by reading the
// code; no test could, because the script needs a database.
//
// Now each group names its migrations, so a new migration is in NO group until
// someone puts it in one. `migrationDeploys.test.ts` checks, with no database:
// every folder under prisma/migrations that sorts after the first one listed
// is in exactly one group, and the groups are in the same order as the names
// (Prisma applies pending migrations in name order, so a group must not hold a
// migration that sorts before one in an earlier group).
//
// This module imports nothing, so the unit test can load it without touching
// the database guard at the top of `verify-migration.ts`.

export const MIGRATION_DEPLOYS = [
  {
    // Deploy 1, after seedFixture. Migration 6 (add_user) depends on none of
    // the others, but it is parked with them so it runs in production order.
    label: 'first',
    migrations: [
      '20260830000000_add_location_and_item_stock',
      '20260916000000_add_location_to_log_and_cart',
      '20260917000000_rekey_cart_to_location_vendor',
      '20261004000000_drop_item_stock_state_columns',
      '20261008000000_add_item_note_and_wikidata_url',
      '20261031000000_add_user',
    ],
  },
  {
    // Deploy 2, after seedUsersBeforeHouseholds and
    // seedCrossHouseholdReferences: it reads the "User" rows they write.
    label: 'households',
    migrations: ['20261104000000_add_households'],
  },
  {
    // Deploy 3, after seedBetweenDeploys.
    label: 'drop user scope',
    migrations: ['20261111000000_drop_user_scope'],
  },
  {
    // Deploy 4, after seedSharedCartDuplicates. The duplicate cart rows can
    // only be written before shared_carts: its unique index refuses them.
    // add_household_invites (H5b task G.1) needs no seed step of its own, so
    // it rides in the same deploy, after shared_carts by name.
    // add_household_activity (H6 task J.1) needs no seed step either: it
    // only adds an enum and an empty table, and it names only "Household".
    // add_ownership_offers (H6b task K.1) is the same: one enum and one empty
    // table, naming only "Household" and "User".
    // This deploy runs AFTER the `finally` in main(), where restoreIfParked
    // has put back every parked migration. So the LAST group is whatever is
    // still parked at that point, and it must be the last group here.
    label: 'last',
    migrations: [
      '20261114000000_shared_carts',
      '20261118000000_add_household_invites',
      '20261120000000_add_household_activity',
      '20261120100000_add_ownership_offers',
    ],
  },
] as const

/** Every migration under test, in apply order. */
export const MIGRATIONS: readonly string[] = MIGRATION_DEPLOYS.flatMap((d) => d.migrations)

/** The migrations one deploy restores, by its label. Throws on an unknown label. */
export function migrationsOfDeploy(label: (typeof MIGRATION_DEPLOYS)[number]['label']): readonly string[] {
  const deploy = MIGRATION_DEPLOYS.find((d) => d.label === label)
  if (!deploy) throw new Error(`no deploy labelled ${label}`)
  return deploy.migrations
}
