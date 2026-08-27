### Active-Location Scoping

One app-wide **active location** scopes every stock-bearing page. It is held by `useActiveLocation()` (provider in `__root.tsx`, persisted in localStorage under `active-location-id`, defaulting to `DEFAULT_LOCATION_ID = 'local'`) and switched from the `LocationSwitcher`. The active id is part of the TanStack Query keys, so switching it refetches rather than reusing another location's cache.

**Where the switcher lives depends on the breakpoint.** At `lg+` it is in the desktop `Sidebar` (`variant="full"`, showing the location name); below `lg` there is no sidebar and it stays in the pantry/shopping/cooking page toolbars (`variant="compact"`, the single-letter glyph, each site passing `className="lg:hidden"`). Exactly one copy is visible at any width, and the set of pages that have a switcher is unchanged. See `components/CLAUDE.md` for the jsdom duplicate-accessible-name hazard this creates in tests.

| Page | What the active location decides |
| --- | --- |
| **Pantry** (`/`) | Which items exist at all — only those with an `ItemStock` here (`useStockedItems`), and the stock values their cards show |
| **Shopping** (`/shopping`, `/shopping/$vendorId`) | Which carts exist — carts are per `(location × vendor)`; checkout consumes this location's stock and stamps its logs |
| **Cooking** (`/cooking`) | Which recipe items are consumable — an item not stocked here is shown unavailable and never consumed |

The **item detail Stock tab** is the deliberate exception: it pages across **all** locations rather than following the active one (it opens there and keeps naming it — the caption calls it the "current location"). See `items/CLAUDE.md`. Settings pages (tags, vendors, recipes, shelves, locations) are location-independent — those entities are global, and since issue #247 part 2 their four `…/items` assignment tabs enforce it: no stock rendered (`ItemCard showStock={false}`), no active/inactive bucketing, and create-from-search creates inline via `useCreateItem({ catalogOnly: true })`, writing no `ItemStock`. No Settings tab mounts `NewItemDialog`, so none of them can stock an item here at all. See `settings/CLAUDE.md`. The desktop `Sidebar` mirrors the split spatially — the three location-aware links sit under the switcher, Settings is pinned to the bottom.

**Cloud mode has no locations.** `Location`/`ItemStock` have no GraphQL backend yet (deferred in PR D): a cloud `Item` carries its stock inline and its carts are keyed bare. Each page's cloud branch therefore keeps its pre-split behaviour, and the two location mutations (`useAddItemToLocation` / `useRemoveItemFromLocation`) **throw** rather than write local rows the cloud UI never reads.

**When cloud gains locations, multi-row writes must become atomic there too.** Local mode wraps them in a Dexie transaction (`consumeRecipesBatch`, `applyUnitSwitchBatch`); the cloud counterpart is a **single combined GraphQL mutation** wrapping all the affected rows in one server-side transaction, not a sequence of Apollo calls. The item unit switch is the live example — see `items/CLAUDE.md`.

**When cloud gains locations, it also needs a catalog-only create path.** The four Settings
assignment tabs create items stocked in **no** location, via
`useCreateItem({ catalogOnly: true })`. In cloud that flag is a no-op today because there is
no `ItemStock` to skip — so the moment the backend lands, the GraphQL `createItem` mutation
must gain the same affordance and the tabs' cloud branch must use it. Nothing breaks at that
point if it is forgotten; cloud simply starts stocking every Settings-created item in a
default location again, silently. See `settings/CLAUDE.md`.

### Pantry Page (`/`)

The pantry home page (`src/routes/index.tsx`) supports two display modes and three group-by views, all controlled by URL search params.

**Active-location scoping (PR D):** All seven pantry views read `useStockedItems()` (not `useItems()`), so the pantry shows **only items stocked in the active location** (those with an `ItemStock` row there); switching the active location via the `LocationSwitcher` re-scopes the list, and sorting/filtering operate on that scoped set. The **Add button** opens `NewItemDialog`, a combobox over the **full** catalog (`useItems()`) — selecting an existing item stocks it here via copy-on-add, creating a new one stocks it here. The pantry is now the dialog's only caller. Shopping carts and cooking are likewise active-location-scoped (see their sections).

**Groups with nothing stocked here sink below a divider (they are never hidden).** In all three group views a group whose item count is 0 — nothing stocked in the active location — still renders, but below a `ListSectionDivider` labelled `common.notStockedHere` ("N not stocked here"). It replaces an earlier "hide at zero" behaviour on the same branch: a group that vanished gave no way to tell "empty *here*" from "gone". The shopping vendor list and the cooking recipe list apply the same rule (see their sections).

The partition runs **after** the existing sort, as two `.filter` passes, so order is preserved *within* each half and never overridden by a stocked-ness primary key — the shelf `order` sort in particular.

The predicate is simply `getItemCount(…) === 0` — **no `stockId` guard and no cloud bypass belong here.** These views read `useStockedItems()`, which is already location-scoped and already falls back to the full list in cloud mode, so an empty group *is* the signal. This is the opposite of shopping and cooking, which read `useItems()` and therefore do need an explicit `stockId` check plus an `isCloud` bypass. (`ShelfGroupView` partitions on `getShelfItems(id).length`, which its `getItemCount` now delegates to — a selection shelf's raw `itemIds` is location-blind and counted items stocked elsewhere.)

The unfiled pseudo-cards split sink from hide:

| Card | At zero |
| --- | --- |
| `Unsorted` (shelf) | always renders — it is the only route to items on no shelf — and sinks below the divider |
| `No vendor` / `Not added to recipe` | hidden when nothing is unfiled **anywhere**; rendered below the divider when unfiled items exist but none are stocked here |

Telling those two cases apart needs the global catalog, which `useStockedItems()` cannot see — that is the **only** reason `VendorGroupView` and `RecipeGroupView` also run a `useItems()` query.

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
- `LocationSwitcher` — leading; global active-location selector. Mounted on every pantry view (group + detail + flat list) with `className="lg:hidden"` — at `lg+` the sidebar copy takes over
- `ViewToggle` — switches between list and group views
- `GroupByToggle` — switches between shelf / vendor / recipe groupings (three icon buttons)
- "Manage X" button — entity-specific label ("Manage shelves" / "Manage vendors" / "Manage recipes" via `settings.{shelves,vendors,recipes}.manage`) links to `/settings/shelves`, `/settings/vendors`, or `/settings/recipes` depending on current group-by. Icon-only on mobile (`hidden lg:inline` for the text)

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

**Search grows a tail on the flat pantry and shelf detail too (unified item search, PR B — built on the same `useItemSearchTailWiring` hook the cart page uses; see `hooks/CLAUDE.md`).**

- **`PantryListView` renders bucket 3 only.** `inGroupIds` is the FULL stocked-here set (`items`, from `useStockedItems()`) — every item the page could possibly render — so bucket 2 ("stocked here, absent from this page's list") is empty **by construction**, and the page passes neither `groupAction` nor `groupNote`. `hasTail` therefore only ever tracks bucket 3, and the empty-state guard is `sortedItems.length === 0 && !hasTail` — a search that used to look empty when nothing matched locally now shows what exists elsewhere. **`hasExactMatch` on the toolbar reads the GLOBAL catalog** (`hasExactGlobalMatch`), same #245 fix as the cart page.
- **`ShelfDetailView` renders both sections, gated on the shelf's `type`.** `inGroupIds` is `inShelfItemIds` — the shelf's own already-location-scoped item set (unaffected by the delete of the old hand-rolled "Not in this shelf" block and its `outsideShelfSearchMatches` memo, which this tail replaces outright). Bucket 2's action depends on `shelf?.type`:
  | Shelf type | Bucket 2 | Why |
  | --- | --- | --- |
  | `selection` | `groupAction` — `t('items.searchTail.addToShelf')`, appends the item to `shelf.itemIds` | the only shelf type with a real "membership" to grant |
  | `filter` | `groupNote` — `t('items.searchTail.notMatchingShelf')`, an inert line | a plain button press carries no criteria to satisfy `matchesFilterConfig`'s AND-across-axes rule (OR within a tag type, AND between types/vendors/recipes) — PR D adds a per-axis picker (one pick per tag type present in `filterConfig.tagIds`, one vendor, one recipe) and swaps this `groupNote` for a `groupAction` once the user's picks are in hand; **nothing else about the wiring changes when that lands** |
  | `system` / `unsorted` (pseudo-shelf) | neither | no add path ever existed for these (`handleAddToSelectionShelf` used to early-return), and inventing one is out of scope |

  Bucket 3 (`Add to {location}`) is unconditional on every shelf type — it is group-agnostic, and promotes an item straight to bucket 1 when the shelf membership it needed turns out to already exist (e.g. an item already in `shelf.itemIds` but stocked only at another location).
- **Both surfaces build their tail card via a local `renderTailItemCard`, not the page's own `vendorMap`/`recipeMap`.** Those maps are keyed only over the page's already-scoped `items`/`inShelfItems`, but bucket 3 rows are exactly the items NOT in that set — so vendor/recipe badges are filtered directly from the global `vendors`/`recipes` lists per row instead. Small lists while a search is active, so this is not a perf concern.
- Cloud mode renders nothing extra beyond bucket 1 on either surface — same single isolated `isCloud` bypass in `useItemSearchTail`, `useAddItemToLocation` throws there so `addToLocationAction` is omitted by the wiring hook.

**Vendor detail and recipe detail complete the five surfaces (unified item search, PR C — same `useItemSearchTailWiring` hook again).**

Both take `inGroupIds` from `inScopeItems` — the page's **pre-search**, location-scoped list, which is what `inGroupIds` is defined to be (`hooks/CLAUDE.md`). On these two views sourcing it from the post-search `displayedItems` happens to be an *equivalent mutant* (the only narrowing is the same name match the tail already applies), so no test can distinguish them; the call-site comments say so explicitly rather than letting a future reader mistake the passing test for a licence.

- **`VendorDetailView`'s bucket 2 has three cases, not one** — the same three-way split the cart page settled in PR A, reproduced exactly:
  | Page | Bucket 2 | Why |
  | --- | --- | --- |
  | `?id=` resolves to a vendor | `groupAction` — `t('items.searchTail.applyVendor', { vendor })`, appending the id to `item.vendorIds` via `useUpdateItem` | the additive membership this page is about |
  | `?id=unsorted` (the "No vendor" page) | `groupNote` — `t('items.searchTail.inVendors')`, naming the vendors that already hold the item (`normal-case`, per the vendor-name display rule) | its group is "items with **no** vendor", so a press would have to **strip every vendor** — destructive, the inverse of every other bucket-2 action |
  | `?id=` set but no vendor carries it (deleted, or a hand-typed id — `validateSearch` in `routes/index.tsx` passes `id` through unchecked) | neither | the vendor's name is *in* the button label, and pressing it would append a nonexistent id. A still-loading `useVendors()` is **not** this case: the `<LoadingSpinner />` returns before any tail renders |
- **`RecipeDetailView` is the only surface whose bucket-2 action mutates the GROUP, not the item.** Recipe membership lives on `Recipe.items: RecipeItem[]` (`packages/types`), so `t('items.searchTail.addToRecipe')` appends `{ itemId, defaultAmount: item.consumeAmount || 1 }` and writes the whole array back through `useUpdateRecipe` — the same shape `settings/recipes/$id/items.tsx` uses. **`|| 1`, never `?? 1`:** an item may legitimately carry `consumeAmount: 0`, and `defaultAmount: 0` means "optional, unchecked" in cooking, so `?? 1` would add an ingredient that silently does nothing. The test that pins this uses a `consumeAmount: 0` fixture — with `consumeAmount: 1` the two operators are indistinguishable and the assertion would be vacuous. The unsorted ("Not added to recipe") and unresolved-`?id=` cases mirror the vendor table above, with `t('items.searchTail.inRecipes')` (`capitalize` — recipe names *are* subject to the title-case convention, unlike vendor names) as the note.
- **The `isUnsorted` ruling: a `groupNote`, not silence.** The design's action table never covered these pseudo-groups. Passing *neither* was the other option — and it is what PR B chose for `system` shelves and the `unsorted` pseudo-shelf, where its own review flagged it as contradicting the feature's rationale: `ItemSearchTail` hides bucket 2 entirely when given neither, so those rows **silently vanish** and the page explains nothing. PR C therefore reuses the note shape the no-vendor cart already settled on rather than replicating that wart. Closing the same gap on `ShelfDetailView`'s `system` / `unsorted` branches is explicitly **not** PR C's — it is PR B's leftover, and PR D already touches that file.
- **Neither view passes `sortTail`,** so the tail stays name-ordered while the page's own list obeys the user's sort — the identical, deliberate gap `ShelfDetailView` documents: `useItemSortData` is keyed over `allItems` (stocked-here only), so a bucket-3 row would sort against an absent map entry. Widening that sort-data source is now a three-surface debt and should be its own change.
- **Neither view has create-from-search,** so neither destructures `hasExactGlobalMatch` — the #245 fix has no purchase on a toolbar that offers no create button. Both destructure `{ tailProps }` alone.
- **The empty state is gated `!hasTail && sortedItems.length === 0`** (`sortedInShelfItems` on `ShelfDetailView`), using the `hasTail` the wiring hook returns. These views render a flat sequence of sibling `&&` expressions inside one `<div className="flex flex-col gap-px">`, not a ternary chain, so PR B's short-circuit bug shape cannot occur here — the *additive* risk does: an ungated empty state would render "No items" **beside** the tail instead of yielding to it, which is exactly what `!hasTail` prevents. All five tail surfaces now use this same **guard** (`PantryListView`, `shopping/$vendorId`, and these three), but not the same block: the two older surfaces gate on a **post**-filter count and carry a **second** message for the populated-but-nothing-matched case (*"No items match the current filters."* / `shopping.emptyFiltered.*`), while these three gate on a **pre**-search count and have only one. Giving the detail views that second branch is deferred — see the next paragraph.

  These three were briefly gated `!trimmedSearch` instead (PR B for the shelf view, PR C for the other two), which **blanked the pane entirely** when a group had no items and the query matched nothing globally: empty list, empty tail, and — because a live search made the guard false — no empty state either. Fixed in PR C's review pass; one regression test per view lives in `routes/index.test.tsx` (*"user sees the empty state, not a blank pane…"*). **Do not widen the guard to `displayedItems.length === 0`:** that would also fire for a group that HAS items whose search matches none of them, and this block's copy ("No items are assigned to this vendor") would then be a false statement. That case stays open: widening the guard is only half of it — it also needs the *second* message, which is precisely the branch `shopping/$vendorId.tsx:499` and `PantryListView.tsx:295,310` already ship. Copy one of those two arrangements rather than designing a new one; see `docs/features/items/2026-08-27-unified-item-search-plan-c.md`.

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
- Vendor and recipe dropdowns include a "Manage X" link at the bottom (always visible, with Pencil icon): "Manage vendors" (`settings.vendors.manage`) → `/settings/vendors` and "Manage recipes" (`settings.recipes.manage`) → `/settings/recipes`

### Shopping Page

Two-level route structure (mirrors `items/` pattern):
- `shopping.tsx` — thin layout, renders `<Outlet />`
- `shopping/index.tsx` — vendor cart list (root `/shopping` page)
- `shopping/$vendorId.tsx` — per-vendor cart page (`/shopping/:vendorId`)

**`'no-vendor'` sentinel:** The URL segment `no-vendor` maps to `vendorId: null` in the database. Items with no vendors assigned appear exclusively in the no-vendor cart.

**Active-location scoping (PR D):** carts are per **(location × vendor)**, keyed `${locationId}:${vendorId | 'no-vendor'}` (parsed by `parseCartId` — never by string prefix, so a vendor id containing `:` can't be mistaken for a location). Every cart hook (`useVendorCart`, `useAllActiveCarts`, `useLastPurchasedByVendor`) threads `activeLocationId` and carries it in its query key, so switching location swaps the whole set of carts. Checkout consumes from the **active location's** `ItemStock` and stamps its `locationId` on the `InventoryLog` rows it writes. The URL carries only the vendor — the location comes from the global active-location state, so a `/shopping/$vendorId` URL means a different cart under a different active location. Carts are **bootstrapped up front** by `ActiveLocationProvider` (`bootstrapCarts(locationId)`) whenever the active location changes; `getCart` is a pure read.

---

#### Root page: `/shopping` (vendor cart list)

Shows all vendors as clickable `VendorCartCard` cards. Includes a sort DropdownMenu + direction toggle in the top toolbar.

**Sort options** (persisted in `?sort` + `?dir` URL params):
- `'recent'` (default desc): sorted by most recent `completedAt` across all completed carts per vendor, via `useLastPurchasedByVendor()` — vendors with no completed carts sort to the bottom
- `'alpha'`: alphabetical by vendor name
- `'count'`: total available items descending, scoped to the active location (matches the card's displayed count — see `useVendorCartCounts()` below)

**"No vendor" card:** Shown only when at least one item has no vendors assigned **anywhere**. Always renders last within its section. Its zero is ambiguous and is split: hidden when nothing is unfiled anywhere (the bucket is genuinely empty), rendered below the divider when unfiled items exist but none are stocked in the active location.

**Groups with nothing stocked here sink below a divider (they are never hidden).** A vendor whose `useVendorCartCounts()` count is 0 — nothing stocked in the active location — still renders, but below a `ListSectionDivider` labelled `common.notStockedHere` ("N not stocked here"), together with the no-vendor bucket when that one sinks too. This is the same rule the three pantry group views apply, and it replaces the earlier "hide at zero" behaviour: a vendor that vanished gave no way to tell "empty *here*" from "gone". Interactivity is unchanged — the card still opens its cart, which is the path to adding items at this location.

The partition runs **after** the sort, as two `.filter` passes, so the chosen sort (`recent` / `alpha` / `count` × direction) is preserved *within* each section and never overridden by a stocked-ness primary key. **Cloud mode skips the partition entirely** (`!isCloud && …`): without a Location/`ItemStock` backend no cloud item carries a `stockId`, `useVendorCartCounts()` falls back to a global tally, and a "not stocked here" section would be meaningless — so every cloud vendor renders in the top section with no divider.

**Data:** `useAllActiveCarts()` + `useQueries` fan-out for per-cart item stats + `useVendorCartCounts()` (see `apps/web/src/hooks/CLAUDE.md`) + `useVendors()` + `useItems()`.

**Location-scoped vs global counts (deliberate divergence):** the `VendorCartCard`'s item count and `inactiveCount` badge come from `useVendorCartCounts()`, which scopes to items stocked in the **active location** (cloud bypasses the location gate — see the hook's doc comment). This is intentionally different from `/settings/vendors`, whose vendor item counts still use `useVendorItemCounts()` and stay **global** (location-unaware), because vendor management is location-independent. If the two pages appear to show different counts for the same vendor, that is expected, not a bug. The same divergence carries into the partition above: in cloud mode there is no location to be "not stocked in", so no vendor ever sinks and a cloud user never loses a vendor they can still shop.

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
[LocationSwitcher]  [← Go back]  [Vendor name]  [flex-1]  [N packs in cart]  [✕ Cancel]  [✓ Done]
```
- `LocationSwitcher` — leading, left of the back button (same placement as every other main page's toolbar), `lg:hidden` so the sidebar copy takes over on desktop; switching location re-reads the active-location-scoped cart via `useVendorCart`'s query key, so the page shows the target location's cart rather than stale rows
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
- **Location gate (R4):** the vendor/no-vendor filter above is then narrowed to items
  stocked in the **active location** via `isStockedHere`. `useItems()` joins every global
  item against the active location's `ItemStock`, so an item assigned to this vendor but
  not stocked here arrives as ZERO_STOCK (`targetQuantity: 0`, no `stockId`) —
  indistinguishable from a genuinely inactive item unless `stockId` is checked first. This
  keeps the page in sync with the `VendorCartCard`'s count (`useVendorCartCounts()`) and
  the pantry (`getStockedItems`), both of which already exclude not-stocked-here items.
  Cloud has no Location/`ItemStock` backend, so a cloud item never carries a `stockId`;
  cloud bypasses this gate entirely (`isCloud || isStockedHere(i)`), matching the same
  bypass in `useVendorCartCounts()` and the `/shopping` index page.
- **Active/inactive split (R4):** local mode classifies items with `isInactiveHere` (not
  a bare `isInactive`) — since `vendorScopedItems` is already stocked-here-filtered above,
  `isInactiveHere`'s `stockId` check is a no-op here, but reusing it keeps the predicate
  consistent with the card and the pantry. Cloud mode keeps the pre-existing bare
  `isInactive` split, since `isInactiveHere` would always read a cloud item as active (no
  `stockId` ever present).

**Cart:** `useVendorCart(cartVendorId)` — a pure read of the `(active location × vendor)` cart. The cart itself is pre-created by `ActiveLocationProvider`'s `bootstrapCarts`, not lazily on visit.

**`lastVisitedAt` removed:** The `updateCartLastVisited` mutation and its on-mount `useEffect` have been removed. Sort by "last purchased" uses `completedAt` from completed carts instead (no mutation needed on page visit).

**Pinned items:** Same behavior as before — quantity 0, stay in cart after checkout, move to the same vendor's new cart.

**Checkout:** `logKey` is always `'shopping.log.purchasedAt'`; `logParams` is `{ vendor: vendor?.name ?? t('shopping.noVendor') }`. After checkout → navigate to `/shopping`.

**Abandon:** After abandoning → navigate to `/shopping`.

**Search grows a two-section tail (unified item search, PR A; rewired onto `useItemSearchTailWiring` in PR B — see `hooks/CLAUDE.md`).** While `?q=` is non-empty the cart page renders `ItemSearchTail` below its own list: "N not in this list" (stocked in the active location, does not carry this vendor → `Apply {vendor}`, which appends the vendor id and drops the item into the cart's pending list) then "N not stocked here" (exists in the global catalog with no `ItemStock` here → `Add to {location}`, which stocks it via `useAddItemToLocation` and **nothing else**). The second action deliberately does not also apply the vendor: the row relocates into the section above, where the vendor is a separate press — stocking an item at a location is meant to be prudent and explicit rather than accidental. The empty state is suppressed whenever the tail has rows (`!hasTail` from the wiring hook), so a search that used to look empty now shows what actually exists. **`hasExactMatch` on the toolbar reads the GLOBAL catalog** (`useItemSearchTail`'s `hasExactGlobalMatch`, passed through by the wiring hook), not the vendor∩location-filtered visible set — that is the #245 fix: create-from-search keyed off the visible set would mint a second global `Item` for a name that already existed elsewhere, and a duplicate global `Item` follows the user to every location.

**The `no-vendor` cart renders all three sections, and its middle one is inert.** Its group is "items with no vendor at all", so a group action there would have to *strip* every vendor from the item — destructive, not additive. Section 2 therefore passes `groupNote` instead of `groupAction`: each row renders `t('items.searchTail.inVendors')` naming the vendor groups that already hold the item (`normal-case`, per the vendor-name display rule) rather than a button. Section 3 is unrestricted — `Add to {location}` is group-agnostic — and after that press the item lands in section 1 if it is vendorless or section 2 if it carries vendors, which falls out of the existing predicates with no extra branch. **The route itself decides between `groupNote` and `groupAction`** — that choice is view-specific and stays out of `useItemSearchTailWiring`: `groupNote` for the no-vendor cart, `groupAction` once `vendor` has resolved, and **neither** when `cartVendorId` is set but `vendor` has not resolved (or was deleted) — the URL points at a vendor id no longer in `useVendors()`. That last case leaves section 2 entirely absent rather than rendering a broken "Apply " button with no vendor name, and is covered by a regression test in `$vendorId.test.tsx`.

Cloud mode renders only the first section (one isolated `isCloud` bypass in `useItemSearchTail`'s location-scoping derivation; `useAddItemToLocation` throws there, so `useItemSearchTailWiring` omits `addToLocationAction` in cloud mode too — a separate, ordinary `mode === 'local'` guard, not a second copy of that bypass). The flat pantry and shelf detail gained the same tail in PR B, and vendor detail and recipe detail in PR C — all on the same wiring hook; see the Pantry Page section above. That is all five surfaces; only the filter-shelf per-axis picker (PR D) remains.

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
Row 3:            [A / T here · N empty · N low stock]
```
- **Checkbox** — tri-state (checked / indeterminate / unchecked), derived from `checkedItemIds`; clicking toggles all default items (items with `defaultAmount > 0`); if all items have `defaultAmount === 0`, falls back to toggling all items
- **Chevron** — toggles expand/collapse of the item list; purely layout, no effect on check state
- **Serving stepper** (`− N +`) — absolutely positioned to the right of the card; visible when recipe is checked; min = 1
- **Subtitle** (Row 2) — always visible; shows `N items`, `, M selected` when M > 0, and `, × S` when recipe is checked (even at S = 1)
- **Stock status** (Row 3) — always visible; the `GroupCard` row-3 idiom (muted `·` separators, `text-status-error-foreground` for empty, `text-status-warning-foreground` for low stock). Clause 1 is availability, `A / T here` (`cooking.recipe.availableHere`), where `A = availableRecipeItems.length` and `T = recipe.items.length`. Clauses 2 and 3 are health over the **available** items only — `isEmptyStock` / `isLowStock` from `quantityUtils` (shared with the pantry group cards, see `components/CLAUDE.md`) — each rendered only when its count is non-zero. Computing health over the available subset is what keeps a not-stocked-here item out of the counts: its `ZERO_STOCK` join (`targetQuantity: 0`) reads as inactive, so it is absent rather than reported as empty. The row carries `id="recipe-status-{recipe.id}"` and the row-1 checkbox references it via `aria-describedby`, so a screen reader announces *why* a disabled recipe is disabled (`0 / 2 here`) rather than just "checkbox, disabled" — the association a sighted user makes spatially. Neither axe nor Biome has a rule for this, so it must be kept wired by hand; the id must stay unique per recipe because the cards render in a list

**Expand/collapse:** Layout only — does not affect check state or amounts. Items show as unchecked when first expanded (before the recipe checkbox is clicked). Expand/collapse state is preserved when Done or Cancel is confirmed — only session interaction state (servings, amounts, checked items) is reset.

**Per-item optional ingredients:** Each item in an expanded recipe has its own checkbox. Items with `defaultAmount > 0` start checked when the recipe checkbox is first clicked; items with `defaultAmount === 0` start unchecked. Users can toggle any item. Unchecked items are excluded from consumption.

**Amount adjustment:** Each item card shows ±buttons to adjust the per-serving amount. Step size is `item.consumeAmount`, falling back to `1` when it is not `> 0` — a ± increment must be non-zero to be usable, so an unconfigured item still steps by one. (The item detail form deliberately does the opposite: there an unset consume amount yields `step="any"` and no rounding, because a free-text field can simply accept what was typed. See `items/CLAUDE.md`.) Amount can be reduced to 0.

**Consumption calculation:** `totalByItemId[itemId] = servings × sessionAmounts[recipeId][itemId]` for each checked item with amount > 0, summed across all checked recipes.

**Unavailable items (active-location scoping, PR D):** Cooking reads `useItems()` (the full catalog joined with active-location stock). A recipe item **not stocked in the active location** has `stockId === undefined` and is treated as **unavailable**: rendered greyed (`opacity-50`) with a "Not stocked in this location" note (`cooking.recipe.unavailable`), its checkbox disabled (`ItemCard disabled`), excluded from the recipe checkbox's auto-check / tri-state, and excluded from `totalByItemId` so it is never consumed. The set of available item ids is `availableItemIds`; `isItemAvailable(itemId)` gates `handleToggleItem`, `getDefaultCheckedItems`, and the toggle-all logic.

**Fully unavailable recipes are disabled.** When `availableRecipeItems.length === 0` (nothing in the recipe is stocked in the active location) the recipe `Checkbox` is `disabled` and the card is dimmed `opacity-80`, matching how `ItemCard` dims an inactive item. Before this the checkbox looked enabled but was inert — `handleToggleRecipeCheckbox` computed an empty `effectiveItemIds` set and did nothing. The chevron and the name link stay live so the user can still open the recipe and see *why* it is unavailable, and the checkbox's `aria-describedby` gives non-visual users the same reason (see Row 3 above). A recipe with no items at all falls into the same branch, which is correct: it has nothing to consume either.

**…and sink below a divider.** The recipe list is partitioned the same way the shopping vendor list is: recipes with something stocked here first, then a `ListSectionDivider` labelled `common.notStockedHere`, then the rest. Visibility/order and interactivity are **independent axes** — a sunk recipe is still `disabled`, still dimmed, and still carries its `aria-describedby` wiring; only its position changes. The partition runs after the sort as two `.filter` passes (order preserved within each section) and is skipped entirely in cloud mode, where no item carries a `stockId` and nothing can be "not stocked here".

**Cloud mode bypasses the location gate.** `ItemStock` has no GraphQL backend yet (deferred in PR D), so cloud items carry inline stock and never a `stockId`. In cloud mode `availableItemIds` is therefore built from **all** items — every recipe item stays checkable and consumable, preserving pre-split cloud behaviour. The Row 3 status line follows from the same set: a cloud recipe always reads `T / T here` and is never disabled, with health computed off the inline stock. Covered by `src/routes/cooking.cloud.test.tsx`.

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
- `src/routes/cooking.stories.tsx` — Storybook stories (Default, WithRecipes, WithCheckedRecipe, WithExpandedRecipe, WithActiveToolbar, WithSearch, SortByRecent, SortByCount, StockStatusHealthy, StockStatusPartial, StockStatusUnavailable, NotStockedHereSplit)
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
