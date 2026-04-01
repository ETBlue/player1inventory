# Bug: Progress Bar Disappears for Package-Unit Items with amountPerPackage

**Date:** 2026-04-01
**Feature area:** `items` / `ItemProgressBar`

## Bug Description

After the `amountPerPackage` change, progress bars disappear for items where `targetUnit === "package"` AND `amountPerPackage` is set (e.g. Olive Oil: 3 bottles target, 500ml/bottle).

## Root Cause

`ItemProgressBar` divides `target` by `amountPerPackage` unconditionally when `hasPackageInfo` is true. For `targetUnit === "package"` items, `target` is already in package units — dividing by `amountPerPackage` (e.g. 500) yields a fractional package count (3/500 = 0.006). `SegmentedProgressBar` passes this to `Array.from({ length: 0.006 })` which produces 0 segments → empty bar.

## Fix Applied

Added a `needsConversion` check that only applies the division for `targetUnit === 'measurement'` items. The logic now reads:

```ts
const needsConversion = hasPackageInfo && targetUnit === 'measurement'
const scale = needsConversion ? amountPerPackage : 1
const packageTarget = needsConversion ? target / scale : target
```

For `targetUnit === 'package'` items, `scale` is always 1 and `packageTarget` equals the original `target`, so no division occurs.

## Test Added

Added regression guard test to `ItemProgressBar.test.tsx`:

```ts
it('shows segmented bar for package-unit item with amountPerPackage (regression guard)', () => {
  // Olive Oil example: 3 bottles target, 500ml/bottle, 1 bottle in stock
  const { container } = render(
    <ItemProgressBar
      current={1}
      target={3}
      status="ok"
      targetUnit="package"
      amountPerPackage={500}
      packed={1}
      unpacked={0}
    />,
  )
  // Should show 3 segments (not 0 from dividing 3/500)
  const segments = container.querySelectorAll('[data-segment]')
  expect(segments).toHaveLength(3)
  expect(segments[0]).toHaveAttribute('data-fill', '100')
})
```

All 19 tests pass.

## PR/Commit

Commit: `795be58` - fix(items): only convert measurement values to package units in ItemProgressBar
