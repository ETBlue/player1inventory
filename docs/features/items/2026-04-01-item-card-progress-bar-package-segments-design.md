# Item Card Progress Bar — Always Segment by Package

**Date:** 2026-04-01
**Feature area:** `items` / `ItemProgressBar`

## Problem

The progress bar in `ItemCard` currently uses a continuous (smooth) bar for all items with `targetUnit === 'measurement'`, even when the item has package info (`amountPerPackage`). For example, a 500g target item with 100g per pack shows a smooth 0–500 bar instead of 5 distinct package segments. The requirement is to always show segments based on the number of packages whenever package info is available.

## Decision

When `amountPerPackage` is defined, convert all progress bar values to package units and use segmented mode — regardless of `targetUnit`. The existing `> 30` threshold still applies to the derived package count to prevent visual clutter.

## Scope

**Files changed:**
- `apps/web/src/components/item/ItemProgressBar/index.tsx` — new prop + updated mode logic + value conversion
- `apps/web/src/components/item/ItemCard/index.tsx` — pass new prop at call site
- `apps/web/src/components/item/ItemProgressBar/ItemProgressBar.test.tsx` — new test cases

## Design

### New Prop

`ItemProgressBar` receives one new optional prop:

```ts
amountPerPackage?: number
```

### Mode Decision

Current:
```ts
const useContinuous = targetUnit === 'measurement' || target > SEGMENTED_MODE_MAX_TARGET
```

New:
```ts
const packageTarget = amountPerPackage ? target / amountPerPackage : target
const useContinuous = (targetUnit === 'measurement' && !amountPerPackage) || packageTarget > SEGMENTED_MODE_MAX_TARGET
```

`targetUnit` is kept as a tiebreaker for items that have no `amountPerPackage`: package items without package size info still segment by their raw target; measurement-only items without package size info still use continuous.

### Value Conversion

When `amountPerPackage` is present, all four values are divided by it before being passed to `SegmentedProgressBar`:

```ts
const scale = amountPerPackage ?? 1

// passed to SegmentedProgressBar:
current / scale
target / scale   // = packageTarget
packed / scale
unpacked / scale
```

`ItemCard` already passes `packed` as `packedQuantity * amountPerPackage` (measurement units) when `targetUnit === 'measurement'`, so dividing back yields `packedQuantity` (packages). `unpacked` is in measurement units, so dividing yields fractional packages. The packed/unpacked layered visualization within segments is preserved.

### Call Site (ItemCard)

One addition to the `ItemProgressBar` usage in `ItemCard`:

```tsx
<ItemProgressBar
  ...
  amountPerPackage={item.amountPerPackage}  {/* new */}
/>
```

No other changes to ItemCard's existing conversion logic.

## Behavior Matrix

| `targetUnit` | `amountPerPackage` | Package count | Result |
|---|---|---|---|
| `'package'` | absent | ≤ 30 | segmented by target (unchanged) |
| `'package'` | absent | > 30 | continuous (unchanged) |
| `'measurement'` | absent | — | continuous (unchanged) |
| `'measurement'` | present | ≤ 30 | **segmented by package count** (new) |
| `'measurement'` | present | > 30 | continuous (unchanged threshold) |

## Tests

New cases to add to `ItemProgressBar.test.tsx`:

1. Measurement item with `amountPerPackage`, package count ≤ 30 → segmented mode
2. Measurement item with `amountPerPackage`, package count > 30 → continuous mode
3. Measurement item without `amountPerPackage` → still continuous (regression guard)
4. Packed/unpacked conversion in segmented mode — correct segment fill and layering
5. All existing tests continue to pass (package items without `amountPerPackage` are unaffected)
