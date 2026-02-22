# Cooking / Consumption Feature Design

**Date:** 2026-02-22
**Status:** Approved

## Overview

Add a new "Use" page (cooking/consumption) to the main navigation and a "Recipes" management section in Settings. Users build reusable recipes (groups of items with default consumption amounts), then check off recipes on the Use page and confirm to deduct inventory in bulk.

## Decisions

- **Feature name:** "Use" page (top-level nav), "Recipes" (the collections)
- **Navigation order:** Pantry | Shopping | Use | Settings (4 items)
- **Amount merging:** When the same item appears in multiple checked recipes, amounts are summed
- **Inventory logs:** Each item deduction creates an inventory log entry ("consumed via recipe")
- **Amount bounds:** No minimum (amount can be 0, meaning skip that item this session); no maximum
- **Item creation from recipe Items tab:** Minimal (name only), same as vendor/tag pattern
- **Back navigation:** Uses `useAppNavigation().goBack()` — context-aware (returns to cooking page or settings/recipes list based on where user came from)
- **Settings entry:** Settings keeps a dedicated Recipes management page (like Vendors)

## Data Model

**New types in `src/types/index.ts`:**

```ts
interface RecipeItem {
  itemId: string
  defaultAmount: number  // in item's native unit (measurement or package)
}

interface Recipe {
  id: string
  name: string
  items: RecipeItem[]
  createdAt: Date
  updatedAt: Date
}
```

`RecipeItem.defaultAmount` defaults to `item.consumeAmount` when adding an item to a recipe (falls back to 1 if `consumeAmount` is 0 or unset).

## Database

**New Dexie store** in `src/db/index.ts`: `recipes` table with `id` as primary key. New schema version required.

**New operations in `src/db/operations.ts`:**

```ts
getRecipes(): Promise<Recipe[]>
getRecipe(id: string): Promise<Recipe | undefined>
createRecipe(input: { name: string; items?: RecipeItem[] }): Promise<Recipe>
updateRecipe(id: string, updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>): Promise<void>
deleteRecipe(id: string): Promise<void>
getItemCountByRecipe(recipeId: string): Promise<number>
```

**Cascade deletion:** `deleteItem(id)` must also remove the item from any `recipe.items` arrays (same pattern as removing item from vendor/tag references). `deleteRecipe(id)` is standalone — no cascade needed.

## Hooks

**New `src/hooks/useRecipes.ts`:**

```ts
useRecipes()                    // returns Recipe[]
useRecipe(id: string)           // returns Recipe | undefined
useCreateRecipe()               // useMutation
useUpdateRecipe()               // useMutation, takes { id, updates }
useDeleteRecipe()               // useMutation
useItemCountByRecipe(id)        // returns number, for delete confirmation
```

Cache invalidation: mutation hooks invalidate `['recipes']` query. `deleteItem` must also invalidate `['recipes']`.

## Routes

### Bottom Navigation

`src/components/BottomNav.tsx` (or equivalent): add "Use" as 3rd item between Shopping and Settings. Icon: `UtensilsCrossed` from lucide-react.

### Use Page (`/cooking`)

**File:** `src/routes/cooking.tsx`

**Toolbar:**
- Left: "Done" button (disabled when 0 recipes checked), "Cancel" button (disabled when 0 checked)
- Right: "New Recipe" button (always visible)

**Recipe card (unchecked):**
- Checkbox (left) toggles selection
- Card body / recipe name navigates to recipe detail page (`/settings/recipes/$id`)
- Item count badge (e.g., "6 items")

**Recipe card (checked, expanded inline):**
- Shows each recipe item with `−` | amount | `+` controls
- Step = `item.consumeAmount` (or 1 if unset)
- Amount pre-filled from `recipe.items[].defaultAmount`
- Amount can be adjusted to 0 (means "skip this item this session")

**Done flow:**
1. User clicks "Done" → confirmation dialog: "Consume items from [N] recipe(s)? This will reduce your inventory."
2. On confirm: for each item across all checked recipes, sum amounts (skip items with amount = 0) → update `item.unpackedQuantity` → create inventory log entry with note `"consumed via recipe"` → deselect all recipes, reset amounts to defaults
3. If any item would go below 0: show warning in confirmation dialog (user can still proceed)

**Cancel flow:**
1. User clicks "Cancel" (when ≥1 recipe checked) → confirmation dialog: "Discard all selections?"
2. On confirm: deselect all, reset all amounts to recipe defaults

**Empty state:** "No recipes yet." with a "New Recipe" button.

### Recipe Management in Settings

**Settings index** (`src/routes/settings/index.tsx`): add "Recipes" link card alongside Tags and Vendors.

**Recipe list** (`src/routes/settings/recipes/index.tsx`):
- Toolbar: back button + "New Recipe" button
- List: one recipe card per recipe — name + item count (e.g., "Pasta · 6 items")
- Tap card name → recipe detail
- Delete button per card → confirmation dialog ("Delete [name]? This won't affect your inventory.")
- Empty state when no recipes

**New recipe** (`src/routes/settings/recipes/new.tsx`):
- Name input + Save button
- After save: redirect to `/settings/recipes/$id`

**Recipe detail parent layout** (`src/routes/settings/recipes/$id.tsx`):
- Tabbed layout: Info tab + Items tab
- Back button uses `useAppNavigation().goBack()` — context-aware navigation
- Dirty state guard on Info tab (same as vendor/tag layout pattern)
- New `src/hooks/useRecipeLayout.tsx` context provider

**Info tab** (`src/routes/settings/recipes/$id/index.tsx`):
- Edit recipe name + Save button
- Tracks dirty state; navigation guard prevents leaving with unsaved changes

**Items tab** (`src/routes/settings/recipes/$id/items.tsx`):
- Combined search + create input at top
- Checklist of all items:
  - Unchecked: item is not in this recipe
  - Checked: item is in this recipe; shows inline `defaultAmount` field (numeric, editable)
- Checking an item: adds it with `defaultAmount = item.consumeAmount ?? 1`, saves immediately
- Unchecking an item: removes it from recipe, saves immediately
- Changing `defaultAmount`: saves immediately (no Save button)
- Typing a name with no match: `+ Create "<name>"` row appears → creates item (name only) and immediately adds to recipe
- Pressing Escape clears the search input
- No unsaved state — all changes are immediate

## Reused Components

- `RecipeNameForm.tsx` — presentational form (name input + save button), used by new recipe page and Info tab; mirrors `VendorNameForm.tsx`
- `RecipeCard.tsx` — displays one recipe on the list page; mirrors `VendorCard.tsx`
- `Toolbar` — shared toolbar wrapper
- `useAppNavigation()` — smart back navigation

## Error Handling & Edge Cases

- **Insufficient stock:** Warning shown in confirmation dialog; deduction proceeds regardless (stock can go negative, same as existing behavior)
- **Item deleted from system:** `deleteItem()` cascade removes item from all `recipe.items` arrays; recipe remains intact
- **Recipe with 0 items:** Can exist; checking it and confirming is a no-op
- **`consumeAmount` = 0 or unset:** `defaultAmount` falls back to 1; +/- step = 1
- **Amount = 0 on Use page:** Item is skipped (no log entry, no inventory change)

## Testing

**DB operations** (`src/db/operations.test.ts`):
- `user can create a recipe`
- `user can update a recipe name`
- `user can delete a recipe`
- `user can list all recipes`
- `deleteItem removes item from recipe items arrays`

**Use page** (`src/routes/cooking.test.tsx`):
- `user can see the recipe list`
- `user can check a recipe and see item amounts`
- `user can adjust item amounts with +/- buttons`
- `user can confirm consumption and reduce inventory`
- `user can cancel and deselect all recipes`
- `user can see empty state when no recipes exist`

**Settings recipe pages** (`src/routes/settings/recipes/$id.test.tsx`):
- `user can edit a recipe name`
- `user can add an item to a recipe`
- `user can remove an item from a recipe`
- `user can change the default amount for a recipe item`
- `user can create a new item from the recipe items tab`

## Out of Scope

- Recipe reordering or drag-and-drop
- Recipe categories or tags
- Recipe notes or descriptions
- Serving size multipliers
- History of which recipes were used
