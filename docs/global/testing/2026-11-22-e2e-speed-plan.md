# E2E Speed-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make the E2E gate (`pnpm test:e2e:all`) much faster, and keep it just as strict.
Today the gate takes about **71 minutes**, and **65m39s** of that is the `cloud` project.

**Architecture:** three steps, in the order the owner approved on 2026-11-22.

1. **Cheaper cleanup (PR A).** `DELETE /e2e/cleanup` becomes ONE database round trip
   instead of about 25. Each cloud test cleans up once, in `beforeEach`, not twice. A
   `globalSetup` cleans what a killed run left behind. `household-ownership.spec.ts` makes
   one cleanup call per test instead of 16. `e2e/run-all.sh` saves a JSON report per
   project, so every gate records the time of every test.
2. **A local Postgres for the `cloud` project (PR B).** The `cloud` project runs on a
   Postgres on this Mac. A short `cloud-neon` project (8 to 10 spec files) still runs on the
   Neon test branch, once per PR. The full cloud suite runs on Neon before each checkpoint
   release.
3. **Measure again (a decision, not a PR yet).** Only if the gate is still too slow: two
   workers, each with its own database, API server and web server.

**Tech Stack:** Playwright 1.58, Express 5, Prisma 6, Postgres (Neon and local), bash.

**Owner approval:** 2026-11-22, steps 1 to 3 as above. The open choices are the owner
questions **P1 to P10** at the end.

**Base branch:** `develop`, like every branch while households is not done (root
`CLAUDE.md`, *Workflow*: "No changes go to `main` until households is done"). This plan is
not a households phase, but the same rule holds.

---

## Summary

### Where this sits

| What | State |
|---|---|
| Households H1 to H7b | H7b merged into `develop` (2026-11-22, #395, merge `41bbbe1a`), not deployed. The next step for households is a checkpoint release |
| This plan | written 2026-11-22 on `chore/e2e-speed`, from `develop` at `41bbbe1a`. Nothing built |

Every households phase ended with a full E2E gate, and the gate has grown with each phase:

| Gate | `cloud` time | Whole gate |
|---|---|---|
| 2026-09-24 (issue #284) | 9m08s | 13m49s |
| 2026-11-20, H6a | 50m22s | 55m32s |
| 2026-11-20, H6b | 58m43s | 63m56s |
| 2026-11-22, H7b at `14f9501c` | **65m39s** | **about 71 min** (local 3m46s, pwa 1m36s) |

### Relations

- **Blocked by:** nothing. H7b is merged.
- **Blocks:** nothing. But the households checkpoint release needs at least one full gate,
  and a faster gate makes every later fix cheaper to prove.
- **PR A and PR B are separate.** PR B does not need PR A, but PR A comes first: it is
  smaller, it saves time on Neon too, and its JSON reports give PR B a real baseline.
- **Step 3 is not a PR.** It is a decision after PR B, with the numbers to decide on.

### What the user gets (once merged AND deployed)

**Nothing.** No file under `apps/web/src` changes, and the server changes only code that is
mounted in E2E mode (`if (E2E_TEST_MODE)` in `apps/server/src/index.ts`). Production never
runs it.

### What the developer gets

| DX gain | Detail |
|---|---|
| Faster feedback | the gate goes from about **71 min** to about **50–55 min** after PR A, and about **25–33 min** after PR B (estimates; see the table below) |
| A failure that now has a name | a local database that is behind the migrations, or a `cloud-neon` run that reached the local database, stops the run at the start with a message that names the fix. Today a stale database shows up as random failed tests |
| Fewer ways to get it wrong | one `cleanupCloudData` call per test, with every user of the test in one list, instead of a hand-kept pair of hooks per spec. `rescueOrphans` in `household-ownership.spec.ts` goes away (if owner question P5 is yes) |
| Per-test times on record | each gate writes `e2e-results/<project>.json` and a short list of the slowest tests. Today the only time on record is the project total |
| Honest documentation | `e2e/CLAUDE.md`, *Cloud E2E is not database-isolated*, still says the `cloud` project "runs against whatever `DATABASE_URL` is set … normally the dev database". That stopped being true on 2026-08-30. `apps/server/prisma/CLAUDE.md` says the array form of `$transaction` "Prisma can send as a single batched request"; the measured 1.33 s for about 25 statements says it does not (see *Facts*) |

**What it costs the developer:**

| Cost | Why it is worth it |
|---|---|
| A local Postgres to install, start and migrate (PR B) | it removes about 52 ms from every query. A cloud test sends hundreds |
| One more environment value, `E2E_LOCAL_DATABASE_URL`, and one more switch, `E2E_DATABASE` | without them the server cannot tell the two databases apart |
| Every new migration must also be applied to the local database, by a person | the run stops at the start when it is not, so the cost is a known step, not a hidden failure |
| The cleanup SQL becomes a function body in a TypeScript string, not 22 Prisma calls | it is what makes one round trip possible. The two source-text tests move to the SQL text |
| A second list to keep: the `cloud-neon` spec list | the config refuses a name that is not in the `cloud` list, so a typo cannot run nothing |

**Expected times.** Estimates, to be replaced by measured numbers in each task's *Done*
note:

| Gate part | Now (2026-11-22) | After PR A | After PR B |
|---|---|---|---|
| `local` | 3m46s | 3m46s | 3m46s |
| `cloud` | 65m39s (Neon) | about 45–50 min (Neon) | about 10–15 min (local Postgres) |
| `cloud-neon` | — | — | about 10–13 min (38 tests, Neon) |
| `pwa` | 1m36s | 1m36s | 1m36s |
| **Whole gate** | **about 71 min** | **about 50–55 min** | **about 25–33 min** |
| Full cloud suite on Neon, before a checkpoint | 65m39s | about 45–50 min | about 45–50 min (unchanged by PR B) |

Why the PR A estimate is 15–20 min and not more: see *Facts*, the 55% figure.

---

## Facts this plan is built on (checked 2026-11-22 at `41bbbe1a`)

| Fact | Where |
|---|---|
| The Neon test branch is in `ap-southeast-1`. One query takes about **52 ms**. The server sends its queries one after another | measured 2026-11-22 by the main session; raw data in the session scratchpad, `e2e-speed/` |
| `DELETE /e2e/cleanup` takes **1.33 s** (p50 of 20) with nothing to delete, and the same when the user owns one household | same, `rtt-out.txt`: min 1327 ms, p50 1332 ms, p90 1385 ms |
| The first request after a cleanup (it makes the `User` row, a household and "Home") takes about **0.97 s** (p50 of 20). `{ locations }` takes 272 ms and `{ household }` 219 ms | same file. This is the "seeding" share; PR B is what makes it cheap |
| The route is ONE read (`householdMember.findMany`, the owned households) and then the **array form** of `$transaction` with **22** `deleteMany`. With `BEGIN` and `COMMIT` that is about 25 round trips, which matches 25 × 52 ms ≈ 1.3 s | `apps/server/src/lib/e2eCleanup.ts` |
| An interactive transaction would not help. It still sends each statement on its own, and adds nothing | Prisma's interactive form, see `apps/server/prisma/CLAUDE.md` |
| **The 55% "cleanup share" comes from a traced sample of 14 tests, 9 of them in `household-ownership.spec.ts`.** That spec makes 16 cleanup calls per test, so the sample is biased. Across all 218 cloud tests the share is smaller | `e2e-speed/cloud-2.json`: 14 tests, 491 s |
| `cleanupCloudData` has **165** call sites in **42** spec files. 79 `afterEach` lines exist in `e2e/tests/` | `grep -rn cleanupCloudData e2e/tests \| wc -l`; `grep -rln …`; `grep -rn afterEach e2e/tests \| wc -l` |
| `household-ownership.spec.ts`: `cleanupAll` runs in BOTH hooks. Each run makes **8** cleanup calls (7 spec users plus `E2E_USER_ID`), and before them `rescueOrphans` makes **4** more requests (3 `myOwnershipOffers` reads and a fake `user.deleted` for GHOST). So 16 cleanups and 24 requests per test, 17 cleanups in the test that cleans GHOST in its body (line 708) | `e2e/tests/household-ownership.spec.ts`, lines 163–165, 331–355, 443–452 |
| Every E2E user id starts with `e2e-test-user` (`E2E_USER_ID` = `'e2e-test-user'`, `E2E_SECOND_USER_ID` = `'e2e-test-user-2'`, and every other id is built from the second) | `e2e/constants.ts`; `grep -rhoE` over `e2e/` |
| How the server picks the E2E database: `resolveDatasourceUrl(env)` in `apps/server/src/lib/prisma.ts` returns `TEST_DATABASE_URL` when `E2E_TEST_MODE=true`, and throws when it is unset. Nothing else | `apps/server/src/lib/prisma.ts` (not `apps/server/src/prisma.ts`) |
| **The only identity guard is in `verify-migration.ts`.** `assertNotAnotherDatabase` (`apps/server/scripts/databaseIsolation.ts`) compares `TEST_DATABASE_URL` and `TEST_DIRECT_URL` with every OTHER variable whose name ends in `_URL`. The E2E server runs no such check | `apps/server/scripts/verify-migration.ts` lines 102–103 |
| `schema.prisma` has `url = env("DATABASE_URL")` and `directUrl = env("DIRECT_URL")`. `prisma migrate deploy` uses `directUrl` | `apps/server/prisma/schema.prisma` lines 5–9 |
| No migration creates an extension. `gen_random_uuid()` needs Postgres 13 or newer | `grep -rliE "create extension" apps/server/prisma/migrations` is empty; `docs/features/locations/2026-08-30-cloud-locations-plan-pr0-pr1.md` line 725 |
| **Neon's Postgres major version is recorded nowhere in the repo.** The PR 0/1 plan asked for it ("Report the major version only") but the answer was not written down | `git grep -n -iE "Postgres 1[0-9]\|PG ?1[0-9]" -- docs` finds only the request |
| Foreign keys that are not `CASCADE`: `Tag.type` (`NoAction`), `User.activeHouseholdId` and `Household.ownerId` (`SetNull`), `HouseholdInvite.usedById` (`SetNull`), and the RESTRICT keys to `User` from `HouseholdMember`, `LocationMember` and `HouseholdInvite.createdById` | `apps/server/prisma/schema.prisma` lines 62, 356, 409, 444, 496, 509 |
| No model has `@@map`, so each table name is the model name (`"InventoryLog"`, …) | `grep -c "@@map" apps/server/prisma/schema.prisma` gives 0 |
| Playwright `webServer` is one list for all projects. `selectedProjects()` builds it from `--project`. With no `--project`, `--ui` or `--debug`, it starts every server | `e2e/playwright.config.ts` |
| Every spec decides "cloud or not" with `baseURL === CLOUD_WEB_URL` (port 5174). So a second cloud project on another port would skip every cloud test | e.g. `household-ownership.spec.ts` line 444 |
| There is no `globalSetup` today | `e2e/CLAUDE.md` line 1611 |
| `run-all.sh` reads the "N passed / N failed" lines from the console. The config's `reporter` is `'html'` | `e2e/run-all.sh`, `e2e/playwright.config.ts` |
| The spec site build lists the three report folders `local`, `cloud`, `pwa` | `scripts/spec/build.mjs` lines 64–74 |
| Free memory on this Mac when this plan was written: about 0.26 GB "free" pages, 16 GB "inactive", 32 GB in all | `vm_stat`, `sysctl -n hw.memsize`. See memory note *E2E killed by low memory* |
| Homebrew is installed. No `psql`, no `postgres`, no Postgres.app | `which brew psql postgres`; `ls /Applications` |

---

## Decisions

### Technical decisions (made in this plan)

| # | Decision | Why |
|---|---|---|
| D1 | The cleanup becomes one Postgres function, `e2e_cleanup(user_ids text[]) RETURNS jsonb`, written in PL/pgSQL. The handler calls it with ONE `prisma.$queryRaw` | see *Options for one round trip* below. Owner question **P4** |
| D2 | The function's `DELETE` statements are the same 22, in the same order, with the same filters as today's `deleteMany` calls. Each count comes from `GET DIAGNOSTICS … ROW_COUNT`. The JSON has the same 22 keys | keeps the counts contract of `cleanup-endpoint.spec.ts`, the order the counts depend on, and the RESTRICT keys. In PL/pgSQL each statement is its own query, so foreign key checks and cascades run after each statement, the same as today |
| D3 | The SQL lives in a TypeScript constant, `E2E_CLEANUP_FUNCTION_SQL`, in `apps/server/src/lib/e2eCleanupSql.ts`, not in a `.sql` file | `scripts/build.mjs` copies only `.graphql` files into `dist/`. A `.sql` file would need a build change and a start check change |
| D4 | The E2E server creates the function at start (`CREATE OR REPLACE FUNCTION`), inside the `if (E2E_TEST_MODE)` block, before it listens. A failure stops the start | a production server never creates it. `verify:migration` drops the `public` schema, so the function goes with it, and the next E2E start creates it again |
| D5 | The route takes several users in one call: `DELETE /e2e/cleanup` with a JSON body `{ "userIds": [...] }`. The old header `x-e2e-user-id` still works for one user. `cleanupCloudData(request, userIds?)` takes a string or a list | one call for all users of a test |
| D6 | A household is deleted when a listed user OWNS it (today's rule) **or** when every one of its members is in the list (new). Owner question **P5** | a test that fails half way can leave a household with no owner. Today `rescueOrphans` exists only for that. With the new rule, one call with all spec users deletes it. A household with any member NOT in the list stays, so "a member's cleanup leaves the owner's household alone" still holds |
| D7 | Each cloud test cleans up in `beforeEach` only. The `afterEach` cleanup calls go. `afterEach` still closes contexts where a spec opens them. Owner question **P3** | `beforeEach` makes each test start clean whatever ran before it, also after an `afterEach` that failed. On 2026-11-21 an `afterEach` cleanup failed with `socket hang up` (`shared-household.spec.ts:338`); with `afterEach`-only cleanup the NEXT test would start dirty |
| D8 | `e2e/global-setup.ts` runs once per invocation when a cloud project is selected. It calls `DELETE /e2e/cleanup` with `{ "allE2eUsers": true }`, which cleans every user whose id starts with `e2e-`, and every household whose members all start with `e2e-` or that has no member at all | cleans what a killed run left, also for users of specs that this run does not reach |
| D9 | `E2E_DATABASE=local` or `neon` picks the E2E database. `local` reads `E2E_LOCAL_DATABASE_URL`; `neon` reads `TEST_DATABASE_URL`, as today | one server, two databases, chosen per invocation. The new variable ends in `_URL`, so `verify-migration.ts`'s guard also refuses a `TEST_DATABASE_URL` that points at the local database |
| D10 | With `E2E_DATABASE=local` the server refuses a URL whose host is not `localhost`, `127.0.0.1`, `::1` or a socket path, and a URL with the same identity as `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`, `TEST_DIRECT_URL` or a `PROD_COPY_*` URL | a Neon URL pasted into the local variable, or a local dev database used for E2E, is refused at start |
| D11 | Exactly one of the projects `cloud` and `cloud-neon` exists in one invocation. The config builds `cloud-neon` (and leaves out `cloud`) only when `E2E_DATABASE=neon`. Both use port 5174 and 4001 | the specs' `baseURL === CLOUD_WEB_URL` check stays true. Two cloud projects in one run would share one API server, so one of them would run on the wrong database |
| D12 | A new E2E-only route, `GET /e2e/database`, answers `{ kind: "local" \| "neon", migrations: { applied, latest } }`. It never answers a URL or a host. `globalSetup` compares `kind` with `E2E_DATABASE`, and `applied` with the folder count of `apps/server/prisma/migrations` | a run on the wrong or a stale database stops at the start, with a message that names the fix |
| D13 | The `cloud-neon` spec list lives in `e2e/neonSpecs.ts`, one line per spec with its reason. The config throws when a name is not in the `cloud` `testMatch` | a typo would otherwise select zero tests and pass |
| D14 | `run-all.sh` sets `PLAYWRIGHT_JSON_OUTPUT_FILE=e2e-results/<project>.json`, and the config adds the `json` reporter when that variable is set. `scripts/spec/e2e-times.mjs` prints the project total, the 15 slowest tests and the time per spec file. `e2e-results/` is gitignored | per-test times on every gate, and the same numbers in every *Done* note. The script sits in `scripts/spec/` so `pnpm test:spec` runs its test |

### Options for one round trip (D1)

| Option | Round trips | Delete order | Risk | Verdict |
|---|---|---|---|---|
| **A. A PL/pgSQL function, created by the E2E server at start** | 1 | explicit, statement by statement, the same as today | DDL in the test database outside the migrations. Prisma does not read functions for drift, but check it (task S.2 step 1) | **recommended** |
| B. One SQL statement: data-modifying CTEs and a final `SELECT` of the counts | 1 | **not guaranteed.** Postgres runs all sub-statements on one snapshot, in an order it does not promise | the cascades and `SET NULL` actions of a household delete fire at the end of the statement, after the `User` delete in the same statement. Whether that errors or counts right must be proved for each of the 22 tables | possible, but harder to read and to prove |
| C. A migration that creates the function | 1 | explicit | the function ships to PRODUCTION, where nothing may call it. It also needs a deploy step | rejected |
| D. An interactive `$transaction(async (tx) => …)` | about 25 | explicit | none, and no gain | rejected |
| E. Return early when the user has no row | 1 when empty, 25 otherwise | unchanged | helps only the empty case | rejected: A is fast in both cases |

---

## Risks

### A local Postgres can hide what only Neon does

| Risk | Why the local database hides it | What catches it |
|---|---|---|
| The Neon **pooler** (PgBouncer in transaction mode): prepared statements, session settings, connection limits | the local URL is a direct connection | every `cloud-neon` spec: they all use the pooled `TEST_DATABASE_URL` |
| **Latency races**: two requests that overlap only because each query takes 52 ms | locally a query takes well under 1 ms, so the window closes | `household-ownership.spec.ts` (two accepts at once: only a run where the loser waits at the lock gets `OFFER_GONE`), `live-cart.spec.ts`, `live-pantry.spec.ts` (event order, refetch timing), in `cloud-neon` |
| **Waits that are long enough only on a fast database.** `location-switcher.spec.ts` waits up to 5 s for "Home" and has taken 3.9 s and 5.0 s on Neon | a fast local database makes such waits pass easily | the full suite on Neon before each checkpoint (owner question **P10**). Not in `cloud-neon` |
| **Sort order of text in SQL.** `householdMembers` and `locationPeople` sort by name in SQL. The result depends on the database's collation (`lc_collate`). A Homebrew `initdb` takes the shell's locale | a local database with another collation sorts "ben" and "Bea" differently | create the local database with Neon's collation (owner question **P2**, task S.7). `location-people.spec.ts` and `household-invites.spec.ts` check names in order |
| **A different Postgres major version** | planner and error text differences, and features one version has and the other not | match the major version (P2). `globalSetup` cannot check it, so S.7 records it in `e2e/CLAUDE.md` |
| **Time zone** of the session | local `timezone` may be the Mac's, Neon's is GMT | create the local database with `timezone = 'UTC'` (S.7). The columns are `TIMESTAMP(3)` without a zone |
| **A stale local database** (a new migration not applied) | nothing applies migrations by itself | `globalSetup` compares `applied` with the folder count (D12) and stops the run |
| **Neon cold start** after the branch was idle | not a thing locally | the first `cloud-neon` request. A first slow call is not a code failure; `e2e/CLAUDE.md` gets a line on it |
| **Real-SQL coverage of transactional resolvers** (`clearAllData`, `deleteHouseholdData`, the hand-over in `handleClerkEvent`, `joinHousehold`'s retry on `P2034`) | none: local Postgres is real SQL too. Only the latency differs | all of them still run on real SQL in `cloud`. The ones with locks and retries also run in `cloud-neon` |

### Risks in step 1

| Risk | What catches it |
|---|---|
| A ported filter is wrong, so a count reads 0 | `cleanup-endpoint.spec.ts` (every count at least 1), and the mutation checks of S.2 |
| A delete is moved after its parent, so the cascade deletes the rows and the count reads 0 | the same spec. And the unit test of the SQL text order (S.2) |
| The new "every member is listed" rule (D6) deletes a household that a later test still needs | the two new tests in `cleanup-endpoint.spec.ts` (S.4), and `household-member-cleanup.spec.ts`, which already checks that a member's cleanup leaves the owner's household alone |
| A leftover row from one test makes a later test pass for the wrong reason, now that `afterEach` does not clean | the leftover belongs to users that the next test's `beforeEach` cleans. The mutation check of S.3 proves a leftover still fails a later test |
| Playwright starts `globalSetup` before the `webServer` is ready | check the order in Playwright 1.58 (S.3 step 1). If `globalSetup` runs first, use a setup project with `dependencies` instead |

---

## File map

| File | PR | Change |
|---|---|---|
| `e2e/run-all.sh` | A, B | the JSON report per project (S.1); the `cloud-neon` row and `E2E_DATABASE` per invocation (S.8) |
| `e2e/playwright.config.ts` | A, B | the `json` reporter (S.1); `globalSetup` (S.3); the database switch, `cloud-neon`, the API server's env (S.8) |
| `scripts/spec/e2e-times.mjs`, `e2e-times.test.mjs` | A | new (S.1) |
| `.gitignore` | A | `e2e-results/` (S.1) |
| `apps/server/src/lib/e2eCleanupSql.ts` | A | new: `E2E_CLEANUP_FUNCTION_SQL` (S.2, S.4) |
| `apps/server/src/lib/e2eCleanup.ts`, `e2eCleanup.test.ts` | A | one `$queryRaw`; several users; `allE2eUsers` (S.2, S.3, S.4) |
| `apps/server/src/index.ts` | A, B | create the function at start in E2E mode (S.2); mount `GET /e2e/database` (S.6) |
| `apps/server/src/webhookRouteOrder.test.ts` | B | the new route stays inside the `E2E_TEST_MODE` block (S.6) |
| `apps/server/src/resolvers/purge-coverage.test.ts` | A | the `e2eCleanup` path reads the SQL text (S.2) |
| `e2e/helpers/cloudTeardown.ts` | A | `cleanupCloudData(request, userIds?)` (S.4) |
| `e2e/global-setup.ts` | A, B | new: clean all E2E users (S.3); check the database kind and migrations (S.8) |
| `e2e/tests/**/*.spec.ts` (42 files) | A | drop the `afterEach` cleanup calls (S.3) |
| `e2e/tests/household-ownership.spec.ts` | A | one cleanup call; `rescueOrphans` removed if P5 is yes (S.4) |
| `e2e/tests/cleanup-endpoint.spec.ts` | A | two new tests: several users, a household with no owner (S.4) |
| `apps/server/src/lib/prisma.ts`, `prisma.test.ts` | B | `E2E_DATABASE`, the local URL checks (S.6) |
| `apps/server/src/lib/databaseUrl.ts` | B | new: `databaseIdentity` and `assertNotAnotherDatabase`, moved from `scripts/databaseIsolation.ts`, which re-exports them (S.6) |
| `apps/server/src/lib/e2eDatabase.ts` and test | B | new: the `GET /e2e/database` handler (S.6) |
| `apps/server/scripts/e2eLocalDb.ts`, `apps/server/package.json` | B | new: `pnpm --filter server e2e:db:migrate` and `e2e:db:status`, run by a person (S.7) |
| `apps/server/.env.example` | B | `E2E_LOCAL_DATABASE_URL` with an empty value and a comment (S.7) |
| `e2e/neonSpecs.ts` | B | new: the `cloud-neon` list (S.8) |
| `package.json` | B | `test:e2e:neon` (if P6 says so) and `test:e2e:all:neon` (S.8) |
| `scripts/spec/build.mjs`, `build.test.mjs` | B | the `cloud-neon` report folder (S.8) |
| `e2e/CLAUDE.md`, root `CLAUDE.md`, `apps/server/prisma/CLAUDE.md`, `docs/INDEX.md` | A, B | S.5, S.9 |

---

## PR A — the cheaper cleanup (step 1)

## Task S.1 — a JSON report per project, and the baseline

**Files:** `e2e/run-all.sh`, `e2e/playwright.config.ts`, `scripts/spec/e2e-times.mjs`,
`scripts/spec/e2e-times.test.mjs`, `.gitignore`.

- [ ] **Step 1:** in the config, `reporter` becomes `[['html'], ['json']]` when
  `PLAYWRIGHT_JSON_OUTPUT_FILE` is set, else `'html'` as today. Keep whatever prints the
  "N passed" lines that `run-all.sh` reads; check that the summary table still shows counts.
- [ ] **Step 2:** `run-all.sh` sets `PLAYWRIGHT_JSON_OUTPUT_FILE="e2e-results/$project.json"`
  for each project, and at the end runs `node scripts/spec/e2e-times.mjs e2e-results/*.json`.
  A missing or broken JSON file prints a warning and does not change the exit code.
- [ ] **Step 3:** `e2e-times.mjs` reads Playwright's JSON (`stats`, `suites`, `specs`,
  `tests`, `results[].duration`), and prints per project: the total, the 15 slowest tests
  (file, title, seconds), and the time per spec file, largest first. Test it with
  `node --test` on two small fixture files, one with a nested `describe`, one with a
  retried test (count both results).
- [ ] **Step 4:** `.gitignore` gets `e2e-results/`.
- [ ] **Step 5: the baseline.** Run the whole gate once, `pnpm test:e2e:all`, with nothing
  else running on the machine (check `uptime` and free memory first). Copy
  `e2e-results/` to the session scratchpad. Record in this task's *Done* note: each
  project's time and counts, the 10 slowest cloud spec files, and the load average. This is
  the "before" for every later task.
- [ ] **Step 6:** the gate without E2E (root `CLAUDE.md`, *Verification Gate*).

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| `e2e-times.mjs` reads only the first `results[]` entry | the retried-test fixture test |
| `e2e-times.mjs` skips nested suites | the nested-`describe` fixture test |

**Proof:** the baseline numbers exist, and the JSON's total per project matches the console
total within 2 s.

## Task S.2 — `/e2e/cleanup` in one round trip

**Files:** `apps/server/src/lib/e2eCleanupSql.ts` (new), `apps/server/src/lib/e2eCleanup.ts`,
`apps/server/src/lib/e2eCleanup.test.ts`, `apps/server/src/index.ts`,
`apps/server/src/resolvers/purge-coverage.test.ts`.

- [ ] **Step 0: measure the baseline** of `pnpm test` (web, server, `scripts/spec`) and of
  one call: 20 calls of `DELETE /e2e/cleanup` with nothing to delete, on the Neon test
  branch, p50 and p90 (S.1's scratch script or a copy of the measurement script; do not
  commit it). Expect about 1332 ms p50.
- [ ] **Step 1: check that Prisma ignores functions.** Read Prisma 6's documentation on
  what `migrate diff` and `migrate dev` compare. If they would report the function as
  drift, stop and report: owner question P4 then needs option B.
- [ ] **Step 2: write the failing tests** in `e2eCleanup.test.ts` (replace the mock of the
  array form of `$transaction`):
  - one `$queryRaw` call, no `$transaction`, no `deleteMany`;
  - the user ids reach the query as a bound value (`Prisma.Sql.values`), never as text in
    the SQL;
  - each of the 22 keys of the function's JSON lands under its own key, in the order of
    `CLEANUP_MODEL_KEYS`; a JSON with a key missing gives `500` and names the key;
  - `forgetSeenToday` runs once per user, only after the query resolved, and not when it
    throws;
  - `400` without a user;
  - **the SQL text:** the `DELETE FROM "<Model>"` statements in `E2E_CLEANUP_FUNCTION_SQL`
    are exactly the 22 models of `MODELS`, in that order, each once;
  - the key list still equals `CLEANUP_MODEL_KEYS` in `e2e/helpers/cloudTeardown.ts` (keep
    that test).
- [ ] **Step 3: `purge-coverage.test.ts`.** The `e2eCleanup` path reads
  `E2E_CLEANUP_FUNCTION_SQL`, not `prisma.<model>.deleteMany(` in `e2eCleanup.ts`. For each
  model: one `DELETE FROM "<Model>"`, and its `WHERE` text matches the one allowed SQL form
  for that model (a new `SQL_MODEL_PATHS`, written from today's `MODEL_PATHS` filters).
  `kept` stays `[]`. The `deleteHouseholdData` path does not change. Read the file's header
  first and keep its rules.
- [ ] **Step 4:** run: red.
- [ ] **Step 5: the function.** `E2E_CLEANUP_FUNCTION_SQL` holds
  `CREATE OR REPLACE FUNCTION e2e_cleanup(user_ids text[]) RETURNS jsonb LANGUAGE plpgsql`.
  First the owned households into a local `text[]` (the same rule as today: a `HouseholdMember`
  row with `role = 'owner'` for one of the users). Then the 22 `DELETE` statements, one for
  each `deleteMany` of today, same order, same filter, each followed by
  `GET DIAGNOSTICS c = ROW_COUNT` and one key added to the result. Port the comments that
  say why each statement is where it is. Quote every table and column name.
- [ ] **Step 6: the handler.** `e2eCleanupHandler` calls
  `` prisma.$queryRaw`SELECT e2e_cleanup(${userIds}::text[]) AS deleted` `` once, checks the
  22 keys, calls `forgetSeenToday` per user, and answers `{ ok: true, deleted }` as today.
- [ ] **Step 7: create the function at start.** In `index.ts`, inside
  `if (E2E_TEST_MODE)`, before `listen`: `await prisma.$executeRawUnsafe(E2E_CLEANUP_FUNCTION_SQL)`.
  A failure logs the error code only (never the message: it can hold a host) and exits
  non-zero. `scripts/check-start.mjs` runs with `E2E_TEST_MODE=false`, so it does not reach
  this line; check that it still passes.
- [ ] **Step 8:** the gate without E2E. Then `pnpm test:e2e --project=cloud
  e2e/tests/cleanup-endpoint.spec.ts e2e/tests/household-member-cleanup.spec.ts
  e2e/tests/purge-two-households.spec.ts`: all green.
- [ ] **Step 9: measure** the 20 calls again, the same way as step 0. Expect p50 under
  200 ms on Neon. Record both numbers.

**Mutation checks** (copy the green file aside before each, restore from the copy; never
`git checkout -- <file>`):

| Mutation | Must go red |
|---|---|
| the `"ItemTag"` `DELETE` removed from the SQL | `e2eCleanup.test.ts` (SQL order test), `purge-coverage.test.ts`, and `cleanup-endpoint.spec.ts` (`itemTags: 0`) |
| the `"Item"` `DELETE` moved above `"ItemTag"` | the SQL order test, and `cleanup-endpoint.spec.ts` (`itemTags: 0`, the rows went by cascade) |
| the `"Location"` filter changed to `"householdId" = ANY(user_ids)` | `purge-coverage.test.ts`, and `cleanup-endpoint.spec.ts` (`locations: 0`) |
| the `"HouseholdInvite"` `DELETE` moved after `"User"` | `cleanup-endpoint.spec.ts`: the `User` delete fails on the RESTRICT key, the route answers 500 |
| the user ids written into the SQL text instead of bound | the bound-value unit test |
| `forgetSeenToday` called before the query | the order unit test |

**Proof (speed):** the step 0 and step 9 numbers, same command, same database.

## Task S.3 — one cleanup per test, and `globalSetup`

**Files:** `e2e/tests/**/*.spec.ts`, `e2e/helpers/cloudTeardown.ts` (comment),
`e2e/global-setup.ts` (new), `e2e/playwright.config.ts`, `apps/server/src/lib/e2eCleanup.ts`
and `e2eCleanupSql.ts` (the `allE2eUsers` form), `e2eCleanup.test.ts`.

- [ ] **Step 1:** check in Playwright 1.58's documentation or source whether `globalSetup`
  runs after the `webServer` entries are ready. If not, use a setup project that the cloud
  projects list in `dependencies`.
- [ ] **Step 2: failing unit tests** for `{ "allE2eUsers": true }`: the server selects the
  users with `id LIKE 'e2e-%'` inside the same function call (a second function
  `e2e_cleanup_all()`, or a branch of the first), still one round trip; a body with both
  `userIds` and `allE2eUsers` is `400`. The function also returns the ids it deleted, so
  the handler can call `forgetSeenToday` for each one (or clear that memory as a whole in
  this mode).
- [ ] **Step 3: `global-setup.ts`.** When a cloud project is selected (reuse
  `selectedProjects()`; export it from the config module or move it into a helper), call
  the route with `allE2eUsers` once. Print the deleted counts on one line. Throw on any
  error, so a broken cleanup stops the run before the first test.
- [ ] **Step 4: remove the `afterEach` cleanup calls** in every spec. Keep each
  `beforeEach` call, and keep every other line of each `afterEach` (closing contexts,
  clearing IndexedDB in local mode). Keep cleanups in the middle of a test, and their
  `forgetDeletedHousehold(page)`. Use `git grep`, never a walk that can enter `.worktrees/`.
  Count before and after: `git grep -c cleanupCloudData -- e2e/tests`.
- [ ] **Step 5:** update `cloudTeardown.ts`'s comment ("Call it from both `beforeEach` and
  `afterEach`" becomes `beforeEach` only, with the D7 reason) and the comment on
  `E2E_SECOND_USER_ID` in `e2e/constants.ts`.
- [ ] **Step 6:** the gate without E2E, then the whole cloud project:
  `pnpm test:e2e --project=cloud`. All green.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| the `beforeEach` cleanup in `settings/locations.spec.ts` made a no-op (return before the request) | a later test of that file: it sees the locations an earlier test made |
| `global-setup.ts` deletes nothing. Before the run, one GraphQL request as a probe user no spec uses (`e2e-test-user-probe`) makes its `User` row and household. Then run one cloud spec file, then read the probe user back with `GET /e2e/users/e2e-test-user-probe` | with the real `globalSetup` the probe user is gone; with the no-op it is still there. This is the only check that sees `globalSetup`: every spec's own `beforeEach` cleans the users that spec uses |
| the `LIKE 'e2e-%'` changed to `LIKE 'e2e-test-user-2%'` | the `allE2eUsers` unit test that seeds `e2e-test-user` |

**Proof (speed):** the cloud project time from `e2e-results/cloud.json`, before (S.1) and
after.

## Task S.4 — several users in one call, and `household-ownership.spec.ts`

**Files:** `e2e/helpers/cloudTeardown.ts`, `apps/server/src/lib/e2eCleanup.ts`,
`e2eCleanupSql.ts`, `e2eCleanup.test.ts`, `e2e/tests/household-ownership.spec.ts`,
`e2e/tests/cleanup-endpoint.spec.ts`, and every spec that cleans more than one user.

- [ ] **Step 1: failing tests.**
  - `e2eCleanup.test.ts`: a body `{ "userIds": ["a", "b"] }` reaches the function as one
    bound array; `forgetSeenToday` runs for both.
  - `cleanup-endpoint.spec.ts`, new test 2: two users, each with one row of a few models;
    ONE call deletes both, and the counts are the sums.
  - `cleanup-endpoint.spec.ts`, new test 3 (needs P5 = yes): a household with no owner
    (owner deleted with `sendFakeUserDeleted`, the hand-over leaves an offer) and two members
    A and B. A call with `[A]` keeps it; a call with `[A, B]` deletes it and its data.
- [ ] **Step 2:** the D6 rule in the function: the owned set also gets every household
  whose members are all in `user_ids`.
- [ ] **Step 3:** `cleanupCloudData(request, userIds?: string | string[])`. One string
  keeps today's header call; a list sends the body.
- [ ] **Step 4: `household-ownership.spec.ts`.** `beforeEach` makes ONE call with
  `[...ALL_USERS, E2E_USER_ID]`. Remove `rescueOrphans` and `cleanupAll` if the
  failure-injection check below is green without them. Update the file's header
  (*The cleanup trap*).
- [ ] **Step 5:** the other specs that clean several users in a row get one call each.
  List them with `git grep -n "cleanupCloudData(request, " -- e2e/tests`.
- [ ] **Step 6:** the gate without E2E, then
  `pnpm test:e2e --project=cloud e2e/tests/household-ownership.spec.ts
  e2e/tests/cleanup-endpoint.spec.ts e2e/tests/household-member-cleanup.spec.ts`.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| the D6 rule removed from the function | `cleanup-endpoint.spec.ts` test 3 |
| the D6 rule written as "ANY member is listed" | `household-member-cleanup.spec.ts` (the member's cleanup deletes the owner's household) and test 3's first call |
| **failure injection:** `throw new Error('probe')` right after the transfer offer is made in test 1 of `household-ownership.spec.ts`, then run tests 1 and 2 | test 1 red (the probe); test 2 must be **green**. That is the proof that dropping `rescueOrphans` is safe |

**Proof (speed):** `household-ownership.spec.ts`'s time from the JSON report, before (S.1)
and after. Expect about 20 s less per test.

## Task S.5 — PR A docs, the gate, the numbers

**Files:** `e2e/CLAUDE.md`, root `CLAUDE.md`, `apps/server/prisma/CLAUDE.md`,
`docs/INDEX.md`, this plan.

- [ ] **Step 1:** `e2e/CLAUDE.md`: *Every cloud spec uses `cleanupCloudData`* (one call, in
  `beforeEach`, a list of users), the new `globalSetup`, the route's SQL function (where it
  is, why it is a function, that `verify:migration` drops it and the next E2E start makes
  it again), *`purge-coverage.test.ts` is a SOURCE-TEXT check* (now SQL text). Rewrite the
  stale first paragraph of *Cloud E2E is not database-isolated*.
- [ ] **Step 2:** `apps/server/prisma/CLAUDE.md`, *Transaction forms*: `e2eCleanup.ts` no
  longer uses the array form; and the claim that the array form "Prisma can send as a single
  batched request" is not what was measured (1.33 s for about 25 statements at 52 ms each).
- [ ] **Step 3:** root `CLAUDE.md`, *Verification Gate*: the JSON reports and
  `e2e-times.mjs`.
- [ ] **Step 4: the whole gate,** `pnpm test:e2e:all`, alone on the machine. All three
  green. Record each project's time and counts next to S.1's baseline, in this plan and in
  `e2e/CLAUDE.md`.
- [ ] **Step 5:** `docs/INDEX.md`: PR A ✅ built.

---

## PR B — a local Postgres for the `cloud` project (step 2)

## Task S.6 — server: the database switch and `GET /e2e/database`

**Files:** `apps/server/src/lib/prisma.ts`, `prisma.test.ts`, `apps/server/src/lib/databaseUrl.ts`
(new), `apps/server/scripts/databaseIsolation.ts`, `apps/server/src/lib/e2eDatabase.ts` and
test (new), `apps/server/src/index.ts`, `apps/server/src/webhookRouteOrder.test.ts`.

- [ ] **Step 0:** measure the baseline of `pnpm test` and of `pnpm --filter server build`
  (three runs).
- [ ] **Step 1: failing tests** in `prisma.test.ts` (`resolveDatasourceUrl` stays a pure
  function of its argument):
  - `E2E_TEST_MODE` not `true`: `undefined`, as today;
  - `E2E_DATABASE=neon`: `TEST_DATABASE_URL`; unset: throws, as today;
  - `E2E_DATABASE=local`: `E2E_LOCAL_DATABASE_URL`; unset: throws and names the variable;
  - a local URL whose host is not loopback or a socket: throws;
  - a local URL with the same identity as `DATABASE_URL`, `DIRECT_URL`,
    `TEST_DATABASE_URL`, `TEST_DIRECT_URL` or `PROD_COPY_DATABASE_URL`: throws and names
    the variable;
  - `E2E_DATABASE` unset: the default of owner question **P7**;
  - any other value: throws.
  No error message prints a URL or a host.
- [ ] **Step 2:** move `databaseIdentity` and `assertNotAnotherDatabase` into
  `src/lib/databaseUrl.ts`; `scripts/databaseIsolation.ts` re-exports them, so
  `databaseIsolation.test.ts` and `verify-migration.ts` do not change. Measure the server
  build again: the scripts pass now also checks one `src` file (root `CLAUDE.md`, *The
  no-overlap trick*). Record the cost.
- [ ] **Step 3: `GET /e2e/database`.** Answers `{ kind, migrations: { applied, latest } }`:
  `kind` from `E2E_DATABASE`; `applied` and `latest` from `_prisma_migrations` (finished and
  not rolled back). Unit test: no field holds a URL, a host or a password (check the JSON
  text for `://` and `@`). Mount it inside `if (E2E_TEST_MODE)`;
  `webhookRouteOrder.test.ts` fails when it is outside.
- [ ] **Step 4:** the gate without E2E.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| the loopback check removed | the non-loopback test |
| `TEST_DATABASE_URL` left out of the compared variables | the same-identity test for it |
| `E2E_DATABASE=local` falls back to `TEST_DATABASE_URL` when the local URL is unset | the "unset throws" test |
| `/e2e/database` mounted outside the E2E block | `webhookRouteOrder.test.ts` |

## Task S.7 — the local database: install, create, migrate (a person runs the database steps)

**Files:** `apps/server/scripts/e2eLocalDb.ts` (new) and test, `apps/server/package.json`,
`apps/server/.env.example`, `e2e/CLAUDE.md`.

**No subagent runs a database command in this task.** The subagent writes the script, its
test and the docs. The owner (or the main session, with the owner's consent) runs the
commands in step 4.

- [ ] **Step 1:** `e2eLocalDb.ts migrate|status`: reads `E2E_LOCAL_DATABASE_URL` from
  `apps/server/.env`, runs the same checks as S.6 (loopback, identity), then runs
  `prisma migrate deploy` (or `prisma migrate status`) with **both** `DATABASE_URL` and
  `DIRECT_URL` set to the local URL. Both, because `migrate deploy` uses `directUrl`:
  overriding only `DATABASE_URL` would migrate the database `DIRECT_URL` names, which is the
  DEV database. Unit-test the checks and the environment it builds; do not run Prisma in the
  test.
- [ ] **Step 2:** scripts `e2e:db:migrate` and `e2e:db:status` in `apps/server/package.json`.
- [ ] **Step 3:** `.env.example`: `E2E_LOCAL_DATABASE_URL=""` with a comment: a local
  database only, created with Neon's major version and collation, migrated with
  `pnpm --filter server e2e:db:migrate` after every new migration.
- [ ] **Step 4 (owner):** with the answers to P1 and P2:
  1. install Postgres `<major>` (Homebrew `postgresql@<major>` and `brew services start`, or
     Postgres.app);
  2. create the database with Neon's collation and `timezone = 'UTC'`, for example
     `createdb --locale=<Neon's lc_collate> --template=template0 p1i_e2e` and
     `ALTER DATABASE p1i_e2e SET timezone TO 'UTC'`;
  3. set `E2E_LOCAL_DATABASE_URL` in `apps/server/.env` (never in the repo);
  4. `pnpm --filter server e2e:db:migrate`, then `e2e:db:status`: "Database schema is up to
     date!".
- [ ] **Step 5:** `e2e/CLAUDE.md`, a new section *The local E2E database*: the four steps,
  the version and collation it must match (with the date they were read), and "after every
  new migration, run `e2e:db:migrate`; the run stops at the start until you do".

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| the script sets only `DATABASE_URL` | the "both variables" unit test |
| the script skips the identity check | the identity unit test |

## Task S.8 — the config: `cloud` on the local database, `cloud-neon`, `run-all.sh`

**Files:** `e2e/playwright.config.ts`, `e2e/neonSpecs.ts` (new), `e2e/global-setup.ts`,
`e2e/run-all.sh`, `package.json`, `scripts/spec/build.mjs`, `build.test.mjs`.

- [ ] **Step 1: the list.** `e2e/neonSpecs.ts` exports `NEON_SPECS`, one entry per line
  with its reason (the list of owner question **P8**). The core list, 8 files, 38 tests
  (counts from `--list` on 2026-11-22):

  | Spec | Tests | Why on Neon |
  |---|---|---|
  | `settings/import-export-cloud.spec.ts` | 8 | the 22 bulk import mutations, batch after batch, through the pooler |
  | `settings/import-strategies.spec.ts` | 2 | `clear` runs `clearAllData` first |
  | `settings/import-households.spec.ts` | 7 | `importCheck` and the import role gate |
  | `purge-two-households.spec.ts` | 3 | `clearAllData`, `deleteAllLocations`, `removeAllLocationItems`, `deleteHouseholdData`'s order |
  | `household-ownership.spec.ts` | 9 | the hand-over through the webhook, two accepts at once (the lock window) |
  | `live-cart.spec.ts` | 3 | socket, event order, reconnect |
  | `live-pantry.spec.ts` | 5 | the same, and `deleteItem`'s read before the cascade |
  | `cleanup-endpoint.spec.ts` | 1 | the SQL function on Neon (D1) |

  Optional (P8): `location-scoped-writes.spec.ts` (7) and `household-switch.spec.ts` (6),
  which would make 10 files and 51 tests.
- [ ] **Step 2: the switch.** The config reads `E2E_DATABASE` (default from P7). The API
  server's `command` gets `E2E_DATABASE=<value>`. With `neon` the project list is `local`,
  `cloud-neon`, `pwa`; else `local`, `cloud`, `pwa` (D11). `cloud-neon` has the same `use`
  as `cloud` and `testMatch: NEON_SPECS`, or the whole cloud list when
  `E2E_NEON_FULL=1`. The config throws when a `NEON_SPECS` entry is not in the cloud list
  (D13). `selectedProjects()` knows `cloud-neon`.
- [ ] **Step 3: `globalSetup`** first calls `GET /e2e/database` and throws when `kind` is not
  the expected one ("this run expected the Neon test branch but the server uses the local
  database"), or when `applied` is less than the number of migration folders ("the local E2E
  database is behind: run `pnpm --filter server e2e:db:migrate`"). Then the S.3 cleanup.
- [ ] **Step 4: `run-all.sh`.** `PROJECTS=(local cloud cloud-neon pwa)`. The `cloud-neon`
  run gets `E2E_DATABASE=neon`; the others `E2E_DATABASE=local`. The summary has one row
  each, and the line under the table says which database each cloud row used. A flag
  `--full-neon` (or `pnpm test:e2e:all:neon`) runs the whole cloud list on Neon instead, for
  a checkpoint (P10). Where `cloud-neon` runs follows owner question **P6**.
- [ ] **Step 5:** `scripts/spec/build.mjs` gets the `cloud-neon` report folder, with a test.
- [ ] **Step 6:** `--list` checks, recorded in the *Done* note:
  `pnpm exec playwright test --config=e2e/playwright.config.ts --project=cloud --list`
  (expect 218), and the same with `E2E_DATABASE=neon --project=cloud-neon` (expect 38, or
  51).

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| a `NEON_SPECS` entry misspelled | the config throws at load |
| the API server's command loses `E2E_DATABASE` | `globalSetup`'s `kind` check, on the first `cloud-neon` run |
| one migration folder added (an empty folder, then deleted) | `globalSetup`'s migrations check on the `cloud` run |
| `run-all.sh` runs `cloud-neon` without `E2E_DATABASE=neon` | `globalSetup`'s `kind` check |

## Task S.9 — PR B docs, the gate, the numbers

**Files:** `e2e/CLAUDE.md`, root `CLAUDE.md`, `docs/INDEX.md`, this plan, the H4 deploy
runbook or the checkpoint runbook (if P10 says so).

- [ ] **Step 1:** `e2e/CLAUDE.md`: which project uses which database, the two commands, the
  risks table of this plan (short form), and the new hazard ("`cloud` green on the local
  database is not Neon green"). Root `CLAUDE.md`, *Verification Gate*: the per-PR gate and
  the checkpoint gate.
- [ ] **Step 2: the whole gate,** alone on the machine, twice in a row (a fast database
  can hide a flaky wait; two runs show whether a new flake appears). All projects green.
- [ ] **Step 3:** the full cloud list on Neon once (`--full-neon`), to prove nothing in the
  switch broke the Neon path. All green.
- [ ] **Step 4:** record every time next to S.1 and S.5, and update the *Expected times*
  table with measured numbers.
- [ ] **Step 5:** `docs/INDEX.md`: PR B ✅ built.

---

## Step 3 — measure again, then decide (task S.10)

Not a PR. After PR B is merged, look at three gates' JSON reports.

| Measure | How |
|---|---|
| each project's time | `e2e-results/*.json`, three gates |
| the slowest 15 tests and spec files | `e2e-times.mjs` |
| free memory during the `cloud` run | `vm_stat` every 30 s in a second shell (the commands in the memory note *E2E killed by low memory*) |
| the peak memory of the vite dev server, the API server and Chromium | `ps -Ao rss,comm` at the slowest spec |

**Decide (owner question P9):** if the whole gate is still over the agreed limit, plan two
workers. Each worker needs its own local database (`p1i_e2e_0`, `p1i_e2e_1`), its own API
server and its own web server, because the server keeps per-process memory (`seenToday`,
the live event bus) and the web build has one API URL. That also means the specs'
`baseURL === CLOUD_WEB_URL` checks must become a helper that accepts both web ports, in 42
files. Do it only when free memory during a run stays above about 4 GB with one worker.
Otherwise the run gets killed, as on 2026-10-31.

---

## Rules every task brief must pass down

- Plain English (the owner is not a native English speaker): short sentences, common words,
  lists and tables. Keep the exact names and every number.
- Report in the shape of root `CLAUDE.md`, *Pull Requests and Agent Reports*, and say what
  this plan got wrong.
- Never paste a database URL or host into a file, a commit, a log line or a report. Filter
  any output that may hold one with `grep -viE "postgres(ql)?://|neon\.tech"`.
- No subagent runs `prisma migrate`, `verify:migration`, `psql`, `createdb` or
  `e2e:db:migrate`. E2E runs are allowed (they are the gate), one at a time on the machine.
- Never bare `git stash`, never `git checkout -- <file>`. Copy a green file aside before a
  mutation, and restore from the copy.
- Measure your own baseline before you quote a number.
- Copy `test-results/` aside before you re-run a failed E2E test.

## Known gaps (expected after this plan)

- **Seeding stays slow on Neon.** The first request after a cleanup costs about 0.97 s on
  Neon (it makes the `User` row, the household and "Home"). PR B makes it cheap in `cloud`,
  but `cloud-neon` still pays it. Not in the approved steps.
- **`verify:migration` still runs on the Neon test branch only.** It could run on the local
  database too, but that needs its guard to know the local variable. Out of scope.
- **The local database is one per Mac.** Two worktrees still cannot run cloud E2E at once:
  the ports in `e2e/constants.ts` are shared, as before.
- **`location-switcher.spec.ts`'s 5 s wait** is still close to its limit on Neon. It is not
  in `cloud-neon`, so only the checkpoint run sees it.
- **The latency race in test 6 of `household-ownership.spec.ts`** gets exercised less: on
  the local database the loser almost never waits at the lock. Only `cloud-neon` and the
  checkpoint run exercise the `OFFER_GONE` branch.
- **Nothing checks the collation or the major version at run time.** S.7 records them; a
  later Neon upgrade needs a person to notice.

## What this plan got wrong

(Filled in while building.)

## Status

**Plan written 2026-11-22** on `chore/e2e-speed`, from `develop` at `41bbbe1a`. Owner
approval of steps 1 to 3: 2026-11-22. Owner questions P1 to P10 open. Nothing built.

---

## Owner questions

Each question has a recommended option, marked **(Recommended)** and listed first. The task
that needs the answer is named in brackets.

**P1 — How to install the local Postgres?** (needed before S.7)

- **A (Recommended):** Homebrew, `brew install postgresql@<major>` and `brew services start`.
  The version is in the formula name, it can be scripted, and it is easy to upgrade on
  purpose.
- B: Postgres.app. A menu bar app, easy to start and stop, several versions side by side.

**P2 — Please read Neon's Postgres major version and collation.** (needed before S.7)

The plan must not connect to a database, so you need to read them. Either the Neon
console (the project's settings show the Postgres version), or, for both values, the
command the PR 0/1 plan used, run by you:
`SELECT version(), current_setting('lc_collate'), current_setting('lc_ctype');`
on the TEST branch. Please also confirm that production uses the same major version.

**P3 — Which hook keeps the cleanup?** (needed before S.3)

- **A (Recommended):** `beforeEach` only. Each test starts clean whatever ran before it.
- B: `afterEach` only. The database is clean after each test, but a failed cleanup leaves
  the next test dirty.

**P4 — How does the one-trip cleanup reach the database?** (needed before S.2)

- **A (Recommended):** a PL/pgSQL function that the E2E server creates at start. Clear
  order, one round trip, nothing in production.
- B: one SQL statement with data-modifying CTEs. Nothing created in the database, but
  Postgres does not promise the order of the deletes, so every count must be proved.
- C: a migration that creates the function. It would ship to production. Not recommended.

**P5 — May the cleanup also delete a household whose members are ALL in the cleanup
list?** (needed before S.4)

- **A (Recommended):** yes. Then one call per test cleans a household that a failed test
  left with no owner, and `rescueOrphans` in `household-ownership.spec.ts` can go. A
  household with any member not in the list is never deleted.
- B: no. Keep today's rule (only households a listed user owns) and keep `rescueOrphans`.

**P6 — Where does the `cloud-neon` list run?** (needed before S.8)

- **A (Recommended):** inside `pnpm test:e2e:all`, as a fourth row. The per-PR gate is then
  one command, as today.
- B: its own command, `pnpm test:e2e:neon`, run once before each merge. The gate is faster,
  but there is a second command to remember.

**P7 — Which database does `--project=cloud` use when nothing says?** (needed before S.6)

- **A (Recommended):** the local database. The fast path is the default, and a missing
  local database stops the run with a message that names the fix.
- B: the Neon test branch, as today. Nothing changes for a person without a local
  Postgres, but the default stays slow.

**P8 — Which specs are in `cloud-neon`?** (needed before S.8)

- **A (Recommended):** the 8 core files, 38 tests (S.8 step 1).
- B: the 8 core files plus `location-scoped-writes.spec.ts` and `household-switch.spec.ts`,
  10 files and 51 tests, about 3–4 minutes more.

**P9 — When is the gate "still too slow" for step 3?** (needed at S.10)

- **A (Recommended):** when the whole per-PR gate is over 30 minutes in two of three runs.
- B: another limit you choose.

**P10 — Where does the full cloud suite on Neon run before a checkpoint?** (needed before
S.8)

- **A (Recommended):** as a named step in each checkpoint's deploy runbook
  (`pnpm test:e2e:all:neon`), next to the `verify:migration` step.
- B: only when someone asks for it.
