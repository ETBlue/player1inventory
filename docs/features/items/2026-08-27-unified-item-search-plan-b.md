# Unified Item Search — PR B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract PR A's view-agnostic tail wiring into a shared hook, then wire the
search tail into the **flat pantry** and **shelf detail** views — killing the #245
`hasExactMatch` bug on both, and deleting `ShelfDetailView`'s hand-rolled
"Not in this shelf" block.

**Architecture:** PR A built the derivation (`useItemSearchTail`) and the presentation
(`ItemSearchTail`). It also left ~45 lines of *wiring* in the cart route — pending-state
single-flight, `Add to {location}`, the sort pass-through, the visibility count. PR B
extracts that into `useItemSearchTailWiring`, so surface #2 and #3 cost a call and a
`groupAction` each rather than a copy-paste. Only the group action genuinely differs per
view.

**Tech Stack:** React 19 + TypeScript (strict), TanStack Query + Dexie (local) / Apollo
(cloud), Tailwind v4 + shadcn/ui, Vitest + React Testing Library, Storybook, Playwright,
react-i18next.

**Spec:** `docs/features/items/2026-08-26-unified-item-search-design.md` (approved
2026-08-26 — read it first, especially the "Carried forward from PR A's review" section;
do not re-litigate its decisions).

**Predecessor:** `docs/features/items/2026-08-26-unified-item-search-plan-a.md` (PR #256,
merged). Its Global Constraints apply here verbatim and are repeated below.

**Worktree:** `/Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-unified-item-search-b`
on branch `feature/unified-item-search-b`, branched from `origin/main` at `202fdc2f`.
**Subagent shells start in `apps/web/src`, not the repo root — use absolute paths.**

---

## Scope decision (ETBlue, 2026-08-27)

The design doc's PR B was "flat pantry + shelf detail". The **filter-shelf per-axis
picker is split out into its own PR** — it is net-new UI, needs one sub-axis per tag
*type*, and spans two non-atomic mutation targets (`useUpdateItem` for tags/vendors,
`useUpdateRecipe` for recipe membership, which lives on the `Recipe`, not the `Item`).
That is roughly as large as the rest of PR B combined.

Revised phasing:

| PR | Scope | Status |
|---|---|---|
| **A** | shared hook + `ItemSearchTail` + cart page | ✅ merged (#256) |
| **B** | tail-wiring extraction + flat pantry + **selection** shelves | this plan |
| **C** | vendor detail + recipe detail | not planned yet |
| **D** | filter-shelf per-axis picker | not planned yet |

**Consequence this plan must handle:** on a **filter** shelf today, the hand-rolled tail
renders in-location non-matching rows with **no button** (`shelf?.type === 'selection'`
gates it). `ItemSearchTail` hides bucket 2 entirely when neither `groupAction` nor
`groupNote` is supplied — so a naive wiring would make those rows *disappear*. That is a
real information loss. **Filter shelves therefore get `groupNote`** — a short inert line
— preserving today's information while gaining bucket 3, which they never had. PR D
swaps `groupNote` → `groupAction`; nothing else moves.

---

## Global Constraints

- **Item is global; ItemStock is per-location** (Dexie v15/v16 split). Configuration lives
  on `Item`; per-location state on `ItemStock`. Never create a second global `Item` to
  represent "the same thing at another location".
- **`isStockedHere(item)` is `item.stockId !== undefined`** (`@/lib/quantityUtils`). The
  single predicate the whole feature turns on.
- **Cloud mode gets ONE isolated `isCloud` bypass**, already inside `useItemSearchTail`
  (lines 70–82). Do **not** add a second one. `useAddItemToLocation()` throws in cloud
  (`LOCAL_ONLY_LOCATION_MUTATION`), so the wiring hook must gate the `Add to {location}`
  affordance on `!isCloud && !!activeLocation` — the existing `canAddToLocation` rule.
- **i18n:** every new key ships in **both** `en.json` and `tw.json`. Counted strings need
  **both** `_one` and `_other` in **both** locales even when byte-identical —
  `src/i18n/locales/locales.test.ts` enforces parity.
- **Name display:** item names render with Tailwind `capitalize` (visual only). Location
  and vendor names render **as stored** (`normal-case`).
- **Every location-scoped test needs a fixture stocked only at *another* location.** With
  one location, "stocked here" and "all items" return the same set and every assertion
  passes against an implementation that ignores location entirely. This is the `stockId`
  trap and it is the single most likely way this PR ships vacuous tests.
- **Mutation checks are mandatory.** A green test proves nothing until you delete the
  behaviour in the source, watch the test go RED, restore, and confirm green. Report which
  mutations you ran and that each went red. An unkillable mutation must be argued as an
  *equivalent mutant*, not waved past.
- **Do not add `mode="shopping"` to a tail `ItemCard`.** See the load-bearing comment at
  `routes/shopping/$vendorId.tsx:292-302`: it makes `ItemCard` treat the row as
  amount-controllable, warns when `onAmountChange` is absent, and reserves a dead 7rem
  `mr-28` lane. This was a PR A review finding; do not reintroduce it.
- **Verification gate after every task** (explicit paths — `cd` does not persist between
  Bash calls; run from the worktree root):
  ```bash
  (cd apps/web && pnpm lint)
  pnpm build 2>&1 | tee /tmp/p1i-build-b.log
  (cd apps/web && pnpm build-storybook)
  (cd apps/web && pnpm check)
  grep 'TS6385' /tmp/p1i-build-b.log && echo "FAIL: deprecated imports found" || echo "OK"
  pnpm test
  ```
  Run `pnpm build` and `pnpm test` from the **repo root** — the root build runs codegen and
  type-checks `apps/server`; the root test script runs both workspaces.
- **Baseline for this branch:** web 1767 tests / 210 files, server 98 / 9, all green at
  `202fdc2f`. Any red is yours.

---

## File Structure

**New**

| File | Responsibility |
|---|---|
| `apps/web/src/hooks/useItemSearchTailWiring.ts` | Owns pending single-flight, `Add to {location}`, sort pass-through, and the visibility boolean. Returns ready-to-spread `tailProps`. |
| `apps/web/src/hooks/useItemSearchTailWiring.test.ts` | Hook unit tests. |

**Modified**

| File | Change |
|---|---|
| `apps/web/src/components/item/ItemSearchTail/ItemSearchTail.tsx` | Export `ItemSearchTailProps` and a `hasVisibleTail(props)` predicate; use it for the component's own early return. |
| `apps/web/src/hooks/index.ts` | Export the wiring hook. |
| `apps/web/src/routes/shopping/$vendorId.tsx` | Refactor onto the wiring hook. **Zero behaviour change.** |
| `apps/web/src/routes/shopping/$vendorId.test.tsx` | Add the missing unresolved/deleted-vendor test (carry-forward #5). |
| `apps/web/src/components/pantry/PantryListView.tsx` | Global `hasExactMatch`; render the tail (bucket 3 only). |
| `apps/web/src/components/pantry/ShelfDetailView.tsx` | Delete the hand-rolled block + `outsideShelfSearchMatches`; global `hasExactMatch`; render the tail. |
| `apps/web/src/routes/index.test.tsx` | Location-scoped tests for both views. |
| `apps/web/src/routes/index.stories.tsx`, `index.stories.test.tsx` | Stories covering both tails. |
| `apps/web/src/i18n/locales/en.json`, `tw.json` | `items.searchTail.{addToShelf,notMatchingShelf}`. |
| `e2e/tests/unified-item-search.spec.ts` | Pantry + shelf-detail coverage. |
| `apps/web/src/hooks/CLAUDE.md`, `components/CLAUDE.md`, `routes/CLAUDE.md`, `i18n/CLAUDE.md` | Document the wiring hook, `hasVisibleTail`, the two new surfaces, the new keys. |
| `docs/features/items/2026-08-26-unified-item-search-design.md` | Record the scope split and mark PR B shipped. |
| `docs/INDEX.md` | Status update. |

---

## Design of `useItemSearchTailWiring`

```ts
export interface ItemSearchTailGroupAction {
  label: string                                  // already translated
  onAction: (item: PantryItem) => Promise<void>  // ASYNC — see below
  icon?: ReactNode
}

export interface UseItemSearchTailWiringOptions {
  inGroupIds: ReadonlySet<string>                // MUST be memoized by the caller
  query: string
  renderItem: (item: PantryItem) => ReactNode
  sortTail?: (list: PantryItem[]) => PantryItem[]
  groupAction?: ItemSearchTailGroupAction        // omit → bucket 2 hidden
  groupNote?: (item: PantryItem) => ReactNode    // inert bucket 2 fallback
}

export interface ItemSearchTailWiring {
  tailProps: ItemSearchTailProps                 // spread straight into <ItemSearchTail>
  hasTail: boolean                               // hasVisibleTail(tailProps)
  hasExactGlobalMatch: boolean                   // pass to ItemListToolbar
}
```

Four deliberate choices, each fixing something PR A's review flagged:

1. **`onAction` is `async`.** The hook does
   `setPending(item.id); try { await onAction(item) } catch { /* the mutation hook owns
   surfacing; pending must clear regardless */ } finally { setPending(null) }`. Callers use
   `mutateAsync` and stop hand-writing `{ onSuccess: clear, onError: clear }` pairs. The
   hook injects `pendingItemId` into both action descriptors, so a caller cannot forget it.
2. **`hasTail` is a boolean, not a count.** Every consumer only ever tests
   `renderedTailCount === 0` to suppress an empty state. Returning the boolean — computed by
   the *same* `hasVisibleTail` the component calls for its early return — collapses
   carry-forward #2's second source of truth structurally rather than by convention.
3. **`useItems()` stays inside `useItemSearchTail`** (carry-forward #3, resolved). The flat
   pantry already keeps that query warm: `NewItemDialog` calls `useItems()` unconditionally
   (`NewItemDialog.tsx:59`) and `PantryListView` mounts it permanently, so TanStack dedupes
   on the `['items']` key and the pantry pays nothing. Shelf detail gains one
   `getAllItems()` read per visit — the same read its sibling view already does. Passing
   `items` in as a parameter would be *actively wrong*: the only list a pantry caller has to
   hand is `useStockedItems()`, and feeding that in would silently empty bucket 3 — the
   exact location-blindness this feature exists to fix.
4. **`renderItem` goes through the hook** so `tailProps` is complete and spreadable. It is
   pure pass-through; the hook never renders a card itself, because the three surfaces pass
   materially different `ItemCard` props.

**`hasVisibleTail(props)`** moves the existing derivation out of the component body:

```ts
export function hasVisibleTail(props: ItemSearchTailProps): boolean {
  const showInLocation =
    (!!props.groupAction || !!props.groupNote) && props.inLocationItems.length > 0
  const showNotStockedHere =
    !!props.addToLocationAction && props.notStockedHereItems.length > 0
  return showInLocation || showNotStockedHere
}
```

The component calls it and early-returns on `false`. Its internal `notStockedHereAction`
narrowing stays as-is — it carries the non-undefined action into the JSX.

---

## Task 1: Extract the wiring hook; refactor the cart page onto it

**This task must not change cart-page behaviour.** PR A's existing tests
(`$vendorId.test.tsx`, `$vendorId.stories.test.tsx`, `unified-item-search.spec.ts`) are the
guard. If any of them needs editing to stay green, stop — that means behaviour moved, and
the refactor is wrong.

- [ ] Export `ItemSearchTailProps` from `ItemSearchTail.tsx` (currently module-private).
- [ ] Add and export `hasVisibleTail(props)` exactly as above; rewrite the component's early
      return to call it. Keep the `notStockedHereAction` narrowing.
- [ ] Create `apps/web/src/hooks/useItemSearchTailWiring.ts` per the interface above. It
      calls `useItemSearchTail({ inGroupIds, query })`, `useAddItemToLocation()`,
      `useActiveLocation()`, `useDataMode()`, `useTranslation()`, and owns
      `useState<string | null>` for the pending id.
- [ ] `canAddToLocation = !isCloud && !!activeLocation`. When false, omit
      `addToLocationAction` from `tailProps` entirely (do not pass a disabled one).
- [ ] Build `addToLocationAction` with `label: t('items.searchTail.addToLocation', {
      location: activeLocation?.name ?? '' })` and `icon: <Plus />`. Because the hook returns
      JSX it must be a `.tsx` file — name it `useItemSearchTailWiring.tsx`.
- [ ] Apply `sortTail` to both buckets when supplied; otherwise pass the hook's name order
      through unchanged.
- [ ] Export from `apps/web/src/hooks/index.ts`.
- [ ] Write `useItemSearchTailWiring.test.tsx` (mock `useItemSearchTail`,
      `useAddItemToLocation`, `useActiveLocation`, `useDataMode`, following
      `useItemSearchTail.test.ts`). Cover: pending id set during an in-flight `onAction` and
      cleared after; **cleared after a rejected `onAction`**; `addToLocationAction` absent
      in cloud mode; `addToLocationAction` absent with no active location; `hasTail` false
      when both buckets are empty; `sortTail` applied to both buckets.
- [ ] Refactor `routes/shopping/$vendorId.tsx` onto the hook. Delete `sortTail`,
      `tailPendingId`, `clearTailPending`, `handleAddToLocation`, `canAddToLocation`, the
      `addToLocationAction` spread, `showTailApplyVendor`, and `renderedTailCount`. Convert
      `handleApplyVendor` to `async` + `mutateAsync`. Keep `renderTailItemCard` and
      `renderVendorsNote` in the route. Replace the empty-state guard's
      `renderedTailCount === 0` with `!hasTail`.
- [ ] The no-vendor cart's `groupNote`-vs-`groupAction` choice stays in the route: pass
      `groupNote` when `cartVendorId === null`, `groupAction` when `vendor` resolves, and
      neither otherwise. That last case is the unresolved/deleted-vendor window.
- [ ] **Carry-forward #5:** add the missing test to `$vendorId.test.tsx` — with a
      `cartVendorId` that matches no vendor, bucket 2 renders no action button and no
      partial "Apply " label. Verified only by inspection in PR A.
- [ ] Mutation checks, all must go RED:
      1. Delete the `finally { setPending(null) }` → the "cleared after rejection" test fails.
      2. Make `canAddToLocation` ignore `isCloud` → the cloud test fails.
      3. Change `hasVisibleTail` to `return true` → the `hasTail`-false test fails.
      4. Drop the `sortTail` call on `notStockedHere` → the sort test fails.
      5. Remove the `vendor` guard in the route → the new carry-forward #5 test fails.
- [ ] Run the full verification gate.
- [ ] Commit: `refactor(items): extract the search-tail wiring into a shared hook`.

## Task 2: Flat pantry

- [ ] In `PantryListView.tsx`, memoize `inGroupIds` from the rendered list. **Bucket 1 is
      every stocked-here item, so bucket 2 is empty by construction** — pass no
      `groupAction` and no `groupNote`. Only bucket 3 renders.
- [ ] Replace the local `hasExactMatch` (lines 111–113, computed off `useStockedItems()` —
      the #245 shape) with the hook's `hasExactGlobalMatch`. Keep `searchedItems` for the
      list pipeline; only the toolbar prop changes.
- [ ] Pass `sortTail` built from the page's existing `useItemSortData` + `useSortFilter`
      values so the tail obeys the page sort, as on the cart.
- [ ] Render `<ItemSearchTail {...tailProps} />` after the inactive section, inside the same
      `space-y-px` container, gated on `search.trim()`.
- [ ] Suppress the "No items match the current filters." empty state when `hasTail`. (Note
      it is hardcoded English today — leave that alone; out of scope.)
- [ ] `renderItem` must mirror the page's own card props (`showTags={isTagsVisible}`,
      `vendors`, `recipes`, `activeTagIds`, …) **except** `showStock={isCloud ||
      isStockedHere(item)}`, and **no `mode`**.
- [ ] Tests in `routes/index.test.tsx` using the `stockId` trap fixture — at least one item
      stocked **only at another location**:
      - it appears in bucket 3, not the main list
      - `Add to {location}` moves it into the main list (bucket 1 — the flat pantry has no
        bucket 2, so promotion is direct)
      - searching an exact global name that is not stocked here offers **no** create button
        (the #245 regression guard)
      - searching a name no global item has still offers create
- [ ] Add/extend a story in `routes/index.stories.tsx` + a smoke test.
- [ ] Mutation checks, all must go RED:
      1. Revert `hasExactMatch` to the `searchedItems.some(...)` form → the #245 guard fails.
      2. Make the tail read `useStockedItems()` → the bucket-3 test fails.
      3. Delete the `hasTail` empty-state suppression → the empty-state test fails.
- [ ] Full gate. Commit: `feat(pantry): location-aware search tail on the flat pantry`.

## Task 3: Shelf detail (selection shelves)

- [ ] Delete the hand-rolled block at `ShelfDetailView.tsx:348-388` **and** the
      `outsideShelfSearchMatches` memo at 181–188. Keep `inShelfItemIds` (176–179) — it is
      already exactly the `inGroupIds` shape.
- [ ] Replace `hasExactMatch` (170–174, the #245 shape) with `hasExactGlobalMatch`.
- [ ] `groupAction` **only when `shelf?.type === 'selection'`**:
      `label: t('items.searchTail.addToShelf')`, `icon: <ArrowUpFromLine />`,
      `onAction: async (item) => { await updateShelf.mutateAsync({ id: shelf.id, data: {
      itemIds: [...(shelf.itemIds ?? []), item.id] } }) }`. Preserve the existing
      already-present guard from `handleAddToSelectionShelf` (196–198).
- [ ] `groupNote` when `shelf?.type === 'filter'`: a `<span>` with
      `t('items.searchTail.notMatchingShelf')`. Add a comment marking it as PR D's
      swap point.
- [ ] **`'system'` shelves and the `unsorted` pseudo-shelf get neither** — no `groupAction`,
      no `groupNote`, so bucket 2 stays hidden. They already have no add path
      (`handleAddToSelectionShelf` early-returns), and inventing one is out of scope. Bucket
      3 still renders: `Add to {location}` is group-agnostic.
- [ ] This replaces per-row `disabled={updateShelf.isPending}` — which today disables and
      spins **every** row at once — with the hook's per-row single-flight. Assert the fix:
      pressing one row's button leaves a **sibling** row's button enabled and unspun.
      (Assert the sibling, not the pressed row: `Button` computes
      `disabled={isLoading || disabled}` internally, so the pressed row is disabled either
      way and asserting on it is vacuous — a PR A lesson.)
- [ ] The hardcoded English `Not in this shelf` and the raw template-literal
      `aria-label={\`Add ${item.name} to shelf\`}` both die with the block; the shared
      component supplies `ListSectionDivider` + `t('items.searchTail.rowAction')`.
- [ ] Wrap `handleCreateFromSearch` (205–223) in `try/catch` — the cart page and the four
      Settings tabs all guard theirs; this one does not. Leave `useCreateItem()` without
      `catalogOnly` as-is: a pantry-side create **should** stock the item here.
- [ ] Add `items.searchTail.addToShelf` and `items.searchTail.notMatchingShelf` to both
      locales. Suggested: `"Add to shelf"` / `"加入層架"`; `"Doesn't match this shelf's
      filters"` / `"不符合此層架的篩選條件"`.
- [ ] Tests in `routes/index.test.tsx`, again with the `stockId` trap fixture:
      - selection shelf: an item stocked only at location B lands in bucket 3
      - `Add to {location}` moves it to bucket 2 (still not in the shelf) — **the two-step
        gate: one press does not also add it to the shelf**
      - a second press on `Add to shelf` puts it in the shelf
      - an item **already in the shelf** but stocked only at location B lands in bucket 3
        and `Add to {location}` promotes it **straight to bucket 1** (no shelf membership
        left to grant)
      - filter shelf: bucket 2 renders the note and **no** button
      - filter shelf: bucket 3 still renders `Add to {location}`
      - the per-row single-flight sibling assertion above
- [ ] Story + smoke test for the shelf-detail tail.
- [ ] Mutation checks, all must go RED:
      1. Make `groupAction` unconditional (drop the `type === 'selection'` test) → the
         filter-shelf "no button" test fails.
      2. Make `handleAddToLocation` also append to `itemIds` → the two-step gate test fails.
      3. Point `inGroupIds` at `[]` → the already-in-shelf promotion test fails.
      4. Revert `hasExactMatch` to the `allItems` form → the #245 guard fails.
      5. Replace the per-row pending id with `updateShelf.isPending` → the sibling test fails.
- [ ] Full gate. Commit: `feat(pantry): location-aware search tail on shelf detail`.

## Task 4: E2E, docs, and the final gate

- [ ] Extend `e2e/tests/unified-item-search.spec.ts` with pantry and shelf-detail flows,
      reusing `seedRows` / `splitInlineStock` from `../helpers/locationSeed` and the existing
      `HOME`/`OFFICE`/`COSTCO` fixture. **The fixture is the test** — Milk stocked only at
      Office. Cover: flat-pantry bucket 3 + `Add to {location}`; selection-shelf two-step
      gate; filter-shelf note with no button.
- [ ] Update `hooks/CLAUDE.md` (the wiring hook, and why `useItems()` lives inside the
      derivation hook), `components/CLAUDE.md` (`hasVisibleTail`; the `ListSectionDivider`
      tally — the hand-rolled shelf row is now a real call site, so correct the note that
      calls it *deliberately not* one), `routes/CLAUDE.md` (both new surfaces),
      `i18n/CLAUDE.md` (the two new keys).
- [ ] Update the design doc: record the four-PR split and mark PR B shipped. Update
      `docs/INDEX.md`.
- [ ] Full gate, then E2E. **Derive `--grep` from spec FILE names, not routes** — shelf
      detail lives under `/`, so:
      ```bash
      pnpm test:e2e --grep "unified-item-search|shelves|vendors-group|recipes-group|items|shopping|a11y"
      ```
      E2E failure is a hard stop; the branch must not be pushed until green.
- [ ] **Note:** issue #257 tracks four *pre-existing* a11y colour-contrast failures on
      shelves / vendor-group / recipe-group, proven in PR A not to be caused by that branch.
      If they reappear, confirm against `main` before treating them as yours.
- [ ] Commit docs separately from code.

---

## Self-Review

**What this plan deliberately does not do**

- No filter-shelf apply action (PR D). Filter shelves get an inert note, by design.
- No vendor/recipe detail (PR C).
- No `mode="shopping"` on tail cards, ever.
- No second `isCloud` branch.
- No fix for `PantryListView`'s hardcoded-English "No items match the current filters."
  empty state — pre-existing, unrelated, would inflate the diff.

**Riskiest step:** Task 1. It is a pure refactor of shipped, reviewed code, and its safety
rests entirely on PR A's tests being a real guard rather than a vacuous one. The stated stop
condition — *if an existing test needs editing to stay green, the refactor is wrong* — is
the check that makes the risk visible instead of silent.

**Second riskiest:** the `stockId` trap in Tasks 2 and 3. Both views are location-scoped and
both currently read `useStockedItems()`. A single-location fixture will pass against a
completely location-blind implementation. Every new test needs an item stocked **only at
another location**, and mutation check 2 in each task exists specifically to prove the
fixture is not vacuous.
