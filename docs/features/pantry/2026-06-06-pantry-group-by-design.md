# Design: Pantry Group-By (Vendor / Recipe)

**Date:** 2026-06-06
**Status:** 🔲 Pending implementation
**Branch:** `worktree-feature-pantry-group-by`
**Brainstorming:** [2026-06-06-brainstorming-pantry-group-by.md](./2026-06-06-brainstorming-pantry-group-by.md)
**Plan:** [2026-06-06-pantry-group-by-plan.md](./2026-06-06-pantry-group-by-plan.md)

---

## Problem

The pantry group view only groups by shelf. Users want to see their pantry organized by vendor (what to buy where) and by recipe (what ingredients they have for which recipes).

---

## Solution Overview

Add a **GroupByToggle** (shelf / vendor / recipe icon buttons) to the group view toolbar. When vendor or recipe is selected, render cards with the same visual as ShelfCard. Clicking a card opens a detail page listing items in that group, identical in structure to the existing shelf detail page.

All views live in the root route (`/`) via URL search params — no new routes are added.

---

## URL Structure

| URL | View |
|-----|------|
| `/` | Item list view |
| `/?groupBy=shelf` | Shelf group view (cards) |
| `/?groupBy=vendor` | Vendor group view (cards) |
| `/?groupBy=recipe` | Recipe group view (cards) |
| `/?groupBy=shelf&id=$shelfId` | Shelf detail (items in shelf) |
| `/?groupBy=vendor&id=$vendorId` | Vendor detail (items from vendor) |
| `/?groupBy=recipe&id=$recipeId` | Recipe detail (items in recipe) |
| `/?groupBy=X&id=unsorted` | Unsorted detail (items without any group assignment) |

**Removed routes:**
- `/shelves` (layout wrapper)
- `/shelves/` (shelf group view → replaced by `/?groupBy=shelf`)
- `/shelves/$shelfId` (shelf detail → replaced by `/?groupBy=shelf&id=$shelfId`)

---

## Route: Root `/`

### Search Params

```ts
validateSearch: (search) => ({
  groupBy: search.groupBy as 'shelf' | 'vendor' | 'recipe' | undefined,
  id: search.id as string | undefined,
})
```

### Render Logic

```
groupBy=undefined, id=undefined  →  <PantryListView>
groupBy=X, id=undefined          →  <GroupListView groupBy={X}>
groupBy=X, id=Y                  →  <GroupDetailView groupBy={X} id={Y}>
```

### View Preference Persistence

- `viewPreference.ts`: rename `'shelf'` → `'group'` in the stored enum
- When stored preference is `'group'`, redirect to `/?groupBy=<lastGroupBy>` (default: `shelf`)
- `lastGroupBy` stored separately as `pantry-group-by` in localStorage (defaults to `'shelf'`)
- When user switches from group view to list view: clear `groupBy` param, store `'list'`

---

## Toolbar Layouts

### List view toolbar (unchanged)
```
[ViewToggle list|group]  [flex-1]  [Sort▾]  [↑↓]  [Tags]  [Filters]  [🔍]  [+]
```

### Group view toolbar (updated)
```
[ViewToggle list|group]  [GroupByToggle shelf|vendor|recipe]  [flex-1]  [Manage ⚙]
```

- **GroupByToggle**: icon buttons — `LayoutGrid` (shelf), `Store` (vendor), `ChefHat` (recipe). Selected state uses filled `neutral` variant. Clicking changes `?groupBy` param and clears `?id`.
- **Manage button**: icon + label, navigates to the settings page for the active group type:
  - shelf → `/settings/shelves`
  - vendor → `/settings/vendors`
  - recipe → `/settings/recipes`

### Detail view toolbar (updated back navigation)
```
[← Back]  [Group name (h1)]  [Sort▾]  [↑↓]  [Tags]  [🔍]  [⚙ Settings*]
```
- Back button → `/?groupBy=$type`
- Settings button: present for non-unsorted groups only
  - shelf: → `/settings/shelves/$shelfId`
  - vendor: → `/settings/vendors` (no per-vendor settings page)
  - recipe: → `/settings/recipes/$recipeId` (if per-recipe settings page exists)

---

## Group View Cards

### GroupCard (unified)

ShelfCard, VendorCard, and RecipeCard are merged into a single `GroupCard` component. The existing `ShelfCard` is replaced by `GroupCard`; `ShelfList` is updated to use `GroupCard` internally.

Location: `apps/web/src/components/shared/GroupCard/`

Props:
```ts
interface GroupCardProps {
  name: string
  icon?: React.ReactNode       // optional icon shown to the left of the name
  itemCount: number
  onClick: () => void
  filterSummary?: string        // optional label below the name (shelf filter shelves only)
  outOfStockCount?: number
  lowStockCount?: number
  activeCount?: number
  totalPackedQuantity?: number
  totalTargetInPacks?: number
  totalRefillInPacks?: number
  nameClassName?: string        // defaults to 'capitalize'; pass 'normal-case' for vendor names
}
```

**Card layout (3 rows):**
- Row 1: `[icon?] name` (with `nameClassName`) + `{packed}/{target} pack` label (right-aligned)
- Row 2: `ItemProgressBar`
- Row 3: active count badge, `filterSummary` (if set), out-of-stock badge, low-stock badge + ChevronRight

**Icon usage by caller:**
- Shelf group view: `icon={<LayoutGrid size={16} />}`
- Vendor group view: `icon={<Store size={16} />}`
- Recipe group view: `icon={<ChefHat size={16} />}`
- Unsorted card (any group type): `icon` omitted (no icon)

**Name casing by caller:**
- Shelf and recipe names: omit `nameClassName` (defaults to `capitalize`)
- Vendor names: pass `nameClassName="normal-case"` (preserves intentional casing like "iHerb", "7-Eleven")

### Unsorted Card
For all group types, an "Unsorted" card is shown below the main list (same pattern as the shelf view's existing unsorted card):
- Shelf unsorted: items not in any selection shelf and not matching any filter shelf (existing logic)
- Vendor unsorted: items with no `vendorIds` or `vendorIds.length === 0`
- Recipe unsorted: items not referenced in any recipe's `items` array
- Clicking Unsorted → `/?groupBy=$type&id=unsorted`
- Rendered as `<GroupCard name="Unsorted" icon={undefined} ... />`

---

## Group Detail Views

### Shelf Detail (migrated, logic unchanged)
`/?groupBy=shelf&id=$shelfId` renders the same component logic as the deleted `/shelves/$shelfId`.

### Vendor Detail
`/?groupBy=vendor&id=$vendorId`

**Items included:**
- Non-unsorted: `item.vendorIds?.includes(vendorId)`
- Unsorted (id=`'unsorted'`): `!item.vendorIds || item.vendorIds.length === 0`

**Toolbar:** Sort (expiring/name/stock/purchased), sort direction, tag toggle, search toggle, settings button (→ `/settings/vendors`, not shown for unsorted)

### Recipe Detail
`/?groupBy=recipe&id=$recipeId`

**Items included:**
- Non-unsorted: items in `recipe.items` by `itemId` (preserves recipe order)
- Unsorted (id=`'unsorted'`): items whose `id` does not appear in any recipe's `items` array

**Toolbar:** Sort (expiring/name/stock/purchased), sort direction, tag toggle, search toggle, settings button (→ `/settings/recipes/$recipeId`, not shown for unsorted). Check if per-recipe settings route exists; fall back to `/settings/recipes` if not.

---

## Metrics Computation (Vendor & Recipe Group Views)

Per-group metric functions parallel the shelf group view pattern:

```ts
// Items in vendor
getVendorItems(vendorId): Item[]
  → unsorted: items with no vendorIds
  → specific: items where vendorIds includes vendorId

// Items in recipe
getRecipeItems(recipeId): Item[]
  → unsorted: items not in any recipe
  → specific: recipe.items mapped to items by itemId

// Shared metric functions (same logic for all group types)
getOutOfStockCount(groupItems): number  // items below refill threshold
getLowStockCount(groupItems): number    // items exactly at refill threshold
getActiveCount(groupItems): number      // non-inactive items
getGroupPackTotals(groupItems): { totalPacked, totalTarget, totalRefill }
```

---

## Files Changed

### Deleted
- `apps/web/src/routes/shelves.tsx`
- `apps/web/src/routes/shelves/index.tsx`
- `apps/web/src/routes/shelves/$shelfId.tsx`
- `apps/web/src/routes/shelves/index.stories.tsx` (if exists)
- `apps/web/src/routes/shelves/index.stories.test.tsx` (if exists)

### New Components
- `apps/web/src/components/shared/GroupCard/GroupCard.tsx` + `index.ts`
- `apps/web/src/components/shared/GroupCard/GroupCard.stories.tsx`
- `apps/web/src/components/shared/GroupCard/GroupCard.stories.test.tsx`
- `apps/web/src/components/shared/GroupByToggle/GroupByToggle.tsx` + `index.ts`
- `apps/web/src/components/shared/GroupByToggle/GroupByToggle.stories.tsx`
- `apps/web/src/components/shared/GroupByToggle/GroupByToggle.stories.test.tsx`

### Modified
- `apps/web/src/components/shelf/ShelfCard/ShelfCard.tsx` → replaced by `GroupCard` (delete file or convert to re-export)
- `apps/web/src/components/shelf/ShelfList/ShelfList.tsx` → updated to render `GroupCard` instead of `ShelfCard`
- `apps/web/src/routes/index.tsx` — add search params, dispatch to group/detail views, migrate shelf group + detail view logic
- `apps/web/src/lib/viewPreference.ts` — update stored value `'shelf'` → `'group'`; add `getStoredGroupBy`/`setStoredGroupBy`
- `apps/web/src/components/shared/ViewToggle/ViewToggle.tsx` — navigate to `/?groupBy=<lastGroupBy>` instead of `/shelves`
- `apps/web/src/routeTree.gen.ts` — auto-regenerated
- `docs/INDEX.md` — update pantry row status
- E2E tests — update URLs that reference `/shelves`
- a11y spec — add new group view URLs to coverage

---

## Relationship to Pantry Unified View Plan

An earlier design (`2026-05-02-pantry-unified-view-design.md`) proposed always grouping by shelf with no toggle. This feature supersedes that approach: we keep the list/group toggle but extend the group view with multiple group-by options. The shelf-only unified view plan is superseded.
