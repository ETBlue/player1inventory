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

*TBD*

## Test added

*TBD*

## PR / commit

*TBD*
