# Design: Fix Disappearing Progress Bar for Inactive Items

**Date:** 2026-02-17

## Problem

When an item becomes inactive (`targetQuantity === 0` and `currentQuantity === 0`), the progress bar in the item card disappears entirely instead of showing an empty track.

## Root Cause

`ItemProgressBar` selects rendering mode based on:

```ts
const useContinuous = targetUnit === 'measurement' || target > SEGMENTED_MODE_MAX_TARGET
```

For package-mode items with `target === 0`, `useContinuous` is `false`, so `SegmentedProgressBar` is used. That component calls `Array.from({ length: 0 }, ...)`, producing an empty array — resulting in an invisible empty `<div>`.

## Fix

Add a guard at the top of the exported `ItemProgressBar` function, before mode selection:

```tsx
if (target === 0) {
  return <div className="flex-1 h-2 rounded-xs border border-accessory-emphasized" />
}
```

**File:** `src/components/ItemProgressBar.tsx`

The empty track uses the same `h-2 rounded-xs border border-accessory-emphasized` classes as individual segments in `SegmentedProgressBar`, maintaining visual consistency — a full-width bar outline with no fill.

## Expected Behavior

- Active items (target > 0): progress bar renders as before (segmented or continuous)
- Inactive items (target === 0): progress bar renders as an empty visible track, preserving layout and communicating the item isn't tracked

## Testing

- `ItemProgressBar.test.tsx`: add case for `target=0` asserting the empty track renders and no segment `data-segment` divs appear
- `ItemProgressBar.stories.tsx`: add "Inactive" story with `target=0, current=0`
