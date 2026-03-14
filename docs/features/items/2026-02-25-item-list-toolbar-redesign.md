# ItemListToolbar Redesign — Design Doc

**Date:** 2026-02-25
**Status:** Approved

---

## Overview

Redesign `SortFilterToolbar` → **`ItemListToolbar`**: a unified toolbar for all item list pages. Goals:

1. Integrate search/create input (collapsible, inside toolbar)
2. Integrate `ItemFilters` and `FilterStatus` as sub-rows below toolbar
3. Support `leading` (left slot, e.g. vendor dropdown) and `children` (right slot, e.g. Add item)
4. Store search, filter, and UI visibility state in URL params — shared across item list pages via carry-over on navigation
5. Replace `PantryToolbar` (deleted after migration)
6. Apply to pantry, shopping, tag/vendor/recipe items pages

---

## Component Structure

```
<Toolbar className?>                              ← Row 1, always Toolbar
  {leading?} [Filter] [Tags?] [Sort▾] [↑/↓] [🔍] {spacer?} {children?}
</Toolbar>
[Search input — full width]                       ← Row 2, when searchVisible
[ItemFilters — full width]                        ← Row 3, when isFiltersVisible
[FilterStatus — full width]                       ← Row 4, when isFiltersVisible || active
```

- Row 1 is **always wrapped in `<Toolbar>`**. Consumer can pass `className` to customize.
- Rows 2–4 are siblings rendered below the Toolbar (no flex-wrap needed).
- The `searchVisible` toggle is a `useState` inside `ItemListToolbar`, initialized to `true` when `q` is non-empty (so search panel opens automatically when a query is carried over from another page).

---

## URL Params & State Management

All search/filter/UI visibility state is stored in URL params:

| URL param | Meaning |
|---|---|
| `?q=apple` | Search text |
| `?f_<tagTypeId>=tagId1,tagId2` | Filter state (one param per active tag type) |
| `?filters=1` | `isFiltersVisible` — filters panel visible |
| `?tags=1` | `isTagsVisible` — tag badges visible on ItemCards |

Sort preferences remain in localStorage (user pref, not shareable).

### Cross-page carry-over

When navigating from one item list page to another, search/filter state is preserved. Implementation via shared sessionStorage key (`item-list-search-prefs`):

1. **On mount**: if URL params absent → read shared key → seed URL params
2. **On change**: update URL params AND write to shared key
3. **Result**: each page starts with the carry-over state, then updates it as the user filters

---

## New Hook: `useUrlSearchAndFilters`

**File:** `src/hooks/useUrlSearchAndFilters.ts`

```ts
useUrlSearchAndFilters() → {
  search: string
  filterState: FilterState
  isFiltersVisible: boolean
  isTagsVisible: boolean
  setSearch: (q: string) => void          // replace: true
  setFilterState: (state: FilterState) => void
  setIsFiltersVisible: (v: boolean) => void
  setIsTagsVisible: (v: boolean) => void
}
```

Uses `useRouterState()` + `useNavigate()` from TanStack Router (route-agnostic). Also syncs to `item-list-search-prefs` sessionStorage key on every write for carry-over.

---

## `useSortFilter` Changes

Remove `filterState` / `setFilterState`. After this change, `useSortFilter` only manages sort preferences:

```ts
useSortFilter(storageKey) → {
  sortBy, sortDirection,
  setSortBy, setSortDirection,
}
```

`isFiltersVisible` and `isTagsVisible` are removed (moved to URL). `searchVisible` is internal to `ItemListToolbar`.

---

## `ItemListToolbar` Props

```ts
interface ItemListToolbarProps {
  // Sort (from useSortFilter)
  sortBy: SortField
  sortDirection: SortDirection
  onSortChange: (field: SortField, direction: SortDirection) => void

  // Tags toggle — only shown when this prop is provided
  // (shopping page omits it; pantry + assignment pages include it)
  isTagsToggleEnabled?: boolean

  // Items — for FilterStatus counts and ItemFilters available options
  items?: Item[]

  // Toolbar Row 1 customization
  className?: string    // passed to <Toolbar>
  leading?: ReactNode   // left of controls row
  children?: ReactNode  // right of controls row (add item, etc.)

  // Search create callback — called when Enter pressed with items empty
  onSearchSubmit?: (query: string) => void
}
```

**Removed from prior SortFilterToolbar:** `isFiltersVisible`, `onToggleFilters`, `isTagsVisible`, `onToggleTags`, `filterState`, `onFilterChange`, `tagTypes`, `tags`, `filteredCount`, `totalCount`, `toolbar` — all handled internally or via URL.

**Internal state:** `searchVisible` (useState, initialized from `q` param).

**Internal reads from `useUrlSearchAndFilters`:** `isFiltersVisible`, `isTagsVisible`, `filterState`, `search`.

---

## `ItemFilters` Changes

Remove `filterState`, `onFilterChange`, `tagTypes`, `tags` props:

```ts
// Before
interface ItemFiltersProps {
  tagTypes: TagType[]
  tags: Tag[]
  items: Item[]
  filterState: FilterState
  onFilterChange: (newState: FilterState) => void
}

// After
interface ItemFiltersProps {
  items: Item[]   // search-scoped items for available tag option computation
}
```

`ItemFilters` fetches `useTags()` and `useTagTypes()` internally. Reads and writes filter state via `useUrlSearchAndFilters()`.

---

## `FilterStatus` (unchanged)

No changes. `ItemListToolbar` passes computed values:
- `filteredCount = filterItems(items, filterState).length`
- `totalCount = items.length`
- `hasActiveFilters` from `filterState`
- `onClearAll → setFilterState({})`

---

## Calling Patterns

### Assignment pages (tag / vendor / recipe items)

```tsx
const { data: items = [] } = useItems()
const { data: tags = [] } = useTags()        // still needed for ItemCards
const { data: tagTypes = [] } = useTagTypes() // still needed for ItemCards
const { search, filterState, isTagsVisible } = useUrlSearchAndFilters()
const { sortBy, sortDirection, setSortBy, setSortDirection } = useSortFilter('tag-items')

const searchFiltered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
const filteredItems = sortItems(filterItems(searchFiltered, filterState), { sortBy, … })

return (
  <div>
    <ItemListToolbar
      sortBy={sortBy}
      sortDirection={sortDirection}
      onSortChange={(f, d) => { setSortBy(f); setSortDirection(d) }}
      isTagsToggleEnabled
      items={searchFiltered}
      onSearchSubmit={handleCreateFromSearch}
    />
    {filteredItems.map(item => (
      <ItemCard key={item.id} showTags={isTagsVisible} … />
    ))}
  </div>
)
```

### Pantry page

```tsx
<ItemListToolbar
  sortBy={sortBy}
  sortDirection={sortDirection}
  onSortChange={…}
  isTagsToggleEnabled
  items={filteredItems}
>
  <Link to="/items/new"><Button><Plus /> Add item</Button></Link>
</ItemListToolbar>
```

### Shopping page

```tsx
<ItemListToolbar
  leading={<VendorSelect … />}
  sortBy={sortBy}
  sortDirection={sortDirection}
  onSortChange={…}
  items={vendorFiltered}
  className="border-t-0"   // example customization
/>
```

(No `isTagsToggleEnabled` — shopping page doesn't have tag badge toggle.)

---

## Files

### Create
- `src/components/ItemListToolbar.tsx`
- `src/components/ItemListToolbar.stories.tsx`
- `src/hooks/useUrlSearchAndFilters.ts`
- `src/hooks/useUrlSearchAndFilters.test.ts`

### Modify
- `src/hooks/useSortFilter.ts` — remove filterState/isFiltersVisible/isTagsVisible
- `src/hooks/useSortFilter.test.ts` — update
- `src/components/ItemFilters.tsx` — remove props, add URL hook + internal data fetching
- `src/components/ItemFilters.stories.tsx` — update
- `src/routes/settings/tags/$id/items.tsx`
- `src/routes/settings/tags/$id/items.test.tsx`
- `src/routes/settings/vendors/$id/items.tsx`
- `src/routes/settings/vendors/$id/items.test.tsx`
- `src/routes/settings/recipes/$id/items.tsx`
- `src/routes/settings/recipes/$id/items.test.tsx`
- `src/routes/index.tsx` (pantry) — replace PantryToolbar, migrate to useSortFilter
- `src/routes/index.test.tsx` — update
- `src/routes/shopping.tsx` — apply ItemListToolbar
- `src/routes/shopping.test.tsx` — update

### Delete
- `src/components/SortFilterToolbar.tsx`
- `src/components/SortFilterToolbar.stories.tsx`
- `src/components/PantryToolbar.tsx`
- `src/components/PantryToolbar.test.tsx`
- `src/components/PantryToolbar.stories.tsx`

---

## Out of Scope

- Type-safe `validateSearch` declarations in route files (URL params parsed generically)
- Shared filter state that automatically syncs in real-time across open tabs
- `useSortFilter` rename (only sort prefs remain, could be cleaned up separately)
