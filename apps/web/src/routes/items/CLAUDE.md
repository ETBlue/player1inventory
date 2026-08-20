### Tabbed Item Form

Item detail pages use a tabbed layout. The toolbar order is **Info · Stock · Relation · Log** (4 buttons). Tags, Vendors, and Recipes are grouped under the **Relation** tab as a secondary submenu.

**1. Item Info (default tab, `/items/$id`, `Info` icon)**
- Item name + `wikidataUrl` + `note` only (`ItemForm sections={['info']}`)
- Save button (persists only name/wikidataUrl/note via `buildInfoUpdates`) — disabled when no changes made
- Hosts the **Delete** button + cascade-delete dialog
- Editable: registers dirty state via `useItemLayout()`; the toolbar dirty-guard fires when leaving it

**2. Stock (`/items/$id/stock`, `Calculator` icon)** — an all-locations pager (PR E)

The tab is split at the top by data mode (`ItemStockTab` renders `LocalStockTab` **or** `CloudStockTab`), so the cloud branch never mounts a location hook. `StockFormPanel` is the shared piece both branches render: the `ItemForm` plus the recipe-adjust dialog.

*Per-location page content (`StockFormPanel`):*
- Package unit, packed/unpacked quantity fields with Pack/Unpack buttons (`ItemForm sections={['stock']}`)
- Target quantity and refill threshold
- Consumption amount settings
- **Advanced Stock Status** subsection (always visible within Stock):
  - Measurement tracking toggle (Track in measurement switch)
  - Measurement unit and amount per package fields
  - Expiration mode select (none / specific date / days from purchase) and threshold
- Save button (persists stock fields via `buildStockUpdates`) — disabled when no changes made. Saves route to **the location whose page is on screen** (`useUpdateItem({ …, locationId })`), not necessarily the active one
- Hosts the **recipe-adjust dialog**: when `consumeAmount` or `targetUnit` changes affect a recipe's `defaultAmount`, a confirmation dialog lists adjustments before saving
- Editable: registers dirty state via `useItemLayout()`; the toolbar dirty-guard fires when leaving it

*Local mode (`LocalStockTab`):* one page per `Location` (ordered by `order`), read from `useLocations()` + `useItemStocks(itemId)`. The pager opens on the **active** location and remembers the page the user turned to (`viewedLocationId`; `null` means "follow the active location").
- **Stocked page** → `StockFormPanel` for that location's `ItemStock`, plus `RemoveFromLocationButton` (a `DeleteButton`). Its confirmation names the item and the location and lists what else goes: `Inventory logs: N · Cart entries: N`, from `useInventoryLogCountByItem(itemId, locationId)` / `useCartItemCountByItem(itemId, locationId)` — **location-scoped**, and rendered only once both counts resolve. The two count hooks live in that child component on purpose: declared in `LocalStockTab` they would each fire once against `locationId: undefined` (an item-global scan) before `useLocations()` resolves. Confirming calls `useRemoveItemFromLocation({ itemId, locationId })`; the page then becomes the not-stocked state (no navigation)
- **Not-stocked page** → `EmptyState` + an **"Add to location"** button calling `useAddItemToLocation({ itemId, locationId })` (copy-on-add). Failures are caught and reported inline (`locationPager.addFailed`, `role="alert"`) — the call runs straight off an `onClick`, so an uncaught rejection would leave nothing on screen. There is no stock form to save here, which is why the PR D implicit stock-add confirmation (`items.detail.stockAddDialog.*`) is gone: an explicit CTA replaced it and the dialog became unreachable
- **The page item is re-joined by `withLocationStock`**, which strips the active-location join off the `PantryItem` `useItem()` returned before applying the viewed row (`stripStockFields` + `joinItemStock` from `db/operations`). Spreading the viewed row straight over the joined item let the **active** location's `packageUnit`/`measurementUnit`/`amountPerPackage`/`dueDate`/`estimatedDueDays`/`expirationThreshold`/`expirationMode` show through wherever the viewed row omitted the key — and Save wrote them into the viewed location's row
- **Paging while dirty** shows the shared discard dialog (`common.unsaved*`) — the form is remounted per page (`key={locationId}`), so its edits would otherwise vanish silently. No explicit dirty reset is needed there: the remounted `ItemForm` reports `onDirtyChange(false)` on mount (its `prevIsDirtyRef` starts `null`). **Removing** a location does need one — it swaps the form for the empty state, so nothing remounts to report the dirty state back down, and the tab guard would stay armed for edits that no longer exist
- **Single location → no pager chrome at all** (no dots, no chevrons); `showPager = locations.length > 1` gates both the `LocationPager` and the `role="tabpanel"` wiring around the page

*Cloud mode (`CloudStockTab`):* cloud has no locations and no `ItemStock` (deferred in PR D) — a cloud `Item` carries its stock inline. It renders the bare form, exactly as the tab did before the pager: no dots, no chevrons, no add, no remove. Both location mutations throw in cloud mode by design (Task 1), so this branch deliberately never mounts them.

*What "Remove from location" destroys — and what it doesn't.* `removeItemFromLocation(itemId, locationId)` (`src/db/operations.ts`) deletes exactly the rows that only make sense alongside that `(item × location)` stock:
- the `ItemStock` row for the pair,
- the item's `inventoryLogs` for that location (a log with no `locationId` — imported from a pre-v15 backup — reads as the default location, matching `getItemLogs`),
- the item's `cartItems` in that location's carts, matched via `parseCartId` rather than a string prefix.

The **cart rows themselves survive** (they are shared by every item in the location), other locations' logs and cart entries are untouched, and the global **`Item` persists**. An item removed from its *last* location becomes an **orphan**: gone from the pantry (`getStockedItems` filters on `ItemStock`) but still in the catalog (`getAllItems`), so the pantry Add combobox still finds it and can re-stock it via copy-on-add. Removing an item from *everywhere* is the Info tab's **Delete** button (`deleteItem`), not this. The Stock tab is also reachable for an orphan — every page just renders the not-stocked state.

> Both the Info and Stock tabs are editable `ItemForm`s registering dirty state through `useItemLayout()`. The toolbar guard in `$id.tsx` (`isOnEditableTab`) shows the discard dialog when navigating away dirty from **either** tab. The Relation subtabs (Tags/Vendors/Recipes) and Log apply changes immediately and never go dirty.

**3. Relation (`/items/$id/relation`, `Settings2` icon)**
- A layout (`$id/relation.tsx`) that renders a secondary submenu (three `Link` icon buttons: Tags `Tags`, Vendors `Store`, Recipes `ChefHat`) under the main toolbar, plus the routed `<Outlet/>`
- The Relation toolbar button is active on any `…/relation/*` route
- `/items/$id/relation` (index) redirects to `…/relation/tags` (default subtab)

**3a. Tags (`/items/$id/relation/tags`, default subtab)**
- Tag assignment interface with uppercase text styling for tag type names
- Click badges to toggle tag assignment (selected tags show X icon)
- Visual dividers between tag type sections
- Inline tag creation via "New Tag" buttons (opens `AddNameDialog`)
- Changes apply immediately without save button

**3b. Vendors (`/items/$id/relation/vendors`)**
- Vendor assignment interface: click-to-toggle badges, immediate save
- "New Vendor" button inline with badges — opens `AddNameDialog`, creates and immediately assigns the vendor
- Changes apply immediately without save button

**3c. Recipes (`/items/$id/relation/recipes`)**
- Recipe assignment interface: click-to-toggle badges, immediate save
- Architecture: recipe-centric — `Recipe.items[]` stores the relationship; toggling updates the recipe, not the item
- "New Recipe" button inline with badges — opens `AddNameDialog`, creates recipe assigned to this item
- Changes apply immediately without save button

**4. Log (`/items/$id/log`, `History` icon)**
- History/logs tab (view-only); never has unsaved changes

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
- `src/components/item/ItemForm/ItemForm.tsx` - Shared form component used by both edit and new item routes (gates fields via its `sections` prop)
- `src/routes/items/$id.tsx` - Parent layout with the 4-button toolbar (Info · Stock · Relation · Log) and navigation guard (dual-tab dirty guard via `isOnEditableTab`)
- `src/routes/items/$id/index.tsx` - Info tab (uses ItemForm with `sections={['info']}` — name/wikidataUrl/note); hosts the Delete button. Stories at `$id/index.stories.tsx`
- `src/routes/items/$id/stock.tsx` - Stock tab: `ItemStockTab` (mode split) → `LocalStockTab` (all-locations pager) / `CloudStockTab` (single page), both rendering `StockFormPanel` (ItemForm + recipe-adjust dialog). Stories at `$id/stock.stories.tsx`, smoke tests at `$id/stock.stories.test.tsx`, integration tests at `$id/stock.test.tsx`
- `src/components/item/LocationPager/LocationPager.tsx` - the dot pager (tablist) used by the Stock tab
- `src/routes/items/$id/relation.tsx` - Relation layout: secondary submenu (Tags/Vendors/Recipes) + `<Outlet/>`. Stories at `$id/relation.stories.tsx`
- `src/routes/items/$id/relation/index.tsx` - Redirects to `…/relation/tags`
- `src/routes/items/$id/relation/tags.tsx` - Tags subtab implementation (default); tests at `relation/tags.test.tsx`
- `src/routes/items/$id/relation/vendors.tsx` - Vendors subtab implementation; tests at `relation/vendors.test.tsx`
- `src/routes/items/$id/relation/recipes.tsx` - Recipes subtab implementation; tests at `relation/recipes.test.tsx`
- `src/routes/items/$id/log.tsx` - History/logs tab (view-only); stories at `$id/log.stories.tsx`
- `src/routes/items/$id.test.tsx` - Integration tests
- `src/routes/items/new.tsx` - New item form (uses ItemForm default `sections={['info']}` — Name and Package Unit only)
- `src/hooks/useItemLayout.tsx` - Dirty state context for tab coordination

### Manual Quantity Input

Users can manually set current inventory quantities in the item detail form:
- **Packed Quantity** - Number of whole packages (always visible)
- **Unpacked Quantity** - Loose amount from opened packages (only for dual-unit items)
- **Pack button** (`Package` icon) - Converts all complete units from unpacked into packed packages. In package mode: floors unpacked count and adds to packed. In measurement mode: uses `amountPerPackage` to calculate whole packages. Disabled when there are no complete packages available in unpacked.
- **Unpack button** (`PackageOpen` icon) - Unpacks 1 package from packed to unpacked. In package mode: decrements packed by 1, increments unpacked by 1. In measurement mode: decrements packed by 1, adds `amountPerPackage` to unpacked. Disabled when `packedQuantity < 1`.

**Stock Status layout:** Each quantity row pairs with its action button inline:
- Row 1: Packed input + **Unpack** button
- Row 2: Unpacked input + **Pack** button

**+/- Button Behavior (Pantry Page):**
- Both + and - buttons always operate on unpacked quantity
- No automatic normalization/packing
- Use the **Pack** button in item detail form to manually pack complete units

**Location:** Item detail Stock tab (`/items/$id/stock`) via ItemForm component

**Behavior:**
- Pre-populates with current `item.packedQuantity` and `item.unpackedQuantity`
- Validates non-negative values
- Warns when unpacked ≥ amountPerPackage
- Saves directly to database without creating inventory log entries
- Use for initial setup, corrections, or adjustments

**Files:**
- `src/routes/items/$id/stock.tsx` - Stock tab form with quantity fields
- `src/routes/items/$id.test.tsx` - Component tests
- `src/lib/quantityUtils.ts` - packUnpacked() function
