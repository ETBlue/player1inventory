# Cooking Page — Sort Recipes by Item Expiration

## Overview

Add an "Expiration" sort option to the cooking page. Recipes are sorted by their earliest-expiring ingredient, with the most urgent recipes (soonest to expire) at the top.

## Motivation

Users with expiring items should be guided toward recipes that use those items before they go bad. Surfacing these recipes by default (or by explicit sort) reduces food waste.

## Sort Behavior

- **Sort key:** `min(item.dueDate)` across all items in a recipe — the earliest `dueDate` among the recipe's ingredients
- **Sort direction:** Ascending → soonest-expiring recipe first (urgency at top)
- **Recipes with no expiring items:** Sort to the bottom (treat as `dueDate = Infinity`)
- **Items with no `dueDate`:** Excluded from the min calculation; if all items have no `dueDate`, recipe sorts to the bottom

## Integration with Existing Sort

- Added as a new option `expiration` in the `?sort` URL param (alongside `name`, `recent`, `count`)
- Sort direction button (`?dir`) applies normally — `asc` = soonest first, `desc` = latest first
- Default sort remains `name` asc — this is opt-in

## Data Requirements

- Requires `item.dueDate` — this is the field added by the `feature/expiration-mode` branch (currently in progress)
- Items are accessed via `Recipe.items[]` — the recipe data model already includes item references
- No new data model changes required beyond `dueDate` being available on items

## Files Affected (estimate)

| File | Change |
|------|--------|
| `src/routes/cooking.tsx` | Add `expiration` sort option to `sortedRecipes` memo; add to `?sort` param type |
| `src/components/recipe/CookingControlBar/index.tsx` | Add "Expiration" option to sort dropdown |
| `src/routes/cooking.test.tsx` | Add tests for expiration sort |
| `src/routes/cooking.stories.tsx` | Update stories |

## Open Questions

- Should expired items (past `dueDate`) sort differently from soon-to-expire items?
- Should this sort option only appear after `feature/expiration-mode` is fully shipped?
- Display: should the expiration sort show a "Expires soon" badge on the recipe card?

## Status

🔲 Pending — depends on `feature/expiration-mode` being merged first
