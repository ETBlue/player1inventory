# Sort by Last Purchase Date — Design

## Overview

Replace the "Updated" sort option (which sorts by `item.updatedAt` — changes on every form save) with a "Purchased" sort option that sorts by the most recent inventory log entry with a positive delta. This better reflects user intent: seeing which items were restocked most recently.

## Current Behavior

- Sort field `'updatedAt'` sorts by `item.updatedAt`
- Label in toolbar: **"Updated"**
- `item.updatedAt` changes on every save (name edits, quantity adjustments, settings changes) — not meaningful as a "recency of purchase" signal

## New Behavior

- Sort field `'purchased'` replaces `'updatedAt'`
- Label in toolbar: **"Purchased"**
- Sorts by the most recent `inventoryLog` entry where `delta > 0` (i.e. items were added)
- Items with no purchase history sort last (treated as least recently purchased)
- Default direction: descending (most recently purchased first)

## Architecture

```
sortItems(items, quantities, expiryDates, purchaseDates, sortBy, direction)
                                                ↑
                          allPurchaseDates Map<string, Date | null>
                          built by pantry page from getLastPurchaseDate()
```

The pantry page already calls `getLastPurchaseDate()` per item inside the `allExpiryDates` query. We extract this into a separate `allPurchaseDates` query so it can be passed independently to `sortItems`.

## Files Changed

**`src/lib/sortUtils.ts`**
- Rename `SortField` union: `'updatedAt'` → `'purchased'`
- Add `purchaseDates: Map<string, Date | null>` parameter to `sortItems()`
- Replace `updatedAt` case with `purchased` case:
  - `null` dates sort last (comparison treats null as epoch 0)
  - Respects `sortDirection` like all other fields

**`src/routes/index.tsx`**
- Add `allPurchaseDates` query (`Map<string, Date | null>`) using `getLastPurchaseDate()` per item
- Pass `allPurchaseDates` to `sortItems()`

**`src/lib/sessionStorage.ts`**
- Update `loadSortPrefs()` to validate stored `sortBy` against valid fields
- If stored value is the old `'updatedAt'`, migrate it to `'purchased'`

**`src/components/PantryToolbar.tsx`**
- Update label map: `updatedAt: 'Updated'` → `purchased: 'Purchased'`
- Update button: `sortBy === 'updatedAt'` → `sortBy === 'purchased'`
- Update onClick: `'updatedAt'` → `'purchased'`

**`src/lib/sortUtils.test.ts`**
- Update tests: rename field references, add test for null purchase date sorting last

**`src/lib/sessionStorage.test.ts`**
- Update tests: `'updatedAt'` → `'purchased'`

## Edge Cases

- **Stored user preference `'updatedAt'`**: `loadSortPrefs()` migrates stale stored value to `'purchased'` so existing users don't get an invalid sort field after the rename
- **No purchase history**: `null` dates always sort last, regardless of direction
- **Performance**: `getLastPurchaseDate()` is already called per item for expiry calculation; the new query reuses the same DB function with no additional reads if scheduled concurrently
