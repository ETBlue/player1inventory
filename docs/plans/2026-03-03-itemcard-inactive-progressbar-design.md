# ItemCard: Inactive Progress Bar Color + Layout Polish

Date: 2026-03-03

## Summary

Two small improvements to `ItemCard` and `card.tsx`:

1. **Inactive progress bar color** — When an item is inactive (`targetQuantity === 0 && refillThreshold === 0`), the progress bar fill should use `bg-status-inactive` instead of the status-derived color (currently `bg-accessory-emphasized` via the 'ok' fallback).

2. **Layout polish** — Already implemented by the user:
   - `CardTitle` font size reduced from `text-base` to `text-sm` for visual consistency
   - ItemCard title row restructured: remove inner `<div>` wrapper, add `<div className='flex-1' />` spacer so quantity display right-aligns cleanly

## Design

### Inactive progress bar

**Approach:** Add `'inactive'` as a valid value to `ItemProgressBar`'s `status` prop type, map it to `bg-status-inactive` in all three rendering paths (segmented, continuous, target=0). In `ItemCard`, compute a derived progress status:

```ts
const progressStatus = isInactive(item) ? 'inactive' : status
```

Pass `progressStatus` instead of `status` to `<ItemProgressBar>`.

This mirrors how `Card` uses `variant="inactive"` — the progress bar color now participates in the same inactive visual system.

### Color token

`bg-status-inactive` — defined as `hsl(45 2.5% 60%)` in light mode, `hsl(45 2.5% 60%)` in dark mode. Neutral warm-gray, visually distinct from the status colors.

## Files Affected

- `src/components/ItemProgressBar.tsx` — extend status type, add inactive color handling
- `src/components/ItemCard.tsx` — compute `progressStatus`, pass to ItemProgressBar (layout changes already done)
- `src/components/ui/card.tsx` — font size change already done
