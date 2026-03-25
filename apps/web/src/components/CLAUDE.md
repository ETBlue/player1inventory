# Shared Components

**`Toolbar`** (`src/components/Toolbar/index.tsx`) — shared wrapper for list-page toolbars. Provides `bg-background-surface`, `border-b-2 border-accessory-default`, `px-3 py-2`, `flex items-center gap-2`. Used by shopping (cart toolbar), vendor list, and tags pages. Accepts optional `className` for layout overrides (e.g. `justify-between`, `flex-wrap`).

**`AddNameDialog`** (`src/components/AddNameDialog/index.tsx`) — generic name-input dialog used by Tags, Vendors, and Recipes tabs for inline entity creation. Props: `open`, `title`, `submitLabel`, `name`, `placeholder?`, `onNameChange`, `onAdd`, `onClose`. Cancel button uses `neutral-outline`. Name input is `autoFocus`.

**`LoadingSpinner`** (`src/components/LoadingSpinner/index.tsx`) — centered animated spinner for page-level loading states. No props. Renders `Loader2` icon (`size-8 animate-spin text-foreground-muted`) inside a `flex min-h-[50vh] items-center justify-center` container. Used in pantry page, item detail, and item log tab.

**`EmptyState`** (`src/components/EmptyState/index.tsx`) — centered empty state message used across all list/tab pages. Props: `title: string`, `description: string`, `className?: string`. Renders `text-center py-12 text-foreground-muted` with title on first line and smaller description below. Used in cooking page, settings recipes/vendors lists, detail items tabs, and item detail tags tab.

**`ItemListToolbar`** (`src/components/item/ItemListToolbar/index.tsx`) — unified toolbar for all item list pages (pantry, shopping, tag/vendor/recipe items tabs). Wraps `<Toolbar>` (Row 1) with filter, tags-toggle, sort dropdown, sort-direction, and search buttons; plus collapsible Row 2 (search), Row 3 (`ItemFilters`), Row 4 (`FilterStatus`). Search/filter/UI-visibility state is stored in URL params via `useUrlSearchAndFilters`. Sort preferences are managed by `useSortFilter` (localStorage). Accepts `leading` (left slot), `children` (right slot), `isTagsToggleEnabled`, `onSearchSubmit` (called when Enter pressed with no exact match), `onCreateFromSearch` (same trigger — shows a Create button; pass `hasExactMatch` so the toolbar knows when to suppress it). Escape clears the search value but keeps the input row open.

Note: Fixed nav bars (item detail, vendor detail) use `bg-background-elevated` and are not using this component — they are positioned overlays, not scrolling toolbars.

**`Sidebar`** (`src/components/Sidebar/index.tsx`) — fixed left navigation sidebar shown at `lg:` (1024px+). Same visibility rules as `Navigation` — hidden on fullscreen pages (`/items/*`, `/settings/tags*`, `/settings/vendors*`, `/settings/recipes*`). Shows "Player 1 Inventory" header and 4 nav links (Pantry, Shopping, Cooking, Settings) with icon + label side-by-side. Active: `text-primary bg-background-elevated`. `Layout` adds `lg:ml-56` offset to the content area when the sidebar is visible.

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
