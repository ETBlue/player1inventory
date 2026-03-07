# ItemCard Storybook Reorganization Design

## Goal

Remove visual duplicate stories and restructure the ItemCard Storybook into mode-based sub-folders for better discoverability in the Storybook sidebar.

## Problem

The current `ItemCard.stories.tsx` has several issues:

- **Visual duplicates**: `Default` and `StatusOK` are identical; `LowStock` and `StatusError` are identical; `WithVendorsAndRecipesExpanded` and `WithVendorAndRecipeClickHandlers` are near-identical
- **No grouping**: Status stories are scattered between content and mode stories
- **Mixed mock data**: Each story redefines the same mock objects inline

## Approach

Split one file into multiple story files (one per mode) with a shared fixtures file.

## File Structure

**Delete:** `src/components/ItemCard.stories.tsx`

**Create:**

```
src/components/
  ItemCard.stories.fixtures.ts         # shared mock data + router wrapper
  ItemCard.pantry.stories.tsx          # title: Components/ItemCard/Pantry
  ItemCard.shopping.stories.tsx        # title: Components/ItemCard/Shopping
  ItemCard.cooking.stories.tsx         # title: Components/ItemCard/Cooking
  ItemCard.assignment.stories.tsx      # title: Components/ItemCard/Assignment
  ItemCard.variants.stories.tsx        # title: Components/ItemCard/Variants
```

## Fixtures File (`ItemCard.stories.fixtures.ts`)

Exports:

- `mockItem` — base item (Yogurt, package mode)
- `mockDualUnitItem` — dual-unit item (Purple grapes, measurement mode)
- `mockTags` — single tag: Dairy (blue, Category)
- `mockTagTypes` — single tag type: Category (blue)
- `mockMultipleTags` — 4 tags: Dairy, Organic, Local, Sale
- `mockMultipleTagTypes` — 4 types: Category (blue), Quality (green), Source (amber), Price (red)
- `mockVendors` — [Costco, Safeway]
- `mockRecipes` — [Pancakes]
- `RouterWrapper` — component wrapping QueryClientProvider + TanStack Router
- `sharedDecorator` — Storybook decorator using RouterWrapper + max-w-md container

## Story Inventory

### Pantry (`Components/ItemCard/Pantry`)

Status progression + expiration + ±buttons:

| Story name | Key args |
|---|---|
| `StatusInactive` | targetQuantity=0, refillThreshold=0, quantity=0 |
| `StatusOK` | quantity=2, refillThreshold=1 |
| `StatusWarning` | quantity=1 (equals refillThreshold) |
| `StatusError` | quantity=0 (below refillThreshold) |
| `ExpiringSoon` | estimatedDueDate = 2 days from now |
| `ExpiringRelative` | estimatedDueDays=2, dual-unit item |
| `WithAmountButtons` | onAmountChange provided, mode=pantry |

### Shopping (`Components/ItemCard/Shopping`)

| Story name | Key args |
|---|---|
| `NotInCart` | isChecked=false, showTags=false |
| `InCart` | isChecked=true, controlAmount=3, showTags=false |

### Cooking (`Components/ItemCard/Cooking`)

| Story name | Key args |
|---|---|
| `ItemIncluded` | isChecked=true, controlAmount=4, showTags=false |
| `ItemExcluded` | isChecked=false, controlAmount=2, showTags=false |

### Assignment (`Components/ItemCard/Assignment`)

| Story name | Key args |
|---|---|
| `TagChecked` | mode=tag-assignment, isChecked=true |
| `TagUnchecked` | mode=tag-assignment, isChecked=false |
| `RecipeAssigned` | mode=recipe-assignment, isChecked=true, controlAmount=2 |
| `RecipeUnassigned` | mode=recipe-assignment, isChecked=false |

### Variants (`Components/ItemCard/Variants`)

Content and filter variations in pantry context:

| Story name | Key args |
|---|---|
| `TagsHidden` | showTags=false, showTagSummary=true (shows "1 tag" summary) |
| `MultipleTags` | 4 tags, 4 tag types with different colors |
| `VendorsAndRecipesCollapsed` | vendors+recipes, showTags=false (summary text visible) |
| `VendorsAndRecipesExpanded` | vendors+recipes, showTags=true, with click handlers |
| `ActiveTagFilter` | 4 tags, activeTagIds=['tag-1','tag-3'] (some highlighted) |
| `ActiveVendorFilter` | vendors+recipes, activeVendorIds=['v1'] (Costco highlighted) |

## Duplicates Removed

| Removed story | Merged into |
|---|---|
| `Default` | `Pantry/StatusOK` |
| `LowStock` | `Pantry/StatusError` |
| `WithVendorsAndRecipesExpanded` | `Variants/VendorsAndRecipesExpanded` (with click handlers) |
| `WithVendorAndRecipeClickHandlers` | (merged above) |

## New Stories Added

- `Pantry/WithAmountButtons` — previously untested pantry ±button behavior
- `Variants/ActiveVendorFilter` — previously missing, tests vendor badge highlight state
