# Manage Links in Filter Dropdowns Design

**Date:** 2026-03-05
**Status:** Approved

## Problem

The vendor and recipe dropdowns in `ItemFilters` have no way to navigate to their management pages. Users who want to add or edit vendors/recipes must leave the filter area and navigate manually.

The shopping page already has a "Manage vendors..." option in its vendor `<Select>`, but it has no icon, making it visually inconsistent with the other manage options we're adding.

## Goal

1. Add a "Manage" link (with icon) at the bottom of the vendor dropdown in `ItemFilters` → `/settings/vendors`
2. Add a "Manage" link (with icon) at the bottom of the recipe dropdown in `ItemFilters` → `/settings/recipes`
3. Add a `<Pencil>` icon to the existing "Manage vendors..." `SelectItem` in the shopping page for visual consistency

All three use the same icon (`Pencil`, `h-4 w-4`) and text style (`text-xs` or inline), aligned with `flex items-center gap-1.5`.

## Design

### ItemFilters vendor and recipe dropdowns

In `src/components/ItemFilters.tsx`, both the vendor and recipe `<DropdownMenuContent>` blocks get a trailing separator + `<DropdownMenuItem asChild>` wrapping a TanStack `<Link>`:

```tsx
<DropdownMenuSeparator />
<DropdownMenuItem asChild>
  <Link to="/settings/vendors" className="flex items-center gap-1.5">
    <Pencil className="h-4 w-4" />
    <span className="text-xs">Manage</span>
  </Link>
</DropdownMenuItem>
```

Recipe uses `to="/settings/recipes"`.

`asChild` merges `DropdownMenuItem` behavior onto the `<Link>` element, avoiding a nested `<div><a>` structure.

The separator always renders. The "Clear" separator+item renders only when a selection exists (existing behavior, unchanged). Bottom of dropdown when selection active:

```
──────────
✕ Clear
──────────
✎ Manage
```

### Shopping page vendor select

In `src/routes/shopping.tsx`, line 253, add icon to the existing `SelectItem`:

```tsx
<SelectItem value="__manage__" className="flex items-center gap-1.5">
  <Pencil className="h-4 w-4" />
  <span>Manage vendors...</span>
</SelectItem>
```

`Pencil` must be added to the imports from `lucide-react`.

## Deferred

Replacing the shopping page `<Select>` with `<DropdownMenu>` for component consistency was considered but deferred. The `Select` provides free current-selection display via `<SelectValue>`, which would require manual implementation in a `DropdownMenu` trigger. The shopping vendor is also single-select (a pre-scope filter) while `ItemFilters` vendor is multi-select, so the behavioral models differ regardless of component choice.

## Scope

- Modify: `src/components/ItemFilters.tsx`
- Modify: `src/routes/shopping.tsx`
- `Pencil` already imported in `ItemFilters.tsx`; needs adding to `shopping.tsx`
- No logic changes, no new components
