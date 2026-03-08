# Design: Mark Item as Inactive When Target Quantity Is Zero

Date: 2026-03-08

## Problem

Currently, an item is marked inactive only when **both** `targetQuantity === 0` and `refillThreshold === 0`. This means an item with `targetQuantity === 0` but `refillThreshold > 0` is treated as active — and can show low-stock or error styling — even though the user has expressed no desire to keep stock of it.

## Decision

Mark an item as inactive when `targetQuantity === 0`, **regardless** of `refillThreshold`. When inactive, all stock status warnings are suppressed visually; the stored `refillThreshold` value is preserved but ignored.

## Changes

### 1. `src/lib/quantityUtils.ts` — `isInactive()`

```ts
// before
return item.targetQuantity === 0 && item.refillThreshold === 0

// after
return item.targetQuantity === 0
```

### 2. `src/components/ItemCard.tsx` — card variant

```ts
// before
variant={status === 'ok' ? 'default' : status}

// after
variant={isInactive(item) || status === 'ok' ? 'default' : status}
```

Prevents the card from rendering with an error/warning left indicator bar when the item is inactive.

### 3. Tests

- `src/lib/quantityUtils.test.ts`: update `isInactive()` tests to cover `targetQuantity=0, refillThreshold>0` → inactive
- `src/components/ItemCard.test.tsx`: add test for inactive item with `refillThreshold > 0` — expects inactive progress bar and no error/warning card variant

## Non-Changes

- `refillThreshold` is **not** zeroed out — preserved as-is, just ignored when inactive
- No data migration needed
- All consumers of `isInactive()` (pantry active/inactive split, shopping list, etc.) automatically get the new behavior
