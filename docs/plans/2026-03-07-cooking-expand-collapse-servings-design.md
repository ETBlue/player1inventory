# Cooking Page: Expand/Collapse Recipes + Serving Count

Date: 2026-03-07

## Overview

Two related enhancements to the cooking page:

1. Allow users to expand/collapse recipe cards independently of checking them
2. Allow users to set a serving count per recipe (integer multiplier applied to all ingredient amounts)

## State Model

### Removed

- `checkedRecipeIds: Set<string>` — no longer needed; recipe check state is now fully derived from `checkedItemIds`

### Added

- `expandedRecipeIds: Set<string>` — tracks which recipe cards are expanded; all start collapsed; purely layout, no effect on check or amount state
- `sessionServings: Map<recipeId, number>` — integer ≥ 1, initialized to `1` on first interaction (expand or checkbox click)

### Existing State (semantics shift)

- `sessionAmounts: Map<recipeId, Map<itemId, number>>` — now stores **per-serving** amounts (initialized from `defaultAmount`, adjusted by per-item ±buttons); initialized on first interaction
- `checkedItemIds: Map<recipeId, Set<itemId>>` — initialized on first interaction (was previously initialized on checkbox click only)

### Derived Values

| Value | Derivation |
|---|---|
| Recipe checkbox tri-state | All `recipe.items` in `checkedItemIds[id]` → checked; some → indeterminate; none → unchecked |
| `anyChecked` | Any recipe has ≥ 1 checked item in `checkedItemIds` |
| `totalByItemId` | `sessionServings[recipeId] × sessionAmounts[recipeId][itemId]` for each checked item |

### Initialization Trigger

State for a recipe (`sessionAmounts`, `sessionServings`, `checkedItemIds`) is initialized on first interaction — either expanding the card or clicking the checkbox — whichever comes first.

## Recipe Checkbox Behavior

| Current state | Click result |
|---|---|
| Unchecked | All items checked |
| Indeterminate | All items checked |
| Checked | All items unchecked |

If the recipe has never been interacted with, initialize state first, then apply the toggle.

## UI Layout

```
Row 1: [checkbox] | [recipe name →detail link  ···  chevron▼▶] | [  − N +  ]
Row 2:            | [N items, M selected]                       |
```

- **Checkbox** — tri-state (checked / indeterminate / unchecked), derived from `checkedItemIds`
- **Recipe name** — link to recipe detail page (unchanged)
- **Chevron** — right-aligned inside the middle flex-1 section; ChevronDown when expanded, ChevronRight when collapsed; clicking toggles `expandedRecipeIds`
- **Serving stepper** (`− N +`) — fixed-width rightmost slot; always reserved; empty when recipe unchecked, shows stepper when checked; min = 1; same ±button pattern as item amount controls
- **Subtitle** (Row 2) — always visible regardless of expand/collapse; indented to align under recipe name; format: `N items, M selected`

## Items List (when expanded)

Unchanged from current implementation:
- Sorted by expiry date
- Per-item checkbox — toggles inclusion in `checkedItemIds`
- Per-item ±buttons — adjust per-serving amount in `sessionAmounts`; step = `item.consumeAmount`
- Items with `defaultAmount === 0` start unchecked

## Consumption Calculation

```
totalByItemId[itemId] = sum over recipes:
  sessionServings[recipeId] × sessionAmounts[recipeId][itemId]
  (only for items in checkedItemIds[recipeId] with amount > 0)
```

## Files Affected

- `src/routes/cooking.tsx` — all changes contained here
