# Design: Items — Dual Unit Conversion Recipe Default Update

**Date:** 2026-04-01  
**Area:** `src/routes/items/$id/index.tsx`  
**Status:** Approved

## Problem

When an item's target unit switches from package to measurement, recipe `defaultAmount` values are updated via a confirmation dialog (this already works). However, when switching back from measurement to package, recipe amounts are not updated — the existing `calcNewDefault` snap formula returns the same value as the old default (since any integer is already a multiple of `consumeAmount = 1`), so no dialog fires and recipes remain in measurement units.

## Root Cause

`calcNewDefault` snaps `oldDefault` to the nearest multiple of `newConsumeAmount`. When switching measurement → package, `newConsumeAmount = 1`, so `round(500/1)*1 = 500` — unchanged. The formula is correct for manual consumeAmount edits but wrong for unit mode switches, which require a ratio-based conversion.

## Design

### New Helper: `calcRecipeDefaultAfterUnitSwitch`

Added alongside `calcNewDefault` in `items/$id/index.tsx`:

```ts
function calcRecipeDefaultAfterUnitSwitch(
  oldDefault: number,
  amountPerPackage: number,
  newTargetUnit: 'measurement' | 'package',
  newConsumeAmount: number,
): number {
  if (oldDefault === 0) return 0
  const ratio = newTargetUnit === 'measurement'
    ? oldDefault * amountPerPackage
    : oldDefault / amountPerPackage
  const nearest = Math.round(ratio / newConsumeAmount) * newConsumeAmount
  return nearest === 0 ? newConsumeAmount : nearest
}
```

- **`amountPerPackage`** comes from `values` (current form state), not the saved item — this is the source of truth for conversion in both directions.
- After applying the ratio, the result is snapped to the nearest multiple of `newConsumeAmount` (same behavior as `calcNewDefault`).
- Zero-guard: if `oldDefault` is 0, return 0. If the snapped result is 0, fall back to `newConsumeAmount`.

### Detection in `handleSubmit`

`handleSubmit` gains a `targetUnitChanged` flag. When true, it uses `calcRecipeDefaultAfterUnitSwitch` instead of `calcNewDefault`. The two branches are mutually exclusive by design (a unit switch always drives `consumeAmount` change, so we want the ratio path, not the snap path):

```ts
const targetUnitChanged = item.targetUnit !== values.targetUnit

const buildAdjustments = (): Adjustment[] => {
  if (!allRecipes) return []
  if (targetUnitChanged) {
    return allRecipes
      .filter((r) => r.items.some((ri) => ri.itemId === id))
      .flatMap((r) => {
        const ri = r.items.find((ri) => ri.itemId === id)
        if (!ri) return []
        const newDefault = calcRecipeDefaultAfterUnitSwitch(
          ri.defaultAmount,
          Number(values.amountPerPackage),
          values.targetUnit,
          values.consumeAmount,
        )
        if (newDefault === ri.defaultAmount) return []
        return [{ recipeId: r.id, recipeName: r.name, oldAmount: ri.defaultAmount, newAmount: newDefault }]
      })
  }
  if (oldConsumeAmount !== newConsumeAmount) {
    return allRecipes
      .filter((r) => r.items.some((ri) => ri.itemId === id))
      .flatMap((r) => {
        const ri = r.items.find((ri) => ri.itemId === id)
        if (!ri) return []
        const newDefault = calcNewDefault(ri.defaultAmount, newConsumeAmount)
        if (newDefault === ri.defaultAmount) return []
        return [{ recipeId: r.id, recipeName: r.name, oldAmount: ri.defaultAmount, newAmount: newDefault }]
      })
  }
  return []
}
```

### No Other Changes

- `ItemForm/index.tsx` — unchanged; `handleTargetUnitChange` already converts form field quantities (including `consumeAmount`) correctly in both directions.
- Confirmation dialog, `handleConfirmAdjustments`, `handleCancelAdjustments` — unchanged.
- No new state, no new UI.

## Tests

In `src/routes/items/$id.test.tsx`:

1. Unit switch package → measurement updates recipe `defaultAmount` (coverage if missing)
2. Unit switch measurement → package updates recipe `defaultAmount` using `amountPerPackage` ratio, snapped to `consumeAmount` multiple
3. Unit switch with `defaultAmount = 0` leaves it at 0
4. Unit switch where converted result equals old default → no dialog shown
