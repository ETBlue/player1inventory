# CLAUDE.md Size Reduction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `## Features` section (~20k chars) out of the root `CLAUDE.md` into five sub-directory `CLAUDE.md` files so the root drops from 50.1k to ~30k characters.

**Architecture:** Each feature section is cut from the root file and pasted verbatim into a new `CLAUDE.md` co-located with the routes it describes. Claude Code auto-loads sub-directory `CLAUDE.md` files from all ancestor directories of any file it reads, so the content reaches Claude exactly when needed. The root `## Features` section is replaced with a short pointer block listing the five new files.

**Tech Stack:** Plain Markdown. No code changes. No tests required.

---

## Chunk 1: Create sub-directory CLAUDE.md files (Tasks 1–5)

### Task 1: Create `apps/web/src/routes/items/CLAUDE.md`

**Files:**
- Create: `apps/web/src/routes/items/CLAUDE.md`

Content: the `### Tabbed Item Form` and `### Manual Quantity Input` subsections from root `CLAUDE.md` (lines 92–204).

- [ ] **Step 1: Create the file**

Create `apps/web/src/routes/items/CLAUDE.md` with this exact content (copy verbatim from root CLAUDE.md lines 92–204):

```markdown
### Tabbed Item Form

Item detail pages use a tabbed layout with three sections:

**1. Stock Status (default tab, `/items/$id`)**
- Quantity fields for packed and unpacked stock
- Unpacked quantity field always enabled (supports fractional packages)
- Expiration date field (date value, not mode/threshold)
- Save button disabled when no changes made

**2. Item Info (same route, `/items/$id`)**
- Item name and package unit configuration
- Target quantity and refill threshold
- Consumption amount settings
- Expiration mode (specific date or days from purchase) and warning threshold

**3. Tags (`/items/$id/tags`)**
- Tag assignment interface with uppercase text styling for tag type names
- Click badges to toggle tag assignment (selected tags show X icon)
- Visual dividers between tag type sections
- Inline tag creation via "New Tag" buttons (opens `AddNameDialog`)
- Changes apply immediately without save button

**4. Vendors (`/items/$id/vendors`)**
- Vendor assignment interface: click-to-toggle badges, immediate save
- "New Vendor" button inline with badges — opens `AddNameDialog`, creates and immediately assigns the vendor
- Changes apply immediately without save button

**5. Recipes (`/items/$id/recipes`)**
- Recipe assignment interface: click-to-toggle badges, immediate save
- Architecture: recipe-centric — `Recipe.items[]` stores the relationship; toggling updates the recipe, not the item
- "New Recipe" button inline with badges — opens `AddNameDialog`, creates recipe assigned to this item
- Changes apply immediately without save button

**Measurement Tracking Behavior:**

The "Track in measurement" switch controls measurement-based quantity tracking:
- **Switch always enabled** - Users can toggle freely between package/measurement modes
- **When OFF** (package mode):
  - Measurement fields (unit, amount per package) are disabled
  - All quantities tracked in package units
- **When ON** (measurement mode):
  - Measurement fields become enabled and required
  - Form cannot be submitted until both fields filled
  - Quantities automatically convert between units when toggling

**Unit Conversion:**

When toggling between package/measurement modes, these fields auto-convert:
- Unpacked quantity
- Target quantity
- Refill threshold
- Amount per consume

Conversion uses the `amountPerPackage` value (e.g., 500g per pack).

**Dirty State Tracking:**

Each tab tracks unsaved changes independently:
- Navigation guard prevents tab switching with unsaved changes
- Confirmation dialog offers "Discard" or "Cancel" options
- Save button disabled when form is clean (no changes)
- Logs tab never has unsaved changes (view-only)

**Navigation:**

Back button and post-action navigation use smart history tracking:
- Back button navigates to previous app page (fallback to home if no history)
- After successful save: auto-navigate back
- After successful delete: auto-navigate back
- Back button respects dirty state guard (shows discard dialog if unsaved changes)

Uses `useAppNavigation()` hook from `src/hooks/useAppNavigation.ts`.

**Files:**
- `src/components/item/ItemForm/index.tsx` - Shared form component used by both edit and new item routes
- `src/routes/items/$id.tsx` - Parent layout with tabs and navigation guard
- `src/routes/items/$id/index.tsx` - Stock Status + Item Info form (uses ItemForm with all sections)
- `src/routes/items/$id/tags.tsx` - Tags tab implementation
- `src/routes/items/$id/vendors.tsx` - Vendors tab implementation
- `src/routes/items/$id/vendors.test.tsx` - Vendors tab tests
- `src/routes/items/$id/recipes.tsx` - Recipes tab implementation
- `src/routes/items/$id/recipes.test.tsx` - Recipes tab tests
- `src/routes/items/$id.log.tsx` - History/logs tab (view-only)
- `src/routes/items/$id.test.tsx` - Integration tests
- `src/routes/items/new.tsx` - New item form (uses ItemForm with info + advanced sections)
- `src/hooks/useItemLayout.tsx` - Dirty state context for tab coordination

### Manual Quantity Input

Users can manually set current inventory quantities in the item detail form:
- **Packed Quantity** - Number of whole packages (always visible)
- **Unpacked Quantity** - Loose amount from opened packages (only for dual-unit items)
- **Pack unpacked button** - Manually converts complete units from unpacked to packed

**+/- Button Behavior (Pantry Page):**
- Both + and - buttons always operate on unpacked quantity
- No automatic normalization/packing
- Use "Pack unpacked" button in item detail form to manually pack complete units

**Location:** Item detail page (`/items/$id`) via ItemForm component

**Behavior:**
- Pre-populates with current `item.packedQuantity` and `item.unpackedQuantity`
- Validates non-negative values
- Warns when unpacked ≥ amountPerPackage
- Saves directly to database without creating inventory log entries
- Use for initial setup, corrections, or adjustments

**Files:**
- `src/routes/items/$id/index.tsx` - Item detail form with quantity fields
- `src/routes/items/$id.test.tsx` - Component tests
- `src/lib/quantityUtils.ts` - packUnpacked() function
```

- [ ] **Step 2: Verify file exists and has content**

```bash
wc -l apps/web/src/routes/items/CLAUDE.md
```

Expected: ~90 lines.

---

### Task 2: Create `apps/web/src/routes/settings/vendors/CLAUDE.md`

**Files:**
- Create: `apps/web/src/routes/settings/vendors/CLAUDE.md`

Content: the `### Vendor Management` subsection from root `CLAUDE.md` (lines 207–235).

- [ ] **Step 1: Create the file**

Create `apps/web/src/routes/settings/vendors/CLAUDE.md` with this exact content:

```markdown
### Vendor Management

Vendor CRUD at `/settings/vendors`. Vendors are separate entities (not tags) used for filtering items in shopping mode.

**Vendor type** (`src/types/index.ts`): `id`, `name`, `createdAt` (minimal, name-only)

**Operations** (`src/db/operations.ts`): `getVendors`, `createVendor`, `updateVendor(id, updates: Partial<Omit<Vendor, 'id'>>)`, `deleteVendor`, `getItemCountByVendor`

**Hooks** (`src/hooks/useVendors.ts`): `useVendors`, `useCreateVendor`, `useUpdateVendor` (takes `{ id, updates }`), `useDeleteVendor`, `useItemCountByVendor`

**Routes**: `src/routes/settings/vendors/index.tsx` — vendor list; `src/routes/settings/vendors/new.tsx` — create new vendor, redirects to detail page after save

**Components**:
- `src/components/vendor/VendorCard/index.tsx` — displays one vendor with a delete button; vendor name links to the detail page. Accepts `itemCount` and `onDelete` (the actual delete operation); wraps `DeleteButton` internally with an `itemCount`-based dialog description
- `src/components/vendor/VendorNameForm/index.tsx` — presentational form component (name input + save button) used by both the new vendor page and the Info tab

**Item counts**: Vendor list displays item count for each vendor (e.g. "Costco · 12 items") using `useVendorItemCounts()` hook.

**Settings link**: `src/routes/settings/index.tsx` (Store icon)

**Assignment UI**: `src/routes/items/$id/vendors.tsx` — Vendors tab in item detail. Click-to-toggle badges, immediate save via `useUpdateItem`. "New Vendor" button inline with badges opens `AddNameDialog` to create and immediately assign a vendor. No Save button (same as tags tab).

**Vendor detail page**: `src/routes/settings/vendors/$id.tsx` — Tabbed layout (Info + Items). Info tab: edit vendor name with Save button. Items tab: combined search+create input with a searchable checklist of all items showing their current vendor assignments; saves immediately when a checkbox is clicked (no staged state, no Save button), same pattern as the Tags tab. Typing a name that matches no items reveals a `+ Create "<name>"` row — clicking it or pressing Enter creates the item immediately assigned to this vendor; pressing Escape clears the input.

**Dirty state**: `src/hooks/useVendorLayout.tsx` — same pattern as `useItemLayout`. Navigation guard on parent layout applies only to the Info tab (vendor name editing); the Items tab has no unsaved state.

**Navigation:**

Back button and post-action navigation use smart history tracking (same pattern as item detail pages). After successful save, automatically navigates back to previous page. Uses `useAppNavigation()` hook.
```

- [ ] **Step 2: Verify file exists and has content**

```bash
wc -l apps/web/src/routes/settings/vendors/CLAUDE.md
```

Expected: ~30 lines.

---

### Task 3: Create `apps/web/src/routes/settings/tags/CLAUDE.md`

**Files:**
- Create: `apps/web/src/routes/settings/tags/CLAUDE.md`

Content: the `### Tag Management` subsection from root `CLAUDE.md` (lines 237–265).

- [ ] **Step 1: Create the file**

Create `apps/web/src/routes/settings/tags/CLAUDE.md` with this exact content:

```markdown
### Tag Management

Tag detail page at `/settings/tags/$id` with Info and Items tabs, mirroring vendor detail page pattern.

**Tag detail page**: `src/routes/settings/tags/$id.tsx` — Tabbed layout (Info + Items). Info tab: edit tag name and tag type with Save button. Items tab: combined search+create input with a searchable checklist of all items showing their current tag assignments; saves immediately when a checkbox is clicked (no staged state, no Save button), same pattern as the vendor Items tab. Typing a name that matches no items reveals a `+ Create "<name>"` row — clicking it or pressing Enter creates the item immediately assigned to this tag; pressing Escape clears the input.

**Tag badge visual style**: `TagBadge` uses the tint variant (`${tagType.color}-tint`) — light background, colored border, dark text. On the tags list page, each badge is paired with an X (delete) button whose border and icon color match the badge's border color. This uses `TAG_COLOR_BORDER` and `TAG_COLOR_TEXT` lookup tables (static `Record<TagColor, string>` maps) in `src/routes/settings/tags/index.tsx` to avoid dynamic Tailwind class names that won't survive production builds.

**Tag type modification**: Users can change a tag's type in two ways:
1. **Drag-and-drop** (tags list page `/settings/tags`): Drag tag badges between tag type cards. Saves immediately with 5-second undo toast.
2. **Select dropdown** (tag detail Info tab): Choose tag type from dropdown. Saves with Save button, respects dirty state.

Uses `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` for accessible drag-and-drop.

**Dirty state**: `src/hooks/useTagLayout.tsx` — same pattern as `useVendorLayout`. Navigation guard on parent layout applies only to the Info tab (tag name and type editing); the Items tab has no unsaved state.

**Navigation:**

Back button and post-action navigation use smart history tracking (same pattern as vendor detail pages). After successful save, automatically navigates back to previous page. Uses `useAppNavigation()` hook.

**Entry point:** Click tag badge on tags list page (`/settings/tags`) to navigate to tag detail page.

**Files:**
- `src/routes/settings/tags/$id.tsx` - Parent layout with tabs and navigation guard
- `src/routes/settings/tags/$id/index.tsx` - Info tab (tag name and type editing)
- `src/routes/settings/tags/$id/items.tsx` - Items tab
- `src/routes/settings/tags/index.tsx` - Tags list page with drag-and-drop
- `src/hooks/useTagLayout.tsx` - Dirty state provider
- `src/components/tag/TagNameForm/index.tsx` - Presentational form component
```

- [ ] **Step 2: Verify file exists and has content**

```bash
wc -l apps/web/src/routes/settings/tags/CLAUDE.md
```

Expected: ~35 lines.

---

### Task 4: Create `apps/web/src/routes/settings/CLAUDE.md`

**Files:**
- Create: `apps/web/src/routes/settings/CLAUDE.md`

Content: the `### Cascade Deletion` subsection from root `CLAUDE.md` (lines 267–277).

> **Note:** The cascade logic itself lives in `src/db/operations.ts` and `src/hooks/`, not in `src/routes/settings/`. This file covers the UI entry points (delete buttons on vendor/tag detail pages). When working directly on `src/db/operations.ts`, this file will not auto-load — the cascade behavior is also described in the Vendor Management and Tag Management sections in their respective sub-files.

- [ ] **Step 1: Create the file**

Create `apps/web/src/routes/settings/CLAUDE.md` with this exact content:

```markdown
### Cascade Deletion

Deleting a tag, tag type, or vendor automatically cleans up all item references:

- **Delete tag** → removes tag from all item `tagIds` arrays (+ bumps `updatedAt`)
- **Delete tag type** → deletes all child tags (which cascade to items), then deletes the type
- **Delete vendor** → removes vendor from all item `vendorIds` arrays (+ bumps `updatedAt`)

Cascade logic lives in `src/db/operations.ts` (`deleteTag`, `deleteTagType`, `deleteVendor`). The hooks (`useDeleteTag`, `useDeleteTagType`, `useDeleteVendor`) also invalidate the `['items']` query cache after deletion.

**Count helpers** for confirmation dialogs: `getItemCountByTag`, `getItemCountByVendor`, `getTagCountByType` in `src/db/operations.ts`; corresponding hooks `useItemCountByTag`, `useItemCountByVendor`, `useTagCountByType`.
```

- [ ] **Step 2: Verify file exists and has content**

```bash
wc -l apps/web/src/routes/settings/CLAUDE.md
```

Expected: ~12 lines.

---

### Task 5: Create `apps/web/src/routes/CLAUDE.md`

**Files:**
- Create: `apps/web/src/routes/CLAUDE.md`

Content: `### Item List Filter Pipeline`, `### Shopping Page`, and `### Cooking Page` subsections from root `CLAUDE.md` (lines 279–419).

- [ ] **Step 1: Create the file**

Create `apps/web/src/routes/CLAUDE.md` with this exact content:

```markdown
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

**Vendor filter:** Select dropdown in toolbar showing item counts per vendor (e.g. "Costco (12)"). Single-select, pre-scopes the filter branch only (not search). Disabled and greyed out while search is active. State is not persisted.

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

**State** (in `CookingPage`):
- `expandedRecipeIds: Set<string>` — which recipe cards are expanded; purely layout
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
```

- [ ] **Step 2: Verify file exists and has content**

```bash
wc -l apps/web/src/routes/CLAUDE.md
```

Expected: ~140 lines.

---

## Chunk 2: Update root CLAUDE.md and verify (Task 6)

### Task 6: Replace `## Features` in root CLAUDE.md with pointer block

**Files:**
- Modify: `CLAUDE.md` (lines 90–419)

- [ ] **Step 1: Replace the Features section**

In root `CLAUDE.md`, replace everything from line 90 (`## Features`) through line 419 (end of `### Cooking Page`) with this pointer block:

```markdown
## Features

> Feature documentation lives in sub-directory CLAUDE.md files co-located with the routes:
> - `apps/web/src/routes/CLAUDE.md` — filter pipeline, shopping, cooking
> - `apps/web/src/routes/items/CLAUDE.md` — item form, manual quantity input
> - `apps/web/src/routes/settings/CLAUDE.md` — cascade deletion
> - `apps/web/src/routes/settings/tags/CLAUDE.md` — tag management
> - `apps/web/src/routes/settings/vendors/CLAUDE.md` — vendor management
```

- [ ] **Step 2: Verify root CLAUDE.md is under 40k characters**

```bash
wc -c /Users/etblue/Code/GitHub/player1inventory/CLAUDE.md
```

Expected: output below 40000.

- [ ] **Step 3: Verify the Features section was replaced correctly**

```bash
grep -n "^## Features" CLAUDE.md
grep -n "apps/web/src/routes/CLAUDE.md" CLAUDE.md
```

Expected: `## Features` appears exactly once; the pointer line appears exactly once.

- [ ] **Step 4: Commit all changes**

```bash
git add CLAUDE.md \
  apps/web/src/routes/CLAUDE.md \
  apps/web/src/routes/items/CLAUDE.md \
  apps/web/src/routes/settings/CLAUDE.md \
  apps/web/src/routes/settings/tags/CLAUDE.md \
  apps/web/src/routes/settings/vendors/CLAUDE.md
git commit -m "docs(claude-md): move Features section to sub-directory CLAUDE.md files"
```
