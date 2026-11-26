# Bug: the item Info tab saves before recipes and stock have loaded

## Bug description

The checkpoint gate for the release of `develop` at `68da5522` (2026-11-26, `cloud-neon`
row, the whole cloud list on Neon) failed one test:
`e2e/tests/consumable-items.spec.ts:482`, "user turning Consumable off for an item in a
recipe is warned, and the recipe no longer has it".

The test turns Consumable off for Cups and presses Save. The "Mark as not consumable?"
dialog should warn that Cups leaves 1 recipe. No dialog opened, and the save went through.
The page snapshot showed the switch off and Save disabled (form no longer dirty).

A real user on a slow network gets the same result when they save quickly after the page
opens.

## Root cause

`handleSubmit` in `apps/web/src/routes/items/$id/index.tsx` decides whether to open the
dialog from two reads that may still be loading:

| Read | Where | While it is loading |
|---|---|---|
| `useRecipes()` (`allRecipes`, line 229) | `removedFromRecipes` (lines 318–321) uses `(allRecipes ?? [])`; `buildAdjustments` (line 325) returns `[]` when `!allRecipes` | 0 recipes are counted, so the recipe warning is skipped, and on a unit switch the recipe amounts are NOT converted |
| `useItemStocks(id)` (`stocks`, line 238) | `buildStockConversions` (line 378) returns `[]` when `!stocks` | on a unit switch no location is converted; turning Consumable off does not drop opened stock |

When all three lists are empty, the dialog does not open and `doSave` runs a plain
`updateItem`. Nothing keeps Save disabled until the reads have answered.

What goes wrong for each case:

- **Consumable off:** only the warning is lost. `updateItem` (local `db/operations.ts:433`
  and the server) removes the recipe links itself.
- **Unit switch, or a consume amount change:** data goes wrong. Recipe `defaultAmount`s
  stay in the old unit, and with no stocks loaded every location keeps old-unit numbers.
  This part is older than the consumable work.

## Fix applied

Save stays off until both reads have answered.

- `ItemForm` has a new prop, `submitBlocked`. It is ORed into `isSubmitDisabled`, the one
  rule behind all three Save buttons: the top bar Save, the in-form Save, and the Save of the
  unsaved-changes dialog (through `canSave`).
- The Info tab passes `submitBlocked={readsMissing}`, where
  `readsMissing = allRecipes === undefined || stocks === undefined`. It checks `data`, not
  `isLoading`, so a failed read blocks Save too.
- `handleSubmit` also returns `false` while `readsMissing` is true (a second guard).
- When a read has FAILED with nothing cached, a red line above the form says "Could not load
  this item's recipes or stock, so it cannot be saved. Reload the page to try again."
  (`items.detail.readsFailed`, en and tw). Nothing shows while the reads are only loading.
- `useLocations()` is not part of the rule: it only names and orders the dialog's rows.

In cloud, "stock still loading" cannot reach the form: `useItem` reads the same
`ItemStocksForItem` query, and the item layout shows a spinner until it answers. In local
mode `useItem` reads `getItem`, so the case is real there.

## Test added

- `apps/web/src/routes/items/$id/saveWaitsForReads.test.tsx` (local, real Dexie, with
  `getRecipes` and `getItemStocks` held): Save is off while recipes load, off while stock
  loads, the unsaved-changes dialog's Save is off while recipes load, and a control where
  both reads answer and the dialog opens.
- `apps/web/src/routes/items/$id/index.cloud.test.tsx`, 3 tests: `GetRecipes` held (Save off,
  no message); `GetRecipes` failed (message, Save off); `ItemStocksForItem` failed (message,
  Save off after a unit switch, no mutation sent).
- `ItemForm.stories.test.tsx`: the new `SubmitBlocked` story, with a control.

Mutation checks, each red: removing `submitBlocked` from `isSubmitDisabled` (all 6 new route
tests), `readsFailed = false` (the 2 message tests), removing `|| stocks === undefined` (the
local stock-loading test and the cloud stock-failed test), showing the message while loading
(both recipes-loading tests).

E2E: `consumable-items.spec.ts` on Neon (`E2E_DATABASE=neon E2E_NEON_FULL=1`,
`--project=cloud-neon`) 10 passed. That file is not in `e2e/neonSpecs.ts`, which is why the
per-PR gate of #439 and #441 did not run it on Neon.

Known gap: the `handleSubmit` guard has no test of its own; the disabled Save stops every
tested path first.

## PR / commit

Fix commit `7ac64e0d` on `fix/save-before-recipes-load`.
