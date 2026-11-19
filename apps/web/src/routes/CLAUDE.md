### Active-Location Scoping

One app-wide **active location** scopes every stock-bearing page. It is held by `useActiveLocation()` (provider in `__root.tsx`, persisted in localStorage under a per-mode key, `active-location-id:local` / `active-location-id:cloud`, and validated against the loaded location list (a stale id falls back to the `isDefault` location in local mode and to the first location in cloud mode)) and switched from the `LocationSwitcher`. The active id is part of the TanStack Query keys, so switching it refetches rather than reusing another location's cache.

**Where the switcher lives depends on the breakpoint.** At `lg+` it is in the desktop `Sidebar` (`variant="full"`, showing the location name); below `lg` there is no sidebar and it stays in the pantry/shopping/cooking page toolbars (`variant="compact"`, the single-letter glyph, each site passing `className="lg:hidden"`). Exactly one copy is visible at any width, and the set of pages that have a switcher is unchanged. See `components/CLAUDE.md` for the jsdom duplicate-accessible-name hazard this creates in tests.

| Page | What the active location decides |
| --- | --- |
| **Pantry** (`/`) | Which items exist at all — only those with an `ItemStock` here (`useStockedItems`), and the stock values their cards show |
| **Shopping** (`/shopping`, `/shopping/$vendorId`) | Which carts exist — carts are per `(location × vendor)`; checkout consumes this location's stock and stamps its logs |
| **Cooking** (`/cooking`) | Which recipe items are consumable — an item not stocked here is shown unavailable and never consumed |

The **item detail Stock tab** is the deliberate exception: it pages across **all** locations rather than following the active one (it opens there and keeps naming it — the caption calls it the "current location"). See `items/CLAUDE.md`. Settings pages (tags, vendors, recipes, shelves, locations) are location-independent — those entities are global, and since issue #247 part 2 their four `…/items` assignment tabs enforce it: no stock rendered (`ItemCard showStock={false}`), no active/inactive bucketing, and create-from-search creates inline via `useCreateItem({ catalogOnly: true })`, writing no `ItemStock`. No Settings tab mounts `NewItemDialog`, so none of them can stock an item here at all. See `settings/CLAUDE.md`. The desktop `Sidebar` mirrors the split spatially — the three location-aware links sit under the switcher, and the 🏠 household entry (the household settings; the household's name in cloud mode, "My data" in local mode) is pinned to the bottom.

**Cloud mode has locations (PR 2).** `Location` and `ItemStock` gained a Prisma + GraphQL backend in cloud-locations PR 1, and PR 2 moved the web client onto them: `useLocations` is dual-mode, `useItems`/`useStockedItems` read `PantryData($locationId)` and join through the same `joinItemStock` local mode calls, and `useAddItemToLocation` / `useRemoveItemFromLocation` send their cloud mutations instead of throwing. **Every `isCloud` stock bypass in the item/pantry path is deleted**, not ported — `useShowStock`, `useItemSearchTail`, `useItemSearchTailWiring` and `NewItemDialog` carry no mode branch at all any more.

**Shopping and cooking are location-scoped in cloud too (PR 3b).** They were the last `isCloud` bypasses. A cloud `Cart` now has a `locationId` column (PR 3a) and its id is `${locationId}:${vendorId | 'no-vendor'}` (PR 3b Task 1), `checkout` writes the cart's own location (Task 3), and `ConsumeRecipesInput.locationId` is `ID!` (Tasks 3 and 4). So `useVendorCartCounts()`, `isUnstockedHere` in `shopping/index.tsx`, `isRecipeUnstockedHere` and `availableItemIds` in `cooking.tsx`, and the stocked-here gate in `shopping/$vendorId.tsx` all carry **no mode branch** any more. The reason they ever did was the **cart and the consumption path**, never "cloud items have no `stockId`" — they have carried one since PR 2.

**The Info tab's unit switch works in cloud since PR 3c.** `applyUnitSwitch` is now in `itemStock.graphql`, and `buildStockConversions` no longer gates on `isLocal`. Before that the cloud schema had no such mutation, so a cloud unit switch left every location's tracked quantities in the OLD unit.

**Multi-row writes must be atomic in cloud too.** Local mode wraps them in a Dexie transaction (`consumeRecipesBatch`, `applyUnitSwitchBatch`); the cloud counterpart is a **single combined GraphQL mutation** wrapping all the affected rows in one server-side `prisma.$transaction`, not a sequence of Apollo calls. The item unit switch is the worked example — see `items/CLAUDE.md`. **`consumeRecipes` joined them in households H3b task B.6.** Until then its resolver wrote row by row with no transaction, so a cook that failed partway left some items consumed and some not. Now every stock row, log and recipe mark is written in one `prisma.$transaction`, or none is.

**Catalog-only create is live in cloud (PR 2 Task 9).** `useCreateItem({ catalogOnly: true })` is honoured in both modes: cloud creates the item and then skips the follow-up `upsertItemStock`. The four Settings
assignment tabs create items stocked in **no** location, via
`useCreateItem({ catalogOnly: true })`, and that now means the same thing on both sides.
No new GraphQL affordance was needed: the cloud branch runs `createItem` and simply omits
the follow-up `upsertItemStock` the pantry's Add flow performs. See `settings/CLAUDE.md`.

### No locations (cloud, households H5 task F.7)

**A cloud person can have no location at all** since F.7: the household's last location
can be deleted (decision H13 lifted, owner answer O8), and a member can be added with no
location role. Then Pantry (`/`), Shopping (`/shopping`), a cart (`/shopping/$vendorId`)
and Cooking (`/cooking`) show `NoLocationsEmptyState`: "You have no locations in this
household yet." / 「你在這個家庭還沒有據點。」 and **Create a location** / 「建立據點」, which
opens the same Add Location dialog as the settings page.

- **`NoLocationsGate`** (`components/location/NoLocationsGate/`) wraps each of the four
  route components (`PantryRoute`, `ShoppingIndexRoute`, `VendorCartRoute`,
  `CookingRoute`), and since the review of F.7 the item page's Stock tab (`ItemStockTab`)
  and log tab (`ItemHistoryRoute`). The page is its CHILD, so none of the page's hooks run
  while the empty screen shows. Tested in `routes/noLocations.cloud.test.tsx` (including
  that a still-loading list does not show it) and `routes/items/$id/noLocations.cloud.test.tsx`.
- **The settings Items tabs need no gate.** `useItems()` reads the catalog from `GetItems`
  when the household has no location (review of F.7), so those tabs list every item, with
  no stock.
- It shows the screen only when `mode === 'cloud'` and `useLocations().data` is a loaded,
  EMPTY array. While loading, or after a failed read with nothing cached, `data` is
  `undefined` and the page renders as before. **Known gap:** "as before" for the item Stock
  tab after a failed read means a blank tab (`stock.tsx`, `if (!viewed) return null`), with
  no error and no retry. Older than H5; recorded in the H5 plan's *Known gaps*.
- **Before F.7 these pages showed a spinner forever** with an empty list: every
  location-scoped read waits for `useCloudLocationKnown`, which never became true (Review
  Focus case 3).
- `ActiveLocationProvider` clears the stale active id when the cloud list is empty (see
  `hooks/CLAUDE.md`).
- **Losing the active location** (households H5c task H.7, owner decision O27-A). When the
  person leaves it, an owner removes their role, or it is deleted, the tab moves to their
  first other location, or to this empty screen, with no reload. One toast says "You no
  longer have access to {location}." / 「你已經沒有{location}的權限了。」. Only when this tab
  had shown that location during this page visit; never on a cold load with an old stored
  id. The leaving tab moves because `useLeaveLocation` reads `GetLocations` again; another
  tab moves on the live `LOCATION` event. See `hooks/CLAUDE.md`, `useActiveLocation()`.
- Local mode never gets here: its default location cannot be deleted.
- Tested in `routes/noLocations.cloud.test.tsx` (all four pages, the dialog, and a
  one-location control), E2E in `e2e/tests/settings/locations.spec.ts` (cloud: delete the
  last location, see the empty pantry, create one; and axe scans of the empty screen, light
  and dark, because `a11y.spec.ts` does not run in cloud).

### Read-only views by role (cloud, households H5)

Local mode has no roles, so none of this applies there. Every check reads `usePermissions()` (`src/hooks/usePermissions.ts`). It only hides what the server would refuse; the server checks every write.

**A household `member` (task F.5) may not change the catalog.** On these pages:

| Page | What a member does not get | What says why |
| --- | --- | --- |
| Pantry list, shelf view, cart page (`ItemListToolbar` search) | `Create item` from search, and Enter does not create | a line under the search row, `items.createReadOnly` ("Only a household owner or manager can create a new item."), passed as `createReadOnlyNote` |
| Pantry Add dialog (`NewItemDialog`) | the `Create "<name>"` option and button, and the package unit field | the same text, under the list of matches |
| The search tail on all five surfaces | the group action (Apply vendor, Add to recipe, Add to shelf) | `items.searchTail.catalogReadOnly` on the row ("Only an owner or manager can add it here.") |
| Cooking (`CookingControlBar` search) | `Create` from search, and Enter does not create | `cookingControlBar.createReadOnly` ("Only a household owner or manager can create a new recipe.") under the search row |
| Cooking empty state | `Create recipe` | `settings.catalogReadOnly` instead of "Create your first recipe" |

The search notes show with the same trigger as the button they replace: a search with no exact match. Picking an existing item in the Add dialog, `Add to {location}` in the tail, and cooking itself are NOT catalog writes, so a member keeps them. Marking a recipe as cooked needs only household `member` (H5 decision O10); a guard test (`routes/cooking.readOnly.test.tsx`) checks that a member who is a participant can check a recipe, change an amount and press Done.

**No note while the role is unknown.** `roleKnown` is `false` while `GetHousehold` loads and when it failed with nothing cached. The write controls stay hidden (the safe default), but none of the notes above shows: for an owner it would be untrue.

**A location `viewer` (task F.6) may not change the ACTIVE location's stock, carts or cooking.** Read through `useActiveLocationRights()` (`canEditHere`, `isViewerHere`) and `useCreateHere()`:

| Page | What a viewer does not get | What stays |
| --- | --- | --- |
| Pantry list, shelf, vendor and recipe views | the quick-update button; the Add button; the empty pantry's Create item; `Create item` from search; the search tail's `Add to {location}` | every row and its numbers; a search still lists the items stocked only at another location, in the "not stocked here" section, with no action (owner decision 2026-11-17) |
| Cart page (`/shopping/$vendorId`) | Cancel and Done; the checkboxes and amount buttons are DISABLED, not hidden, so they still show what is in the cart and how much; `Create item` and `Add to {location}` from search | the rows, the amounts, a catalog group action such as Apply vendor for a household manager, the "not stocked here" rows with no action |
| Cooking | Cancel and Done (the cook button, H5 decision O10); the recipe and item checkboxes are disabled | the list, the stock status, Create recipe for a household manager |
| Item Stock tab | see `items/CLAUDE.md` | |

The cart page, the cooking page and the empty pantry say why: `common.locationViewOnly` ("You can view this location, but not change it."). On the pantry list and shelf view the same text shows under the search row where Create would have been. The `LocationSwitcher` badge "View only" (task F.4) is on every one of these pages too.

`ActiveLocationProvider` sends `bootstrapCarts` only where the caller is `participant` or higher (Review Focus 2). A viewer still reads the carts: `vendorCart` gives a viewer an unsaved empty cart (task F.2).

The location role and the household role are two checks (Review Focus 4): a household manager who is a viewer here keeps every catalog action (Apply vendor, Add to recipe, Create recipe) and loses every stock action. Tests: `routes/locationViewer.test.tsx` (a viewer and a participant who differ only in the role at the active location, plus a household member who is a viewer).

### Pantry Page (`/`)

The pantry home page (`src/routes/index.tsx`) supports two display modes and three group-by views, all controlled by URL search params.

**Active-location scoping (PR D):** All seven pantry views read `useStockedItems()` (not `useItems()`), so the pantry shows **only items stocked in the active location** (those with an `ItemStock` row there); switching the active location via the `LocationSwitcher` re-scopes the list, and sorting/filtering operate on that scoped set. The **Add button** opens `NewItemDialog`, a combobox over the **full** catalog (`useItems()`) — selecting an existing item stocks it here via copy-on-add, creating a new one stocks it here. The pantry is now the dialog's only caller. Shopping carts and cooking are likewise active-location-scoped (see their sections).

**Groups with nothing stocked here sink below a divider (they are never hidden).** In all three group views a group whose item count is 0 — nothing stocked in the active location — still renders, but below a `ListSectionDivider` labelled `common.notStockedHere` ("N not stocked here"). It replaces an earlier "hide at zero" behaviour on the same branch: a group that vanished gave no way to tell "empty *here*" from "gone". The shopping vendor list and the cooking recipe list apply the same rule (see their sections).

The partition runs **after** the existing sort, as two `.filter` passes, so order is preserved *within* each half and never overridden by a stocked-ness primary key — the shelf `order` sort in particular.

The predicate is simply `getItemCount(…) === 0` — **no `stockId` guard and no cloud bypass belong here.** These views read `useStockedItems()`, which is location-scoped in **both** modes since PR 2 (cloud derives it from `PantryData`, filtered to the items with a row in this location), so an empty group *is* the signal. Shopping and cooking differ only in that they read `useItems()` and therefore do need an explicit `stockId` check; their `isCloud` bypasses are gone as of PR 3b. (`ShelfGroupView` partitions on `getShelfItems(id).length`, which its `getItemCount` now delegates to — a selection shelf's raw `itemIds` is location-blind and counted items stocked elsewhere.)

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
- "Manage X" button — entity-specific label ("Manage shelves" / "Manage vendors" / "Manage recipes" via `settings.{shelves,vendors,recipes}.manage`) links to `/settings/household/shelves`, `/settings/household/vendors`, or `/settings/household/recipes` depending on current group-by. Icon-only on mobile (`hidden lg:inline` for the text)

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

- **`PantryListView` renders bucket 3 only.** `inGroupIds` is the FULL stocked-here set (`items`, from `useStockedItems()`) — every item the page could possibly render — so bucket 2 ("stocked here, absent from this page's list") is empty **by construction**, and the page passes neither `groupAction` nor `groupNote`. `hasTail` therefore only ever tracks bucket 3, and the empty-state guard is `sortedItems.length === 0 && !hasTail` — a search that used to look empty when nothing matched locally now shows what exists elsewhere. **`hasExactMatch` on the toolbar reads the GLOBAL catalog** (`hasExactGlobalMatch`), same #245 fix as the cart page. **It has three empty states, all translated**: `pantry.empty.*` for a pantry with no items at all, `pantry.emptySearch.*` for a search that matched nothing, and `pantry.emptyFiltered.*` for filters that exclude every item. The first is picked by `items.length === 0`; the other two are picked by `search.trim()`, inside the second arm of the ternary chain. **A search wins over filters**, because that is what the displayed list itself does: line 131 reads `search.trim() ? searchedItems : filteredItems`, so a live search makes the list ignore every tag / vendor / recipe filter, and while a search runs the search is the only thing that can have emptied the list. The `pantry.emptyFiltered.*` keys arrived 2026-10-15 (both strings were hardcoded English before that) and `pantry.emptySearch.*` on 2026-10-18 — until then the filter wording showed in both cases, telling a user who had applied no filter to adjust filters they never set. See `src/i18n/CLAUDE.md`.
- **`ShelfDetailView` renders both sections, gated on the shelf's `type`.** `inGroupIds` is `inShelfItemIds` — the shelf's own already-location-scoped item set (unaffected by the delete of the old hand-rolled "Not in this shelf" block and its `outsideShelfSearchMatches` memo, which this tail replaces outright). Bucket 2's action depends on `shelf?.type`:
  | Shelf type | Bucket 2 | Why |
  | --- | --- | --- |
  | `selection` | `groupAction` — `t('items.searchTail.addToShelf')`, appends the item to `shelf.itemIds` | the only shelf type with a real "membership" to grant |
  | `filter` (satisfiable) | `groupAction` — `t('items.searchTail.addToShelf')`; the press always opens `ShelfFilterPicksDialog` for the user to pick per axis (one pick per tag type present in `filterConfig.tagIds`, one vendor, one recipe), even when every unmet axis offers exactly one option — that axis is pre-selected by `defaultPicksFor` so Confirm is enabled immediately, but the dialog itself is never skipped (designer ruling, 2026-08-28: it is a double-confirm step, reversing PR D's original direct-apply bypass) | PR D — a plain button press alone carries no criteria to satisfy `matchesFilterConfig`'s AND-across-axes rule (OR within a tag type, AND between types/vendors/recipes), so the picker supplies them; **nothing else about the wiring changes** |
  | `filter` (unsatisfiable) | `groupNote` — `t('items.searchTail.notMatchingShelf')`, an inert line | `isFilterConfigSatisfiable` is false: a vendor or recipe axis in `filterConfig` names only a deleted entity, so no press could ever satisfy it — a tag axis is never unsatisfiable, since `matchesFilterConfig`/`deriveFilterAxes` silently drop dangling tag ids rather than treat them as a constraint |
  | `system` / `unsorted` (pseudo-shelf) | neither | no add path ever existed for these (`handleAddToSelectionShelf` used to early-return), and inventing one is out of scope |

  Bucket 3 (`Add to {location}`) is unconditional on every shelf type — it is group-agnostic, and promotes an item straight to bucket 1 when the shelf membership it needed turns out to already exist (e.g. an item already in `shelf.itemIds` but stocked only at another location).
- **Both surfaces build their tail card via a local `renderTailItemCard`, not the page's own `vendorMap`/`recipeMap`.** Those maps are keyed only over the page's already-scoped `items`/`inShelfItems`, but bucket 3 rows are exactly the items NOT in that set — so vendor/recipe badges are filtered directly from the global `vendors`/`recipes` lists per row instead. Small lists while a search is active, so this is not a perf concern.
- Cloud renders the same three sections as local (PR 2 Task 8): `useItemSearchTail`'s one isolated `isCloud` bypass is deleted, and `useAddItemToLocation` is dual-mode, so the wiring hook builds `addToLocationAction` in both modes.

**Vendor detail and recipe detail complete the five surfaces (unified item search, PR C — same `useItemSearchTailWiring` hook again).**

Both take `inGroupIds` from `inScopeItems` — the page's **pre-search**, location-scoped list, which is what `inGroupIds` is defined to be (`hooks/CLAUDE.md`). On these two views sourcing it from the post-search `displayedItems` happens to be an *equivalent mutant* (the only narrowing is the same name match the tail already applies), so no test can distinguish them; the call-site comments say so explicitly rather than letting a future reader mistake the passing test for a licence.

- **`VendorDetailView`'s bucket 2 has three cases, not one** — the same three-way split the cart page settled in PR A, reproduced exactly:
  | Page | Bucket 2 | Why |
  | --- | --- | --- |
  | `?id=` resolves to a vendor | `groupAction` — `t('items.searchTail.applyVendor', { vendor })`, appending the id to `item.vendorIds` via `useUpdateItem` | the additive membership this page is about |
  | `?id=unsorted` (the "No vendor" page) | `groupNote` — `t('items.searchTail.inVendors')`, naming the vendors that already hold the item (`normal-case`, per the vendor-name display rule) | its group is "items with **no** vendor", so a press would have to **strip every vendor** — destructive, the inverse of every other bucket-2 action |
  | `?id=` set but no vendor carries it (deleted, or a hand-typed id — `validateSearch` in `routes/index.tsx` passes `id` through unchecked) | neither | the vendor's name is *in* the button label, and pressing it would append a nonexistent id. A still-loading `useVendors()` is **not** this case: the `<LoadingSpinner />` returns before any tail renders |
- **`RecipeDetailView` is the only surface whose bucket-2 action mutates the GROUP, not the item.** Recipe membership lives on `Recipe.items: RecipeItem[]` (`packages/types`), so `t('items.searchTail.addToRecipe')` appends `{ itemId, defaultAmount: item.consumeAmount || 1 }` and writes the whole array back through `useUpdateRecipe` — the same shape `settings/household/recipes/$id/items.tsx` uses. **`|| 1`, never `?? 1`:** an item may legitimately carry `consumeAmount: 0`, and `defaultAmount: 0` means "optional, unchecked" in cooking, so `?? 1` would add an ingredient that silently does nothing. The test that pins this uses a `consumeAmount: 0` fixture — with `consumeAmount: 1` the two operators are indistinguishable and the assertion would be vacuous. The unsorted ("Not added to recipe") and unresolved-`?id=` cases mirror the vendor table above, with `t('items.searchTail.inRecipes')` (`capitalize` — recipe names *are* subject to the title-case convention, unlike vendor names) as the note.
- **The `isUnsorted` ruling: a `groupNote`, not silence.** The design's action table never covered these pseudo-groups. Passing *neither* was the other option — and it is what PR B chose for `system` shelves and the `unsorted` pseudo-shelf, where its own review flagged it as contradicting the feature's rationale: `ItemSearchTail` hides bucket 2 entirely when given neither, so those rows **silently vanish** and the page explains nothing. PR C therefore reuses the note shape the no-vendor cart already settled on rather than replicating that wart. Closing the same gap on `ShelfDetailView`'s `system` / `unsorted` branches is explicitly **not** PR C's — it is PR B's leftover, and PR D already touches that file.
- **Neither view passes `sortTail`,** so the tail stays name-ordered while the page's own list obeys the user's sort — the identical, deliberate gap `ShelfDetailView` documents: `useItemSortData` is keyed over `allItems` (stocked-here only), so a bucket-3 row would sort against an absent map entry. Widening that sort-data source is now a three-surface debt and should be its own change.
- **Neither view has create-from-search,** so neither destructures `hasExactGlobalMatch` — the #245 fix has no purchase on a toolbar that offers no create button. Both destructure `{ tailProps }` alone.
- **The empty state is gated `!hasTail && <post-search list>.length === 0`**, using the `hasTail` the wiring hook returns. These views render a flat sequence of sibling `&&` expressions inside one `<div className="flex flex-col gap-px">`, not a ternary chain, so PR B's short-circuit bug shape cannot occur here — the *additive* risk does: an ungated empty state would render "No items" **beside** the tail instead of yielding to it, which is exactly what `!hasTail` prevents. All five tail surfaces now use this same **guard** (`PantryListView`, `shopping/$vendorId`, and these three) **and**, since issue #267, the same two-message shape: the guard reads the **post**-search list and a nested ternary picks the message off the **pre**-search list. See the next paragraph for the history.

  These three were briefly gated `!trimmedSearch` instead (PR B for the shelf view, PR C for the other two), which **blanked the pane entirely** when a group had no items and the query matched nothing globally. PR C's review pass changed the guard to the **pre**-search count, which fixed that case and left a second one: a group that HAS items, searched for a query matching none of them, still rendered a blank pane — no list, no tail, no message (issue #267, `docs/features/pantry/2026-10-13-bug-group-search-no-match-blank-pane.md`).

  **Fixed 2026-10-13. Both halves are needed, and doing only one is a trap.** Widening the guard to the post-search list alone makes the block print "No items are assigned to this vendor" while items ARE assigned and merely do not match — a false statement in place of a blank pane. So the guard moved to the post-search list AND a second message was added, the arrangement `shopping/$vendorId.tsx` already shipped: one guard, a nested ternary on the pre-search count. The new copy lives in `pantry.detail.*` (`noMatch.title` plus a per-view sentence); the three blocks' previously hardcoded English moved into the same namespace at the same time.

  **All three views pick the no-match message off `isUnsorted`, and `ShelfDetailView` reads one more condition on top. None of these branches changes the guard.** Each view renders two different pages off one id: a real group, listing the items in it, and the `unsorted` page (`id === 'unsorted'`), listing the items in **no** group.

  - **`isUnsorted` picks the wording, in all three views.** "is assigned to this vendor" / "this recipe" / "is on this shelf" is false about every row of the `unsorted` page, so each `unsorted` page has its own key. Added 2026-10-14 for the shelf view and 2026-10-15 for the other two; before those dates each branch said "this {group}" on both pages.
  - **`trimmedSearch` picks the trigger, in `ShelfDetailView` only.** Its toolbar is `hideFiltersToggle={!isUnsorted}`, so on the `unsorted` page the list is also narrowed by the tag / vendor / recipe filters, with no search running, and a message naming a search would be wrong there.

  | View | Page | Trigger | Key |
  |---|---|---|---|
  | `VendorDetailView` | a real vendor | search | `pantry.detail.noMatch.vendor` |
  | `VendorDetailView` | `unsorted` ("No vendor") | search | `pantry.detail.noMatch.vendorUnsorted` |
  | `RecipeDetailView` | a real recipe | search | `pantry.detail.noMatch.recipe` |
  | `RecipeDetailView` | `unsorted` ("Not added to recipe") | search | `pantry.detail.noMatch.recipeUnsorted` |
  | `ShelfDetailView` | a real shelf | search | `pantry.detail.noMatch.shelf` |
  | `ShelfDetailView` | `unsorted` | search | `pantry.detail.noMatch.shelfUnsorted` |
  | `ShelfDetailView` | `unsorted` | filters, no search | `pantry.detail.noMatch.shelfUnsortedFilters` |

  **Only `ShelfDetailView`'s `unsorted` page has a filter case, so it is the only view with three keys.** A real shelf has no filters toggle at all, and with no search text and `!isUnsorted` the `displayedInShelfItems` memo returns `sortedInShelfItems` unchanged, so an empty displayed list implies an empty source list, which takes the empty-group branch instead. The vendor and recipe views pass `hideFiltersToggle={true}` on **both** pages and their `displayedItems` memo returns `sortedItems` unchanged with no search text, so their filter case cannot be reached either — two keys each.

  **Ten tests in `routes/index.test.tsx` pin this** — two per view, plus the shelf filter case, plus one `unsorted` search case per view. The three older ones were renamed to *"user sees the empty-group state…"*: their fixtures build a group with NO items, where the pre-search count is already 0, so they pass against the broken guard as well as the fixed one. The other seven build a group that HAS items; each fails when its own view's guard is reverted, and the four `unsorted` ones also fail when their view's `isUnsorted` branch is dropped.

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
- Vendor and recipe dropdowns include a "Manage X" link at the bottom (always visible, with Pencil icon): "Manage vendors" (`settings.vendors.manage`) → `/settings/household/vendors` and "Manage recipes" (`settings.recipes.manage`) → `/settings/household/recipes`

### Shopping Page

Two-level route structure (mirrors `items/` pattern):
- `shopping.tsx` — thin layout, renders `<Outlet />`
- `shopping/index.tsx` — vendor cart list (root `/shopping` page)
- `shopping/$vendorId.tsx` — per-vendor cart page (`/shopping/:vendorId`)

**`'no-vendor'` sentinel:** The URL segment `no-vendor` maps to `vendorId: null` in the database. Items with no vendors assigned appear exclusively in the no-vendor cart.

**Active-location scoping (PR D, and cloud since PR 3b):** carts are per **(location × vendor)** in BOTH modes, keyed `${locationId}:${vendorId | 'no-vendor'}` (parsed by `parseCartId` — never by string prefix, so a vendor id containing `:` can't be mistaken for a location). Every cart hook (`useVendorCart`, `useAllActiveCarts`, `useLastPurchasedByVendor`) threads `activeLocationId`: local carries it in the query key, cloud sends it as a `vendorCart` variable or filters `allCarts` by the parsed id. Checkout consumes from the **cart's own** location's `ItemStock` and stamps that `locationId` on the `InventoryLog` rows it writes. The URL carries only the vendor — the location comes from the global active-location state, so a `/shopping/$vendorId` URL means a different cart under a different active location. Carts are **bootstrapped up front** by `ActiveLocationProvider` whenever the active location changes — `bootstrapCarts(locationId)` in Dexie for local, the `bootstrapCarts(locationId: ID!)` mutation for cloud (since households H5 task F.6 only where the caller is `participant` or higher); `getCart` is a pure read.

---

#### Root page: `/shopping` (vendor cart list)

Shows all vendors as clickable `VendorCartCard` cards. Includes a sort DropdownMenu + direction toggle in the top toolbar.

**Sort options** (persisted in `?sort` + `?dir` URL params):
- `'recent'` (default desc): sorted by each vendor cart's `lastPurchasedAt` (stamped on checkout), via `useLastPurchasedByVendor()` — vendors never checked out sort to the bottom (`?? 0`). **That hook is dual-mode and both branches now do the same thing.** Local mode reads Dexie's carts for the active location and keys the map by `parseCartId`'s `vendorId`. Cloud mode derives the map from the same `AllCarts` Apollo query `useAllActiveCarts()` already runs — no extra round trip, and `useCheckout()`'s `refetchQueries` already lists `AllCartsDocument`, so a cloud checkout re-sorts the list without any invalidation of its own — then drops the carts at other locations and keys by `parseCartId`'s `vendorId` too. **Cloud cart ids stopped being bare in PR 3b**; the note that used to sit here, saying `parseCartId` must not be used on them, was true before the re-key and false after it
- `'alpha'`: alphabetical by vendor name
- `'count'`: total available items descending, scoped to the active location (matches the card's displayed count — see `useVendorCartCounts()` below)

**"No vendor" card:** Shown only when at least one item has no vendors assigned **anywhere**. Always renders last within its section. Its zero is ambiguous and is split: hidden when nothing is unfiled anywhere (the bucket is genuinely empty), rendered below the divider when unfiled items exist but none are stocked in the active location.

**Groups with nothing stocked here sink below a divider (they are never hidden).** A vendor whose `useVendorCartCounts()` count is 0 — nothing stocked in the active location — still renders, but below a `ListSectionDivider` labelled `common.notStockedHere` ("N not stocked here"), together with the no-vendor bucket when that one sinks too. This is the same rule the three pantry group views apply, and it replaces the earlier "hide at zero" behaviour: a vendor that vanished gave no way to tell "empty *here*" from "gone". Interactivity is unchanged — the card still opens its cart, which is the path to adding items at this location.

The partition runs **after** the sort, as two `.filter` passes, so the chosen sort (`recent` / `alpha` / `count` × direction) is preserved *within* each section and never overridden by a stocked-ness primary key. **It runs in cloud too since PR 3b.** Cloud used to skip it (`!isCloud && …`) because `useVendorCartCounts()` kept a global tally there, a cloud `Cart` having no `locationId`; both are fixed, and the E2E case that proves it (`e2e/tests/location-not-stocked-here.spec.ts`) no longer carries a cloud `test.skip`.

**Data:** `useAllActiveCarts()` + `useQueries` fan-out for per-cart item stats + `useVendorCartCounts()` (see `apps/web/src/hooks/CLAUDE.md`) + `useVendors()` + `useItems()`.

**Location-scoped vs global counts (deliberate divergence):** the `VendorCartCard`'s item count and `inactiveCount` badge come from `useVendorCartCounts()`, which scopes to items stocked in the **active location** in both modes. This is intentionally different from `/settings/household/vendors`, whose vendor item counts still use `useVendorItemCounts()` and stay **global** (location-unaware), because vendor management is location-independent. If the two pages appear to show different counts for the same vendor, that is expected, not a bug.

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
  **Both modes since PR 3b.** Cloud used to bypass this gate because of the **cart**,
  not the item: a cloud `Cart` had no `locationId`, so this page's cart held items
  stocked in other locations and gating the list would have hidden rows the cart
  genuinely contained. PR 3a added the column and PR 3b re-keyed `Cart.id`.
- **Active/inactive split (R4):** both modes classify items with `isInactiveHere` (not
  a bare `isInactive`) — since `vendorScopedItems` is already stocked-here-filtered above,
  `isInactiveHere`'s `stockId` check is a no-op here, but reusing it keeps the predicate
  consistent with the card and the pantry. Cloud used to take the bare `isInactive` split,
  because *its* list was not stocked-here-filtered while the cart had no location.

**Cart:** `useVendorCart(cartVendorId)` — a pure read of the `(active location × vendor)` cart. The cart itself is pre-created by `ActiveLocationProvider`'s `bootstrapCarts`, not lazily on visit.

**`lastVisitedAt` removed:** The `updateCartLastVisited` mutation and its on-mount `useEffect` have been removed. Sort by "last purchased" uses `completedAt` from completed carts instead (no mutation needed on page visit).

**Pinned items:** Same behavior as before — quantity 0, stay in cart after checkout, move to the same vendor's new cart.

**Checkout:** `logKey` is always `'shopping.log.purchasedAt'`; `logParams` is `{ vendor: vendor?.name ?? t('shopping.noVendor') }`. After checkout → navigate to `/shopping`.

**Cloud checkout sends what the screen showed (households H3b task B.5).** The page sends every row of the cart being bought (`isBeingBought`), as `{ cartItemId, quantity }`, and no stock total. A cart is shared at its location, so a co-member may change it after this screen loaded; the server then refuses with `CART_CHANGED` and writes nothing. `useCheckout` reloads the cart's rows, and the page closes the dialog and shows the toast `shopping.cartChanged` ("This cart changed. Please check and try again."). Any other failure keeps the dialog open and shows `common.saveFailed` (since 2026-11-19; before, it showed nothing). Abandon, create-from-search, and checking, unchecking or changing the amount of a row show the same toast when the write fails (`docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md`). See `hooks/CLAUDE.md`, `useCheckout()`.

**Abandon:** After abandoning → navigate to `/shopping`.

**Search grows a two-section tail (unified item search, PR A; rewired onto `useItemSearchTailWiring` in PR B — see `hooks/CLAUDE.md`).** While `?q=` is non-empty the cart page renders `ItemSearchTail` below its own list: "N not in this list" (stocked in the active location, does not carry this vendor → `Apply {vendor}`, which appends the vendor id and drops the item into the cart's pending list) then "N not stocked here" (exists in the global catalog with no `ItemStock` here → `Add to {location}`, which stocks it via `useAddItemToLocation` and **nothing else**). The second action deliberately does not also apply the vendor: the row relocates into the section above, where the vendor is a separate press — stocking an item at a location is meant to be prudent and explicit rather than accidental. The empty state is suppressed whenever the tail has rows (`!hasTail` from the wiring hook), so a search that used to look empty now shows what actually exists. **`hasExactMatch` on the toolbar reads the GLOBAL catalog** (`useItemSearchTail`'s `hasExactGlobalMatch`, passed through by the wiring hook), not the vendor∩location-filtered visible set — that is the #245 fix: create-from-search keyed off the visible set would mint a second global `Item` for a name that already existed elsewhere, and a duplicate global `Item` follows the user to every location.

**The `no-vendor` cart renders all three sections, and its middle one is inert.** Its group is "items with no vendor at all", so a group action there would have to *strip* every vendor from the item — destructive, not additive. Section 2 therefore passes `groupNote` instead of `groupAction`: each row renders `t('items.searchTail.inVendors')` naming the vendor groups that already hold the item (`normal-case`, per the vendor-name display rule) rather than a button. Section 3 is unrestricted — `Add to {location}` is group-agnostic — and after that press the item lands in section 1 if it is vendorless or section 2 if it carries vendors, which falls out of the existing predicates with no extra branch. **The route itself decides between `groupNote` and `groupAction`** — that choice is view-specific and stays out of `useItemSearchTailWiring`: `groupNote` for the no-vendor cart, `groupAction` once `vendor` has resolved, and **neither** when `cartVendorId` is set but `vendor` has not resolved (or was deleted) — the URL points at a vendor id no longer in `useVendors()`. That last case leaves section 2 entirely absent rather than rendering a broken "Apply " button with no vendor name, and is covered by a regression test in `$vendorId.test.tsx`.

Cloud renders all three sections since PR 2 Task 8 — `useItemSearchTail`'s isolated `isCloud` bypass and `useItemSearchTailWiring`'s `!isCloud` term on `canAddToLocation` are both gone, and `useAddItemToLocation` sends its cloud mutation. The flat pantry and shelf detail gained the same tail in PR B, and vendor detail and recipe detail in PR C — all on the same wiring hook; see the Pantry Page section above. That is all five surfaces; PR D closed the one gap left standing (the filter-shelf `groupNote` above), so every bucket-2 row across the five surfaces is now actionable except a shelf whose `filterConfig` is outright unsatisfiable. PR D-1 (issue #269) makes the cloud half of that picker atomic; local was already atomic on ship.

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
- `+ Create` button (primary): shown when query is non-empty AND no exact recipe title match; opens `NewRecipeDialog` with the query as its initial name. After save the dialog navigates to `/settings/household/recipes/$id`
- `× clear` button (neutral-ghost, icon): shown whenever query is non-empty (always alongside Create when both conditions apply)
- Pressing Escape clears query (keeps row open); pressing Enter with no exact match opens the same dialog

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

**…and sink below a divider.** The recipe list is partitioned the same way the shopping vendor list is: recipes with something stocked here first, then a `ListSectionDivider` labelled `common.notStockedHere`, then the rest. Visibility/order and interactivity are **independent axes** — a sunk recipe is still `disabled`, still dimmed, and still carries its `aria-describedby` wiring; only its position changes. The partition runs after the sort as two `.filter` passes (order preserved within each section), in both data modes since PR 3b — see the cloud note below.

**Cloud mode runs the same location gate since PR 3b.** It used to bypass it — for the consumption path, not the items: cloud items have carried a `stockId` since PR 2, but `consumeRecipes` wrote the caller's **default** location's stock, so cooking would have consumed from a location this list was not scoped to. PR 3b Task 3 added `ConsumeRecipesInput.locationId` and Task 4 made it required and had the client send the active location, so `availableItemIds` is built from `items.filter(isStockedHere)` in both modes and a cloud recipe with nothing stocked here is disabled and sinks below the divider exactly as a local one does. Covered by `src/routes/cooking.cloud.test.tsx` and the cloud half of `e2e/tests/location-not-stocked-here.spec.ts`.

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

**Cloud cooking sends the amount used, not final numbers (households H3b task B.6).** `handleConfirmDone` sends one `{ itemId, delta, note, logKey, logParams }` per item, where `delta` is minus the amount used (the inventory log's signed change, the same in both modes). It no longer computes `packedQuantity`, `unpackedQuantity` or the log `quantity`. The cloud server reads the stock row at the cook's location, locks it (`SELECT … FOR UPDATE`), applies the shared `consumeItem` and writes the log total with `getPackedTotal`, all in one transaction. Before B.6 two people cooking the same item from the same screen sent the same final numbers, and one use was lost. Local mode computes the same numbers as before, now inside `useConsumeRecipes` from the `localStock` the page passes (see `hooks/CLAUDE.md`). Any failure shows one toast, `cooking.consumeFailed`, and the dialog stays open. Before B.6 a failure showed nothing.

**`lastCookedAt`:** When Done is confirmed, `lastCookedAt` is recorded on each Recipe that had at least one item checked. This timestamp drives the `recent` sort order.

**Files:**
- `src/routes/cooking.tsx` — main page
- `src/routes/cooking.test.tsx` — integration tests
- `src/routes/cooking.stories.tsx` — Storybook stories (Default, WithRecipes, WithCheckedRecipe, WithExpandedRecipe, WithActiveToolbar, WithSearch, SortByRecent, SortByCount, StockStatusHealthy, StockStatusPartial, StockStatusUnavailable, NotStockedHereSplit)
- `src/components/recipe/CookingControlBar/index.tsx` — second-row toolbar component

### Join Page (`/join/$token`, households H5b task G.7)

The page an invite link opens. Plan: `docs/global/permissions/2026-11-18-households-plan-h5b.md`.

| Mode, status | What shows |
|---|---|
| local | `join.needsCloud` and **Sign in to join**. It sets `data-mode` to `cloud`, never `migration-strategy` and never `migration-prompted`, then reloads. So no copy starts, and local data is not touched. The "Copy local data?" question waits on `/join/…` and `/sign-in` (`isCopyPromptPausedPath`), and **Join** adds the joined household to `migration-skip-households` (`skipCopyPromptIn`), so it is never asked there (O12-A). It still comes in any other household, for example the person's own. Until 2026-11-19 the button set `migration-prompted`, which turned the question off on the device for good (`docs/global/bugs/2026-11-19-bug-join-turns-off-copy-prompt.md`) |
| cloud, loading | the spinner |
| cloud, `VALID` | `join.title` with the household name, `join.invitedBy`, the roles (household role, then each location as stored, never `capitalize`), **Join** |
| cloud, `ALREADY_MEMBER` | the household name, `join.alreadyMember`, a link to the pantry |
| cloud, `INVALID` | `join.invalid` and a link to the pantry. No name, even if one were sent |

**Join** runs `joinHousehold`, then `skipCopyPromptIn(id)`, then `switchToHousehold(id, { to: '/' })`, which ends on
the pantry. It must NOT reload the join page: the invite is used now, so `invitePreview`
answers INVALID and the person would read "This invite is no longer valid" right after
joining. A refusal with `extensions.reason` `INVITE_INVALID` or `ALREADY_MEMBER`
(`hasGraphQLErrorReason`) shows the matching text in an `<output>` (role `status`), and
focus moves to it (the Join button it replaces held the focus). An `OfflineWriteError`
shows no second toast (`offlineWriteLink` showed one). Any other error shows the toast
`join.error` and keeps the button. Every state has an `h1`: `join.heading` ("Join a
household") where there is no household name to show.

Three things could send a new person away from the link. Each is handled:

- **The onboarding redirect.** `shouldRedirectToOnboarding` returns `false` for `/join/…`
  (decision T25). Tested as a unit and on the real page with an empty database.
- **Sign-in.** `CloudAuthGuard` sends a signed-out person to `/sign-in?redirect=<path>`,
  except on `/sign-in` itself. `/sign-in` follows `safeRedirectPath(redirect)`
  (`lib/safeRedirect.ts`) and passes the same path to Clerk's `forceRedirectUrl` AND
  `signUpForceRedirectUrl`, so a sign-up returns too (decision T24). `safeRedirectPath`
  resolves the path with `new URL` against this site and checks the RESULT, because
  `/..//evil.example` and `/%2e%2e//evil.example` pass a plain "starts with `//`" check
  and still resolve to another host.
- **Local mode**, the default for a new visitor: the row above.

`/join/…` is full-screen (`isFullscreenPage`).

**The household guard (decision T23).** `HouseholdChangeGuard` (`apollo/`) mounts in the
root in cloud mode, in the Clerk tree and the E2E tree. It acts only on a `GetHousehold`
answer from the SERVER (`networkStatus === ready`): the query is `cache-and-network`, and
the first answer may come from the cache restored from `Player1InventoryCloudCache`. When
the server answers a household id other than the one this tab saw first (or, before it has
seen one, the stored `last-household-id`), it calls `switchToHousehold` with no target:
`clearCache()` (memory and the saved copy; `LAST_USER_ID_KEY` stays), remove
`active-location-id:cloud`, store the id, reload this page. If the cache cannot be cleared
it logs and does not reload.

**What reaches it, and what does not.** It sees any change that leaves the person in
ANOTHER household: a join made in another tab, or a leave or a removal when the person has
a second household. **A leave or a removal that leaves the person in NO household does not
reach it**: `GetHousehold` then fails with `NO_HOUSEHOLD`, there is no id, and the old
household's rows stay in memory and in `Player1InventoryCloudCache`. The no-household
screen clears them (see *No household* below). The join page calls `switchToHousehold` itself.

### No household (cloud, households H5b task G.8)

**A cloud person can be in NO household** after they leave or are removed. A brand-new
person never is: their first request makes a household. The server then answers
`NO_HOUSEHOLD` (a `GraphQLError` code), and every page shows `NoHouseholdScreen`: "You are
not in any household." and three actions (owner decision O19): **Create a household**
(O16-A), **Switch to offline mode** and **Sign in to another account**.

- **`NoHouseholdGate`** (`components/household/NoHouseholdGate/`) wraps the `<Outlet />`
  inside `Layout` in `__root.tsx`. It shows the screen only when `mode === 'cloud'` and
  `useHousehold().errorCode === 'NO_HOUSEHOLD'`. **The CODE, never "the query failed"**: a
  network error or offline shows the page as before. `errorCode` is set even when the old
  household is still cached: Apollo keeps the cached answer in `data` next to the error
  (measured on 4.1.6), so `isError` is `false` then, and a gate on `isError` would never
  show the screen to a person just removed.
- **Not on `/join/…` or `/sign-in`.** A person with no household can still open an invite
  link and sign in.
- **When the screen first shows, it clears the old household's data once**, with no
  reload. `HouseholdChangeGuard` cannot do it: there is no new id. Exactly what is cleared:
  1. `forgetHousehold()` (`apollo/householdGuard.ts`): `clearCache()` empties the Apollo
     cache in memory and the saved copy in `Player1InventoryCloudCache`; it removes
     `last-household-id` and `active-location-id:cloud`. It keeps `cloud-cache-user-id`.
  2. Then `client.refetchQueries({ include: 'active' })`. **Emptying the cache does not
     change what a MOUNTED query shows**: Apollo sends it no new result. Without the
     refetch the sidebar kept the old household's name (`HouseholdLabel`) and the switcher
     its locations. A refetch first reports "loading" with no data, so those readers show
     their empty state, then fail with `NO_HOUSEHOLD` with nothing cached.
- **Once shown, the screen stays** until a household arrives. A refetch first reports
  "loading" with no error; showing the page for that moment would flash it. The id cached
  when the screen first showed (the household just lost) never counts as "arrived": a
  switch to it would load `/`, get `NO_HOUSEHOLD` and show the screen again, on every load.
- **A new account in the same tab starts again.** Sign-out goes to `/sign-in`, where the
  gate stays mounted, and the old account's `NO_HOUSEHOLD` answer stays in Apollo. When the
  Clerk user id changes to ANOTHER account (signed out, `null`, does not count; the same
  account again does not count), the gate remounts with a fresh state, shows the page, and
  refetches `GetHousehold`. Only that fresh answer can show the screen. The E2E build has no
  Clerk and one account per page load, so it skips this.
- **Create a household** sends `createHousehold(name)`. An empty field sends `name: null`
  (the server's default name); never `""`, which the server refuses as a blank name. On
  success: `switchToHousehold(id, { to: '/' })`, because the server sends the creating tab
  no live event. `ALREADY_IN_HOUSEHOLD` (another tab created or joined first) asks
  `GetHousehold` from the network and switches to that household. A refused name shows
  `settings.household.name.invalidError` in an `<output>` that is always mounted (empty when
  there is no error), and focus goes back to the name field; an `OfflineWriteError` shows no
  second toast; any other error shows `noHousehold.error` and the button stays.
- **How a person leaves the screen without creating a household** (owner decision O19,
  2026-11-18). The gate also covers `/settings`, so on a phone the screen must hold these:
  - **Switch to offline mode** sets `localStorage['data-mode'] = 'local'`
    (`DATA_MODE_STORAGE_KEY`) and reloads, like Switch with "Start Fresh" in
    `DataModeCard`. No copy (no cloud data) and no confirm (nothing is lost). The Clerk
    session stays alive. After the reload the gate is off (it returns its children when
    `mode !== 'cloud'`), so the normal local app shows. When the person switches back to
    cloud later (Settings, **Switch...**), they need no sign-in and land on this screen
    again, with Create.
  - **Sign in to another account** runs `clearCache()` first, then Clerk's `signOut()`, and
    keeps cloud mode, like Sign Out in `DataModeCard` without "switch to offline". A failed
    clear signs nothing out and shows `noHousehold.signOutError`. The button is disabled
    while it runs. `CloudAuthGuard` then loads `/sign-in`, where the gate is off. When
    another account signs in, the gate starts again and asks `GetHousehold` for that
    account (see *A new account in the same tab* above), and `ApolloWrapper` clears the
    cache again on the account change. **Not shown in the E2E build**: it calls
    `useClerk()`, and the E2E build has no `ClerkProvider`. So no E2E test can press it;
    `NoHouseholdScreen.test.tsx` carries it.
  - **No plain Sign out** on the screen (O19).
- **The person's other tabs** get the `LOCATION` event of `createHousehold`. It refetches
  every active query, the FAILED `GetHousehold` included (tested in
  `apollo/liveUpdates.test.ts`), and the gate then calls `switchToHousehold(id, { to: '/' })`.
- Tests: `components/household/NoHouseholdGate/NoHouseholdGate.test.tsx` (when it shows),
  `NoHouseholdScreen.test.tsx` (the create and the two other actions),
  `routes/noHousehold.cloud.test.tsx` (the real
  root, with real Apollo hooks). The gate has no story: it needs a router, and in Storybook
  `forgetHousehold` would clear the real cloud cache. The screen has stories.

A story that mounts a cloud page must store its household as the last one
(`cloudRoleStorySetup` does), or the guard reloads Storybook.

### Onboarding Page

Full-screen onboarding flow at `/onboarding` shown automatically to new users (empty DB).

**Empty-data redirect (in `__root.tsx`):** After all three data queries resolve (`useItems`, `useTags`, `useVendors`), if all are empty and the current path is not `/onboarding`, `__root.tsx` navigates to `/onboarding`. Guard: only fires after all queries have loaded (`data !== undefined`). E2E tests that pre-populate data set `localStorage.setItem('e2e-skip-onboarding', 'true')` via `addInitScript` to bypass this redirect.

**Fullscreen page:** `isFullscreenPage` in `src/lib/layoutRules.ts` returns true for `/onboarding` on every screen size. `Layout`, `Navigation` and `Sidebar` all call it, so the bottom nav and the sidebar are hidden on this route.

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
