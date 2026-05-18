# Bug: Shelf Stock Status Counts Include Inactive Items

## Bug Description

On the `/shelves` page, the "X out of stock" and "Y low stock" badge counts shown in shelf cards do not match the actual item status badges rendered in those cards.

- Items rendered in **red** should be counted as "out of stock"
- Items rendered in **yellow** should be counted as "low stock"
- **Inactive items** (those with `targetQuantity === 0`) should **not** be counted

## Root Cause

Two separate code paths handle stock status with inconsistent filtering:

1. **Count functions** (`src/routes/shelves/index.tsx` lines 83–94, 127–134):
   - `getOutOfStockCount()` counts items where `getCurrentQuantity(item) === 0` — **includes inactive items**
   - `getLowStockCount()` counts items where `0 < qty <= refillThreshold` — **includes inactive items**
   - Same issue in `getUnsortedOutOfStockCount()` and `getUnsortedLowStockCount()`

2. **Render logic** (`src/components/item/ItemCard/ItemCard.tsx` line 106):
   - Inactive items always render with `'default'` variant (not red/yellow) via `isInactive(item)` check
   - So an inactive item with `qty === 0` is counted as "out of stock" but renders as normal

The count logic does not call `isInactive(item)`, so inactive items inflate the badge numbers.

## Fix Applied

Added `!isInactive(item) &&` as the first condition in all four count functions in `apps/web/src/routes/shelves/index.tsx`:
- `getOutOfStockCount()` (line ~83)
- `getLowStockCount()` (line ~89)
- `getUnsortedOutOfStockCount()` (line ~127)
- `getUnsortedLowStockCount()` (line ~130)

Also added `isInactive` to the import from `@/lib/quantityUtils`.

## Test Added

`apps/web/src/routes/shelves/index.test.tsx` — 6 integration tests covering:
- Selection shelf out-of-stock count excludes inactive items
- Selection shelf out-of-stock count still includes active items at zero qty
- Selection shelf low-stock count excludes inactive items
- Selection shelf low-stock count still includes active low-stock items
- Unsorted shelf out-of-stock count excludes inactive items
- Unsorted shelf low-stock count excludes inactive items

## PR / Commit

*TBD*
