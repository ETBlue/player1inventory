# Components

## Folder Structure

```
src/components/
  global/         — one-time structural components: Layout, Navigation, Sidebar, PostLoginMigrationDialog
  shared/         — reusable across features: AddNameDialog, DeleteButton, EmptyState, FilterStatus, GroupByToggle, GroupCard, LayoutInnerPages, LoadingSpinner, Toolbar, ViewToggle
  pantry/         — pantry group-by views: PantryListView, ShelfGroupView, ShelfDetailView, VendorGroupView, VendorDetailView, RecipeGroupView, RecipeDetailView
  item/           — item-specific: ItemCard, ItemFilters, ItemForm, ItemListToolbar, ItemProgressBar, NewItemDialog, QuickUpdateDialog
  tag/            — tag-specific: ColorSelect, EditTagTypeDialog, TagBadge, TagInfoForm, TagTypeDropdown, TagTypeInfoForm
  vendor/         — vendor-specific: NewVendorDialog, VendorCard, VendorInfoForm
  recipe/         — recipe-specific: CookingControlBar, NewRecipeDialog, RecipeCard, RecipeInfoForm
  settings/       — settings-specific: ConflictDialog, DataModeCard, ExportCard, ImportCard, LanguageCard, SettingsNavCard, ThemeCard
  shelf/          — shelf-specific: ShelfList, AddShelfDialog
  ui/             — shadcn/ui primitives (flat files, not folders)
```

## Global Components

One-time structural components that appear once in the app shell.

**`Layout`** (`src/components/global/Layout/index.tsx`) — root shell that wraps every page. Uses a CSS grid layout (`h-dvh grid grid-cols-[auto_1fr]`):
- Column 1: Sidebar (desktop only, `hidden lg:flex`, `w-56`)
- Column 2: inner grid (`grid-rows-[1fr_auto]`) — main content area on top, Navigation on bottom
- Main element uses `[container-type:size]` enabling `cqh`-based container queries in children
- A skip-to-main-content link is rendered inside a `<header>` landmark before the sidebar

**`Navigation`** (`src/components/global/Navigation/index.tsx`) — mobile-only bottom navigation bar (`lg:hidden`). Renders 4 nav links (Pantry, Shopping, Cooking, Settings) in a `grid-cols-4` row. Hidden on fullscreen pages (`/items/*`, `/settings/tags*`, `/settings/vendors*`, `/settings/recipes*`). On fullscreen pages the component renders `null` — no padding is added to the page.

**`Sidebar`** (`src/components/global/Sidebar/index.tsx`) — desktop-only left sidebar (`hidden lg:flex flex-col w-56`). Same fullscreen-page suppression as Navigation. Shows "Player 1 Inventory" header and 4 nav links with icon + label side-by-side. Active: `text-importance-primary-background bg-background-elevated`.

## Shared Components

Reusable across multiple features and pages.

**`LayoutInnerPages`** (`src/components/shared/LayoutInnerPages/index.ts`) — shared layout for all level 2+ pages (entity detail + new-entity pages). Provides a fixed top bar (back button with `goBack()` default, optional `icon`, `title`, optional `toolbarEnd`) and a scrollable `children` area. Props: `title: ReactNode`, `icon?: ReactNode`, `onBack?: () => void`, `toolbarEnd?: ReactNode`, `children: ReactNode`.

**`Toolbar`** (`src/components/shared/Toolbar/index.tsx`) — shared wrapper for list-page toolbars. Provides `bg-background-surface`, `border-b-2 border-accessory-default`, `px-3 py-2`, `flex items-center gap-2`. Used by shopping (cart toolbar), vendor list, and tags pages. Accepts optional `className` for layout overrides (e.g. `justify-between`, `flex-wrap`).

**`AddNameDialog`** (`src/components/shared/AddNameDialog/index.tsx`) — generic name-input dialog used by Tags, Vendors, and Recipes tabs for inline entity creation. Props: `open`, `title`, `submitLabel`, `name`, `placeholder?`, `onNameChange`, `onAdd`, `onClose`, `isPending?`. Cancel button uses `neutral-outline`. Name input is `autoFocus`. Submit button shows a loading spinner and is disabled when `isPending` is true or when `name` is empty; Enter key is also blocked in both states.

**`LoadingSpinner`** (`src/components/shared/LoadingSpinner/index.tsx`) — centered animated spinner for page-level loading states. No props. Renders `Loader2` icon (`size-8 animate-spin [transform-box:fill-box] text-foreground-muted`) inside a `flex min-h-[50vh] items-center justify-center` container. `[transform-box:fill-box]` is required on all `animate-spin` SVG icons — without it Firefox rotates on the Y axis instead of Z when an ancestor has `container-type:size`. Used in pantry page, item detail, and item log tab.

**`EmptyState`** (`src/components/shared/EmptyState/index.tsx`) — centered empty state message used across all list/tab pages. Props: `title: string`, `description: string`, `className?: string`. Renders `text-center py-12 text-foreground-muted` with title on first line and smaller description below. Used in cooking page, settings recipes/vendors lists, detail items tabs, and item detail tags tab.

**`ViewToggle`** (`src/components/shared/ViewToggle/index.tsx`) — toggle control for switching between list and group views. Used on the pantry page toolbar; clicking "group" navigates to `/?groupBy=<stored>` and clicking "list" navigates to `/`.

**`LocationSwitcher`** (`src/components/shared/LocationSwitcher/LocationSwitcher.tsx`) — global active-location selector. No props. Icon-sized trigger showing the active location name's **uppercase first letter**; clicking opens a dropdown listing all locations by `order` (active one marked with a Check) plus a trailing "Manage locations" item navigating to `/settings/locations`. Reads/writes the active location via `useActiveLocation`; lists locations via `useLocations`. Mounted at the **left** (leading position) of every pantry view (`PantryListView`, all three group views, all three detail views), the shopping index (`/shopping` `Toolbar`), and cooking (`/cooking` `Toolbar`) toolbars. In the group views it leads the `Toolbar` before `ViewToggle`/`GroupByToggle`; in the detail views and the flat list it occupies the first slot of the `ItemListToolbar` `leading` group. **INERT (PR B):** selecting a location only updates + persists the active-location state and trigger label — it does NOT scope or change any displayed data (scoping arrives in PR D). Location names render as-stored (vendor-name display rule); the single-letter trigger uppercases the first character. **Provider requirement:** calls `useActiveLocation()`, which throws outside `ActiveLocationProvider`. The provider is mounted in `__root.tsx`, so any test/story rendering these views through the full `routeTree` is covered automatically; isolated renders must wrap with `ActiveLocationProvider`.

**`GroupByToggle`** (`src/components/shared/GroupByToggle/index.tsx`) — segmented button group for switching between shelf, vendor, and recipe groupings on the pantry group views. Props: `current: PantryGroupBy`, `onChange: (groupBy: PantryGroupBy) => void`. Renders three icon buttons (ShelvingUnit / Store / ChefHat) with `aria-pressed` for the active selection. Used in all three group-view toolbars (`ShelfGroupView`, `VendorGroupView`, `RecipeGroupView`).

**`GroupCard`** (`src/components/shared/GroupCard/index.tsx`) — clickable card row representing one group (shelf, vendor, or recipe) in a group-by list. Shows the group name, item count, stock status (out-of-stock / low-stock rendered as colored text spans with `·` separators), and an `ItemProgressBar` for packed totals across all items in the group. Props: `name`, `icon?`, `itemCount`, `onClick`, `outOfStockCount?`, `lowStockCount?`, `activeCount?`, `totalPackedQuantity?`, `totalTargetInPacks?`, `totalRefillInPacks?`, `nameClassName?` (defaults to `'capitalize'`; pass `'normal-case'` for vendor names).

## Pantry Components

View components rendered by the pantry home page (`/`) depending on the `?groupBy` and `?id` URL params. Each component is self-contained — it owns its own data fetching via hooks and toolbar controls.

**`PantryListView`** (`src/components/pantry/PantryListView.tsx`) — flat scrollable item list for the pantry page with no group-by param. Renders the full `ItemListToolbar` (sort, filter, search, add button) and lists all items with active/inactive separation. Includes `QuickUpdateDialog` and `NewItemDialog`.

**`ShelfGroupView`** (`src/components/pantry/ShelfGroupView.tsx`) — group-by-shelf overview showing one `GroupCard` per shelf. Toolbar: `LocationSwitcher` (leading), `ViewToggle`, `GroupByToggle`, and a "Manage shelves" link (`settings.shelves.manage`) to `/settings/shelves`. Clicking a group card navigates to `/?groupBy=shelf&id=<shelfId>`.

**`ShelfDetailView`** (`src/components/pantry/ShelfDetailView.tsx`) — item list scoped to one shelf (`?id=<shelfId>`). Shows items filtered by the shelf's tag rules. Toolbar `leading` slot: `LocationSwitcher` then a back button (returns to `/?groupBy=shelf`); plus sort, search, and tags controls.

**`VendorGroupView`** (`src/components/pantry/VendorGroupView.tsx`) — group-by-vendor overview showing one `GroupCard` per vendor (plus a "No vendor" card with a `Lock` icon for items with no vendor assigned). Toolbar: `LocationSwitcher` (leading), `ViewToggle`, `GroupByToggle`, and a "Manage vendors" link (`settings.vendors.manage`) to `/settings/vendors`. Vendor `GroupCard` uses `nameClassName="normal-case"` to preserve intentional vendor casing.

**`VendorDetailView`** (`src/components/pantry/VendorDetailView.tsx`) — item list scoped to one vendor (`?id=<vendorId>` or `'unsorted'`). Toolbar `leading` slot: `LocationSwitcher` then a back button (returns to `/?groupBy=vendor`); plus sort and search controls.

**`RecipeGroupView`** (`src/components/pantry/RecipeGroupView.tsx`) — group-by-recipe overview showing one `GroupCard` per recipe (plus a "Not added to recipe" card with a `Lock` icon for items not in any recipe). Toolbar: `LocationSwitcher` (leading), `ViewToggle`, `GroupByToggle`, and a "Manage recipes" link (`settings.recipes.manage`) to `/settings/recipes`.

**`RecipeDetailView`** (`src/components/pantry/RecipeDetailView.tsx`) — item list scoped to one recipe (`?id=<recipeId>` or `'unsorted'`). Toolbar `leading` slot: `LocationSwitcher` then a back button (returns to `/?groupBy=recipe`); plus sort and search controls.

## Item Components

**`ItemListToolbar`** (`src/components/item/ItemListToolbar/index.tsx`) — unified toolbar for all item list pages (pantry, shopping, tag/vendor/recipe items tabs). Wraps `<Toolbar>` (Row 1) with filter, relations-toggle (`ListChevronsUpDown` icon — toggles tag/vendor/recipe visibility on cards), sort dropdown, sort-direction, and search buttons; plus collapsible Row 2 (search), Row 3 (`ItemFilters`), Row 4 (`FilterStatus`). Search/filter/UI-visibility state is stored in URL params via `useUrlSearchAndFilters`. Sort preferences are managed by `useSortFilter` (localStorage). Accepts `leading` (left slot), `children` (right slot), `isRelationsToggleEnabled`, `onSearchSubmit` (called when Enter pressed with no exact match), `onCreateFromSearch` (same trigger — shows a Create button; pass `hasExactMatch` so the toolbar knows when to suppress it). Escape clears the search value but keeps the input row open.

Note: Fixed nav bars (item detail, vendor detail) use `bg-background-elevated` and are not using this component — they are positioned overlays, not scrolling toolbars.

**`NewItemDialog`** (`src/components/item/NewItemDialog/index.ts`) — the pantry **"Add" dialog**, a searchable **combobox** over all items the user can access (every global `Item`, via `useItems()`). Props: `open`, `onOpenChange`, `initialName?` (pre-fills + focuses the combobox), `onSuccess?(item)`. Behaviour:
- **Combobox** (`role="combobox"`, labelled "Name", `aria-autocomplete="list"`, `aria-activedescendant` for virtual focus). Typing filters the catalog by name; an empty query lists everything. Arrow keys move the highlight, Enter selects, the input owns all keyboard interaction (options are non-focusable `role="option"` rows). Hovering a non-selectable (disabled) option does **not** move the keyboard highlight there (`onMouseEnter` is gated by `isSelectable`) — otherwise a mouse hover could park the highlight on a dead option, making a subsequent Enter a no-op even when a selectable Create option is available.
- **Select existing (not yet stocked here)** → `useAddItemToLocation()` (copy-on-add) stocks it in the active location. Calls `onSuccess?` with the **freshly copied `ItemStock`** merged over the item (not the stale pre-add `PantryItem` join, whose stock fields would still read the zeroed pre-add defaults) — no navigation by default, it appears in the pantry. **Local mode only.**
- **Already stocked here** → option rendered disabled (`aria-disabled`, "Already here" annotation), not selectable.
- **Query exactly matches an item already stocked here** → the sole option renders disabled, no Create option is offered (Enter is otherwise a dead key), and inline feedback below the listbox names the item and active location (`items.addDialog.alreadyStockedHere`, e.g. "Milk is already in Kitchen.") explaining why nothing happens. This is deliberately **not** "skip to the next option" — there is no other option to skip to in the exact-match case.
- **Cloud mode is create-only.** Cloud has no per-location `ItemStock` backend yet (deferred in PR D), so cloud items never carry a `stockId` — every catalog option renders disabled/"already here" and clicking one is a no-op (no orphan local write, no false `onSuccess`). Only the Create path is available. An **exact name match still suppresses Create** in cloud mode (duplicate names stay impossible, consistent with local mode — user ruling 2026-08-16), so it renders its own location-free feedback instead: `items.addDialog.alreadyExists` ("An item named Milk already exists."). The local `alreadyStockedHere` copy names a location and would be wrong in cloud.
- **Loading guard:** both inline feedback strings only render once the data they name is available — the local one waits for `activeLocation`, so the dialog never shows "Milk is already in ." while `useLocations()` is in flight.
- **No exact catalog match** → a `Create "<name>"` option + a footer Create button + a package-unit field appear; creating calls `useCreateItem()` (item + active-location stock) then, without `onSuccess`, navigates to the item detail page.

Used by: pantry views (Add button) and the tag/vendor/recipe items tabs (which pass `onSuccess` to assign the new/added item). Tests that submit the create path must click the dialog's `Create "<name>"` button (`within(dialog).getByRole('button', { name: /create/i })`), not the old "New Item" button.

**`LocationPager`** (`src/components/item/LocationPager/LocationPager.tsx`) — dot pager across locations for the item-detail Stock tab. Props: `locations: Location[]`, `currentIndex: number`, `activeLocationId: string`, `onChange(index)`, `panelId: string`, `tabIdPrefix: string`. Renders `[‹] name + dots [›]`: a `role="tablist"` of `role="tab"` dot buttons (roving `tabIndex`, arrow-key/Home/End navigation with automatic activation, `aria-controls` pointing at the caller's `role="tabpanel"`), flanked by chevron buttons that disable at the ends — movement clamps rather than wraps, so the boundary is visible. A visually hidden `aria-live="polite"` region announces the location being viewed.

Three channels, none of them colour alone:
- **Size + fill colour = the page being viewed.** A larger `size-3.5` dot in `bg-importance-primary-background` against the `size-2.5` `bg-foreground-muted` others. Size carries it on its own because in dark mode those two tokens sit ~1.1:1 apart in luminance — a hue-only difference.
- **Shape = the globally active location.** Its dot is drawn hollow (`border-2 bg-transparent`) while the others are solid, and it stays hollow while the user pages elsewhere. Shape survives greyscale and low vision; the halo ring this replaced measured 2.44:1 against the page and 1.16:1 against the dot it wrapped, both under WCAG 1.4.11's 3:1 for non-text indicators. Both dot colours clear 3:1 against `background-elevated` in either theme, and since the hollow dot's stroke *is* the dot colour and its centre *is* the page, the stroke inherits that ratio.
- **Words = both facts, always.** The viewed location's name is the heading; the caption underneath always names the active location — "Active" when standing on it, "Active: `<name>`" while viewing another page. Plus `aria-selected` and "(active location)" in the active dot's accessible name.

`data-viewed` / `data-active` mirror the two states onto the DOM so tests can bind the marker to the right dot; the CSS itself is judged by eye in `LocationPager.stories.tsx` (both themes). The caller decides whether to render the pager at all: with a single location the Stock tab renders no chrome.

**`QuickUpdateDialog`** (`src/components/item/QuickUpdateDialog/index.ts`) — pantry-page dialog for bulk-editing a single item's packed/unpacked quantities in one submit. Triggered by the calculator icon button on each `ItemCard` in pantry mode. Provides +/− steppers, manual inputs, Pack/Unpack buttons (mirrors item info tab logic via `computePack`/`computeUnpack`), Clear, and Fill to Full actions, with a live progress bar preview. Submits a single mutation with the final `{ packedQuantity, unpackedQuantity }` — never touches `dueDate`. Pack/Unpack/Fill-to-Full logic lives in pure functions in `quantityUtils.ts` (`computePack`, `computeUnpack`, `computeFillToFull`).

## Vendor Components

**`NewVendorDialog`** (`src/components/vendor/NewVendorDialog/index.ts`) — dialog for creating a new vendor (name only). Props: `open`, `onOpenChange`, `onSuccess?(vendor)`. On success without `onSuccess`, navigates to the vendor detail page. Used by: vendor list page.

## Recipe Components

**`NewRecipeDialog`** (`src/components/recipe/NewRecipeDialog/index.ts`) — dialog for creating a new recipe (name only). Props: `open`, `onOpenChange`, `initialName?` (pre-fill from search term), `onSuccess?(recipe)`. On success without `onSuccess`, navigates to the recipe detail page. Syncs `initialName` via `useEffect` so callers can update it before re-opening. Used by: recipe list page, cooking page.

**`CookingControlBar`** (`src/components/recipe/CookingControlBar/index.tsx`) — second-row toolbar for the cooking page. Props: `allExpanded`, `onExpandAll`, `onCollapseAll`, `onCreateRecipe?(name)`. Reads/writes `?sort` (`name|recent|count`), `?dir` (`asc|desc`), `?q` directly via `Route.useSearch()` and `useNavigate()`. Row 1: sort Select, direction button, expand/collapse button, spacer, search toggle. Row 2 (conditional): search input with Create/Clear buttons. When Create is triggered (button click or Enter with no exact match), calls `onCreateRecipe?.(q.trim())`. `searchVisible` is local state initialized from `!!q`.

## Settings Cards

Self-contained card components for the settings page. Each lives in `src/components/settings/` and accepts no props — all state is read from hooks internally.

**`DataModeCard`** (`src/components/settings/DataModeCard/DataModeCard.tsx`) — data mode toggle card (local ↔ cloud). No props. Uses `useDataMode`. Renders different content for local vs cloud mode. Cloud mode renders `CloudModeSection` which owns all cloud state and dialogs: a **Switch** flow (switch to offline, optional cloud→local data copy, Clerk session kept alive) and a **Sign Out** flow (sign out of Clerk, optionally switch offline and/or copy cloud data). Sign Out button appears inline with the signed-in email.

> Note: the alpha global "family group" sharing concept (FamilyGroupCard + the `familyId` column/field and `FamilyGroup` model) was removed. Per-location membership is the planned cloud sharing model going forward.

**`ThemeCard`** (`src/components/settings/ThemeCard/index.tsx`) — theme selector card. No props. Uses `useTheme`. Renders Sun/Moon icon and three segmented buttons (Light / System / Dark).

**`LanguageCard`** (`src/components/settings/LanguageCard/index.tsx`) — language selector card. No props. Uses `useLanguage`. Renders Globe icon and a Select dropdown (Auto / English / 繁體中文).

**`ExportCard`** (`src/components/settings/ExportCard/index.tsx`) — data export card. No props. Shown in **both modes**. Calls `exportCloudData(client)` in cloud mode, `exportAllData()` in local mode. Both produce the same `ExportPayload` JSON format. Includes loading state while export is in progress.

**`ImportCard`** (`src/components/settings/ImportCard/index.tsx`) — data import card. No props. Shown in **both modes**. Renders a file picker (`<input type="file" accept=".json">`). Flow: parse JSON → validate ExportPayload shape → detect conflicts → open `ConflictDialog` if conflicts exist → call `importLocalData()` or `importCloudData()` with chosen strategy. Exposes three import strategies: skip, replace, clear.

**`ConflictDialog`** (`src/components/settings/ConflictDialog/index.tsx`) — import conflict resolution dialog. Props: `open`, `conflicts: ConflictSummary`, `onSkip`, `onReplace`, `onClear`, `onClose`. Groups conflicts by entity type, shows names and match reasons (ID/name/both). Three action buttons: Skip conflicts · Replace matches · Clear & import (destructive).

**`SettingsNavCard`** (`src/components/settings/SettingsNavCard/index.tsx`) — navigation link card for settings list items. Props: `icon: LucideIcon`, `label: string`, `description: string`, `to: string`. Renders a TanStack Router Link wrapping a Card with icon, label, description, and ChevronRight.

## Shopping Components

**`VendorCartCard`** (`src/components/shopping/VendorCartCard/VendorCartCard.tsx`) — clickable card for the `/shopping` index page showing a vendor's cart status. Props: `vendorName: string`, `isNoVendor?: boolean`, `checkedCount: number`, `totalQuantity: number`, `availableCount: number`, `onClick: () => void`. Layout: grid with `Store` icon, `CardHeader` (vendor name + item count description), trailing flex row (optional packs `Badge` + `ChevronRight`). The packs `Badge` (`neutral-outline` variant) is shown only when `totalQuantity > 0`. Vendor name uses `capitalize`; `isNoVendor={true}` applies `normal-case` instead (preserves casing like "iHerb"). Entire card is `role="button"` with keyboard support.

## Shelf Components

Components for the shelf-view feature.

**`ShelfList`** (`src/components/shelf/ShelfList/ShelfList.tsx`) — list of shelves. Props: `shelves`, `onShelfClick`, `getItemCount`, `getFilterSummary?`, `getOutOfStockCount?`, `getLowStockCount?`, `getActiveCount?`, `getPackTotals?` (returns `{ totalPacked, totalTarget, totalRefill }` per shelf ID).

**`AddShelfDialog`** (`src/components/shelf/AddShelfDialog/AddShelfDialog.tsx`) — dialog for creating a new shelf. Exports `AddShelfDialog` and `CreateShelfInput` type.

## Card Primitives

Exported from `@/components/ui/card`.

**`CardDescription`** — supplementary text rendered as `text-sm text-foreground-muted`. Use for secondary labels and short descriptive copy.

**`CardMetadata`** — same as `CardDescription` but renders `text-xs text-foreground-muted`. Use for compact supplementary data: item counts, badge-style metadata, secondary stats. Exported from `@/components/ui/card`.

## Unit Display Components

**`UnitBadge`** (`src/components/shared/UnitBadge/`) — bordered pill for unit labels in card and dialog contexts. Props: `unit?: string | undefined` (defaults to `"pack"`). Style: `px-1 text-xs text-foreground-muted border border-foreground-muted rounded-xs opacity-75`. Used in ItemCard, GroupCard, QuickUpdateDialog. Note: `opacity-75` is intentional for visual harmony; it reduces contrast to ~2.97:1 (below WCAG AA for small text) — accepted tradeoff by design.

**`UnitInline`** (`src/components/shared/UnitInline/`) — inline `(unit)` text for form labels. Props: `unit?: string | undefined`, `placeholder?: string` (default `"pack"`). Renders `(unit ?? placeholder)` with parentheses included. Pass `placeholder="?"` for measurement-unit labels where the unit may be unset — the `?` signals an unresolved setting to the user. Used in ItemForm.

## Dialog Layout Pattern

shadcn/ui `Dialog` uses a three-zone layout: `DialogHeader` → `DialogMain` → `DialogFooter`.

**`DialogMain`** (`src/components/ui/dialog.tsx`) — content wrapper between header and footer. Applies `mx-4 my-3`. Use for the main body of any dialog (forms, descriptions, lists).

**`DialogHeader`** — redesigned as a horizontal bar with an inline close button. Renders `flex items-center border-b border-accessory-default px-4 py-3`. The close button (`X` icon) is appended automatically via a flex spacer — do not add a separate close button.

**`DialogFooter`** — has `m-4` for consistent edge spacing.

## InfoForm Pattern

Entity form components (`TagInfoForm`, `RecipeInfoForm`, `VendorInfoForm`, `TagTypeInfoForm`) own their local state and expose a flat callback API:

- **Props**: `entity?` (initial values), `onSave(data)` (called with trimmed values on submit), `isPending?`, `onDirtyChange?(isDirty)`, plus entity-specific options (e.g. `typeReadonly?` on TagInfoForm)
- **State**: all field values are internal; parent never needs to track them
- **Dirty**: edit mode compares current values to initial; create mode is dirty as soon as any field is filled
- **Validation**: inline error messages (not toast), submit/Enter blocked when invalid
