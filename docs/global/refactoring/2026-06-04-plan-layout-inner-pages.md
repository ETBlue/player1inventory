# Implementation Plan: LayoutInnerPages

**Date:** 2026-06-04
**Branch:** `refactor/layout-inner-pages`
**Status:** ⚠️ Partial — item pages migrated; tags/vendors/recipes/shelves deferred to follow-up PR

## Goal

Extract a shared `LayoutInnerPages` component for all level 2+ pages (entity detail + "new entity" pages). These pages share a fixed top bar (back button, icon, title, and optional right-side content) and a scrollable main area. Currently each page manually duplicates the CSS classes and markup — this component eliminates that repetition.

## Scope (this branch)

- `LayoutInnerPages` component (create)
- Item detail page (`/items/$id`) — migrate
- Item new page (`/items/new`) — migrate
- Other entity pages (tags, vendors, recipes, shelves) — **deferred to follow-up PR** after item pages confirmed working

## Component API

```ts
interface LayoutInnerPagesProps {
  title: ReactNode          // page title
  icon?: ReactNode          // optional entity icon (e.g. Tags, Store, CookingPot)
  onBack?: () => void       // defaults to goBack() from useAppNavigation('/'); override for dirty-state pages
  toolbarEnd?: ReactNode    // anything in the right side of the top bar (tabs, action buttons, etc.)
  children: ReactNode       // scrollable main content
}
```

### Design decisions

- **Back button icon is hardcoded** (`ArrowLeft`) for consistency — not a prop
- **`toolbarEnd`** is a single flexible slot for whatever belongs at the right end of the toolbar; callers compose tabs, action buttons, or any combination
- **Tabs use the existing `-mb-[2px]` trick** — tab links are placed inside `toolbarEnd` and visually overlay the Toolbar's bottom border, so the active tab border replaces it

## Implementation Steps

### Step 1 — Write failing tests for `LayoutInnerPages` (TDD red)

Create `src/components/shared/LayoutInnerPages/LayoutInnerPages.test.tsx`.

Test cases:
- Renders page title
- Renders back button with `t('common.goBack')` aria-label
- Calls `onBack` when back button clicked (when provided)
- Calls `goBack` when back button clicked (when `onBack` is not provided)
- Renders `icon` when provided
- Does not render icon slot when `icon` not provided
- Renders `toolbarEnd` content when provided
- `children` renders in the scrollable area

### Step 2 — Implement `LayoutInnerPages` (TDD green)

Create:
- `src/components/shared/LayoutInnerPages/LayoutInnerPages.tsx`
- `src/components/shared/LayoutInnerPages/index.ts`

Structure:
```tsx
<div className="h-screen grid grid-rows-[auto_1fr]">
  <Toolbar className="w-[100cqw] py-0">
    <Button variant="neutral-ghost" size="icon" className="lg:w-auto lg:mr-3"
      onClick={onBack ?? goBack} aria-label={t('common.goBack')}>
      <ArrowLeft />
      <span className="hidden lg:inline">{t('common.goBack')}</span>
    </Button>
    {icon}
    <h1 className="text-base font-regular truncate flex-1 capitalize">{title}</h1>
    {toolbarEnd}
  </Toolbar>
  <div className="overflow-y-auto [container-type:size]">
    {children}
  </div>
</div>
```

### Step 3 — Create Storybook stories

Create `src/components/shared/LayoutInnerPages/LayoutInnerPages.stories.tsx`.

Stories:
- `Default` — title only, no icon, no toolbarEnd
- `WithIcon` — title + icon (e.g. Tags icon)
- `WithTabs` — title + 3 tab links in toolbarEnd (one active)
- `WithActions` — title + right-aligned action button in toolbarEnd
- `WithTabsAndActions` — icon + title + both tabs and actions in toolbarEnd
- `WithScrollableContent` — long content to confirm scroll behavior

Create `src/components/shared/LayoutInnerPages/LayoutInnerPages.stories.test.tsx`.

### Step 4 — Migrate item detail page

Update `src/routes/items/$id.tsx`:
- Replace `<div className="h-screen grid grid-rows-[auto_1fr]">` + `<Toolbar>` + scroll div with `<LayoutInnerPages>`
- Pass `title={item.name}`, `onBack={handleBackClick}`
- Pass `toolbarEnd={<>...5 tab links...</>}` — tab links keep their existing className with `-mb-[2px]`
- Remove manual `<Toolbar>` import; keep `AlertDialog` (dirty-state dialog stays in page — not part of layout)
- `<Outlet key={router.state.location.pathname} />` stays as `children`

### Step 5 — Migrate item new page

Update `src/routes/items/new.tsx`:
- Replace fixed `<header>` + `min-h-screen` + `pt-16` wrapper with `<LayoutInnerPages>`
- Pass `title={t('items.newButton')}` — add `items.newButton` i18n key to `en.json` and `tw.json` (consistent with `settings.vendors.newButton` / `settings.recipes.newButton` pattern)
- No `onBack` (defaults to `goBack()`), no `toolbarEnd`
- `<ItemForm>` + wrapping div becomes `children`

### Step 6 — Run quality gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
pnpm test:e2e --grep "items|a11y"
```

## Files Created / Modified

### Created
- `src/components/shared/LayoutInnerPages/LayoutInnerPages.tsx`
- `src/components/shared/LayoutInnerPages/index.ts`
- `src/components/shared/LayoutInnerPages/LayoutInnerPages.stories.tsx`
- `src/components/shared/LayoutInnerPages/LayoutInnerPages.stories.test.tsx`
- `src/components/shared/LayoutInnerPages/LayoutInnerPages.test.tsx`

### Modified
- `src/routes/items/$id.tsx` — use LayoutInnerPages
- `src/routes/items/new.tsx` — use LayoutInnerPages; fix hardcoded "New Item" → `t('items.newButton')`
- `src/i18n/locales/en.json` — add `items.newButton: "New Item"`
- `src/i18n/locales/tw.json` — add `items.newButton` translation
- `src/components/CLAUDE.md` — document LayoutInnerPages in Shared Components section
- `docs/INDEX.md` — mark plan as Done

## Notes

- The `AlertDialog` (discard confirmation) stays in `$id.tsx` — it is page-specific
- The `ItemLayoutProvider` wrapper stays in `$id.tsx`
- `new.tsx` currently uses `Link to="/"` for back — wrong; `goBack()` is correct (fixed by this migration)
- `new.tsx` has hardcoded "New Item" — fixed to `t('items.newButton')` with new i18n key
