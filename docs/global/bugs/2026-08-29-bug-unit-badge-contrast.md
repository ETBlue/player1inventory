# Bug: `UnitBadge` fails WCAG AA colour contrast

**Issue:** [#257](https://github.com/ETBlue/player1inventory/issues/257)
**Date:** 2026-08-29
**Area:** shared components (`UnitBadge`) · items · pantry group views

## Bug description

`pnpm test:e2e --grep "a11y"` fails four tests with one `color-contrast`
violation each:

| Test | Viewport |
|---|---|
| `a11y.spec.ts` — shelves page | desktop |
| `a11y.spec.ts` — vendor group-by page | desktop |
| `a11y.spec.ts` — recipe group-by page | desktop |
| `a11y.spec.ts` — shelves page | mobile 390×844 |

axe's report is identical in all four:

```
color-contrast · serious · target [".px-1"]
fg #797366  bg #fdf8ed  ratio 4.44  (need 4.5:1)  font 12px normal
```

The node is `UnitBadge` — the bordered pill rendering `"pack"` / `"unit"` /
a measurement unit beside a stock quantity:

```html
<span data-unit-badge class="px-1 text-xs text-foreground-muted
      border border-foreground-muted rounded-xs opacity-75">pack</span>
```

Light mode only; dark mode's composite measures 4.79:1 and passes.

### Reproduction note

The four tests scan the **empty pantry**, not a populated grouping — the
badge reaches axe via the empty-state item card. Run `pnpm codegen` first:
with a stale `src/generated/graphql.ts` the app fails to boot entirely and
these tests fail on `landmark-one-main` / `page-has-heading-one` instead,
which is a different bug.

## Root cause

**`opacity-75`, not the colour token.** `--foreground-muted` is
`oklch(40% 6% 85)` = `#4e4739`, which measures **8.68:1** against the item
card's `--background-elevated` (`#fdf8ed`) — comfortably AA. At 75% opacity
it composites to `#797366`, which is 4.44:1.

Measured in-browser (canvas readback, Chrome's own colour engine), composited
`--foreground-muted` at `opacity-75`:

| light surface | ratio |
|---|---|
| `--background-base` | 3.82 |
| `--background-surface` | 4.20 |
| `--background-elevated` | **4.43** ← the failing node |

So the badge is sub-AA on *every* light surface; the four tests only catch the
card. Darkening the token to clear all three would need `oklch(34% …)`, a
visible restyle of the ~70 files that share `text-foreground-muted`.

The defect was known and accepted (`components/CLAUDE.md`: "`opacity-75` is
intentional for visual harmony … accepted tradeoff by design") and partially
suppressed by `KNOWN_UNIT_BADGE_CONTRAST_EXCLUSION` in `a11y.spec.ts`, which
covers only the two dialog tests — not these four page tests.

## Fix applied

**`UnitBadge` deleted.** The unit is now a **trailing bare word inside the
quantity's own span** — no parentheses, no border, no opacity — so it inherits
the quantity's existing `text-xs text-foreground-muted` at full opacity
(6.80:1 on the worst light surface, `--background-base`). The defect is fixed
at its source rather than by darkening a token ~70 files share.

The three render sites, each of which already wrapped the quantity in that
muted class, so no new styling was needed:

| File | Renders |
|---|---|
| `components/item/ItemCard/ItemCard.tsx` | `3 / 4 pack` · `3 (+2) / 4 pack` · `1500 (+100) / 2000 g` |
| `components/shared/GroupCard/GroupCard.tsx` | `12 / 20 pack` |
| `components/item/StockProgressRow/StockProgressRow.tsx` | `3 / 4 pack` |

Notes on scope:

- **No unit STRING derivation changed.** `getStockPreview` keeps its honest
  `packageUnit ?? 'unit'` fallback (`lib/quantityUtils.ts`), and `ItemCard`
  keeps its `measurementUnit` / `packageUnit ?? DEFAULT_PACKAGE_UNIT` choice.
- **Number spacing was unified in a follow-up.** The first pass appended the
  unit only, leaving `ItemCard` and `GroupCard` on `12/20` while
  `getStockPreview` (and so `StockProgressRow`) already emitted `3 / 4`. A
  later commit on this branch put spaces around the `/` at those two sites, so
  all three render sites now read `3 / 4 pack`. `getStockPreview` itself was
  not touched — it was already correct.
- `GroupCard` used to render `<UnitBadge />` with no prop, relying on the
  component's implicit `'pack'` default. That is now the explicit
  `DEFAULT_PACKAGE_UNIT` imported from `@/types` — group totals are genuinely
  pack-counted.
- `e2e/tests/a11y.spec.ts`'s `KNOWN_UNIT_BADGE_CONTRAST_EXCLUSION` and its two
  helpers are deleted; its documented removal condition is met.
  `KNOWN_CONFIRM_CONTRAST_EXCLUSION` **stays** — the `opacity-90` on
  `buttonVariants` is a separate, untouched defect.

### Also fixed here: `getItemPackUnits`' fallback

`lib/quantityUtils.ts` — the branch that fires when a
`targetUnit: 'measurement'` item has `amountPerPackage` unset or `0` returned
`packed = packedQuantity + unpackedQuantity`, putting a raw *measurement*
amount into a *pack* total: a 750 ml item pushed its group card to
`750 / 20 pack`. Such an item now contributes **0** packs, matching the
`target: 0` / `refill: 0` the same branch already returned. The zeroing is
gated on `targetUnit === 'measurement'` so a legacy row with no `targetUnit`
at all — the branch's other entry path — keeps its existing sum.

## Test added

Every one of these was mutation-checked: the behaviour was deleted or
inverted in the source, the test was confirmed RED, then restored and
confirmed green.

| Test | Guards |
|---|---|
| `ItemCard.test.tsx` — `'1500 (+100) / 2000 g'`, `'5 (+0.5) / 10 pack'`, `'2000 / 2000 mL'`, `'1 / 3 bunch'` | the unit renders inside the quantity text (measurement, loose-stock and plain cases) |
| `ItemCard.test.tsx` — "user cannot see the unit" | `showStock={false}` suppresses it, matched as a substring now that it has no element of its own |
| `GroupCard.test.tsx` — "user sees the pack unit trailing the totals in the same text node" | `12 / 20 pack`, and that no bare `pack` node survives |
| `StockProgressRow.stories.test.tsx` — `'3 / 4 pack'`, `'1 / 4 pack'`, `'1 (+0.5) / 2 L'` | the row's label carries its unit |
| `ItemForm.test.tsx` — `'0 / 4 unit'` | the pre-existing honest-fallback guard (an item with neither unit configured), re-expressed for the new rendering |
| `quantityUtils.test.ts` — "user does not see a raw measurement amount counted as packs on a group card" | the 750 ml → 0 packs fix |
| `quantityUtils.test.ts` — "a row with no targetUnit at all keeps the packed + unpacked fallback sum" | the gate, so the zeroing cannot swallow the legacy path |

Two assertions in `routes/index.test.tsx` (bucket-3 search-tail rows) counted
`[data-unit-badge]` elements. That selector matches nothing by construction
now, so both were re-expressed: the fixture gets a distinctive
`packageUnit: 'jug'`, and the guard is `queryByText(/jug/)`. Their sibling
`queryByText('0/0')` had gone vacuous for the same reason — an exact-string
match no longer sees `0 / 0 jug` — so it is a regex now too, `/0 \/ 0/` once
the separator gained its spaces. Mutating `showStock &&` to `true &&` in
`ItemCard` turns both red.

`ItemCard.assignment.stories.test.tsx`'s `TagAssignmentNoStock` guards had gone
vacuous the same way — `queryByText('0/2')` and `queryByText('gallon')` are
exact-string matchers that could never see `0 / 2 gallon` — so both are regexes
now, `/0 \/ 2/` and `/gallon/`. The same `true &&` mutation turns that test red.

## PR / commit

- `3f5bea13` — fold the unit into the quantity text, delete `UnitBadge`, move
  the tests
- `53e4f6dd` — `getItemPackUnits` measurement-fallback fix + tests
- `a532739e` — drop the dead a11y exclusion
- `d6568d21` — docs
- a follow-up commit on the same branch — put spaces around the `/` in
  `ItemCard` and `GroupCard` so all three render sites read `3 / 4 pack`,
  with every exact-string assertion and doc table re-spaced to match

PR: *TBD*

## Verification

`pnpm test` 1972 web + 105 server passing; root `pnpm build`, Storybook build,
Biome check and lint all clean. `pnpm test:e2e --grep
"shelves|vendors-group|recipes-group|items|a11y"` — 94 passed, 1 skipped,
**with no exclusion in place**, including the four scans from this issue and
the four group-by scans that had looked flaky.
