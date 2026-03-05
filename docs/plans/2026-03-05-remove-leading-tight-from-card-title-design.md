# Design: Remove `leading-tight` from CardTitle

**Date:** 2026-03-05
**Status:** Planned

## Problem

`CardTitle` in `src/components/ui/card.tsx` has `leading-tight` (`line-height: 1.25`) in its className. This was added in PR #77 to fix descender clipping under `overflow: hidden`.

With the base `body { line-height: 1.25em }` now set in `src/design-tokens/theme.css` (PR #79), `CardTitle` inherits `1.25` from `body` automatically. The explicit `leading-tight` is now redundant.

## Solution

Remove `leading-tight` from `CardTitle`'s className in `src/components/ui/card.tsx:68`:

```tsx
// Before
className={cn('text-sm font-medium leading-tight', className)}

// After
className={cn('text-sm font-medium', className)}
```

`CardTitle` will inherit `line-height: 1.25em` from `body` — same value, no visual change.

## Impact

- No visual change
- No layout shift
- Removes a now-redundant class added as a one-off fix

## Files to Change

- `src/components/ui/card.tsx` — 1-line change in `CardTitle`
