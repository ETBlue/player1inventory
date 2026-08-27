# Unified item search — PR C implementation plan (vendor detail + recipe detail)

**Date:** 2026-08-27
**Branch:** `feature/unified-item-search-c`
**Design:** `2026-08-26-unified-item-search-design.md` (approved; do not re-litigate)
**Follows:** PR A (#256), PR B (#259)
**Leaves for PR D:** the filter-shelf per-axis picker.

## Scope

The last two of the five surfaces:

| Surface | Bucket 2 action | Mutation |
|---|---|---|
| vendor detail | `Apply {vendor}` (`items.searchTail.applyVendor`, **key already exists**, PR A) | append to `item.vendorIds` |
| recipe detail | `Add to recipe` (`items.searchTail.addToRecipe`, **new key**) | append `{ itemId, defaultAmount: consumeAmount \|\| 1 }` |

Plus the one extraction PR B explicitly deferred to this PR: `showStock={isCloud || isStockedHere(item)}`, written out at three call sites today, which these two surfaces would take to five.

## Global constraints

1. **Use `useItemSearchTailWiring`. Do not hand-wire a fourth and fifth copy.** Callers supply `inGroupIds` (memoized), `query`, `renderItem`, optional `sortTail`, and exactly one of `groupAction` / `groupNote` / neither. `onAction` is async — use `mutateAsync`, never a `{ onSuccess, onError }` pair.
2. **`hasExactMatch` must read `hasExactGlobalMatch`** from the wiring hook, never a location-scoped list. This is the #245 fix and it regressed on two surfaces already.
3. **Empty-state guard ordering.** PR B shipped a bug where `items.length === 0` short-circuited *ahead* of the `!hasTail` guard, making the tail unreachable on a location with nothing stocked — the exact case the feature exists for. Every empty-state chain touched here must be read in full and tested with **nothing stocked at the active location**.
4. **The `stockId` trap.** Every location-scoped assertion needs a fixture stocked **only at another location**. With one location, "stocked here" and "all items" are the same set and the test passes against a location-blind implementation.
5. **Mutation checks are mandatory** and must be reported per task: delete the behaviour, watch the test go RED, restore. A test that stays green is a broken test, not an unkillable mutant — unless it is genuinely equivalent, in which case label it a negative control and do not count it as coverage.
6. **No `mode="shopping"` on tail rows** (PR A review item 4): it makes `ItemCard` reserve a 7rem control lane and warn on the missing `onAmountChange`.
7. **One isolated `isCloud` bypass** stays in `useItemSearchTail`. Do not add a second cloud path.

## What the survey changed about this plan

Three findings, each of which moves a task:

1. **The PR B empty-state bug shape does not exist here.** Neither view uses a ternary
   chain; both render a flat sequence of sibling `&&` expressions inside one
   `<div className="flex flex-col gap-px">` (`VendorDetailView.tsx:179-199`,
   `RecipeDetailView.tsx:201-221`). Nothing short-circuits. The *inverse* risk applies
   instead: the empty-state block is **additive**, so an ungated tail would render with
   "No items" sitting next to it. The guard is also `sortedItems.length === 0` — the
   pre-search list — so it must become `!trimmedSearch && sortedItems.length === 0`,
   matching `ShelfDetailView.tsx:407`. Constraint 3 above still governs the *testing*:
   prove the tail renders on a location with nothing stocked.

2. **Neither view has create-from-search**, and the approved design's table leaves that
   column `—` for both. So `hasExactGlobalMatch` is **not** consumed here — destructure
   `{ tailProps }` only. Do not add a create affordance; that is not this PR's scope and
   the #245 fix has no purchase on a toolbar that offers no create button.

3. **Both views have an `isUnsorted` pseudo-group** the design's action table never
   covers (`VendorDetailView.tsx:62-64` = items with no vendor at all;
   `RecipeDetailView.tsx:64-68` = items in no recipe). See the ruling below.

## Ruling — `isUnsorted` gets `groupNote`, not silence

**Decision:** on the unsorted variant of both views, bucket 2 renders an inert
`groupNote` naming the groups that already hold the item. Vendor-unsorted reuses the
existing `items.searchTail.inVendors`; recipe-unsorted needs a new `inRecipes`.

**Why:** the group is "items with *no* vendor / *no* recipe", so a group action there
would have to **strip every vendor / remove from every recipe** — destructive, not
additive. That is the identical argument the no-vendor cart already settled in PR A
(`routes/CLAUDE.md:225`), and `inVendors` exists precisely for it. Reusing that shape
keeps three surfaces consistent instead of inventing a fourth answer.

Passing *neither* is the other option, and it is the one PR B chose for `system` shelves
and the `unsorted` pseudo-shelf — where PR B's own final review flagged it as
contradicting the feature's rationale: `ItemSearchTail` hides bucket 2 entirely when no
action and no note are supplied, so those rows **silently vanish** and the page explains
nothing. That review named a generic `groupNote` as the cheapest closure. Applying that
here rather than replicating the known wart.

**Cost if wrong:** one i18n key pair and roughly six lines per view; a later PR can drop
the note by deleting one conditional spread.

**Explicitly out of scope:** closing the same gap on `ShelfDetailView`'s `system` /
`unsorted` branches. That is PR B's leftover and PR D already touches that file.

## Ruling — no `sortTail` on either view

Both share the exact limitation `ShelfDetailView.tsx:216-223` documents: `useItemSortData`
is keyed over `allItems` (stocked-here only), so bucket-3 rows would sort against absent
map entries. Pass no `sortTail`; the tail stays name-ordered while the main list obeys the
user's sort. Carry the same explanatory comment to both call sites so the inconsistency is
stated rather than silent. Widening the sort-data source stays deferred — it is now a
three-surface debt and should be its own change.

## Deferred — a location-scope predicate for the four filter call sites

Surfaced by the Task 1 review. `useShowStock` folds the **display gate** written out at
three call sites — all three were `showStock={isCloud || isStockedHere(item)}` on an
`ItemCard`, and Tasks 2-3 make it a clean 3-of-3 extraction (five sites once wired).

The *same* location-scoping predicate is also written out at **four other call sites**
which are filters, not display gates, and which Task 1 correctly left alone:

- `apps/web/src/hooks/useVendorCartCounts.ts:29` — `isCloud ? items : items.filter(isStockedHere)`
- `apps/web/src/routes/cooking.tsx:118` — same shape, inside a `Set` construction
- `apps/web/src/routes/shopping/index.tsx:126` — `noVendorItems.filter(isStockedHere)`
- `apps/web/src/routes/shopping/$vendorId.tsx:152` — `.filter((i) => isCloud || isStockedHere(i))`

Do **not** fold these into `useShowStock`. Only one of the four (`$vendorId.tsx:152`) sits
in a file that already calls the hook, so folding it in alone would trade a clean 3-of-3
extraction for a 1-of-4, under a name that reads as nonsense at a filter
(`.filter(showStock)` — the caller is selecting rows, not deciding whether to show stock
figures on one).

The real follow-up is a **separate** predicate for the location-scope concern — e.g.
`useIsStockedInActiveLocation()`, same cloud bypass, named for what a filter is asking —
adopted at all four sites in one change. That is its own PR; not PR C.

## Deferred — a search matching nothing on an empty group renders a blank pane

Surfaced by the Task 2 review. The empty state on all three detail views is gated
`!trimmedSearch` (this plan's own prescription, and byte-for-byte what
`ShelfDetailView.tsx:406-417` already shipped in PR B), so a group with no items plus a
query that matches nothing globally renders an empty list, an empty tail, and no empty
state at all — a blank pane with no explanation. Not a Task 2 defect: the wiring behaves
exactly as specified, and the shelf view has the same hole today. But it is now a real gap
on **three** surfaces rather than one, which is worth recording.

The fix needs no new derivation: `useItemSearchTailWiring` already returns `hasTail`
(`hasVisibleTail(tailProps)` — the same boolean the component uses for its own early
return), so a searching-and-found-nothing state is `!hasTail && displayedItems.length === 0`.
Applying it to all three views at once is the change; not PR C.

## Deferred — `VendorDetailView`'s recipe map is always empty

`VendorDetailView.tsx` builds `new Map<string, []>()` and passes `recipeMap.get(item.id) ??
[]` to every `ItemCard`, on list rows and tail rows alike. The relations toggle on that
page therefore can never show recipe badges, for any item. Its three sibling views build a
real map from `useRecipes()`.

Pre-existing and squarely outside PR C's scope — PR C only wires the tail, and the tail
faithfully reproduces whatever the list rows do. Recorded here so that the "tail rows must
match list rows" parity argument, which is the correct argument for the tail, does not
quietly become the reason the underlying map is never filled in.

## Deferred — the tail's group action re-enables before its refetch lands

Surfaced by the Task 3 review. `useUpdateRecipe`'s local `onSuccess`
(`hooks/useRecipes.ts:152-156`) calls `queryClient.invalidateQueries(...)` three times but
**returns nothing**, so TanStack Query does not await the refetch: `mutateAsync` resolves
as soon as the Dexie write is done. `useItemSearchTailWiring` clears its `pendingItemId`
in a `finally` immediately after that await
(`useItemSearchTailWiring.tsx:105-106`), and `ItemSearchTail` gates every row with
`disabled={!!action.pendingItemId}` (`ItemSearchTail.tsx:103`) — so the whole tail
re-enables while `recipe` in `RecipeDetailView` may still be the pre-write value. Two
presses inside that window both build `[...recipe.items, …]` from the same stale array,
and the second write drops the first item.

Three surfaces carry the same lost-update shape, all of them **local mode only**:

| Surface | Mutation | Array read back stale | Re-entrancy guard |
| --- | --- | --- | --- |
| `RecipeDetailView` (PR C, Task 3) | `useUpdateRecipe` | `recipe.items` | one global `pendingItemId`, cleared on `mutateAsync` resolve |
| `ShelfDetailView` (PR B) | `useUpdateShelf` (`useShelves.ts:171-174`) | `shelf.itemIds` | same — identical wiring hook |
| `settings/recipes/$id/items.tsx` | `useUpdateRecipe` | `recipeItems` | per-item `savingItemIds`, so two presses on **different** items still race |

The **cloud** path is immune on the recipe surfaces: it passes `awaitRefetchQueries: true`
(`useRecipes.ts:194`, `:214`), so the Apollo promise does not resolve until the refetch
has.

The window is narrow — an IndexedDB read on an already-warm cache, between the button
re-enabling and the next paint — so it is near-unreachable by hand, and no shipped
behaviour is known to hit it. Not fixed here for that reason, and because the fix is not
PR C's to make: `return queryClient.invalidateQueries({ queryKey: ['recipes'] })` in
`useUpdateRecipe`'s `onSuccess` closes both recipe surfaces at once, and the identical
one-liner in `useUpdateShelf` closes the shelf one. That is a hooks-layer change
deserving its own test rather than riding along in a tail-wiring PR.

## File structure

**New**
- `apps/web/src/hooks/useShowStock.ts` — the extraction (Task 1).

**Modified**
- `apps/web/src/components/pantry/VendorDetailView.tsx` (Task 2)
- `apps/web/src/components/pantry/RecipeDetailView.tsx` (Task 3)
- `apps/web/src/components/pantry/PantryListView.tsx`, `ShelfDetailView.tsx`,
  `routes/shopping/$vendorId.tsx` — adopt `useShowStock` (Task 1)
- `apps/web/src/i18n/locales/{en,tw}.json` — `items.searchTail.addToRecipe`, `inRecipes`
- `apps/web/src/routes/index.test.tsx` — two new `describe` blocks (Tasks 2, 3)
- `apps/web/src/routes/index.stories.tsx` + `index.stories.test.tsx` (Task 4)
- `e2e/tests/unified-item-search.spec.ts` (Task 4)
- `apps/web/src/{hooks,components,routes}/CLAUDE.md`, `i18n/CLAUDE.md`, `docs/INDEX.md`,
  the design doc's phasing table (Task 4)

## Tasks

### Task 1 — extract `useShowStock`

PR B deferred this naming PR C as the moment: `showStock={isCloud || isStockedHere(item)}`
is written out at `PantryListView.tsx:217`, `ShelfDetailView.tsx:195` and
`shopping/$vendorId.tsx:239`, and Tasks 2–3 would make it five.

Add `apps/web/src/hooks/useShowStock.ts` exporting `useShowStock(): (item: { stockId?: string }) => boolean`,
reading `useDataMode()` once and returning a `useCallback`-stable predicate
`isCloud || isStockedHere(item)`. Export it from the `hooks/index.ts` barrel (both
tail hooks already are), and **import it at call sites via the deep specifier**
`@/hooks/useShowStock` — purely to match the local convention: that is what
`PantryListView.tsx:17` and `ShelfDetailView.tsx:15` already do for the wiring hook,
which the barrel also re-exports. Nothing forces it. (An earlier draft of this plan
claimed a barrel import would be swallowed by the detail-view tests' `vi.mock('@/hooks')`.
That is false — all four pantry test files use a **partial** mock
(`{ ...await importOriginal(), useUpdateItem: … }`, e.g. `VendorDetailView.test.tsx:16-22`),
so `useShowStock` passes through from `actual` and a barrel import would run for real.)

Adopt it at all three existing sites. **Zero behaviour change** — the existing suite is
the guard, and the diff at each site is one expression.

**Mutation check:** invert the predicate (`!isCloud && !isStockedHere(item)`) and confirm
an existing test goes RED. If nothing goes red, the three call sites were never covered —
say so explicitly and add one assertion (a bucket-3 tail row must render **no** stock
figures in local mode) rather than reporting a silent pass. Do not skip this: an
extraction whose behaviour nothing pins is exactly how a refactor ships a regression.

### Task 2 — wire `VendorDetailView`

Follow `ShelfDetailView.tsx:224-251` as the template.

- `inGroupIds`: `useMemo(() => new Set(inScopeItems.map((i) => i.id)), [inScopeItems])`.
  **Source it from `inScopeItems`, NOT `displayedItems`** — `inGroupIds` must be the
  page's location-scoped pre-search list, per `hooks/CLAUDE.md:35`.
- `query: search` — the **raw** value; `useItemSearchTail` trims internally
  (`useItemSearchTail.ts:59`). Do not pass `trimmedSearch`.
- `renderItem`: a hoisted `function renderTailItemCard(item)` mirroring
  `ShelfDetailView.tsx:186-198` — per-row `vendors`/`recipes` computed from the full
  lists, **not** from a map keyed over `allItems`, because tail rows fall outside it.
  No `mode` prop (constraint 6). Use `useShowStock` from Task 1.
- Bucket 2: when `!isUnsorted`, `groupAction` `{ label: t('items.searchTail.applyVendor', { vendor: vendor.name }), onAction }`
  appending `vendorId` via `updateItem.mutateAsync` — the view already holds
  `useUpdateItem()` at `:36`, and `shopping/$vendorId.tsx:199-205` is the exact analogue.
  Guard re-entrancy the way `ShelfDetailView.tsx:235` does: return early if the item
  already carries the vendor. When `isUnsorted`, pass `groupNote` rendering
  `t('items.searchTail.inVendors', ...)` — reuse the cart's `renderVendorsNote`
  shape (`shopping/$vendorId.tsx:211`), `normal-case` per the vendor-name display rule.
- **The vendor-not-resolved window:** pass **neither** when `vendorId` is set but the
  vendor is absent from `useVendors()` (deleted-vendor / still-loading). PR A's review
  item 5 flagged that this window had no test; `$vendorId.test.tsx` now has one. Mirror it.
- Render `{trimmedSearch && <ItemSearchTail {...tailProps} />}` as a sibling, and change
  the empty state to `{!trimmedSearch && sortedItems.length === 0 && (...)}` so it stops
  rendering beside the tail.
- No `sortTail` (ruling above), with the explanatory comment.

**Tests → `apps/web/src/routes/index.test.tsx`**, a new `describe('vendor detail search tail (unified item search)')`
modelled on the shelf block at `:1062`. This route has **zero** coverage in that file today.
Fixtures must stock the probe item **only at another location**.

Cover: bucket 3 lists a globally-existing item not stocked here; `Add to {location}` stocks
it and does **not** apply the vendor (assert against the **database** between presses, not
row position); the vendor press is a separate second press; bucket 2 lists a stocked-here
item lacking the vendor; the unsorted variant renders the note and **no** button; the
unresolved-vendor window renders neither.

**Mutation checks** (each must go RED): delete the `!inGroupIds.has` subtraction; make
`Add to {location}` also apply the vendor; drop the `isUnsorted` branch so unsorted gets a
button; source `inGroupIds` from `displayedItems`.

### Task 3 — wire `RecipeDetailView`

Same shape as Task 2, with the differences that matter:

- **Membership lives on the `Recipe`, not the `Item`** (`packages/types/src/index.ts:194-201`).
  The view does **not** currently import `useUpdateRecipe` — add it (`hooks/useRecipes.ts:140`).
- Bucket 2 action: new key `items.searchTail.addToRecipe` (en `"Add to recipe"`, tw
  `"加入食譜"`), appending `{ itemId: item.id, defaultAmount: item.consumeAmount || 1 }`
  to `recipe.items` via `updateRecipe.mutateAsync({ id, updates: { items: [...] } })`.
  **`|| 1`, not `?? 1`** — an item may legitimately carry `consumeAmount: 0`, and
  `defaultAmount: 0` means "optional, unchecked" in cooking, so the ingredient would
  silently do nothing. This is stated at `settings/recipes/$id/items.tsx:209-212` and is
  the same trap the 2026-08-23 cloud `consumeAmount=0` window came from.
- Guard re-entrancy: return early if `recipe.items` already holds the item id.
- Unsorted variant: `groupNote` with the **new** `items.searchTail.inRecipes`
  (en `"In {{recipes}}"`, tw `"屬於 {{recipes}}"`).
- Same empty-state gating and the same no-`sortTail` comment.

**Tests:** a `describe('recipe detail search tail (unified item search)')` in
`routes/index.test.tsx`, same coverage list as Task 2.

**Mutation checks** (each RED): change `|| 1` to `?? 1` and prove a `consumeAmount: 0`
fixture catches it — **this fixture is the point of the test**, a `consumeAmount: 1` item
cannot distinguish the two; make `Add to {location}` also add to the recipe; delete the
in-recipe subtraction.

### Task 4 — stories, E2E, docs

- **Stories:** add `VendorDetailViewSearchTail` and `RecipeDetailViewSearchTail` to
  `routes/index.stories.tsx`, mirroring `ShelfDetailViewSearchTailStory` (`:507-564`) —
  seed two locations, stock the probe item elsewhere, route with `&q=`. Add matching
  smoke tests to `index.stories.test.tsx` asserting a real tail element, per the repo's
  "not `container.firstChild`" rule.
- **E2E:** extend `e2e/tests/unified-item-search.spec.ts`, reusing `seedRows` / `HOME` /
  `OFFICE` / `COSTCO` and `PantryPage.gotoWithSearch({ groupBy, id, q })`. Two specs: the
  vendor-detail two-step gate, and the recipe-detail two-step gate. `getNotStockedHereDivider()`
  and `getNotInThisListDivider()` already exist on the page object.
- **Docs:** `hooks/CLAUDE.md` (the new `useShowStock`; flip the tail hooks' "vendor/recipe
  detail follow in PR C" wording to shipped), `components/CLAUDE.md:153` (same),
  `routes/CLAUDE.md` (a Pantry-page subsection for the two detail surfaces, incl. the
  `isUnsorted` note ruling), `i18n/CLAUDE.md:74` (the two new keys), `docs/INDEX.md:48`
  (PR C → ✅), and the design doc's phasing table.

## Verification gate

Run in full after **every** task, from the worktree root, each with an explicit path:
`(cd apps/web && pnpm lint)`, root `pnpm build 2>&1 | tee /tmp/p1i-build.log`,
`(cd apps/web && pnpm build-storybook)`, `(cd apps/web && pnpm check)`,
`grep 'TS6385' /tmp/p1i-build.log`, and root `pnpm test` (**both** suites).

Baseline before any change: web **218 files / 1881 tests**, server **9 / 98**, all green.

Final phase only:
`pnpm test:e2e --grep "unified-item-search|shelves|vendors-group|recipes-group|items|shopping|a11y"`.
Four `color-contrast` failures on shelves / vendor-group / recipe-group are **known and
pre-existing** (#257) — PR C touches those three group views' *detail* siblings, so
re-verify against the merge base rather than assuming, and do not let the count grow.

## Self-review before opening the PR

- Every location-scoped assertion uses a fixture stocked **only at another location**.
- Every mutation check named above was actually run, went RED, and was restored — reported
  per task. Anything that stayed green is either a broken test or a labelled equivalent
  mutant, never a silent pass.
- No second `isCloud` path was added anywhere.
- The tail renders on a location with **nothing** stocked (PR B's bug class).
- `showStock` appears at exactly zero hand-written `isCloud || isStockedHere` sites.
