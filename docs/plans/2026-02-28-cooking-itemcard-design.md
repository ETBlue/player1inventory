# Design: Use ItemCard in Cooking Page Expanded Recipes

## Overview

Replace the custom item rows in the cooking page's expanded recipe view with `ItemCard`, using a new `cooking` mode. Items are shown as a flat list below the recipe header card. Users can check/uncheck individual items to include or exclude optional ingredients from consumption.

## ItemCard Changes

### New `cooking` mode

Add `'cooking'` to the `mode` union type:

```ts
mode?: 'pantry' | 'shopping' | 'tag-assignment' | 'recipe-assignment' | 'cooking'
```

### Amount controls

`isAmountControllable` includes `'cooking'`:

```ts
const isAmountControllable = ['shopping', 'recipe-assignment', 'cooking'].includes(mode)
```

### Tags hidden

Tags, vendors, and recipes are hidden in `cooking` mode — same gate as `shopping`:

```ts
// Before
mode !== 'shopping'
// After
!['shopping', 'cooking'].includes(mode)
```

### minControlAmount default

Change default from `1` to `0`:

```ts
minControlAmount = 0,  // was 1
```

This allows amounts to reach 0 in cooking mode. Shopping page is unaffected — its `onAmountChange` handler already guards `newQty >= 1`.

## Cooking Page Changes

### New state: `checkedItemIds`

Track per-recipe per-item inclusion for optional ingredients:

```ts
// Map<recipeId, Set<itemId>>
const [checkedItemIds, setCheckedItemIds] = useState<Map<string, Set<string>>>(new Map())
```

Lifecycle:
- Recipe **checked** → init entry with all item IDs (all start included)
- Recipe **unchecked** → delete entry
- Per-item toggle → add/remove itemId from the recipe's set

### Updated `totalByItemId`

Only aggregate items that are checked:

```ts
for (const recipeId of checkedRecipeIds) {
  const recipeAmounts = sessionAmounts.get(recipeId) ?? new Map()
  const included = checkedItemIds.get(recipeId) ?? new Set()
  for (const [itemId, amount] of recipeAmounts) {
    if (amount > 0 && included.has(itemId)) {
      totals.set(itemId, (totals.get(itemId) ?? 0) + amount)
    }
  }
}
```

### New data hooks

Add `useTags()` and `useTagTypes()` at the top of the cooking page (required by ItemCard).

### Layout

Recipe header stays as a slim `Card` with checkbox + name + item count — no change.

When expanded, ItemCards appear as a flat `space-y-px` list directly below the recipe card (not nested inside it). Visual grouping via indentation.

Each ItemCard:

```tsx
<ItemCard
  item={item}
  tags={itemTags}
  tagTypes={tagTypes}
  mode="cooking"
  isChecked={checkedItemIds.get(recipe.id)?.has(ri.itemId) ?? true}
  onCheckboxToggle={() => handleToggleItem(recipe.id, ri.itemId)}
  controlAmount={recipeAmounts.get(ri.itemId) ?? ri.defaultAmount}
  onAmountChange={(delta) => handleAdjustAmount(recipe.id, ri.itemId, delta)}
/>
```

## Files Changed

- `src/components/ItemCard.tsx` — add `cooking` mode, update `isAmountControllable`, update tag-hiding gates, change `minControlAmount` default to `0`
- `src/routes/cooking.tsx` — add `checkedItemIds` state, update `totalByItemId`, add `useTags`/`useTagTypes`, replace custom item rows with `ItemCard`
- `src/components/ItemCard.stories.tsx` — add cooking mode story
- `src/components/ItemCard.test.tsx` — update tests for new default and cooking mode
- `src/routes/cooking.test.tsx` — add tests for per-item checkbox behavior
