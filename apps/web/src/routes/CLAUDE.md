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

**Vendor filter:** Select dropdown in toolbar showing item counts per vendor (e.g. "Costco (12)"). Single-select, pre-scopes the filter branch only (not search). Disabled and greyed out while search is active. Persisted in `?vendor` URL param; cleared on checkout or cart abandonment.

**Tag/recipe filter:** `Filters` toggle button (`Filter` icon) in `ItemListToolbar` shows/hides an `ItemFilters` row below the toolbar. Applied in the filter branch only. Filter state persists to URL params (and is carried over to other item list pages via sessionStorage key `item-list-search-prefs`).

**`ItemCard` in shopping mode:**
- `showTags={false}` hides tags, vendors, and recipe badges
- `showExpiration={false}` hides expiration (irrelevant at purchase time)
- `showTagSummary={false}` hides the "N tags · N vendors · N recipes" count summary

**Pinned items:** Users can reduce a cart item's quantity to 0 to "pin" it. Pinned items:
- Remain in the cart section (still checked) but don't contribute to the purchase count
- Do NOT update inventory or create logs on checkout
- Are automatically moved to the new active cart after checkout, so they appear ready for the next trip
- Are removed if the cart is abandoned (intentional — abandoning clears everything)

**Done button:** Disabled when `!cartItems.some(ci => ci.quantity > 0)` — i.e. when no item is actually being purchased (all pinned or cart empty).

**Checkout (`src/db/operations.ts`):** Separates `pinnedItems` (qty=0) from `buyingItems` (qty>0). Only processes `buyingItems` in the inventory loop. After marking the cart completed and deleting all cartItems, re-adds pinned items to the new active cart via `getOrCreateActiveCart()`.

**URL search params** (validated by `validateSearch` on the route):
- `?vendor` — selected vendor ID (default: `''` = All vendors)

**Files:**
- `src/routes/shopping.tsx` — main page with both vendor and tag filter controls
- `src/routes/shopping.test.tsx` — integration tests (tag filtering + existing shopping behavior)

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
- `?sort` — `name` | `recent` | `count` (default: `name`)
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

**`lastCookedAt`:** When Done is confirmed, `lastCookedAt` is recorded on each Recipe that had at least one item checked, via `useUpdateRecipeLastCookedAt`. This timestamp drives the `recent` sort order.

**Files:**
- `src/routes/cooking.tsx` — main page
- `src/routes/cooking.test.tsx` — integration tests
- `src/routes/cooking.stories.tsx` — Storybook stories (Default, WithRecipes, WithCheckedRecipe, WithExpandedRecipe, WithActiveToolbar, WithSearch, SortByRecent, SortByCount)
- `src/components/recipe/CookingControlBar/index.tsx` — second-row toolbar component
