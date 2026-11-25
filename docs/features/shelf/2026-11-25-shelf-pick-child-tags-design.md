# Design: pick a child tag when adding to a filter shelf

Date: 2026-11-25. Branch `feature/shelf-pick-child-tags`, from `develop` at `333dc2ca`.
Brainstorming: `2026-11-25-brainstorming-shelf-pick-child-tags.md`.

## Summary

1. **Where it sits.** Adding an item to a filter shelf asks for the tag the rule needs. A rule
   like "Category: Dairy" offers only "Dairy", so the item gets the broad tag, not "Milk".
2. **Relations.** Web only. No server or schema change. Independent of the two open branches
   (`feature/inventory-log-layout`, `feature/cart-amount-dialog`).
3. **What the user gets** once merged and deployed: the dialog lists the named tag and all its
   child tags, indented; pick the exact one. The item still shows on the shelf, because the
   shelf already counts child tags.
4. **What the developer gets:** the axis options carry a `depth`, so the dialog and its tests
   can tell a child option from a named one.

## The rule

- `deriveFilterAxes`: for a tag axis, the options are each tag the rule names, each followed
  by its descendants in tree order, with a `depth` (0 for a named tag, 1 for a child, …).
- A tag that appears twice (a child that the rule also names) is listed once, at its place
  under its ancestor.
- Children are ordered the same way the tag settings page orders them. The implementer picks
  the existing sort helper and names it.
- `metBy` and `matchesFilterConfig` do not change.
- `defaultPicksFor`: a tag axis is picked by default when the rule names ONE tag of that type
  (its depth-0 option), even when that tag has children. Vendor and recipe axes: as today
  (only when there is one option).
- The dialog indents each radio row by its `depth`. Names keep `capitalize`.

## Tests

- `shelfUtils`: children and grandchildren listed in order with depths; one named tag is the
  default even with children; a child also named is listed once; vendor and recipe unchanged;
  the "agrees with matchesFilterConfig" block still passes.
- Dialog: rows indented by depth; picking a child sends that child's id in `tagIds`.
- Mutation checks: drop the descendants from the options → red; default pick back to
  "exactly one option" → red.
- E2E, local and cloud: on a filter shelf whose rule names a parent tag, add an item with a
  child tag, and it shows on the shelf with that child tag. Axe scans of the dialog in light and
  dark.

## Not in this design

- The Filters tab of the shelf settings page (it already lists every tag).
