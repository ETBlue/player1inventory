# Design: Create Item When No Exact Match

**Date:** 2026-03-08

## Problem

The "create item via search input" feature currently shows a Create button only when `queriedCount === 0` (zero search results). If the user searches for "daikon" and finds "pomelo pickled daikon", the Create button disappears — even though "daikon" doesn't exist yet.

## Goal

Show the Create button whenever the search query has no **exact name match** among results, regardless of how many partial results exist.

## Affected Pages

All 5 pages with the create-via-search feature:
1. Pantry (`src/routes/index.tsx`)
2. Shopping (`src/routes/shopping.tsx`)
3. Vendor items tab (`src/routes/settings/vendors/$id/items.tsx`)
4. Tag items tab (`src/routes/settings/tags/$id/items.tsx`)
5. Recipe items tab (`src/routes/settings/recipes/$id/items.tsx`)

## Design

### Approach

Add a `hasExactMatch` boolean prop to `ItemListToolbar`. Each page computes it from its local `searchedItems` and passes it down. The toolbar replaces `queriedCount === 0` with `!hasExactMatch`.

### `ItemListToolbar` changes

Add prop:
```ts
hasExactMatch?: boolean
```

Replace both occurrences of `queriedCount === 0` with `!hasExactMatch`:
- Button condition: `onCreateFromSearch && !hasExactMatch`
- Enter-key handler: `!hasExactMatch && search.trim()`

### Per-page changes (all 5 pages)

Each page adds:
```ts
const hasExactMatch = searchedItems.some(
  item => item.name.toLowerCase() === search.trim().toLowerCase()
)
```

And passes `hasExactMatch` to `<ItemListToolbar>`.

### Exact match definition

- Case-insensitive (`toLowerCase()`)
- Trimmed whitespace (`search.trim()`)
- Compared against the full `searchedItems` list (items matching the search query)

## Behavior Table

| Scenario | Before | After |
|---|---|---|
| No results | Create button | Create button (unchanged) |
| Partial results, no exact match | X button | **Create button** |
| Exact match exists (case-insensitive) | X button | X button (unchanged) |
| Empty search | Neither | Neither (unchanged) |

## Out of Scope

- No changes to what Create does (same item creation logic)
- No changes to `queriedCount` (kept as-is)
- No new UI elements — Create replaces X, same as today
