# Unified Filter Pipeline Design

**Date:** 2026-02-28
**Branch:** feature/shopping-pin (to be implemented on a new branch)

## Problem

Item list pages mix search and filters in one chained pipeline. The tag filter is bypassed during search, but vendor and recipe filters are not — causing inconsistent behavior. Additionally, vendor items and recipe items pages suppress certain filter UI controls unnecessarily.

Specific bugs:
- Pantry: vendor and recipe filters still apply during search
- Vendor items: recipe filter still applies during search
- Recipe items: vendor filter still applies during search

## Design

### Unified pattern (all pages except shopping)

```typescript
// Branch A: search only
const searchedItems = items.filter((item) =>
  item.name.toLowerCase().includes(search.toLowerCase())
)

// Branch B: all filters, no search
const tagFiltered = filterItems(items, filterState)
const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
const filteredItems = filterItemsByRecipes(vendorFiltered, selectedRecipeIds, recipes)

// Converge at sort
const sortedItems = sortItems(
  search.trim() ? searchedItems : filteredItems,
  ...
)
```

Search and filters are mutually exclusive — they never combine. `search.trim()` is the single decision point.

### Shopping page exception

The vendor single-select is a pre-scope that applies to `filteredItems` only. Search always runs against all items.

```typescript
// Vendor pre-scope (filter branch only)
const vendorScopedItems = selectedVendorId
  ? items.filter((item) => item.vendorIds?.includes(selectedVendorId))
  : items

// Branch A: search on ALL items (no vendor scope)
const searchedItems = items.filter((item) =>
  item.name.toLowerCase().includes(search.toLowerCase())
)

// Branch B: vendor-scoped, then tags + recipes
const tagFiltered = filterItems(vendorScopedItems, filterState)
const filteredItems = filterItemsByRecipes(tagFiltered, selectedRecipeIds, recipes)

const sortedItems = sortItems(search.trim() ? searchedItems : filteredItems, ...)
```

## Per-page summary

| Page | `filteredItems` pipeline | Filter UI |
|------|--------------------------|-----------|
| Pantry | tags → vendors → recipes | all |
| Shopping | vendor-scoped → tags → recipes | tags + recipes (vendor is pre-scope select) |
| Tag items | tags → vendors → recipes | all |
| Vendor items | tags → vendors → recipes | all (remove `hideVendorFilter`) |
| Recipe items | tags → vendors → recipes | all (remove `hideRecipeFilter`) |

## What does not change

- `ItemListToolbar` already passes `disabled={!!search}` to `ItemFilters` — filter controls remain visually disabled during search. No changes to the toolbar component.
- Pages with assigned-first sorting (vendor items, recipe items) keep that split — applied to whichever branch (`searchedItems` or `filteredItems`) won.
- `FilterStatus` counts remain correct — the toolbar's internal filter computation matches `filteredItems`.

## Files to change

- `src/routes/index.tsx` — pantry page
- `src/routes/shopping.tsx` — shopping page
- `src/routes/settings/tags/$id/items.tsx` — tag items tab
- `src/routes/settings/vendors/$id/items.tsx` — vendor items tab (also remove `hideVendorFilter`)
- `src/routes/settings/recipes/$id/items.tsx` — recipe items tab (also remove `hideRecipeFilter`)
