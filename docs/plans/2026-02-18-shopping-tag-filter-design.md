# Shopping Page Tag Filter Design

**Date:** 2026-02-18
**Status:** Approved

## Overview

Add tag filtering to the shopping page, behind a "Filters" toggle button, using the same pattern as the pantry page. Tag filters work alongside the existing vendor filter — both can be active simultaneously.

## Decisions

- **Location:** Same toolbar as vendor filter, with tag filters in a collapsible row below
- **UI pattern:** Mirror pantry page exactly — `Filters` toggle button + `ItemFilters` row with `TagTypeDropdown` per tag type
- **Interaction:** Multi-select per tag type (OR within type, AND across types), same as pantry
- **Vendor + tag:** Sequential filtering — vendor filter applied first, tag filter applied on the result
- **Persistence:** Session storage with shopping-specific keys (separate from pantry)

## Data / Filtering Logic

No changes to shared utilities. All changes are in `src/routes/shopping.tsx`.

Tag filtering chains after the existing vendor filter:

```ts
const vendorFiltered = selectedVendorId
  ? items.filter((item) => (item.vendorIds ?? []).includes(selectedVendorId))
  : items

const filteredItems = filterItems(vendorFiltered, filterState)
```

`filteredItems` replaces `vendorFiltered` as the input to `cartSectionItems` and `pendingItems`.

New state:

```ts
const [filterState, setFilterState] = useState<FilterState>(() => loadShoppingFilters())
const [filtersVisible, setFiltersVisible] = useState(() => loadShoppingUiPrefs().filtersVisible)
```

Two new sessionStorage helpers added to `src/lib/sessionStorage.ts`:
- `loadShoppingFilters()` / `saveShoppingFilters(state)` — uses a shopping-specific key
- `loadShoppingUiPrefs()` / `saveShoppingUiPrefs(prefs)` — stores `{ filtersVisible: boolean }`

## UI Layout

```
[vendor select]  ...  [Filters]  [Abandon]  [Confirm purchase]
─────────────────────────────────────────────────────────────
[TagType1 ▾]  [TagType2 ▾]  [TagType3 ▾]     ← visible when filtersVisible
```

- **Filters button:** `neutral-ghost` when no tag filters selected; active/colored variant when any filter is active
- **Tag filter row:** renders `<ItemFilters>` (existing component, no modifications) below the toolbar, shown only when `filtersVisible`
- Tag type dropdowns only render when tags exist in the system
- `filteredCount` / `totalCount` props reflect the vendor-filtered pool for accurate combined counts

## Testing

File: `src/routes/shopping.test.tsx` — RouterProvider integration pattern.

- `user can see the filters toggle button`
- `user can show and hide the tag filter row`
- `user can filter items by tag`
- `user can filter by vendor and tag simultaneously`
- `user can see empty state when all items are filtered out`

## Out of Scope

- Modifying `filterUtils.ts` or `ItemFilters` component
- Tag filter count badges in the toolbar (pantry shows these; shopping keeps it simple)
- Sorting integration (shopping has no sort controls)
