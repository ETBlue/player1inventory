# Create-on-Search Design

**Date:** 2026-02-26

## Overview

Improve the item creation UX on item list pages by:
1. Replacing the `+ Create "xxx"` row below the search results with a `+ Create` button inside the search input (right-side slot, replacing ✕ when search has zero results)
2. Adding create-on-search to the pantry and shopping pages (currently only available on tag/vendor/recipe items tabs)
3. Setting all quantity/amount default values to `0` for both quick-create and the new item form

## Scope

Pages that support create-on-search after this change:
- **Pantry** (`/`) — new
- **Shopping** (`/shopping`) — new
- **Tag items tab** (`/settings/tags/$id/items`) — existing, UI change
- **Vendor items tab** (`/settings/vendors/$id/items`) — existing, UI change
- **Recipe items tab** (`/settings/recipes/$id/items`) — existing, UI change

## Design

### Section 1: `ItemListToolbar` changes

**New prop:**

```ts
onCreateFromSearch?: (query: string) => void
```

**Queried count (new internal derived value):**

```ts
const queriedCount = search.trim()
  ? items.filter(item =>
      item.name.toLowerCase().includes(search.toLowerCase())
    ).length
  : items.length
```

**Create button behavior:**
- When `onCreateFromSearch` is provided **and** `queriedCount === 0` **and** search is non-empty → the ✕ button is replaced with a `+ Create` button in the search row right-side slot
- Clicking `+ Create` calls `onCreateFromSearch(search.trim())`
- Search is **not** cleared after create (so the newly created item, which matches the query, stays in viewport)

**Bug fix:**
- The existing `onSearchSubmit` Enter key handler at line 93 currently uses `filteredCount` (tag-filtered count). Change it to use `queriedCount` instead.

### Section 2: Page-level changes

**Default values for all create-on-search (change from previous):**

| Field | Old | New |
|-------|-----|-----|
| `targetQuantity` | `1` | `0` |
| `refillThreshold` | `1` | `0` |
| `consumeAmount` | `1` | `0` |
| `packedQuantity` | `0` | `0` (unchanged) |
| `unpackedQuantity` | `0` | `0` (unchanged) |
| `targetUnit` | `'package'` | `'package'` (unchanged) |

**Tag / Vendor / Recipe items tabs:**
- Remove the `{filteredItems.length === 0 && search.trim() && (...)}` row from item list JSX
- Pass `onCreateFromSearch={handleCreateFromSearch}` to `ItemListToolbar`
- Update default values in `handleCreateFromSearch` to use `0`
- Do not clear search after create (remove `setSearch('')`)

**Pantry page (`/`):**
- Add `onCreateFromSearch` to `ItemListToolbar`
- Keep existing `+ Add Item` button in the `children` slot
- On create: `createItem.mutateAsync({ name: query, targetQuantity: 0, refillThreshold: 0, consumeAmount: 0, packedQuantity: 0, unpackedQuantity: 0, targetUnit: 'package', tagIds: [], vendorIds: [] })` → navigate to `/items/<new-id>`
- Do not clear search after create

**Shopping page (`/shopping`):**
- Add `onCreateFromSearch` to `ItemListToolbar`
- On create: same defaults as pantry → stay on shopping page (item appears in pending list)
- Do not clear search after create

### Section 3: `/items/new` form default values

Change initial form values in the new item route:

| Field | Old | New |
|-------|-----|-----|
| `targetQuantity` | `1` | `0` |
| `refillThreshold` | `1` | `0` |
| `consumeAmount` | `1` | `0` |

## Files to Change

- `src/components/ItemListToolbar.tsx` — add prop, compute `queriedCount`, add create button, fix Enter handler
- `src/routes/index.tsx` (pantry) — wire `onCreateFromSearch`
- `src/routes/shopping.tsx` — wire `onCreateFromSearch`
- `src/routes/settings/tags/$id/items.tsx` — remove row, wire prop, update defaults
- `src/routes/settings/vendors/$id/items.tsx` — remove row, wire prop, update defaults
- `src/routes/settings/recipes/$id/items.tsx` — remove row, wire prop, update defaults
- `src/routes/items/new.tsx` — update initial form values to `0`
