### Pantry Page (`/`)

The pantry home page (`src/routes/index.tsx`) supports two display modes and three group-by views, all controlled by URL search params.

**URL search params** (validated by `validateSearch` on the route):
- `?groupBy` — `'shelf'` | `'vendor'` | `'recipe'` — switches to group view; absent = flat list view
- `?id` — entity ID for drill-down detail within a group view (e.g. `/?groupBy=shelf&id=<shelfId>`)

**View selection logic (in `index.tsx`):**
```
groupBy absent → PantryListView   (flat scrollable item list)
groupBy=shelf, id absent  → ShelfGroupView    (list of shelf group cards)
groupBy=shelf, id present → ShelfDetailView   (items on one shelf)
groupBy=vendor, id absent  → VendorGroupView   (list of vendor group cards)
groupBy=vendor, id present → VendorDetailView  (items for one vendor)
groupBy=recipe, id absent  → RecipeGroupView   (list of recipe group cards)
groupBy=recipe, id present → RecipeDetailView  (items in one recipe)
```

**View preference persistence** (`src/lib/viewPreference.ts`):
- `pantryView` key in localStorage — `'list'` | `'group'`; remembered across sessions
- `pantryGroupBy` key in localStorage — `'shelf'` | `'vendor'` | `'recipe'`; last used group-by
- When switching from list → group: reads `getStoredGroupBy()` to restore last group-by
- When switching group-by: writes `setStoredGroupBy(g)` before navigating

**Toolbar controls (group views):**
- `ViewToggle` — switches between list and group views
- `GroupByToggle` — switches between shelf / vendor / recipe groupings (three icon buttons)
- "Manage" button — links to `/settings/shelves`, `/settings/vendors`, or `/settings/recipes` depending on current group-by

**Components** (`src/components/pantry/`):
- `PantryListView` — flat item list with full toolbar (sort, filter, search, add)
- `ShelfGroupView` / `ShelfDetailView` — shelf-based grouping
- `VendorGroupView` / `VendorDetailView` — vendor-based grouping
- `RecipeGroupView` / `RecipeDetailView` — recipe-based grouping

**Files:**
- `src/routes/index.tsx` — route with `validateSearch` and view-switching logic
- `src/components/pantry/PantryListView.tsx` — flat list view
- `src/components/pantry/ShelfGroupView.tsx`, `ShelfDetailView.tsx`
- `src/components/pantry/VendorGroupView.tsx`, `VendorDetailView.tsx`
- `src/components/pantry/RecipeGroupView.tsx`, `RecipeDetailView.tsx`
- `src/lib/viewPreference.ts` — localStorage helpers for view/group-by persistence

### Item List Filter Pipeline

All item list pages (pantry, shopping, tag/vendor/recipe items tabs) use a two-branch filter pipeline. Search and filters are mutually exclusive — they never combine:

```typescript
// Branch A: search only (no filters, all items)
const searchedItems = items.filter((item) =>
  item.name.toLowerCase().includes(search.toLowerCase())
)

// Branch B: all URL-param filters, no search
const tagFiltered = filterItems(items, filterState)
const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
const filteredItems = filterItemsByRecipes(vendorFiltered, selectedRecipeIds, recipes)

// Converge at sort — `search.trim()` guards whitespace-only input
const sortedItems = sortItems(search.trim() ? searchedItems : filteredItems, ...)
```

**Shopping page exception:** The vendor single-select (dropdown in toolbar) is a pre-scope applied to `filteredItems` only. Branch A (search) always runs against all items regardless of the selected vendor.

**ItemCard active filter badges:** `ItemCard` accepts `activeVendorIds?: string[]`, `activeRecipeIds?: string[]`, and `activeTagIds?: string[]`. When a badge's ID is in the active set, it renders highlighted. All item list pages that show tags (pantry, tag/vendor/recipe items tabs) pass all three props derived from `selectedVendorIds`, `selectedRecipeIds`, and `Object.values(filterState).flat()`.

- `activeVendorIds` / `activeRecipeIds` — badge renders filled `neutral` variant instead of `neutral-outline`
- `activeTagIds` — badge renders bold `x` variant instead of tint `x-tint` variant; defaults to tint when not provided

**`ItemFilters` dropdown behavior:**
- Render order: vendor dropdown → recipe dropdown → tag type dropdowns → Edit link
- Tag badges inside tag type dropdowns: unselected tags render with `${color}-tint` variant (light), selected tags render with `${color}` variant (solid)
- Vendor and recipe dropdowns include a "Manage" link at the bottom (always visible, with Pencil icon) navigating to `/settings/vendors` and `/settings/recipes` respectively

### Shopping Page

Two-level route structure (mirrors `items/` pattern):
- `shopping.tsx` — thin layout, renders `<Outlet />`
- `shopping/index.tsx` — vendor cart list (root `/shopping` page)
- `shopping/$vendorId.tsx` — per-vendor cart page (`/shopping/:vendorId`)

**`'no-vendor'` sentinel:** The URL segment `no-vendor` maps to `vendorId: null` in the database. Items with no vendors assigned appear exclusively in the no-vendor cart.

---

#### Root page: `/shopping` (vendor cart list)

Shows all vendors as clickable `VendorCartCard` cards. Includes a sort DropdownMenu + direction toggle in the top toolbar.

**Sort options** (persisted in `?sort` + `?dir` URL params):
- `'recent'` (default desc): sorted by `cart.lastVisitedAt` descending — nulls last
- `'alpha'`: alphabetical by vendor name
- `'count'`: total available items descending

**"No vendor" card:** Shown only when at least one item has no vendors assigned. Always renders last regardless of sort order.

**Data:** `useAllActiveCarts()` + `useQueries` fan-out for per-cart item stats + `useVendorItemCounts()` + `useVendors()` + `useItems()`.

**Files:**
- `src/routes/shopping.tsx` — layout (4 lines)
- `src/routes/shopping/index.tsx` — vendor cart list page
- `src/routes/shopping/index.test.tsx` — integration tests

---

#### Vendor cart page: `/shopping/$vendorId`

Vendor-scoped cart with three-toolbar layout.

**Toolbar layout:**

Row 1 (single combined toolbar):
```
[← Go back]  [Vendor name]  [flex-1]  [N packs in cart]  [✕ Cancel]  [✓ Done]
```
- Back button: icon-only on mobile, "Go back" text on desktop (`hidden lg:inline`), aria-label `common.goBack`
- Vendor name: `normal-case` class for vendor names (preserves casing like "iHerb"); plain for "No vendor"
- Cancel: icon-only on mobile, "Cancel" text on desktop — visible only when `cartItems.length > 0`
- Done: icon-only on mobile, "Done" text on desktop — disabled when no item has `quantity > 0`

Row 2 (ItemListToolbar):
- Same filter/sort/search as other item list pages
- No vendor `leading` prop — items are already scoped to this vendor

**Item scoping:**
- Normal vendor: `items.filter(i => (i.vendorIds ?? []).includes(cartVendorId))`
- No-vendor: `items.filter(i => !(i.vendorIds ?? []).length)`

**Cart:** `useVendorCart(cartVendorId)` — creates the cart on first visit if it doesn't exist.

**`lastVisitedAt`:** Stamped via `useUpdateCartLastVisited().mutate(cart.id)` on mount (inside `useEffect` keyed on `cart?.id`). Drives the `'recent'` sort order on the root page.

**Pinned items:** Same behavior as before — quantity 0, stay in cart after checkout, move to the same vendor's new cart.

**Checkout:** `logKey` is always `'shopping.log.purchasedAt'`; `logParams` is `{ vendor: vendor?.name ?? t('shopping.noVendor') }`. After checkout → navigate to `/shopping`.

**Abandon:** After abandoning → navigate to `/shopping`.

**Files:**
- `src/routes/shopping/$vendorId.tsx` — vendor cart page
- `src/routes/shopping/$vendorId.test.tsx` — integration tests

### Cooking Page

Cooking page at `/cooking` for consuming ingredients via recipes.

**Toolbar layout (three rows):**

Row 1 (`<Toolbar>`):
```
[N serving(s) cooked  flex-1]  [Cancel ×]  [Done ✓]
```
- Count text (`N serving(s) cooked`) — always visible; shows 0 when nothing is checked; uses `flex-1` to push buttons right
- **Cancel** (`destructive-ghost`, X icon) — visible only when something is checked; disappears entirely otherwise
- **Done** (Check icon) — always visible; disabled when nothing is checked

Row 2 (`<CookingControlBar>`):
```
[Sort ▾]  [↑↓]  [Expand/Collapse All]  [flex-1]  [🔍]
```
- **Sort** — Select dropdown: Name / Recent / Item Count; persisted in `?sort` URL param
- **Direction** — toggles `?dir` between `asc` and `desc`
- **Expand/Collapse All** — toggles all recipe cards open/closed
- **Search toggle** (`🔍`) — toggles the search input row

Row 3 (search input, inside `CookingControlBar`, conditional):
```
[search input ..................] [+ Create | × clear]
```
- `+ Create` button (primary): shown when query is non-empty AND no exact recipe title match; navigates to `/settings/recipes/new?name=<query>`
- `× clear` button (neutral-ghost, icon): shown whenever query is non-empty (always alongside Create when both conditions apply)
- Pressing Escape clears query (keeps row open); pressing Enter with no exact match navigates to create

**Search filtering:**
- Recipe visible if title or any item name partially matches the query
- Item name matches → recipe auto-expanded, only matching items shown (siblings hidden)
- Title match only → recipe visible but NOT expanded
- Matched substrings highlighted via `highlight()` helper (module-level, in `cooking.tsx`)

**Recipe card layout:**
```
Row 1: [checkbox] [recipe name →detail link] [chevron▼▶]    [− N +]
Row 2:            [N items, M selected, × S]
```
- **Checkbox** — tri-state (checked / indeterminate / unchecked), derived from `checkedItemIds`; clicking toggles all default items (items with `defaultAmount > 0`); if all items have `defaultAmount === 0`, falls back to toggling all items
- **Chevron** — toggles expand/collapse of the item list; purely layout, no effect on check state
- **Serving stepper** (`− N +`) — absolutely positioned to the right of the card; visible when recipe is checked; min = 1
- **Subtitle** (Row 2) — always visible; shows `N items`, `, M selected` when M > 0, and `, × S` when recipe is checked (even at S = 1)

**Expand/collapse:** Layout only — does not affect check state or amounts. Items show as unchecked when first expanded (before the recipe checkbox is clicked). Expand/collapse state is preserved when Done or Cancel is confirmed — only session interaction state (servings, amounts, checked items) is reset.

**Per-item optional ingredients:** Each item in an expanded recipe has its own checkbox. Items with `defaultAmount > 0` start checked when the recipe checkbox is first clicked; items with `defaultAmount === 0` start unchecked. Users can toggle any item. Unchecked items are excluded from consumption.

**Amount adjustment:** Each item card shows ±buttons to adjust the per-serving amount. Step size is `item.consumeAmount`. Amount can be reduced to 0.

**Consumption calculation:** `totalByItemId[itemId] = servings × sessionAmounts[recipeId][itemId]` for each checked item with amount > 0, summed across all checked recipes.

**`ItemCard` in cooking mode:**
- `showTags={false}` hides tags, vendors, and recipe badges
- `showTagSummary={false}` hides the "N tags · N vendors · N recipes" count summary
- `showExpiration` defaults to `true` — expiration is shown (relevant for ingredient freshness)
- `isAmountControllable` is true — ±buttons visible when item is checked
- `minControlAmount` defaults to `0` globally (changed from `1`) — minus disabled at 0, not 1
- `highlightedName?: React.ReactNode` — optional override for the item name display; used by cooking page to pass highlighted search matches

**URL search params** (validated by `validateSearch` on the route):
- `?sort` — `name` | `recent` | `count` (default: `recent`)
- `?dir` — `asc` | `desc` (default: `asc`)
- `?q` — search query string (default: `''`)
- `?expanded` — comma-separated expanded recipe IDs (default: `''` = all collapsed); derived via `useMemo` into `Set<string>`

**State** (in `CookingPage`):
- `expandedRecipeIds: Set<string>` — derived from `?expanded` URL param (not `useState`); which recipe cards are expanded; purely layout
- `sessionServings: Map<recipeId, number>` — integer ≥ 1, initialized to 1 on first interaction
- `sessionAmounts: Map<recipeId, Map<itemId, number>>` — per-serving amounts, initialized from `defaultAmount` on first interaction
- `checkedItemIds: Map<recipeId, Set<itemId>>` — initialized on first checkbox click (not on expand)

**State** (in `CookingControlBar`):
- `searchVisible: boolean` — whether the search input row is visible; initialized from `!!q`

**`lastCookedAt`:** When Done is confirmed, `lastCookedAt` is recorded on each Recipe that had at least one item checked. This timestamp drives the `recent` sort order.

**Files:**
- `src/routes/cooking.tsx` — main page
- `src/routes/cooking.test.tsx` — integration tests
- `src/routes/cooking.stories.tsx` — Storybook stories (Default, WithRecipes, WithCheckedRecipe, WithExpandedRecipe, WithActiveToolbar, WithSearch, SortByRecent, SortByCount)
- `src/components/recipe/CookingControlBar/index.tsx` — second-row toolbar component

### Onboarding Page

Full-screen onboarding flow at `/onboarding` shown automatically to new users (empty DB).

**Empty-data redirect (in `__root.tsx`):** After all three data queries resolve (`useItems`, `useTags`, `useVendors`), if all are empty and the current path is not `/onboarding`, `__root.tsx` navigates to `/onboarding`. Guard: only fires after all queries have loaded (`data !== undefined`). E2E tests that pre-populate data set `localStorage.setItem('e2e-skip-onboarding', 'true')` via `addInitScript` to bypass this redirect.

**Fullscreen page:** `/onboarding` is added to the `isFullscreenPage` check in `Layout`, `Navigation`, and `Sidebar` — bottom nav and sidebar are hidden on this route.

**4-step state machine** (local `useState` — no URL params):
```ts
type OnboardingStep =
  | { type: 'welcome' }
  | { type: 'template-overview' }
  | { type: 'items-browser' }
  | { type: 'vendors-browser' }
```

**Step components** (`src/components/onboarding/`):
- `OnboardingWelcome` — language selector + "Choose from a template" / "Start from scratch" buttons
- `TemplateOverview` — shows item/vendor counts, links to browsers, Confirm button (inline loading + error state)
- `TemplateItemsBrowser` — tag filters, togglable search, select-all, `TemplateItemRow` list
- `TemplateVendorsBrowser` — always-visible search, select-all, `TemplateVendorRow` list

**Template data** (`src/data/template.ts`): 2 tag types, 23 tags, 20 TW pantry items, 19 vendors — all using i18n keys (`template.*`). Deferred: "Import backup" option on welcome screen (documented in `template.ts` comment).

**Files:**
- `src/routes/onboarding.tsx` — route + state machine
- `src/routes/onboarding.stories.tsx` — Storybook stories
- `src/data/template.ts` — template data module
- `src/hooks/useOnboardingSetup.ts` — bulk-create hook (local Dexie only)
- `e2e/tests/onboarding.spec.ts` — E2E tests
