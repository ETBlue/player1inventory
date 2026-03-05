# Design: Set Base Line-Height to 1.25em

**Date:** 2026-03-05
**Status:** Planned

## Problem

`body { line-height: 1em }` in `src/design-tokens/theme.css` causes descender clipping whenever a component uses `overflow: hidden` with an inherited line-height. Descenders (g, p, q, y) extend ~0.2–0.3em below the baseline — outside the element's height at `1em` — and are clipped.

PR #77 fixed this reactively in `CardTitle` by switching `leading-none` → `leading-tight`. This design addresses it proactively at the base level to prevent recurrence.

## Solution

Change `line-height: 1em` → `line-height: 1.25em` in the `body` rule in `src/design-tokens/theme.css`.

`1.25em` provides 0.125em of vertical padding above and below text — enough for descenders to render safely. This matches the value already proven safe by the `CardTitle` fix (`leading-tight` = 1.25).

## Impact

- All elements inheriting line-height from `body` get the fix automatically.
- Components with explicit overrides (`leading-none`, `leading-tight`, etc.) are unaffected.
- No layout shifts expected — `1.25em` is a minimal, conservative increase.

## Files to Change

- `src/design-tokens/theme.css` — 1-line change in `body` rule
