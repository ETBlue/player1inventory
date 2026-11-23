# Bug: three cloud re-import tests run past the 30-second budget

Date: 2026-11-15. Branch: `feature/households-h3b`. Found during task B.7 / B.8.

## Bug description

Three tests in `e2e/tests/settings/import-export-cloud.spec.ts` fail in the `cloud`
project:

| Line | Test |
|---|---|
| 432 | user re-importing a cloud backup keeps every location and gains no stray default |
| 474 | user re-importing a cloud backup keeps each cart at its own location |
| 524 | user re-importing a cloud backup keeps each log's location and message |

The failure text is `Test timeout of 30000ms exceeded`. The page snapshot shows either
"Importing Recipes… 7 / 10 batches", or "Import failed" with a Postgres error:
`deadlock detected` (`40P01`) in `prisma.cartItem.upsert()`, a foreign-key error
(`CartItem_itemId_fkey`, `ItemStock_itemId_fkey`), or an error in
`prisma.itemTag.createMany()`. These errors made it look like items vanish during the
import.

## Root cause

**Not an app bug. The three tests need more than Playwright's default 30 seconds.**
The app code is correct: all three pass, every assertion, with a longer budget.

Each test does a full cloud round trip: seed (12 GraphQL calls), export,
`cleanupCloudData`, import (10 bulk mutations plus conflict reads), then read back.
Almost all of the time is round trips to the shared Neon test database. The cloud →
cloud test in the same file does the same work and has had `test.setTimeout(60000)`
since 2026-10-04, and the same-household restore test since 2026-11-11. These three
never had it.

Measured 2026-11-15 on `feature/households-h3b` (`5cf58ee0`), run alone with
`--timeout=90000` at load average 2.2:

| Test | Time |
|---|---|
| line 432 | 32.7s |
| line 474 | 29.2s |
| line 524 | 24.0s |

A trace of the line-432 test with the default budget: hooks and seed 0–13.8s, pantry
visit, export and cleanup 13.8–19.3s, import 19.3–30.2s. The import finished, and the
budget ran out during the first read-back.

**Why the failure looked like a data bug.** When the budget ran out in the middle of
the import, `afterEach` ran `cleanupCloudData` while the page was still sending import
mutations. The cleanup deleted the household's rows under them, so the next mutation
failed with whatever Postgres error that collision gave. Playwright takes the page
snapshot (`error-context.md`) AFTER the hooks, so the snapshot showed that error.

Proved on purpose with `--timeout=25000` and `--trace on`:

| Time in the trace | Event |
|---|---|
| 37.112 | the budget ends; `afterEach` sends `DELETE /e2e/cleanup` (3.2s) |
| 37.153 | the page sends `BulkCreateLocations` |
| 38.389 | the page sends `BulkCreateItems`, which fails in `prisma.itemTag.createMany()` |

Which error appears depends only on which mutation is in flight. The four seen so far:
`deadlock detected` (`40P01`) in `cartItem.upsert`, `CartItem_itemId_fkey`,
`ItemStock_itemId_fkey`, and the `itemTag.createMany` error above.

The three proofs that this is not a code bug:

| Proof | Result |
|---|---|
| the failure repeats when run alone at low load | yes: line 432 failed twice alone, load 3–5 |
| the tests pass with more time | yes: 3 of 3 with `--timeout=90000` |
| the error text | a timeout. The Postgres errors were shown by a trace to start after the cleanup began |

**What is not known:** whether H3b made the round trip slower than H3a. On 2026-11-11
the H3a branch passed all of `cloud`, so these tests were under 30s then. H3b adds
authorization reads to the cart imports. The server before H3b cannot run on the
shared test database, because that database already has the H3b migration
(`Cart.userId` dropped), so the two could not be timed side by side. In the trace,
the two cart mutations took 0.81s and 0.49s of the 10.9s import.

## Fix applied

`e2e/tests/settings/import-export-cloud.spec.ts`: a constant `REIMPORT_TIMEOUT_MS =
60000`, with the measurements and the cleanup race in its comment, and
`test.setTimeout(REIMPORT_TIMEOUT_MS)` in each of the three tests. On the tests, not on
the `cloud` project, for the reason the cloud → cloud test's comment gives. That
comment also said "the other five tests in this file pass inside 30s", which was no
longer true; it is corrected.

## Test added

No new test. The fix is the three tests' budget. Checked both ways:

| State | Command | Result |
|---|---|---|
| before (no budget line) | `pnpm test:e2e --project=cloud e2e/tests/settings/import-export-cloud.spec.ts:432` | failed twice, `Test timeout of 30000ms exceeded` |
| after | `pnpm test:e2e --project=cloud e2e/tests/settings/import-export-cloud.spec.ts` | **8 passed** in 3.9m: the three at 26.6s, 33.0s, 23.7s |

## PR / commit

`e5c89cee` on `feature/households-h3b` (not pushed).
