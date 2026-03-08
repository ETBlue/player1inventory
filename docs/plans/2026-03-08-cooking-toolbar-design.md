# Design: Cooking Page Toolbar Redesign

## Goal

Apply the same toolbar layout and button logic as the shopping page to the cooking page top bar.

## Current State

```
[Done] [Cancel]                    [+]
```

- Done and Cancel are both disabled (not hidden) when nothing is checked
- Cancel uses `neutral-ghost` variant with no icon
- Done uses default variant with no icon
- `+` button navigates to `/settings/recipes/new`

## Desired State

```
[Cooking N recipes · M items · ×S servings]  [flex-1]  [Cancel ×]  [Done ✓]  [🔍]
```

## Toolbar Behavior

### Count text (left)
- Visible only when `anyChecked` is true
- Format: `Cooking N recipes · M items · ×S servings`
  - `recipes` = number of recipes with at least one checked item (`recipesBeingConsumed`)
  - `items` = total checked item count (sum of all `checkedItemIds` set sizes across recipes)
  - `servings` = sum of `sessionServings` for checked recipes only
- Hidden (empty) when nothing is checked

### Cancel button
- Variant: `destructive-ghost` with X icon (matches shopping page pattern)
- Visible only when `anyChecked` — disappears entirely when nothing is checked
- Opens cancel confirmation dialog

### Done button
- Variant: default with Check icon
- Always visible, positioned to the right of Cancel
- Disabled when no items checked (same logic as now)
- Opens done confirmation dialog

### Search toggle button (🔍)
- Icon-only button, always visible
- Replaces the current `+` button
- Toggles search input row visibility (see cooking-search design doc)
- Active state when search row is visible

## Files to Change

- `src/routes/cooking.tsx` — toolbar section only
