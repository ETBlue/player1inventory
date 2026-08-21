# Bug: a selection shelf's item count ignored the active location

**Date:** 2026-08-21
**Area:** locations / pantry shelf group view
**Found during:** the unified group-visibility work
([design](./2026-08-21-design-unified-group-visibility.md))

## Description

On the pantry shelf group view (`/?groupBy=shelf`), a **selection** shelf's
card reported a count that included items stocked in *other* locations. Every
other number on the same card — the health counts, the pack totals, the
active count — was already location-scoped, so the card contradicted itself:
a shelf holding one item here and one in another location advertised
`1 / 2 active`.

The unified group-visibility work made it visible rather than merely wrong: a
selection shelf whose items are all stocked elsewhere now sorts below the
"N not stocked here" divider, where it displayed a **non-zero** count. The
feature appeared to contradict itself on screen.

## Root cause

`ShelfGroupView.getItemCount()` re-implemented the shelf→items resolution
instead of reusing `getShelfItems()`, and its selection branch returned the
raw id list length:

```ts
if (shelf.type === 'selection') {
  return shelf.itemIds?.length ?? 0
}
```

`shelf.itemIds` is a global list of item ids — it has no knowledge of which
of those items have an `ItemStock` row in the active location.
`getShelfItems()` resolves the same ids against `useStockedItems()`, which is
already location-scoped, and was already the basis of every other count on
the card. The two functions' filter branches were otherwise equivalent, so
the duplication bought nothing and only the selection branch diverged.

## Fix applied

`getItemCount` now delegates: `getShelfItems(shelfId).length`. The filter-shelf
and no-config branches are unchanged in behaviour (they were already
equivalent to resolving through `getShelfItems`); only the selection branch
changes, and it changes to the location-scoped answer.

The partition comment that warned "`getItemCount` is deliberately NOT the key"
is removed with the hazard it described.

## Test added

`apps/web/src/components/pantry/ShelfGroupView.test.tsx` —
`"a selection shelf's item count only counts items stocked in the active
location"`. It seeds a mixed shelf (one item here, one only in Cabin) and a
shelf holding only Cabin items, and asserts `1 / 1 active` and `0 / 0 active`
respectively, with the second shelf below the divider. Mutation-checked:
restoring the `itemIds.length` branch turns it red.

## PR / commit

Commit `fix(pantry): scope selection-shelf item count to the active location`,
on the same branch as the unified group-visibility work.
