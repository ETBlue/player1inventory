---
title: Bug — BulkCreateShelves fails with __typename in filterConfig and missing createdAt/updatedAt
date: 2026-04-29
area: shelf / import
---

## Bug Description

Importing a backup in cloud mode fails for shelves with two GraphQL validation errors:

1. `Field "__typename" is not defined by type "FilterConfigInput"` — Apollo adds `__typename` to
   nested objects when fetching from cloud; `toShelfInput` passes `filterConfig` as-is without
   stripping it.

2. `Field "createdAt" of required type "String!" was not provided` (same for `updatedAt`) — shelves
   created before timestamp tracking was added don't have these fields in the backup JSON;
   `toShelfInput` uses the value directly and passes `undefined` to a required field.

## Root Cause

`toShelfInput` in `apps/web/src/lib/importData.ts`:

- **`filterConfig`**: passed as `shelf.filterConfig as {...} | undefined` — does not strip
  `__typename` from the nested object. Any shelf exported from cloud mode will have
  `{ __typename: "FilterConfig", tagIds: [...], vendorIds: null, recipeIds: null }`.

- **`createdAt`/`updatedAt`**: when `shelf.createdAt` is `undefined` (absent from the JSON),
  `shelf.createdAt as string` evaluates to `undefined`. `ShelfInput.createdAt` is `String!`
  (required), so the server rejects it.

## Fix Applied

`toShelfInput` in `apps/web/src/lib/importData.ts` was updated to:

1. **Strip `__typename` from `filterConfig`**: Instead of passing `shelf.filterConfig` as-is, the
   function now explicitly reconstructs the object with only `tagIds`, `vendorIds`, and `recipeIds`,
   discarding any other fields (including `__typename`). Also normalizes `null` array values to
   `undefined` for consistency with the earlier `vendorIds` null fix.

2. **Fallback timestamps**: `createdAt` and `updatedAt` now use `new Date().toISOString()` as a
   fallback when the value is `undefined` (absent from old backup JSON), preventing `undefined`
   from being passed to the required `String!` GraphQL field.

## Test Added

Two new tests added to `apps/web/src/lib/importData.test.ts` in a `describe('toShelfInput')` group:

- `'strips __typename from filterConfig'` — verifies `__typename` is absent from the output
  `filterConfig` object while valid fields (`tagIds`) are preserved.
- `'falls back to current ISO date when createdAt is missing'` — verifies that a shelf input
  without `createdAt`/`updatedAt` fields produces non-empty, parseable ISO date strings.

## PR / Commit

- Commit: `fix(shelf): strip __typename from filterConfig and fallback missing timestamps in toShelfInput`
- Part of feature branch `feature/shelf-data-ops`
