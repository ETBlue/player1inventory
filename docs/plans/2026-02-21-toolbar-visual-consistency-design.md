# Toolbar Visual Consistency Design

**Date:** 2026-02-21
**Branch:** feature/toolbar-visual-consistency

## Goal

Make the top bars of the pantry, shopping, vendor list, and tags pages share the same visual style: a surface-level background, bottom border, and consistent padding.

## Scope

Four list-page toolbars need to look the same. Fixed nav bars (item detail, vendor detail) are already visually consistent with each other and are out of scope.

| Page | File | Status |
|------|------|--------|
| Pantry | `src/components/PantryToolbar.tsx` | Already styled — refactor to use shared `Toolbar` |
| Shopping | `src/routes/shopping.tsx` | Missing border, background, padding |
| Vendor list | `src/routes/settings/vendors/index.tsx` | Missing border, background, padding |
| Tags | `src/routes/settings/tags.tsx` | Missing border, background, padding |

## Shared `Toolbar` Component

Create `src/components/Toolbar.tsx` — a minimal styled wrapper:

```tsx
interface ToolbarProps {
  children: React.ReactNode
  className?: string
}

export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div className={cn("flex items-center gap-2 px-3 py-2 border-b-2 border-accessory-default bg-background-surface", className)}>
      {children}
    </div>
  )
}
```

## Per-Page Changes

### PantryToolbar (`src/components/PantryToolbar.tsx`)
- Replace outer `<div className="flex items-center gap-2 px-3 py-2 border-b-2 border-accessory-default bg-background-surface">` with `<Toolbar>`
- Remove the now-duplicated classes

### Shopping (`src/routes/shopping.tsx`)
- Replace `<div className="flex items-center gap-2 flex-wrap">` with `<Toolbar className="flex-wrap">`

### Vendor list (`src/routes/settings/vendors/index.tsx`)
- Replace `<div className="flex items-center justify-between">` with `<Toolbar className="justify-between">`
- Inner left-side div stays unchanged

### Tags (`src/routes/settings/tags.tsx`)
- Replace `<div className="flex items-center gap-2">` with `<Toolbar>`

## Design Tokens Used

- `bg-background-surface` — card/list-item surface layer (95% lightness in light mode, 10% in dark)
- `border-b-2 border-accessory-default` — consistent bottom border for all toolbars
- `px-3 py-2` — standard toolbar padding

## Out of Scope

- Fixed nav bars on item detail (`/items/$id`) and vendor detail (`/settings/vendors/$id`) — already styled consistently with `bg-background-elevated`
- Settings home page — no toolbar needed
- Storybook story for `Toolbar` — it's a trivial wrapper; stories live at the page/component level
