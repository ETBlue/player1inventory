# Design: Refill Threshold Marker

Date: 2026-09-23
Status: Approved
Brainstorming: [log](2026-09-23-brainstorming-refill-threshold-marker.md)
Plan: [plan](2026-09-23-refill-threshold-marker-plan.md)

## Problem

The card color says *whether* stock is low. It does not say *how far* the stock is
from the refill threshold, because the threshold is never shown.

## Solution

Draw a thin vertical tick on the item progress bar at the refill threshold.

### What the user sees

- The tick is a little taller than the bar (the bar is 8px, the tick about 12px),
  so it stays visible when the bar is filled.
- It uses a strong foreground color that meets WCAG AA non-text contrast (3:1)
  in light and dark mode.
- **Segmented bar** (target ≤ 30 packages): with threshold 2, the tick sits in the
  gap after segment 2: `[■][■]|[■][ ][ ]`. A fractional threshold (for example
  1.5 packages, from a measurement-unit item) sits inside a segment.
- **Continuous bar**: the tick sits at `threshold / target` of the bar width.

### Where it shows

The tick is part of `ItemProgressBar`, through a new optional prop
`refillThreshold` (in the same unit as `target`). It shows wherever an item's bar
shows:

- `ItemCard`: pantry, shopping, cooking, vendor and recipe lists
- `QuickUpdateDialog`: through `StockProgressRow`
- The item detail Stock tab (`ItemForm`): through `StockProgressRow`

`GroupCard` also uses `ItemProgressBar`, but for a group total. A group has no
single threshold, so it passes no `refillThreshold` and shows no tick.

For segmented bars on measurement items, the threshold is divided by
`amountPerPackage`. This is the same scale already applied to `target` and
`current`.

### Edge cases

| Case | Behavior |
|---|---|
| Threshold is 0, or the prop is not passed | No tick |
| Item is inactive (target 0) | No tick |
| Threshold ≥ target | Tick at the right end of the bar |
| Stock hidden (`showStock=false`) | No bar, so no tick |

### Accessibility

The tick is visual only (`aria-hidden`). Screen-reader-only text next to the bar
gives the number, for example "Refill at 2 packs".

## Testing

- `ItemProgressBar` unit tests: the tick position for segmented, continuous and
  fractional cases; no tick for threshold 0, a missing prop, and target 0; the
  tick clamps to the right end when threshold ≥ target. Each behavior gets a
  mutation check.
- `ItemCard` and `StockProgressRow` tests: the item's threshold reaches the bar.
  Fixtures must use a threshold that differs from every other number on the card,
  so a test cannot pass by reading the wrong value.
- Storybook stories for the new states, with smoke tests.
- `a11y.spec.ts` checks contrast in light and dark mode.

## Rejected

- **Threshold as text** (`3 / 5 packs · refill at 2`): makes the user compare two
  numbers, and makes the text row longer on narrow screens.
- **Item cards only**: the same bar would mean two different things on different
  surfaces.
