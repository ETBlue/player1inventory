# Plan 3: Unified Pantry Page + Route Removal

**Feature:** Pantry Unified View
**Design doc:** [2026-05-02-pantry-unified-view-design.md](./2026-05-02-pantry-unified-view-design.md)
**PR scope:** Rewrite pantry route with shelf-grouped layout; remove `/shelves` routes; E2E tests
**Depends on:** Plan 1 (data model) + Plan 2 (components) merged
**Status:** ✅ Implemented

## Context

This is the main integration PR. It rewrites `routes/index.tsx` to always use a shelf-grouped layout using `PantryShelfCard`, wires expand/collapse to URL params, adapts search/filter to auto-expand matching shelves, updates the toolbar, and removes the now-unnecessary `/shelves` routes.

## Steps

### Step 1 — Add `expanded` URL param to pantry route

**File:** `apps/web/src/routes/index.tsx`

Add `expanded` to `validateSearch`:
```ts
validateSearch: (search) => ({
  // existing params: q, sort, dir, tags, vendors, recipes, ...
  expanded: (search.expanded as string) ?? '',
})
```

Derive the expanded set in the component:
```ts
const expandedShelfIds = useMemo(
  () => new Set(expanded ? expanded.split(',') : []),
  [expanded]
)
```

Toggle handler (same pattern as cooking page):
```ts
function handleToggle(shelfId: string) {
  const next = new Set(expandedShelfIds)
  if (next.has(shelfId)) next.delete(shelfId)
  else next.add(shelfId)
  navigate({ to: '/', search: (prev) => ({ ...prev, expanded: [...next].join(',') }) })
}
```

---

### Step 2 — Rewrite pantry page layout

**File:** `apps/web/src/routes/index.tsx`

Remove the view-toggle logic (the `view` state / `viewMode` toggle). The page always renders the shelf-grouped layout.

New layout structure:
1. Existing toolbar (ItemListToolbar or equivalent) — see Step 3 for toolbar changes
2. `PantryControlBar` — Expand All / Collapse All
3. For each shelf (from `useShelvesQuery`), in order, Unsorted last:
   ```tsx
   <PantryShelfCard
     key={shelf.id}
     shelf={shelf}
     items={itemsForShelf}
     isExpanded={expandedShelfIds.has(shelf.id)}
     onToggle={() => handleToggle(shelf.id)}
   />
   ```

**Computing items per shelf:**

Re-use the existing shelf item-assignment logic already used in `shelves/index.tsx`:
- Filter shelf: items matching `filterConfig` via `matchesFilterConfig(item, filterConfig, recipes, tags)`
- Selection shelf: items in `shelf.itemIds`
- Unsorted (system) shelf: items not matched by any filter shelf and not in any selection shelf

Apply the global sort to each shelf's items before passing them to `PantryShelfCard`.

---

### Step 3 — Toolbar changes

**File:** `apps/web/src/routes/index.tsx` (or the toolbar component used by the pantry)

- Remove view toggle (list / shelf switch)
- Add "Add Shelf" button → opens `AddShelfDialog`
- Keep: search input, sort control, filter dropdown, "Add Item" button

---

### Step 4 — Search/filter: auto-expand matching shelves

When `q` (search query) or any filter param is active, compute which shelves have at least one matching item. Auto-expand those shelves by merging their IDs into `expandedShelfIds` via the URL param:

```ts
useEffect(() => {
  if (!isFiltering) return
  const shelvesWithMatches = shelves.filter(shelf =>
    itemsForShelf(shelf).some(item => matchesSearch(item, q))
  )
  const next = new Set([...expandedShelfIds, ...shelvesWithMatches.map(s => s.id)])
  if (next.size !== expandedShelfIds.size) {
    navigate({ to: '/', search: (prev) => ({ ...prev, expanded: [...next].join(',') }) })
  }
}, [q, /* filter params */])
```

**Keyword highlighting:**

Pass `searchQuery` down to `PantryShelfCard` → `ItemCard`. The existing `ItemCard` may already support a highlight prop; if not, add a `highlightQuery?: string` prop to `ItemCard` and apply it to the item name display using a highlight utility.

---

### Step 5 — Remove `/shelves` routes

Delete the following files:
```
apps/web/src/routes/shelves.tsx
apps/web/src/routes/shelves/index.tsx
apps/web/src/routes/shelves/$shelfId.tsx
apps/web/src/routes/shelves/$shelfId.stories.tsx
```

After deletion, restart the dev server so TanStack Router regenerates `routeTree.gen.ts`. Verify no broken imports remain.

---

### Step 6 — Navigation / sidebar audit

**Files:**
- `apps/web/src/components/global/Navigation/Navigation.tsx`
- `apps/web/src/components/global/Sidebar/Sidebar.tsx`

Check for any links to `/shelves` or `/shelves/$shelfId`. The exploration found no direct "Shelves" nav link, but confirm and remove any that exist.

Also search the entire codebase for `to="/shelves"` or `href="/shelves"`:
```bash
grep -r '"/shelves' apps/web/src --include="*.tsx" --include="*.ts"
```

Remove or redirect all found references.

---

### Step 7 — CLAUDE.md and docs updates

**File:** `apps/web/src/routes/CLAUDE.md`

- Remove the Shelves section (or mark as removed)
- Add a Pantry section describing the unified view, expand/collapse pattern, URL params

**File:** `apps/web/src/routes/items/CLAUDE.md` (if it mentions the shelf view)

- Update any cross-references

**File:** `docs/features/pantry/2026-05-02-pantry-unified-view-design.md`

- Update status to ✅ Implemented

**File:** `docs/INDEX.md`

- Update pantry row status to ✅ Implemented
- Update shelf row to reflect that view routes are removed (settings routes remain)

---

### Step 8 — E2E tests

**File:** `e2e/tests/pantry.spec.ts` (create if it doesn't exist, or update)

Tests to add (use "user can ..." naming with Given-When-Then comments):

- `user can see items grouped by shelves on the pantry page`
- `user can expand and collapse a shelf`
- `user can expand all and collapse all shelves`
- `user can search and see matching shelves auto-expand`
- `user can add a shelf from the pantry page`
- `user can navigate to shelf settings from the pantry page`

**File:** `e2e/tests/a11y.spec.ts`

- Ensure the pantry page is already covered; add if missing

---

### Step 9 — Final verification gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
pnpm test:e2e --grep "pantry|shelf|a11y"
```

All must pass. E2E failures are a hard stop.

## Acceptance Criteria

- [ ] Pantry page always shows items grouped by shelves — no view toggle
- [ ] Shelves expand/collapse; state persists in `?expanded=` URL param
- [ ] Expand All / Collapse All buttons work
- [ ] Search/filter auto-expands shelves with matching items; keywords highlighted
- [ ] Unsorted shelf appears last
- [ ] "Add Shelf" button in toolbar works
- [ ] "Add Item" button navigates to `/items/new` (unchanged)
- [ ] Clicking settings icon on a shelf navigates to `/settings/shelves/:id`
- [ ] `/shelves`, `/shelves/`, `/shelves/$shelfId` routes no longer exist
- [ ] No broken internal links to `/shelves`
- [ ] All E2E tests pass including a11y scan
- [ ] TypeScript strict mode: no errors
