# PR E — Item-detail Stock-tab all-locations pager

**Date:** 2026-08-16
**Branch:** `worktree-feature-locations-stock-pager`
**Base:** `5c5851de` (PR D merged)
**Spec:** `docs/features/locations/2026-06-11-locations-design.md`,
`docs/features/locations/2026-06-12-locations-plan.md` (PR E section)

Final PR of the 5-PR Location feature. PR D split stock into a per-`(item × location)`
`ItemStock` and kept the Stock tab single-location (the active location). PR E turns
that tab into a pager over **all** locations, adds remove-from-location, and closes
out the feature docs.

## Global Constraints

- **TDD is mandatory.** Failing test first, then the fix, with RED/GREEN evidence per
  sub-task. A test written after its fix is not evidence — re-establish RED by
  reverting the hunk. **Treat "a test exists" as unproven until mutated**: PR D
  produced four tests that looked like coverage and were not.
- **Cloud `ItemStock` remains deferred** (documented decision of PR D). Cloud mode uses
  the GraphQL `Item` with inline stock and has no locations.
- **The `stockId`-in-cloud trap.** PR D shipped the same bug four times: code assuming
  the local Dexie shape misbehaving in cloud mode, where `stockId` never exists and
  cart ids are bare. **Every branch added here must state what it does in both modes,
  and be tested in both.** A pager over locations is meaningless in cloud — decide and
  test that path explicitly rather than letting it fall through.
- `'local'` is the default location id; operations take an explicit `locationId`; hooks
  thread `useActiveLocation().activeLocationId`; components never touch Dexie directly.
- Stories and tests travel in the same commit as the code they cover. One commit per
  logical concern.
- Verification gate after each task, absolute paths or subshells (cwd persists):
  ```
  (cd apps/web && pnpm lint)
  pnpm build 2>&1 | tee /tmp/p1i-build.log
  (cd apps/web && pnpm build-storybook)
  (cd apps/web && pnpm check)
  grep 'TS6385' /tmp/p1i-build.log && echo FAIL || echo OK
  (cd apps/web && pnpm test --run)
  ```
  Baseline: **1509 passing, 194 files**. A very slow run reporting files that fail to
  load means the machine slept — re-run before investigating.

## Task 1 — `removeItemFromLocation` + cascade

`addItemToLocation` exists (`db/operations.ts:133`); there is no remove counterpart.

1. Add `removeItemFromLocation(itemId, locationId)`: delete that `ItemStock` row and
   cascade — its `inventoryLogs` for that `(item, location)`, and its entries in that
   location's carts (`${locationId}:${vendorId|'no-vendor'}`).
2. The global `Item` **persists** when its last `ItemStock` goes (orphan items stay
   re-addable via the pantry combobox). Confirm the pantry hides them and search still
   finds them — this is the open note carried from PR D.
3. Removing stock for the **active** location must leave the pantry consistent without
   a reload (invalidate the right query keys).

*Tests:* stock row gone; logs for that pair gone; cart entries gone; carts for OTHER
locations untouched; the `Item` still exists; removing the last location leaves an
orphan that the combobox can re-add.

## Task 2 — The pager

1. **Pager** in `/items/$id/stock`: centre dots (one per location) under the toolbar,
   left/right chevrons. Opens on the active location. The active location stays
   visually marked while viewing others; the current page's dot is highlighted.
   *Open note from the plan:* active-vs-viewed indicator styling is unresolved —
   choose using existing design tokens, and show the choice in the report.

   **RESOLVED (designer ruling, 2026-08-16):** every dot is the same size and the
   same colour; the dot for the page being viewed is filled and the rest are
   hollow. Implemented as `size-3` + `border-2 border-foreground-muted` on all
   dots, with `bg-foreground-muted` vs `bg-transparent` as the only difference.
   `foreground-muted` measures 8.73:1 (light) / 7.30:1 (dark) against
   `background-elevated`, clearing WCAG 1.4.11's 3:1 for non-text indicators;
   the hollow dot's stroke is that colour and its centre is the page, so the
   stroke inherits the ratio. **Accepted consequence:** the ruling spends size,
   colour *and* fill on page position, so the globally active location has no
   dot marker at all. It keeps the words channel — the caption under the
   heading always reads "Active" / "Active: `<name>`" — plus the
   "(active location)" suffix in that dot's accessible name. No replacement
   visual marker was invented (rings, halos and opacity tricks were all
   explicitly out of scope, and the ring previously tried here failed contrast).
2. **Per page:** stocked → the existing stock form for that location, plus
   **"Remove from location"**; not stocked → empty state plus **"Add to location"**
   (copy-on-add, reusing `addItemToLocation`).
3. Keyboard and a11y: dots are a real tablist/pager with accessible names, arrow-key
   navigation, and a live region announcing the viewed location. Do not ship a
   div-with-onClick.
4. Removal is destructive — confirm before it runs, naming the item and location, and
   say that its logs and cart entries go too.
5. **Cloud mode:** cloud has no locations. Decide explicitly (single page, no pager, no
   remove) and test it. Do not let the local-shape assumption leak.

*Tests + stories:* stocked page, not-stocked page, active-marked-while-viewing-another,
single-location (no pager chrome), cloud mode. Each story needs its
`.stories.test.tsx` smoke test asserting a real element, never `container.firstChild`.
New i18n strings in **both** `en.json` and `tw.json`, `tw` genuinely translated.

## Task 3 — Docs, INDEX, E2E

1. New `apps/web/src/routes/settings/locations/CLAUDE.md`.
2. Update `apps/web/src/routes/CLAUDE.md` (active-location scoping), item routes
   CLAUDE.md (the Stock pager), and `db` notes (v14/v15 + `ItemStock`).
3. Flip the `locations` row in `docs/INDEX.md` to ✅ — PR E completes the feature.
4. E2E: add/remove-from-location flows, pager navigation, orphan re-add. Add the new
   states to `e2e/tests/a11y.spec.ts` in both light and dark mode.

**Verify (final):** full gate + `pnpm test:e2e --grep "items|shopping|cooking|settings|a11y"`.
Known pre-existing E2E failures: 4 a11y colour-contrast (shelves, vendor/recipe
group-by, shelves mobile); `[cloud]` specs need a backend on :4001. Playwright browsers
may need `pnpm exec playwright install chromium` in a fresh worktree.

## Carried-over follow-ups (fix here if cheap, else leave)

From the PR D review, listed in that PR's body:
- `emptyPayload()` in the import test helper omits `itemStocks` — the structural reason
  unit coverage missed a real data-loss bug. **Worth fixing.**
- `bootstrapCarts` logs `DatabaseClosedError` on test teardown (correct behaviour, noisy
  output).
- A failed cart bootstrap does not self-heal or surface an error (UX decision).
- Legacy-imported logs are not stamped with `locationId` (benign).
- `useItemWithQuantity` reads Dexie in cloud mode (pre-existing).
- The 7 pantry view components have no Storybook stories (pre-existing).
