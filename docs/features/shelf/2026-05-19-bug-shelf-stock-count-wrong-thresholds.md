# Bug: Shelf Stock Status Counts Use Wrong Threshold Conditions

## Bug Description

On the `/shelves` page, the "X out of stock" and "Y low stock" badge counts on shelf cards don't match the red/yellow item colors rendered in those cards. Observed on the unsorted shelf:
- 4 items rendered red → badge shows "2 out of stock"
- 2 items rendered yellow → badge shows "5 low stock"

## Root Cause

The four count functions in `src/routes/shelves/index.tsx` use different conditions than `getStockStatus()` in `src/lib/quantityUtils.ts`, which drives item card colors.

`getStockStatus()` (the source of truth for rendering):
```ts
if (refillThreshold > 0 && quantity === refillThreshold) return 'warning'  // yellow
if (quantity < refillThreshold) return 'error'                              // red
return 'ok'
```

Count functions (wrong):
- Out of stock: `qty === 0` — misses items where `0 < qty < refillThreshold` (renders red but not counted)
- Low stock: `qty > 0 && qty <= refillThreshold` — includes items where `qty < refillThreshold` (renders red but counted as low stock)

The divergence causes under-counting of out-of-stock and over-counting of low-stock.

Same mismatch exists in all four functions:
- `getOutOfStockCount()` (~line 83)
- `getLowStockCount()` (~line 89)
- `getUnsortedOutOfStockCount()` (~line 127)
- `getUnsortedLowStockCount()` (~line 130)

## Fix Applied

Updated all four count functions in `apps/web/src/routes/shelves/index.tsx` to mirror `getStockStatus()`:

- `getOutOfStockCount()`: `getCurrentQuantity(item) === 0` → `getCurrentQuantity(item) < item.refillThreshold`
- `getLowStockCount()`: `qty > 0 && qty <= item.refillThreshold` → `item.refillThreshold > 0 && qty === item.refillThreshold`
- `getUnsortedOutOfStockCount()`: same change as `getOutOfStockCount`
- `getUnsortedLowStockCount()`: same change as `getLowStockCount`

## Test Added

Added 4 new regression tests in `apps/web/src/routes/shelves/index.test.tsx`:

1. **Selection shelf out-of-stock**: `qty=1, threshold=3` and `qty=0, threshold=3` both count as out of stock
2. **Selection shelf low-stock**: `qty=1, threshold=3` counts as out of stock (not low stock); `qty=3, threshold=3` counts as low stock
3. **Unsorted shelf out-of-stock**: `qty=1, threshold=3` counts as out of stock
4. **Unsorted shelf low-stock**: `qty=1, threshold=3` is out of stock; `qty=3, threshold=3` is low stock

Also corrected 3 existing tests whose data used `qty=1, threshold=2` as "low stock" — that case is now correctly classified as out of stock, so the fixture was updated to `qty=2, threshold=2` (the actual yellow/warning case).

## PR / Commit

Commit: `5d3a63fe` — fix(shelf): align stock count conditions with getStockStatus logic
PR: *TBD*
