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
database (the local E2E database for `cloud`, the Neon test branch for `cloud-neon`) under
the same `E2E_USER_ID`, so a concurrent run cross-contaminates rows even when the ports
happen to work out.

**The cloud web app's live socket goes to port 4001 too** (since households H3c-1, task
C.5). `e2e/playwright.config.ts` gives the cloud web server
`VITE_GRAPHQL_WS_URL=ws://localhost:4001/graphql` (`CLOUD_GRAPHQL_WS_URL`). Without it the
socket would go to the default `ws://localhost:4000`, which is the normal dev server. A
running dev server is not in E2E mode, so it ignores `e2eUserId` and refuses the socket
with `4401`; with no dev server the socket cannot open at all. Either way the live-update
tests in `live-cart.spec.ts` and `live-pantry.spec.ts` fail as if the code were broken.

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

## A filtered run starts only the servers that project needs

Since 2026-09-24 (issue #302), `e2e/playwright.config.ts` builds its `webServer`
array from the projects named on the command line:

| Command | Servers started |
|---|---|
| `--project=local` | `5175` |
| `--project=cloud` | `5174` + `4001` |
| `E2E_DATABASE=neon --project=cloud-neon` | `5174` + `4001` (the same ports: only one of `cloud` and `cloud-neon` exists in one run) |
| `--project=pwa` | `5176` (runs `pnpm --filter web build` first) |
| no `--project` | all four |

Before that change Playwright started **all four** servers whatever `--project`
said, because there is no per-project `webServer`. Three local-mode tests ran a
full production build for a PWA preview they never opened.

**The fallback is to start everything.** The config cannot read the selection
with confidence when `--ui` or `--debug` is passed, or when a `--project` value
is not exactly `local`, `cloud`, `cloud-neon` or `pwa` — a glob counts as unrecognised. In
those cases it starts all four, so a parsing mistake costs a slow run and never
a missing server.

**One spec crossed projects, and it had to be fixed for this to be true.**
`a11y.spec.ts` runs in both `local` and `pwa`, and its `offline banner a11y`
block sets `test.use({ baseURL: PWA_WEB_URL })` for its two tests. Under `local`
those two hit port `5176`, which a `--project=local` run no longer starts, and
they failed with `net::ERR_CONNECTION_REFUSED at http://localhost:5176/`. They
now carry a **describe-level** `test.skip` that skips them outside the `pwa`
project. They ran against the same server with the same code in both projects,
so nothing is lost — `pwa` still runs them.

**The skip must be at describe level, not in the test body.** The file's
top-level `beforeEach` also calls `page.goto('/')`, so a body-level
`test.skip(...)` runs after that hook has already hit `5176`. Measured: with the
skip in the body, `--project=local ... --grep "offline banner"` still reported
**2 failed**; with it at describe level, **2 skipped**. Describe level needs
`test.info().project.name` — the callback form of `test.skip` is handed
fixtures, not a `TestInfo`.

**Two consequences for the port check above.** A `--project=local` run leaves
`5174`, `5176` and `4001` free, so seeing them free does not mean nobody is
running E2E. And `pnpm test:e2e:all` (`e2e/run-all.sh`) runs its four rows
one after another, so it touches all four ports over its lifetime but rarely
more than two at a time.

## `pnpm test:e2e:all` runs four rows in one command

`e2e/run-all.sh` runs `local`, `cloud` (`E2E_DATABASE=local`), `cloud-neon`
(`E2E_DATABASE=neon`, the 8 files of `e2e/neonSpecs.ts`) and `pwa` as four separate
Playwright invocations (since E2E speed plan task S.8, 2026-11-23; three before). With
`--full-neon` (`pnpm test:e2e:all:neon`, the checkpoint gate) it runs three: `local`,
`cloud-neon` with the WHOLE cloud list (`E2E_NEON_FULL=1`), and `pwa`. See *Which database
each cloud project uses* below. It does three things a plain `a && b && c` gets wrong:

1. It does **not** stop at the first failing row. All of them run, and a
   summary table at the end lists each row's result and elapsed time, and which
   database each cloud row used. The script exits non-zero if any row failed.
2. It gives each project its own HTML report directory
   (`playwright-report/local`, `/cloud`, `/cloud-neon`, `/pwa`) via
   `PLAYWRIGHT_HTML_OUTPUT_DIR`. One shared directory would let run 3 overwrite
   runs 1 and 2.
3. It sets `PLAYWRIGHT_HTML_OPEN=never`, so a failure does not open a browser
   and block a non-interactive run.

4. It writes `e2e-results/<project>.json` (Playwright's JSON report, since E2E speed plan
   task S.1) and, at the end, runs `scripts/spec/e2e-times.mjs` on the files of the rows it
   ran. That
   prints each project's total, its 15 slowest tests and the time per spec file. So every
   gate records the time of every test.
5. It copies `test-results/` to `e2e-results/test-results-<project>/` right after each
   project (since task S.5). The next Playwright run deletes `test-results/`, so before
   this a failure in `local` lost its `error-context.md`, trace and screenshot as soon as
   `cloud` started. A failed copy prints a warning and does not change the exit code.

`e2e-results/` is gitignored. Extra arguments are passed to every project run, e.g.
`pnpm test:e2e:all e2e/tests/a11y.spec.ts`. **Do not pass `--reporter=…`**: it replaces
the config's reporters, so no JSON report is written and the times are lost.

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

Cloud E2E never runs on the dev database (since 2026-08-30; see *Fixed* below). Since
2026-11-23 (E2E speed plan task S.8) the `cloud` project runs on the **local E2E database**
(`E2E_LOCAL_DATABASE_URL`, see the next section), and the `cloud-neon` project on the
**Neon test branch** (`TEST_DATABASE_URL` in `apps/server/.env`). Until that date `cloud`
ran on the Neon test branch. Both are ONE shared database each: every worktree and every
session that runs cloud E2E on this Mac uses the local one, and every machine uses the Neon
one. `verify:migration` uses the Neon one too.

So inside it, isolation is by **row ownership, not by database**. Every E2E user id starts
with `e2e-` (`E2E_USER_ID` is `'e2e-test-user'`, every other id is built from
`E2E_SECOND_USER_ID`). The `/e2e/cleanup` endpoint (`apps/server/src/lib/e2eCleanup.ts`,
its SQL in `apps/server/src/lib/e2eCleanupSql.ts`) deletes only the listed users' rows:
the households a listed user OWNS, the households whose members are ALL listed (decision
D6 of the E2E speed plan), the users' own role rows elsewhere, and the `User` rows. The
`{ "allE2eUsers": true }` form, used only by `e2e/global-setup.ts`, deletes every user
whose id starts with `e2e-` and every household with no member outside them. It never
deletes all data. **Do not describe the cleanup endpoint as wiping the database.** (Until
households H3a task 3.10 it ran `deleteMany({ where: { userId } })` per model; until E2E
speed plan task S.2 it ran 22 `deleteMany` in one array-form `$transaction`.)

**Since 2026-11-11 the shared test database carries the households H3a schema.** The main
session ran `verify:migration` there, which applies `drop_user_scope`: `Location` and the six
catalog models have no `userId` column, and `Location` has no `isDefault`. So **`main`'s
cloud E2E cannot run on this database until H3a merges**: `main`'s server writes and reads
those columns. A cloud location is no longer "the default" (see below), and `/e2e/cleanup`
deletes **22** models since households H7b task M.1 added `LocationPreference` (21 since
households H6b task K.1 added `OwnershipOffer`, 20 since
households H6 task J.1 added `HouseholdActivity`, 19 since households H5b task G.6 added
`HouseholdInvite`). Count the `DELETE` statements in the SQL:
`grep -cE '^ +DELETE FROM "' apps/server/src/lib/e2eCleanupSql.ts` gave **22** on
2026-11-23. (The old command counted `deleteMany` in `lib/e2eCleanup.ts`; since E2E speed
plan task S.2 it prints 0.)

The last E2E counts on the H3a branch, 2026-11-11, from **three separate runs** (not one
`pnpm test:e2e:all`): `cloud` **126 passed / 7 skipped**, `local` **178 passed / 6 skipped**,
`pwa` **73 passed**. Re-measure rather than quote.

The last whole gates, on `chore/e2e-speed-b` at `aa327e69` on 2026-11-23 (E2E speed plan task
S.9, after PR B: `cloud` on the local database, `cloud-neon` on Neon), each first try, no
retry, no flaky test, **all green**. Two `pnpm test:e2e:all` runs in a row, then one
`pnpm test:e2e:all:neon`:

| Row | Database | Gate run 1 | Gate run 2 | `test:e2e:all:neon` |
|---|---|---|---|---|
| `local` | — | 3m49s, 179 passed / 11 skipped | 3m51s, 179 / 11 | 3m47s, 179 / 11 |
| `cloud` | local Postgres | **4m16s** (255.0 s), 212 passed / 8 skipped | **4m04s** (243.3 s), 212 / 8 | — |
| `cloud-neon` | Neon test branch | 12m01s (720.5 s), 40 passed (8 files) | 11m51s (710.6 s), 40 passed | **39m10s** (2348.6 s), 212 passed / 8 skipped (all 40 files) |
| `pwa` | — | 1m38s, 73 passed | 1m37s, 73 passed | 1m36s, 73 passed |
| wall clock | | **21m44s** | **21m24s** | **44m33s** |

Load average (1 min, every 60 s): gate run 1 min 2.34, max 6.55, mean 4.26; gate run 2 min
2.20, max 7.33, mean 3.94; the Neon run min 2.30, max 6.32, mean 3.51. "Inactive" memory
never fell below 5.67 GB. Each `cloud` run's `globalSetup` deleted 35 E2E users left by the
run before (each test cleans in `beforeEach`, so a spec's last test leaves its rows). The
slowest `cloud-neon` file in the gate is `settings/import-export-cloud.spec.ts`, 290.1 s and
272.2 s.

The whole gate before PR B, `pnpm test:e2e:all` on `chore/e2e-speed` at `9e439f00` on 2026-11-23
(E2E speed plan task S.5, after PR A: one-trip cleanup, one cleanup per test, `globalSetup`),
first try, no retry, **all green**, 45m52s wall clock:

| Project | S.1 baseline (`11a9466b`, 2026-11-22) | S.5 (`9e439f00`) |
|---|---|---|
| `local` | 3m44s, 179 passed / 11 skipped | 3m42s (221.0 s), 179 passed / 11 skipped |
| `cloud` | 64m08s (3847.8 s), 210 passed / 8 skipped | **40m35s (2435.0 s)**, 212 passed / 8 skipped |
| `pwa` | 1m34s, 73 passed | 1m35s (93.7 s), 73 passed |
| whole gate | 69m26s | **45m52s** |

Load average (1 min, 46 samples every 60 s): 3.69 at the start, min 1.32, max 5.04, mean
2.52. "Inactive" memory never fell below 6.08 GB. The `cloud` project was about 12% slower
than the `--project=cloud` run of task S.3 (2177.8 s) on the same cleanup code. Almost
every spec file was slower, the browserless ones too (`location-scoped-writes.spec.ts`
48.9 → 63.5 s, `cloud-roles.spec.ts` 23.2 → 31.3 s), so the likely cause is a slower
network or database that day, not the code. That was not proved. The 10 slowest `cloud`
files (s): `settings/import-export-cloud` 259.9, `location-people` 172.3,
`household-ownership` 148.0, `household-invites` 131.5, `item-management` 127.6,
`unified-item-search` 111.2, `location-switcher` 104.6, `settings/tags` 101.6,
`household-activity-purges` 99.2, `settings/import-households` 86.9.

The gate before it, `pnpm test:e2e:all` on `feature/households-h7b` at `14f9501c` on
2026-11-22 (households H7 task M.6), first try, no retry, **all green**: `local` **179
passed / 11 skipped** in 3m46s, `cloud` **210 passed / 8 skipped** in 65m39s, `pwa` **73
passed** in 1m36s. Load average 11.2 at the start (falling, from the `pnpm test` run just
before it), then 1.6 to 2.9 for the rest of the run. The `location-switcher.spec.ts` wait for
"Home" (below) did not fail this time.

The gate before it, `pnpm test:e2e:all` on `feature/households-h7a` at `82426224` on
2026-11-21 (households H7 task L.7), first run: `local` **178 passed / 11 skipped** in
3m42s, `cloud` **201 passed / 7 skipped / 2 failed** in 67m53s, `pwa` **73 passed** in
1m34s. Load average between 1.7 and 3.4 during the run. Neither failure was caused by H7a:

| Failed test | Error | Alone |
|---|---|---|
| `location-switcher.spec.ts:168` ("Manage" navigates…) | `toBeVisible` on `getByRole('main').getByText('Home')` timed out at 5 s; the page snapshot at the failure shows the row | the file passed 17 of 17 once; another run failed a DIFFERENT test of the file (`:121`) on the same line of `seedOfficeLocation` |
| `shared-household.spec.ts:338` | `apiRequestContext.delete: socket hang up` on `DELETE /e2e/cleanup`, in the `afterEach` | passed |

**`location-switcher.spec.ts` waits close to Playwright's 5 s `expect` budget for the cloud
locations list**, right after first sign-in. Measured with `--trace on`, the same `expect`
took 3.9 s and 2.9 s on this branch, and 3.9 s and 5.0 s on `develop` at `9701ddff`, before
H7a. So the wait is older than H7a, and a slow answer from the Neon test branch is enough to
fail it. Not fixed here.

The second whole gate on the same branch, at `ef8982fb` (the same code; only docs after
`82426224`), 2026-11-21, first try, no retry: `local` **178 passed / 11 skipped** in 3m40s,
`cloud` **203 passed / 7 skipped** in 63m00s, `pwa` **73 passed** in 1m34s, all green. Load
average 2.0 to 2.3.

The gate before it, `pnpm test:e2e:all` on `feature/households-h6b` at `5cd82bf4` on
2026-11-20 (households H6b task K.9), all three green on the first run, no retry, no flaky
test: `local` **178 passed / 11 skipped** in 3m39s, `cloud` **197 passed / 7 skipped** in
58m43s, `pwa` **73 passed** in 1m34s; 63m56s in all. Load average 2.70 at the start, 2.81 at
the end, between 1.2 and 1.9 during the `cloud` run. `cloud` grew by 9 tests
(`household-ownership.spec.ts`) and by about 8.5 minutes.

The gate before it, `pnpm test:e2e:all` on `feature/households-h6a` on 2026-11-20 (households
H6 task J.9), all three green with no retry: `local` **178 passed / 11 skipped** in 3m36s,
`cloud` **188 passed / 7 skipped** in 50m22s, `pwa` **73 passed** in 1m34s; 55m32s in all.
Load average 1.73 at the start, 2.64 at the end. The `cloud` project is now most of the time.
The run before it failed one `cloud` test, `settings-global-pages.spec.ts`, which lists
every household sidebar link and did not expect the new **Activity** link. **A task that
adds a sidebar link must update that list.** (Before: on `feature/households-h5c` on
2026-11-19, `local` 178 / 11 skipped in 3m38s, `cloud` 179 / 7 skipped in 46m35s, `pwa` 73
in 1m34s.)

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

## The local E2E database — since 2026-11-23 (E2E speed plan, task S.7)

The `cloud` project can run on a Postgres on this Mac instead of the Neon test branch. A
query there takes well under 1 ms, against about 52 ms on Neon. The server picks the
database with `E2E_DATABASE` (`apps/server/src/lib/prisma.ts`, task S.6):

| `E2E_DATABASE` | Database | Variable in `apps/server/.env` |
|---|---|---|
| `local`, or unset | the local E2E database | `E2E_LOCAL_DATABASE_URL` |
| `neon` | the Neon test branch | `TEST_DATABASE_URL` |

**Until `E2E_LOCAL_DATABASE_URL` is set, `--project=cloud` does not start:** with
`E2E_DATABASE` unset the server asks for the local URL. Set it up (below), or run the cloud
specs on Neon with `E2E_DATABASE=neon pnpm test:e2e --project=cloud-neon`.

### It must match Neon

Read on 2026-11-22 by the owner, on the Neon TEST branch and on production:

| Setting | Neon (TEST and production) | Local |
|---|---|---|
| Version | PostgreSQL 17.12 | PostgreSQL 17.12 (Homebrew `postgresql@17`, installed 2026-11-23) |
| Locale provider (`datlocprovider`) | `b` (builtin) | `b` (builtin) |
| Locale (`datlocale`) | `C.UTF-8` | `C.UTF-8` |
| `datcollate`, `datctype` | `C.UTF-8` | `C` (the builtin provider does not use them for sorting) |
| Time zone | GMT | `UTC` (set on the database) |

Why it matters: `householdMembers` and `locationPeople` sort names in SQL, and
`location-people.spec.ts` and `household-invites.spec.ts` check that order. Another
collation sorts "ben" and "Bea" differently. With the builtin provider and `C.UTF-8`, text
sorts by code point, the same on every machine. **Nothing checks the version or the
collation at run time.** When Neon moves to a new major version, a person must notice and
change the local database too.

### Set it up (a person runs these; no agent does)

1. Install and start Postgres 17 (owner answer P1-A):

   ```bash
   brew install postgresql@17
   brew services start postgresql@17
   ```

   It listens on `localhost` only. Homebrew's `initdb` uses the shell's locale for the
   cluster (`en_US.UTF-8` here). That does not matter: the database sets its own.
2. Create the database with Neon's locale provider, and set its time zone:

   ```bash
   createdb -h localhost --template=template0 --locale-provider=builtin \
     --builtin-locale=C.UTF-8 --locale=C p1i_e2e
   psql -h localhost -d postgres -c "ALTER DATABASE p1i_e2e SET timezone TO 'UTC'"
   ```

   `--locale=C` sets only `datcollate` and `datctype`. Do not pass `--locale=C.UTF-8`:
   macOS may have no libc `C.UTF-8` locale. Check it with the P2 query. `datlocprovider`
   must be `b` and `datlocale` must be `C.UTF-8`:

   ```bash
   psql -h localhost -d p1i_e2e -c "SELECT datcollate, datctype, datlocprovider, datlocale FROM pg_database WHERE datname = current_database();"
   ```

   (Do not use `current_setting('lc_collate')`: Postgres 16 removed that setting.)
3. Put the URL in `apps/server/.env`, never in the repo:

   ```bash
   E2E_LOCAL_DATABASE_URL="postgresql://<your mac user>@localhost:5432/p1i_e2e"
   ```

   The server and the script refuse a host that is not `localhost`, `127.0.0.1`, `::1` or a
   socket path, and a URL that names the same database as any other `*_URL` variable
   (`DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`, …). **`postgresql://<user>@/p1i_e2e?host=/tmp`
   is refused**: a user with no host is not a valid URL in Node. Use `localhost`, or
   `postgresql:///p1i_e2e?host=/tmp`.
4. Apply the migrations, then check:

   ```bash
   pnpm --filter server e2e:db:migrate   # prisma migrate deploy
   pnpm --filter server e2e:db:status    # expect "Database schema is up to date!"
   ```

**After every new migration, run `pnpm --filter server e2e:db:migrate`.** Nothing applies
migrations to the local database by itself. The `cloud` run stops at the start until you do
(since task S.8): `globalSetup` (`e2e/global-setup.ts`) reads `GET /e2e/database` and
throws when fewer migrations are applied than there are migration folders, or when the
newest applied name sorts before the newest folder. Measured with an extra empty folder:
"21 migrations applied, 22 migration folders".

### What `e2e:db:migrate` and `e2e:db:status` do

Both run `apps/server/scripts/e2eLocalDb.ts`:

1. It reads `apps/server/.env`. A value already set in the shell wins, as with
   `dotenv/config`.
2. It refuses to go on unless `E2E_LOCAL_DATABASE_URL` is set and passes the task S.6 checks
   (`assertLocalE2eDatabaseUrl` in `apps/server/src/lib/databaseUrl.ts`, the same function
   the server calls). The identity check runs twice: on the merged environment, and on
   `.env` alone, so a shell value cannot hide a `.env` variable that names the same
   database.
3. It runs `pnpm exec prisma migrate deploy` (or `migrate status`) with **both**
   `DATABASE_URL` and `DIRECT_URL` set to the local URL. `schema.prisma` reads
   `url = env("DATABASE_URL")` and `directUrl = env("DIRECT_URL")`, and Prisma Migrate uses
   `directUrl`. With only `DATABASE_URL` changed, the migration would go to the database
   that `DIRECT_URL` names in `.env`: the DEV database.

No message of the script prints a URL or a host. Its tests (`scripts/e2eLocalDb.test.ts`)
use made-up URLs and a fake runner; they never run Prisma.

## Which database each cloud project uses — since 2026-11-23 (E2E speed plan, task S.8)

The cloud specs run in ONE of two projects. Which one exists depends on `E2E_DATABASE`
(`e2e/helpers/e2eDatabase.ts`; the same rule as the server). Only one exists in one
Playwright run, because both use the same API server (port 4001), and one server uses one
database.

| Project | `E2E_DATABASE` | Database | Spec files |
|---|---|---|---|
| `cloud` | `local`, or unset | the local E2E database (`E2E_LOCAL_DATABASE_URL`) | all of `CLOUD_SPECS` (40) |
| `cloud-neon` | `neon` | the Neon test branch (`TEST_DATABASE_URL`) | the 8 files of `NEON_SPECS` (`e2e/neonSpecs.ts`, each with its reason), or all of `CLOUD_SPECS` with `E2E_NEON_FULL=1` |

| Command | Runs |
|---|---|
| `pnpm test:e2e:all` | the per-PR gate: `local`, `cloud` (local database), `cloud-neon` (8 files on Neon), `pwa` |
| `pnpm test:e2e:all:neon` | the checkpoint gate: `local`, `cloud-neon` with the WHOLE cloud list on Neon, `pwa`. A named step of every checkpoint release (section 15 of `docs/global/backend/2026-11-17-deploy-runbook-households-h4.md`) |
| `pnpm test:e2e --project=cloud <files>` | some cloud files on the local database |
| `E2E_DATABASE=neon pnpm test:e2e --project=cloud-neon <files>` | some cloud files on Neon |

The config throws at load when a `NEON_SPECS` entry is not in `CLOUD_SPECS`, when
`--project=cloud-neon` is asked for without `E2E_DATABASE=neon`, and when `--project=cloud`
is asked for with it. Each message gives the command to use.

**`globalSetup` checks the database before the first test.** It reads `GET /e2e/database`
(`apps/server/src/lib/e2eDatabase.ts`, E2E mode only; it answers `kind` and the migration
names, never a URL or a host) and throws when `kind` is not the one this run expects, or
when the database is behind the migration folders. Then it runs the `allE2eUsers` cleanup.

### `cloud` green on the local database is not Neon green

A query on the local database takes well under 1 ms. On Neon it takes about 52 ms. Some
things only Neon shows:

| What | Why the local database hides it | What catches it |
|---|---|---|
| the Neon pooler (prepared statements, connection limits) | the local URL is a direct connection | every `cloud-neon` file |
| latency races (two requests that overlap only because each query is slow) | the window closes | `household-ownership.spec.ts` (two accepts at once), `live-cart.spec.ts`, `live-pantry.spec.ts`, in `cloud-neon` |
| waits that are long enough only on a fast database (`location-switcher.spec.ts` waits up to 5 s for "Home", and took 3.9 s and 5.0 s on Neon) | everything answers fast | the checkpoint gate only: the file is not in `cloud-neon` |
| sort order of text in SQL | another collation sorts names differently | the local database is made with Neon's locale (see *It must match Neon*); nothing checks it at run time |
| another Postgres major version | — | the version is matched by hand; nothing checks it at run time |
| a stale local database | nothing migrates it by itself | `globalSetup` stops the run |
| Neon cold start after the branch was idle | not a thing locally | a slow FIRST `cloud-neon` request is not a code failure |

So **a red `cloud-neon` row with a green `cloud` row is a real signal**, not noise to
re-run away. And a file you changed that is NOT in `NEON_SPECS` has run only on the local
database until the next checkpoint gate. If it depends on timing or locks, run it once on
Neon yourself: `E2E_DATABASE=neon pnpm test:e2e --project=cloud-neon <file>` does not work
for a file outside `NEON_SPECS` (it selects nothing), so use
`E2E_DATABASE=neon E2E_NEON_FULL=1 pnpm test:e2e --project=cloud-neon <file>`.

## Every cloud spec uses `cleanupCloudData` — since 2026-09-25

`e2e/helpers/cloudTeardown.ts` exports `cleanupCloudData(request, userIds?)`. It is the
only version of the cloud teardown. Since the E2E speed plan (tasks S.3 and S.4,
2026-11-22), the rules are:

| Rule | Why |
|---|---|
| Call it from `beforeEach` ONLY, guarded on `baseURL === CLOUD_WEB_URL` (decision D7, owner answer P3-A) | each test starts clean whatever ran before it: a test that failed half way, an `afterEach` that failed, or a killed run. The `afterEach` call cleaned the same users a second time and added nothing |
| Pass EVERY user the test uses, in ONE list: `cleanupCloudData(request, [A, B, E2E_USER_ID])` | one request. A household whose members are all in the list is deleted too (decision D6), so a household a failed test left with no owner goes with it. A user left out keeps their households |
| One string (or no argument, which means `E2E_USER_ID`) sends the `x-e2e-user-id` header; a list sends the body `{ "userIds": [...] }` | the header form is the old one, kept for one user |
| `afterEach` still closes contexts and clears IndexedDB in local mode | only the cloud cleanup left it |

The helper does **not** guard itself — without the guard a local run would fire a cloud
cleanup. `household-member-cleanup.spec.ts` is the one spec that still cleans one person at
a time inside a test, because the order of those calls is its subject.

**`e2e/global-setup.ts` cleans what a killed run left behind.** It runs once per Playwright
invocation, and only when a cloud project is selected (`selectedProjects()` in
`e2e/helpers/selectedProjects.ts`). It calls `DELETE /e2e/cleanup` with
`{ "allE2eUsers": true }`, prints the counts on one line, and throws on any error, so a
broken cleanup stops the run before the first test. Playwright 1.58 starts the `webServer`
entries and waits for their URLs BEFORE `globalSetup`, so the API server is up. Every
spec's own `beforeEach` cleans the users that spec uses; `globalSetup` is the only thing
that cleans users of specs the run does not reach.

**The route is one SQL function, so one cleanup is one database round trip** (since task
S.2). The SQL is in `apps/server/src/lib/e2eCleanupSql.ts`: `e2e_cleanup_rows` (the 22
deletes, written once), `e2e_cleanup` (the listed users) and `e2e_cleanup_all` (every E2E
user). It is a function and not a Prisma `$transaction`, because Prisma sends each
statement on its own: the old route took about **1.33 s** on the Neon test branch, the
function about **56–68 ms**. The E2E server creates the three functions at start
(`CREATE OR REPLACE`, inside the `if (E2E_TEST_MODE)` block of `index.ts`), so a
production server never creates them. `verify:migration` drops the `public` schema and the
functions with it; the next E2E server start makes them again. **The functions stay in the
test database after a server stops.** So a mutation run leaves the mutated text there until
the next E2E server start.

Until 2026-09-25, 11 spec files hand-rolled the same request at 19 call sites:

```ts
await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
  headers: { 'x-e2e-user-id': E2E_USER_ID },
})
```

**The bodies were identical. The one difference: the hand-rolled version never checked
the response.** A cleanup that stops working — the server is down, or a new model joins
the schema but not the delete list — returned quietly there and the test carried on. Rows
from the last test survived into the next one, and the failure landed much later, in some
other test, looking like an unrelated bug. `cleanupCloudData` throws instead, so the
failure lands on the test that owns the cleanup.

Measured on 2026-09-25 by pointing the helper at a path that 404s
(`/e2e/cleanup-MUTATION-PROOF`) and running one cloud test:

| Version | What the run reported |
|---|---|
| `cleanupCloudData` | `[cloud] item-management.spec.ts:47 user can create an item` failed with `Error: cleanupCloudData: DELETE /e2e/cleanup returned 404 Not Found`, stack pointing at the `afterEach` call site |
| hand-rolled | no cleanup error at all — the run failed one test later, inside `ItemPage.save` on a `waitForURL` timeout, with a page snapshot naming nothing about cleanup |

The section right below this one is a real case of the same failure: `/e2e/cleanup` was
deleting no `Location` rows at all, and the symptom was `cooking.spec.ts` reading `0` on
the Stock tab where the test expected `6`.

**Note the error message hardcodes the literal path `/e2e/cleanup`** rather than printing
the URL it actually called. In the proof above that made the message disagree with the
404 body. It is cosmetic, but do not read the message as proof of which URL was hit.

### A cleanup in the MIDDLE of a test needs `forgetDeletedHousehold(page)` — since 2026-11-18

`/e2e/cleanup` deletes the user's household, and the next request makes a new one with a
new id. A page that already showed the app keeps the old id in `last-household-id`. On the
next page load `HouseholdChangeGuard` (households H5b) sees a different id, clears the
cache and **reloads the page**, about 1.4 s after it opened. Whatever the test started in
that time is lost, with no error on screen: an import never runs, an open menu closes.

So after a `cleanupCloudData` that runs mid-test, once a page has loaded, call
`forgetDeletedHousehold(page)` (`e2e/helpers/cloudTeardown.ts`). It removes only that key.
The four re-import tests of `settings/import-export-cloud.spec.ts` do this. The
`beforeEach` call needs nothing: each test has a fresh context.

## `/e2e/cleanup` deletes `Location` and `ItemStock` — since 2026-09-14

Before that date the endpoint deleted 12 models and missed both. The effect was not
visible in a single run, so it went unnoticed:

- `Location` rows stayed in the test database forever. `ensureDefaultLocation`
  (then in `apps/server/src/lib/defaultLocation.ts`) returned early when the user already
  had a default location, so it never recreated a clean default. Run 2 of a location test
  saw run 1's locations. (That file was deleted in households H3a task 3.5. A new user's
  first location now comes from `ensureHousehold` in `apps/server/src/lib/household.ts`.)
- `ItemStock` rows went away by accident, through the `ON DELETE CASCADE` on their
  `itemId`, not because the endpoint asked for them.

Both models are now in the delete list: the SQL function in
`apps/server/src/lib/e2eCleanupSql.ts` since E2E speed plan task S.2 (a `$transaction` of
`deleteMany` in `apps/server/src/lib/e2eCleanup.ts` before that).
(The route's handler lived inline in `apps/server/src/index.ts` until households task 2.6
moved it, so measurements below that name `index.ts` are about the same code.)

**The guard that keeps the delete lists in step** is
`apps/server/src/resolvers/purge-coverage.test.ts`. Since households H3a task 3.10, **two**
paths hand-maintain a list — `clearAllData` (`import.resolver.ts`, since households H6a the
body of `deleteHouseholdData` in `lib/household.ts`) and `/e2e/cleanup` (the `DELETE FROM`
statements of `lib/e2eCleanupSql.ts` since E2E speed plan task S.2). The third, `purgeUserData` (`purge.resolver.ts`), was removed in
that task: it had no web caller, and it deleted by `userId`. The guard reads the source
from disk, so a mock cannot satisfy it.

**It checks every model in the schema now**, not only models that declare a `userId`
(the rule until task 3.10). For each path, every schema model is either deleted or named
in that path's `kept` list. `clearAllData` keeps `household`, `householdMember`,
`locationMember` (they go with their location), `householdInvite` and `user`;
`/e2e/cleanup` keeps none (it kept `householdInvite` from H5b task G.1 until task G.6).

**The `itemStock` line still protects no DATA.** If someone deletes it, the rows still go:
both of `ItemStock`'s foreign keys cascade. Measured 2026-09-25 — with
`prisma.itemStock.deleteMany` removed from `index.ts`, `cleanup-endpoint.spec.ts` still
read back an empty `itemStocksForItem`. The guard now fails on the missing line, and the
spec fails on the missing `itemStocks` count, but the rows are not at risk either way.

## `purge-coverage.test.ts` is a SOURCE-TEXT check — what it cannot see

**Since E2E speed plan task S.2 (2026-11-22) the `/e2e/cleanup` half reads SQL text.** For
each model it looks for ONE `DELETE FROM "<Model>"` statement in `E2E_CLEANUP_INSTALL_SQL`
(`lib/e2eCleanupSql.ts`), and checks that the text of its `WHERE` is the one allowed SQL
form for that model (built from `MODEL_PATHS` plus `SQL_RELATIONS`; the other forms are in
`SQL_CLEANUP_EXCEPTIONS`). It also checks that `lib/e2eCleanup.ts` holds no `deleteMany`
and no `$transaction`, so a delete cannot move back out of the SQL unseen. It is still a
text check, so everything below still holds: it cannot see a VALUE. The history below is
about the Prisma version of the route.

Until task S.2 the guard asserted the string `prisma.location.deleteMany(` **appears** in the file. It
never starts the server, never calls the route, and never reads the `where` clause. So
this satisfies the guard, answers HTTP 200, and deletes nothing:

```ts
prisma.location.deleteMany({ where: { userId: someWrongValue } })
```

Measured 2026-09-25 with exactly that mutation on the `location` line of `/e2e/cleanup`:

| Check | Result |
|---|---|
| `purge-coverage.test.ts` | **5 passed** — it cannot see the filter |
| `cleanup-endpoint.spec.ts` | **failed**: `models that deleted nothing: {...,"locations":0}` |

That pair is the reason the spec below exists (issue #319).

**Since 2026-11-04 the guard reads the filter TEXT** (issue #320, households H3a tasks 3.2
and 3.10). Each model has one allowed parent path (`MODEL_PATHS` in the test), so
`{ userId: someWrongValue }`, `{}` and the old `{ userId }` scope all fail it now. It still
cannot see a VALUE: `{ where: { householdId } }` passes the text check even when
`householdId` is `undefined` at run time, and Prisma reads that as no filter at all. That is
why `clearAllData` throws before its transaction when the id is missing, and why the two
specs below run against real Postgres.

## `cleanup-endpoint.spec.ts` — the behavioural guard on `/e2e/cleanup`

`e2e/tests/cleanup-endpoint.spec.ts` (added 2026-09-25, one cloud test) seeds **one row of
every model `/e2e/cleanup` deletes** — all 22 since households H7b task M.5 (the
preference row is written by a real `markLocationVisited` on the user's own location, and
the count `locationPreferences` must be at least 1), 21 since households H6b task K.8 (the
ownership offer is a real `offerOwnership` from the user, the owner, to a second member who
joined through a second invite; it is in the user's own household and TO someone else, so
only the `householdId: owned` half of the offer filter can delete it), 20 since households
H6 task J.1 (the activity
row is written by the same `createInvite` call, read back through `householdActivity`, and
first run on real SQL in task J.8), 19 since households H5b task G.6 (the invite
is made with the real `createInvite` mutation), 18 since households H3a task 3.10, 15 since
households task 2.6, 14 before it —
calls the route, and asserts every returned count is at least 1, then reads the data back
and asserts empty. It is cloud-only and has no browser: it is in the `cloud` project's
`testMatch` and the `local` project's `testIgnore`, like `location-scoped-writes.spec.ts`.

**The route now returns per-model deleted counts.** `prisma.deleteMany` already returns
`{ count }`; `index.ts` used to throw those away and answer `{ ok: true }`. It now answers
`{ ok: true, deleted: { inventoryLogs, cartItems, carts, itemTags, itemVendors,
recipeItems, itemStocks, items, tags, tagTypes, vendors, recipes, shelves,
locationMembers, locations, householdInvites, householdActivities, ownershipOffers,
householdMembers, households, users } }` — 21 keys since households H6b task K.1, 20 since
households H6 task J.1, 19 since households H5b task G.6, 18 since households H3a task 3.10.
Between K.1 and K.8 the spec reported `"ownershipOffers":0` and failed, because nothing
seeded an offer; it was not run in that window.

**The invite statement runs BEFORE `household` and BEFORE `user`.** `HouseholdInvite.householdId`
is `ON DELETE CASCADE`, so after the household delete the count would read 0.
`createdById` is RESTRICT (decision T26), so an invite the user made in a household they do
not own would make the `User` delete fail. That is why its filter is
`OR: [{ householdId: owned }, { createdById: userId }]`. An invite the user only USED is
not deleted: `usedById` is SET NULL. The route is mounted only under `E2E_TEST_MODE`, so production
is unaffected.

### Households — the 16th to 18th models, since 2026-11-04 (households H3a, task 3.10)

The route now deletes by the households the user **owns** (a `HouseholdMember` row with
role `owner`), not by `userId`:

1. everything in each owned household, every member's role rows in it, and the household;
2. the user's OWN `HouseholdMember` and `LocationMember` rows in households they do not
   own. Both tables have a RESTRICT foreign key to `User`;
3. the `User` row, last.

**It never deletes a household the user only belongs to.** Two-user specs run cleanup once
per user. If the first call emptied a household the user was only a member of, it would
delete the other user's data before that user's own cleanup ran. Pinned only by
`apps/server/src/lib/e2eCleanup.test.ts`: no E2E spec can make a second member before task
3.11 adds `POST /e2e/household-members`.

The same four places changed together as in task 2.6: `lib/e2eCleanup.ts`,
`cloudTeardown.ts`, `cleanup-endpoint.spec.ts` (comments only: its seed already makes a
household on the first request) and this file. 15 → 18.

**Rows that belong to no household are never deleted.** A row with a null `householdId` —
left on the shared test database by `main`'s server, which does not know the column —
survives every cleanup. See the plan's *Execution* notes for the one case that breaks
first sign-in.

### The `User` row — the 15th model, since 2026-10-31 (households H2, task 2.6)

`/e2e/cleanup` also deletes the user's own `User` row, **last**, with
`prisma.user.deleteMany({ where: { id: userId } })`. Four places changed together:

| Place | Change |
|---|---|
| `apps/server/src/lib/e2eCleanup.ts` | the `deleteMany`, the `users` key, and `forgetSeenToday(userId)` after the transaction |
| `e2e/helpers/cloudTeardown.ts` | `'users'` in `CLEANUP_MODEL_KEYS` |
| `e2e/tests/cleanup-endpoint.spec.ts` | seeds the row with `createCloudUser(request, E2E_USER_ID, …)` |
| this file | 14 → 15 |

**`purge-coverage.test.ts` allows the `User` row's filter in `/e2e/cleanup` only.** Its key
is `id`, because the row IS the user, so `{ where: { id: userId } }` is an exception for
the `user` model alone. `clearAllData` deletes a household's data and leaves the account, so
it lists `user` as kept. (Until task 3.10 the guard read only models with a `userId` field,
and so said nothing about `User`.)

What guards it instead:

| Check | What it catches |
|---|---|
| `apps/server/src/lib/e2eCleanup.test.ts` | the delete order in the SQL text (`"User"` last), the `users` key, the user ids sent as a bound value, and `forgetSeenToday` running once per user, AFTER the query. Reads the SQL text and mocks `$queryRaw`; it runs no SQL |
| the same file, last test | the server's `CLEANUP_MODEL_KEYS` and this directory's `CLEANUP_MODEL_KEYS` differ. It reads `cloudTeardown.ts` as text |
| `cleanup-endpoint.spec.ts` | a `where` that matches nothing reports `"users":0`. This is the only real-SQL check |

**`cleanup-endpoint.spec.ts` does not read the `User` row back.** Its `users` count is
its only check on that row. GraphQL has no query that returns a `User` row. Since households
task 2.7, the E2E-only route `GET /e2e/users/:id` (`readCloudUser` in
`e2e/helpers/cloudUsers.ts`) can read one, and `cloud-user-row.spec.ts` uses it.

**Why `forgetSeenToday` is needed, and why after the commit.** `ensureUser`
(`apps/server/src/lib/userRow.ts`) remembers, per server process, the users it saw today,
and makes no query for them. Without the call, the next GraphQL request the same day
would skip the check and the `User` row would never be created again. Called BEFORE the
commit, a request arriving in between could find the row that is about to go, and
remember it again. `forgetSeenToday` also removes the user's run in progress from
`ensureUser`'s `inFlight` map and bumps a counter, so a run that found the row before the
delete cannot write "seen today" back afterwards.

**Every cloud test now starts with no `User` row.** The first GraphQL request of the test
creates it again through `ensureUser`, named by its id. A spec that needs the row before
any request, or with another name, calls `createCloudUser` (`e2e/helpers/cloudUsers.ts`).

**Order matters for the counts, not only for the deletes.** Every child is deleted before
its parent, so each count is the number of rows that statement removed. Move the
`"Item"` delete above the `"ItemTag"` delete in `lib/e2eCleanupSql.ts` and the `ItemTag`
rows go by `ON DELETE CASCADE` instead, reporting 0 (measured in task S.2:
`cleanup-endpoint.spec.ts` fails with `itemTags: 0`).

**`cleanupCloudData` checks the KEYS, never the counts.** It runs in the `beforeEach` of
every cloud spec, where zero rows is normal and correct: after a passing test the next
`beforeEach` deletes that test's rows, and after a clean start it deletes nothing. A "count above zero" check there would fail every
clean run. So the helper asserts only that the body carries a numeric count for every key
in its own `CLEANUP_MODEL_KEYS` list, and throws naming the missing model otherwise. The
"at least 1" assertion lives in the spec, which seeds first.

**What the spec proves, and what it does not:**

| Failure | Caught by | Measured 2026-09-25 |
|---|---|---|
| Wrong `where` on a listed model | the spec only | `purge-coverage` 5 passed; spec failed with `"locations":0` |
| A model with a `userId` dropped from the list | both | `purge-coverage` 1 failed / 4 passed; spec failed with `no deleted count for shelves` |
| `ItemStock` dropped from the list | the spec only, and only on the reported COUNT | `purge-coverage` 5 passed; spec failed with `no deleted count for itemStocks`. The rows themselves still went, by cascade. |
| The seed silently writing nothing | the seed assertion, and the count assertion too | `createShelf` removed → failed at `expect(before.shelves).toHaveLength(1)`, before the route was called. The seed assertion is not the only guard here — a dead seed also makes every count 0. What it adds is that the failure names the seed instead of blaming the route. |

**Three models are never read back**: `ItemTag`, `ItemVendor` and `RecipeItem`. GraphQL
exposes them only through `Item.tagIds`, `Item.vendorIds` and `Recipe.items`, and all three
parents are gone by the time the readback runs. Their `deleted` counts are the only check
on them. `ItemStock`'s readback is weak for the cascade reason above; its count is what
speaks for it.

**`Location` is read back LAST, because reading it recreates one.** The `locations` query
calls `requireHousehold` (`apps/server/src/lib/authz.ts`), which runs `ensureHousehold`
(`apps/server/src/lib/household.ts`). For a user with no household, that is first sign-in:
it makes a household, one location and the user's `HouseholdMember` and `LocationMember`
rows. So the readback asserts exactly one location and that its id is neither of the two
the spec seeded. The next test's `beforeEach`, or the next run's `globalSetup`, deletes
that fresh row (an `afterEach` did until E2E speed plan task S.3).

**Between households H3a tasks 3.5 and 3.10, `afterEach` could not delete it.**
`/e2e/cleanup` did not delete `HouseholdMember` rows then, and that row's foreign key to
`User` is `ON DELETE RESTRICT`, so the cleanup's `user.deleteMany` failed with `P2003` and
the whole transaction rolled back. Task 3.10 added the household rows to the list, and the
first run after it deleted the households those earlier runs had left behind.

### The consequence: every cloud test now starts with zero locations

Deleting `Location` on cleanup means every cloud test starts with **zero** locations. A
cloud seed that writes stock therefore writes before anything has created a default
location.

**Until 2026-09-16 that write was dropped in silence** (issue #287).
`mirrorStockToDefaultLocation` ended with `if (!locationId) return`. The item was created,
`Item`'s legacy columns were set, and no `ItemStock` row was written. (That function lived in
`apps/server/src/lib/stockDualWrite.ts`, which **cloud locations PR 5 deleted** along with
`Item`'s five legacy columns. The file no longer exists; the consequence in this section's
heading — every cloud test starts with zero locations — is unchanged.) The pantry then showed the item below the "not stocked here"
divider with a quantity of 0, and nothing anywhere reported an error.

This caught `cooking.spec.ts` on 2026-09-14. Measured, not guessed: with `Location` removed
from the cleanup list again, the cloud cooking test **fails on run 1 and passes on run 2** —
run 1's app created the default location, and the old cleanup left it behind for run 2. So
that test had been passing on a leaked row, and would have failed on any genuinely fresh
database.

**The server no longer drops the write.** Today every stock write takes its location id
from the caller — `writeStock` in `apps/server/src/lib/itemStockWrite.ts`, and the
`ItemStock` bulk imports in `import.resolver.ts` — so there is no silent fallback to drop
it into.

Where the server makes or picks a location by itself today (households H3a task 3.5
deleted `ensureDefaultLocation` and `apps/server/src/lib/defaultLocation.ts`):

| Case | Code | What it does |
|---|---|---|
| first sign-in | `ensureHousehold` in `apps/server/src/lib/household.ts`, reached through `requireHousehold` in `apps/server/src/lib/authz.ts` | a user with no household gets one, plus one location ("Home" in English) at `order: 0`, and an `organizer` row on it. There is no `isDefault` column since households H3a task 3.14. The `locations` query is the usual first caller. |

**No import row is put in a location the server picks** (since households H4 task E.3).
Until then a fallback in `apps/server/src/lib/authz.ts` (decision H12) sent an import log
with no `locationId`, and a cart whose id named no usable location, to the caller's first
writable location. It is deleted. Now:

| Import row | Server answer |
|---|---|
| a log with no `locationId` | `BAD_USER_INPUT`, `extensions.reason` `IMPORT_NEEDS_LOCATION`, nothing in the batch is written |
| a cart id with no `:` (a bare id such as `no-vendor`) | `BAD_USER_INPUT`, nothing written |
| a cart id or log naming a location that does not exist, or one in another household | `FORBIDDEN`, nothing written |

A spec that imports into cloud must name a real location for every log and cart.
`cart-id-cross-user-leak.spec.ts` test 1 pins the bare-id refusal for two households, and
its test 2 is the old leak test moved onto a location-prefixed id (households H4 task E.6).

**Every bulk import mutation also asks the household role `manager` first** (households H4
task E.3, the import role gate). A spec that imports as a second person must make that
person a household `manager`, not a `member`. `shared-cart.spec.ts` imports as `IMPORTER`
(a `manager` with `participant` on Home) for this reason.

**`ensureCloudHomeLocation(request)` (`e2e/helpers/cloudSeed.ts`) is worth calling
first.** It runs the `locations` query (which runs first sign-in) and returns the FIRST
location in the answer: "Home", at `order` 0, on a clean account. `seedCloudFixture` needs
that location's id (to map the fixture's home key onto) and its name (to decide whether to
rename it). `cooking.spec.ts`, `item-logs.spec.ts`, `shopping.spec.ts` and
`item-list-state-restore.spec.ts` also call it, because their stock writes need a location
id.

It was `ensureCloudDefaultLocation` until households H3a task 3.15, and picked the row with
`isDefault: true`. Task 3.14 dropped that column from the server, so every spec that
selected `isDefault` failed GraphQL validation (`Cannot query field "isDefault" on type
"Location"`). Measured on the branch before task 3.15: **76 of 130** cloud tests failed,
**57** of them with that error and the other 19 on the old "My Home" name (in `locations.spec.ts` and `location-switcher.spec.ts`).

**A cloud location is never "the default" any more.** "First" means first in the server's
answer, which is sorted by `order`, then by `id`. The web app uses the same rule for its
fallback active location (`useActiveLocation`). The cloud import picks no location by
itself any more: since households H4 task E.4 a cloud backup keeps every location id, and
a local backup's `'local'` row goes where the user picks in "Import into which location?"
(`fetchCloudDefaultLocationId` is deleted).

## A seed that writes an item must also write its stock — in BOTH modes

The pantry lists **stocked** items, not catalog items. `getStockedItems` filters on
`ItemStock`, so an item with no stock row at the active location is an orphan: in the
catalog, absent from the pantry. A seed that writes only the item is not a smaller seed,
it is a broken one — and the failure lands much later, on a locator timeout for a card
that never rendered.

Both halves of a dual-mode seed need their own fix, and a fix to one half looks like it
worked because the other project's four failures are reported separately:

| Mode | Writes | What to add |
|---|---|---|
| local | `db.transaction('items', 'readwrite')` | `await splitInlineStock(page)` from `helpers/locationSeed.ts`, after the item write |
| cloud | `createItem` over GraphQL | `upsertItemStock` after each `createItem`, with the location id from `ensureCloudHomeLocation(request)` (`helpers/cloudSeed.ts`) |

`splitInlineStock` touches IndexedDB only and does **nothing** for the cloud branch.

**The cloud half is not a server bug.** The `createItem` resolver
(`apps/server/src/resolvers/item.resolver.ts`) is a single `prisma.item.create` on
purpose — creating a catalog item and stocking it are two operations. The app's
`useCreateItem` hook runs `createItem` then `upsertItemStock` unless `catalogOnly`. A
seed that skips the second call is doing half of what the app does.

Keep the cloud seed parallel. 40 sequential round trips blow the test timeout. Await each
item's own `createItem` before its `upsertItemStock`; different items are independent:

```ts
await Promise.all(names.map(async (name) => {
  const { createItem } = await gql(CREATE_ITEM, { name })
  await gql(UPSERT_STOCK, { itemId: createItem.id, locationId, input: { /* … */ } })
}))
```

This cost 8 failing tests on `main` for weeks — `item-list-state-restore.spec.ts`, 4
local and 4 cloud (issue #280, fixed 2026-09-23). `settings/vendors.spec.ts` already
calls `splitInlineStock`. `settings/recipes.spec.ts` seeds items without stock and is
correct as written, because it asserts only on catalog views (the recipe-detail Items tab
reads `useItems()`), never on the pantry.

## Seeding a fixture that runs in both modes

A spec that seeds data and runs in both the `local` and `cloud` projects describes its
fixture **once, as plain data**, and lets each mode translate it:

| File | Role |
|---|---|
| `e2e/helpers/fixture.ts` | the `Fixture` type — `locations`, `vendors`, `tagTypes?`, `tags?`, `items`, `stocks`, `shelves`, `recipes`. `tagTypes` and `tags` are optional, and so are `items[].tagIds` and `shelves[].filterConfig` — see the two sections on them below |
| `e2e/helpers/localSeed.ts` | `seedLocalFixture(page, fixture)` — writes it to IndexedDB |
| `e2e/helpers/cloudSeed.ts` | `seedCloudFixture(request, fixture)` — writes it through GraphQL |

Both return the same `Record<locationKey, realLocationId>` map.

`e2e/tests/location-not-stocked-here.spec.ts` is the working example.

**A cloud-only spec uses `seedCloudFixture` on its own.**
`e2e/tests/location-scoped-writes.spec.ts` does that. It has no local twin and no
browser: it calls the four location-scoped write mutations through `makeGql` and reads
the result back the same way, because the behaviour it tests is which `locationId` the
server writes a row to. It is listed in the `cloud` project's `testMatch` AND in the
`local` project's `testIgnore` (`e2e/playwright.config.ts`), so it runs in exactly one
project. `settings/import-export-cloud.spec.ts` is configured the same way.

**Entity ids are the same in both modes.** `ItemInput`, `VendorInput`, `ShelfInput` and
`RecipeInput` all declare `id: ID!`, so the bulk import mutations accept the local
fixture's own fixed ids.

**Location ids are the exception.** The import schema has no `LocationInput` until PR 4
of cloud locations, so `createLocation(name:)` returns a server-generated cuid. That is
why `Fixture` references locations by a symbolic `key` (`'HOME'`, `'OFFICE'`) and never
by an id. A spec that hardcoded `'local'` — the local default-location sentinel — would
name nothing at all in cloud mode.

**`seedCloudFixture` reconciles stock; it does not assume — and that is why it needed no
change across two PRs that inverted what the server does.**

`bulkCreateItems` used to call `mirrorStockToDefaultLocation`, so every seeded item arrived
with a stock row at the default location whether the fixture asked for one or not. **That is
no longer true.** Cloud locations PR 4b task 6 deleted the call, and PR 5 removed the five
inline stock fields from `ItemInput` altogether — so `bulkCreateItems` now writes **no stock
row at all**, and step 3 of the seed leaves every item stocked nowhere.

The helper still reads the real stock rows back rather than predicting them, which is
exactly why it is correct under both behaviours. **Do not replace that read-back with an
assumption about what the server did.** It reads, and then:

- `upsertItemStock` for every `(item, location)` pair the fixture lists
- `removeItemFromLocation` for every pair in the database that the fixture does not list

Reconciling against what the database actually holds is what kept this working across both
changes. **Checked at PR 5, as this paragraph used to ask:** with no mirror running, the
reconcile finds nothing to remove and creates every row the fixture lists. No edit to the
loop was needed in 4b or in PR 5 — which is the whole argument for reading state back
instead of predicting it.

**The cloud list (`CLOUD_SPECS`) is 40 files today** (`e2e/playwright.config.ts`,
measured 2026-11-23; 40 after households H7b task M.5, 39 on 2026-11-21 after households H7
task L.6; 38 after H6b task K.8, 37 on 2026-11-20
after households H6 task J.8; 36 on 2026-11-19, 35 on 2026-11-18, 29
on 2026-11-04 and 13 on 2026-09-23). **Count the array rather than reusing that 40** — it
grows most weeks:

```bash
awk '/^const CLOUD_SPECS = \[/,/^\]/' e2e/playwright.config.ts | grep -c "spec\.ts'"
```

It gave **40** on 2026-11-23. The `awk` range matters: the file holds more than one such
list (`local`'s `testIgnore`, `CLOUD_SPECS`, `pwa`'s `testMatch`), and a grep over the
whole file counts them all (56 instead of 37 on 2026-11-20). **The range changed on
2026-11-23** (E2E speed plan task S.8): the cloud list moved into `const CLOUD_SPECS`, so
`cloud` and `cloud-neon` share it. The command this section gave before,
`awk "/name: 'cloud'/,/name: 'pwa'/" … | grep -c "spec\.ts'"`, prints 0 since then.

**The command this section used to give printed 0 from 2026-10-30.** It ended
`| grep -m1 testMatch | grep -o "'\*\*/[^']*\.spec\.ts'" | wc -l`, so it only counted the
spec names on the same line as `testMatch`. The Biome sweep (commit `e015378d`, issue #346)
put one entry per line. Measured: 25 on the commit before the sweep, 0 on the sweep.

The five added on 2026-09-24 are `recipes-group.spec.ts`,
`vendors-group.spec.ts`, `shelves.spec.ts`, `item-stock-input.spec.ts` and
`item-stock-pager.spec.ts`. The 19th file is
`cleanup-endpoint.spec.ts`, added 2026-09-27 for issue #319. The 20th is
`cart-id-cross-user-leak.spec.ts`, added 2026-10-03 by cloud locations PR 4b — the first
cloud spec with **two** users, and a labelled negative control rather than coverage.

Files 21 and 22 arrived on 2026-10-08 with cloud-parity PR C (issue #334). They are the first
E2E coverage of the `clear` and `replace` import strategies — before them only `skip` had ever
run end to end, in either project:

| File | What it covers | Projects |
|---|---|---|
| `settings/import-strategies.spec.ts` | `clear` and `replace` through `ImportCard`'s conflict dialog. 2 tests. `clear` is the only strategy that calls `clearAllData` (cloud) or the eleven `db.<table>.clear()` calls (local) | `local` **and** `cloud` |
| `settings/data-mode-migration.spec.ts` | `clear` through `DataModeCard`'s switch-to-cloud flow — no file, no conflict. 1 test, no page in `local` could ever run it | `cloud` only (also in `local`'s `testIgnore`) |

Files 23, 24 and 25 arrived on 2026-10-12 with issue #323. All three already ran in `local`
and now run in both:

| File | Tests in `cloud` | What the cloud run adds |
|---|---|---|
| `settings/shelves.spec.ts` | 1 | first real-SQL coverage of `shelf(id:)` (`apps/server/src/resolvers/shelf.resolver.ts:17`) and `deleteShelf` (`:50`) |
| `settings-global-pages.spec.ts` | 2 collected, 1 run (2 run since households H3a task 3.15) | no new resolver. Its second test skipped cloud until task 3.15, because the sidebar was the same markup in both modes. Since task 3.13 the 🏠 label shows the household name in cloud, so the test now runs there: it renames the household first and checks the label shows that name |
| `unified-item-search.spec.ts` | 10 | first real-SQL coverage of **`applyShelfFilterPicks`** (`:85`) and of `updateShelf(itemIds:)` (`:38`) |

**`applyShelfFilterPicks` was the target worth the work, and issue #323 never names it.** It
is a `prisma.$transaction` doing `deleteMany` plus `createMany` on the composite-key
`ItemTag` and `ItemVendor` join tables, a `recipeItem.create` and a `findUniqueOrThrow`, and
its own comment describes a Postgres `READ COMMITTED` deadlock it skips the delete+recreate
to avoid. **It passed first contact with Postgres** — 2 tests in 29.9s, no adjustment to the
spec or the resolver. No drama to expect here.

**Three gaps, so do not write "`applyShelfFilterPicks` is covered".** Write "it runs against
real SQL, and its tag branch is covered by mutation". All three measured 2026-10-12:

1. **`tx.itemVendor.createMany` (line 123) is reached by no test.** Commenting it out leaves
   all 10 cloud tests passing. Both filter shelves in the spec use tag axes only, so
   `addVendorIds` is always empty.
2. **`tx.recipeItem.create` (line 137) is reached by no test.** No filter shelf in the spec
   has a recipe axis.
3. **The `READ COMMITTED` deadlock is unproven.** `workers: 1` and `fullyParallel: false`
   make the run a serial single writer, so nothing races a concurrent `updateItem` on the
   same item.

**One file that could join `cloud` and must not: `onboarding.spec.ts`.** Issue #323 rated it
a candidate. `useOnboardingSetup` imports `createItem`, `createTag`, `createTagType` and
`createVendor` from `@/db/operations`, which is pure Dexie — `grep -c "apollo\|useQuery\|gql"
apps/web/src/db/operations.ts` returns **0** — and the hook's own comment says "Local-mode
only". So in cloud its template test would write to IndexedDB, reach **zero** resolvers, and
still pass `await expect(page).toHaveURL('/')`. That is a test reporting as covered while
covering nothing. The product gap is issue **#347**.

The `local` project is 23 spec files: 41 files under `e2e/tests/` minus the 18 in its
`testIgnore` (measured 2026-11-20, after households H6 task J.8; 40 minus 17 on 2026-11-19,
after households H5c task H.8; 39 minus 16 on
2026-11-18, and 33 minus 10 on 2026-11-04). Count them with `find e2e/tests -name '*.spec.ts' | wc -l` and
`awk "/testIgnore: \[/,/\],/" e2e/playwright.config.ts | grep -c "spec\.ts'"`.

File 26 is `cloud-user-row.spec.ts`, added 2026-10-31 by households H2 task 2.7. It is
cloud-only and has no browser, so it is also in `local`'s `testIgnore`. Its 3 tests act as
three new user ids, one per test, built from `E2E_SECOND_USER_ID`. All of them are cleaned
up with one `cleanupCloudData(request, ALL_USERS)` call in `beforeEach` (since E2E speed
plan task S.4; until then one call per id in both hooks).

File 27 is `purge-two-households.spec.ts`, added 2026-11-04 by households H3a task 3.10
(decision H10). It is cloud-only and has no browser, so it is also in `local`'s
`testIgnore`. Its 1 test makes two users, A and B, each with their own household and one
row of every model `clearAllData` deletes, built from `E2E_SECOND_USER_ID`
(`…-purge-a`, `…-purge-b`). A clears; every one of B's rows must survive, read back through
B's GraphQL, and A must be left with one new "Home". **It is the only real-SQL check that
`clearAllData`'s relation filters match the right rows.** Proved by mutation on
2026-11-04: `tx.shelf.deleteMany({})` in `clearAllData` made it fail with
`"shelves": Array []` where B's one shelf was expected. It cannot check a SHARED household:
that needs a second member, which E2E can add only from task 3.11.

Files 28 and 29 arrived on 2026-11-04 with households H3a task 3.11. Both are cloud-only,
have no browser, and are in `local`'s `testIgnore`. Both put a second person into one
household with `addHouseholdMember` (`e2e/helpers/cloudUsers.ts`), which calls the E2E-only
route `POST /e2e/household-members` (`apps/server/src/lib/e2eHouseholds.ts`, decision H9).

| File | Tests | What it proves on real SQL |
|---|---|---|
| `cloud-roles.spec.ts` | 3 | a household `member` cannot create a tag and a `manager` can; a location `viewer` can read stock but not change it and a `participant` can; a location with no role is `FORBIDDEN` for read and write |
| `household-member-cleanup.spec.ts` | 2 | `/e2e/cleanup` with two people in one household, in both orders: the member's cleanup leaves the owner's household and every row in it (even rows the member wrote); the owner's cleanup takes the member's role rows with the household |

**Use `addHouseholdMember` in this order, or it answers 409:**

1. The OWNER sends one GraphQL request first. That request makes the household.
2. Add the member BEFORE the member sends any GraphQL request. A request would make the
   member a household of their own, and the route refuses a person who is already in a
   household. (Since households H5b a person can be in two households, through an
   invite, and `ensureHousehold` picks one by a fixed rule: `User.activeHouseholdId`,
   else the oldest membership. This route still refuses, because it sets no
   `activeHouseholdId` and specs rely on the member's first request reading THIS
   household. For a person in two households, use `createInvite` and
   `joinHousehold` in `e2e/helpers/cloudUsers.ts`, which call the real mutations.)

The route sets the member's first sign-in claim (`User.householdSetupAt`). So after the
owner's cleanup removes the member's row, the member's next request gets `NO_HOUSEHOLD`. It
does NOT make them a new household. `household-member-cleanup.spec.ts` checks that.

Neither file makes a vendor or a cart. Until H3b a second member could not share a cart.
Since H3b carts are shared by location role, and `shared-cart.spec.ts` (households H3b task
B.9) is the spec for that: three people in one household (`organizer`, `participant`,
`viewer` on "Home"), one shared cart, and no browser. It is in the `cloud` project's
`testMatch` and the `local` project's `testIgnore`. Its two "at the same time" tests send
two requests with `Promise.all`; whether the two transactions really overlap in Postgres is
up to timing, so read the mutation results in the commit that added it before you rely on
them.

Proved by mutation on 2026-11-04, each against `--project=cloud` and undone from a copy:

| Mutation | Red test |
|---|---|
| `requireLocationRole` ignores `role` (`lib/authz.ts`) | the viewer test, `Received promise resolved instead of rejected` |
| `requireHouseholdRole` ignores `role` | the tag test, the same message |
| `/e2e/cleanup` reads the user's member rows without `role: 'owner'` | member-first cleanup, 8 counts differ |
| `/e2e/cleanup` deletes member rows by `{ userId }` only | owner-first cleanup, `householdMembers` 1 where 2 was expected |

**`settings/import-households.spec.ts` joined on 2026-11-16 (households H4 task E.6).**
Cloud only, with a browser, in `local`'s `testIgnore`. It is the first spec where the
BROWSER is a second person in someone else's household: `E2E_USER_ID` is added to an
owner's household with `addHouseholdMember` before the page sends its first request. Its
tests: a household `member` sees "Only the owner or a manager can import data." and no file
button, and the server refuses them; a `manager` gets no "Clear & import"; a file naming
another household's item writes nothing (its new VENDOR is what makes that able to fail,
because vendors go out before items); "Import into which location?" puts a local backup's
default rows into the picked location, or into a "New location"; a location the importer
only views is skipped and named; and a "Clear & import" of a cloud backup leaves no empty
"Home" (decision 6). One person in TWO households is still impossible through
`addHouseholdMember` (409). Since households H5b it is possible through a real invite:
`household-invites.spec.ts` test 4 does it with `createInvite` and `joinHousehold`.

**A browser context can be any user — since households H5 task F.8.** The project's own
`page` is still `E2E_USER_ID`, because `VITE_E2E_TEST_USER_ID` is one value in the web
build. A spec that needs a page as someone else calls
`newUserContext(browser, userId, extraLocalStorage?, options?)` (`e2e/helpers/userContext.ts`). It
makes a new context with `data-mode: cloud`, `e2e-skip-onboarding: true` and
`e2e-user-id: <userId>` in `localStorage`, and `baseURL: CLOUD_WEB_URL`: a context made
with `browser.newContext` does not inherit the project's `use` settings. The caller closes
it.

`options` (since households H5b task G.10) leaves out the first two keys, to act as a
brand-new visitor:

| Option | Default | `false` means |
|---|---|---|
| `skipOnboarding` | `true` | no `e2e-skip-onboarding`, so an empty catalog sends pages to `/onboarding`, as for a real new person |
| `cloudMode` | `true` | no `data-mode` key, so the app starts in LOCAL mode, as it does on a first visit |

| Part | Where | What it does |
|---|---|---|
| `getE2ETestUserId()` | `apps/web/src/lib/e2eUser.ts` | the key's value when the build-time flag is set and the key is not empty; else the build-time id; `undefined` with no flag |
| readers | `main.tsx` (once, then passed to `createApolloClientForE2E` and `LiveUpdatesRunner`), the Account card in `UserSettingsPanel` | the HTTP header, the socket and the screen use one id |
| production guard | `getE2ETestUserId` returns before it reads `localStorage` when the flag is empty | pinned by `e2eUser.test.ts`; a production build has no `"e2e-user-id"` string at all (grep `apps/web/dist/assets/*.js`, measured 2026-11-17: 0 files; the same build with the flag set: 1 file) |

**Grep the production bundle for the QUOTED key, `"e2e-user-id"`, quotes included.**
Without the quotes the text `e2e-user-id` also matches the header name `x-e2e-user-id`,
which sits in code the production build keeps but never runs. Then the grep finds 1 file
and looks like a failed guard. The command:

```bash
grep -l '"e2e-user-id"' apps/web/dist/assets/*.js | wc -l   # 0 in a production build
```

**The 409 order still applies.** Add the person to a household BEFORE their context
opens a page: the first page load is their first GraphQL request.

**Clean up the build-time user too.** If the override ever stops working, every context
falls back to `E2E_USER_ID` and writes rows as that user. `shared-household.spec.ts`
calls `cleanupCloudData(request)` for that reason, after its own two users.

`shared-household.spec.ts` is the first spec that uses it: 3 tests, cloud only (in
`local`'s `testIgnore`). A household `member` sees the tags page read-only while the owner
sees New Tag Type; a location `viewer` sees a cart row the owner adds in the owner's
browser, live, and gets no Done; a location a member creates shows to the owner on the
settings list as No access with Delete, and never in the switcher. Proved by mutation
2026-11-17, each in `cloud`:

| Mutation | Red test |
|---|---|
| `permissionsFor` gives `canEditCatalog: true` | test 1, the read-only note not found |
| the cart page shows Done without `canEditHere` | test 2, `toHaveCount(0)` received 1 |
| `householdLocations` returns `visibleLocations` for every role | test 3, the Shed row not found |
| `getE2ETestUserId` ignores the key | all 3 |

**`household-invites.spec.ts` joined on 2026-11-18 (households H5b task G.10).** Cloud
only, with up to three browsers, in `local`'s `testIgnore`. It is the first real-SQL run of
`createInvite`, `revokeInvite`, `invitePreview`, `joinHousehold`, `setHouseholdRole`,
`removeMember`, `leaveHousehold` and `createHousehold`. Page objects: `e2e/pages/JoinPage.ts`
and `e2e/pages/MembersPage.ts`.

| Test | What it proves |
|---|---|
| 1 | a brand-new visitor (`cloudMode: false`, `skipOnboarding: false`) opens a link made in the owner's browser, is NOT sent to `/onboarding`, presses Sign in to join and then Join, and lands on `/` in the owner's household. Their own empty household is deleted (read back as the cleanup's `households: 0`). Both browsers then see each other's changes live: the owner's Members page gets the new member (`LOCATION`), the joiner's pantry gets the owner's quantity (`STOCK`) |
| 2 | a used, a revoked, a made-up and a too-short link all show "no longer valid", and `invitePreview` sends no name for them |
| 3 | a removed person invited again as viewer is ONLY a viewer (View only, no quick update, `myRole: viewer`) |
| 4 | a person in two households acts in the one joined last; an import cannot write a stock row for the target household's item at their other household's location (`FORBIDDEN`), or put that household's item in a cart (row skipped). No browser |
| 5 | a member leaves, sees the no-household screen, and creates a household; their role on the owner's Home is gone (T11) |
| 6 | the owner makes a member a manager; the manager may remove a member, not the owner, sets no roles, and may not invite a manager. The server refuses a manager's `setHouseholdRole` and `removeMember` of the owner with `FORBIDDEN`. Then the manager makes a member invite and the owner removes them: the invite is gone from the open list and joining with it gives `INVITE_INVALID` (owner decision O20). The revoke sets `revokedAt` and deletes nothing, so the cleanup order for `createdById` (RESTRICT) is unchanged: the manager's cleanup deletes the revoked invite before their `User` row |
| 7, 8 | axe scans, light and dark: join page, Members page, invite dialog (form and link), Remove and Leave confirms, no-household screen and its Create dialog |

Proved by mutation on 2026-11-18, each in `cloud`, restored from a copy:

| Mutation | Red test, failure |
|---|---|
| `shouldRedirectToOnboarding` without its `/join/` line | 1: the local "Joining a household uses cloud sync…" text not found (the visitor was on `/onboarding`) |
| `joinHousehold` without the empty-household `deleteMany` (T21) | 1: `householdMembers` Expected 1, Received 2 |
| `removeMember` without T11 AND join without T20 AND `createMany({ skipDuplicates })` instead of `create` | 3: `Expected substring: "View only" / Received string: "Home"` |
| T11 and T20 both removed (no `skipDuplicates`) | 3: the join itself fails on the unique key; the test times out waiting for `/` |
| T11 alone, or T20 alone | 3 **stays green**: each one removes the old role on this path, so one is enough |
| T11 alone (the leave and remove `locationMember.deleteMany`) | 5: `locationMembers` Expected 1, Received 2 (added by the review of G.10: the leaver's cleanup counts their new Home's organizer row, plus any row left on the owner's Home) |
| `requireLocationInHousehold` removed from `requireOwnItemStockRefs` (issue #381 gap 1) | 4: `Received promise resolved instead of rejected`. The import names the TARGET household's item, so only the location check can refuse it |
| the household rule back to "first membership, no order, no active household" | 4: `household.id` is the person's own household |
| `invitePreview` names the household of a used or revoked link | 2: `householdName` `"Olivia Owner's Household"` where `null` was expected. Only the API check sees it: the page shows no name for INVALID |
| `memberActions` gives a manager Remove on every row | 6: `Remove Olivia Owner` Expected 0, Received 1 |
| `createInvite` lets a manager invite a manager | 6: `Received promise resolved instead of rejected` |
| `leaveHousehold` deletes nothing | 5: the member list still holds the newcomer |

**Two traps it hit, both about what a page can see:**

- **The switcher shows the ACTIVE household's locations only**, so it cannot show that a
  person's OTHER household was deleted. Test 1 reads the cleanup's counts instead. A
  person's other household cannot be read through GraphQL at all once they act elsewhere.
- **A filled button inside a dialog fails contrast at rest** (the `opacity-90` on
  `buttonVariants`). Measured: primary 4.19:1 in light, destructive 3.92:1 light and
  3.56:1 dark. Dialog scans use `checkDialogA11y` (`e2e/helpers/axe.ts`), which excludes
  only those `button` elements (not a Badge, Switch or bar with the same class) and only
  from `color-contrast`, like `a11y.spec.ts`. Whole-page scans
  use `checkA11y` with nothing excluded, and they pass.

**`location-people.spec.ts` joined on 2026-11-19 (households H5c task H.8).** Cloud only,
with up to two browsers, in `local`'s `testIgnore` (local mode has no people page; the URL
redirects there). It is the first real-SQL run of `locationPeople`, `setLocationRole`,
`removeLocationRole` and `leaveLocation`, and of their household-level `LOCATION` event.
Page object: `e2e/pages/LocationPeoplePage.ts`. 9 tests, **9 passed in 3.8 min** (load
average 2.7 at the start). Tests 1 to 4 carry `test.setTimeout` (90 s, 60 s, 60 s, 60 s):
measured with `--timeout=120000` at load 2.1 to 2.8 they took 43.0 s, 29.8 s, 28.0 s and
29.6 s. Tests 6 and 7 carry 60 s too, since households H5c task H.9: a later run measured
them at 24.4 s and 25.5 s, too close to 30 s under the load of the full gate. Tests 5, 8
and 9 keep the 30 s default.

The household: OWNER owns it ("Home" from first sign-in). CLEO and BEN join through
`createInvite(…, [])` + `joinHousehold` with NO location role (plan decision T44). CLEO then
makes "Garage", so CLEO is its only organizer and OWNER has No access there.

| Test | What it proves |
|---|---|
| 1 | an owner gives BEN (no location role, the "No location roles" mark on Members) a role from Home's page; BEN's empty screen turns into Home's pantry with no reload |
| 2 | Review Focus 1: an organizer (household `member`) gets no picker and no Remove on an organizer row, their own too, and only Participant and Viewer in Add person and in a row picker. The server refuses CLEO's forged `setLocationRole(…, organizer)`, a demote of OWNER, and a remove of OWNER with `FORBIDDEN` |
| 3 | Review Focus 2: BEN, active on Home, loses Home in OWNER's browser. BEN's tab moves to Garage (View only) with no reload, shows "You no longer have access to Home." once, and no Home card stays. Then losing Garage shows the empty screen |
| 4 | Review Focus 5: CLEO, the only organizer, leaves Garage (the confirm warns); CLEO's list and switcher lose Garage; OWNER's list shows No access and No organizer; OWNER gives themselves Organizer and the note goes |
| 5 | an owner who leaves their ACTIVE location stays on its page; the tab's active id moves to Home through the leave's own `GetLocations` read; the lost-access message shows (O27-A names leaving) |
| 6 | Review Focus 4: an owner with No access opens Garage's page and sees CLEO. Until the people and the Add person button are on screen, every GraphQL REQUEST of the tab that names Garage is `LocationPeople` (it checks requests, not responses). After OWNER gives themselves Viewer, `itemStocks(Garage)` answers (the positive control of the `FORBIDDEN` before) |
| 7 | Review Focus 3, as far as E2E can: `removeMember(BEN)` and `setLocationRole(BEN)` sent together; then BEN rejoins with no role and has no location. A `race order` annotation says which write went first. Then remove-then-set is `FORBIDDEN`. No browser |
| 8, 9 | axe, light and dark: the Members page with the "No location roles" mark and its link, Settings › Locations with the name links, the people page with No organizer, Add person, the Remove and Leave confirms. These were owed by H.5 and H.6: `a11y.spec.ts` does not run in `cloud` |

Proved by mutation on 2026-11-19, each in `cloud`, run as `location-people.spec.ts:<line>`,
restored from a copy and checked with `diff -q`:

| Mutation | Red test, failure |
|---|---|
| `canChangeLocationRole` lets an organizer give organizer (`packages/types`, so web AND server) | 2: the Organizer option `toHaveCount(0)`, Received 1 |
| the server's `setLocationRole` skips the rule (the page unchanged) | 2: the forged organizer call, `Received promise resolved instead of rejected` |
| `setLocationRole` publishes nothing | 1: BEN's switcher `Switch location (current: )`, the empty screen stayed |
| `removeLocationRole` publishes nothing | 3: BEN's switcher still `Switch location (current: Home)` |
| the lost-access `toast.info` removed | 3: the toast not found |
| the toast called twice | 3: strict mode, the toast text resolved to 2 elements |
| the fallback effect never moves the tab (`if (locations.length > 0) return`) | 3: BEN's switcher `Switch location (current: )` |
| `leaveLocation` deletes nothing | 4: the Garage row of CLEO's list, Expected 0, Received 1 |
| the role hooks do not read `GetLocations` again | 5: the stored active id is still Garage's |
| `locationPeople` refuses an owner with No access | 6: CLEO's picker not found (the page shows no access) |
| the people page also reads `PantryData` for its location | 6: the operations naming Garage were `LocationPeople` plus one more |
| `removeMember` keeps the role rows (T11) AND `locationPeople` without the H18 filter | 7: Home's people listed BEN right after the removal (line of the first readback) |
| `removeMember` keeps the role rows AND the join keeps old role rows (T20) | 7: BEN's `locations` after the rejoin was not empty |

Three mutations stayed **green**, and each one is a measured limit, not coverage:

- **`removeMember` keeps the role rows (T11) alone**: green. The H18 filter hides the left row
  before the rejoin, and the join's own delete (T20) removes it at the rejoin. The two
  double mutations above are what pin T11, H18 and T20 here.
- **the H18 filter alone**: not run as its own mutation, because no real write leaves a role
  row for a non-member. Without the T11 mutation the filter changes nothing on real SQL.
- **the role hooks skip `GetLocations`, measured on test 4**: green. CLEO's leave ends in a
  navigation to the list, and the list mounts new `useLocations` readers, whose
  `cache-and-network` reads `GetLocations` again. Test 5 was added for this: an owner stays
  on the page, so nothing new mounts.

**Two traps it hit:**

- **Settings pages have no location switcher.** The settings layout shows the household
  sidebar. Test 4 first looked for the switcher on Settings › Locations and timed out. A
  check of the active location on a settings page reads `active-location-id:cloud` from
  `localStorage` instead; the switcher is checked after a `goto('/')`.
- **A navigation can do the work you meant to test.** See the third green mutation above.
  A check that the tab "moved by itself" must not navigate first.

**`household-activity-purges.spec.ts` joined on 2026-11-20 (households H6 task J.8).** Cloud
only, two browsers, in `local`'s `testIgnore`. The first real-SQL run of the Activity page
and of both danger zones. Page objects: `e2e/pages/ActivityPage.ts`,
`e2e/pages/HouseholdPage.ts` (new) and the danger-zone methods of `LocationPeoplePage.ts`.
7 tests. OWNER owns the household; BEA joins as a `member` with no location role. Activity
Rice is stocked at Home, has one log there, and carries a tag with a tag type.

| Test | What it proves |
|---|---|
| 1 | the owner gives BEA a role in one tab; a SECOND tab of the owner shows "You gave Bea Member the Participant role on Home" live, with no reload |
| 2 | BEA, a member, has no Activity link in the sidebar, and the URL shows "Only the owner and managers can see the activity." |
| 3 | Clear household: the confirm is disabled before typing, for a lower-case name and for a name with a space at the end; after it, no item and one new "Home" |
| 4 | BEA, a member who organizes Home, removes all items: Home has no stock row, the pantry is empty, and the item's log tab still shows the log |
| 5 | Delete household: the owner sees the no-household screen; BEA sees it after a reload (no live event reaches BEA: the household has no members after the commit) |
| 6, 7 | axe, light and dark: the Activity page, the household page with its danger zone, the Clear household confirm and the Remove all items confirm |

`purge-two-households.spec.ts` gained 2 tests in the same task: `deleteAllLocations` and
`removeAllLocationItems(Home)`, each with two households of Home and Garage.

**Every purge mutation on this database must stay inside the spec's own users.** The test
database is shared. A purge whose scope is simply dropped deletes EVERY household's
locations or stock. So the J.8 mutations widened the scope to this spec's users instead
(for example `{ household: { members: { some: { userId: { startsWith:
'e2e-test-user-2-purge-' } } } } }`). The mutation table is in the H6 plan, task J.8.

**`household-ownership.spec.ts` joined on 2026-11-20 (households H6b task K.8).** Cloud only,
up to two browsers, in `local`'s `testIgnore`. The first real-SQL run of `offerOwnership`,
`acceptOwnershipOffer`, `declineOwnershipOffer`, the hand-over in `handleClerkEvent` (through
`POST /e2e/users/:id/deleted`), and the O37-A delete in `leaveHousehold`. Page objects:
`e2e/pages/MembersPage.ts` (the transfer methods are new) and `e2e/pages/OwnershipBanner.ts`
(new). 9 tests:

| Test | What it proves |
|---|---|
| 1 | the owner transfers to MIA on the Members page; MIA's open tab shows the banner with no reload; MIA accepts; the owner is a manager and MIA the owner, on the owner's open page too |
| 2 | MIA declines from the banner; the offer is gone, the owner still owns, and the owner's open page offers Transfer again |
| 3 | the owner's account is deleted; MIA (manager) gets the hand-over banner with no reload; BEN (member) gets none and sees "This household has no owner."; MIA accepts; `hasOwner` is true again |
| 4 | BEN, Garage's only organizer, deletes their account: `hasOrganizer` false, "No organizer" on the list, BEN gone from Members and from Garage's people |
| 5 | the only live person deletes their account: the household goes with a tag WITH a tag type, an item, stock, a cart row and a log (T64, the `NoAction` order on real SQL) |
| 6 | two managers accept the hand-over together through `makeGql`: exactly one wins and the household has one owner. The loser gets `OFFER_GONE` when its first read came before the winner's commit (it then waited at the lock), or `FORBIDDEN` when it came after. Both are accepted; any other answer fails. The `loser answer` annotation says which ran. Only an `OFFER_GONE` run exercises the row lock |
| 7 | owner decision O37-A: the last live person leaves a household with no owner; the confirm warns, and the household is deleted |
| 8, 9 | axe, light and dark: the transfer confirm, the Members page with a waiting offer, the banner with a transfer offer and with a hand-over offer |

Every test except 8 and 9 also checks that ANOTHER household (OTTO's) is untouched.

**GHOST: a member whose account is already deleted.** Since K.4 a `user.deleted` event
removes the person from every household, so no real event leaves a deleted account in a
household. Tests 5 and 7 need one: without it the "only person" counts give the same answer
with or without their `deletedAt` filter. The spec marks GHOST deleted while GHOST is in no
household, and THEN GHOST joins through a real invite. The E2E server checks no Clerk
session, so a deleted account can still send requests here.

**The cleanup trap.** A household whose owner's account was deleted has no owner row until
someone accepts the hand-over, so an owner rule alone cannot delete it. Since E2E speed plan
task S.4, `beforeEach` makes ONE cleanup call with every user of the spec, and
`/e2e/cleanup` also deletes a household whose members are ALL in the list (decision D6). So
a test that fails part way needs no rescue. `rescueOrphans` (accept any open offer, send
GHOST's deletion again) and the rule "each test ends with an owner" are gone. Proved by
failure injection in tests 3 and 7: the next test's one call deleted the household with no
owner. With D6 removed the household stayed and the next test still passed, so read the
cleanup's counts, not the next test's result.

**A tab whose live update is checked is opened with `openLive`.** A tab's FIRST socket
connect refetches nothing (`connects > 1` in `apps/web/src/apollo/liveUpdates.ts`), so an
event sent before the subscription is registered is lost for good. Until the review of K.8,
the owner's tab in tests 1 and 2 and BEN's tab in test 3 only loaded the page; test 3 sent
the `user.deleted` event about one second after BEN's page showed. `openLive` warms each
such tab up, waits for the warm-up's `CATALOG` refetches (`MyOwnershipOffers`, and
`GetHousehold` on the Members page) in that tab AND in the tabs already open, and the test
ends with `stillSameDocument` on that tab.

**Where to read the result back.** Test 5 and test 7 read `User.activeHouseholdId` through
`GET /e2e/users/:id`. It is `onDelete: SetNull`, so it goes null only when the household row is
deleted; a leave writes no `User` row (decision T16), and a hand-over keeps it.
`Household.ownerGoneAt` has no GraphQL field and no E2E route, so no test reads it.

**Timing.** Measured on 2026-11-20 with each test run alone: tests 4, 5 and 7 took 48.7 s,
42.1 s and 48.7 s, hooks included (the hooks clean 7 users twice). So 1, 3, 4, 5, 7, 8 and 9
carry 90 s, 2 and 6 carry 60 s. The first run failed test 5 at the 30 s default; alone, with
a longer budget, it passed.

Proved by mutation on 2026-11-20, each in `cloud`, restored from a copy and checked with
`diff -q`. The table is in the H6 plan, task K.8. One stayed green on purpose:
`countedOrganizerIn` without `deletedAt: null` leaves test 4 green, because the hand-over
already deleted BEN's role rows. That is a negative control, not coverage.

**`household-switch.spec.ts` joined on 2026-11-21 (households H7 task L.6).** Cloud only,
one browser, in `local`'s `testIgnore`. The first real-SQL run of `myHouseholds`,
`setActiveHousehold`, `createHousehold(alsoWhenMember: true)`, the `x-household-id` compare
in `requireHousehold` (`HOUSEHOLD_CHANGED`, owner decision O21) and the copy into a chosen
household (owner decision O22-A). Page object: `e2e/pages/HouseholdSwitcher.ts` (new); it is
the one place that matches the text of the one-time "household changed" message, by its
role (`status`) and the two household names, not by the whole sentence. The sentence did
change once (owner decision O56-A, task L.7) and no spec needed an edit. 6 tests:

| Test | What it proves |
|---|---|
| 1 | PAT, owner of A and a member of B, chooses B in **Switch to…**; the page loads `/` again; the stored active location is gone at the start of that load, and so is the saved cache copy; the cart page shows B's row and not A's (a negative control); A's cart row is still in A |
| 2 | PAT, in A only, uses **Create new**; the server makes the household and PAT acts in it; the page loads `/`; A and its item are still there |
| 3 | O21: a tab that shows A, after PAT moved to B through `makeGql` ("another device"), creates a tag type; the server answers `HOUSEHOLD_CHANGED`; no tag type in A or B; the tab reloads into B and shows the message |
| 4 | O22-A: PAT copies offline data with `skip` from a page that showed A, picks B (manager) in "Copy into", and **Move there and copy**; after the reload "Import into which location?" asks; the item lands in B only, and the page did reload with PAT active in B |
| 5, 6 | axe, light and dark: the page with the menu closed, the open menu alone, and the Create new dialog |

**No test covers O57-B** (a household joined on this device is offered in "Copy into" when
the role allows it). The spec joins through `joinHousehold` in `e2e/helpers/`, an API call,
so `migration-skip-households` is never set on the page. Unit tests in
`components/global/PostLoginMigrationDialog/index.test.tsx` cover it.

**Every test seeds PAT's own household with one row BEFORE the join.** `joinHousehold`
deletes the joiner's household when it is empty (decision T21). The join makes the joined
household active, so the seed ends with `setActiveHousehold(A)` through `makeGql`, which
sends no `x-household-id` and so is never refused.

**Two things E2E cannot see on its own, and how test 1 gets round them:**

- **Nothing writes `Player1InventoryCloudCache` in E2E.** The E2E build does not mount
  `ApolloWrapper` (the only saver), and its client uses a fresh `createCache()`, not
  `cloudCache`. So "the saved copy is gone after the switch" is true with or without
  `clearCache()`. Test 1 writes the copy itself (one snapshot row for PAT, plus
  `cloud-cache-user-id`, which makes `restoreCache` keep the row at every load), the state a
  production device is in.
- **`ActiveLocationProvider` rewrites the stored active location** as soon as the new
  household's locations load. A read after the page has loaded sees the new id whether
  `switchToHousehold` removed the old one or not. An init script records the value at the
  START of each page load (`window.__bootActiveLocation`), before the app runs.

**A whole-page axe scan with the menu open fails `aria-hidden-focus`** on the app root
`.h-dvh` (measured 2026-11-21, 1 node, light and dark), the same Radix modal-portal effect
`location-switcher.spec.ts` records. Scan the page with the menu closed, then
`[role="menu"]` alone.

**Read a refused write back AFTER the server answered it.** Test 3 waits for the
`CreateTagType` response (`operationResponse`) before it reads the tag types. A read right
after the click finds nothing whether the write was refused or not.

Proved by mutation on 2026-11-21, each in `cloud`, run as `household-switch.spec.ts:<line>`,
restored from a copy and checked with `cmp`. The table is in the H7 plan, task L.6. Two
measured limits:

- **`runStoredCopy` called before the move stays GREEN in test 4.** A `skip` copy stops at
  "Import into which location?" before it writes anything, and the reload throws it away.
  Only a `clear` copy into another household writes at once, and that needs the owner of
  the target; no test here runs one. The unit test pins it.
- **The cart page check of test 1 is a negative control**: with both `clearCache()` and the
  active-location removal taken out of `switchToHousehold` (and the two checks for them
  turned off), it stays green, because the page reloads and the cart page filters by the
  active location.

**`location-sort.spec.ts` joined on 2026-11-22 (households H7 task M.5).** Cloud only, in
`local`'s `testIgnore`, up to two browsers. The first real-SQL run of `LocationPreference`,
the personal `order` in `locations` and `householdLocations`, `reorderLocations` writing the
person's own order, `dataUpdatedAt` set by `publishChange`, `markLocationVisited`,
`myLocationSort` and `setLocationSort`. Page object: `e2e/pages/settings/LocationsPage.ts`
(new). The fixture is three locations, Cellar, Attic and Dock, with "Home" deleted, so the
shared order (Cellar, Attic, Dock) and the name order (Attic, Cellar, Dock) differ, and each
test expects a third order. 7 tests:

| Test | What it proves |
|---|---|
| 1 | Mia (owner) and Bea (member), two browsers: Mia drags her own order; Bea's list keeps the shared order |
| 2 | stock changed at Cellar, then at Dock (last by name and by shared order) gives Dock, Cellar, Attic under **Last updated** |
| 3 | the location picked last on the pantry comes first under **Last visited**, read after a new page load |
| 4 | **Name** sorts the list and the switcher |
| 5 | the sort chosen in one browser shows in a second browser of the same person; the test polls `myLocationSort` on the server |
| 6, 7 | axe, light and dark: the page, and the open **Sort by** list |

A local test, `user can sort locations by name in local mode` (owner decision O54-B), is in
`settings/locations.spec.ts` and skipped in cloud: after a reload the list is still by name,
and the switcher agrees.

Three traps the spec found:

- **The settings pages have no location switcher.** They show the household sidebar. Test 3
  makes the pick on the pantry.
- **A `true` answer from `markLocationVisited` writes `lastVisitedAt` into the cache**, so
  the same page sorts right even when the server stored nothing. Test 3 reads the order
  after a new page load.
- **`allTextContents()` on the switcher rows right after the click once gave `[]`.** The
  page object waits for each expected row first.

"Last updated" does not move while a page is open (owner decision O58-A): the location lists
refetch only on `LOCATION`. Test 2 makes its stock changes BEFORE it opens the page.

Proved by mutation on 2026-11-22, each in `cloud`, restored from a copy: all red. The table
is in the H7 plan, task M.5. No existing test of `settings/locations.spec.ts` or
`location-switcher.spec.ts` needed a change: the only cloud reorder test reads the person's
own order back after a reload.

**`DataModeCard`'s Switch flow renders in E2E mode — since households H4 task E.6.** A
production change made for a test, like `PostLoginMigrationDialog`'s below. The cloud
section used to be left out in E2E mode because its Sign Out flow calls `useClerk()`.
`useClerk()` moved into `CloudModeSectionWithClerk`, so the E2E build renders the Switch
button and the cloud → local copy, without Sign Out. `settings/data-mode-migration.spec.ts`
uses it to check that the copy puts the cloud ACTIVE location into local "My Home".

**Cloud test counts, measured, not quoted. Measure your own — do not subtract any number
below.** The one-line command:

```bash
pnpm test:e2e --project=cloud --list | tail -3
```

What the number has been, so you can see how fast it moves rather than reuse a figure:

| Date | Branch | Collected in `cloud` |
|---|---|---|
| 2026-09-24 | — | 97 |
| 2026-10-04 | `feature/cloud-locations-pr4b` | 103 |
| 2026-10-08 | `feature/cloud-item-note-wikidata`, before its E2E commit | 104 |
| 2026-10-08 | `feature/cloud-item-note-wikidata`, after it | 105 |
| 2026-10-08 | `feature/import-strategy-coverage` (cloud-parity PR C) | 108 |
| 2026-10-12 | `feature/cloud-spec-coverage` (issue #323) | 121 |
| 2026-10-31 | `feature/households-h2`, after `cloud-user-row.spec.ts` | 124 |
| 2026-11-04 | `feature/households-h3a`, after `purge-two-households.spec.ts` | 125 |
| 2026-11-04 | `feature/households-h3a`, after task 3.11's two specs | 130 |
| 2026-11-11 | `feature/households-h3a`, after task 3.15 | 133 |
| 2026-11-16 | `feature/households-h3c-2`, after `live-pantry.spec.ts` | 151 |
| 2026-11-17 | `feature/households-h4`, after task E.6 and the O9 follow-up | 160 |
| 2026-11-17 | `feature/households-h5`, after task F.8 | 168 |
| 2026-11-18 | `feature/households-h5b`, after task G.10. G.10 added 8 (`household-invites.spec.ts`); the other 1 came from an earlier H5b task and is not attributed here | 177 |
| 2026-11-19 | `feature/households-h5c`, after task H.8 (`location-people.spec.ts`, 9). `local` still collects 189 in 23 files | 186 |
| 2026-11-20 | `feature/households-h6a`, after task J.8 (`household-activity-purges.spec.ts`, 7; `purge-two-households.spec.ts`, 2 more). `local` still collects 189 in 23 files | 195 |
| 2026-11-20 | `feature/households-h6b`, after task K.8 (`household-ownership.spec.ts`, 9). `local` still collects 189 in 23 files | 204 (38 files) |
| 2026-11-21 | `feature/households-h7a`, after task L.6 (`household-switch.spec.ts`, 6). `local` still collects 189 in 23 files | 210 (39 of 43 files) |
| 2026-11-22 | `feature/households-h7b`, after task M.5 (`location-sort.spec.ts`, 7; 1 more in `settings/locations.spec.ts`, which runs in `local` only). `local` collects 190 in 23 files, `pwa` 73 in 2 | **218** (40 of 44 files) |

H5a added 9 tests and removed 1. All of them RUN only in `cloud`; the six in the two
shared spec files are also collected (and skipped) in `local`, which went 184 → 189: 3 in `location-switcher.spec.ts` (task
F.4, the View only badge and two axe scans), 3 in `settings/locations.spec.ts` (task F.7,
delete the last location and two axe scans of the empty screen) replacing the old
"last location is refused" test, and 3 in `shared-household.spec.ts` (task F.8).

Task 3.15 added 3: the cloud last-location test in `settings/locations.spec.ts` (skipped
in `local`, so `local` collects 184 and runs 178), and the same-household restore test in
`settings/import-export-cloud.spec.ts`, once per strategy (`skip`, `replace`). Its
sidebar test in `settings-global-pages.spec.ts` was collected before and now runs in cloud
instead of skipping.

Attribution for the steps that are known: 4b added 5 (1 for the leak spec, 4 because
`import-export-cloud.spec.ts` went 2 → 6). Cloud-parity PR A added 1 to
`location-scoped-writes.spec.ts`, taking it 4 → 5. Cloud-parity PR B added 1,
`user can clear a saved note and wikidata URL` in `item-management.spec.ts`. Cloud-parity PR C
added 3 — 2 in `settings/import-strategies.spec.ts` and 1 in
`settings/data-mode-migration.spec.ts` — and 2 of those 3 also run in `local`, which collected
**179** across its 23 files on the same branch. Issue #323 added **13**: 1 + 2 + 10 for the
three files it moved into `cloud`, and **`local` stayed at 179**, because all three already
ran there and the only skip it added is a runtime one. The step from 97
to 98 happened between 2026-09-24 and 4b and cannot be attributed from here.

**Runtime passed/skipped is a different number from the collected total, and only one of them
moves when you remove a skip.** `test.skip(condition, 'reason')` **inside a test body** is a
RUNTIME skip: Playwright has already collected the test, so `--list` counts it either way.
Removing such a skip **cannot** change the collected total. It moves the passed/skipped split
instead. A brief in cloud-parity PR B predicted a collected-count change from removing one and
was wrong for exactly this reason.

So when you want to know the effect of removing a skip, measure the split, not `--list`:

```bash
pnpm test:e2e --project=cloud e2e/tests/<file>.spec.ts   # read "N passed, M skipped"
```

Measured for PR B on `item-management.spec.ts` in `cloud`: **10 passed / 1 skipped** before,
**12 passed / 0 skipped** after. Two of that +2 come from different causes — one test started
running, and one test is new — which is why the collected total moved by 1 and the passing
count by 2.

**Moving the skip up to describe level does not change this.** A describe-level
`test.skip(condition, reason)` is still a runtime skip, so its tests are still collected.
`a11y.spec.ts`'s `offline banner a11y` block is the example: it carries
`test.skip(() => test.info().project.name !== 'pwa', …)` at describe level, and the measured
result is that the file **collects 66 under `local` and runs 64** (root `CLAUDE.md`,
*A11y Testing*). Describe level changes only **when inside the run** the skip fires — early
enough to stop the file's top-level `beforeEach`, which a body-level skip is too late for.
Nothing in this repo removes a test from the `--list` total by condition.

### `consumeAmount` and `targetUnit` — both helpers default to the product values

`FixtureItem` (`e2e/helpers/fixture.ts`) takes both as optional fields. **An omitted
field gives the same item in both modes:**

| Field omitted | Both helpers seed | Matches |
|---|---|---|
| `consumeAmount` | `1` | `createItem` (`consumeAmount ?? 1`), Prisma `@default(1)`, Dexie v16 + v17 |
| `targetUnit` | `'package'` | `createItem` (`targetUnit ?? 'package'`) |

**The field exists on `FixtureItem` so a spec can ask for something else** — a
`'measurement'` item, or a step other than 1. It is not there to paper over a difference
between the modes; there is none.

`seedLocalFixture` used to omit the key entirely, which produced `undefined` — a state
the app never creates. `createItem` defaults to 1, the Dexie v16 upgrade backfills
`undefined` to 1, and v17 backfills 0 and every non-finite value to 1. `seedCloudFixture`
already hardcoded `1` and `'package'`, so **cloud was right and local was the odd one
out.** Fixed 2026-09-24.

**Do not seed `consumeAmount: 0`.** `ItemForm.tsx` line 342 is
`consumeAmount <= 0 ? t('validation.positiveNumber') : undefined`, so a 0 opens the form
with a validation error. For about 24 hours (2026-08-23 to 2026-08-24) both create paths
did default to 0, meaning "unconfigured". The designer reversed that on 2026-08-24 — a new
item must be valid by nature — and the Dexie v17 upgrade migrates those rows to 1.

`consumeAmount` also drives `quantityStep` (`ItemForm.tsx` line 355), which becomes the
`step` attribute of three number inputs (Unpacked line 802, Target Quantity line 921 while
`targetUnit === 'measurement'`, Refill When Below line 956).

Do **not** write that `step` makes a decimal-input test pass. `step` affects validity and
the spinner, not the text the browser keeps while the field has focus. The rounding
`consumeAmount` drives is `roundToStep`, passed as `normalizeOnBlur` (`ItemForm.tsx` lines
277-280 and 806-809), and it runs only on blur.

**`item-stock-input.spec.ts`'s decimal test reaches that rounding since 2026-09-25 (issue
#318).** It used to type `2.5`, assert the text while the field was still focused, and
stop. That version was green at `consumeAmount: 0` and at `1`, and green under both source
mutations measured on 2026-09-24 — including the whole pre-`2fe372a1` shape, the bug the
file exists to guard. It now presses `Tab` as well and asserts the field settles to `3`,
because `roundToStep(2.5, 1)` is `3` — `roundToStep` rounds to the step's decimal places,
not to a multiple of it (`apps/web/src/lib/quantityUtils.ts` line 14).

Measured 2026-09-25 in the `cloud` project, with `normalizeOnBlur` unwired at the Unpacked
call site (`ItemForm.tsx` line 809):

| Spec version | Result |
|---|---|
| before issue #318 | **3 passed** — the rounding never ran, so nothing could see it go |
| after | **1 failed**: `expect(locator).toHaveValue(expected) failed / Expected: "3" / Received: "2.5"` |

So that test now depends on the fixture's `consumeAmount: 1`. It is still not a `step`
test.

### `amountPerPackage` — a spec that asserts a packed total must set it

`FixtureItem` (`e2e/helpers/fixture.ts`) carries an optional `amountPerPackage`, added
2026-10-08 for issue #336 and threaded through **both** seeders:
`seedCloudFixture` writes `item.amountPerPackage ?? null`, and `seedLocalFixture` omits the
key when the field is `undefined` (`Item.amountPerPackage` is optional in Dexie, so an
explicit `undefined` is not the same as an absent key).

**Set it whenever a spec asserts a packed total.** `getPackedTotal`
(`apps/web/src/lib/quantityUtils.ts`) returns the plain sum `packedQuantity +
unpackedQuantity` when `amountPerPackage` is unset or 0, and `packedQuantity +
unpackedQuantity / amountPerPackage` when it is set. **So a fixture that omits it cannot
tell the conversion from the plain sum, and a test of the conversion passes against code
that does not convert.** A non-zero `unpackedQuantity` is needed too, for the same reason.

`e2e/tests/location-scoped-writes.spec.ts` is the only spec using it today. It needed a
**second** fixture, `PACKED_FIXTURE`, rather than an edit to the shared `FIXTURE`: `FIXTURE`
has no `amountPerPackage` and `unpackedQuantity: 0` at both locations, and editing it would
have changed the numbers the file's other tests assert.

The field is **global item configuration**, so `ItemStockInput` has no place for it. It has
to be written with the item.

**Known gap: no local fixture sets it yet**, so `seedLocalFixture`'s pass-through has no
test. The one spec that uses the field is cloud-only.

### `tagTypes`, `tags` and `items[].tagIds` — three keys, one order

Added 2026-10-12 for issue #323 task 2, and threaded through **both** seeders. All three are
**optional**: 13 fixture literals existed when they were added and none of them has a tag, so
making them required would have added `tagTypes: []` to 13 specs that say nothing about tags.

**Write them in this order: tag types, then tags, then items.** Each step drops ids the
previous step has not created yet, and it drops them in silence:

| Step | What it drops |
|---|---|
| `bulkCreateTags` | any tag whose `typeId` is not already a `TagType` row |
| `bulkCreateItems` | any id in `tagIds` that is not already a `Tag` row (`apps/server/src/resolvers/import.resolver.ts` line 476) |

Both seeders already do this, so a fixture only has to fill the keys in.
`seedCloudFixture` used to hardcode `tagIds: []` when it called `bulkCreateItems`; it now
sends `item.tagIds ?? []`.

**A spec that cares about a tag link must assert the LINK, not that the item rendered.** An
item whose `tagIds` were dropped still appears on a tag's Items tab — in the unassigned
group. `settings-global-pages.spec.ts` asserts
`getByRole('checkbox', { name: /^(Add|Remove) Milk$/ })` is **checked** for exactly this
reason.

### `shelves[].filterConfig` — nothing validates the ids inside it

Added 2026-10-12 for issue #323 task 3, in both seeders. The same change named the inline
shelf type `FixtureShelf`. **No translation is needed:** `FilterConfig`
(`packages/types/src/index.ts`) and `FilterConfigInput`
(`apps/server/src/schema/shelf.graphql`) declare the same three optional string arrays.

**Every id in it must already exist when the shelf is written, and nothing checks that.**
`bulkCreateShelves` stores `filterConfig` as an opaque JSON column, so an id naming no row is
written without complaint in **both** modes. A filter shelf whose axis names a missing entity
renders an inert `groupNote` instead of an action button — `canJoinFilterShelf` is false
(`apps/web/src/components/pantry/ShelfDetailView.tsx` line 219). So a wrong id
does not fail the seed — it quietly removes the button the spec is about to press.

**Assert the seed as a precondition.** `unified-item-search.spec.ts` reads the shelf back and
checks `filterConfig.tagIds` before it touches the page. Measured 2026-10-12, both halves of
the threading fail there with `Expected value: "tag-snacks" / Received array: []` —
`seedCloudFixture` sending `filterConfig: null`, and `seedLocalFixture` omitting the key.
Without that assertion the cloud run failed much later, as
`locator.click: Test timeout of 30000ms exceeded` — a missing element, which says far less
than a missing id.

### Location order is assigned differently in the two modes — keep the default first

| Helper | How it assigns `order` |
|---|---|
| `seedLocalFixture` | `order: index` for **every** location, default included (`localSeed.ts` line 50) |
| `seedCloudFixture` | never creates the fixture's home entry (the one marked `isDefault`) — it maps it onto the location first sign-in made at `order: 0` ("Home", `ensureHousehold` in `apps/server/src/lib/household.ts`; before households H3a task 3.5 it was `ensureDefaultLocation`), renames it to the fixture's name, and `continue`s past `isDefault` entries in its creation loop. `createLocation` appends `maxOrder + 1`. |

So only the relative order of the **non-default** locations follows the array in cloud.
Moving the default entry elsewhere in the array is **invisible in cloud** and changes the
page order in local. Measured on 2026-09-24 with `item-stock-pager.spec.ts`: default moved
to the middle gave cloud **4 passed, 1 skipped — unchanged**, and local **1 failed**
(`Previous location` expected disabled, received enabled — the pager opened on page 2).

A fixture that does not list the default first therefore makes the two modes test
different page orders, and only local reports it. **Keep the default location first.**

### `e2e/helpers/stockReadback.ts` — mode-aware stock readback

A cloud run has no IndexedDB. `readRows(page, 'itemStocks')` returns `[]` there, so any
assertion built on it is vacuous — it passes against every implementation.

Use `readStocksForItem(page, request, baseURL, itemId)` or
`readStockAt(page, request, baseURL, itemId, locationId)` instead. Local reads IndexedDB
and filters by `itemId`; cloud queries `itemStocksForItem(itemId)`, the same query the
Stock-tab pager uses (`apps/web/src/hooks/useItemStocks.ts`). Both return the same
`StockRow` shape, because the Dexie row and the GraphQL type use the same key names.

Reach for it in any dual-mode spec that asserts on stock rows rather than on rendered
text. `item-stock-input.spec.ts`, `item-stock-pager.spec.ts` and the two import/export
specs are the users today.

`readLocations(page, request, baseURL)` joined it on 2026-10-04 (cloud locations PR 4b
task 8) and branches the same way: local reads the `locations` store, cloud runs the
`locations` query. **Look a location up by NAME, never by id.** The ids differ between the
modes on purpose — the local default is the `'local'` sentinel, a cloud location is a
server-generated cuid, and the import remap rewrites the payload's default onto whichever
one the destination holds.

Each row carries `isHome`, not `isDefault` (since households H3a task 3.15). Local: the row
Dexie flags `isDefault`. Cloud: the FIRST row of the `locations` answer, because cloud has
no default location. So in cloud "exactly one home" is always true; what a cloud assertion
can still check is that the first location has the expected name.

**Since households H4 the cloud import has no remap** (task E.4, decision T16). A cloud
backup keeps every location id, and a local backup's `'local'` row goes where the user
picks in "Import into which location?" (`SettingsPage.chooseImportLocation`). So after a
cloud backup is restored into a NEW household, the household's own fresh "Home" and the
backup's first location both sit at `order` 0, and which one is "first" is decided by
`id`. **Look such a location up by name**, and pass the fresh "Home" to
`expectFixtureLocations` / `expectFixtureStockPerLocation` as an extra location.

### `e2e/helpers/backupAssertions.ts` — the import/export location checks, written once

`import-export-local.spec.ts` and `import-export-cloud.spec.ts` each have their own
`verifyRelations`. The two had **already drifted** — the local copy grew a seventh check for
the shelf that the cloud copy never got — and **neither asserted a location or a quantity at
all**. So every imported item could land in the wrong location, or in NO location, and both
specs still passed. Cloud locations PR 4b made that dangerous: its task 6 deleted
`mirrorStockToDefaultLocation`, the server mirror that used to stock every imported item at
the caller's default location and so hid exactly this failure.

The new checks therefore live in **one** module, not a third copy:

| Export | What it asserts |
|---|---|
| `expectFixtureLocations` | three locations (plus any `extraLocationNames`), and which one holds the backup's default rows, found by name. With no extra location it also checks that the home row (local: the `isDefault` row; cloud: the first location) has that name |
| `expectFixtureStockPerLocation` | one stock row per location, each with its own quantities |
| `expectStockNotCollapsedOntoDefault` | the two non-default rows are not sitting on the home location |

**Both fixtures describe the same three locations under the same names, with the same three
different quantities.** `e2e/fixtures/local-backup.json`'s default id is the `'local'`
sentinel; `cloud-backup.json`'s is `aaaaaa000000000000000010`. Only the ids differ, so a
fixture resolves a location by name. A local backup's `'local'` goes where the user picks;
a cloud backup keeps its own ids (households H4, decision T16).

**Do not make those quantities equal, and do not drop to one location.** With one location,
"the location the payload named" and "the caller's default" are the same id; with equal
numbers, "each row kept its own location" and "every row landed on the default" give the
same answer. Either way no assertion in this module can fail.

**A LOCAL backup's default-location NAME does not survive a `skip` import, in either
mode.** `ImportCard` runs the **`skip`** strategy whenever the payload raises no
conflict, and `skip` means "add what is missing, change nothing that is already there". The
backup's default row (`'local'`) is put on a location the destination already holds (in
cloud, the one picked in "Import into which location?"), so that row is always the one
`skip` leaves alone: local filters it out by `existingIds`, cloud does not send it as a new
location. A CLOUD backup restored into a new household keeps its default's name, because
since households H4 its location comes back under its own id. Measured 2026-10-04 — a backup whose default was
called "Fixture Home" came back as `[ "Fixture Cabin", "My Home", "Fixture Office" ]` in
both projects. That is why `destinationDefaultLocationName(baseURL)` exists and why the
default's expected name is a parameter rather than a constant in the fixture.

**The destination's name differs by mode since households H3a.** Local starts with
"My Home" (Dexie's `on('populate')`); cloud starts with "Home" (first sign-in, and again
after `clearAllData`). `homeLocationName(baseURL)` in `e2e/constants.ts` gives the right
one, and `destinationDefaultLocationName` in `helpers/backupAssertions.ts` returns it.
Until task 3.15 this was one constant, `DESTINATION_DEFAULT_LOCATION_NAME = 'My Home'`,
because the old server also said "My Home".

**`clear` and `replace` differ from `skip` — in LOCAL mode only.** `importLocations`
(`apps/web/src/lib/importData.ts`) branches on `strategy === 'skip'` and on nothing else, so
both other strategies `bulkPut` the whole location list and the local default row takes the
backup's name. Cloud keeps "Home" whatever the strategy, because `bulkCreateLocations`
skips a row whose id is already taken. So a dual-mode spec running `clear` or `replace` must
branch on `baseURL === CLOUD_WEB_URL` for the expected default name:

| strategy | local expects | cloud expects |
|---|---|---|
| `skip` | `destinationDefaultLocationName(baseURL)` ("My Home") | `destinationDefaultLocationName(baseURL)` ("Home") |
| `replace`, `clear` | `FIXTURE_DEFAULT_LOCATION_NAME` | `destinationDefaultLocationName(baseURL)` ("Home") |

`settings/import-strategies.spec.ts` does that branch in `expectedDefaultLocationName`.

**Until 2026-10-08 this section said no test covered `clear`, and that the UI reached it
"only through the conflict dialog". Both were wrong by then.** Two specs cover it —
`settings/import-strategies.spec.ts` in both projects, `settings/data-mode-migration.spec.ts`
in cloud — and `DataModeCard`'s `enableStrategyDialog` reaches `clear` with no conflict and no
file at all. The old note also gave the button as "clear and import"; it reads
**"Clear & import"** (`settings.import.conflictDialog.clear`).

**"Clear & import" is the same visible string in two different dialogs.** Since households H1
they open from different places — `ConflictDialog` from `ImportCard` on `/settings/household`,
`DataModeCard` from `UserSettingsPanel` (the desktop user sidebar, or the mobile `/settings`
accordion) — but on desktop both can be on screen at once.
Scope by role, not by text alone: `ConflictDialog` is a Radix `Dialog` (`role="dialog"`),
`DataModeCard`'s three dialogs are Radix `AlertDialog`s (`role="alertdialog"`, string
`settings.dataMode.enableStrategyDialog.clearAndImport`).

**Reading a cart row's `locationId` COLUMN needs `cartItemCountByItem(itemId, locationId:)`.**
The `Cart` GraphQL type (`apps/server/src/schema/cart.graphql`) exposes `id` and
`lastPurchasedAt` and nothing else, so there is no `locationId` field to select. That query
resolves through `where: { itemId, userId, cart: { locationId } }`, so it reads the column
rather than parsing the id string — which is the whole difference between "the client sent
the right id" and "Postgres wrote the right column".

**A cloud seed must write stock of its own.** `import-export-cloud.spec.ts`'s own
`seedCloudFixture` wrote items and no `ItemStock` rows, and relied on the server mirror. With
that mirror gone both of its tests failed on `getByRole('heading', { name: 'Fixture Item',
level: 3 })`, "element(s) not found" — the item was in the catalog and in no location. See
"A seed that writes an item must also write its stock" above; the same rule applies to a
spec's private seed, not only to `helpers/cloudSeed.ts`.

### The three group specs are NOT location coverage

`shelves.spec.ts`, `vendors-group.spec.ts` and `recipes-group.spec.ts` seed **one**
location. With one location, "count items stocked here" and "count every item" return the
same number, so no location-scoping mutation can go red in them.

They exist to cover badge and total maths — the `N empty` / `N low stock` badges and the
packed total — which had **no** cloud coverage at all before 2026-09-24. Do not count them
toward location coverage. That is what `location-not-stocked-here.spec.ts` and
`location-scoped-writes.spec.ts` are for.

`item-stock-pager.spec.ts` is different: it seeds several locations, and its scoping
mutation did go red.

## Driving a local → cloud migration from a cloud spec

`e2e/tests/settings/data-mode-migration.spec.ts` (cloud-parity PR C, issue #334) is the only
spec that seeds LOCAL IndexedDB data while running in the `cloud` project and then watches the
app copy it up. Three things it had to get right are measured facts, not preferences.

### Seed local data only AFTER a local-mode boot

`main.tsx` calls `db.open()` **only** when the mode it read from `localStorage` is `local`. In
cloud mode Dexie never runs, so the app database does not exist. Measured 2026-10-08 on port
5174 (`CLOUD_WEB_URL`), reading `indexedDB.databases()`:

| Point in the flow | Databases present |
|---|---|
| cloud-mode boot | `Player1InventoryCloudCache@10` only |
| after `data-mode=local` + `reload()` | `Player1Inventory@180` **and** `Player1InventoryCloudCache@10` |

`180` is IDB version 18 × 10, Dexie's schema v18 with all **11** stores. Seed before that boot
and `indexedDB.open('Player1Inventory')` creates an empty database with **no object stores**,
so the seed helper throws `NotFoundError: One of the specified object stores was not found` —
the same error the stale-codegen section above describes, from a different cause.

The order is therefore: `page.goto('/')` → write `data-mode=local` → `page.reload()` →
`seedLocalFixture(page, …)`.

### The stored copy asks first (owner decision O22-A, 2026-11-18)

After the reload the copy no longer starts by itself. `PostLoginMigrationDialog` first asks
"Copy your offline data into {household}?", naming the household, once `GetHousehold` and
`GetLocations` have both loaded. The spec waits for that heading, checks the "shared" line is
absent (the E2E user owns its household), and presses **Copy here**. The stored strategy is
`clear`, so since households H6 task K.0 (owner decision O40) a second confirm opens: its own
**Copy here** is disabled until the household name is typed exactly. The spec reads the name
with `query { household { name } }`, checks the cloud seed is still there, types it and
confirms. Only then does "Copying local data to cloud…" show.

**`ImportCard`'s "Clear & import" asks for the household name too, in cloud.** Use
`SettingsPage.chooseClearAndImport(householdName)`: it presses the button, checks the typed-name
confirm (`role="alertdialog"`) is disabled, types the name and confirms. Pass `null` in local
mode, which has no household and still imports on the first press.

### Do NOT set `data-mode` in `page.addInitScript`

`addInitScript` re-runs on **every** document load. `DataModeCard.doEnableSwitch` writes
`data-mode=cloud` and then reloads, so an init script would overwrite that value on the way
through and send the flow straight back to local mode. Use `page.evaluate` plus
`page.reload()`, which runs once.

`e2e-skip-onboarding` is fine in an init script — it has to survive every reload, which is the
opposite requirement.

### The persisted Apollo cache cannot affect an E2E run

Two independent reasons, both checked in source rather than assumed:

- `createApolloClientForE2E` (`apps/web/src/apollo/client.ts`, line 143 on 2026-11-16) builds its client with a
  fresh `createCache()`. It never touches the module-level `cloudCache` that `restoreCache`
  writes into, so nothing a previous run persisted reaches an E2E client.
- `localStorage['cloud-cache-user-id']` is never written in E2E. Its only writer is
  `setLastSignedInUserId`, called from `ApolloWrapper.tsx` (line 108 on 2026-11-16) — and `main.tsx` renders
  `ApolloWrapper` only on the non-E2E cloud branch.

So a cloud spec does not need to clear the Apollo cache, and a failure that looks like stale
cloud data is something else.

## `PostLoginMigrationDialog` mounts in E2E test mode — a production change made for a test

Since cloud-parity PR C (2026-10-08), `__root.tsx` mounts `PostLoginMigrationDialog` whenever
`mode === 'cloud'`, E2E or not. It used to be gated behind `!isE2ETestMode`. **Say this
plainly: shipped code changed so that a test could reach a path.** `CloudAuthGuard` is still
gated off — it calls `useAuth()` and would redirect the run to `/sign-in`.

Why it was needed: `PostLoginMigrationDialog` is the only mount site of
`usePostLoginMigration`, and that hook is what runs the `clear` import after
`DataModeCard.doEnableSwitch('clear')` writes `migration-strategy`. With the old gate,
`DataModeCard` wrote the key in E2E and nothing ever read it, so path 2 could not be driven at
all. The hook's Clerk `useAuth()` call moved into a component shim
(`PostLoginMigrationDialogWithClerk` / `PostLoginMigrationDialogE2E`), so the hook itself
imports nothing from `@clerk/react`.

**The risk, and why it is contained.** `usePostLoginMigration` can run `clearAllData`, which
deletes every cloud row for the account. That destructive path now sits in every cloud spec's
component tree. It cannot fire by accident, and this was checked in PR C task 1 rather than
assumed:

| Check | Result |
|---|---|
| What the `cloud` project seeds into each context | an inline `storageState` object with exactly **one** entry, `{ name: 'data-mode', value: 'cloud' }` (`e2e/playwright.config.ts`). Nothing is written back to it |
| `grep -rnE "storageState\|globalSetup\|browser.newContext\|newPage\(\)" e2e/` | in PR C: one config line and one comment. No `globalSetup`, no hand-made context, no spec that saves state. **Two have joined since**, and neither seeds the key: `newUserContext` (`e2e/helpers/userContext.ts`, households H5 task F.8) writes `data-mode`, `e2e-skip-onboarding`, `e2e-user-id` and the keys its caller passes; `e2e/global-setup.ts` (E2E speed plan task S.3) opens only an API request context, with no browser and no storage |
| Scope of Playwright's `page` / `context` fixtures | test-scoped, so a `localStorage` key written by one test is gone before the next starts |

The hook needs a `migration-strategy` key to act, and nothing seeds one.

**The one case this does not cover** is a test that puts `migration-strategy` into
`localStorage` during its own run and keeps using the same page.
`settings/data-mode-migration.spec.ts` does exactly that on purpose — it clicks through
`DataModeCard`, which writes the key — so it clears IndexedDB, `localStorage` and
`sessionStorage` in its own `afterEach` even though a fresh context would have done it.

## Page objects show as steps — call `withSteps(this)`

Since 2026-09-29 every page object ends its constructor with `withSteps(this)`
(`e2e/pages/step.ts`). It wraps each `async` method in `test.step`, so the HTML report —
which non-developers read on the living spec site — shows `Check recipe "Pasta"` instead
of raw locator calls.

- **A new page object must call it too.** Without it, the class still works, but its
  actions vanish from the report.
- **The method name becomes the step name.** `addItemToCart('Milk')` shows as
  `Add item to cart "Milk"`. Name methods as actions a reader understands.
- **String, number and boolean arguments go into the name.** A seed id shows as a raw
  string (`Navigate to "a11y-pager-item"`). Locators and objects are left out.
- **Keep `get…` methods synchronous.** Only `async` methods are wrapped. A sync method
  that returns a `Locator` is left alone; wrapping it would make it return a `Promise`.
- **Create page objects only inside a test or hook.** `test.step` throws anywhere else.
- Arrow-function fields and methods inherited from a parent class are not wrapped.

`SPEC_REPORT=1` (set by `pnpm spec:publish`) turns on `screenshot: 'on'` in the top-level
`use` of `playwright.config.ts`, so every test in the published report has a screenshot.
Normal runs keep `'off'`.

## How `e2e/` is linted and type-checked

Wired up 2026-10-11 (issue #322). Before that date nothing checked this directory at all.

| Command | What it checks | Run in the gate by |
|---|---|---|
| `pnpm typecheck:e2e` | `tsc -p e2e/tsconfig.json` — every `.ts` here, no exclusions | the last step of root `pnpm build` |
| `pnpm lint:e2e` | `biome lint ./e2e`, using the root `biome.jsonc` | the second half of root `pnpm lint` |
| `pnpm check:e2e` | `biome check ./e2e` — lint plus format plus import order (since 2026-10-30, issue #346) | the second half of root `pnpm check` |

Run them from the repo root. All three are clean today except for 13 Biome **warnings**,
which do not fail the command: 6 `lint/suspicious/noExplicitAny` and 7
`lint/style/noNonNullAssertion`.

**Do not hand-roll a probe tsconfig any more.** `e2e/tsconfig.json` is the one to use, and
`pnpm typecheck:e2e` is how to run it. Every probe written before this existed got the
counts wrong, in one of three ways:

| Mistake | What `tsc` reports | Why it misleads |
|---|---|---|
| `types: ["node"]` with `@types/node` unresolvable | exactly **1** error, `TS2688` | `tsc` bails before checking any file. Looks like success |
| the probe config written to `/tmp` | the same `TS2688` | `typeRoots` resolves from `/tmp/node_modules/@types` |
| no `DOM` in `lib` | **210** errors | 147 are artefacts — 121 × `TS2304` `Cannot find name 'indexedDB'`, 23 × `TS7031`. Spec bodies run in Node, but `page.evaluate` and `addInitScript` callbacks run in the browser |
| `types: []` | **78** errors | adds 10 × `TS2307` for `node:fs`/`node:path`/`node:url` and 5 × `TS2591` for `process` on top of the real ones |

`@types/node` is a **root** devDependency for the first row's sake. pnpm does not hoist, so
a root-level program cannot see `apps/web`'s copy. Check with `ls node_modules/@types/node`
from the repo root.

**The count was 63 errors when this was wired up on 2026-10-11, all `TS2559`, all in
`e2e/tests/a11y.spec.ts`. It is 0 now** — task 3 fixed them later the same day. The old
figures in this file — 78 in total across five files, with 5 × `TS2580` in
`playwright.config.ts` — were all missing-`@types/node` artefacts except the 63. Earlier
versions of this table also said 39 and 2 where the real numbers were 63 and 5. **Take your
own baseline before quoting any number here.**

### `a11y.spec.ts` was excluded for a few hours, and is not any more

From the morning of 2026-10-11 until later that day, `e2e/tsconfig.json` excluded it. Its 63
`TS2559` errors were one mistake repeated once per `checkA11y` call: `AXE_OPTIONS` was
passed at the top level, where `axe-playwright` wants it nested under an `axeOptions` key.
So axe ran with its own defaults and the WCAG AA filter the comment described never applied.

Issue #322 task 3 measured what the filter would cost before applying it — 89 evaluated
rules down to 62, 28 `best-practice` rules dropped, 1 WCAG 2.2 AA rule (`target-size`)
gained, and none of the 28 reporting anything on 130 scans — then nested the options. With
that done, three things were deleted: the `exclude` entry, `e2e/tsconfig.a11y.json`, and the
`typecheck:e2e:a11y` script. The full rule list and the measurement are in the root
`CLAUDE.md` under *A11y Testing*.

`pnpm typecheck:e2e` now covers **every** `.ts` under `e2e/`. Proved by mutation on
2026-10-11: flattening `AXE_OPTIONS` back to a bare `RunOptions` makes it exit 2 with 63 ×
`TS2559` in that file.

### Formatting is ON — since 2026-10-30 (issue #346)

`formatter` and `assist` are **both on** in the root `biome.jsonc`, with the same settings
as `apps/web/biome.json`: `indentStyle: space`, `indentWidth: 2`, single quotes, semicolons
`asNeeded`, and the default 80-column width. One style covers the whole repo.

Two more root scripts came with it, mirroring `lint:e2e`:

| Command | What it does | Run in the gate by |
|---|---|---|
| `pnpm check:e2e` | `biome check ./e2e` — lint **and** format **and** import order | the second half of root `pnpm check` |
| `pnpm format:e2e` | `biome format ./e2e --write` | the second half of root `pnpm format` |

They were off for 19 days, from the day the root config was created (issue #322) to the day
`e2e/` was swept, because the sweep is large and would have buried that PR. Measured
2026-10-30 on the unmodified tree, right before the sweep:

| Quantity | Before the sweep |
|---|---|
| `biome check ./e2e` errors | **65** — 45 `format`, 20 `assist/source/organizeImports` |
| `biome check ./e2e --write` diff | **1699 insertions, 684 deletions, 46 of 54 files** |

**Re-measure; do not quote.** This section said 64 errors (44 `format`, 20
`organizeImports`) and a 1632/646 diff across 44 files, measured on 2026-10-11. Both were
right then. One spec file was added in the 19 days between, which moved every number.

`biome check ./e2e` now reports **0 errors** and the same **13** warnings as before — 6
`noExplicitAny`, 7 `noNonNullAssertion`. The sweep did not touch them.

**The sweep changed no behaviour, and that was checked rather than assumed.** A reordered
import really can change behaviour, and no type check would see it. All three checks ran
over the 46 changed files:

| Check | Result |
|---|---|
| AST compared before/after, ignoring positions, quote style and trailing commas | all 46 identical outside the import block |
| import **bindings** compared — module specifier plus every local and imported name | **0** changed anywhere |
| import **statement order** | changed in 11 files |

The reorder in those 11 is safe because **no `e2e/` module runs code when it is imported**.
The only top-level statements under `e2e/` that are not declarations are the `test(...)` and
`test.describe(...)` registrations inside spec files, and no spec file is imported by
anything. There is no bare `import 'x'` and no `require()` under `e2e/` at all. The 11
reordered lists hold only `@playwright/test`, `node:*` builtins, and `e2e/helpers`,
`e2e/pages`, `e2e/utils` and `e2e/constants` modules, which only declare.

`pnpm test:e2e --project=local` was run after the sweep to confirm it: **174 passed, 5
skipped** in 3.9m, exit 0, no flakes. Unchanged from the baseline.

**`lint-staged` still does not cover `e2e/`.** It is scoped to `apps/web/src/**`, so nothing
reformats a file here at commit time and the drift can come back. Whether to add an entry is
the open half of issue #346. Read *`lint-staged` Can Silently Revert Your Fix Inside Its Own
Commit* in the root `CLAUDE.md` first — it has reverted a real fix in this repo before.

**The root config must stay `biome.jsonc`, not `biome.json`.** Biome reads comments in a
`.jsonc` file and **silently ignores** a `biome.json` that contains any — no error, no
warning — falling back to its own built-in defaults. Found 2026-10-11: as `biome.json` with
comments, `biome lint ./e2e` checked **59** files instead of 54 (it picked up
`e2e/fixtures/*.json` and the two tsconfigs) and `biome check ./e2e` reported 79 formatting
errors in tabs and double quotes, which is Biome's default style and not this repo's. The
warning count stayed at 13, so the lint output alone does not show the problem. **Check the
file count.**

### `e2e/tsconfig.json` does not change how Playwright runs

Playwright does read a `tsconfig.json` next to a spec, but it uses only `allowJs`, `baseUrl`
and `paths` from it (`playwright/lib/transform/transform.js:76-82`). `e2e/tsconfig.json`
sets none of the three, so adding it cannot change how a spec transpiles. **Do not add
`paths` or `baseUrl` to it without checking what Playwright then does with them.**
