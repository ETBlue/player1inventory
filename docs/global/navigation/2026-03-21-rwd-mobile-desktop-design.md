# Design: RWD — Mobile + Desktop Layout

**Date:** 2026-03-21
**Branch:** `feature/rwd-mobile-desktop`
**Status:** Planning

---

## Overview

The app is currently mobile-only: fixed bottom navigation, full-width cards, no responsive breakpoints. On desktop (≥1024px wide screens) the UI looks stretched and awkward. This design adds progressive desktop enhancement while keeping mobile unchanged.

---

## Breakpoint

`lg` (1024px+) triggers all desktop-specific layout changes. Everything below 1024px is unchanged.

---

## Desktop Layout Structure

```
┌─────────────────────────────────────────────────┐
│  Sidebar (w-56, fixed left, bg-background-surface) │
│  ┌─────────────────────────────────────────────┐  │
│  │  Player 1 Inventory  (header)               │  │
│  │                                             │  │
│  │  🏠  Pantry                                 │  │
│  │  🛒  Cart                                   │  │
│  │  🍳  Use                                    │  │
│  │  ⚙️   Settings                               │  │
│  └─────────────────────────────────────────────┘  │
│  Main content area (ml-56, full remaining width)   │
│  [toolbars, lists, detail pages — same as mobile]  │
└─────────────────────────────────────────────────┘
```

---

## Component Changes

### New: `Sidebar` (`src/components/Sidebar/index.tsx`)

- Renders on desktop only: `hidden lg:flex`
- Fixed left column: `fixed left-0 top-0 bottom-0 w-56`
- Surface background with right border: `bg-background-surface border-r border-accessory-default`
- **Visibility rule:** Same as `Navigation` — hidden on fullscreen pages (`/items/*`, `/settings/tags*`, `/settings/vendors*`, `/settings/recipes*`)
- **Header:** App name "Player 1 Inventory" at top
- **Nav items:** Same 4 items as bottom nav (Pantry, Cart, Use, Settings), each showing icon + label side by side
- **Active state:** `text-primary`, inactive: `text-foreground-muted`

### Modified: `Navigation` (`src/components/Navigation/index.tsx`)

- Add `lg:hidden` to the outer `<nav>` wrapper so bottom nav disappears on desktop

### Modified: `Layout` (`src/components/Layout/index.tsx`)

- Add `<Sidebar />` inside the layout div
- Wrap `<main>` offset: add `lg:ml-56` on non-fullscreen pages (sidebar offset)
- Bottom padding: `pb-20` stays on mobile, add `lg:pb-0` on desktop
- Remove `container` class from `<main>` → use `w-full` so content fills the remaining width

### Modified: All icon-only buttons (`size="icon"`) on `lg:`

Icon-only buttons expand to show label text on desktop. Pattern applied to each affected button:

```tsx
// Before
<Button size="icon" variant="neutral-ghost" aria-label="Toggle filters">
  <Filter />
</Button>

// After
<Button size="icon" variant="neutral-ghost" aria-label="Toggle filters"
  className="lg:w-auto lg:px-3">
  <Filter />
  <span className="hidden lg:inline ml-1">Filters</span>
</Button>
```

**Affected components:**
- `ItemListToolbar` — sort direction, tags toggle, filter toggle, search toggle
- `CookingControlBar` — sort direction, expand/collapse, search toggle
- Individual route pages — add/create buttons, any remaining icon-only buttons

---

## Fullscreen Pages (detail pages)

Fullscreen pages (`/items/*`, `/settings/tags*`, `/settings/vendors*`, `/settings/recipes*`) behave identically on mobile and desktop:
- No sidebar rendered
- No bottom nav rendered
- Content takes full viewport width
- Icon+text buttons still apply (the `lg:` class on buttons works independently)

---

## Design Token Usage

No new tokens needed. Uses existing tokens:
- `bg-background-surface` — sidebar background
- `border-accessory-default` — sidebar right border
- `text-primary` / `text-foreground-muted` — active/inactive nav items

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/components/Sidebar/index.tsx` | **New** — sidebar component |
| `src/components/Sidebar/index.stories.tsx` | **New** — Storybook stories |
| `src/components/Sidebar/index.stories.test.tsx` | **New** — smoke test |
| `src/components/Layout/index.tsx` | **Modify** — add sidebar, offset, padding |
| `src/components/Navigation/index.tsx` | **Modify** — add `lg:hidden` |
| `src/components/item/ItemListToolbar/index.tsx` | **Modify** — icon+text buttons |
| `src/components/recipe/CookingControlBar/index.tsx` | **Modify** — icon+text buttons |
| Various route files | **Modify** — remaining icon-only buttons |
