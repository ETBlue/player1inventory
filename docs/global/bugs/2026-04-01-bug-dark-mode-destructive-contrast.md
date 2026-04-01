# Bug: Dark mode destructive color fails WCAG AA contrast

**Date:** 2026-04-01  
**Branch:** `fix/e2e-dark-mode-contrast`

## Bug description

Seven dark mode E2E a11y tests fail with `color-contrast` violations. The `--importance-destructive` token in dark mode (`hsl(330 90% 75%)`) achieves only 3.23–3.63:1 contrast against the page base background — below the required 4.5:1 WCAG AA threshold.

Affected pages: item new, item detail, settings tag detail, settings vendor new/detail, settings recipe new/detail — any page that renders `text-destructive` text (validation error messages or ghost/outline delete buttons).

## Root cause

Commit `e094b49` (2026-03-31) swapped the dark mode background lightness order:
- `--background-base`: `hsl(45 5% 10%)` → `hsl(40 5% 30%)` (much lighter)
- `--background-elevated`: `hsl(45 5% 30%)` → `hsl(40 5% 10%)` (much darker)

The dark mode `--importance-destructive` was sized for contrast against the old, very-dark base (luminance ≈ 0.01). Against the new lighter base (#504e49, luminance ≈ 0.096), contrast fell to:
- 3.63:1 for error `<p class="text-destructive">` (opacity 1.0)
- 3.23:1 for ghost/outline buttons (opacity 0.9 blended)

## Fix applied

Raised `--importance-destructive` in `.dark` from `hsl(330 90% 75%)` to `hsl(330 90% 90%)` in `theme.css`

## Test added

Existing dark mode axe E2E scan (18 tests, all pass)

## PR/commit

commit `03bfe94`, PR fix/e2e-dark-mode-contrast
