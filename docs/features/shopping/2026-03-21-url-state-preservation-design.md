# Design — URL State Preservation for Cooking & Shopping

**Date:** 2026-03-21
**Branch:** `feature/preserve-url-state`

## Problem

Two list pages lose UI state when the user navigates to a detail page and returns:

| Page | Lost State |
|------|-----------|
| `/cooking` | Which recipe cards are expanded/collapsed |
| `/shopping` | Which vendor is selected in the toolbar dropdown |

Both reset because the state lives in `useState` — remounted on each navigation.

## Solution

Store both states in URL search params. `useAppNavigation.goBack()` already pushes the full previous URL (including search params), so state is automatically restored on back navigation.

---

## Cooking Page — `?expanded`

### URL Param

```
/cooking?sort=name&dir=asc&expanded=id1,id2,id3
```

- Comma-separated expanded recipe IDs
- Empty string (or absent) = all collapsed

### `validateSearch` change

```ts
validateSearch: (search: Record<string, unknown>) => ({
  sort: ...,
  dir: ...,
  q: ...,
  expanded: typeof search.expanded === 'string' ? search.expanded : '',
})
```

### State derivation

Replace `useState<Set<string>>(new Set())` with:

```ts
const { sort, dir, q, expanded } = Route.useSearch()
const expandedRecipeIds = useMemo(
  () => new Set(expanded ? expanded.split(',') : []),
  [expanded],
)
```

### Toggle functions

All toggle operations navigate with `replace: true` to avoid polluting history:

```ts
// Single card toggle
const newSet = new Set(expandedRecipeIds)
newSet.has(id) ? newSet.delete(id) : newSet.add(id)
navigate({ search: (prev) => ({ ...prev, expanded: [...newSet].join(',') }) }, { replace: true })

// Expand All
navigate({ search: (prev) => ({ ...prev, expanded: recipes.map(r => r.id).join(',') }) }, { replace: true })

// Collapse All
navigate({ search: (prev) => ({ ...prev, expanded: '' }) }, { replace: true })
```

### Search overlay (no change needed)

The cooking page already computes:
```ts
const isExpanded = searchMatchedItemIds ? true : expandedRecipeIds.has(recipe.id)
```
Navigating back with `?q` intact auto-restores search-expanded state. No additional changes required.

### Edge cases

- Deleted recipe IDs in `?expanded` are harmless (Set lookup returns false)
- Expand/collapse state is **not** reset on Done or Cancel — aligns with existing behavior (CLAUDE.md: "Expand/collapse state is preserved when Done or Cancel is confirmed")

---

## Shopping Page — `?vendor`

### URL Param

```
/shopping?vendor=abc123
```

- ID string of the selected vendor
- Empty string (or absent) = "All vendors"

### `validateSearch` addition

```ts
export const Route = createFileRoute('/shopping')({
  component: Shopping,
  validateSearch: (search: Record<string, unknown>) => ({
    vendor: typeof search.vendor === 'string' ? search.vendor : '',
  }),
})
```

### State derivation

Replace `useState<string>('')` with:

```ts
const { vendor: selectedVendorId } = Route.useSearch()
```

### Dropdown change handler

```ts
onValueChange={(value) =>
  navigate({ search: (prev) => ({ ...prev, vendor: value === 'all' ? '' : value }) }, { replace: true })
}
```

### Clear on checkout / abandon

After checkout and after cart abandonment succeed, clear the vendor param:

```ts
navigate({ search: (prev) => ({ ...prev, vendor: '' }) })
```

### Edge cases

- Stale vendor ID (vendor deleted): `vendorScopedItems` filter returns all items (no item has the deleted vendor's ID), silently acts as "All vendors"
- Select trigger display: if `selectedVendorId` is set but vendor no longer exists, `SelectValue` shows the placeholder ("All vendors") — acceptable graceful degradation

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/routes/cooking.tsx` | Add `expanded` to `validateSearch`; derive `expandedRecipeIds` from URL; update all toggle handlers |
| `apps/web/src/routes/shopping.tsx` | Add `validateSearch`; derive `selectedVendorId` from URL; clear on checkout/abandon |
| `apps/web/src/routes/cooking.test.tsx` | Tests for expand/collapse URL persistence |
| `apps/web/src/routes/shopping.test.tsx` | Tests for vendor URL persistence and clear-on-checkout |
| `apps/web/src/routes/cooking.stories.tsx` | Update stories to pass `expanded` in search params |

---

## CLAUDE.md Updates Required

- Shopping page: remove "State is not persisted" note for vendor selection
- Cooking page: clarify that `expandedRecipeIds` is URL-driven, not local state
