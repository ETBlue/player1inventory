# Sort & Filter for Items Pages — Design

**Date:** 2026-02-24
**Status:** Approved

## Overview

Add pantry-style sort controls and tag filter UI to four additional pages:

- Tag items tab (`/settings/tags/$id/items`)
- Vendor items tab (`/settings/vendors/$id/items`)
- Recipe items tab (`/settings/recipes/$id/items`)
- Shopping page (`/shopping`) — sort controls only (already has tag filter)

---

## Goals

- Users can sort and filter items by the same criteria available on the pantry page
- Sort and filter state persists (sort → localStorage, filter → sessionStorage) per page type
- Existing search input (name filter + create shortcut) on assignment pages is preserved
- Shopping page keeps its Cart/Pending sections; sort applies within each section

---

## Architecture

### New Hook: `useSortFilter`

**File:** `src/hooks/useSortFilter.ts`

```ts
useSortFilter(storageKey: string) → {
  sortBy: SortField
  sortDirection: SortDirection
  setSortBy: (field: SortField) => void
  setSortDirection: (dir: SortDirection) => void
  filterState: FilterState
  setFilterState: (state: FilterState) => void
  filtersVisible: boolean
  setFiltersVisible: (v: boolean) => void
  tagsVisible: boolean
  setTagsVisible: (v: boolean) => void
}
```

**Persistence:**
- Sort: `{storageKey}-sort-prefs` in `localStorage` (survives page reloads)
- Filter: `{storageKey}-filters` in `sessionStorage` (cleared on reload)
- UI prefs (filtersVisible, tagsVisible): `{storageKey}-ui-prefs` in `sessionStorage`

**Defaults:** `sortBy: 'name'`, `sortDirection: 'asc'`, filters empty, panels hidden.

**Storage keys per page type:**
- Tag items: `tag-items`
- Vendor items: `vendor-items`
- Recipe items: `recipe-items`
- Shopping (sort only, shared with existing filter keys): `shopping`

**Note:** The pantry page keeps its existing inline sort/filter logic for now. It can be migrated to `useSortFilter` later as a cleanup task.

---

## Tag / Vendor / Recipe Items Tabs

### UI Layout

```
[Search input — existing, full width]
[Filter btn] [Tags btn] [Sort dropdown ▾] [↑/↓ toggle]
[ItemFilters row — tag dropdowns, shown when Filter active]
[Item list — filtered by search then tag filter, then sorted]
```

The second row uses the same control pattern as `PantryToolbar`:
- **Filter button** (`Filter` icon): toggles `ItemFilters` row
- **Tags button** (`Tag` icon): toggles tag badge visibility on item cards
- **Sort dropdown**: name / stock / purchased / expiring
- **Direction toggle**: ↑ ascending / ↓ descending

### Data Loading

Sorting by `stock`, `purchased`, or `expiring` requires computed maps currently only loaded on the pantry page. These hooks will be added to each assignment page:
- Quantities map (for stock sort)
- Expiry dates map (for expiring sort)
- Purchase dates map (for purchased sort)

These queries use `enabled: items.length > 0` so empty pages remain fast.

### Tag Filter Scope

The `ItemFilters` component shows all tags (including the current tag on the tag items tab). No special exclusion logic — keeps implementation simpler.

### Filter Application Order

1. Search filter (existing name substring match)
2. Tag filter (`filterItems()` from `filterUtils.ts`)
3. Sort (`sortItems()` from `sortUtils.ts`)

---

## Shopping Page

### UI Layout

```
[Vendor dropdown] [Filter btn] [Sort dropdown ▾] [↑/↓ toggle]
[ItemFilters row — when Filter active]
[Cart section — sorted by user's chosen field]
[Pending section — sorted by user's chosen field]
```

### Changes

- Add sort dropdown + direction toggle to the existing shopping toolbar
- Sort state from `useSortFilter('shopping')` — only `sortBy` and `sortDirection` used; existing `shopping-filters` and `shopping-ui-prefs` sessionStorage keys are unchanged
- Apply `sortItems()` within Cart and Pending sections independently
- Cart/Pending grouping preserved; sort controls determine order within each group

---

## Files to Create

- `src/hooks/useSortFilter.ts` — new shared hook

## Files to Modify

- `src/routes/settings/tags/$id/items.tsx` — add sort/filter controls + data hooks
- `src/routes/settings/vendors/$id/items.tsx` — add sort/filter controls + data hooks
- `src/routes/settings/recipes/$id/items.tsx` — add sort/filter controls + data hooks
- `src/routes/shopping.tsx` — add sort controls to toolbar, apply sort in sections
- Tests and stories for each modified file

---

## Out of Scope

- Migrating pantry page to use `useSortFilter`
- Per-instance storage keys (e.g., per-tag filter state)
- Removing the Cart/Pending section grouping on shopping page
