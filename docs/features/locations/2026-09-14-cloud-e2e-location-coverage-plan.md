# Plan — cloud E2E coverage for locations (issue #284)

**Date:** 2026-09-14
**Branch:** `feature/cloud-e2e-locations`
**Worktree:** `.worktrees/feature-cloud-e2e-locations`
**Design:** `2026-09-14-cloud-e2e-location-coverage-design.md`
**Brainstorming:** `2026-09-14-brainstorming-cloud-e2e-location-coverage.md`

Five tasks. Each ends with the full verification gate from root `CLAUDE.md`.

## Before any E2E run

`e2e/CLAUDE.md`: only one E2E suite may run on this machine at a time. Before
every run in this plan:

```bash
lsof -nP -iTCP:5175 -sTCP:LISTEN
lsof -nP -iTCP:5174 -sTCP:LISTEN
lsof -nP -iTCP:4001 -sTCP:LISTEN
```

All three must be free, and stay free for about 90 seconds. Never kill another
session's server. A run showing `ERR_CONNECTION_REFUSED` is void — re-run it
alone before believing any failure.

Cloud E2E needs `TEST_DATABASE_URL` in `apps/server/.env`. Confirmed present in
this worktree. **Never print a connection string** into a report, a commit, or
quoted output.

---

## Task 1 — Prove and fix the `/e2e/cleanup` gap

`/e2e/cleanup` (`apps/server/src/index.ts:29-45`) deletes 12 models and misses
`Location` and `ItemStock`. Cloud runs leave their locations in the test Neon
branch permanently.

### The proof comes first, and it is free

`apps/server/src/resolvers/purge-coverage.test.ts` already reads resolver source
from disk and asserts that every model with a `userId` in
`prisma/schema.prisma` is deleted by every purge path. It already lists
`Location` among the 10 user-owned models. It just does not know about
`/e2e/cleanup`.

**Step 1.1.** Add a third entry to `PURGE_PATHS`:

```ts
{ label: 'e2eCleanup', source: read('../index.ts') },
```

and change `expect(PURGE_PATHS).toHaveLength(2)` to `3`.

**Step 1.2.** Run `pnpm test:server`. It **must FAIL**, with the `e2eCleanup`
case reporting `missing: ['Location']`.

That failure is the mutation check for this task. Record the exact message. If it
passes, the guard is not reaching `index.ts` — fix the guard, not the
expectation.

### The fix

**Step 1.3.** In `apps/server/src/index.ts`, add to the `$transaction` array, in
`clearAllData`'s order:

```ts
prisma.itemStock.deleteMany({ where: { location: { userId } } }),
// ... before item.deleteMany
prisma.location.deleteMany({ where: { userId } }),  // last
```

**Corrected during Task 1 — this instruction was wrong.** It said to copy the
ordering rationale from `import.resolver.ts:546-553`. Both of `ItemStock`'s
foreign keys cascade (`schema.prisma:236-237`), so the order changes nothing
`/e2e/cleanup` can observe. The order only matters in `purgeUserData`, which
returns a deleted count. The shipped comment says the true thing.

Add a short comment on the `PURGE_PATHS` entry saying that `/e2e/cleanup` is now
a third hand-maintained copy of the same list, and this guard is what keeps the
three from drifting.

**Step 1.4.** Re-run `pnpm test:server` — green.

### Verification

Full gate. `pnpm test` must show the server suite at its previous count plus the
one new `e2eCleanup` case.

### Report

- the exact failure text from Step 1.2
- the server test counts before and after

---

## Task 2 — `settings/locations.spec.ts` runs in cloud

5 tests. UI-driven, no seeding. Needs the Task 1 fix, a cloud teardown, and a
`testMatch` entry.

**Step 2.1.** Create `e2e/helpers/cloudTeardown.ts`:

```ts
/** Delete every row owned by E2E_USER_ID. Cloud mode only — a no-op elsewhere. */
export async function cleanupCloudData(request: APIRequestContext): Promise<void>
```

It calls `request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, { headers: { 'x-e2e-user-id': E2E_USER_ID } })`
and throws if the response is not ok. The nine existing cloud specs swallow the
result; this one does not, so a cleanup that silently stops working fails a test
instead of causing a mystery later.

Do **not** refactor the nine existing specs onto it. That is churn with no test
behind it and it would bury a real failure in a large diff.

**Step 2.2.** In `settings/locations.spec.ts`:

- add `cleanupCloudData(request)` to both `beforeEach` and `afterEach`, guarded on
  `baseURL === CLOUD_WEB_URL`, matching `shopping.spec.ts:14,23`
- delete the 5 `test.skip(baseURL === CLOUD_WEB_URL, 'local-mode fixture: seeds IndexedDB')` lines
- rewrite the header comment. The current text (lines 4-13) claims the file seeds
  IndexedDB. It does not. Say what is true: the file is UI-driven and runs in both
  modes; cloud isolation is by row ownership under `E2E_USER_ID` plus
  `/e2e/cleanup`.

**Step 2.3.** Add `'**/settings/locations.spec.ts'` to the `cloud` project's
`testMatch` in `e2e/playwright.config.ts`.

**Step 2.4.** Run, after the port check:

```bash
pnpm test:e2e --grep-invert nothing --project=cloud e2e/tests/settings/locations.spec.ts
```

All 5 must pass. If one fails, apply the brainstorming decision: a web-client or
resolver bug gets fixed here; a schema or migration bug gets a GitHub issue plus
`test.fixme` naming that issue number.

### Mutation check (required)

Remove `prisma.location.deleteMany` from `index.ts` again and run the 5 tests
**twice in a row without restarting the server**. The second run must fail —
that is what proves the Task 1 fix is what makes these tests repeatable, rather
than them passing on a clean database by luck. Restore, confirm green.

If the second run passes anyway, say so plainly. Do not reshape the test to force
a red.

### Report

- the 5 test names and their results
- the mutation check: the exact failure on the second run, or a statement that it
  could not be turned red
- any bug found, and whether it was fixed here or filed

---

## Task 3 — `location-switcher.spec.ts` runs in cloud

8 tests. Also UI-driven — `seedOfficeLocation()` (line 76) clicks through
`/settings/locations`, and items are made through the Add combobox.

**Step 3.1.** Same three edits as Task 2: cloud teardown in `beforeEach` and
`afterEach`, delete the 9 `test.skip` lines, rewrite the false header comment
(lines 6-15).

**Step 3.2.** Add `'**/location-switcher.spec.ts'` to the cloud `testMatch`.

**Step 3.3.** Run the 8 tests in the cloud project.

Two are the ones that matter most, because they are the first real-SQL coverage
of `upsertItemStock` and `addItemToLocation`:

- "switching the active location re-scopes the pantry to stocked items"
- "an item already stocked in the active location is shown disabled in the Add combobox"

The four breakpoint tests (sidebar vs toolbar at each width) assert layout only.
They will pass in cloud, but they are **not** evidence of cloud location
behaviour. Name them as layout coverage in the report rather than counting them.

### Mutation check (required)

In `apps/server/src/resolvers/itemStock.resolver.ts`, make the stock read ignore
its `locationId` filter — return every stock row for the user regardless of
location. Re-run the two tests named above.

"Switching re-scopes the pantry" **must go red**: Yogurt would then appear at
Office, where the fixture says it is not stocked.

This is the check that proves cloud location scoping is really under test. Restore
and confirm green.

### Report

- the 8 test names, split into "cloud location behaviour" and "layout only"
- the mutation check result
- any bug found, and whether it was fixed here or filed

---

## Task 4 — the seed helper and `location-not-stocked-here.spec.ts`

3 tests. This is the only converted spec that seeds data, and the only consumer
of the new helper.

**Step 4.1.** Restructure the spec's fixture into plain data, as the design's
`Fixture` type describes. Locations are referenced by a symbolic key, not an id:

```ts
const FIXTURE: Fixture = {
  locations: [{ key: 'HOME', name: 'My Home', isDefault: true },
              { key: 'OFFICE', name: 'Office' }],
  vendors:  [...],
  items:    [...],
  stocks:   [{ itemId: MILK, location: 'HOME' },
             { itemId: BREAD, location: 'HOME' },
             { itemId: COFFEE, location: 'OFFICE' }],
  shelves:  [...],
  recipes:  [...],
}
```

`HOME` currently hardcodes `'local'` (line 45), the local sentinel. The symbolic
key exists to stop that constant reaching the cloud path.

**Step 4.2.** Create `e2e/helpers/cloudSeed.ts`, built on `makeGql` from
`e2e/utils/cloud.ts`. It exports:

```ts
export async function seedCloudFixture(
  request: APIRequestContext,
  fixture: Fixture,
): Promise<Record<string, string>>   // symbolic key -> real location id
```

What it does, in order:

1. Query `locations` — this call is what runs `ensureDefaultLocation`, so the
   default "My Home" exists from here on. Map the `isDefault: true` row to the
   fixture's `isDefault` key.
2. `createLocation(name)` for every other fixture location; collect the returned
   cuids into the key map.
3. `bulkCreateVendors`, `bulkCreateItems`, `bulkCreateShelves`,
   `bulkCreateRecipes` — all with the fixture's own fixed ids, which those inputs
   accept (`id: ID!`).
4. **Reconcile stock.** `bulkCreateItems` calls `mirrorStockToDefaultLocation`
   (`import.resolver.ts:87`), so every item now has a stock row at the default
   location whether the fixture wants one or not. Read the real stock rows back,
   then:
   - `upsertItemStock` for every `(item, location)` pair the fixture lists
   - `removeItemFromLocation` for every pair present but not in the fixture

   Reconcile against what the database actually holds. Do not assume what the
   mirror did — that assumption is exactly what would rot when PR 5 removes the
   dual-write.

**Step 4.3.** Add a matching `seedLocalFixture(page, fixture)` that writes the
same data through the existing `seedRows`, returning the same key map with the
fixture's fixed local ids. The spec then calls one or the other on `baseURL`, and
the fixture data itself is written once.

**Step 4.4.** Cloud teardown in `beforeEach` and `afterEach`; delete the 4
`test.skip` lines; rewrite the header comment; add
`'**/location-not-stocked-here.spec.ts'` to the cloud `testMatch`.

**Step 4.5.** Run the 3 tests in **both** projects. Local must stay green — the
fixture restructure is a refactor, and a local regression means the two paths no
longer describe the same data.

### Mutation check (required)

Delete the `removeItemFromLocation` half of Step 4.2's reconciliation. Coffee then
keeps the stock row the mirror gave it at Home.

All three tests **must go red**. Coffee-only groups are the "not stocked here"
side of every one of the three grouping axes; if Coffee is stocked at Home, there
is no "elsewhere" group left and the tests are proving nothing.

This is the check that the cloud fixture is not vacuous. Root `CLAUDE.md`:
"Every location-scoped test needs a fixture stocked only at *another* location."

Restore and confirm green.

### Report

- the 3 test names and their results in both projects
- the mutation check result, per test
- confirmation that `removeItemFromLocation` is exercised by **seeding**, not by
  an assertion, so it is not coverage

---

## Task 5 — Documentation, issue, and the full run

**Step 5.1.** Update `e2e/CLAUDE.md`:

- record that `/e2e/cleanup` deletes `Location` and `ItemStock` as of this branch,
  and that `purge-coverage.test.ts` is the guard keeping the three delete lists in
  step
- record the cloud seeding convention: fixture described once as data, entity ids
  fixed in both modes, location ids returned from the server because there is no
  `LocationInput` until PR 4

**Step 5.2.** Update root `CLAUDE.md` → *Proving a Test Works*. It says the cloud
`testMatch` "covers nine files today". It is now twelve, and three of them cover
locations. Keep the surrounding warning intact — a resolver covered by no cloud
spec still has never touched SQL.

**Step 5.3.** Update `docs/INDEX.md`.

**Step 5.4.** Update the PR 2 plan's *Deferred work* section: the "cloud E2E
covers no location surface" caveat is now partly closed. Say which part.

**Step 5.5.** Full verification gate, then the E2E run:

```bash
pnpm test:e2e --grep "items|shopping|cooking|settings|shelves|vendors-group|recipes-group|a11y"
```

Both projects. Zero failures. Playwright's summary must show the cloud project
running the three new files.

**Step 5.6.** Comment on issue #284 saying what landed and what is still open
(`item-stock-pager`, `item-stock-input`, the four group-view specs, and the
teardown refactor of the nine existing cloud specs). Do not close it — the PR
closes only part of it.

### Report

- gate results, command by command
- E2E pass/fail counts per project, before and after
- the final list of files in the cloud `testMatch`

---

## Corrections found while running this plan

| Task | What the plan got wrong |
|---|---|
| 1 | The `ItemStock` ordering rationale. Both FKs cascade, so order is not observable in `/e2e/cleanup`. Fixed above and in the design doc. |
| 1 | `purge-coverage.test.ts` cannot see the `itemStock` line — it only checks models with a `userId`. Not covered, and not required. |
| 1 | Line numbers for `index.ts` are stale after the fix. The `$transaction` array is now lines 29-57. Later tasks must not trust line numbers in this plan. |

## Standing rules for every task

- Commit per logical concern. Tests and stories travel with the code they cover.
- Never print a connection string.
- `apps/server/.env` is gitignored and stays that way.
- Never write `row.userId === ctx.userId` as an authorization check — route
  through `requireLocationRole`.
- `ItemStock` must never gain a `userId` column.
- An explanatory comment is a claim, not a fact. This plan exists because five
  files carried the same false one.
- Report which mutations you ran and that each went red. "I added tests" and "I
  verified these tests fail without the behaviour" are different claims. If a
  mutation cannot be turned red, say so rather than reshaping the test.
