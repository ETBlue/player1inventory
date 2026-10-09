# Plan — PR C, issues #334 and #333

**Date:** 2026-10-08
**Branch:** `feature/import-strategy-coverage` · worktree `.worktrees/feature-import-strategies`
**Base:** `main` at `7d02fe93`
**Design:** `2026-10-08-parity-followup-design.md` (same folder)
**Issues:** #334 (E2E coverage for `clear` and `replace`), #333 (run `verify:migration`)

## State on arrival

The guard half of #333 is already committed:

| Commit | What |
|---|---|
| `8a5e463d` | `assertNotAnotherDatabase` in `apps/server/scripts/databaseIsolation.ts` — refuses to run if either `TEST_*` URL resolves to the same host and database as **any** other `*_URL` in the environment. 15 unit tests |
| `0de113f1` | the root `CLAUDE.md` updated, including three stale numbers corrected and the 0.5s build cost recorded |

Measured counts now: server **374** tests / 26 files, web **2297** / 249 files.

## What the investigation changed

#334 proposes two paths to a strategy and recommends path 2 first. **Path 2 cannot be driven today, and path 1 is easier than the issue thinks.** Three blockers on path 2, each sufficient alone:

1. There is no sign-in step in cloud E2E. `VITE_E2E_TEST_USER_ID` plus the `x-e2e-user-id` header replace Clerk.
2. `PostLoginMigrationDialog` — the **only** mount site of `usePostLoginMigration` — is behind `mode === 'cloud' && !isE2ETestMode` at `apps/web/src/routes/__root.tsx:90`.
3. `usePostLoginMigration` calls Clerk's `useAuth()`, and `apps/web/src/main.tsx:69-80` renders the E2E cloud tree with **no `ClerkProvider`**.

So `migration-strategy` is written by `DataModeCard` and read by nothing in E2E.

**Decision: un-gate path 2 for E2E.** This is a change to shipped code so a test can reach it. The user chose it after the cost was stated. The cost: a destructive path (`clearAllData`) enters every cloud spec's component tree.

**Why that is contained, checked rather than assumed.** The cloud project's `storageState` (`e2e/playwright.config.ts:191-200`) carries **only** `data-mode`, and its own comment says each test gets a fresh browser context. So no spec inherits a `migration-strategy` key from another, and the migration cannot fire in a spec that did not set it.

**And `clear` turns out to be reachable with no production change at all**, through `ImportCard`'s conflict dialog — which the issue assigns only to `replace`. That is the cheapest real win and it is in this plan.

## What the user gets (UX)

Nothing. Tests, one safety guard, and one gate that mounts a component it did not mount before.

## What the developer gets (DX)

| Gain | Specifics |
|---|---|
| A destructive path finally executed | `clearAllData` — one mutation in cloud, eleven `db.<table>.clear()` calls locally — has never run end to end |
| A defect becomes reachable by a test | #330 lives only on `replace`, which no E2E run has ever driven |
| The only check that runs a real migration gets run | #333. Five migrations replayed, including PR B's |
| Honest documentation | `e2e/helpers/backupAssertions.ts` and `e2e/CLAUDE.md` both record this gap and both describe it wrongly |

**DX cost:** `PostLoginMigrationDialog` now mounts in E2E, so every cloud spec carries a component that can wipe the account if `migration-strategy` is set. Contained by the fresh context per test, and stated here so nobody has to rediscover it.

---

## Task 1 — un-gate path 2 for E2E

**Files:** `apps/web/src/routes/__root.tsx`, `apps/web/src/hooks/usePostLoginMigration.ts`, plus tests.

`__root.tsx:90` today:

```tsx
{mode === 'cloud' && !isE2ETestMode && (
  <>
    <CloudAuthGuard />
    <PostLoginMigrationDialog />
  </>
)}
```

**`CloudAuthGuard` must stay gated off.** It calls `useAuth()` and would redirect an E2E run to `/sign-in`. Only `PostLoginMigrationDialog` moves.

`usePostLoginMigration.ts:64` reads `isLoaded` and `isSignedIn` from Clerk's `useAuth()`. In E2E there is no `ClerkProvider`, so that call throws.

**Copy the shim pattern already in this repo** — `DataModeCard.tsx:51-63` has `CloudModeSectionWithUser` (calls `useUser()`) and `CloudModeSectionE2E` (does not), chosen by `isE2ETestMode`. Do the same here: the component that calls `useAuth()` and one that reports "loaded and signed in" without Clerk. Decide whether the split belongs in the hook or in `PostLoginMigrationDialog` and say why.

**Do not change any other condition.** The hook must still require: no `migration-prompted` key, a `migration-strategy` key present, the location list resolved, and its `autoImportStarted` ref unset.

**Tests.** Unit-test that the E2E branch runs the migration when the key is present and does **not** when it is absent. Remember: no web test file is type-checked (`apps/web/tsconfig.app.json:37`, issue #340), so `tsc` will not catch a mistake in a fixture.

**Mutation check.** Remove the `migration-strategy` condition and confirm a test goes red. Then restore the `!isE2ETestMode` gate on `PostLoginMigrationDialog` and confirm task 3's spec cannot pass — that is the proof this task was needed.

---

## Task 2 — two specs through `ImportCard`'s conflict dialog

**New file**, plus `e2e/pages/SettingsPage.ts` and `e2e/playwright.config.ts`.

Both specs follow the same shape, which needs no production change:

1. `cleanupCloudData(request)` in `beforeEach`.
2. Seed data that the backup will collide with.
3. `settings.navigateTo()`.
4. `settings.triggerImport(<path>)` — `SettingsPage.ts:41-44` sets the hidden `input[type="file"][accept=".json"]` directly with `setInputFiles`. No file-chooser event.
5. Wait for the heading **"Conflicts detected"** (`settings.import.conflictDialog.title`).
6. Click **"Clear & import"** or **"Replace matches"**.
7. `settings.waitForImportDone(mode)` — waits for "Import complete." in cloud (30000 ms) and "Data imported successfully" in local (15000 ms).

### Scoping the button — no test ids needed

"Clear & import" is the same visible string in two dialogs. They have **different ARIA roles**:

| Dialog | Built on | Role |
|---|---|---|
| `ConflictDialog` | Radix `Dialog` | `dialog` |
| `DataModeCard`'s three | Radix `AlertDialog` | `alertdialog` |

So `page.getByRole('dialog').getByRole('button', { name: 'Clear & import' })` can only be the import conflict dialog.

### The fixture — this is the work

`REQUIRED_FIELDS` is in `ImportCard.tsx:31-47`, **10** fields, checked with `field in obj` — presence only, no type or value check. `shelves`, `locations` and `itemStocks` are **not** required.

`detectConflicts` (`importData.ts:1080-1123`) matches by id **or** name, case-insensitively, for items, tags, tagTypes, vendors and recipes; by id only for inventoryLogs, cartItems and shelves. `shoppingCarts` is hardcoded `[]` and can never conflict. `locations` and `itemStocks` are not checked at all.

**Two traps in the fixture:**

- **Omitting `itemStocks` makes it a legacy payload.** `upgradeLegacyPayload` branches on `payload.itemStocks !== undefined` (`importData.ts:294`), **not** on `version`. A payload with no `itemStocks` key gains one synthesised stock row per item. Include `itemStocks` and `locations` if the spec asserts quantities.
- **For the `replace` spec, the fixture must be MIXED.** #330's batch key is `${spec.entityType}:${i}` with no mode term (`importData.ts:2176`), and both passes share one `ImportSession`. The bug only fires when the **same entity type** has rows on both passes. A fixture where every item collides leaves `toCreate.items` empty, no key is written, and the spec proves nothing. So: at least one colliding item **and** at least one new item.

`e2e/fixtures/local-backup.json` already carries all 13 keys. Re-importing it over a seed of itself makes every named entity collide by both id and name — useful for `clear`, not sufficient for `replace`.

### The `clear` spec has a per-project expected name

`e2e/helpers/backupAssertions.ts` is tuned to **`skip`**. Its `DESTINATION_DEFAULT_LOCATION_NAME` is `'My Home'` because `skip` leaves the destination's default row alone. On `clear` the **local** import `bulkPut`s the remapped default and takes the backup's name (`'Fixture Home'`), while **cloud** still skips it. So a shared spec must expect `FIXTURE_DEFAULT_LOCATION_NAME` in local and `DESTINATION_DEFAULT_LOCATION_NAME` in cloud. Branch on `baseURL === CLOUD_WEB_URL`.

### Project membership

`e2e/playwright.config.ts` — cloud's `testMatch` is at line 202 (20 entries); local's `testIgnore` at line 180 (5 entries). **The `local` project has no `testMatch`**, so it runs every spec under `e2e/tests/` that is not ignored.

| Where the spec should run | Edits |
|---|---|
| cloud and local | add the glob to cloud's `testMatch` only |
| cloud only | add to cloud's `testMatch` **and** local's `testIgnore` |

**These two specs should run in both.** The flow is mode-neutral, `importLocalData` has its own `replace` and `clear` branches, and the local run is the only thing that exercises the Dexie write path against a real IndexedDB. Guard any `cleanupCloudData` / `makeGql` call on `baseURL === CLOUD_WEB_URL`.

### Timeout

`settings/import-export-cloud.spec.ts` carries `test.setTimeout(60000)` on its one round-trip test, measured at 36.5s. A conflict spec adds a seed plus the nine `network-only` queries in `fetchCloudExistingData`. **Measure, do not guess** — raise the timeout on the test if it needs it, never on the project.

---

## Task 3 — the path-2 spec, after task 1

**Cloud only.** Add to cloud's `testMatch` and local's `testIgnore`. It cannot run in local: that project's server has no `VITE_E2E_TEST_USER_ID`, so cloud mode there mounts `CloudAuthGuard` with a real `ClerkProvider` and redirects to `/sign-in`.

Sequence, all inside the cloud project:

1. Set `data-mode` to `local` and reload. `main.tsx:26` reads it once per document load, and `storageState` applies at context creation only, so a later write plus `page.reload()` sticks.
2. Seed local Dexie data — **after** the local-mode boot. In cloud mode `main.tsx:107` never calls `db.open()`, so the schema may not exist yet. `e2e/helpers/localSeed.ts:33` already follows the rule of navigating first.
3. Drive the UI: `'Switch...'` → `/switch to cloud/i` → `'Yes, copy data'` → `'Clear & import'`, scoped to `getByRole('alertdialog')`.
4. `doEnableSwitch('clear')` (`DataModeCard.tsx:279-288`) writes `migration-strategy`, clears `migration-prompted`, sets `data-mode=cloud` and reloads.
5. After the reload, `usePostLoginMigration` runs the `clear` import.

**Set `e2e-skip-onboarding` before the reload**, or `__root.tsx:73-87` redirects an empty account to `/onboarding`.

**Assert the mechanism and the outcome.** The repo's rule: "the item eventually lands" does not pin the path it took. Assert that the local data arrived in cloud **and** that `migration-strategy` was consumed and `migration-prompted` set.

**Two things the investigation could not rule out.** Check both with a throwaway run before building on them: whether the Dexie schema opens cleanly on the cloud origin, and whether the Apollo cache persisted in `Player1InventoryCloudCache` interferes.

---

## Task 4 — documentation and the two wrong notes

1. **`e2e/helpers/backupAssertions.ts:66-74`** is wrong three ways. It says `clear` is reachable "only through the conflict dialog" — `DataModeCard` reaches it with no conflict. It calls the button "clear and import" — the string is **"Clear & import"**. And it does not mention `replace`, which is equally uncovered and is the only path to #330.
2. **`e2e/CLAUDE.md:618-619`** carries the same `skip`-only claim.
3. Record that `PostLoginMigrationDialog` now mounts in E2E, and why that is safe.
4. `docs/INDEX.md` — PR C done, the series complete.
5. The design doc — PR C to its finished state, including that #334's recommended path was the unbuildable one.
6. **Update #334 itself**: path 2 needed a production change; `clear` was reachable through the conflict dialog all along.

---

## Task 5 — run `verify:migration` (#333). I run this, not a subagent.

**The user granted consent in their own words on 2026-10-08:** *"yes, I allow AI agent to run "migrate reset" against E2E database"*.

Scope of that consent: `TEST_DATABASE_URL` / `TEST_DIRECT_URL` only. **Never** `DATABASE_URL`, `DIRECT_URL`, or any `PROD_COPY_*`. One run.

Before: confirm no E2E suite is running and all four ports are free. The script wipes the E2E database, so nothing else may be using it.

Then `pnpm --filter server verify:migration`, with the consent passed through `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.

Expect: the E2E database comes back **empty** at the latest schema, with all **five** migrations applied in order, and every assertion printing `ok —`. The five include PR B's `20261008000000_add_item_note_and_wikidata_url`, which is why this runs last.

**Afterwards the cloud E2E project must be re-run**, because the database it reads was just wiped. The specs seed their own data, so it should pass — that is a prediction until measured.

---

## Verification gate

```bash
(cd apps/web && pnpm lint)
pnpm build 2>&1 | tee /tmp/p1i-build-pr-c.log
grep 'TS6385' /tmp/p1i-build-pr-c.log && echo FAIL || echo OK
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
pnpm test
```

Baseline on this branch: server **374** / 26 files, web **2297** / 249 files. **Re-measure rather than subtracting.**

**Final phase:** the three projects as separate invocations, `cloud` in three chunks over its `testMatch` files. Swap has been near 26 GB of 27.6 GB all session.

## Known gaps this PR will carry

| Gap | Note |
|---|---|
| `PostLoginMigrationDialog` mounts in every cloud spec | Chosen on purpose. Contained by the fresh context per test |
| #330 is reachable by a test but not fixed | Its own issue |
| `replace` not renaming a cloud location | Accepted in PR 4b, unit-tested only |
