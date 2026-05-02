# Design: Pantry Unified View

**Date:** 2026-05-02
**Status:** 🔲 Pending implementation
**Branch:** `feature/pantry-unified-view`
**Brainstorming:** [2026-05-02-brainstorming-pantry-unified-view.md](./2026-05-02-brainstorming-pantry-unified-view.md)

## Problem

Users stopped using the plain item list pantry view once the shelf view was available. The item list is too long to navigate efficiently; the shelf view gives a better overview. Maintaining two views adds confusion with no benefit.

## Solution

Merge the item list view and the shelf view into a single unified pantry page. Items are always grouped by shelves. The `/shelves` and `/shelves/$shelfId` routes are removed.

---

## Routes

### Removed

| Route | Reason |
|---|---|
| `/shelves` | Layout wrapper no longer needed |
| `/shelves/` | Replaced by unified pantry page |
| `/shelves/$shelfId` | Replaced by expand/collapse on pantry page |

### Modified

| Route | Change |
|---|---|
| `/` (pantry) | Replaces list/shelf toggle with always-shelf-grouped layout; adds `expanded` URL param |

---

## Data Model Changes

### Shelf entity

Remove `sortBy` and `sortDir` — replaced by a single global sort control on the pantry toolbar.

```ts
// Before
interface Shelf {
  sortBy?: 'name' | 'stock' | 'expiring' | 'lastPurchased'
  sortDir?: 'asc' | 'desc'
  // ...
}

// After — fields removed entirely
```

**Required migrations:**
- Dexie schema version bump: drop `sortBy`/`sortDir` columns
- GraphQL schema update: remove fields from `Shelf` type and mutations
- Cloud DB: Prisma migration to drop columns from shelves table

---

## Unified Pantry Page Spec

### Toolbar

Same as current pantry toolbar, with these changes:
- Remove view toggle (list / shelf)
- Keep: search, sort (global), filters, "Add Item" button
- Add: "Add Shelf" button

### Shelf Card (collapsed)

Displays:
- Shelf name
- Total item count: `N items`
- Low stock badge (only when > 0): `X low stock`
- Out of stock badge (only when > 0): `Y out of stock`
- Settings icon → navigates to `/settings/shelves/:id`
- Expand/collapse toggle (click the card body area)

The "Unsorted" system shelf has no settings icon.

**Stock status definitions:**
- Out of stock: `currentQty === 0`
- Low stock: `currentQty > 0 && currentQty <= refillThreshold`

### Shelf Card (expanded)

- Renders item list using the existing `ItemCard` component
- Items sorted by the global sort control

### Expand/Collapse

URL search param: `expanded=shelfId1,shelfId2,...` (comma-separated shelf IDs)

Same pattern as the cooking page (`?expanded=`):
- Toggle: add/remove shelf ID from the set, navigate with updated param
- "Expand All" / "Collapse All" control bar buttons

### Unsorted Shelf

- Always rendered last in the list
- Contains items not matched by any filter shelf and not explicitly assigned to any selection shelf
- No settings icon

### Add Item

Button in toolbar → navigates to `/items/new` (current behavior). The new item page already includes a shelf selector field (no change needed there beyond ensuring it works).

### Add Shelf

Button in toolbar → opens `AddShelfDialog` (existing component).

---

## Search & Filter Behavior

When the user types in the search box or applies tag/vendor/recipe filters:

1. Items that match are grouped inside their shelf cards
2. Shelves containing matching items auto-expand
3. Shelves with no matching items auto-collapse (remain visible in the list, showing 0 matches)
4. Matched keywords are highlighted in item names

The existing `useUrlSearchAndFilters` hook manages search/filter state in URL params — no change to that mechanism.

---

## URL Params

```
/?q=search&sort=name&dir=asc&tags=id1,id2&expanded=shelfId1,shelfId2
```

All existing params preserved; `expanded` added.

---

## Component Plan

### New

| Component | Purpose |
|---|---|
| `PantryShelfCard` | Collapsible shelf card with meta counts, expand/collapse toggle, settings nav |
| `PantryControlBar` | Expand All / Collapse All buttons (similar to `CookingControlBar`) |

### Modified

| Component | Change |
|---|---|
| Pantry page (`routes/index.tsx`) | Replace view-toggle logic with shelf-grouped layout; add `expanded` URL param |
| `ItemListToolbar` or pantry toolbar | Remove view toggle; add "Add Shelf" button |

### Unchanged (reused as-is)

| Component | Used where |
|---|---|
| `ItemCard` | Inside each expanded shelf card |
| `AddShelfDialog` | Opened by "Add Shelf" button |
| `ShelfCard` / `ShelfList` | Settings pages only |

---

## Implementation Phases

### Phase 1 — Data model cleanup
- Remove `sortBy` / `sortDir` from `Shelf` type (`packages/types/src/index.ts`)
- Dexie schema version bump in `apps/web/src/db/index.ts`
- GraphQL schema update (remove fields from Shelf type and mutations)
- Prisma migration to drop columns
- Update all usages of `shelf.sortBy` / `shelf.sortDir` across the codebase

### Phase 2 — PantryShelfCard component
- Build `PantryShelfCard` with: name, item count, low stock count, out of stock count, settings icon, expand/collapse
- Build `PantryControlBar` with Expand All / Collapse All
- Storybook stories and smoke tests

### Phase 3 — Unified pantry page
- Rewrite `routes/index.tsx` to always use shelf-grouped layout
- Add `expanded` URL param (validated in `validateSearch`)
- Wire expand/collapse toggle to URL param
- Wire search/filter to auto-expand matching shelves and highlight keywords
- Remove view toggle from toolbar; add "Add Shelf" button

### Phase 4 — Remove shelf routes
- Delete `routes/shelves.tsx`, `routes/shelves/index.tsx`, `routes/shelves/$shelfId.tsx`
- Remove Shelves link from navigation
- Update any internal links pointing to `/shelves` or `/shelves/:id`
- Update CLAUDE.md docs

### Phase 5 — E2E and a11y
- Add / update E2E tests for pantry expand/collapse, search grouping, add shelf, settings nav
- Run `pnpm test:e2e --grep "pantry|shelf|a11y"`
