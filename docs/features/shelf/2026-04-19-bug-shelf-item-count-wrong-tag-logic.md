# Bug: Shelf Item Count Uses Wrong Tag Filter Logic

**Date:** 2026-04-19
**Branch:** feature/shelf-view

## Bug Description

Filter shelves and the unsorted shelf show incorrect item counts in the shelf list. Only selection shelves are correct. The count is inflated for filter shelves that have tags from multiple tag types.

## Root Cause

The `getItemCount()` and `getUnsortedCount()` helpers in `apps/web/src/routes/shelves/index.tsx` and `apps/web/src/routes/settings/shelves/index.tsx` use a simple OR across all `tagIds`:

```ts
item.tagIds.some((id) => tagIds?.includes(id))
```

But the shelf detail page (`$shelfId.tsx`) uses `matchesFilterConfig()`, which implements **AND-between-tag-types, OR-within-type** logic (with descendant expansion). This matches the canonical tag filter behavior used everywhere else.

For a filter shelf with tags from two types (e.g., Location=Fridge AND Category=Dairy), the list count shows items matching ANY of those tags (OR), while the detail page shows items matching ALL types (AND). The unsorted count has the same wrong tag logic in its filter-shelf exclusion loop.

## Fix Applied

Extracted `matchesFilterConfig` from `apps/web/src/routes/shelves/$shelfId.tsx` into a new shared utility `apps/web/src/lib/shelfUtils.ts`. Both `shelves/index.tsx` and `settings/shelves/index.tsx` now call `matchesFilterConfig(item, filterConfig, recipes, tags)` in `getItemCount()` and `getUnsortedCount()`, replacing the hand-rolled OR-only tag check.

## Test Added

No test added — helpers are closures over component query data; integration test coverage deferred.

## PR / Commit

`e6cca8e` — fix(shelves): extract matchesFilterConfig to shelfUtils, use it in shelf list count helpers
