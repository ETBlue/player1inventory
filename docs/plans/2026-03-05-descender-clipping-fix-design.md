# Design: Fix Descender Clipping in Item Card Titles

**Date:** 2026-03-05
**Status:** Implemented

## Problem

Letters with descenders (g, p, q, y) are visually clipped in `ItemCard` title text. The clip occurs because:

1. `CardTitle` applies `leading-none` (`line-height: 1`), making the element's height exactly equal to `font-size`
2. The `h3.truncate` inside inherits this tight line-height
3. `truncate` applies `overflow: hidden`, clipping anything below the element's border box
4. Descenders extend ~0.2–0.3em below the text baseline — outside the element's height — and are thus cut off

## Solution

Change `leading-none` → `leading-tight` in `CardTitle` (`src/components/ui/card.tsx`).

`leading-tight` = `line-height: 1.25`, providing 0.125em of vertical space above and below the text — enough room for descenders to render without being clipped.

## Impact

- **`ItemCard` titles** — descenders no longer clipped ✓
- **Tags settings page** (`/settings/tags`) — tag type names in `CardTitle` get slightly more vertical breathing room; no layout issues

## Files Changed

- `src/components/ui/card.tsx` — 1-line change in `CardTitle`
