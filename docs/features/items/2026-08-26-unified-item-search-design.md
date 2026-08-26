# Unified location-aware item search — design

**Date:** 2026-08-26
**Issue:** #245 (filed as a cart-page duplicate-`Item` bug; scope widened here)
**Branch:** `feature/unified-item-search`
**Status:** ✅ **Design approved by ETBlue 2026-08-26.** **PR A shipped** (shared
hook + `ItemSearchTail` + cart page — closes #245); see
`2026-08-26-unified-item-search-plan-a.md`. PRs B (flat pantry + shelf detail)
and C (vendor + recipe detail) remain. Do not re-litigate the decisions below.
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

## Current state (verified by reading the code, 2026-08-26)

| Surface | items source | search scope | tail section | create-from-search |
|---|---|---|---|---|
| Pantry flat (`PantryListView`) | `useStockedItems` | stocked-here | — | opens `NewItemDialog` — **already correct** |
| Shelf detail (`ShelfDetailView`) | `useStockedItems` | in-shelf ∩ here | hand-rolled "Not in this shelf" | inline `createItem` + add to shelf |
| Vendor detail (`VendorDetailView`) | `useStockedItems` | vendor ∩ here | — | — |
| Recipe detail (`RecipeDetailView`) | `useStockedItems` | recipe ∩ here | — | — |
| Cart (`shopping/$vendorId`) | `useItems` + `isStockedHere` | vendor ∩ here | — | inline `createItem` ← **#245** |

Key existing pieces this design builds on, rather than inventing:

- **`NewItemDialog`** already implements the whole add-existing-vs-create
  decision (combobox over `useItems()`, `useAddItemToLocation` for existing,
  `useCreateItem` for new, with `stockId` deciding which). This design moves that
  logic inline; the dialog stays as the browse path.
- **`ListSectionDivider`** + `common.notStockedHere`
  (`"{{count}} not stocked here"` / `"此據點無庫存的 {{count}} 項"`) is the
  established shared idiom, already used by the pantry group views, the shopping
  vendor list and the cooking recipe list.
- **`ShelfDetailView`'s "Not in this shelf"** is a hand-rolled
  `<p className="text-xs …">`, **not** a `ListSectionDivider` — already
  off-convention, and folded into the shared component by this work.
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

**Every bucket-2 row on a filter shelf is actionable**, and the item always lands
on the shelf — the action is never offered in a form that leaves it still not
matching. An earlier draft claimed some rows would get no button; that was
carried over from the rejected "pick one criterion overall" option and is wrong.

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

Three independently shippable PRs — 5 surfaces × 3 buckets × 6 action variants is
too much for one change:

| PR | Scope |
|---|---|
| **A** ✅ | shared hook + `ItemSearchTail` component + cart page — **closes #245** |
| **B** | flat pantry + shelf detail (incl. deleting the off-convention block) |
| **C** | vendor detail + recipe detail |

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
