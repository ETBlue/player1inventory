# E2E — Agent Rules

Playwright specs for the full stack. Structure and authoring conventions live in the
root `CLAUDE.md` → **E2E Test Format**. This file records the *environment* hazards —
each one has already cost a session by presenting as a code regression.

## Only one E2E suite may run on this machine at a time

`pnpm test:e2e` cannot run concurrently in two worktrees (or two agent sessions). The
ports are plain constants in `e2e/constants.ts` — `LOCAL_WEB_PORT 5175`,
`CLOUD_WEB_PORT 5174`, `CLOUD_SERVER_PORT 4001` and `PWA_WEB_PORT 5176` — with no env
override, and every `webServer` entry sets `reuseExistingServer: false`. **There are four
ports, not three.** `PWA_WEB_PORT` arrived with the PWA work and is easy to miss when
checking whether the machine is free. Cloud specs additionally share one
dev database under the same `E2E_USER_ID`, so a concurrent run cross-contaminates rows
even when the ports happen to work out.

**The symptom is not a port error.** Playwright starts, then dozens of specs fail with
`net::ERR_CONNECTION_REFUSED at http://localhost:5175/` because the other run tore the
vite server down mid-flight. That reads as a mass code regression; it is an environment
collision. It happened on 2026-08-27 between two worktrees.

**Before running E2E,** check the ports are free *and stay* free:

```bash
for p in 5175 5174 5176 4001; do lsof -nP -iTCP:$p -sTCP:LISTEN; done
# identify the owner with: ps -o command -p <pid>
```

The process path names which worktree owns it. Wait for a **sustained** quiet window
(~90s of consecutive free checks), not the first free instant, or you race the other
session's next launch. **Never kill the other session's server.** A run showing
`ERR_CONNECTION_REFUSED` is void — re-run it alone before believing any failure.

## A stale `generated/graphql.ts` breaks E2E with symptoms that point elsewhere

`apps/web/src/generated/graphql.ts` is gitignored, so a checkout or worktree can carry a
stale copy. When it is stale the app **fails to boot entirely** — `<div id="root">` stays
empty with a single `pageerror`:

```
The requested module '/src/generated/graphql.ts' does not provide
an export named 'useApplyShelfFilterPicksMutation'
```

Nothing in the failure says "codegen". What you see instead:

- `a11y.spec.ts` fails on `landmark-one-main` and `page-has-heading-one` — an empty body
  has no `<main>` and no `<h1>` — *not* on any real violation
- seeds die with `NotFoundError: One of the specified object stores was not found`,
  because `indexedDB.open()` created an empty v1 DB when Dexie never ran

Both look like genuine bugs in whatever you are working on.

**If a page renders nothing, or E2E fails on missing landmarks plus "object store not
found", run `pnpm codegen` from the repo root before investigating anything else.**
`EnterWorktree`'s hook runs it on creation, but the main checkout drifts on its own after
a branch switch. The root `pnpm build` runs codegen too — which is why it catches drift
that `pnpm test`, `pnpm check` and `build-storybook` all miss.

## Cloud E2E is not database-isolated

The `cloud` project runs against whatever `DATABASE_URL` is set in `apps/server/.env` —
normally the **dev database**. There is no dedicated test database.

Isolation is by **row ownership, not by database**: every write is scoped to
`E2E_USER_ID` (`e2e/constants.ts`, `'e2e-test-user'`), and the `/e2e/cleanup` endpoint
(`apps/server/src/index.ts`) runs `deleteMany({ where: { userId } })` per model — it
deletes only that user's rows, never all data. **Do not describe the cleanup endpoint as
wiping the database.**

This was obscured for a while by a leftover `MONGODB_URI` from the MongoDB → Prisma
migration, which made the config *look* isolated. The server never read it (Prisma reads
`DATABASE_URL`/`DIRECT_URL`), so it was inert rather than erroring. Removed in PR #242;
the real invariant is now commented in `e2e/playwright.config.ts`.

**Fixed (2026-08-30, cloud locations PR 1).** The switch is an in-process datasource
override in `apps/server/src/lib/prisma.ts`, not a `webServer` env var: the cloud
`webServer` entry in `e2e/playwright.config.ts` passes no database URL of any kind — it
sets `E2E_TEST_MODE=true` (alongside `PORT` and `CLIENT_ORIGIN`), and when
`prisma.ts` sees that flag it points the runtime Prisma client at `TEST_DATABASE_URL`
(read from `apps/server/.env`, a dedicated Neon branch — see `apps/server/.env.example`)
instead of `DATABASE_URL`. `TEST_DIRECT_URL` has no runtime consumer today — it exists
for Prisma **migrations** against that same branch (`prisma migrate deploy` /
`migrate resolve`, run manually) and will be read by a later task's
`scripts/verify-migration.ts`. Row-ownership scoping under `E2E_USER_ID` still applies on
top of this and `/e2e/cleanup` is unchanged — but a spec that needs a second synthetic
user no longer leaves rows in the dev database. If `E2E_TEST_MODE=true` and
`TEST_DATABASE_URL` is unset, `prisma.ts` throws rather than falling back to
`DATABASE_URL` (covered by `apps/server/src/lib/prisma.test.ts`) — so a missing test
database fails loudly instead of silently writing multi-user fixtures into dev.

## `/e2e/cleanup` deletes `Location` and `ItemStock` — since 2026-09-14

Before that date the endpoint deleted 12 models and missed both. The effect was not
visible in a single run, so it went unnoticed:

- `Location` rows stayed in the test database forever. `ensureDefaultLocation`
  (`apps/server/src/lib/defaultLocation.ts`) returns early when the user already has a
  default location, so it never recreated a clean default. Run 2 of a location test saw
  run 1's locations.
- `ItemStock` rows went away by accident, through the `ON DELETE CASCADE` on their
  `itemId`, not because the endpoint asked for them.

Both models are now in the `$transaction` list in `apps/server/src/index.ts`.

**The guard that keeps the three delete lists in step** is
`apps/server/src/resolvers/purge-coverage.test.ts`. Three paths hand-maintain the same
list — `purgeUserData` (`purge.resolver.ts`), `clearAllData` (`import.resolver.ts`) and
`/e2e/cleanup` (`index.ts`). The guard reads resolver source from disk, so a mock cannot
satisfy it.

**It only checks models that declare a `userId`.** `ItemStock` has none, on purpose — it
is scoped through its `Location` (see root `CLAUDE.md` → Authorization). So the
`itemStock` line in those three lists is covered by no test. If someone deletes that
line, nothing fails: both of `ItemStock`'s foreign keys cascade, so the rows still go.
The line is there to keep the three lists identical, not because the route needs it.

### The consequence: every cloud test now starts with zero locations

Deleting `Location` on cleanup means every cloud test starts with **zero** locations. A
cloud seed that writes stock therefore writes before anything has created a default
location.

**Until 2026-09-16 that write was dropped in silence** (issue #287).
`mirrorStockToDefaultLocation` (`apps/server/src/lib/stockDualWrite.ts`) ended with
`if (!locationId) return`. The item was created, `Item`'s legacy columns were set, and no
`ItemStock` row was written. The pantry then showed the item below the "not stocked here"
divider with a quantity of 0, and nothing anywhere reported an error.

This caught `cooking.spec.ts` on 2026-09-14. Measured, not guessed: with `Location` removed
from the cleanup list again, the cloud cooking test **fails on run 1 and passes on run 2** —
run 1's app created the default location, and the old cleanup left it behind for run 2. So
that test had been passing on a leaked row, and would have failed on any genuinely fresh
database.

**The server no longer drops the write.** `ensureDefaultLocation`
(`apps/server/src/lib/defaultLocation.ts`) creates the default location when the user has
none, and every stock write path reaches it — `updateItem`, `bulkCreateItems`,
`bulkUpsertItems`, `checkout` and `consumeRecipes`. Seed order no longer decides whether
stock survives.

**`ensureCloudDefaultLocation(request)` (`e2e/helpers/cloudSeed.ts`) is still there, and
still worth calling first.** It is no longer a workaround: `seedCloudFixture` needs the
default location's id (to map the fixture's default key onto) and its name (to decide
whether to rename it), so the call has its own reason to exist. `cooking.spec.ts` also
still calls it — a seed that guarantees its own preconditions does not depend on server
behaviour to be correct.

## Seeding a fixture that runs in both modes

A spec that seeds data and runs in both the `local` and `cloud` projects describes its
fixture **once, as plain data**, and lets each mode translate it:

| File | Role |
|---|---|
| `e2e/helpers/fixture.ts` | the `Fixture` type — locations, vendors, items, stocks, shelves, recipes |
| `e2e/helpers/localSeed.ts` | `seedLocalFixture(page, fixture)` — writes it to IndexedDB |
| `e2e/helpers/cloudSeed.ts` | `seedCloudFixture(request, fixture)` — writes it through GraphQL |

Both return the same `Record<locationKey, realLocationId>` map.

`e2e/tests/location-not-stocked-here.spec.ts` is the working example.

**Entity ids are the same in both modes.** `ItemInput`, `VendorInput`, `ShelfInput` and
`RecipeInput` all declare `id: ID!`, so the bulk import mutations accept the local
fixture's own fixed ids.

**Location ids are the exception.** The import schema has no `LocationInput` until PR 4
of cloud locations, so `createLocation(name:)` returns a server-generated cuid. That is
why `Fixture` references locations by a symbolic `key` (`'HOME'`, `'OFFICE'`) and never
by an id. A spec that hardcoded `'local'` — the local default-location sentinel — would
name nothing at all in cloud mode.

**`seedCloudFixture` reconciles stock; it does not assume.** `bulkCreateItems` calls
`mirrorStockToDefaultLocation` (`apps/server/src/resolvers/import.resolver.ts`), so every
seeded item arrives with a stock row at the default location whether the fixture asks for
one or not — and since issue #287 that is true even when the user had no location at all
when the import ran. The helper reads the real stock rows back and then:

- `upsertItemStock` for every `(item, location)` pair the fixture lists
- `removeItemFromLocation` for every pair in the database that the fixture does not list

Reconciling against what the database actually holds is what keeps this working when
PR 5 removes the dual-write. **Check it at that point** — if the mirror stops running,
the reconcile should simply find nothing to remove.

## Nothing lints or type-checks `e2e/`

`pnpm lint` and `pnpm check` scan `apps/web` only, and there is no root `biome.json`.
`pnpm build` does not cover `e2e/` either. The verification gate in root `CLAUDE.md`
therefore says nothing about this directory.

To type-check a file you edited, write a temporary `tsconfig` and run `tsc --noEmit`.
**Scope `include` to the files you are editing.** Two files carry pre-existing errors
that will drown yours:

| File | Pre-existing errors |
|---|---|
| `e2e/playwright.config.ts` | 2 × `TS2580` (no `@types/node`) |
| `e2e/tests/a11y.spec.ts` | 39 × `TS2559` on `AxeOptions` |
