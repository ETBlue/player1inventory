// The safety guard for `verify-migration.ts`, the one script in this repo that
// runs a migration against real SQL. That script opens with
// `prisma migrate reset --force`, which DROPS AND RECREATES the public schema
// of whatever it is pointed at. This module decides whether it is pointed at
// the right database.
//
// Since E2E speed plan task S.6 the code lives in `src/lib/databaseUrl.ts`,
// because the E2E server needs the same identity check for
// `E2E_LOCAL_DATABASE_URL` (`src/lib/prisma.ts`). This file only re-exports
// it, so `verify-migration.ts` and `databaseIsolation.test.ts` did not change.
//
// The cost: the `scripts` type-check pass (`tsconfig.scripts.json`) now also
// checks that one `src` file. `databaseUrl.ts` imports nothing, so it pulls in
// no other `src` file. Keep it that way (root CLAUDE.md, *The no-overlap
// trick*).
export {
  assertNotAnotherDatabase,
  databaseIdentity,
  TEST_URL_VAR_NAMES,
} from '../src/lib/databaseUrl.js'
