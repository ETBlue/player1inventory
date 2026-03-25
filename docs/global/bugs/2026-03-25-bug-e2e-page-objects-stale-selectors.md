# Bug: E2E Page Objects Have Stale Selectors After A11y Fix

## Bug Description

31 E2E tests fail across tags, vendors, recipes, and item management after the a11y fix (PR #147). The a11y fix changed tag type card headings from `<h3>` to `<h2>` and introduced quoted names in vendor/recipe delete aria-labels via i18n, but the E2E page objects were not updated to match.

## Root Cause

Two mismatches between the current DOM and the E2E page object selectors:

1. **Tag type heading level**: `src/routes/settings/tags/index.tsx` uses `<h2>` for tag type names, but `TagsPage.ts` and `SettingsPage.ts` query `getByRole('heading', { name, level: 3 })`.

2. **Delete aria-label format**: Vendor and recipe delete buttons use i18n key `deleteAriaLabel` which renders as `Delete "{{name}}"` (with quotes), but `VendorsPage.ts` and `RecipesPage.ts` look for `Delete ${name}` (without quotes).

## Fix Applied

Updated 4 E2E page object files:

1. `e2e/pages/SettingsPage.ts` — `createTagType`: `level: 3` → `level: 2`
2. `e2e/pages/settings/TagsPage.ts` — `getTagTypeCard`, `clickNewTag`, `dragTagToType`: `level: 3` → `level: 2`; `clickDeleteTag`: replaced nested `dragWrapper.locator('button')` with direct `getByRole('button', { name: 'Delete "${name}"' })`
3. `e2e/pages/settings/VendorsPage.ts` — `clickDeleteVendor`: `` `Delete ${name}` `` → `` `Delete "${name}"` ``
4. `e2e/pages/settings/RecipesPage.ts` — `clickDeleteRecipe`: `` `Delete ${name}` `` → `` `Delete "${name}"` ``

## Test Added

No new tests needed — the 31 previously failing E2E tests are the regression guard. All 99 E2E tests pass after the fix.

## PR / Commit

*TBD*
