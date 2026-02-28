# Item Card: Show Vendors and Recipes

**Date:** 2026-02-26
**Status:** Approved

## Overview

Extend item cards to display vendor and recipe associations alongside tags. When tags are collapsed, show counts for vendors and recipes. When tags are expanded, show vendor and recipe badges that are clickable for filtering. Add vendor and recipe dropdowns to the existing filters section.

Applies to: pantry, tag items tab, vendor items tab, recipe items tab. Not shopping page (tags already hidden there).

## Design

### ItemCard — New Props

```ts
vendors?: Vendor[]       // pre-computed from item.vendorIds
recipes?: Recipe[]       // pre-computed reverse lookup (Recipe[] containing this item)
onVendorClick?: (vendorId: string) => void
onRecipeClick?: (recipeId: string) => void
```

**Collapsed state** (`showTags=false`):
- Count row: `X tags · Y vendors · Z recipes`
- Zero counts are omitted (e.g. no vendors → `X tags · Z recipes`)

**Expanded state** (`showTags=true`):
- Tag badges (existing behavior)
- Vendor badges row below tags — neutral/secondary style (no colors)
- Recipe badges row below vendors — neutral/secondary style
- Each badge clickable → calls `onVendorClick` / `onRecipeClick`

### Filter State & URL Params

Extend `useUrlSearchAndFilters` with:
- `?f_vendor=<id>` — multi-select, comma-separated
- `?f_recipe=<id>` — multi-select, comma-separated

Both default to empty. Synced to URL params and sessionStorage (`item-list-search-prefs`) like existing tag filter state.

**Filter logic** (applied after tag filters, AND across all types):
- Vendor filter: show items where `item.vendorIds` intersects selected vendor IDs
- Recipe filter: show items where item appears in ANY selected recipe's `items[]`

**Redundant filter hiding:**
- Vendor items tab: vendor filter hidden (already scoped to one vendor)
- Recipe items tab: recipe filter hidden (already scoped to one recipe)

### ItemFilters Component

Two new dropdowns added after existing tag type dropdowns:
- **Vendors** — multi-select, shows vendor name + item count (uses `useVendors()` + `useVendorItemCounts()`)
- **Recipes** — multi-select, shows recipe name (uses `useRecipes()`)

Both follow the existing `TagTypeDropdown` pattern (button with active count, popover with checkboxes).

New props on `ItemFilters`:
- `vendors: Vendor[]`
- `recipes: Recipe[]`
- Selected IDs and toggle handlers via extended filter state shape

`FilterStatus` row gains chips for active vendor/recipe filters with same dismiss behavior as tag chips.

### Data Prep in Parent Pages

All four affected pages (pantry, tag items, vendor items, recipe items) add:

**Vendor map:**
```ts
const vendorMap = useMemo(() => {
  const map = new Map<string, Vendor[]>()
  for (const item of items) {
    map.set(item.id, vendors.filter(v => item.vendorIds?.includes(v.id) ?? false))
  }
  return map
}, [items, vendors])
```

**Recipe map** (reverse lookup):
```ts
const recipeMap = useMemo(() => {
  const map = new Map<string, Recipe[]>()
  for (const recipe of recipes) {
    for (const ri of recipe.items) {
      const existing = map.get(ri.itemId) ?? []
      map.set(ri.itemId, [...existing, recipe])
    }
  }
  return map
}, [recipes])
```

Each ItemCard receives `vendors={vendorMap.get(item.id) ?? []}` and `recipes={recipeMap.get(item.id) ?? []}`.

## Files Affected

- `src/components/ItemCard.tsx` — new vendor/recipe props and rendering
- `src/components/ItemCard.stories.tsx` — new stories for vendor/recipe display
- `src/components/ItemFilters.tsx` — vendor and recipe dropdowns
- `src/components/FilterStatus.tsx` — vendor and recipe chips
- `src/hooks/useUrlSearchAndFilters.ts` — vendor/recipe URL params and state
- `src/routes/index.tsx` (pantry) — vendor/recipe maps, filter application
- `src/routes/settings/tags/$id/items.tsx` — same
- `src/routes/settings/vendors/$id/items.tsx` — same, vendor filter hidden
- `src/routes/settings/recipes/$id/items.tsx` — same, recipe filter hidden
- `src/db/operations.ts` — possibly extend `filterItems()` for vendor/recipe filtering
