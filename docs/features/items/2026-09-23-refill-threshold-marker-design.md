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
| Threshold is 0 (target > 0) | Tick at the left end of the bar, inside the bar (changed 2026-09-23, see below) |
| Threshold is negative, or the prop is not passed | No tick |
| Item is inactive, or not stocked at the active location (target 0) | No tick |
| Threshold ≥ target | Tick at the right end of the bar |
| Stock hidden (`showStock=false`) | No bar, so no tick |

**Change on 2026-09-23 (user feature request).** The approved rule was "threshold
0 shows no tick". The user asked for a tick at 0 too, so the rule changed:

- At 0 the tick sits at the left end. It is left-aligned (`translate-x-0`), so
  it stays inside the bar, on segmented and continuous bars.
- At 0, `getStockStatus` never warns: a stock of 0 is not below 0, and the
  "equals" warning needs a threshold above 0. So the tick at 0 marks "no refill
  point". It does not mark a point where the card turns yellow or red.
- The screen-reader text reads "Refill when below 0".
- An item not stocked at the active location gets `targetQuantity: 0` and
  `refillThreshold: 0` from `ZERO_STOCK` in `lib/itemStock.ts`. Its target is 0,
  so it still shows no tick.

### Accessibility

The tick is visual only (`aria-hidden`). Screen-reader-only text next to the bar
gives the number, for example "Refill when below 2". The text has no unit, because
`ItemProgressBar` does not know the package unit name. The quantity text next to
the bar (`3 / 5 packs`) already names the unit. The string is translated
(`common.refillWhenBelow`, EN and TW).

## Testing

- `ItemProgressBar` unit tests: the tick position for segmented, continuous and
  fractional cases; a tick at the left end for threshold 0; no tick for a
  negative threshold, a missing prop, and target 0; the tick clamps to the
  right end when threshold ≥ target. Each behavior gets a
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
| Ends | At the right end the tick uses `-translate-x-full`. At 0 (left end) it uses `translate-x-0`. Both keep it inside the bar. Everywhere else it uses `-translate-x-1/2`. `getRefillMarkerLeft` returns `0%` for 0 in both modes. Before this, the segmented whole-number formula gave `-1px` for 0. |
| Link accessible name | On `ItemCard` the bar is inside the card `<Link>`. The sr-only text joins the link's accessible name, which now ends with "Refill when below N", for example "Eggs 7 / 9 carton Refill when below 4". A test in `ItemCard.test.tsx` pins this name. |
| Forwarding | `StockProgressRow` forwards the prop with `!== undefined` (`{...(refillThreshold !== undefined ? { refillThreshold } : {})}`), so `0` still reaches the bar. Since the threshold-0 change, the bar draws a tick at the left end for `0`. `QuickUpdateDialog` and the Stock tab pass the live, unsaved value. |

### Known limits (accepted)

- **Package target below 1 draws no tick.** This bug existed before this work. On a segmented bar with `packageTarget < 1` (for example target 200 with 500 per package), `floor(packageTarget)` is 0, so the bar draws 0 segments. With 0 segments there is nothing to place a tick on, so no tick is drawn.
- **A very small threshold above 0 on a continuous bar can sit about 4px past the left edge.** The tick is 8px wide and centred on its point, so near 0% half of it is left of the bar. This is cosmetic and accepted. At exactly 0 the tick is left-aligned and stays inside the bar.
- **On a bar with many segments, the tick can cover a whole segment.** At 30 segments on a phone-width card (about 300px), a segment is about 8px wide, the same as the tick. The tick then hides that segment's fill.

## Rejected

- **Threshold as text** (`3 / 5 packs · refill at 2`): makes the user compare two
  numbers, and makes the text row longer on narrow screens.
- **Item cards only**: the same bar would mean two different things on different
  surfaces.
