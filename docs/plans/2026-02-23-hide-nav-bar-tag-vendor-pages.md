# Hide Nav Bar on Tag and Vendor Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hide the bottom navigation bar on all `/settings/tags` and `/settings/vendors` routes, matching the existing behavior on `/items/` routes.

**Architecture:** Two files need the same path-based condition extended. `Navigation.tsx` returns `null` (hides the bar) and `Layout.tsx` removes bottom padding when on a "fullscreen" page. Both currently only check for `/items/` — we extend to also check `/settings/tags` and `/settings/vendors`, and rename the variable to `isFullscreenPage` for clarity.

**Tech Stack:** React, TanStack Router (`useLocation`)

---

### Task 1: Update Navigation.tsx

**Files:**
- Modify: `src/components/Navigation.tsx:14-18`

**Step 1: Open the file and locate the condition**

The relevant block is at lines 14–18:
```tsx
// Hide navigation on item detail and new item pages
const isItemPage = location.pathname.startsWith('/items/')
if (isItemPage) {
  return null
}
```

**Step 2: Replace with the extended condition**

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

**Step 3: Verify the app still builds**

Run: `pnpm build`
Expected: No TypeScript or build errors.

**Step 4: Commit**

```bash
git add src/components/Navigation.tsx
git commit -m "feat(nav): hide nav bar on tag and vendor pages"
```

---

### Task 2: Update Layout.tsx

**Files:**
- Modify: `src/components/Layout.tsx:11,15`

**Step 1: Open the file and locate the condition**

The relevant lines:
```tsx
const isItemPage = location.pathname.startsWith('/items/')

return (
  <div
    className={`min-h-screen bg-background-base ${isItemPage ? '' : 'pb-20'}`}
  >
```

**Step 2: Replace with the extended condition**

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

**Step 3: Verify the app still builds**

Run: `pnpm build`
Expected: No TypeScript or build errors.

**Step 4: Commit**

```bash
git add src/components/Layout.tsx
git commit -m "feat(layout): remove bottom padding on tag and vendor pages"
```

---

### Task 3: Manual Verification

**Step 1: Start the dev server**

Run: `pnpm dev`

**Step 2: Verify nav bar is hidden on the following routes**

- `/settings/tags` — tags list page
- `/settings/tags/<any-id>` — tag detail page
- `/settings/vendors` — vendors list page
- `/settings/vendors/<any-id>` — vendor detail page

Expected: Bottom nav bar does not appear. No extra bottom padding.

**Step 3: Verify nav bar still shows on**

- `/` (pantry)
- `/shopping`
- `/settings`

Expected: Bottom nav bar visible with correct padding.
