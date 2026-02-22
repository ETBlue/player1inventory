# Hide Nav Bar on Recipe Settings Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hide the bottom navigation bar on all `/settings/recipes` routes, matching the existing behavior on `/items/`, `/settings/tags`, and `/settings/vendors` routes.

**Architecture:** Two files need one more path added to their `isFullscreenPage` condition. `Navigation.tsx` returns `null` (hides the bar) and `Layout.tsx` removes bottom padding when on a fullscreen page. Both already check for `/items/`, `/settings/tags`, and `/settings/vendors` — we add `/settings/recipes` to both.

**Tech Stack:** React, TanStack Router (`useLocation`)

---

### Task 1: Update Navigation.tsx

**Files:**
- Modify: `src/components/Navigation.tsx:14-20`

**Step 1: Open the file and locate the condition**

The relevant block currently reads:
```tsx
// Hide navigation on fullscreen pages (items, tags, vendors)
const isFullscreenPage =
  location.pathname.startsWith('/items/') ||
  location.pathname.startsWith('/settings/tags') ||
  location.pathname.startsWith('/settings/vendors')
if (isFullscreenPage) {
  return null
}
```

**Step 2: Replace with the extended condition**

```tsx
// Hide navigation on fullscreen pages (items, tags, vendors, recipes)
const isFullscreenPage =
  location.pathname.startsWith('/items/') ||
  location.pathname.startsWith('/settings/tags') ||
  location.pathname.startsWith('/settings/vendors') ||
  location.pathname.startsWith('/settings/recipes')
if (isFullscreenPage) {
  return null
}
```

**Step 3: Verify the app still builds**

Run: `pnpm build`
Expected: No TypeScript or build errors.

**Step 4: Commit**

```bash
git add src/components/Navigation.tsx
git commit -m "feat(nav): hide nav bar on recipe settings pages"
```

---

### Task 2: Update Layout.tsx

**Files:**
- Modify: `src/components/Layout.tsx:11-15`

**Step 1: Open the file and locate the condition**

The relevant lines currently read:
```tsx
const isFullscreenPage =
  location.pathname.startsWith('/items/') ||
  location.pathname.startsWith('/settings/tags') ||
  location.pathname.startsWith('/settings/vendors')

return (
  <div
    className={`min-h-screen bg-background-base ${isFullscreenPage ? '' : 'pb-20'}`}
  >
```

**Step 2: Replace with the extended condition**

```tsx
const isFullscreenPage =
  location.pathname.startsWith('/items/') ||
  location.pathname.startsWith('/settings/tags') ||
  location.pathname.startsWith('/settings/vendors') ||
  location.pathname.startsWith('/settings/recipes')

return (
  <div
    className={`min-h-screen bg-background-base ${isFullscreenPage ? '' : 'pb-20'}`}
  >
```

**Step 3: Verify the app still builds**

Run: `pnpm build`
Expected: No TypeScript or build errors.

**Step 4: Commit**

```bash
git add src/components/Layout.tsx
git commit -m "feat(layout): remove bottom padding on recipe settings pages"
```

---

### Task 3: Manual Verification

**Step 1: Start the dev server**

Run: `pnpm dev`

**Step 2: Verify nav bar is hidden on the following routes**

- `/settings/recipes` — recipes list page
- `/settings/recipes/new` — new recipe page
- `/settings/recipes/<any-id>` — recipe detail page

Expected: Bottom nav bar does not appear. No extra bottom padding.

**Step 3: Verify nav bar still shows on**

- `/` (pantry)
- `/shopping`
- `/cooking`
- `/settings`

Expected: Bottom nav bar visible with correct padding.
