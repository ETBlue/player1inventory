# Bug: Shelf Item Count Missing Recipe Filter

**Date:** 2026-04-19
**Branch:** feature/shelf-view

## Bug Description

Shelf list pages display incorrect item counts for filter shelves that have `recipeIds` configured. The count is higher than the actual filtered result because the recipe filter is silently ignored during count computation.

## Root Cause

Both `getItemCount()` helpers in `apps/web/src/routes/shelves/index.tsx` and `apps/web/src/routes/settings/shelves/index.tsx` extract only `tagIds` and `vendorIds` from `filterConfig`, ignoring `recipeIds`. The same omission exists in `getUnsortedCount()` where filter-matched items are computed. Neither file imports `useRecipes`.

The canonical filter pipeline (`filterItems` → `filterItemsByVendors` → `filterItemsByRecipes` from `@/lib/filterUtils`) applies all three, but the shelf list count helpers skip the third step.

## Fix Applied

Added `useRecipes` hook and `recipeIds` extraction in both `apps/web/src/routes/shelves/index.tsx` and `apps/web/src/routes/settings/shelves/index.tsx`. Both `getItemCount()` and `getUnsortedCount()` now include recipe matching alongside tag and vendor matching.

Recipe matching pattern:
```ts
const matchesRecipe =
  !hasRecipeFilter ||
  recipes.some(
    (r) => recipeIds?.includes(r.id) && r.items.some((ri) => ri.itemId === item.id)
  )
```

## Test Added

No integration test added — the helpers are closures over component query data; test coverage deferred.

## PR / Commit

`1e54033` — fix(shelves): include recipeIds in shelf item count and unsorted count helpers
