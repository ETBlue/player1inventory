# Design: Cooking Page Search Integration

## Goal

Replace the `+` button in the cooking toolbar with a search toggle that filters both recipes and items, with inline recipe creation when no exact match exists.

## Search Toggle

The `🔍` icon button in the toolbar (see cooking-toolbar design doc) toggles a search input row below the toolbar. Clicking it again, pressing Escape, or clearing the input hides the row.

## Search Input Row

```
[search input ..................] [+ Create | × clear]
```

- No search icon prefix inside the row
- `+ Create` button (primary, sm): shown when `search.trim()` is non-empty AND no exact recipe title match exists
  - Clicking or pressing Enter navigates to `/settings/recipes/new?name=<query>`
- `× clear` button (neutral-ghost, icon): shown when an exact recipe title match exists
  - Clicking clears the search query
- Pressing Escape clears query and hides the search row

## Filtering Logic

Search query is stored in local component state (not URL params — cooking search is session-contextual).

### Recipe visibility
- Recipe is visible if: recipe title partially matches the query, OR any of its items partially match the query
- Recipe is hidden if: neither the recipe title nor any item matches

### Item visibility within a recipe
- Items are shown (recipe auto-expanded) only when at least one item matches the query
- Only matching items are shown — non-matching siblings are hidden
- If only the recipe title matches (no item matches): recipe is visible but items remain hidden (not expanded)

### Text highlighting
- Matched substring in recipe titles is highlighted
- Matched substring in item names is highlighted
- Use a styled `<span>` (e.g. `font-semibold` or `bg-yellow-100`) to wrap the matched portion

### Create button condition
- `+ Create` appears when: `search.trim()` is non-empty AND no recipe title is an exact (case-insensitive) match
- This allows creation even when partial matches are visible in the list below

### No matches
- When no recipe or item matches at all: only the `+ Create` button is shown in the input row; list is empty

## State

- `searchQuery: string` — local `useState` in `cooking.tsx`
- `searchVisible: boolean` — local `useState`, toggled by the 🔍 button

## Files to Change

- `src/routes/cooking.tsx` — search state, filter logic, input row, recipe/item rendering
