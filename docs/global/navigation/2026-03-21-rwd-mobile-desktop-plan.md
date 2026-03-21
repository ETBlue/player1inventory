# Implementation Plan: RWD — Mobile + Desktop Layout

**Date:** 2026-03-21
**Branch:** `feature/rwd-mobile-desktop`
**Design doc:** `2026-03-21-rwd-mobile-desktop-design.md`

---

## Goal

Add responsive desktop layout at `lg:` (1024px+) breakpoint:
- Fixed left sidebar replaces bottom nav on desktop (hidden on fullscreen/detail pages)
- Icon-only buttons expand to icon+text on desktop
- Mobile layout unchanged

---

## Scope

### Icon+Text applies to:
- Toolbar action buttons: sort direction, tags toggle, filter, search (ItemListToolbar)
- CookingControlBar buttons: sort direction, expand/collapse, search toggle
- Add item button in pantry toolbar
- Back (ArrowLeft) buttons in fullscreen detail pages
- Edit (Pencil) button in tag type cards

### Icon-only stays icon-only (stepper controls — adding text breaks compact layout):
- ±1 servings buttons in `cooking.tsx`
- ±quantity buttons in `ItemCard`

---

## Steps

### Step 1 — Create `Sidebar` component

**File:** `src/components/Sidebar/index.tsx`

Create a new component that mirrors `Navigation`'s visibility logic but renders as a fixed left sidebar:

- **Visibility:** Same fullscreen-page exclusion as `Navigation` (`/items/*`, `/settings/tags*`, `/settings/vendors*`, `/settings/recipes*`). Returns `null` on those pages.
- **Root element:** `<nav className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-56 bg-background-surface border-r border-accessory-default z-10">`
- **Header section:** App name text "Player 1 Inventory" with padding, border-bottom
- **Nav links:** Same `navItems` array as `Navigation`, each link renders `<Icon className="h-5 w-5" /> <span>Label</span>` side by side. Active: `text-primary bg-background-elevated`, inactive: `text-foreground-muted hover:bg-background-elevated`

**File:** `src/components/Sidebar/index.stories.tsx`

Stories:
- `Default` — on a main tab page (active: Pantry)
- `CartActive` — active: Cart
- `CookingActive` — active: Cooking
- `SettingsActive` — active: Settings

Note: wrap each story in a `MemoryRouter`-equivalent (TanStack Router `createMemoryHistory`) or use a mock location decorator.

**File:** `src/components/Sidebar/index.stories.test.tsx`

Smoke test: renders nav links, finds "Pantry" text, assert it's visible.

**Quality gate:** `pnpm lint && pnpm build && pnpm build-storybook`

---

### Step 2 — Update `Layout` and `Navigation`

**File:** `src/components/Navigation/index.tsx`
- Add `lg:hidden` to the outer `<nav>` element

**File:** `src/components/Layout/index.tsx`
- Import and render `<Sidebar />`
- Add sidebar offset to main wrapper: `lg:ml-56` on non-fullscreen pages only
- Remove bottom padding on desktop: change `pb-20` → `pb-20 lg:pb-0` (non-fullscreen pages only)
- Remove `container` from `<main>` → `w-full` (full remaining width on desktop)

Result:
```tsx
export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const isFullscreenPage = /* same logic */

  return (
    <div className={cn(
      'min-h-screen bg-background-base',
      !isFullscreenPage && 'pb-20 lg:pb-0 lg:ml-56',
    )}>
      <Sidebar />
      <main className="w-full">{children}</main>
      <Navigation />
    </div>
  )
}
```

**Quality gate:** `pnpm lint && pnpm build && pnpm build-storybook`

---

### Step 3 — Icon+Text buttons in `ItemListToolbar`

**File:** `src/components/item/ItemListToolbar/index.tsx`

Apply the icon+text pattern to 4 buttons:

1. **Sort direction button** (ArrowUp/ArrowDown)
   - Add `className="lg:w-auto lg:px-3"`
   - Add `<span className="hidden lg:inline ml-1">{sortDirection === 'asc' ? 'Asc' : 'Desc'}</span>`

2. **Tags toggle button**
   - Add `className="lg:w-auto lg:px-3"`
   - Add `<span className="hidden lg:inline ml-1">Tags</span>`

3. **Filter toggle button**
   - Add `className="lg:w-auto lg:px-3"`
   - Add `<span className="hidden lg:inline ml-1">Filters</span>`

4. **Search toggle button**
   - Add `className="lg:w-auto lg:px-3"`
   - Add `<span className="hidden lg:inline ml-1">Search</span>`

**Quality gate:** `pnpm lint && pnpm build && pnpm build-storybook`

---

### Step 4 — Icon+Text buttons in `CookingControlBar`

**File:** `src/components/recipe/CookingControlBar/index.tsx`

First read the file to identify icon-only buttons, then apply the same pattern:

1. **Sort direction button** (ArrowUp/ArrowDown) — add text "Asc"/"Desc"
2. **Expand/Collapse all button** (ChevronDown/ChevronUp or similar) — add text "Expand"/"Collapse"
3. **Search toggle button** (Search/X) — add text "Search"

**Quality gate:** `pnpm lint && pnpm build && pnpm build-storybook`

---

### Step 5 — Icon+Text buttons in route pages

Apply the icon+text pattern to the following files (read each before editing):

**`src/routes/index.tsx` (pantry page)**
- `Add item` button (`<Plus />`, line ~216): add "Add" label text

**Fullscreen detail pages — Back buttons (ArrowLeft):**
- `src/routes/items/$id.tsx` (line ~109)
- `src/routes/settings/tags/$id.tsx` (line ~98)
- `src/routes/settings/tags/index.tsx` (line ~420)
- `src/routes/settings/vendors/$id.tsx` (line ~98)
- `src/routes/settings/vendors/index.tsx` (line ~46)
- `src/routes/settings/vendors/new.tsx` (line ~33)
- `src/routes/settings/recipes/$id.tsx` (line ~98)
- `src/routes/settings/recipes/index.tsx` (line ~29)
- `src/routes/settings/recipes/new.tsx` (line ~40)

For each back button: add `className="lg:w-auto lg:px-3"` + `<span className="hidden lg:inline ml-1">Back</span>` (use `t('common.back')` where i18n is already in use in that file).

**`src/routes/settings/tags/index.tsx` — Edit tag type button (Pencil, line ~200)**
- Add "Edit" label text (use `t('common.edit')` if key exists, otherwise hardcode "Edit")

**Quality gate:** `pnpm lint && pnpm build && pnpm build-storybook`

---

### Step 6 — Final verification

Run the full quality gate:

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

Then run E2E tests for all affected areas:
```bash
pnpm test:e2e --grep "pantry|shopping|cooking|settings|tags|vendors|recipes|items"
```

Fix any failures before finishing the branch.

---

## Files Changed Summary

| File | Step | Type |
|------|------|------|
| `src/components/Sidebar/index.tsx` | 1 | New |
| `src/components/Sidebar/index.stories.tsx` | 1 | New |
| `src/components/Sidebar/index.stories.test.tsx` | 1 | New |
| `src/components/Navigation/index.tsx` | 2 | Modify |
| `src/components/Layout/index.tsx` | 2 | Modify |
| `src/components/item/ItemListToolbar/index.tsx` | 3 | Modify |
| `src/components/recipe/CookingControlBar/index.tsx` | 4 | Modify |
| `src/routes/index.tsx` | 5 | Modify |
| `src/routes/items/$id.tsx` | 5 | Modify |
| `src/routes/settings/tags/index.tsx` | 5 | Modify |
| `src/routes/settings/tags/$id.tsx` | 5 | Modify |
| `src/routes/settings/vendors/index.tsx` | 5 | Modify |
| `src/routes/settings/vendors/$id.tsx` | 5 | Modify |
| `src/routes/settings/vendors/new.tsx` | 5 | Modify |
| `src/routes/settings/recipes/index.tsx` | 5 | Modify |
| `src/routes/settings/recipes/$id.tsx` | 5 | Modify |
| `src/routes/settings/recipes/new.tsx` | 5 | Modify |
