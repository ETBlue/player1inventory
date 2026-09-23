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

- The tick is a small pill, 8px wide and 12px tall. It is a little taller than
  the bar (8px), so it stays visible when the bar is filled.
- It uses the `foreground-muted` fill with an `accessory-default` border. That
  fill meets WCAG AA non-text contrast (3:1) in light and dark mode.
- (Changed by the designer after review, 2026-09-23. The first build was a 2px
  line in `foreground-default`.)
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
gives the number, for example "Refill when below 2". The text has no unit, because
`ItemProgressBar` does not know the package unit name. The quantity text next to
the bar (`3 / 5 packs`) already names the unit. The string is translated
(`common.refillWhenBelow`, EN and TW).

## Testing

- `ItemProgressBar` unit tests: the tick position for segmented, continuous and
  fractional cases; no tick for threshold 0, a missing prop, and target 0; the
  tick clamps to the right end when threshold ≥ target. Each behavior gets a
  mutation check.
- `ItemCard` and `StockProgressRow` tests: the item's threshold reaches the bar.
  Fixtures must use a threshold that differs from every other number on the card,
  so a test cannot pass by reading the wrong value.
- Storybook stories for the new states, with smoke tests.
- `a11y.spec.ts` still runs, but it does **not** prove the tick's contrast. axe
  checks text contrast only, not non-text contrast (WCAG 1.4.11). The tick uses
  the `foreground-muted` token (`oklch(40% …)` light, `oklch(80% …)` dark). The
  app already uses that token for text on cards, where it passes 4.5:1, so it is
  above 3:1 in both themes. Check this by eye
  in Storybook in both themes.

## Implementation notes (2026-09-23)

The build differs from the plan above in these places.

| Topic | What was built |
|---|---|
| Segment count | A segmented bar draws `floor(packageTarget)` segments. `Array.from` drops the fraction, so target 2000 with 300 per package (6.67 packages) draws 6 segments. The tick uses the same 6 as its target, so a threshold of 1950 (6.5 packages) clamps to the end of segment 6. |
| Float error | The package target and the scaled threshold are rounded to 6 decimal places. In JavaScript `0.3 / 0.1` is `2.9999999999999996` and `0.6 / 0.1` is `5.999999999999999`. Without rounding, the tick missed the gap between segments, and the bar drew 5 segments instead of 6. |
| Continuous bar with package info | A measurement item above 30 packages gets a continuous bar. The tick then uses item units, not packages: target 20000, 500 per package, threshold 5000 puts the tick at 25%. |
| Right end | At the right end the tick uses `-translate-x-full`, so it stays inside the bar. Everywhere else it uses `-translate-x-1/2`. |
| Link accessible name | On `ItemCard` the bar is inside the card `<Link>`. The sr-only text joins the link's accessible name, which now ends with "Refill when below N", for example "Eggs 7 / 9 carton Refill when below 4". A test in `ItemCard.test.tsx` pins this name. |
| Forwarding | `StockProgressRow` forwards the prop with `!== undefined` (`{...(refillThreshold !== undefined ? { refillThreshold } : {})}`), so `0` still reaches the bar, and the bar decides that `0` means no tick. `QuickUpdateDialog` and the Stock tab pass the live, unsaved value. |

### Known limits (accepted)

- **Package target below 1 draws no tick.** This bug existed before this work. On a segmented bar with `packageTarget < 1` (for example target 200 with 500 per package), `floor(packageTarget)` is 0, so the bar draws 0 segments. With 0 segments there is nothing to place a tick on, so no tick is drawn.
- **A very small threshold on a continuous bar can sit about 4px past the left edge.** The tick is 8px wide and centred on its point, so near 0% half of it is left of the bar. This is cosmetic and accepted.
- **On a bar with many segments, the tick can cover a whole segment.** At 30 segments on a phone-width card (about 300px), a segment is about 8px wide, the same as the tick. The tick then hides that segment's fill.

## Rejected

- **Threshold as text** (`3 / 5 packs · refill at 2`): makes the user compare two
  numbers, and makes the text row longer on narrow screens.
- **Item cards only**: the same bar would mean two different things on different
  surfaces.
