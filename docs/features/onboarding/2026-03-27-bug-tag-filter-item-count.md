# Bug: Tag filter subtag item counts change when parent tag is selected

**Date:** 2026-03-27
**Branch:** feature/onboarding

---

## Bug description

On the Pantry page, opening the filter menu and expanding a tag type dropdown shows item counts per tag. When the user selects a parent tag, the item counts for all subtags incorrectly change to match the parent tag's count.

**Steps to reproduce:**
1. Go to Pantry page
2. Open filter menu
3. Open a tag type dropdown that contains nested tags
4. Observe correct per-tag item counts (e.g. Food: 10, Vegetables: 5, Fruits: 4)
5. Select the parent tag ("Food")
6. Observe: all subtag counts now equal the parent count (Vegetables: 10, Fruits: 10, Dairy: 10)

**Expected:** subtag counts remain unchanged after selecting parent

---

## Root cause

In `apps/web/src/lib/filterUtils.ts`, `calculateTagCount()` builds a simulated filter state by **appending** the tag being counted to the existing filter state for that tag type:

```ts
const simulatedFilters = {
  ...currentFilters,
  [tagTypeId]: [...(currentFilters[tagTypeId] || []), tagId],
}
```

When a parent tag is already in `currentFilters[tagTypeId]`, `filterItems()` expands it via `getTagAndDescendantIds()` to include all its descendants. Because the parent already covers all subtags, appending any subtag to the simulated filter has no narrowing effect — every subtag returns the same count as the parent.

**Fix:** when simulating the count for a tag, replace the tag type's selection entirely with just `[tagId]` instead of appending to the existing selection. This gives the count "how many items have this tag (and its descendants), given all other active filters" — independent of what else is selected within the same tag type.

---

## Fix applied

In `apps/web/src/lib/filterUtils.ts`, `calculateTagCount()`: replaced `[...(currentFilters[tagTypeId] || []), tagId]` with `[tagId]` so each tag's count is calculated independently of other selections within the same tag type.

## Test added

`apps/web/src/lib/filterUtils.test.ts` — two new tests in `describe('calculateTagCount with nested tags')`:
- `returns correct count for subtag when parent tag is selected`
- `returns correct count for sibling subtag when parent tag is selected`

## PR / commit

Commit `8946f68` on `feature/onboarding`
