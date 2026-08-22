### Tabbed Item Form

Item detail pages use a tabbed layout. The toolbar order is **Info · Stock · Relation · Log** (4 buttons). Tags, Vendors, and Recipes are grouped under the **Relation** tab as a secondary submenu.

**The Info/Stock line is "global vs per-location", not "identity vs stock".** Since the v16 schema bump (see `src/db/CLAUDE.md`) the eight stock **configuration** fields are properties of the `Item`, so they are edited on Info and apply to every location at once. Stock holds only what genuinely varies by location.

**1. Item Info (default tab, `/items/$id`, `Info` icon)** — everything global about the item

- Identity: name + `wikidataUrl` + `note`
- **Stock Settings** (global): Package Unit, Amount per Consume
- **Advanced Stock Settings** (global): Track-in-measurement switch, Measurement Unit, Amount per Package, Calculate-Expiration-based-on, "Expires in (days)", "Warning in (days)"
- All of it is one `ItemForm sections={['info']}`; Save persists identity **and** configuration via `buildInfoUpdates`, which routes to the `Item` — disabled when no changes made
- Hosts the **unit-switch dialog** (see below) and the **Delete** button + cascade-delete dialog
- Editable: registers dirty state via `useItemLayout()`; the toolbar dirty-guard fires when leaving it

*Conditional display is unchanged by the move:* measurement unit and amount-per-package are disabled unless tracking by measurement; "Expires in (days)" only in `days from purchase` mode; "Warning in (days)" whenever expiration is not disabled.

*The unit-switch rescale.* Toggling "Track in measurement" rescales every value held in that unit: `consumeAmount` (global, on this tab, converted in form state and saved with it), each recipe's `defaultAmount`, and — since the designer's 2026-08-22 ruling — the three per-location quantities held in the tracking unit, in **every** location. See "The unit-switch dialog" below. The rescale the `ItemForm` does in its own form state is separate and still only cosmetic here: the stock fields are not rendered or submitted by this tab, so the persisted per-location conversion is computed from each `ItemStock` row's own stored values, never from the form (the form only ever holds the *active* location's numbers). The form-state conversion code stays in `ItemForm` because the component still supports rendering both sections (`ItemForm.test.tsx` covers it there).

### The unit-switch dialog lives on Info

One confirmation covers everything a save on this tab would rewrite outside the item itself. It opens whenever either half has something to change, and nothing is written until it is confirmed — cancelling leaves every row and every recipe exactly as it was.

**Recipe amounts.** A `RecipeItem.defaultAmount` is stored in the item's own unit and snapped to its consume amount, so changing either invalidates it. When `consumeAmount` or `targetUnit` changes on save, the dialog lists every affected recipe before rewriting its `defaultAmount` (`calcNewDefault` / `calcRecipeDefaultAfterUnitSwitch` in `$id/index.tsx`).

**Per-location quantities (designer ruling, 2026-08-22).** `unpackedQuantity`, `targetQuantity` and `refillThreshold` are stored in whichever unit the item is tracked in, so a `targetUnit` switch invalidates them too — in **every** location, not just the active one. `convertTrackedQuantities` (`lib/quantityUtils.ts`) multiplies by `amountPerPackage` going package → measurement and divides going the other way; the route builds one entry per stocked location from that row's own stored values (`buildStockConversions`), and the dialog previews them **one row per location** — `Location | Unpacked | Target Quantity | Refill When Below`, each cell `before → after`.

- **`packedQuantity` is never converted.** It counts sealed packages, which are packages in either mode. The designer named exactly three fields; the omission is deliberate.
- **No rounding to integers, no `roundToStep`.** 500 g at 1000 g per package becomes 0.5 packages, not 1 — rounding would invent or destroy inventory. The helper only strips IEEE-754 dust (12 significant figures) so a package → measurement → package round trip returns the original values exactly. This deliberately differs from `ItemForm`'s 3-decimal in-form rounding, which is not persisted from this tab.
- **It is well defined only since v16.** `amountPerPackage` is global now, so one factor applies to every location. While it was per-location there was no single correct factor — which is why PR #248 shipped the switch without this and the ruling followed.
- **A row that would not move is skipped** (all-zero quantities, or a 1:1 package size), and the whole conversion bails when `amountPerPackage` is missing / zero / negative — the same bail as the recipe branch.
- **Local mode only.** Cloud has no locations and no `ItemStock` (a cloud `Item` carries its stock inline), so no conversion is built there.

**Confirming is one atomic write.** All three groups — the `Item`'s configuration, every location's converted quantities, every affected recipe's `defaultAmount` — go through `useApplyUnitSwitch()` → `applyUnitSwitchBatch` (`db/operations.ts`), a single Dexie transaction over `items` + `itemStocks` + `recipes`. It replaced 1 + N + M independent writes, each its own transaction: a failure partway left the item on the **new** unit while some locations and recipes still held **old**-unit numbers, silently and with nothing surfaced. The route resolves the replacement recipe item arrays *before* calling the mutation — the transaction may not await anything of its own (see `db/CLAUDE.md`, "Transactional batches").

**Cloud keeps the sequential path** (`persistInfo` then one `updateRecipe` per recipe): Apollo has no client-side transaction, so wrapping it would fake an atomicity that does not exist, and with no locations there are no stock conversions to lose. When cloud gains locations this must become **one combined GraphQL mutation** wrapping the item update, the per-location conversions and the recipe rewrites in a single server-side transaction.

The dialog used to hang off the **Stock** tab, where saving *one location's* `consumeAmount` rewrote `defaultAmount` on *every* recipe using the item — change a step size at the cabin, every recipe rescales. That was a defect of the trigger, not of the dialog: with both fields global the operation is coherent global → global, so the field move rehabilitated it rather than removing it. A per-location quantity edit on the Stock tab now offers nothing (pinned by a test in `$id/stock.test.tsx`).

**2. Stock (`/items/$id/stock`, `Calculator` icon)** — an all-locations pager (PR E)

The tab is split at the top by data mode (`ItemStockTab` renders `LocalStockTab` **or** `CloudStockTab`), so the cloud branch never mounts a location hook. `StockFormPanel` is the shared piece both branches render: the `sections={['stock']}` `ItemForm` and nothing else.

*Per-location page content (`StockFormPanel`) — the five state fields only:*
- Packed / unpacked quantity, with Pack/Unpack buttons (`ItemForm sections={['stock']}`)
- Target quantity and refill threshold
- **"Expires on"** — this location's own due date, shown only when the item's (global) expiration mode is `date`
- The quantity labels still show the item's units (`(bottle)`, `(ml)`): they read the **global** configuration, which is why every location page labels them identically even for a row that carries nothing but numbers
- Save button (persists the five via `buildStockUpdates`) — disabled when no changes made. Saves route to **the location whose page is on screen** (`useUpdateItem({ …, locationId })`), not necessarily the active one
- No global settings and no unit-switch dialog — both moved to Info
- Editable: registers dirty state via `useItemLayout()`; the toolbar dirty-guard fires when leaving it

*Local mode (`LocalStockTab`):* one page per `Location` (ordered by `order`), read from `useLocations()` + `useItemStocks(itemId)`. The pager opens on the **active** location and remembers the page the user turned to (`viewedLocationId`; `null` means "follow the active location").
- **Stocked page** → `StockFormPanel` for that location's `ItemStock`, plus `RemoveFromLocationButton` (a `DeleteButton`). Its confirmation names the item and the location and lists what else goes: `Inventory logs: N · Cart entries: N`, from `useInventoryLogCountByItem(itemId, locationId)` / `useCartItemCountByItem(itemId, locationId)` — **location-scoped**, and rendered only once both counts resolve. The two count hooks live in that child component on purpose: declared in `LocalStockTab` they would each fire once against `locationId: undefined` (an item-global scan) before `useLocations()` resolves. Confirming calls `useRemoveItemFromLocation({ itemId, locationId })`; the page then becomes the not-stocked state (no navigation)
- **Not-stocked page** → `EmptyState` + an **"Add to location"** button calling `useAddItemToLocation({ itemId, locationId })` (copy-on-add). Failures are caught and reported inline (`locationPager.addFailed`, `role="alert"`) — the call runs straight off an `onClick`, so an uncaught rejection would leave nothing on screen. There is no stock form to save here, which is why the PR D implicit stock-add confirmation (`items.detail.stockAddDialog.*`) is gone: an explicit CTA replaced it and the dialog became unreachable
- **The page item is re-joined by `withLocationStock`**, which strips the active-location join off the `PantryItem` `useItem()` returned before applying the viewed row (`stripStockFields` + `joinItemStock` from `db/operations`). Spreading the viewed row straight over the joined item let the **active** location's values show through wherever the viewed row omitted the key — and Save wrote them into the viewed location's row. Since v16 only `dueDate` is still exposed to that trap (the unit/expiration-config keys are global and are *meant* to survive the strip), but the strip is still required: a location's expiry date must not leak onto another location's page
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

When toggling between package/measurement modes, these values convert (using `amountPerPackage`, e.g. 500 g per pack):
- Amount per consume — **global, on Info, and persisted** by the toggle
- Unpacked quantity, target quantity, refill threshold — per-location. The `ItemForm` converts them in form state (3-decimal rounding, unused by the Info tab, which renders and submits neither). What is persisted is computed separately by `$id/index.tsx` from **every** `ItemStock` row's own values and confirmed in the unit-switch dialog first — see "The unit-switch dialog lives on Info" above
- Packed quantity — **never converted**: a sealed package is a package in either mode

The switch is a global setting: it lives on Info with `targetUnit`. Covered by `ItemForm.test.tsx`, which renders both sections at once — no route does.

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
- `src/components/item/ItemForm/ItemForm.tsx` - Shared form component (gates fields via its `sections` prop: `'info'` = identity + the global stock settings, `'stock'` = the per-location numbers). It always holds every value — the stock section's labels read the global units — but each section renders only its own half
- `src/routes/items/$id.tsx` - Parent layout with the 4-button toolbar (Info · Stock · Relation · Log) and navigation guard (dual-tab dirty guard via `isOnEditableTab`)
- `src/routes/items/$id/index.tsx` - Info tab (`ItemForm sections={['info']}` — identity + the eight global stock settings, persisted by `buildInfoUpdates`); hosts the unit-switch dialog (recipe `defaultAmount`s + every location's tracked quantities) and the Delete button. Stories at `$id/index.stories.tsx` (`StockedInThreeLocations` seeds the multi-location conversion)
- `src/routes/items/$id/stock.tsx` - Stock tab: `ItemStockTab` (mode split) → `LocalStockTab` (all-locations pager) / `CloudStockTab` (single page), both rendering `StockFormPanel` (the `sections={['stock']}` ItemForm; `buildStockUpdates` writes the five per-location fields only). Stories at `$id/stock.stories.tsx`, smoke tests at `$id/stock.stories.test.tsx`, integration tests at `$id/stock.test.tsx`
- `src/components/item/LocationPager/LocationPager.tsx` - the dot pager (tablist) used by the Stock tab
- `src/routes/items/$id/relation.tsx` - Relation layout: secondary submenu (Tags/Vendors/Recipes) + `<Outlet/>`. Stories at `$id/relation.stories.tsx`
- `src/routes/items/$id/relation/index.tsx` - Redirects to `…/relation/tags`
- `src/routes/items/$id/relation/tags.tsx` - Tags subtab implementation (default); tests at `relation/tags.test.tsx`
- `src/routes/items/$id/relation/vendors.tsx` - Vendors subtab implementation; tests at `relation/vendors.test.tsx`
- `src/routes/items/$id/relation/recipes.tsx` - Recipes subtab implementation; tests at `relation/recipes.test.tsx`
- `src/routes/items/$id/log.tsx` - History/logs tab (view-only); stories at `$id/log.stories.tsx`
- `src/routes/items/$id.test.tsx` - Integration tests
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

**Location:** Item detail Stock tab (`/items/$id/stock`) via ItemForm. The units these quantities are counted in are global settings on the Info tab component

**Behavior:**
- Pre-populates with current `item.packedQuantity` and `item.unpackedQuantity`
- Validates non-negative values
- Warns when unpacked ≥ amountPerPackage
- Saves directly to database without creating inventory log entries
- Use for initial setup, corrections, or adjustments

**Files:**
- `src/routes/items/$id/stock.tsx` - Stock tab form with quantity fields
- `src/routes/items/$id.test.tsx` - Component tests
- `src/lib/quantityUtils.ts` - packUnpacked() and `convertTrackedQuantities()` (the unit-switch conversion of the three tracked quantities)
