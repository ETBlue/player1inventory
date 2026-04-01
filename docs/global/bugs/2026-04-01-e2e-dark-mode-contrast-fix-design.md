# E2E Dark Mode Contrast Fix — Design Spec

**Date:** 2026-04-01  
**Branch:** `fix/e2e-dark-mode-contrast`

## Problem

After two March 31 commits, 9 E2E tests are failing:

### Issue A — Onboarding E2E selector mismatch (2 tests)

PR #163 renamed UI strings in the onboarding flow:
- Button: `"Choose from template"` → `"Choose from a template..."`
- Heading: `"Choose from template"` → `"Build your pantry"`

The E2E page object and specs still reference the old strings.  
Fix already prepared in stash `e2e-onboarding-update`.

### Issue B — Dark mode color-contrast violations (7 tests)

`e094b49` swapped the dark mode background lightness order:
- `--background-base`: `hsl(45 5% 10%)` → `hsl(40 5% 30%)` (much lighter)
- `--background-elevated`: `hsl(45 5% 30%)` → `hsl(40 5% 10%)` (much darker)

The dark mode `--importance-destructive` (`hsl(330 90% 75%)`) was previously sized for contrast against the old very-dark base (luminance ≈ 0.01). Against the new lighter base (#504e49, luminance ≈ 0.096), it fails WCAG AA:

| Element | Contrast | Required |
|---------|----------|----------|
| Error `<p>` (opacity 1.0) | 3.63:1 | 4.5:1 |
| Ghost/outline button (opacity 0.9) | 3.23:1 | 4.5:1 |

Failing pages: item new, item detail, settings tag detail, settings vendor new/detail, settings recipe new/detail — any page that renders a destructive-colored element (validation error message or delete button).

## Solution

Single PR with two commits.

### Commit 1 — CSS design token fix

File: `apps/web/src/design-tokens/theme.css`

```css
/* .dark */
--importance-destructive: hsl(330 90% 90%);  /* was hsl(330 90% 75%) */
```

Expected contrast at 90% lightness:
- Plain text (opacity 1.0): ~5.35:1 ✓
- Button (opacity 0.9, blended): ~4.67:1 ✓

### Commit 2 — E2E selector updates (from stash)

| File | Change |
|------|--------|
| `e2e/pages/OnboardingPage.ts` | `clickChooseTemplate`: button name `'Choose from template'` → `'Choose from a template...'` |
| `e2e/tests/a11y.spec.ts` | onboarding page wait-for: same rename |
| `e2e/tests/onboarding.spec.ts` | heading assertion: `'Choose from template'` → `'Build your pantry'` |

## Verification

After both commits, run:
```bash
pnpm test:e2e --grep "onboarding|a11y"
```

All 43 tests must pass. No new violations allowed.

## Out of Scope

- `--status-error` color (separate token, no currently failing tests)
- Any other design token audit
