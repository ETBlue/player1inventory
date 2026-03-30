# Design: TemplateItemsBrowser Toolbar — Match Pantry Visual

**Date:** 2026-03-30
**Feature area:** Onboarding — Phase B

## Goal

Align the `TemplateItemsBrowser` header with the pantry page toolbar: same background color, same border weight, and the same Tags / Filters / Search toggle button pattern.

## Changes

Single file: `apps/web/src/components/onboarding/TemplateItemsBrowser/index.tsx`

### Row 1 — `<Toolbar>` (replaces hand-rolled div)

```
← Back  |  N selected  Tags  Filters  Search  [flex-1]  Select all  Clear
```

- Replace `div.bg-background.border-b.border-border.px-4.py-3.space-y-3` with the shared `<Toolbar>` component.
- `<Toolbar>` provides `bg-background-surface border-b-2 border-accessory-default` automatically.
- **Tags / Filters / Search** — icon+label toggle buttons. `neutral` variant when active, `neutral-ghost` when inactive. Same sizing and className as `ItemListToolbar` (`size="icon" className="lg:w-auto lg:px-3"`).
- **Select all / Clear** — remain on the far right, pushed by `flex-1` spacer.
- All three toggles start **closed** (`false`) by default.

### Row 2 — Filters (conditional on `filtersVisible`)

- `h-px bg-accessory-default` divider, then `<ItemFilters>` in controlled mode.
- Identical to the `isFiltersVisible` block in `ItemListToolbar`.

### Row 3 — Search (conditional on `searchVisible`)

- Container: `flex items-center gap-2 border-t border-accessory-default px-3`
- `<Input>` with `border-none shadow-none bg-transparent h-auto py-2 text-sm` — matches `ItemListToolbar` exactly.
- X clear button (`size="icon" variant="neutral-ghost" className="h-6 w-6 shrink-0"`) when search is non-empty.
- No Create button.

### Row 4 — Filter status (conditional on `isFiltered`)

- Only visible when search is non-empty or any tag filter is active.
- Shows "Showing X of Y" + "× Clear filters" button.
- Same content as today, but hidden when nothing is filtered.

### New local state

| State | Type | Default | Purpose |
|---|---|---|---|
| `tagsVisible` | `boolean` | `false` | Pass `showTags` prop to `ItemCard` |
| `filtersVisible` | `boolean` | `false` | Show/hide ItemFilters row |
| `searchVisible` | `boolean` | `false` | Show/hide search input row |

Existing `filterState` and `search` state are unchanged.

## What does NOT change

- `ItemFilters` controlled-mode props (`hideVendorFilter`, `hideRecipeFilter`, `hideEditTagsLink`)
- Tag filtering logic (`filterState`, ancestor-chain matching)
- Selection handlers (`handleSelectAllVisible`, `handleClearSelection`)
- `ItemCard` rendering (only `showTags` prop added)
- No new files, no new components
