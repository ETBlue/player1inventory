### Tabbed Item Form

Item detail pages use a tabbed layout with two rows (since 2026-11-24, design
`docs/features/items/2026-11-24-item-tabs-flat-design.md`, part B; brainstorming beside it):

- **Row 1** is the top bar: back, the item name and, on Info and Stock, **Save**.
- **Row 2** is one flat tab row, **Info · Stock · Tags · Vendors · Recipes · Log**: a
  `<nav aria-label="Item sections">` (`items.detail.tabsLabel`) passed to `LayoutInnerPages`'s
  `tabs` prop. Below `sm` each tab shows its icon only; from `sm` up, icon and text. The name is
  a `sr-only sm:not-sr-only` span, so it is each link's accessible name at every width (the old
  icon-only toolbar used `aria-label`s such as "Item info tab"; those are gone). TanStack
  Router marks the open tab with `aria-current="page"`; Info uses `activeOptions.exact`.
- **Save is in row 1** (owner decision 2026-11-25, brainstorming Q4; until then it was the
  full-width button at the bottom of each `ItemForm`). `$id.tsx` passes an empty
  `<div ref={setSaveSlot} className="contents" />` as `toolbarEnd`; `useItemLayout()` shares
  the element as `saveSlot`; the Info and Stock tabs pass it to `ItemForm` as `submitSlot`.
  `ItemForm` renders its Save there with `createPortal`, as
  `<button type="submit" form={formId}>` (`formId` from `useId()`). So the button is OUTSIDE
  the `<form>` in the DOM, and the HTML `form` attribute is what makes a click, and Enter in a
  field, submit it. Disabled state, the spinner (`isPending`), validation, the toast, the
  unsaved-changes dialog and the unit-switch dialog are unchanged. A read-only form (`readOnly`)
  renders no Save, in the slot or in the form. While the slot is `null` (the first render,
  before the top bar's ref is set) there is no Save. Tags, Vendors, Recipes and Log render
  nothing into the slot, and `contents` keeps an empty slot from adding a flex gap. On a
  phone row 1 is back, the truncated name and "Save" with its text label (default `h-8`
  size, the same height as the back button). Tests: `$id/saveTopBar.test.tsx`;
  `ItemForm.test.tsx` (`submitSlot`); Enter is checked only by E2E
  (`item-management.spec.ts`), because user-event looks for the submit button inside the
  form only.

Until 2026-11-24 the toolbar was **Info · Stock · Relation · Log**, and Tags, Vendors and
Recipes sat under **Relation** as a submenu (`/items/$id/relation/…`). That level is gone. The
old addresses still work: `$id/relation/index.tsx` (`/items/$id/relation`) and `$id/relation/$.tsx`
(`/items/$id/relation/{tags,vendors,recipes}`, and anything else under it) redirect to the new
tab. TanStack Router replaces the history entry on every redirect, so Back does not land on
the old address (the routes also pass `replace: true`, which changes nothing today).
Tests: `routes/items/$id.tabs.test.tsx`.

**The Info/Stock line is "global vs per-location", not "identity vs stock".** Since the v16 schema bump (see `src/db/CLAUDE.md`) the eight stock **configuration** fields are properties of the `Item`, so they are edited on Info and apply to every location at once. Stock holds only what genuinely varies by location.

**1. Item Info (default tab, `/items/$id`, `Info` icon)** — everything global about the item

- Identity: name + `wikidataUrl` + `note`
  - **`wikidataUrl` and `note` work in cloud mode since 2026-10-08** (cloud-parity PR B, issue
    #335) — saving **and** clearing. Before that date a cloud save of either one failed: the
    cloud GraphQL `Item` type declared neither field, so the client sent a key the schema did
    not know and GraphQL rejected the whole mutation. Both are now **nullable `TEXT` columns on
    the cloud `Item`** (`note String?`, `wikidataUrl String?` in `schema.prisma`; migration
    `20261008000000_add_item_note_and_wikidata_url`), and both are on the GraphQL `Item`,
    `CreateItemInput`, `UpdateItemInput` and `ItemInput`.
  - **Clearing is a separate path from filling, and it was separately broken.** It needs a
    `?? null` guard in `toUpdateItemInput` (`hooks/useItems.ts`), exactly like the six other
    clearable Info-tab fields: `buildInfoUpdates` sets the key to `undefined` when the user
    empties the input, and Apollo's `JSON.stringify` drops an undefined-valued key, so without
    the guard the server reads the field as absent and keeps the old text. Fixed the same day —
    see `docs/features/items/2026-10-08-bug-cloud-note-cannot-be-cleared.md`. A test that fills
    a field and reads it back cannot catch this; only a test that empties one can.
  - **Both store `NULL` for "no value", never `''`.** `''` would mean "the user typed something
    and then cleared it", which is a different fact. `createItem` on the server maps an absent
    or null input to `undefined`, which Prisma writes as `NULL`; `buildItemUpdateData` passes
    the value through raw so an explicit `null` clears the column. That matches local mode,
    which stores "no note" by leaving the optional field off the Dexie row.
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
- **Both modes since PR 3c.** `buildStockConversions` used to gate on `isLocal`, because cloud had no mutation to apply a conversion with. It no longer does: the dialog lists the same per-location rows in cloud, built from the `itemStocksForItem` rows.

**Confirming is one atomic write.** All three groups — the `Item`'s configuration, every location's converted quantities, every affected recipe's `defaultAmount` — go through `useApplyUnitSwitch()` → `applyUnitSwitchBatch` (`db/operations.ts`), a single Dexie transaction over `items` + `itemStocks` + `recipes`. It replaced 1 + N + M independent writes, each its own transaction: a failure partway left the item on the **new** unit while some locations and recipes still held **old**-unit numbers, silently and with nothing surfaced. The route resolves the replacement recipe item arrays *before* calling the mutation — the transaction may not await anything of its own (see `db/CLAUDE.md`, "Transactional batches").

**Cloud is one transaction too, since PR 3c.** `useApplyUnitSwitch` is dual-mode: cloud sends ONE `applyUnitSwitch` mutation (`itemStock.graphql`), and the resolver (`itemStock.resolver.ts`) runs the item update, every location's conversion and every recipe rewrite inside one `prisma.$transaction`. It has to be one mutation — Apollo has no client-side transaction, so three round trips could fail partway and leave mixed units.

Two rules that only cloud has:

- **Every location is authorized before anything is written.** `stockConversions` names several locations. If the caller lacks `member` on any one of them, the whole mutation fails with `FORBIDDEN` and nothing changes. Converting only the ones the caller may write would leave the item in mixed units — the same corruption, just authorized. The checks run before the transaction opens.
- **There is no `Item` mirror any more.** Between PR 3c and PR 5 this path also copied the default location's converted numbers onto `Item`'s five legacy state columns, inside the same transaction, so a browser on a stale bundle kept reading sensible numbers from columns that have no location concept. **Cloud locations PR 5 dropped those columns and the mirror with them**, and `writeStock` (`apps/server/src/lib/itemStockWrite.ts`) now does the one write, taking `applyUnitSwitch`'s `tx` so it stays inside the transaction. The hazard that replaces the old one: **omitting that `tx` compiles, type-checks, and is silently wrong** — the write would run on the module-level `prisma` and survive a rollback, leaving two locations in different units. Only the comments in `itemStockWrite.ts`'s header and at the call site prevent it.

Until PR 3c this path did not exist: `useApplyUnitSwitch` threw in cloud, and `buildStockConversions` gated on `isLocal`, so a cloud unit switch left every location's tracked quantities in the OLD unit.

The dialog used to hang off the **Stock** tab, where saving *one location's* `consumeAmount` rewrote `defaultAmount` on *every* recipe using the item — change a step size at the cabin, every recipe rescales. That was a defect of the trigger, not of the dialog: with both fields global the operation is coherent global → global, so the field move rehabilitated it rather than removing it. A per-location quantity edit on the Stock tab now offers nothing (pinned by a test in `$id/stock.test.tsx`).

**2. Stock (`/items/$id/stock`, `Calculator` icon)** — an all-locations pager (PR E)

**No mode split since PR 2.** `ItemStockTab` renders a single `StockTab` in both modes: `useLocations`, `useItemStocks` and both location mutations are dual-mode, and cloud's `ItemStocksForItem` answers "which locations is this item stocked in" exactly as the Dexie read does. `CloudStockTab` — a placeholder that rendered the bare form because those hooks were local-only and two of them threw — is deleted. `StockFormPanel` is the per-page piece: the `sections={['stock']}` `ItemForm` and nothing else.

*Per-location page content (`StockFormPanel`) — the five state fields only, each on its own row.*

**Row order (designer ruling, 2026-09-22) — a SHARED convention with `QuickUpdateDialog`, not a Stock-tab one.** Top to bottom: **Packed → Unpacked → Expires on (date mode only) → `StockProgressRow` → Active here → Target Quantity → Refill When Below**. The pantry quick update dialog uses the same order (its two settings are labelled "Target" / "Refill below" — see `components/CLAUDE.md`). **Active here** (since 2026-11-27) is the first stock setting on both surfaces: directly below the progress row and above the target. `QuickUpdateDialog.test.tsx` pins its place in the dialog (*the switch between the progress bar and the target*). Change one surface and you must change the other. The reasoning, and the earlier "progress row leads both surfaces" decision this reverses, are in `docs/features/pantry/2026-08-27-brainstorming-quick-update-stock-settings.md`, addendum 2026-09-22: Packed and Unpacked are the fields edited most often so they lead; "Expires on" is per-location state updated at the same time; Target and Refill configure the bar, so they follow it. Pinned by two tests in `ItemForm.test.tsx` — a date-mode fixture for all six rows and a non-date-mode fixture for the five that remain without "Expires on".

- **Packed**, then **Unpacked** — each a `QuantityStepper` (`[−] <Input/> [+]`, shared with `QuickUpdateDialog` — see `components/CLAUDE.md`), not a plain number input, and each carrying its Pack/Unpack button in a `grid grid-cols-[auto_8rem]` row (`ItemForm sections={['stock']}`)
- **"Expires on"** — this location's own due date, shown only when the item's (global) expiration mode is `date`, directly under Unpacked and above the progress row. `QuickUpdateDialog` renders the identical field in the same position under the same gate — the pantry-page mirror of this row, added 2026-08-27, repositioned 2026-09-22
  - Two stories show it: `ItemForm.stories.tsx` → `StockSectionDateMode` at the component level, and `$id/stock.stories.tsx` → `DateModeItem` at the route level (so the row appears in its real position). Both need **two** fields set, on two different tables — `expirationMode: 'date'` on the `Item` and a `dueDate` on the `ItemStock`. Setting only one leaves the row hidden or empty
  - **The `dueDate` key is OMITTED from the save payload entirely whenever that gate is closed** — not sent as `undefined`. `buildStockUpdates` uses a conditional spread, the same convention `QuickUpdateDialog` follows (the rule is stated in full in `components/CLAUDE.md`): both persistence paths read a key's *absence* as "leave it alone" and its *presence* — even as `undefined` — as "clear it", so emitting it unconditionally silently wiped this location's stored date every time a quantity was saved on an item in `'days from purchase'` or `'disabled'` mode. A form must not clear a field it never showed the user. When the field IS rendered and the user empties it, the key is still emitted as `undefined` and the date is still cleared — that case is intended. Fixed 2026-08-29, issue #261 — see `docs/features/items/2026-08-29-bug-stock-tab-clears-duedate.md`
- A **`StockProgressRow`** (Clear · `x / y` label · `ItemProgressBar`, or `ItemCountBar` for a non-consumable item since 2026-11-26 · Fill to Full; its unit word is the package unit or `pack`, the same as the card, since 2026-11-26 — it said `unit` before), previewing live off the form's own in-progress state — not the saved values — via the shared `getStockPreview` (`lib/quantityUtils.ts`, also called by `QuickUpdateDialog`). Raising Refill above the current total flips the status before Save is pressed; Fill to Full targets whatever Target currently reads, not the last-saved one. Clear/Fill mark the form dirty like any other field edit. The bar also draws the **refill tick** from the live Refill When Below value (since 2026-09-23), so the tick moves as the user steps Refill, before Save. See `ItemProgressBar` in `components/CLAUDE.md`
- **Active here** — a `Switch` (`id="isActive"`) with its `Label` and the hint `items.form.isActive.hint` (named in `aria-describedby`), the same pattern as the Consumable switch on the Info tab. It shows this location's `ItemStock.isActive`, read through `isStockActive` (a row with no stored value: target 0 = off). Off makes the item inactive at this location, and the bar turns grey (`inactive`) before Save, because `getStockPreview` reads the form's live `isActive` (owner answer Q4: an active item with target 0 keeps its colour and reads `3 / 0 pack`). **Target and Refill stay editable while it is off and keep their values** (owner answer 2). It is part of the dirty check, so a save that only flips the switch is enabled and writes it; `buildStockUpdates` always sends `isActive`. A location `viewer` sees it disabled (`readOnly`). Local mode writes no `stockCount` log row for a switch-only save; cloud's `upsertItemStock` publishes `STOCK` only. Design: `docs/features/items/2026-11-26-item-stock-active-design.md`, *The switch*. Tests: *the Active here switch* in `$id/stock.test.tsx` (local, a second location, and cloud with the `upsertItemStock` variables), and `stock.roles.test.tsx`. Story: `InactiveWithTarget`
- **The Info tab does not show or save the switch.** `routes/items/$id/index.tsx`'s `itemToFormValues` sets `isActive` from the active location only so the form value equals the stored row and never counts as a change. `buildInfoUpdates` sends no stock field, and the unit switch's `stockConversions` carry only target, refill and the unpacked amount (`TrackedQuantities`), so a unit switch keeps every location's switch as it was. There is no pager on the Info tab
- **Target Quantity**, then **Refill When Below** — steppers too, with no action button and no grid. Every stepper clamps at 0 and disables `−` there; Packed always steps by 1, the other three step by `consumeAmount` (falling back to 1 when unset — a `+`/`−` increment must be non-zero to be usable), and Target steps by 1 instead whenever `targetUnit === 'package'`
- **Structurally the Stock tab is NOT the dialog's grid.** It is a `<div className="space-y-2">` of sibling blocks, each a `<Label>` stacked above its stepper, so the progress row is a plain sibling and needs no `col-span-3` wrapper and no `my-2`. The dialog needs both because its rows share one `grid-cols-[auto_auto_auto]` grid whose columns must line up above and below the bar. Do not copy the dialog's grid here
- The quantity labels still show the item's units (`(bottle)`, `(ml)`): they read the **global** configuration, which is why every location page labels them identically even for a row that carries nothing but numbers
- Save button in the top bar (persists the five via `buildStockUpdates`) — disabled when no changes made. Saves route to **the location whose page is on screen** (`useUpdateItem({ …, locationId })`), not necessarily the active one
- No global settings and no unit-switch dialog — both moved to Info
- Editable: registers dirty state via `useItemLayout()`; the toolbar dirty-guard fires when leaving it

*The pager (`StockTab`, both modes):* one page per `Location` (ordered by `order`), read from `useLocations()` + `useItemStocks(itemId)` — Dexie in local mode, `GetLocations` + `ItemStocksForItem` in cloud. Cloud's `ItemStocksForItem` is the **same document and variables `useItem` already issues**, so the pager shares that cache entry rather than costing a second request. The pager opens on the **active** location and remembers the page the user turned to (`viewedLocationId`; `null` means "follow the active location").
- **Stocked page** → `StockFormPanel` for that location's `ItemStock`, plus `RemoveFromLocationButton` (a `DeleteButton`). Its confirmation names the item and the location and, **in both modes since PR 3c**, lists what else goes: `Inventory logs: N · Cart entries: N`, from `useInventoryLogCountByItem(itemId, locationId)` / `useCartItemCountByItem(itemId, locationId)` — **location-scoped**, and rendered only once both counts resolve. The line was local-only before PR 3c, because cloud's `removeItemFromLocation` deleted the stock row and nothing else, so the local numbers would have named rows a cloud removal did not touch. PR 3c gave cloud the same cascade and both count hooks a cloud branch, so the number shown and the rows deleted come from the same filter. The two count hooks live in that child component on purpose: declared up in `StockTab` they would each fire once against `locationId: undefined` (an item-global scan) before `useLocations()` resolves. Confirming calls `useRemoveItemFromLocation({ itemId, locationId })`; the page then becomes the not-stocked state (no navigation)
- **Not-stocked page** → `EmptyState` + an **"Add to location"** button calling `useAddItemToLocation({ itemId, locationId })` (copy-on-add). While the add is saving, the button shows a spinner and is disabled (`Button isLoading={addItemToLocation.isPending}`), so a second click sends no second write. `isPending` stays true until the stock lists have refetched (local: `onSuccess` returns the invalidations; cloud: `refetchAfterWrite`), so the stock form replaces the button. Failures are caught and reported inline (`locationPager.addFailed`, `role="alert"`) — the call runs straight off an `onClick`, so an uncaught rejection would leave nothing on screen. There is no stock form to save here, which is why the PR D implicit stock-add confirmation (`items.detail.stockAddDialog.*`) is gone: an explicit CTA replaced it and the dialog became unreachable
- **The page item is re-joined by `withLocationStock`**, which strips the active-location join off the `PantryItem` `useItem()` returned before applying the viewed row (`stripStockFields` + `joinItemStock` from `db/operations`). Spreading the viewed row straight over the joined item let the **active** location's values show through wherever the viewed row omitted the key — and Save wrote them into the viewed location's row. Since v16 only `dueDate` is still exposed to that trap (the unit/expiration-config keys are global and are *meant* to survive the strip), but the strip is still required: a location's expiry date must not leak onto another location's page. **`withLocationStock` and its `stripStockFields` call survived cloud locations PR 5 and must not be read as dead.** PR 5 dropped the five state columns from the cloud `Item`, which made three *other* `stripStockFields` call sites dead — but this one never had anything to do with them. It operates on an already-joined `PantryItem`, and `useItem` joins in **both** modes, so the fields it strips come from `ItemStock` and exist in local mode too
- **Paging while dirty** shows the shared unsaved-changes dialog (`UnsavedChangesDialog`, Cancel · Discard · Save; see *The unsaved-changes dialog* below) — the form is remounted per page (`key={locationId}`), so its edits would otherwise vanish silently. No explicit dirty reset is needed there: the remounted `ItemForm` reports `onDirtyChange(false)` on mount (its `prevIsDirtyRef` starts `null`). **Removing** a location does need one — it swaps the form for the empty state, so nothing remounts to report the dirty state back down, and the tab guard would stay armed for edits that no longer exist
- **Single location → no pager chrome at all** (no dots, no chevrons); `showPager = locations.length > 1` gates both the `LocationPager` and the `role="tabpanel"` wiring around the page

*What Save writes in cloud:* `useUpdateItem({ id, updates, locationId })` splits the payload the way local mode does — configuration to `updateItem`, the five state fields to `upsertItemStock(itemId, locationId)`, **the location whose page is on screen**. The five fields are stripped from `updateItem` rather than sent to both — `toConfigInput` does it — and **since cloud locations PR 5 that strip is required for a new reason**. `UpdateItemInput` no longer declares the five, so sending them inline fails GraphQL validation outright and the save errors. Before PR 5 the reason was quieter and worse: `updateItem` had a server-side dual-write that targeted the caller's *default* location, so leaving them inline made a save in the Garage silently overwrite the Kitchen's row. The strip stays; only its failure mode changed, from silent corruption to a loud error.

`toConfigInput`'s strip is a **deny-list** of the five stock keys, not an allow-list of
`UpdateItemInput`'s own keys, and `wikidataUrl` and `note` are why. `ItemForm` submits both, so
an allow-list that forgot them would drop them here with no error. Since 2026-10-08 (issue
#335) they must reach the server — **do not start stripping them.**

*What "Remove from location" destroys — and what it doesn't.* `removeItemFromLocation(itemId, locationId)` (`src/db/operations.ts`) deletes exactly the rows that only make sense alongside that `(item × location)` stock:
- the `ItemStock` row for the pair,
- the item's `inventoryLogs` for that location (a log with no `locationId` — imported from a pre-v15 backup — reads as the default location, matching `getItemLogs`),
- the item's `cartItems` in that location's carts, matched via `parseCartId` rather than a string prefix.

**Cloud does the same three deletes since PR 3c**, in one `prisma.$transaction` (`apps/server/src/resolvers/itemStock.resolver.ts`). Two differences from local, both because the cloud schema is stricter: cloud's `InventoryLog.locationId` is NOT NULL since PR 3a, so there is no default-location fallback; and cart entries are found with the relation filter `cart: { locationId }` — reading `Cart.locationId`, the column PR 3a added — rather than by parsing the cart id. `cartItemCountByItem` filters the same way, so the number the dialog shows and the rows the removal deletes cannot drift apart.

**In cloud, only a location `organizer` may remove an item from a location** (households H3a, owner decision 2026-11-11), because the removal deletes the logs other members wrote. A `participant` or `viewer` gets `FORBIDDEN`. **Since households H5 task F.6 the button shows only to an organizer of the page's location** (`usePermissions().isOrganizerAt`), and `handleRemove` catches a refusal: `FORBIDDEN` shows the toast `items.detail.locationPager.removeForbidden` ("Only an organizer of {{location}} can remove {{name}} from it."), an `OfflineWriteError` shows nothing more (`offlineWriteLink` already did), anything else shows `removeFailed`. The confirmation closes and the stock stays. (Until F.6 the button showed to every role, and a refusal showed no message: `handleRemove` and `DeleteButton` did not catch it, so it was an unhandled rejection and the dialog stayed open.) Local mode has no role check.

The **cart rows themselves survive** (they are shared by every item in the location), other locations' logs and cart entries are untouched, and the global **`Item` persists**. An item removed from its *last* location becomes an **orphan**: gone from the pantry (`getStockedItems` filters on `ItemStock`) but still in the catalog (`getAllItems`), so the pantry Add combobox still finds it and can re-stock it via copy-on-add. Removing an item from *everywhere* is the Info tab's **Delete** button (`deleteItem`), not this. The Stock tab is also reachable for an orphan — every page just renders the not-stocked state.

> Both the Info and Stock tabs are editable `ItemForm`s registering dirty state through `useItemLayout()`. The tab-row guard in `$id.tsx` (`isOnEditableTab`) shows the unsaved-changes dialog when navigating away dirty from **either** tab. Tags, Vendors, Recipes and Log apply changes immediately and never go dirty.

**3. Tags (`/items/$id/tags`, `Tags` icon)**
- Tag assignment interface with uppercase text styling for tag type names
- Click badges to toggle tag assignment (selected tags show X icon)
- Visual dividers between tag type sections
- Inline tag creation via "New Tag" buttons (opens `AddNameDialog`): creates the tag and immediately assigns it to this item
- Changes apply immediately without save button

**A tag or vendor created on this page is assigned to the item, in both modes** (since 2026-03-23 for tags, `e6253d2e`; checked again for issue #402 on 2026-11-24). It is two writes: the create (`useCreateTag` / `useCreateVendor`), then `useUpdateItem` with the item's list plus the new id. Cloud has no single write for this: `createTag` and `createVendor` take no item, and adding that would be a server change. When the create succeeds and the assign fails, the dialog closes (trying again would create a second tag or vendor), the new row exists but is not on the item, and `showSaveError` shows "Could not save the change. Please try again." The user can press the new badge to assign it. Tests: local `tags.test.tsx` "… automatically assigned to the item" and `vendors.test.tsx` "user can create a new vendor from the vendors tab"; cloud `createAssign.cloud.test.tsx` (the assign is sent with the old ids kept); the failed assign in `$id/saveFailed.cloud.test.tsx` and in both local files. Removing the assign call turns all four success tests red. The settings pages' create flows assign nothing; they have no item.

**The new badge shows as selected from the moment it appears** (issue #402 part 1, fixed 2026-11-25; `docs/features/items/2026-11-25-bug-new-tag-vendor-not-selected-at-once.md`). Before, it showed as not selected for about a second in cloud: the list had the new row, the item did not have it yet. Now the tab keeps the new id in local state (`assigningTagIds` / `assigningVendorIds`) from the moment the create returns until the assign is done, and shows a badge as selected when its id is on the item OR in that state. While it waits, the badge has `aria-busy="true"` (no spinner). A failed assign removes the id, so the badge goes back to not selected, and `showSaveError` shows the toast. **While an assign is in flight, a press on any badge of the tab does nothing**: each write sends the whole `tagIds` / `vendorIds` list, so two writes at once could undo each other. Tests: the second `describe` of `createAssign.cloud.test.tsx` (they hold the assign with `holdMutation` from `test/cloudServerStub.ts`). The E2E tests in `item-management.spec.ts` wait for `aria-busy` to end, then reload, so they check the saved state and not only the screen.

**4. Vendors (`/items/$id/vendors`, `Store` icon)**
- Vendor assignment interface: click-to-toggle badges, immediate save
- "New Vendor" button inline with badges — opens `AddNameDialog`, creates and immediately assigns the vendor
- Changes apply immediately without save button

**5. Recipes (`/items/$id/recipes`, `ChefHat` icon)**
- Recipe assignment interface: click-to-toggle badges, immediate save
- Architecture: recipe-centric — `Recipe.items[]` stores the relationship; toggling updates the recipe, not the item
- "New Recipe" button inline with badges — opens `AddNameDialog`, creates recipe assigned to this item
- Changes apply immediately without save button

**6. Log (`/items/$id/log`, `History` icon)**
- History/logs tab (view-only); never has unsaved changes
- **Layout since 2026-11-25** (design `docs/features/items/2026-11-25-inventory-log-layout-design.md`).
  One `<li>` per row, newest first, in a `<ul>` named "Log" (`items.detail.tabs.history`):

  | Part | What |
  |---|---|
  | row 1, left | sign, amount and unit (`−30 g`, U+2212 for minus), then the label of the kind: "Bought at {vendor}" / "Bought", "Used in {recipes}" / "Used in cooking", "Stock count" (Chinese: 在 {vendor} 購買 / 購買, 用於 {recipes} / 烹飪使用, 盤點) |
  | row 1, right | the quantity after the change, with the unit; a screen reader hears "After the change:" first |
  | row 2 | `Wed, Nov 25, 2026 · 14:30` / `2026/11/25（週三）14:30`, through `Intl`, in a `<time>` |
  | unit | the item's tracking unit: `measurementUnit` when the item tracks in measurement (with a measurement unit AND an `amountPerPackage`, the `consumeItem` test), else `packageUnit`. Purchase and stock count rows store `delta` and `quantity` in packs and are multiplied by `amountPerPackage`; a cooking row stores `delta` in the tracking unit already, so only its `quantity` is converted |
  | numbers | at most 2 decimals, no trailing zeros |

  Every rule is in `lib/inventoryLogDisplay.ts` (tests: `lib/inventoryLogDisplay.test.ts`, both
  languages). The page reads `useVendors()` and `useRecipes()` for current names. Tests:
  `$id/log.test.tsx` (the page, both languages), `$id/log.stories.tsx` → `NewLogShapes`
  (renamed vendor, deleted vendor, deleted recipe, a real stock count, in grams)
- **What writes a row.** Checkout (`purchase`), cooking (`cooking`), and since 2026-11-25 a
  manual save that changes the on-hand total (`stockCount`): the Stock tab Save and the pantry
  Quick update. The server writes it in cloud (`upsertItemStock`), local `updateItem` in local
  mode. A save that changes only the target, the refill level or the due date writes none, and
  neither does opening a pack (same total). Item create, Add to location and the unit switch
  write none

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
- Confirmation dialog offers **Cancel · Discard · Save** (since 2026-11-25; see *The
  unsaved-changes dialog* below)
- Save button disabled when form is clean (no changes)
- Logs tab never has unsaved changes (view-only)

**The unsaved-changes dialog (since 2026-11-25).** Design:
`docs/global/ui-polish/2026-11-25-unsaved-dialog-save-design.md`. Leaving Info or Stock with
edits (a tab, Back, or another page of the Stock location pager) opens the shared
`UnsavedChangesDialog` (`components/shared/`): **Cancel** (`neutral-outline`) stays,
**Discard** (`destructive-outline`) leaves without saving, **Save** (`primary`) saves and then
goes where the user pressed.

- **Save is the same save as the top bar Save.** `ItemForm` hands the layout a
  `SaveControl` (`{ canSave, save }`, `hooks/useSaveControl.ts`) through its
  `onSaveControlChange` prop; the Info and Stock tabs pass `useItemLayout().registerSaveControl`.
  `save()` calls the tab's own `handleSubmit`, which answers whether it worked
  (`Promise<boolean>`). `canSave` is `ItemForm`'s `isSubmitDisabled` rule (and not read only),
  so Save is off with a field error or a save in flight.
- **The page moves only after `save()` answers `true`.** A failed save shows
  `showSaveError` and the dialog stays open. While the save runs every button of the dialog
  is off and Escape does nothing, so a Discard cannot race the save.
- **The converted amounts dialog opens ON TOP** (owner's flow, brainstorming Q2). When an
  Info save needs it, `handleSubmit` returns a promise that waits for that dialog
  (`pendingAnswerRef` in `$id/index.tsx`). Confirm → the write → `true` → both close and the
  page moves. Cancel → `false` → only the top dialog closes. A failed write → toast →
  `false` → the top dialog is closed, the unsaved-changes dialog stays.
- **Trap:** `handleConfirmAdjustments` takes the waiting answer out of the ref BEFORE its
  first `await`. `AlertDialogAction` closes its dialog right after the click handler starts,
  and that close runs `handleCancelAdjustments`, which would answer `false` first. Moving the
  take after the write turns "user can confirm the converted amounts and then leave" red
  (measured 2026-11-25).
- Tests: `$id/unsavedDialogSave.test.tsx` (local: tab, Back, field error, Cancel, Discard and
  its class, the stacked confirm and cancel, Stock tab, the location pager) and
  `$id/unsavedDialogSave.cloud.test.tsx` (a held write: the page waits; a failed write: the
  dialog stays; a failed converted amounts write; the pager failing and held). E2E:
  `e2e/tests/unsaved-dialog-save.spec.ts`.

**Navigation:**

Back button and post-action navigation use smart history tracking:
- Back button navigates to previous app page (fallback to home if no history)
- **Save stays on the page** (since 2026-11-24, design
  `docs/features/items/2026-11-24-item-tabs-flat-design.md`, part A). After a successful save
  on Info or Stock the page does not move: the tab bumps `savedAt`, so `ItemForm` takes the
  saved values as its new clean state (Save is disabled again and the dirty guard is not
  armed), and the toast `items.detail.saved` ("Saved") shows. The Stock tab stays on the same
  location page. The unit-switch dialog still runs before an Info save; only the `goBack()`
  at its end is gone. A failed save shows `showSaveError` and keeps the edit, as before.
  Tests: `$id/saveStays.test.tsx` (local) and `$id/saveStays.cloud.test.tsx` (cloud)
- After successful delete: auto-navigate back
- Back button respects dirty state guard (shows the unsaved-changes dialog if unsaved changes)

Uses `useAppNavigation()` hook from `src/hooks/useAppNavigation.ts`.

**Files:**
- `src/components/item/ItemForm/ItemForm.tsx` - Shared form component (gates fields via its `sections` prop: `'info'` = identity + the global stock settings, `'stock'` = the per-location numbers). It always holds every value — the stock section's labels read the global units — but each section renders only its own half
- `src/routes/items/$id.tsx` - Parent layout: the top bar, the flat tab row (Info · Stock · Tags · Vendors · Recipes · Log) and the navigation guard (dual-tab dirty guard via `isOnEditableTab`). Tests at `$id.tabs.test.tsx` (the row, the marking, the old addresses)
- `src/routes/items/$id/index.tsx` - Info tab (`ItemForm sections={['info']}` — identity + the eight global stock settings, persisted by `buildInfoUpdates`); hosts the unit-switch dialog (recipe `defaultAmount`s + every location's tracked quantities) and the Delete button. Stories at `$id/index.stories.tsx` (`StockedInThreeLocations` seeds the multi-location conversion). Cloud-mode coverage of the same switch is in `$id/index.cloud.test.tsx`, which drives the real `useApplyUnitSwitchMutation` through `MockedProvider`
- `src/routes/items/$id/stock.tsx` - Stock tab: `ItemStockTab` → `StockTab`, one all-locations pager for **both** modes (no mode split since PR 2), rendering `StockFormPanel` (the `sections={['stock']}` ItemForm; `buildStockUpdates` writes the five per-location fields only). Stories at `$id/stock.stories.tsx`, smoke tests at `$id/stock.stories.test.tsx`, integration tests at `$id/stock.test.tsx` and cloud-mode tests at `$id/stock.cloud.test.tsx`
- `src/components/item/LocationPager/LocationPager.tsx` - the dot pager (tablist) used by the Stock tab
- `src/routes/items/$id/tags.tsx` - Tags tab; tests at `$id/tags.test.tsx`
- `src/routes/items/$id/vendors.tsx` - Vendors tab; tests at `$id/vendors.test.tsx`
- `src/routes/items/$id/recipes.tsx` - Recipes tab; tests at `$id/recipes.test.tsx`
- `src/routes/items/$id/relation/index.tsx` and `relation/$.tsx` - redirects from the old `/items/$id/relation/…` addresses
- `src/routes/items/$id/log.tsx` - History/logs tab (view-only); stories at `$id/log.stories.tsx`
- `src/routes/items/$id.test.tsx` - Integration tests
- `src/hooks/useItemLayout.tsx` - Dirty state context for tab coordination, the top bar's Save slot (`saveSlot`, `setSaveSlot`), and the form's `SaveControl` for the unsaved-changes dialog (`saveControl`, `registerSaveControl`)

### Save waits for the recipes and the stock rows (2026-11-26)

Bug doc: `docs/features/items/2026-11-26-bug-save-before-recipes-load.md`.

The Info tab's `handleSubmit` decides whether the converted amounts dialog opens from two
reads: `useRecipes()` (`allRecipes`) and `useItemStocks(id)` (`stocks`). Before this fix,
while either had not loaded, it counted no recipe and no location, skipped the dialog and
saved. So turning Consumable off lost the recipe warning, and a unit switch left recipe
amounts and every location's stock in the old unit. E2E found it on Neon
(`consumable-items.spec.ts`, the recipe warning test).

| State | Save | Message |
|---|---|---|
| both reads have data | on (the other rules still apply) | none |
| one read still loading | off | none |
| one read failed with nothing cached | off | `items.detail.readsFailed`, "Could not load this item's recipes or stock, so it cannot be saved. Reload the page to try again." (`role="alert"`, above the form) |

- **One rule turns off all three Saves.** The tab passes `submitBlocked={readsMissing}` to
  `ItemForm`, where it joins `isSubmitDisabled`: the top bar Save, the in-form Save, and the
  unsaved-changes dialog's Save (`canSave`). `handleSubmit` also returns `false` when a read
  is missing, as a second line of defense.
- **Keyed on `data === undefined`, not `isLoading`.** A read that failed with nothing cached
  is not loading and still has no data. The message uses each hook's `isError`, which is
  `true` only when there is no data to show.
- **`useLocations()` is NOT in the rule.** It only names and orders the dialog's rows; a
  missing name falls back to the location id.
- **In cloud the stock rows cannot be "still loading" on this tab.** `useItem` reads the
  same `ItemStocksForItem` query, and the item layout (`$id.tsx`) shows a spinner until it
  answers. Only a FAILED stock read reaches the form without stock rows. In local mode
  `useItem` reads `getItem`, so the stock rows can still be loading.
- Tests: `$id/saveWaitsForReads.test.tsx` (local: each read held for good with a mock of
  `getRecipes` / `getItemStocks`, the unsaved-changes dialog's Save, and a control) and
  `$id/index.cloud.test.tsx` (cloud: `GetRecipes` held with `delay: Infinity`, and a failed
  `GetRecipes` and a failed `ItemStocksForItem` showing the message).

### The Consumable switch (consumable items PR 2, 2026-11-25)

The first row under "Stock settings" on the Info tab is **Consumable** (`ItemForm`'s
`consumable` value; `itemToFormValues` reads `isConsumable(item)`, `buildInfoUpdates`
sends it). On for a new item.

| Switch | Info tab | Stock tab and `QuickUpdateDialog` |
|---|---|---|
| on | everything, as before | everything, as before |
| off | no "Advanced stock settings" block: no Track in measurement, measurement unit, amount per package or expiration | ONE stock field, **Amount** (since 2026-11-26), no Unpack or Pack, no "Expires on" |

- **Hidden values are kept.** They stay in the form and are saved unchanged, so turning the
  switch on again shows them as they were.
- **Turning it off on a measurement item moves it to packages.** `handleConsumableChange`
  calls `handleTargetUnitChange(false)`, so the form converts like the Track in measurement
  switch. On Save, `targetUnit` has changed, so the converted amounts dialog above opens and
  one `applyUnitSwitch` writes the item (with `consumable: false`), every location and the
  recipe amounts. Turning it on again does not move the item back to the measurement unit.
- **A hidden "Expires on" sends no `dueDate` key** (`buildStockUpdates` in `stock.tsx`, and
  `QuickUpdateDialog`), the issue #261 rule: the location's stored date is kept.
- `consumeAmount` is NOT hidden: it is the recipe step, and recipes do not change.

**The Amount field of a non-consumable item (2026-11-26, owner decisions; design
`docs/features/items/2026-11-26-non-consumable-amount-design.md`).** A non-consumable item
counts whole pieces in the package unit, and the measurement unit does not count.

| Part | What |
|---|---|
| Amount | `items.form.amount.*` / `pantry.quickUpdate.amount*` ("Amount", 「數量」), labelled with the package unit. It edits `packedQuantity`; there is no new column. A typed fraction is rounded down on blur |
| saved `unpackedQuantity` | always `0` for a non-consumable item: `buildStockUpdates` (`stock.tsx`) and `QuickUpdateDialog`'s submit. So the first save clears opened stock an old row still held |
| Target, Refill | in the package unit, step 1, a typed fraction rounded UP (`getPieceCounts`' rule) |
| the stock row | `getStockPreview(…, { consumable: false })` gives pieces: `current` = whole packed packages, `target` and `refillThreshold` = `getPieceCounts`. Fill to Full = the target in pieces, no opened stock |
| switching to non-consumable | `buildStockConversions` (`$id/index.tsx`) runs for EVERY location when `isConsumable(item) && !values.consumable`, with or without a unit change: `toNonConsumableQuantities` (`lib/quantityUtils.ts`) gives `unpackedQuantity: 0` and target and threshold in whole packs (divided by `amountPerPackage` for a measurement item, then rounded up). Packed stays. The converted amounts dialog says so (`unitSwitchDialog.nonConsumableDescription`), and ONE `applyUnitSwitch` writes it in both modes. No server change |
| old rows | read-time only, no Dexie version and no migration: the card, the stock row and the cart dialog count packed packages only (`getPieceCounts`), and the next save writes `unpackedQuantity: 0` |

### Manual Quantity Input

Users can manually set current inventory quantities in the item detail form:
- **Packed Quantity** - Number of whole packages (always visible)
- **Unpacked Quantity** - Loose amount from opened packages (only for dual-unit items)
- **Pack button** (`Package` icon) - Converts all complete units from unpacked into packed packages. In package mode: floors unpacked count and adds to packed. In measurement mode: uses `amountPerPackage` to calculate whole packages. Disabled when there are no complete packages available in unpacked.
- **Unpack button** (`PackageOpen` icon) - Unpacks 1 package from packed to unpacked. In package mode: decrements packed by 1, increments unpacked by 1. In measurement mode: decrements packed by 1, adds `amountPerPackage` to unpacked. Disabled when `packedQuantity < 1`.

**Every number input holds the user's raw TEXT while it is being edited.** The five values stored as numbers (`packedQuantity`, `unpackedQuantity`, `targetQuantity`, `refillThreshold`, `consumeAmount`) render through `numericInputProps()` in `ItemForm.tsx`, which keeps the in-progress text in a `numericDrafts` map and moves the numeric state only once that text parses. Without it a controlled input holding a **number** cannot represent `''`, `'2.'` or `'-'`: `Number('') === 0`, so backspacing the last digit of a field showing `0` produced no state change at all, React force-wrote `"0"` back into the DOM node and put the caret at the end — which the user reads as *"the field lost focus and ate my first keystroke"*. A draft is discarded the moment its remembered number stops matching the state (Pack/Unpack, the unit switch), and the prop-sync effect clears the whole map, so no in-progress text survives a form reset.

- **Blur is where a field settles**, not keystroke: an empty/unparsable field resolves to `0`, and Unpacked's `roundToStep(…, consumeAmount)` runs there too. Rounding on every keystroke destroyed a partially typed decimal — typing `2.5` landed on `3` before the `5` was pressed. The rounding itself is unchanged, only deferred.
- **`consumeAmount === 0` means "no step size", honestly, everywhere in this form** (designer ruling, 2026-08-24) — so nothing may fabricate a `1` for it. Both routes pass `item.consumeAmount ?? 0` into `initialValues` (the `??` is unreachable: `consumeAmount` is a required `number` on `Item`, the v16 upgrade backfills every pre-v16 row and `createItem` always sets it), and `ItemForm` derives one `quantityStep = consumeAmount > 0 ? consumeAmount : 'any'` for the Unpacked / Target Quantity / Refill When Below `step` attributes — `step={0}` is invalid HTML, so **"no step" is spelled `step="any"`**. Unpacked's blur normalizer passes `consumeAmount` straight to `roundToStep`, which returns the value untouched for a step `<= 0`; such an item's decimal is therefore kept, not silently rounded to a whole unit. The Info tab's `consumeAmount > 0` validation ("Must be greater than 0.") stays. Pinned in `ItemForm.test.tsx` (display, the three `step="any"` attributes, no blur rounding, plus a `consumeAmount: 2` control that must still snap) and end-to-end in `$id.test.tsx`. Deliberately **not** applied to the stepper/recipe call sites, whose `|| 1` means something else there — a `+`/`−` increment must be non-zero to be usable, and a recipe `defaultAmount` of `0` means "optional, unchecked".

- **0 is no longer the create default — 1 is** (designer ruling, 2026-08-24, reversing `6302ee97`). A new item must be **valid by nature**: it opens on a clean Info tab instead of on "Must be greater than 0.". The default lives in exactly two places, one per data mode — `createItem` (`db/operations.ts`) and the cloud `createItem` resolver (`apps/server/src/resolvers/item.resolver.ts`) — and **no create call site passes a literal `consumeAmount`**; adding one would fork the default. Both apply it with `??`, not `||`, so an explicit `0` still survives and still means "no step size". Everything in the bullet above is therefore unchanged: 0 stays reachable through an explicit set, a restored backup, or an item created while the 0 default was live. Every test that exercises 0-behaviour must set `consumeAmount: 0` **explicitly** rather than relying on a default — `$id.test.tsx`'s "a consume amount of 0 is displayed honestly" describe and `$id/stock.test.tsx`'s Save-not-blocked guard both do. The defaults themselves are pinned in `db/operations.test.ts` and `apps/server/src/resolvers/item.resolver.test.ts`.
- **The submitted payload stays numeric.** `ItemFormValues` is untouched and `buildStockUpdates` / `buildInfoUpdates` / the Pack/Unpack math still receive real numbers. `amountPerPackage`, `estimatedDueDays` and `expirationThreshold` are `string | number` and already kept their raw text, so they are deliberately left alone.
- **jsdom cannot reproduce the caret jump** — `userEvent` keeps its own value buffer independent of React's write-back, so a save round-trip test stays green against the old code. The behaviour is pinned in `ItemForm.test.tsx` (empty field, deferred rounding, blur resolution, draft reset); `$id/stock.test.tsx` only guards the numeric submit shape.

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
- A save that changes the on-hand total writes one "Stock count" log row (since 2026-11-25;
  before, it wrote no log). See *6. Log* above
- Use for initial setup, corrections, or adjustments

**Files:**
- `src/routes/items/$id/stock.tsx` - Stock tab form with quantity fields
- `src/routes/items/$id.test.tsx` - Component tests
- `src/lib/quantityUtils.ts` - packUnpacked() and `convertTrackedQuantities()` (the unit-switch conversion of the three tracked quantities); `getStockPreview()` (the Stock tab's progress-row derivation, shared with `QuickUpdateDialog` — see `components/CLAUDE.md`)

### What a household member sees (cloud, households H5 task F.5)

A household `member` may read the catalog but not change it. Everything reads `usePermissions()`; local mode is unchanged.

| Tab | Member |
| --- | --- |
| Info | `ItemForm readOnly`: the fields are `readOnly` or disabled, no Save (in the top bar or anywhere), no Delete. The note "Only a household owner or manager can change this." (`settings.catalogReadOnlyItem`) shows above the form. The unit-switch dialog is reached only through Save, so it cannot open |
| Tags, Vendors, Recipes | the badges show what is assigned, are `aria-disabled`, and a press writes nothing. No "New Tag Type" / "New …" buttons |
| Stock | unchanged by the household role. It follows the LOCATION role (task F.6) |

The note shows only when `roleKnown` is `true`. While `GetHousehold` loads, or when it failed with nothing cached, the Info tab is read only (the safe default) but shows no note. Tests: `routes/items/$id/readOnly.test.tsx`.

**Known gap:** the `role="button"` badges on the Tags, Vendors and Recipes tabs cannot be reached by keyboard (no `tabIndex`, no key handler). This is older than H5; see the H5 plan, *Known gaps*.

### What a location viewer sees on the Stock tab (cloud, households H5 task F.6)

Each pager page follows the caller's role at THAT page's location, not at the active one and not the household role. The pager itself lists only locations with a role (`useLocations()` is the switcher's list).

| Role at the page's location | Stock form | Remove from location | Add to location (not-stocked page) |
| --- | --- | --- | --- |
| `viewer` | `ItemForm readOnly`: numbers and due date `readOnly`, steppers, Pack, Unpack, Clear and Fill to Full disabled, no Save; the note `common.locationViewOnly` above it | hidden | hidden |
| `participant` | editable | hidden | shown |
| `organizer` | editable | shown | shown |

A household manager who is only a viewer of a location sees that page read only (Review Focus 4 of the H5 plan). Tests: `routes/items/$id/stock.roles.test.tsx` (three people who differ only in the role on the page's location, a second location with another role, a third with none).

**Known gap:** the Info tab's unit switch (`applyUnitSwitch`) asks `participant` on EVERY location the item is stocked in. A household manager who is a viewer of one of them gets `FORBIDDEN` on Save; the page does not warn first.

