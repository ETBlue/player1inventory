# Cooking Page E2E Tests Design

**Date:** 2026-03-10
**Status:** Approved

## Overview

Add an end-to-end test for the cooking page happy path: a user cooks a recipe with partial items and multiple servings, and the correct inventory deductions are applied.

## Decisions

- **Scope:** Single happy-path test covering check recipe → expand → uncheck one item → adjust servings → done → verify inventory
- **Structure:** One test file (`e2e/tests/cooking.spec.ts`) + one page object (`e2e/pages/CookingPage.ts`), matching the existing conventions
- **Test setup:** `page.evaluate()` to seed IndexedDB directly (avoids 10–15 UI steps for creating items and a recipe before testing cooking behavior)
- **Test teardown:** Same IndexedDB/localStorage/sessionStorage cleanup as existing tests

## Files

```
e2e/
  pages/
    CookingPage.ts       ← new page object
  tests/
    cooking.spec.ts      ← new test file
```

## CookingPage Page Object

Methods to encapsulate cooking-page-specific selectors:

| Method | Selector |
|--------|----------|
| `navigateTo()` | `page.goto('/cooking')` |
| `checkRecipe(name)` | `getByLabel(name)` (recipe checkbox, `aria-label={recipe.name}`) |
| `expandRecipe(name)` | `getByLabel('Expand {name}')` (chevron button) |
| `uncheckItem(name)` | `getByLabel('Remove {name}')` (per-item checkbox when checked) |
| `increaseServings()` | `getByLabel('Increase servings')` |
| `clickDone()` | `getByRole('button', { name: 'Done' })` |
| `confirmDone()` | `getByRole('alertdialog').getByRole('button', { name: 'Confirm' })` |

## Test Data

Seeded via `page.evaluate()` into the `Player1Inventory` IndexedDB:

- **Item A** — "Flour", `packedQuantity: 10`, `consumeAmount: 1`, `targetUnit: 'package'`
- **Item B** — "Eggs", `packedQuantity: 12`, `consumeAmount: 1`, `targetUnit: 'package'`
- **Recipe** — "Pancakes", items: `[{ Flour, defaultAmount: 2 }, { Eggs, defaultAmount: 3 }]`

## Happy Path Test Flow

**Test name:** `'user can cook a recipe with partial items and multiple servings'`

**Given:** Items and recipe seeded in IndexedDB

**When:**
1. Navigate to `/cooking`
2. Check "Pancakes" recipe checkbox (both items checked by default)
3. Expand "Pancakes" to see items
4. Uncheck "Eggs" (click `Remove Eggs` checkbox)
5. Increase servings from 1 → 2 (click `Increase servings` once)
6. Click Done → confirm in dialog

**Then** (navigate to pantry, open each item's detail page):
- Flour `packedQuantity` = `10 - (2 servings × 2 defaultAmount)` = **6**
- Eggs `packedQuantity` = **12** (unchanged — was unchecked)

## Aria Labels Reference

From `cooking.tsx` and `ItemCard/index.tsx`:

- Recipe checkbox: `aria-label={recipe.name}` → `getByLabel('Pancakes')`
- Expand/collapse: `aria-label={\`Expand ${recipe.name}\`}` → `getByLabel('Expand Pancakes')`
- Per-item checkbox (checked): `aria-label={\`Remove ${item.name}\`}` → `getByLabel('Remove Eggs')`
- Serving increase: `aria-label="Increase servings"` → `getByLabel('Increase servings')`
- Done confirmation dialog: `AlertDialogTitle` = `"Consume from 1 recipe?"`, confirm button = `"Confirm"`
