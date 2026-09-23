# Bug: `item-list-state-restore.spec.ts` seeded items with no `ItemStock` row

**Date:** 2026-09-23
**Issue:** [#280](https://github.com/ETBlue/player1inventory/issues/280)
**Branch:** `fix/e2e-state-restore-itemstocks`
**Area:** E2E test fixtures (both `local` and `cloud` projects)

## Bug description

`e2e/tests/item-list-state-restore.spec.ts` had **8 failing tests on `main`** — the same
four tests twice, because the spec is in the `cloud` project's `testMatch` and also runs
in `local` by default.

| Line (on `main`) | Test |
|---|---|
| 257 | search state preserved |
| 287 | sort state preserved |
| 317 | scroll position restored |
| 397 | scroll position restored when filter panel is open |

All eight failed on the **setup** assertion, before the behaviour under test was reached:

```
Error: expect(locator).toBeVisible() failed
Expected: visible
Error: element(s) not found
> 263 |   await expect(pantry.getItemCard('Milk')).toBeVisible()
```

## Root cause

The seed, not the app.

Since the v15 locations split the pantry lists **stocked** items — `getStockedItems`
filters on `ItemStock`. An item with no stock row at the active location is an orphan:
present in the catalog, absent from the pantry. That behaviour is correct and documented
in `apps/web/src/routes/items/CLAUDE.md`.

`seedItems` has two branches, and **both** created catalog items only:

| Branch | What it wrote | What was missing |
|---|---|---|
| local | one `db.transaction('items', 'readwrite')` | no `itemStocks` row |
| cloud | `createItem` over GraphQL | the `createItem` resolver body is a single `prisma.item.create`; it writes no `ItemStock` |

The cloud half is not a server bug. Creating a catalog item and stocking it are two
operations. The app's `useCreateItem` hook does both — `createItem`, then
`upsertItemStock`, unless `catalogOnly`. The seed did only the first.

These tests were written before the split and passed then. The spec was last edited on
2026-06-12 (`5d3ad0a6`); the pantry moved onto `getStockedItems` two days later, on
2026-06-14 (`7ae21ebb`). They have been red ever since, and no gate run reported it,
because the gate used `--grep` with the word `items` while the file name says `item` (see
root `CLAUDE.md` → Verification Gate).

## Fix applied

`e2e/tests/item-list-state-restore.spec.ts` only. No app or server code changed.

**Local branch** — call `splitInlineStock(page)` (from `e2e/helpers/locationSeed.ts`)
after the `items` write. It creates a stock row at the default location for every item
that has none, then copies whatever `STOCK_KEYS` are present. The seeded rows are all
zeros, and that does not make it skip them.

**Cloud branch** — read the default location with `ensureCloudDefaultLocation(request)`
(from `e2e/helpers/cloudSeed.ts`), then call `upsertItemStock` after each `createItem`.
The seed still runs items in parallel — 40 sequential round trips would blow the test
timeout — but each item's stock write awaits its own `createItem`. Different items stay
independent.

## Test added

None. These **are** the tests. The fix is to their fixture.

The guard proof is the reverse mutation check: each half was removed on its own and the
matching project went red with exactly the original 4 failures.

| Mutation | Command | Result |
|---|---|---|
| `splitInlineStock` removed | `pnpm test:e2e --project=local … item-list-state-restore.spec.ts` | 4 failed — `getByRole('heading', { name: 'Milk', level: 3 })` / `'Item 01'` not found |
| `upsertItemStock` removed | `pnpm test:e2e --project=cloud … item-list-state-restore.spec.ts` | 4 failed — same locators |

Removing one half left the other project green, which is what proves the two halves are
independent and both load-bearing.

## Numbers

| Project alone | Before (at `b22b53ec`) | After |
|---|---|---|
| `local` | 4 failed / 168 passed / 3 skipped | **0 failed / 172 passed / 3 skipped** |
| `cloud` | 4 failed / 72 passed / 6 skipped | **0 failed / 76 passed / 6 skipped** |
| `pwa` | 0 failed / 69 passed | 0 failed / 69 passed |

The three projects were run separately. Running all three in one invocation starves this
machine and produces false failures (issue #302).

## Checked and left alone

Issue #280 also names `e2e/tests/settings/recipes.spec.ts` and
`e2e/tests/settings/vendors.spec.ts` as seeding `items` alone. Both are fine:

- `vendors.spec.ts` **already calls `splitInlineStock`** after its item seeds
  (lines 184 and 254). It imports the helper at line 3.
- `recipes.spec.ts` seeds items with no stock row, but never asserts on the pantry. Its
  assertions are on the recipe-detail Items tab and the recipes list. That tab reads
  `useItems()` (`apps/web/src/routes/settings/recipes/$id/items.tsx:31`), the catalog
  query, which returns every item regardless of stock. So it passes for a real reason,
  not by luck.

## Commit

`fix(e2e): stock seeded items so the pantry lists them` — see the branch history.
