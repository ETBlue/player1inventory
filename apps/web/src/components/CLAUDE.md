# Components

## Folder Structure

```
src/components/
  global/         — one-time structural components: Layout, Navigation, Sidebar, PostLoginMigrationDialog
  shared/         — reusable across features: AddNameDialog, DeleteButton, EmptyState, FilterStatus, LoadingSpinner, Toolbar
  item/           — item-specific: ItemCard, ItemFilters, ItemForm, ItemListToolbar, ItemProgressBar
  tag/            — tag-specific: ColorSelect, EditTagTypeDialog, TagBadge, TagDetailDialog, TagInfoForm, TagTypeDropdown, TagTypeInfoForm
  vendor/         — vendor-specific: VendorCard, VendorInfoForm
  recipe/         — recipe-specific: CookingControlBar, RecipeCard, RecipeInfoForm
  settings/       — settings-specific: ConflictDialog, DataModeCard, ExportCard, FamilyGroupCard, ImportCard, LanguageCard, SettingsNavCard, ThemeCard
  ui/             — shadcn/ui primitives (flat files, not folders)
```

## Global Components

One-time structural components that appear once in the app shell.

**`Layout`** (`src/components/global/Layout/index.tsx`) — root shell that wraps every page. Uses a CSS grid layout (`h-screen grid grid-cols-[auto_1fr]`):
- Column 1: Sidebar (desktop only, `hidden lg:flex`, `w-56`)
- Column 2: inner grid (`grid-rows-[1fr_auto]`) — main content area on top, Navigation on bottom
- Main element uses `[container-type:size]` enabling `cqh`-based container queries in children
- A skip-to-main-content link is rendered inside a `<header>` landmark before the sidebar

**`Navigation`** (`src/components/global/Navigation/index.tsx`) — mobile-only bottom navigation bar (`lg:hidden`). Renders 4 nav links (Pantry, Shopping, Cooking, Settings) in a `grid-cols-4` row. Hidden on fullscreen pages (`/items/*`, `/settings/tags*`, `/settings/vendors*`, `/settings/recipes*`). On fullscreen pages the component renders `null` — no padding is added to the page.

**`Sidebar`** (`src/components/global/Sidebar/index.tsx`) — desktop-only left sidebar (`hidden lg:flex flex-col w-56`). Same fullscreen-page suppression as Navigation. Shows "Player 1 Inventory" header and 4 nav links with icon + label side-by-side. Active: `text-importance-primary bg-background-elevated`.

## Shared Components

Reusable across multiple features and pages.

**`Toolbar`** (`src/components/shared/Toolbar/index.tsx`) — shared wrapper for list-page toolbars. Provides `bg-background-surface`, `border-b-2 border-accessory-default`, `px-3 py-2`, `flex items-center gap-2`. Used by shopping (cart toolbar), vendor list, and tags pages. Accepts optional `className` for layout overrides (e.g. `justify-between`, `flex-wrap`).

**`AddNameDialog`** (`src/components/shared/AddNameDialog/index.tsx`) — generic name-input dialog used by Tags, Vendors, and Recipes tabs for inline entity creation. Props: `open`, `title`, `submitLabel`, `name`, `placeholder?`, `onNameChange`, `onAdd`, `onClose`. Cancel button uses `neutral-outline`. Name input is `autoFocus`. Submit button is disabled and a validation error is shown when `name` is empty; Enter key is also blocked in that state.

**`LoadingSpinner`** (`src/components/shared/LoadingSpinner/index.tsx`) — centered animated spinner for page-level loading states. No props. Renders `Loader2` icon (`size-8 animate-spin text-foreground-muted`) inside a `flex min-h-[50vh] items-center justify-center` container. Used in pantry page, item detail, and item log tab.

**`EmptyState`** (`src/components/shared/EmptyState/index.tsx`) — centered empty state message used across all list/tab pages. Props: `title: string`, `description: string`, `className?: string`. Renders `text-center py-12 text-foreground-muted` with title on first line and smaller description below. Used in cooking page, settings recipes/vendors lists, detail items tabs, and item detail tags tab.

## Item Components

**`ItemListToolbar`** (`src/components/item/ItemListToolbar/index.tsx`) — unified toolbar for all item list pages (pantry, shopping, tag/vendor/recipe items tabs). Wraps `<Toolbar>` (Row 1) with filter, tags-toggle, sort dropdown, sort-direction, and search buttons; plus collapsible Row 2 (search), Row 3 (`ItemFilters`), Row 4 (`FilterStatus`). Search/filter/UI-visibility state is stored in URL params via `useUrlSearchAndFilters`. Sort preferences are managed by `useSortFilter` (localStorage). Accepts `leading` (left slot), `children` (right slot), `isTagsToggleEnabled`, `onSearchSubmit` (called when Enter pressed with no exact match), `onCreateFromSearch` (same trigger — shows a Create button; pass `hasExactMatch` so the toolbar knows when to suppress it). Escape clears the search value but keeps the input row open.

Note: Fixed nav bars (item detail, vendor detail) use `bg-background-elevated` and are not using this component — they are positioned overlays, not scrolling toolbars.

## Recipe Components

**`CookingControlBar`** (`src/components/recipe/CookingControlBar/index.tsx`) — second-row toolbar for the cooking page. Props: `allExpanded`, `onExpandAll`, `onCollapseAll`. Reads/writes `?sort` (`name|recent|count`), `?dir` (`asc|desc`), `?q` directly via `Route.useSearch()` and `useNavigate()`. Row 1: sort Select, direction button, expand/collapse button, spacer, search toggle. Row 2 (conditional): search input with Create/Clear buttons. `searchVisible` is local state initialized from `!!q`.

## Settings Cards

Self-contained card components for the settings page. Each lives in `src/components/settings/` and accepts no props — all state is read from hooks internally.

**`DataModeCard`** (`src/components/settings/DataModeCard/index.tsx`) — data mode toggle card (local ↔ cloud). No props. Uses `useDataMode`. Renders different content for local vs cloud mode. Cloud mode includes a multi-step disable flow with confirmation dialogs.

**`FamilyGroupCard`** (`src/components/settings/FamilyGroupCard/index.tsx`) — family group management card. No props. Cloud mode only (rendered conditionally by the settings page).

**`ThemeCard`** (`src/components/settings/ThemeCard/index.tsx`) — theme selector card. No props. Uses `useTheme`. Renders Sun/Moon icon and three segmented buttons (Light / System / Dark).

**`LanguageCard`** (`src/components/settings/LanguageCard/index.tsx`) — language selector card. No props. Uses `useLanguage`. Renders Globe icon and a Select dropdown (Auto / English / 繁體中文).

**`ExportCard`** (`src/components/settings/ExportCard/index.tsx`) — data export card. No props. Shown in **both modes**. Calls `exportCloudData(client)` in cloud mode, `exportAllData()` in local mode. Both produce the same `ExportPayload` JSON format. Includes loading state while export is in progress.

**`ImportCard`** (`src/components/settings/ImportCard/index.tsx`) — data import card. No props. Shown in **both modes**. Renders a file picker (`<input type="file" accept=".json">`). Flow: parse JSON → validate ExportPayload shape → detect conflicts → open `ConflictDialog` if conflicts exist → call `importLocalData()` or `importCloudData()` with chosen strategy. Exposes three import strategies: skip, replace, clear.

**`ConflictDialog`** (`src/components/settings/ConflictDialog/index.tsx`) — import conflict resolution dialog. Props: `open`, `conflicts: ConflictSummary`, `onSkip`, `onReplace`, `onClear`, `onClose`. Groups conflicts by entity type, shows names and match reasons (ID/name/both). Three action buttons: Skip conflicts · Replace matches · Clear & import (destructive).

**`SettingsNavCard`** (`src/components/settings/SettingsNavCard/index.tsx`) — navigation link card for settings list items. Props: `icon: LucideIcon`, `label: string`, `description: string`, `to: string`. Renders a TanStack Router Link wrapping a Card with icon, label, description, and ChevronRight.

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
