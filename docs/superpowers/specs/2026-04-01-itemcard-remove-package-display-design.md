# Design: Remove `isPackageDisplay` from ItemCard

**Date:** 2026-04-01  
**Branch:** `refactor/itemcard-remove-package-display`  
**Status:** Approved

---

## Background

The `isPackageDisplay` prop on `ItemCard` was introduced so the shopping page could display quantities as package counts (e.g. `1/2 bottles`) rather than measurement units (e.g. `350/500g`). The goal was to let the user see how many packages to buy.

The `ItemProgressBar` component now renders a segmented progress bar for dual-unit items — one segment per package — which already communicates that information visually without any special prop. The `isPackageDisplay` prop is therefore redundant.

---

## Goal

Remove `isPackageDisplay` and all logic it drives from `ItemCard`. The shopping page will render items the same way as the pantry page: measurement units in the header for measurement-tracked items, package units otherwise. The segmented progress bar continues to show package segments as before.

---

## What Does Not Change

- `ItemProgressBar` is untouched. Its internal conversion from measurement to package segments (`amountPerPackage` + `targetUnit` logic) remains exactly as-is.
- The shopping page still uses `mode="shopping"`, `showTags={false}`, `showExpiration={false}`, and `showTagSummary={false}`.
- All other `ItemCard` props are unchanged.

---

## File-by-File Changes

### `apps/web/src/components/item/ItemCard/index.tsx`

Remove:
- `isPackageDisplay?: boolean` from `ItemCardProps` interface
- `isPackageDisplay = false` from the destructured params
- The `targetInPackages` variable (only computed when `isPackageDisplay=true`)
- The `packageProgressCurrent` and `packageProgressTarget` variables — replace with direct values `currentQuantity` and `item.targetQuantity` in the `ItemProgressBar` call
- The comment block `// Package-display values (used when isPackageDisplay=true)`

Simplify:
- `unitLabel`: remove the `!isPackageDisplay &&` guard from the condition — the value is unchanged because `isPackageDisplay` was always `false` on all other pages
- Header quantity span: remove the `isPackageDisplay` ternary; keep only the existing measurement-unit path (`displayPacked` / `currentQuantity` / `item.targetQuantity`)

The `displayPacked` variable is unaffected — it converts packed quantity to measurement units for the pantry header and remains correct.

### `apps/web/src/routes/shopping.tsx`

Remove the `isPackageDisplay={true}` line from the `ItemCard` call inside `renderItemCard`.

### `apps/web/src/components/item/ItemCard/ItemCard.shopping.stories.tsx`

Remove the three stories that demonstrated the removed feature:
- `PackageDisplayDualUnit`
- `PackageDisplayDualUnitWithUnpacked`
- `PackageDisplaySingleUnit`

Keep `NotInCart` and `InCart` — these don't reference `isPackageDisplay`.

### `apps/web/src/components/item/ItemCard/ItemCard.shopping.stories.test.tsx`

Remove the three corresponding smoke test cases:
- `PackageDisplayDualUnit renders without error`
- `PackageDisplayDualUnitWithUnpacked renders without error`
- `PackageDisplaySingleUnit renders without error`

Remove the now-unused destructured story names from `composeStories(stories)`.

### `apps/web/src/routes/CLAUDE.md`

Remove the mention of `isPackageDisplay` from the shopping page section.

---

## Behaviour After Change

| Item type | Header (all pages) | Progress bar (all pages) |
|---|---|---|
| Package unit only (e.g. `targetUnit='package'`) | `1/2 bottles` | Segmented or continuous by count |
| Measurement unit, no `amountPerPackage` | `350/500g` | Continuous bar |
| Dual-unit (measurement + `amountPerPackage`) | `350 (+50)/500g` | Segmented by package (ItemProgressBar converts internally) |

The shopping page no longer displays a package-count header for dual-unit items. The segmented progress bar provides the equivalent "how many packages" signal.

---

## Testing

No new tests are required. The existing `NotInCart` and `InCart` story smoke tests cover shopping-mode rendering after the stories are trimmed. The removal of dead code paths is verified by TypeScript compilation (no remaining references to `isPackageDisplay`).
