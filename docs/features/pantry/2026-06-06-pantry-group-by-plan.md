# Implementation Plan: Pantry Group-By (Vendor / Recipe)

**Date:** 2026-06-06
**Design:** [2026-06-06-pantry-group-by-design.md](./2026-06-06-pantry-group-by-design.md)
**Branch:** `worktree-feature-pantry-group-by`

---

## Overview

Extend the pantry group view to support grouping by vendor and recipe in addition to shelf. Consolidate all pantry sub-routes into the root `/` route using URL search params (`?groupBy`, `?id`). Remove `/shelves` and `/shelves/$shelfId` routes.

---

## Prerequisites

Before starting: read the design doc and the following files:
- `apps/web/src/routes/index.tsx`
- `apps/web/src/routes/shelves/index.tsx`
- `apps/web/src/routes/shelves/$shelfId.tsx`
- `apps/web/src/lib/viewPreference.ts`
- `apps/web/src/components/shelf/ShelfCard/ShelfCard.tsx`
- `apps/web/src/components/shared/ViewToggle/ViewToggle.tsx`
- `apps/web/src/components/shared/Toolbar/` (check structure)
- `apps/web/src/routes/settings/vendors/` (check if per-vendor detail route exists)
- `apps/web/src/routes/settings/recipes/` (check if per-recipe detail route exists)
- `e2e/tests/` (find files referencing `/shelves`)

---

## Phase 1 — ViewPreference & GroupByToggle

### Step 1.1 — Update `viewPreference.ts`

File: `apps/web/src/lib/viewPreference.ts`

- Change stored value: `'shelf'` → `'group'` (update `setPantryView` and `getPantryView`)
- Add `PantryGroupBy = 'shelf' | 'vendor' | 'recipe'` type
- Add `getStoredGroupBy(): PantryGroupBy` — reads `localStorage.getItem('pantry-group-by')`, defaults to `'shelf'`
- Add `setStoredGroupBy(g: PantryGroupBy): void` — writes to `localStorage.setItem('pantry-group-by', g)`
- Keep backward compat: treat old stored `'shelf'` value as `'group'` (one-time migration in `getPantryView`)

### Step 1.2 — Create `GroupByToggle` component

Files to create:
- `apps/web/src/components/shared/GroupByToggle/GroupByToggle.tsx`
- `apps/web/src/components/shared/GroupByToggle/index.ts`

Props:
```ts
interface GroupByToggleProps {
  current: 'shelf' | 'vendor' | 'recipe'
  onChange: (groupBy: 'shelf' | 'vendor' | 'recipe') => void
}
```

UI: Three icon buttons in a row (same pattern as `ViewToggle`):
- `LayoutGrid` icon → shelf
- `Store` icon → vendor
- `ChefHat` icon → recipe

Active button: `neutral` (filled) variant. Inactive: `neutral-outline` or `ghost`.

Stories: Default (shelf active), VendorActive, RecipeActive.
Smoke test: assert the active button label is rendered.

### Step 1.3 — Verification gate
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Phase 2 — GroupCard (unified card component)

### Step 2.1 — Create `GroupCard` component

Files to create:
- `apps/web/src/components/shared/GroupCard/GroupCard.tsx`
- `apps/web/src/components/shared/GroupCard/index.ts`

This single component replaces `ShelfCard`, `VendorCard`, and `RecipeCard`. Read `ShelfCard.tsx` first to copy the exact 3-row visual layout.

Props:
```ts
interface GroupCardProps {
  name: string
  icon?: React.ReactNode       // optional icon left of the name (pass a LucideIcon element)
  itemCount: number
  onClick: () => void
  filterSummary?: string        // optional label in row 3 (shelf filter shelves only)
  outOfStockCount?: number
  lowStockCount?: number
  activeCount?: number
  totalPackedQuantity?: number
  totalTargetInPacks?: number
  totalRefillInPacks?: number
  nameClassName?: string        // defaults to 'capitalize'; pass 'normal-case' for vendors
}
```

Layout (copy from ShelfCard):
- Row 1: `{icon} name` + `{packed}/{target} pack` (right-aligned)
- Row 2: `ItemProgressBar`
- Row 3: active count badge, `filterSummary` (if set), out-of-stock badge, low-stock badge + `ChevronRight`

Stories:
- `Default` — shelf-style: `icon=<LayoutGrid />`, name "Pantry", counts
- `VendorStyle` — `icon=<Store />`, `nameClassName="normal-case"`, vendor name "iHerb"
- `RecipeStyle` — `icon=<ChefHat />`, recipe name "Pasta"
- `WithFilterSummary` — shelf filter card with `filterSummary="Expires this week"`
- `OutOfStock` — with `outOfStockCount={2}`
- `LowStock` — with `lowStockCount={1}`
- `Unsorted` — no icon, name "Unsorted"

Smoke test: assert the name is visible.

### Step 2.2 — Replace ShelfCard with GroupCard

File: `apps/web/src/components/shelf/ShelfCard/ShelfCard.tsx`

Replace the component body so it calls `GroupCard` internally, passing:
- `name={shelf.name}`
- `icon={<LayoutGrid size={16} />}`
- `filterSummary={...}` (shelf filter summary)
- all metric props forwarded

This keeps `ShelfCard` as a thin domain wrapper so existing call sites in `ShelfList` don't need to change yet. The props interface of `ShelfCard` stays as-is.

Update `ShelfCard.stories.tsx` to reflect the icon now appears in the card.

### Step 2.3 — Verification gate (same 5 commands as Phase 1)

---

## Phase 3 — Root Route: Search Params & View Dispatch

### Step 3.1 — Add search params to root route

File: `apps/web/src/routes/index.tsx`

Add `validateSearch`:
```ts
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    groupBy: (search.groupBy as 'shelf' | 'vendor' | 'recipe') || undefined,
    id: (search.id as string) || undefined,
  }),
  component: PantryView,
})
```

Update `PantryView` to dispatch:
```tsx
function PantryView() {
  const { groupBy, id } = Route.useSearch()

  // Redirect if stored preference is 'group' and no params are set yet
  useEffect(() => {
    if (!groupBy && getPantryView() === 'group') {
      navigate({ search: { groupBy: getStoredGroupBy() } })
    }
  }, [groupBy, navigate])

  if (groupBy && id) return <GroupDetailView groupBy={groupBy} id={id} />
  if (groupBy) return <GroupListView groupBy={groupBy} />
  return <PantryListView />
}
```

Extract the existing pantry list view JSX into a `<PantryListView>` sub-component (within the same file or as a separate file).

### Step 3.2 — Update ViewToggle navigation

File: `apps/web/src/components/shared/ViewToggle/ViewToggle.tsx`

Currently: shelf button navigates to `/shelves`. Change to:
- Shelf/group button: `navigate({ to: '/', search: { groupBy: getStoredGroupBy() } })` + `setPantryView('group')`
- List button: `navigate({ to: '/', search: {} })` + `setPantryView('list')`

Check the component's interface — the onChange callback may need updating to pass search params rather than route strings.

### Step 3.3 — Verification gate

---

## Phase 4 — Group List Views (Vendor & Recipe)

### Step 4.1 — Implement `GroupListView` component

Create `apps/web/src/routes/_components/GroupListView.tsx` (or inline in `index.tsx` if not too large).

Props: `{ groupBy: 'shelf' | 'vendor' | 'recipe' }`

Render logic:
- `groupBy === 'shelf'` → move existing ShelvesPage JSX here (from `/shelves/index.tsx`)
- `groupBy === 'vendor'` → `<VendorGroupView>`
- `groupBy === 'recipe'` → `<RecipeGroupView>`

Toolbar in group view:
```tsx
<Toolbar>
  <ViewToggle current="group" onChange={handleViewToggle} />
  <GroupByToggle current={groupBy} onChange={handleGroupByChange} />
  <div className="flex-1" />
  <Button asChild>
    <Link to={settingsPath}>Manage</Link>  {/* settings path by groupBy */}
  </Button>
</Toolbar>
```

Where `settingsPath`:
- shelf → `/settings/shelves`
- vendor → `/settings/vendors`
- recipe → `/settings/recipes`

`handleGroupByChange`: update `?groupBy` param, clear `?id`, persist via `setStoredGroupBy`.

### Step 4.2 — Implement `VendorGroupView`

Inline within GroupListView or as a small sub-component.

Data: `useVendors()`, `useItems()`

Metric computation per vendor (parallel the existing shelf metrics in `/shelves/index.tsx`):
```ts
const getVendorItems = (vendorId: string): Item[] =>
  vendorId === 'unsorted'
    ? items.filter(i => !i.vendorIds || i.vendorIds.length === 0)
    : items.filter(i => i.vendorIds?.includes(vendorId))

const getItemCount = (vendorId: string) => getVendorItems(vendorId).length

const getOutOfStockCount = (vendorId: string) =>
  getVendorItems(vendorId).filter(i => getCurrentQuantity(i) < i.refillThreshold).length

const getLowStockCount = (vendorId: string) =>
  getVendorItems(vendorId).filter(i => getCurrentQuantity(i) === i.refillThreshold).length

const getActiveCount = (vendorId: string) =>
  getVendorItems(vendorId).filter(i => !isInactive(i)).length

const getVendorPackTotals = (vendorId: string) => {
  const vendorItems = getVendorItems(vendorId)
  // sum totalPacked, totalTarget, totalRefill using getItemPackUnits
}
```

Render:
```tsx
{vendors.map(v => (
  <GroupCard
    key={v.id}
    name={v.name}
    nameClassName="normal-case"
    icon={<Store size={16} />}
    itemCount={getItemCount(v.id)}
    outOfStockCount={getOutOfStockCount(v.id)}
    lowStockCount={getLowStockCount(v.id)}
    activeCount={getActiveCount(v.id)}
    {...getVendorPackTotals(v.id)}
    onClick={() => navigate({ to: '/', search: { groupBy: 'vendor', id: v.id } })}
  />
))}
{/* Unsorted card — shown if any items have no vendorIds */}
{unsortedVendorItems.length > 0 && (
  <GroupCard
    name={t('Unsorted')}
    itemCount={unsortedVendorItems.length}
    {...getVendorPackTotals('unsorted')}
    onClick={() => navigate({ to: '/', search: { groupBy: 'vendor', id: 'unsorted' } })}
  />
)}
```

### Step 4.3 — Implement `RecipeGroupView`

Same pattern as VendorGroupView.

Data: `useRecipes()`, `useItems()`

```ts
const getAllRecipeItemIds = (): Set<string> =>
  new Set(recipes.flatMap(r => r.items.map(ri => ri.itemId)))

const getRecipeItems = (recipeId: string): Item[] =>
  recipeId === 'unsorted'
    ? items.filter(i => !getAllRecipeItemIds().has(i.id))
    : (() => {
        const recipe = recipes.find(r => r.id === recipeId)
        if (!recipe) return []
        const ids = new Set(recipe.items.map(ri => ri.itemId))
        return items.filter(i => ids.has(i.id))
      })()
```

Render (same pattern as VendorGroupView, with recipe icon and capitalize names):
```tsx
{recipes.map(r => (
  <GroupCard
    key={r.id}
    name={r.name}
    icon={<ChefHat size={16} />}
    itemCount={getItemCount(r.id)}
    {...getRecipePackTotals(r.id)}
    onClick={() => navigate({ to: '/', search: { groupBy: 'recipe', id: r.id } })}
  />
))}
{unsortedRecipeItems.length > 0 && (
  <GroupCard
    name={t('Unsorted')}
    itemCount={unsortedRecipeItems.length}
    {...getRecipePackTotals('unsorted')}
    onClick={() => navigate({ to: '/', search: { groupBy: 'recipe', id: 'unsorted' } })}
  />
)}
```

### Step 4.4 — Verification gate

---

## Phase 5 — Group Detail Views (Vendor & Recipe)

### Step 5.1 — Implement `GroupDetailView` component

Create `apps/web/src/routes/_components/GroupDetailView.tsx` (or inline in `index.tsx`).

Props: `{ groupBy: 'shelf' | 'vendor' | 'recipe', id: string }`

Dispatch:
- `groupBy === 'shelf'` → move existing ShelfDetailPage JSX here (from `/shelves/$shelfId.tsx`)
- `groupBy === 'vendor'` → `<VendorDetailView vendorId={id} />`
- `groupBy === 'recipe'` → `<RecipeDetailView recipeId={id} />`

**Back navigation:** `navigate({ to: '/', search: { groupBy } })`

### Step 5.2 — Implement `VendorDetailView`

Component: renders items for a specific vendor (or unsorted).

Data: `useItems()`, `useVendors()`, `useTags()`, `useTagTypes()`, `useRecipes()`

Item filtering:
```ts
const inVendorItems: Item[] =
  vendorId === 'unsorted'
    ? allItems.filter(i => !i.vendorIds || i.vendorIds.length === 0)
    : allItems.filter(i => i.vendorIds?.includes(vendorId))
```

Toolbar:
```tsx
<Toolbar>
  <Button onClick={goBack}><ArrowLeft /></Button>
  <h1>{isUnsorted ? t('Unsorted') : vendor?.name}</h1>
  {/* Sort dropdown */}
  {/* Sort direction */}
  {/* Tag toggle */}
  {/* Search toggle */}
  {!isUnsorted && <Button asChild><Link to="/settings/vendors"><Settings /></Link></Button>}
</Toolbar>
```

Sort/search/filter: reuse `useSortFilter('vendor-detail')`, `useUrlSearchAndFilters()`, same pattern as ShelfDetailPage.

Item list: render `<ItemCard>` for each sorted/filtered item.

### Step 5.3 — Implement `RecipeDetailView`

Same structure as VendorDetailView.

Item filtering:
```ts
const recipe = recipes.find(r => r.id === recipeId)

const inRecipeItems: Item[] =
  recipeId === 'unsorted'
    ? allItems.filter(i => !allRecipeItemIds.has(i.id))
    : (recipe?.items ?? []).map(ri => allItems.find(i => i.id === ri.itemId)).filter(Boolean)
```

Settings button: navigate to `/settings/recipes/$recipeId` (check if this route exists; if not, navigate to `/settings/recipes`).

### Step 5.4 — Verification gate

---

## Phase 6 — Migrate Shelf Views & Delete Old Routes

### Step 6.1 — Migrate shelf group view

Move all logic from `apps/web/src/routes/shelves/index.tsx` into the `groupBy === 'shelf'` branch of `GroupListView`. The logic itself is unchanged — only the navigation calls update:
- `handleShelfClick(shelfId)` → `navigate({ to: '/', search: { groupBy: 'shelf', id: shelfId } })`
- `handleUnsortedClick()` → `navigate({ to: '/', search: { groupBy: 'shelf', id: 'unsorted' } })`

### Step 6.2 — Migrate shelf detail view

Move all logic from `apps/web/src/routes/shelves/$shelfId.tsx` into the `groupBy === 'shelf'` branch of `GroupDetailView`. Update:
- Back button → `navigate({ to: '/', search: { groupBy: 'shelf' } })`
- Settings button path uses the same `/settings/shelves/$shelfId` (unchanged)

### Step 6.3 — Delete old route files

Delete:
- `apps/web/src/routes/shelves.tsx`
- `apps/web/src/routes/shelves/index.tsx`
- `apps/web/src/routes/shelves/$shelfId.tsx`
- Any Storybook or test files co-located with those routes

Check for other files referencing `/shelves`:
```bash
grep -r "to: '/shelves'" apps/web/src/ --include="*.tsx" --include="*.ts"
grep -r "href.*shelves" apps/web/src/ --include="*.tsx" --include="*.ts"
```

Fix all found references.

### Step 6.4 — Verification gate

---

## Phase 7 — E2E Tests & A11y

### Step 7.1 — Update E2E tests

Find E2E test files referencing `/shelves`:
```bash
grep -r "shelves" e2e/ --include="*.spec.ts" --include="*.ts" -l
```

Update:
- `/shelves` → `/?groupBy=shelf`
- `/shelves?...` → `/?groupBy=shelf&...`
- Any navigation to `/shelves/$shelfId` → `/?groupBy=shelf&id=$shelfId`

### Step 7.2 — Add a11y coverage

File: `e2e/tests/a11y.spec.ts`

Add group view URLs to the light/dark mode test list:
- `/?groupBy=shelf`
- `/?groupBy=vendor`
- `/?groupBy=recipe`

(Detail views are likely covered indirectly; add if needed.)

### Step 7.3 — Run E2E tests
```bash
pnpm test:e2e --grep "pantry|shelves|shelf|vendor|recipe|a11y"
```

Fix any failures before proceeding.

---

## Phase 8 — Docs & Commit

### Step 8.1 — Update CLAUDE.md files

- `apps/web/src/routes/CLAUDE.md` — update routing table, remove `/shelves` references, document new `?groupBy`/`?id` params
- `apps/web/src/components/CLAUDE.md` — add VendorCard, RecipeCard, GroupByToggle to shared component docs if applicable

### Step 8.2 — Update `docs/INDEX.md`

Update pantry row:
- Status: 🔄 In Progress → (set to ✅ when done)
- Note the group-by feature and that the unified-view plan is superseded

### Step 8.3 — Commit

Split into logical commits:
1. `feat(pantry): add viewPreference groupBy storage and GroupByToggle component`
2. `feat(pantry): add GroupCard unified card component, refactor ShelfCard to use it`
3. `feat(pantry): migrate shelf views to root route with ?groupBy search params`
4. `feat(pantry): add vendor and recipe group/detail views`
5. `chore(shelves): delete /shelves route files`
6. `test(e2e): update shelves URLs and add group-by a11y coverage`
7. `docs(pantry): add group-by design doc, brainstorming log, and implementation plan`

---

## Acceptance Criteria

- [ ] ViewToggle shows group view at `/?groupBy=shelf` (default)
- [ ] GroupByToggle switches between shelf/vendor/recipe, persists in localStorage
- [ ] GroupCard renders icon to the left of the name; ShelfCard uses it internally
- [ ] Vendor group view shows GroupCard (Store icon, normal-case name) for each vendor
- [ ] Recipe group view shows GroupCard (ChefHat icon, capitalize name) for each recipe
- [ ] Unsorted card shown for vendor and recipe group views
- [ ] Clicking a vendor/recipe card opens detail view at `/?groupBy=X&id=Y`
- [ ] Detail view has full toolbar (sort, search, tags, back, settings)
- [ ] Settings button on group view navigates to the correct settings page
- [ ] `/shelves` and `/shelves/$shelfId` routes are gone (404)
- [ ] All existing shelf behavior is preserved in the migrated view
- [ ] View preference (list/group) persists across page refreshes
- [ ] A11y checks pass on new group view URLs
- [ ] All existing E2E tests pass
