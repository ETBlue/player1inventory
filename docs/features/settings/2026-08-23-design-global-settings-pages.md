# Design — Settings assignment pages become global

**Issue:** #247 (Part 2). **Part 1** (`docs/features/items/2026-08-22-design-global-stock-settings.md`, PR #248) already moved the eight stock-*configuration* fields from `ItemStock` to `Item`. This is the second half.

## The principle

The four Settings assignment surfaces — shelves, vendors, recipes, tags — edit **global item↔entity relations**. They must not read or write location-scoped stock state. Today all four leak the active location's stock into the row, and all four bucket items with bare `isInactive()`.

Per-location state remaining on `ItemStock` after Part 1: `packedQuantity`, `unpackedQuantity`, `targetQuantity`, `refillThreshold`, `dueDate`. Those five are exactly what these pages must stop touching.

## Current state (verified at `ddfd40e8`)

| Surface | Rows from | Row component | Location leak |
| --- | --- | --- | --- |
| `settings/shelves/$shelfId/items.tsx` | `useItems()` `:36` | `ItemCard mode="tag-assignment"` `:278` | full stock block; `isInactive` bucketing `:219-224` |
| `settings/vendors/$id/items.tsx` | `useItems()` `:33` | `ItemCard mode="tag-assignment"` `:264` | same; bucketing `:202-213` |
| `settings/tags/$id/items.tsx` | `useItems()` `:33` | `ItemCard mode="tag-assignment"` `:265` | same; bucketing `:187-198` |
| `settings/recipes/$id/items.tsx` | `useItems()` `:32` | `ItemCard mode="recipe-assignment"` `:314` | same; bucketing `:156-161` |
| `settings/shelves/$shelfId/filters.tsx` | — | `Badge` `:152,189,219` | renders **no counts at all** |

All four **list** pages already count globally off `useItems()` — no change needed there.

## Decisions

### D1 — `ItemCard` gains `showStock?: boolean` (default `true`)

Follows the established suppression-prop pattern (`showTags`, `showTagSummary`, `showExpiration` — all three already passed `false` by these four tabs). A new `mode` would multiply an already 5-valued union; a boolean composes.

`showStock={false}` must suppress **all five** stock-derived renderings, not just the obvious ones:

1. the quantity text (`ItemCard.tsx:215-219`)
2. the `UnitBadge` (`:220`)
3. the `ItemProgressBar` (`:222-235`)
4. the **severity card variant** (`:126`) — colours the whole card from stock health
5. the **inactive dimming** (`:201`, `:211`, `:258`)

(4) and (5) are the ones a partial implementation misses, because they are styling rather than content. A card that is still dimmed or still tinted red is still leaking location state.

### D2 — Two buckets, not four

The four tabs currently sort into assigned-active / assigned-inactive / unassigned-active / unassigned-inactive. "Inactive" is `targetQuantity === 0` — per-location by definition, and there is no global equivalent. So the bucketing collapses to **assigned, then unassigned**, each name-sorted, preserving the existing sort within each half.

This deletes the `isInactive` import from all four routes — which also removes four instances of the documented `stockId` trap (`lib/quantityUtils.ts`), where an item merely *not stocked in the active location* is labelled inactive. Issue #247 chose removal over patching the predicate, and D2 is what makes that true.

### D3 — Create-from-search creates globally and stocks nowhere

`createItem` unconditionally writes an `ItemStock` in the active location (`db/operations.ts:272-276`). A catalog-only create path is new.

**Constraint found during survey:** `NewItemDialog` is *shared* with the pantry's Add flow (`components/pantry/PantryListView.tsx:334`), where creating **must** stock in the active location. So this cannot be a behaviour change to the dialog — it needs an opt-in prop, defaulting to today's behaviour.

- `createItem` gains an option to skip the `ItemStock` write.
- `NewItemDialog` gains a prop selecting it; the three tabs that use the dialog (tags `:301`, vendors, recipes) pass it, `PantryListView` does not.
- The shelves tab bypasses the dialog entirely (`shelves/$shelfId/items.tsx:153-178`, direct `useCreateItem()`) and needs the same treatment at its own call site.

**Consequence, accepted:** the created item is an orphan — in the catalog, attached to the entity, stocked in no location. This is already a supported state: `getAllItems` includes orphans with `ZERO_STOCK` and no `stockId`; `getStockedItems` excludes them; the pantry hides them; the Add combobox finds them. Nothing needs to change to accommodate them. This is the affordance that unblocks #245.

### D4 — Shelf filters tab gains global counts, and the tag count must expand descendants

The existing per-id helpers are unusable for a badge list: `getItemCountByTag` / `getItemCountByRecipe` are one async query per id, and hooks cannot be called in a loop. So this needs **map-shaped, memoized** hooks mirroring the existing `useVendorItemCounts()` (`hooks/useVendorItemCounts.ts`, `Map<vendorId, number>` off `useItems()`):

- `useTagItemCounts()` → `Map<tagId, number>`
- `useRecipeItemCounts()` → `Map<recipeId, number>`
- vendors reuse `useVendorItemCounts()` as-is

**The trap:** the shelf tag filter **expands descendants** — selecting a parent tag matches items carrying a child or grandchild tag (`lib/shelfUtils.ts:38-45`, `getTagAndDescendantIds`). `getItemCountByTag` counts direct assignments only. A badge count built naively on the existing helper would report **0 items** for a parent tag that in fact selects a dozen. On a filter-configuration page the count must describe what the filter will actually select, so `useTagItemCounts()` expands descendants.

Vendors and recipes have no hierarchy; their counts are plain membership.

Scope note: these are **per-entity** counts ("how many items carry this tag"), not a live preview of the composed filter. The filter's real semantics are OR-within-tag-type AND-between-types (`shelfUtils.ts:25-46`); previewing that is a different feature and is out of scope.

### D5 — Settings moves to the bottom of the sidebar

Settings is global; the switcher and the other three destinations are location-aware. Splitting them puts distance between the two kinds.

`Sidebar.tsx:7-12` is a flat 4-entry `navRoutes` array rendered in one flex column. Split into the three location-aware routes plus a pinned Settings block (`mt-auto`). The `<nav>` is already `flex flex-col` with `min-h-[100cqh]`, so no layout restructure is needed.

Two couplings to respect:
- `Sidebar.test.tsx:76-100` uses the Pantry link as its "first nav link" anchor — still valid, Pantry stays first.
- `components/global/Navigation/index.tsx` mirrors the route list for mobile. **Out of scope** — the rationale is desktop-sidebar spatial separation, and the mobile bar has no location switcher adjacency to fix.

## Out of scope

- Cloud parity. These pages are local-only concerns today; cloud has no `ItemStock`. No `isCloud` gate is added or removed.
- The composed-filter live preview (D4 scope note).
- Mobile `Navigation` ordering (D5).
- Issue #245 itself — unblocked here, not fixed here.

## Test plan

Per-decision, TDD, with mutation checks:

- **D1** — `ItemCard` with `showStock={false}` renders no quantity text, no `UnitBadge`, no progress bar, **no severity variant, no dimming**. Mutation: restore each of the five gates individually; each must turn a test red. Existing `ItemCard.test.tsx` (1522 lines) and 5 story files must keep passing with the default `true`.
- **D2** — each of the four tabs: assigned before unassigned, name-sorted within each. **Mandatory fixture:** include an item stocked *only at another location* and assert it sorts by name like any other — under today's code it would sink to an "inactive" bucket. This is the fixture that makes the test non-vacuous.
- **D3** — creating from search on each of the four tabs writes an `Item` and the relation but **no `ItemStock` row**; creating from the pantry still writes one. Mutation: drop the skip option; the four tab tests go red and the pantry test stays green.
- **D4** — badge counts appear and are global. **Mandatory fixture:** a parent tag whose only matching items carry a *child* tag — asserts the descendant expansion. Mutation: swap to direct-only counting; that test goes red.
- **D5** — Settings renders last; Pantry still first.

Gate after each commit: `pnpm lint`, root `pnpm build` (+ `grep TS6385`), `pnpm build-storybook`, `pnpm check`, `pnpm test --run`.

Final E2E: `pnpm test:e2e --grep "settings|shelves|vendors|recipes|tags|item-management|location|a11y"`. Note the specs live in both `e2e/tests/` and `e2e/tests/settings/`, and `shelves.spec.ts` exists in *both* — a grep built from route names alone misses `vendors-group`/`recipes-group`. Known baseline: 4 pre-existing a11y colour-contrast failures.

---

## Implementation notes (as shipped)

All five decisions landed as designed. Four commits, one per decision pair:
`193145d5` (D1 + D2), `5e666f17` (D3), `f1e6c2db` (D4), `ddd0d71c` (D5). The
deviations and surprises worth recording:

**D1 — the two styling gates were the whole risk, and they are now coupled.**
Rather than sprinkling `showStock &&` over the five sites independently, the
inactive-derived renderings all read one derived flag,
`showsInactive = showStock && isInactive(item)`. The severity variant stays a
separate expression because it also depends on `status`. This is why the card
cannot half-suppress: there is one place to get the inactive branch wrong, not
three.

**D2 — implemented exactly as specified.** The `isInactive` import is gone from
all four routes; each is now two `.filter` passes over the already-sorted list.

**D3 — `catalogOnly` threads through three layers** (`createItem` option →
`useCreateItem(options)` → `NewItemDialog` prop), defaulting to today's
behaviour at every one. The catalog-only branch returns
`joinItemStock(item, undefined, locationId)` — the same zeroed, `stockId`-less
shape `getAllItems` already produces — so nothing downstream needed a new case.

**D4 — recipe counts are derived from the item side, not `recipe.items.length`.**
The design did not specify which side to count from. `useRecipeItemCounts()`
builds a `Set` of the recipe's member ids and filters `items`, which means a
`RecipeItem` entry pointing at a **deleted** item is silently ignored rather
than inflating the badge. `recipe.items.length` would have counted it. The tag
side had no such choice — descendant expansion forces the item-side walk anyway.

**D5 — the mutation named in the brief was a no-op.** "Move Settings back into
the array" does not change anything observable, because Settings was already
*last* in the flat 4-entry `navRoutes` — it rendered in the same visual position
before and after. The real behaviour is (a) DOM order and (b) the separate
`mt-auto` block that pushes Settings to the bottom of the sidebar regardless of
content height, so the test asserts both: the link order in the rendered nav
**and** that the Settings link sits inside its own `mt-auto` container rather
than in the three-link group. Asserting order alone would stay green against the
old code.

## Known follow-up — the create/select asymmetry in `NewItemDialog`

`catalogOnly` governs the **create path only**. The dialog's *select-existing*
path still calls `useAddItemToLocation()`, which stocks the chosen item in the
active location. So on a Settings assignment tab:

- **Create new** → global item, attached to the entity, stocked **nowhere** ✅
- **Select existing** → attached to the entity, and **stocked here** ⚠️

Left as-is deliberately. Making select-existing location-neutral is not a
one-line gate: the combobox's whole option-rendering model is built on the
stocking assumption — options for items already stocked here render
`aria-disabled` with an "Already here" annotation and are excluded by
`isSelectable`, and the exact-match case shows location-naming feedback
(`items.addDialog.alreadyStockedHere`). On a global page none of that means
anything, so the fix is a second rendering mode for the combobox, not a flag.
Flagged here, not fixed. It is also recorded in
`apps/web/src/routes/settings/CLAUDE.md`.

## E2E outcome

`pnpm test:e2e --grep "settings|shelves|vendors|recipes|tags|item-management|location|a11y"`
selects **179 tests in 16 files** — both `shelves.spec.ts` copies,
`vendors-group`, `recipes-group` and the new `settings-global-pages.spec.ts`.

Final: **172 passed, 4 failed, 3 skipped**. The 4 failures are the known
baseline (a11y colour contrast on shelves, vendor group-by, recipe group-by and
shelves-on-mobile); the 3 skips are pre-existing `test.skip`s. `[cloud]` specs
did **not** skip — a backend was up on :4001, so both projects ran.

Two things the gate turned up:

**A pre-existing break inherited from part 1.** `item-management.spec.ts` :172
and :194 were timing out in *both* projects on
`locator('#expirationMode')`. Part 1 moved the expiration mode, "expires in N
days" and threshold fields to the Info tab, but `ItemPage.selectExpirationMode`
still called `ensureStockTab()`. Fixed on the spec side (the source is correct):
`ItemPage` gains `ensureInfoTab()`, and the specific-date spec now saves the
global mode before hopping to the Stock tab for this location's due date.

**Two new specs**, in `e2e/tests/settings-global-pages.spec.ts` (local project
only — cloud has neither `ItemStock` nor locations, and its `testMatch` lists
specs explicitly), covering the two user-visible outcomes that had unit coverage
but nothing end to end:

- *no location stock on a settings items tab* — the pantry half is a control
  proving the fixture really carries stock. Mutation: dropping
  `showStock={false}` from the tags tab turns it red.
- *Settings pinned below the location-aware links* — asserts order **and the
  measured layout gap**. Order alone is vacuous here for the reason recorded
  under D5 above, and real layout is exactly what jsdom denies the unit test.
  Mutation: folding Settings back into `navRoutes` and deleting the `mt-auto`
  block turns it red — the gap collapses from ~600px to the 4px `gap-1` — while
  the order assertion above it still passes.
