# PR #239 (Locations PR D) — Code Review Fix Plan

**Date:** 2026-08-16
**Branch:** `worktree-feature-item-stock-split`
**Source:** code review of the PR #239 diff (11 findings, 3 severity waves)
**Spec:** `docs/features/locations/2026-06-11-locations-design.md`, `docs/features/locations/2026-06-12-locations-plan.md`

PR D split stock off the global `Item` into a per-`(item × location)` `ItemStock`
(Dexie v15). The review found that several call sites were not carried across the
split. This plan fixes them in three waves, ordered by severity.

## Global Constraints

- **TDD is mandatory.** Every fix starts with a failing test that reproduces the
  defect, then the fix. No fix lands without a covering test.
- **Do not re-architect.** These are targeted fixes to an open PR, not a redesign.
  Cloud `ItemStock` remains deferred (documented decision of PR D) — cloud-mode
  fixes restore *pre-split* behaviour, they do not introduce cloud ItemStock.
- **Local-first invariant:** `'local'` is the default location id. Operations take
  an explicit `locationId`; hooks thread `useActiveLocation().activeLocationId`.
- **Components never touch Dexie** — they read through hooks / the joined
  `PantryItem`.
- Verification gate after each task, each command run with an explicit path:
  ```
  (cd apps/web && pnpm lint)
  pnpm build 2>&1 | tee /tmp/p1i-build.log
  (cd apps/web && pnpm build-storybook)
  (cd apps/web && pnpm check)
  grep 'TS6385' /tmp/p1i-build.log && echo FAIL || echo OK
  ```
- Storybook stories and tests travel in the same commit as the code they cover.
- Commit splitting: one commit per logical concern.

## Task 1 — HIGH: cloud-mode cooking + export/import round-trip

Three defects, all on the v15 split seam.

**1.1 — Cooking is broken in cloud mode.** `apps/web/src/routes/cooking.tsx:106`
builds `stockedItemIds` from `items.filter((i) => i.stockId)`. `stockId` only
exists on the local Dexie join (`joinItemStock`); in cloud mode `useItems()`
returns `deserializeItem(gqlItem)`, which has no `stockId`. The set is therefore
always empty, so every recipe item renders greyed as "Not stocked in this
location", `handleToggleItem` returns early, `getDefaultCheckedItems` yields an
empty set, and `consumeTotals` filters everything out — a cloud user cannot check
or consume anything.
*Fix:* bypass the stocked-items gate when `mode === 'cloud'` (treat all items as
available), preserving pre-split cloud behaviour.
*Test:* cooking route test in cloud mode — recipe items are checkable and consume.

**1.2 — Local backups silently lose all stock data.**
`apps/web/src/lib/exportData.ts:103` still exports `db.items.toArray()` only.
Post-v15 item rows no longer carry `packedQuantity`/`targetQuantity`/units/
expiration, and neither `itemStocks` nor `locations` is exported at all. Every
quantity, target, unit and expiration setting is missing from the backup file.
*Fix:* export `itemStocks` and `locations` alongside `items`.
*Test:* export a seeded multi-location DB, assert stock + locations round-trip.

**1.3 — Restoring a backup leaves the pantry empty.**
`apps/web/src/lib/importData.ts:712` writes `db.items` but never creates
`ItemStock` rows, and `getStockedItems()` drives all seven pantry views. The
`clear` branch clears nine tables but **not** `itemStocks`, so stale stock rows
survive and re-attach to any colliding item id. Pre-v15 backups also import cart
ids without the `${locationId}:` prefix — `getAllCarts` filters them out, and
`parseCartId('no-vendor')` in `checkout` yields `locationId: 'no-vendor'`, writing
stock to a nonexistent location.
*Fix:* import `itemStocks` + `locations`; add `itemStocks` (and `locations`) to
the `clear` branch; upgrade legacy payloads — synthesise `'local'` `ItemStock`
rows from inline item stock fields and prefix legacy cart ids with `local:`.
*Test:* round-trip a v15 payload; import a legacy (pre-v15) payload and assert
the pantry is populated and cart ids are prefixed.

**1.4 — Coverage gap:** no test exercises the real v14 → v15 upgrade
(`migrate.test.ts` only asserts the no-op guard). Add a seeded v14 DB → open at
v15 test covering the stock split, log stamping, and cart re-keying.

## Task 2 — MEDIUM: cloud add-existing, duplicate assignments, read-path write

**2.1 — Add-existing is a silent no-op in cloud mode.**
`NewItemDialog.tsx:156` calls the Dexie-only `addItemToLocation` via
`useAddItemToLocation`. Cloud items never have `stockId`, so "Already here" can
never render, every catalog entry looks selectable, and selecting one writes an
orphan `ItemStock` keyed to a cloud item id while the dialog closes as if it had
succeeded.
*Fix:* in cloud mode the dialog is create-only — suppress the add-existing path
(no orphan write, no false success).
*Test:* dialog test in cloud mode.

**2.2 — Duplicate assignments.** `settings/tags/$id/items.tsx:208`,
`settings/vendors/$id/items.tsx:162`, `settings/recipes/$id/items.tsx:197`.
`onSuccess` previously only ever received a freshly created item; it now also
fires on the select-existing path, but all three handlers append unconditionally
(`tagIds: [...(item.tagIds ?? []), tagId]` and equivalents). Selecting an item
that already carries that tag/vendor, or is already in the recipe, duplicates the
id — duplicate badges, duplicate React keys, a duplicated recipe row.
*Fix:* guard each append with an `includes` check.
*Test:* one per route — selecting an already-assigned item is a no-op.

**2.3 — `getCart` writes during a read.** `db/operations.ts:517` `put`s a cart row
when one is missing, and it is called from TanStack Query `queryFn`s
(`useActiveCart`, `useVendorCart`). Visiting `/shopping/<stale-or-deleted-vendor>`
permanently creates a `${locationId}:${garbage}` cart that `bootstrapCarts` never
cleans up and that `getLastPurchasedByVendor` surfaces as a phantom vendor key.
*Fix:* make `getCart` a pure read; move creation into the mutation path (or
`bootstrapCarts` per location).
*Test:* `getCart` on a missing cart returns empty without persisting a row.

## Task 3 — LOW

**3.1 — Delete `migrateItemsToV2`.** `db/migrate.ts:8` — `db.verno` after
`open()` always equals the highest declared version (15), so the guard returns
unconditionally and the function is dead. **Ruling (user, 2026-08-16): delete it
as extinct** — v1 DBs are treated as non-existent. Remove the function, its
callers, and `migrate.test.ts`.

**3.2 — `useAddInventoryLog` does not thread the active location.**
`hooks/useInventoryLogs.ts:95` calls `addInventoryLog(input)` with no
`locationId`, defaulting to `'local'`, while its sibling read hook `useItemLogs`
filters by `activeLocationId`. Latent today (no production caller) but exported
and documented. *Fix:* thread `activeLocationId`. *Test:* hook test.

**3.3 — Enter can be a dead key.** `NewItemDialog.tsx:177` — when the typed query
exactly matches an already-stocked item, `showCreate` is false and the only
option is disabled, so Enter and the absent Create button both do nothing with no
feedback. *Fix:* skip non-selectable options in Arrow/Enter navigation (or
initialise `activeIndex` to the first selectable option).

**3.4 — Implicit stock add needs a confirmation.** `routes/items/$id/stock.tsx:177`
— `updateItem` routes stock fields through `upsertItemStock`, which creates a row
when none exists, so pressing Save on an unstocked item's Stock tab (reachable
from the tag/vendor/recipe assignment pages) silently adds it to the active
location with the zeroed pre-filled values. **Ruling (user, 2026-08-16): add a
confirmation** — prompt "Add &lt;item&gt; to &lt;location&gt;?" before the implicit
upsert. Needs new i18n strings in both `en.json` and `tw.json`.

**3.5 — Wrong `defaultAmount` for newly stocked items.**
`settings/recipes/$id/items.tsx:200` — `defaultAmount: item.consumeAmount` reads
the stale zero-joined `PantryItem` handed over by the dialog. For an item not yet
stocked in the active location the join supplies `ZERO_STOCK.consumeAmount === 1`,
while `addItemToLocation` has just copied the real `consumeAmount` from the source
location. The recipe records 1 instead of the real value. *Fix:* read the amount
from the freshly created/copied stock rather than the pre-add join.

## Task 4 — HIGH: local → cloud migration loses all stock

Found by the Task 1 implementer and confirmed by its reviewer; not part of the
original 11 findings. Added as a fourth wave on the user's instruction
(2026-08-16).

**4.1 — `toItemInput` reads stock fields that no longer exist on `Item`.**
`apps/web/src/lib/importData.ts:265-283`. `toItemInput` (used by
`importCloudData`) reads `packedQuantity`, `targetQuantity`, `targetUnit`, … off
`payload.items`, which post-v15 rows no longer carry. Every path that copies a
local pantry up to cloud — `usePostLoginMigration` on sign-in, and the
DataModeCard "copy data" action when switching local → cloud — therefore sends
null/0 for required fields.
*Scenario:* local pantry with Milk at 3 packs → sign in → cloud Milk arrives with
null quantities.

Cloud has **no per-location `ItemStock`** (deliberately deferred in PR D), so the
migration must collapse a multi-location local pantry to one stock value per
item.

**Ruling (user, 2026-08-16): send the stock of the location that is active at
migration time.** Flatten the active-location `ItemStock` back onto each item in
the cloud payload. Rationale: it matches what the user is looking at on screen
and how the rest of the app reads stock (`useActiveLocation()`). Cost if wrong: a
user whose active location is not their main pantry migrates the wrong stock
figures.

**Ruling (user, 2026-08-16): warn before migrating when more than one location
exists.** Before the copy runs, tell the user which location will be sent and
what is being left behind. Needs new i18n strings in **both** `en.json` and
`tw.json`. Cost if wrong: an extra confirmation step on the sign-in path.

*Fix:* flatten active-location stock onto the cloud payload in `toItemInput`'s
callers; add the multi-location warning ahead of `usePostLoginMigration` and the
DataModeCard copy action.
*Test:* a local → cloud migration preserves the active location's quantities,
units and expiration; the warning appears only when >1 location exists.

**Ordering:** Task 4 touches `apps/web/src/lib/importData.ts`, which Task 1 also
changed — run it after Tasks 2 and 3, never in parallel.

## Final

After all three tasks: whole-branch review, then E2E
(`pnpm test:e2e --grep "items|shopping|cooking|a11y"`), then update the PR body —
in particular the now-false claim that export "still round-trips the legacy
combined-Item shape".
