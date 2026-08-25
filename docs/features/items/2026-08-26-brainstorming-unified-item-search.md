# Brainstorming — Unified location-aware item search (issue #245)

**Date:** 2026-08-26
**Participants:** ETBlue, Claude
**Outcome:** design approved in outline; spec at `2026-08-26-unified-item-search-design.md`
**Branch:** `feature/unified-item-search`

## Origin

Issue #245 is filed as a narrow bug — create-from-search on the vendor cart page
can mint a **second global `Item`** for a name that already exists, because the
"does this already exist?" check runs over the page's twice-filtered visible set
(vendor filter, then the `isStockedHere` location gate added by #244) instead of
the global catalog.

The issue itself already argued that the obvious fix is wrong: suppressing the
create button when a global name matches trades a duplicate for a **dead end** —
at a location where Milk is not stocked you would search `Milk`, see nothing in
the list (filtered out), and get no way to create it either. The issue proposed
an "add it to this location" affordance instead, and deferred the design.

ETBlue opened the session by widening that: rather than patch the cart page,
**unify location-aware item search across every item list**.

## Questions asked and answered

### Q1 — How should the search-result tail be structured?

Offered: one merged bucket with self-describing buttons / two buckets, one per
axis / one bucket, location axis only.

**Not answered as posed.** ETBlue supplied constraints instead:

1. *"for shelves, only selection type shelves offer manual item add. filter type
   shelves don't allow user to add items manually."* — confirmed in code:
   `handleAddToSelectionShelf` bails unless `shelf.type === 'selection'`, and the
   add button only renders for selection shelves.
2. *"the 'not stocked' text should align with the same group title text in other
   item list UI (afaik it was just implemented not long ago, as a shared
   component)"* — this is `common.notStockedHere` rendered through
   `ListSectionDivider`; already used by the pantry group views, the shopping
   vendor list and the cooking recipe list.
3. *"use different text for 'add to shelf' and 'add to location' buttons so user
   knows those 2 actions are different."*

### Q1' — Re-asked with the filter-shelf constraint folded in

**Also not answered as posed.** ETBlue superseded the whole question with a
concrete three-section design (see "The design ETBlue specified" below), which is
what the spec now records. The two-bucket / one-bucket framing was abandoned.

### Q2 — Filter shelves and `matchesFilterConfig`'s AND semantics

`matchesFilterConfig` ANDs across tags / vendors / recipes, and ANDs *between*
tag types (OR only *within* a tag type). So applying one chosen criterion often
leaves the item still not matching — the user clicks and nothing appears.

Offered: pick one per required group (popover) / apply the whole filter, no
picker / no group action on filter shelves.

**Answer: apply the whole filter, no picker.** One button applies every criterion
in `filterConfig` — first tag per type (within-type is OR, so one suffices), all
`vendorIds` and all `recipeIds` (those axes are AND-joined). Deterministic: the
item always lands on the shelf.

### Q3 — Cloud mode

Cloud has no `Location` / `ItemStock` backend, so "in this location" and "not
stocked here" are meaningless there.

Offered: two sections, group axis only / no tail in cloud.

**Not answered as posed.** ETBlue: *"location feature is about to be implemented
in cloud very soon. FYI."*

**Interpretation adopted:** do not build a durable cloud-specific code path.
Drive everything off one `isStockedHere` predicate with a **single** isolated
`isCloud` bypass, so that when cloud gains `ItemStock` the third section starts
working by deleting the bypass — not by rewriting the feature.

## The design ETBlue specified

Given verbatim, lightly reformatted:

**Pantry > shelf pages**
- list in-shelf items first, then in-location items, then global items last
- in-location items: for **selection** shelf, allow adding to the shelf; for
  **filter** shelf, allow applying the corresponding tags/vendors/recipes
- global items: allow adding the item to the current location. Once added, the
  item moves from global to in-location. The user must click **again** to add it
  to the shelf — *"this is for double confirm — adding items to location should
  be prudent and explicit, not easy to achieve by accident"*
- empty search result: allow creating a new global item **and** adding it to the
  current location **and** the current shelf

**Pantry > vendor / recipe pages** — same idea.

**Shopping > cart pages**
- in-vendor items first, then in-location, then global
- in-location items: allow applying the current vendor to the item
- global items: add to location, then a second click applies the vendor
- empty search result: create global item + add to location + apply the vendor

## Decisions made without asking (flagged for veto)

- **New i18n key `common.notInThisList`** (`"{{count}} not in this list"`) for the
  middle divider — deliberately group-agnostic so one string serves all five
  pages. `common.notStockedHere` is reused verbatim for the last section.
- **`defaultAmount: consumeAmount || 1`** when adding to a recipe, matching the
  existing precedent at `routes/settings/recipes/$id/items.tsx:230`.
- **The pantry Add button / `NewItemDialog` stays** as the *browse* path
  alongside inline search.
- **Phasing into three PRs** (see spec) rather than one large change.

## Status at handoff

The design was presented in full and **approval was not yet given** — the session
was checkpointed for context before ETBlue responded. The spec is written on the
assumption it is directionally right; re-confirm before implementing.
