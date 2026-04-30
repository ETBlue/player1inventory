---
title: Bug — vendorIds null crash after import in shelf filter
date: 2026-04-21
area: shelf / import
---

## Bug Description

After importing a JSON backup in offline mode, the pantry page crashes:
```
TypeError: can't access property "length", vendorIds is null
    matchesFilterConfig shelfUtils.ts:45
```

## Root Cause

Two-part gap:

1. **`importData.ts` — `toItemInput()` (line ~139):** `vendorIds` is cast without null normalization (`item.vendorIds as string[] | undefined`), while `tagIds` correctly uses `(item.tagIds ?? [])`. Backup files that store `vendorIds: null` for vendor-less items are imported as-is, storing `null` in IndexedDB.

2. **`shelfUtils.ts:45` — `matchesFilterConfig()`:** Uses `item.vendorIds?.includes(vid)` which guards against `undefined` but not `null`. When `vendorIds` is `null`, the check throws.

The bug was introduced before the shelf feature in `toItemInput()`, but only surfaces once filter shelves exist (they call `matchesFilterConfig` on every item).

## Fix Applied

Two-part fix:

1. **`apps/web/src/lib/importData.ts` — `toItemInput()`:** Changed `item.vendorIds as string[] | undefined` to `item.vendorIds != null ? (item.vendorIds as string[]) : undefined`. This converts `null` to `undefined`, consistent with how optional fields are handled elsewhere (e.g. `tagIds` uses `?? []`).

2. **`apps/web/src/lib/shelfUtils.ts` — `matchesFilterConfig()`:**
   - Added null-safe locals `safeTagIds`, `safeVendorIds`, `safeRecipeIds` using `?? []` on the destructured values so that `null` fields in `filterConfig` (from backed-up shelf JSONs) are treated as empty arrays.
   - Changed `item.vendorIds?.includes(vid)` to `(item.vendorIds ?? []).includes(vid)` to guard against `null` on the item side too.

## Test Added

- `apps/web/src/lib/importData.test.ts`: `toItemInput — null normalization > toItemInput normalizes vendorIds null to undefined`
- `apps/web/src/lib/shelfUtils.test.ts` (new file): Full `matchesFilterConfig` test suite including:
  - `does not throw and returns false when item.vendorIds is null`
  - `does not throw and returns false when item.vendorIds is undefined`
  - `does not throw when filterConfig.vendorIds is null (imported backup shelf)`

## PR / Commit

Part of feature branch `feature/shelf-data-ops`
