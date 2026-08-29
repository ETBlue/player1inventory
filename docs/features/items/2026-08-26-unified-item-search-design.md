# Unified location-aware item search — design

**Date:** 2026-08-26
**Issue:** #245 (filed as a cart-page duplicate-`Item` bug; scope widened here)
**Branch:** `feature/unified-item-search`
**Status:** ✅ **Design approved by ETBlue 2026-08-26.** **PR A shipped** (shared
hook + `ItemSearchTail` + cart page — closes #245); see
`2026-08-26-unified-item-search-plan-a.md`. **PR B shipped** (tail-wiring
extraction + flat pantry + selection shelves — see
`2026-08-27-unified-item-search-plan-b.md`); the original three-PR phasing
below is superseded by a **four-PR split** (ETBlue, 2026-08-27): the
filter-shelf per-axis picker split out of PR B into its own PR D, since it is
net-new UI spanning two non-atomic mutation targets. **PR C shipped**
(`useShowStock` extraction + vendor detail + recipe detail — see
`2026-08-27-unified-item-search-plan-c.md`), completing all five surfaces.
**PR D shipped** (#270 — filter-shelf per-axis picker — see
`2026-08-28-unified-item-search-plan-d.md`): every bucket-2 row across all five
surfaces is now actionable, except a filter shelf whose `filterConfig` is
outright unsatisfiable (a vendor or recipe axis naming only a deleted entity),
which keeps the inert `groupNote`. **PR D-1 shipped** (#272 — making the cloud
half of that picker's two writes atomic via a single `prisma.$transaction`
resolver — see `2026-08-28-unified-item-search-plan-d1-cloud-transaction.md`,
issue #269); local mode was already atomic on PR D's ship. All phases of this
feature are now complete — see "Phasing" below. Do not re-litigate the
decisions below.
**Brainstorming log:** `2026-08-26-brainstorming-unified-item-search.md`

## Problem

Every item list is scoped to the active location. Search inside those lists is
scoped the same way, so searching for an item that exists globally but is not
stocked at the active location shows **nothing** — and on the two pages that
offer create-from-search, offers to create it, minting a duplicate global `Item`.

`Item` is global; `ItemStock` is per-location (v15 split). A duplicate therefore
follows the user to *every* location, including the one where the original lives.

The narrow fix (check global names, suppress the create button) trades a
duplicate for a dead end: a screen that knows the item exists and offers nothing.

## Current state (verified by reading the code, 2026-08-26; PR A/B/C/D rows updated post-ship)

| Surface | items source | search scope | tail section | create-from-search |
|---|---|---|---|---|
| Pantry flat (`PantryListView`) | `useStockedItems` | stocked-here | ✅ **shipped PR B** — bucket 3 only (`ItemSearchTail`) | opens `NewItemDialog` — **already correct** |
| Shelf detail (`ShelfDetailView`) | `useStockedItems` | in-shelf ∩ here | ✅ **shipped PR B, extended PR D, dialog-always-opens reversal 2026-08-28** — `ItemSearchTail` (selection: `groupAction`; filter, satisfiable: `groupAction` — always opens `ShelfFilterPicksDialog`, PR D; filter, unsatisfiable: inert `groupNote`; system/unsorted: neither) | inline `createItem` + add to shelf |
| Vendor detail (`VendorDetailView`) | `useStockedItems` | vendor ∩ here | ✅ **shipped PR C** — `ItemSearchTail` (resolved vendor: `groupAction` appending to `item.vendorIds`; `unsorted`: inert `groupNote`; unresolvable `?id=`: neither) | — |
| Recipe detail (`RecipeDetailView`) | `useStockedItems` | recipe ∩ here | ✅ **shipped PR C** — `ItemSearchTail`, the only surface mutating the **group**: appends `{ itemId, defaultAmount: consumeAmount \|\| 1 }` to `Recipe.items` (same three-way bucket 2) | — |
| Cart (`shopping/$vendorId`) | `useItems` + `isStockedHere` | vendor ∩ here | ✅ **shipped PR A** — `ItemSearchTail` | inline `createItem` ← **#245**, fixed |

Key existing pieces this design builds on, rather than inventing:

- **`NewItemDialog`** already implements the whole add-existing-vs-create
  decision (combobox over `useItems()`, `useAddItemToLocation` for existing,
  `useCreateItem` for new, with `stockId` deciding which). This design moves that
  logic inline; the dialog stays as the browse path.
- **`ListSectionDivider`** + `common.notStockedHere`
  (`"{{count}} not stocked here"` / `"此據點無庫存的 {{count}} 項"`) is the
  established shared idiom, already used by the pantry group views, the shopping
  vendor list and the cooking recipe list.
- **`ShelfDetailView`'s "Not in this shelf"** was a hand-rolled
  `<p className="text-xs …">`, **not** a `ListSectionDivider` — off-convention,
  and folded into the shared `ItemSearchTail` component by PR B (the block and
  its `outsideShelfSearchMatches` memo are deleted).
- **`useAddItemToLocation`** — copy-on-add, no-op-safe if already stocked,
  throws in cloud mode (`LOCAL_ONLY_LOCATION_MUTATION`).

## Design

### Three sections

A shared hook `useItemSearchTail({ inGroupIds, query })` reads `useItems()` — the
global catalog joined against active-location stock, where `stockId === undefined`
means *not stocked here*. When `query` is non-empty it yields two tail buckets
beneath the page's existing list:

| # | Bucket | Predicate | Divider |
|---|---|---|---|
| 1 | in group | the page's existing list | unchanged — keeps its active/inactive split |
| 2 | in location | `isStockedHere && !inGroup && matches` | `common.notInThisList` **(new key)** |
| 3 | global | `!isStockedHere && matches` | `common.notStockedHere` (existing, reused) |

Two consequences fall out of this ordering for free:

- **An item that *is* in the group but is not stocked here lands in bucket 3.**
  Adding it to the location promotes it straight to bucket 1 — correctly skipping
  the second click, because there is no group membership left to grant.
- **The flat pantry needs no special case.** Bucket 1 is *every* stocked-here
  item, so bucket 2 is empty by construction; the page renders list + bucket 3.

### The two-step gate

Bucket 3's only action is `Add to {location}`. It does **not** also apply the
group. The row moves up into bucket 2, and the group action is a **separate
press**.

This is deliberate, in ETBlue's words: *"adding items to location should be
prudent and explicit, not easy to achieve by accident."* The gate is structural —
the row physically relocates — rather than a confirm dialog.

### Actions

| Surface | Bucket 2 button | Effect |
|---|---|---|
| selection shelf | `Add to shelf` | append to `shelf.itemIds` |
| filter shelf | `Add to shelf` | apply the **whole** `filterConfig`, user-picked per OR'd axis (below) |
| vendor detail | `Apply {vendor}` | append to `item.vendorIds` |
| recipe detail | `Add to recipe` | append `{ itemId, defaultAmount: consumeAmount \|\| 1 }` |
| cart page | `Apply {vendor}` | append vendorId → item appears in the cart's pending list |
| flat pantry | — | bucket empty by construction |

Bucket 3 is always `Add to {location}` — a label deliberately distinct from every
bucket-2 label, so the two actions never read as the same thing.

### Filter shelves

`matchesFilterConfig` ANDs across `tagIds` / `vendorIds` / `recipeIds`, and ANDs
*between* tag types (OR only *within* a tag type). Applying a single chosen
criterion therefore usually leaves the item still not matching.

**Decision (final 2026-08-26): apply the whole filter, with a picker on every
OR'd axis.** The press must satisfy *every* axis — they are AND-joined, so
skipping one leaves the item still not matching — but wherever an axis offers a
choice, the **user** makes it rather than the code:

| Axis | Semantics | Picker |
|---|---|---|
| tags | OR within a type, **AND between types** | one pick **per tag type** present in `filterConfig.tagIds` |
| vendors | OR within `vendorIds` | one pick |
| recipes | OR within `recipeIds` | one pick |

An axis offering exactly one option needs no interaction — pre-select it. The
picker therefore collapses to a plain button on the common single-tag-type shelf,
and only grows UI where a genuine choice exists.

This avoids both bad alternatives: auto-applying *all* of an axis over-assigns
(tagging an item `Frozen` because the shelf happens to filter on it), and
auto-applying the *first* makes an arbitrary choice on the user's behalf.

**Every bucket-2 row on a *satisfiable* filter shelf is actionable**, and the
item always lands on the shelf — the action is never offered in a form that
leaves it still not matching. An earlier draft claimed some rows would get no
button; that was carried over from the rejected "pick one criterion overall"
option and is wrong. (An *unsatisfiable* shelf is the one exception, covered
immediately below — it was not yet a concept when this line was first written.)

**One exception this design did not anticipate, ruled during PR D's
implementation:** a shelf whose `filterConfig` names a vendor or recipe id that
no longer resolves to a live entity is **unsatisfiable outright** — no press
could ever add a deleted vendor or append to a deleted recipe's row, so a
button there would always fail. Such a shelf keeps the inert `groupNote`
instead of `groupAction`; `isFilterConfigSatisfiable` decides this once per
shelf, not per item. A tag axis can never trigger this case — `deriveFilterAxes`
silently drops a dangling tag id rather than treating it as a constraint. See
`2026-08-28-brainstorming-filter-shelf-picker.md` for the ruling record.

## Note — 2026-08-28 (decision reversed)

The "An axis offering exactly one option needs no interaction — pre-select it.
The picker therefore collapses to a plain button on the common single-tag-type
shelf, and only grows UI where a genuine choice exists" paragraph above is
**historical** — left as written, since this section is the record of the
original design, not of current behaviour. The designer reversed the *bypass*
half of that ruling on 2026-08-28: pressing `Add to shelf` on a filter shelf
now **always** opens `ShelfFilterPicksDialog`, regardless of how many options
each axis offers. Their words: "the concept is to provide a chance to double
confirm the tags/vendors/recipes that are about to be applied to the item" —
the dialog is a confirmation step, not only a disambiguation step.

The *pre-selection* half survives untouched: a single-option axis still
renders its radio group with that option already checked, so Confirm is
enabled the moment the dialog opens and the user only has to press it once
more. `ShelfFilterPicksDialog` needed no rendering change at all — only
`ShelfDetailView`'s `groupAction.onAction`, which used to branch on
`open.every((a) => a.options.length === 1)` and apply directly in the
true case, now always calls `setPicksItem(item)`. See
`2026-08-28-brainstorming-filter-shelf-picker.md`'s dated addendum for the
ruling record.

### Empty result → create

When **no global item** matches the query, offer `Create "{query}"`, which in one
press: creates the global `Item`, stocks it at the active location, and applies
the group action.

This is the actual #245 fix: the create affordance now keys off the **global**
catalog, not the twice-filtered visible set, so it cannot mint a duplicate. And
because bucket 3 catches the case that used to look empty, suppressing create no
longer produces a dead end.

Note the asymmetry with the two-step gate: creating is already an explicit,
deliberate act, so it does not need a second confirmation press.

### Cloud mode

Cloud has no `Location` / `ItemStock` backend **yet** — ETBlue: *"location feature
is about to be implemented in cloud very soon."*

So: **no durable cloud-specific code path.** Everything is driven by one
`isStockedHere` predicate behind a **single isolated `isCloud` bypass**. Today
cloud renders bucket 1 + bucket 2 (bucket 2 = all non-group matches, group action
only, no add-to-location button, no gate — there is nothing to gate). When cloud
gains `ItemStock`, deleting the bypass turns on the third section; the feature is
not rewritten.

## Files

**New**
- `hooks/useItemSearchTail.ts` (+ test)
- `components/item/ItemSearchTail/` — `ItemSearchTail.tsx`, `index.ts`,
  `.stories.tsx`, `.stories.test.tsx`. Renders the two divider-led sections and
  the action buttons; takes a `groupAction` descriptor prop so each caller
  supplies its own label + mutation.

**Modified**
- `components/pantry/PantryListView.tsx`
- `components/pantry/ShelfDetailView.tsx` — delete the hand-rolled
  `<p>Not in this shelf</p>` block and its `outsideShelfSearchMatches` memo
- `components/pantry/VendorDetailView.tsx`
- `components/pantry/RecipeDetailView.tsx`
- `routes/shopping/$vendorId.tsx` — `hasExactMatch` must read the **global**
  catalog, not `searchedItems`
- `i18n/locales/en.json`, `i18n/locales/tw.json` — add `common.notInThisList`

## Phasing

Four independently shippable PRs — 5 surfaces × 3 buckets × 6 action variants is
too much for one change. The original three-PR split below was revised
(ETBlue, 2026-08-27) once PR B's planning showed the filter-shelf per-axis
picker was, on its own, roughly as large as the rest of PR B combined — it is
net-new UI needing one sub-picker per tag *type*, and spans two non-atomic
mutation targets (`useUpdateItem` for tags/vendors, `useUpdateRecipe` for
recipe membership). It is split out into its own PR D:

| PR | Scope | Status |
|---|---|---|
| **A** | shared hook + `ItemSearchTail` component + cart page — **closes #245** | ✅ merged (#256) |
| **B** | tail-wiring extraction (`useItemSearchTailWiring`) + flat pantry (bucket 3 only) + shelf detail's **selection** shelves (incl. deleting the off-convention "Not in this shelf" block); filter shelves get an inert `groupNote` as an interim step | ✅ merged (#259) |
| **C** | `useShowStock` extraction (3 hand-written `isCloud \|\| isStockedHere` sites → 5 call sites) + vendor detail + recipe detail — all five surfaces now wired | ✅ merged (#266) |
| **D** | filter-shelf per-axis picker (swaps `groupNote` → `groupAction` on filter shelves; nothing else about the wiring changes) | ✅ merged (#270) |
| **D-1** | cloud atomicity — one `prisma.$transaction` resolver replacing D's two sequential Apollo round-trips | ✅ #272 (issue #269) |

See `2026-08-27-unified-item-search-plan-b.md` for PR B's own scope-decision
record and implementation detail, and
`2026-08-27-unified-item-search-plan-c.md` for PR C's — including two rulings
this design did not cover (`isUnsorted` pseudo-groups get an inert `groupNote`
rather than silence; neither view passes `sortTail`) and four deferred gaps PR
C surfaced without fixing. See `2026-08-28-unified-item-search-plan-d.md` for
PR D's implementation detail and the unsatisfiable-axis ruling this design did
not anticipate, and `2026-08-28-unified-item-search-plan-d1-cloud-transaction.md`
for the now-shipped cloud-atomicity follow-up (issue #269).

### Carried forward from PR A's review — start PR B with these

**All five items below are done as of PR B's ship.** Kept for the historical
record; see `hooks/CLAUDE.md` and `components/CLAUDE.md` for where the
resulting hook and `hasVisibleTail` export are documented, and
`2026-08-27-unified-item-search-plan-b.md` for the task-by-task record.

1. **Open PR B by extracting the tail wiring, not by making a fifth copy.** Roughly
   45 of the ~180 lines PR A added to `routes/shopping/$vendorId.tsx` are
   view-agnostic: `sortTail`, the `tailPendingId` single-flight and its clear
   callback, `handleAddToLocation`, `canAddToLocation`, the `addToLocationAction`
   descriptor, and `renderTailItemCard`. Only `groupAction` / `groupNote` genuinely
   differ per view. A `useItemSearchTailWiring({ inGroupIds, query, groupAction })`
   returning `{ tailProps, renderedCount }` collapses all of it, and the existing
   `renderItem` prop already lets each page keep its own card configuration.
   Deliberately **not** done in PR A: one caller is the wrong moment to abstract.
2. **Fold the visibility predicate into that extraction.** The page's
   `renderedTailCount` re-derives `ItemSearchTail`'s own "is this section visible"
   logic. The two agree today, and PR A's re-review proved it, but that is a second
   source of truth about to be copied four more times. Export a
   `hasVisibleTail(props)` from the component module and have both the component and
   every page call it.
3. **`useItemSearchTail` calls `useItems()` unconditionally**, even for a blank
   query. The cart page already called it, so PR A pays nothing — but the four
   pantry surfaces read `useStockedItems()` (a different query key), so each gains a
   full `getAllItems()` read per visit, searching or not. Decide deliberately in PR
   B's plan: accept it (one IndexedDB read, likely fine) or let the hook take
   `items` as a parameter.
4. **`renderTailItemCard` deliberately passes no `mode`.** `mode="shopping"` makes
   `ItemCard` treat the row as amount-controllable, which warns when
   `onAmountChange` is absent and reserves a 7rem `mr-28` lane for controls a tail
   row can never render. Do not add it back.
5. **No test covers the "vendor not yet resolved / deleted vendor" window** that
   PR A's `vendor` gate guards; it was verified by inspection. Worth a test when
   PR B touches this wiring.

## Testing

**Mutation checks are mandatory** (see root `CLAUDE.md`, "Proving a Test Works").
The canonical trap applies directly here: **every location-scoped test needs a
fixture stocked only at *another* location.** With one location, "items stocked
here" and "all items" return the same set, and every bucket-2/bucket-3 assertion
passes against an implementation that ignores location entirely.

Specifically prove, by deleting the behaviour and watching the test go red:

- an item stocked only at location B appears in bucket 3, not bucket 1
- `Add to {location}` moves it to bucket 2 (or bucket 1 when already in-group)
- the group button is a **second** press — one press does not do both
- create is offered only when **no global** item matches (the #245 regression guard)
- the filter-shelf press satisfies **every** axis of `filterConfig` (one tag per
  type, one vendor, one recipe) — a fixture with two tag types proves it, a
  single-type one does not
- a single-option axis pre-selects and needs no interaction

**E2E:** derive `--grep` from spec **file** names, not route names. Pantry group
views are covered by `shelves|vendors-group|recipes-group`; add `shopping`,
`items`, and always `|a11y`.

## Open items

Decided without asking — easy to veto:

1. `common.notInThisList` as the new divider key.
2. `defaultAmount: consumeAmount || 1` (matches
   `routes/settings/recipes/$id/items.tsx:230`).
3. Pantry Add button / `NewItemDialog` retained as the browse path.
4. The three-PR phasing.

Genuinely unresolved:

None — every question raised during brainstorming is resolved.

Resolved 2026-08-26:

- **Vendors and recipes get the same picker as tags** — confirmed by ETBlue, so
  all three OR'd axes are chosen by the user rather than inferred.
- **Settings assignment tabs are out of scope** — confirmed by ETBlue.
  (`/settings/{tags,vendors,recipes,shelves}/$id/items` stay location-free per
  #247 part 2.)
- **Bucket 2 ordering** — no longer a question: every bucket-2 row is actionable
  on every surface, so there are no inert rows to sort around. Page sort stands.
- **The no-vendor cart renders all three sections, with an inert middle one** —
  ruled by ETBlue. Order: vendorless-stocked-here (the cart's own list), then
  vendored-stocked-here, then global. The middle section carries **explanatory
  text naming the vendor groups that hold the item**, not a button: joining
  this group would mean *stripping* every vendor from the item — destructive,
  not additive. Bucket 3 is unrestricted (`Add to {location}` is
  group-agnostic); after that press the item lands in section 1 if vendorless
  or section 2 if vendored, which falls out of the existing predicates.
- **In-group-but-not-stocked-here going straight from bucket 3 to bucket 1** is
  confirmed correct (ETBlue, 2026-08-26). It is a consequence of the
  `inGroupIds` contract — callers pass the ids the page ALREADY renders, which
  are already location-scoped — not a special case anyone has to code.
