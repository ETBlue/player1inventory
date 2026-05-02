# Plan 2: PantryShelfCard + PantryControlBar Components

**Feature:** Pantry Unified View
**Design doc:** [2026-05-02-pantry-unified-view-design.md](./2026-05-02-pantry-unified-view-design.md)
**PR scope:** New `PantryShelfCard` and `PantryControlBar` components with stories and smoke tests
**Depends on:** Plan 1 (data model cleanup) merged
**Status:** 🔲 Pending

## Context

Two new components are needed for the unified pantry page:

- **`PantryShelfCard`** — collapsible card showing a shelf with meta counts (items, low stock, out of stock), an expand/collapse toggle, and a settings navigation link. When expanded, renders the shelf's item list.
- **`PantryControlBar`** — toolbar strip with "Expand All" / "Collapse All" buttons, mirroring `CookingControlBar`.

This PR builds the components in isolation (no pantry page wiring) so they can be reviewed and story-tested independently.

## Stock Status Definitions

- **Out of stock:** `currentQty === 0`
- **Low stock:** `currentQty > 0 && currentQty <= refillThreshold`

`currentQty` is the item's current tracked quantity (from inventory logs).

## Component Specs

### PantryShelfCard

```
┌─────────────────────────────────────────────────┐
│ [expand icon]  Shelf Name        [settings icon] │
│               3 items  1 low stock  2 out        │
└─────────────────────────────────────────────────┘
         ↓ when expanded ↓
┌─────────────────────────────────────────────────┐
│ [ItemCard]                                      │
│ [ItemCard]                                      │
│ [ItemCard]                                      │
└─────────────────────────────────────────────────┘
```

**Props:**
```ts
interface PantryShelfCardProps {
  shelf: Shelf
  items: Item[]           // pre-filtered items for this shelf
  isExpanded: boolean
  onToggle: () => void
  // settings icon hidden when shelf.type === 'system'
}
```

**Behavior:**
- Click on card body (excluding settings icon) → calls `onToggle`
- Click on settings icon → navigates to `/settings/shelves/:id`
- Low stock badge: only render when count > 0
- Out of stock badge: only render when count > 0
- "Unsorted" system shelf: no settings icon

### PantryControlBar

```ts
interface PantryControlBarProps {
  allShelfIds: string[]
  expandedIds: Set<string>
  onExpandAll: () => void
  onCollapseAll: () => void
}
```

Renders "Expand All" / "Collapse All" buttons. Buttons are disabled when already in that state (all expanded / none expanded).

## Steps

### Step 1 — PantryShelfCard component

Create the following files:

**`apps/web/src/components/pantry/PantryShelfCard/PantryShelfCard.tsx`**
- Accept `shelf`, `items`, `isExpanded`, `onToggle` props
- Compute `totalCount`, `lowStockCount`, `outOfStockCount` from `items`
- Render collapsed state: shelf name + counts + optional settings icon
- Render expanded state: `ItemCard` list for each item
- Use `<Link to="/settings/shelves/$shelfId">` for settings navigation
- Apply `capitalize` class to shelf name (per Name Display Convention)

**`apps/web/src/components/pantry/PantryShelfCard/index.ts`**
```ts
export * from './PantryShelfCard'
```

---

### Step 2 — PantryControlBar component

**`apps/web/src/components/pantry/PantryControlBar/PantryControlBar.tsx`**
- Accept `allShelfIds`, `expandedIds`, `onExpandAll`, `onCollapseAll`
- Disable "Expand All" when `expandedIds.size === allShelfIds.length`
- Disable "Collapse All" when `expandedIds.size === 0`

**`apps/web/src/components/pantry/PantryControlBar/index.ts`**
```ts
export * from './PantryControlBar'
```

---

### Step 3 — Storybook stories

**`apps/web/src/components/pantry/PantryShelfCard/PantryShelfCard.stories.tsx`**

Stories to cover:
- `Collapsed` — shelf with items, all counts hidden (all well-stocked)
- `CollapsedWithLowStock` — 1 low stock item
- `CollapsedWithOutOfStock` — 1 out of stock item
- `CollapsedWithBoth` — mix of low and out of stock
- `Expanded` — shelf expanded showing item cards
- `SystemShelf` — Unsorted shelf (no settings icon, always collapsed in this story)

**`apps/web/src/components/pantry/PantryControlBar/PantryControlBar.stories.tsx`**

Stories to cover:
- `AllCollapsed` — Expand All enabled, Collapse All disabled
- `AllExpanded` — Expand All disabled, Collapse All enabled
- `Mixed` — both buttons enabled

---

### Step 4 — Smoke tests

**`apps/web/src/components/pantry/PantryShelfCard/PantryShelfCard.stories.test.tsx`**

Use `composeStories` + React Testing Library. For each story assert a key visible element:
- `Collapsed`: shelf name is in the document
- `CollapsedWithLowStock`: "low stock" text visible
- `CollapsedWithOutOfStock`: "out of stock" text visible
- `Expanded`: an item name is visible
- `SystemShelf`: settings icon is not present

**`apps/web/src/components/pantry/PantryControlBar/PantryControlBar.stories.test.tsx`**

- `AllCollapsed`: "Expand All" button is enabled
- `AllExpanded`: "Collapse All" button is enabled

---

### Step 5 — Verification gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

All must pass before opening a PR.

## Acceptance Criteria

- [ ] `PantryShelfCard` renders shelf name, item count, conditional low/out-of-stock badges
- [ ] `PantryShelfCard` hides settings icon for system shelf
- [ ] `PantryShelfCard` calls `onToggle` on card body click; navigates on settings icon click
- [ ] `PantryControlBar` disables buttons correctly when all-expanded or all-collapsed
- [ ] All stories render without console errors
- [ ] All smoke tests pass
- [ ] TypeScript strict mode: no errors
