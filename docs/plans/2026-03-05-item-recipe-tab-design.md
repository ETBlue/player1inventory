# Item Page Improvements: Recipe Tab & Inline Vendor/Recipe Creation

**Date:** 2026-03-05
**Status:** Approved

## Overview

Two improvements to the item detail page:

1. **New Recipes tab** — shows all recipes as click-to-toggle badges, mirroring the vendor tab pattern
2. **Inline creation buttons** — both the Vendor tab and the new Recipe tab gain a "New" button (dialog-based, same as tags tab "New Tag") to create and immediately assign a vendor or recipe without leaving the item page

## Tab Structure

**Before:** Info+Stock | Tags | Vendors | Logs

**After:** Info+Stock | Tags | Vendors | **Recipes** | Logs

The Recipes tab inserts between Vendors and Logs. Icon: `UtensilsCrossed` or `ChefHat` from lucide-react (to be decided during implementation).

## Recipe Tab

### Data Model

No changes to the `Item` type. The recipe-item relationship is stored on `Recipe.items[]` (recipe-centric, single source of truth).

The tab derives "assigned recipes" inline:
```ts
const assignedRecipes = recipes.filter(r => r.items.some(ri => ri.itemId === item.id))
```

### Toggle Behavior

- **Assign** (add item to recipe): call `updateRecipe` with `items: [...recipe.items, { itemId: item.id, defaultAmount: 0 }]`
- **Unassign** (remove item from recipe): call `updateRecipe` with `items: recipe.items.filter(ri => ri.itemId !== item.id)`
- Immediate save on toggle
- No Save button, no dirty state

`defaultAmount: 0` on new assignments — treats the item as optional/disabled by default in the recipe. Users can adjust via the recipe detail page.

### Badge Styling

Matches vendor tab exactly:
- Unassigned: `neutral-outline` variant
- Assigned: `neutral` (filled) variant + X icon

Recipe names use `capitalize` (per Name Display Convention — recipes follow the same casing as items and tags).

### Hooks Used

- `useRecipes()` — fetch all recipes
- `useUpdateRecipe()` — mutate recipe.items on toggle

### New Recipe Button

Always visible at the bottom of the badge list. Opens a dialog (same dialog pattern as tags tab "New Tag"). On confirm:
1. Create recipe with `{ name, items: [{ itemId: item.id, defaultAmount: 0 }] }` via `useCreateRecipe()`
2. Recipe immediately appears as assigned in the badge list

## Vendor Tab Enhancement

Adds a "New Vendor" button — always visible, same placement and dialog pattern as "New Recipe".

On confirm:
1. Create vendor via `useCreateVendor()`
2. Add new vendor's ID to `item.vendorIds` via `useUpdateItem()`
3. Vendor immediately appears as assigned in the badge list

## Files Changed

### New
- `src/routes/items/$id/recipes.tsx` — Recipe tab route

### Modified
- `src/routes/items/$id.tsx` — Add Recipes tab link in nav (between Vendors and Logs)
- `src/routes/items/$id/vendors.tsx` — Add "New Vendor" button + dialog

## Implementation Notes

- The recipe tab compute (`recipes.filter(...)`) runs client-side on the already-fetched recipes list — no extra network calls
- The toggle write path differs from vendors (updates Recipe, not Item) but the UX is identical
- The dialog for inline creation mirrors the tags tab pattern; reuse the same dialog component if it exists as a shared component, or implement inline
- No Storybook stories needed for the route files (routes are integration-tested, not story-tested); check if dialog component needs a story
