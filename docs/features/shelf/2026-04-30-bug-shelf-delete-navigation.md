---
title: Bug — Shelf delete navigates to detail page instead of list, shelf still visible
date: 2026-04-30
area: shelf / settings
---

## Bug Description

User is on `/shelves/:id`, clicks the settings icon → `/settings/shelves/:id`, then deletes the shelf.

**Expected**: navigates to `/shelves/` and the deleted shelf is gone from the list.
**Actual**: navigates to `/shelves/:id` (the detail page), and the deleted shelf still appears in the list.

## Root Cause

Two issues combine to produce the bug:

1. **Race condition in delete handler** (`settings/shelves/$shelfId/index.tsx` line 200–201):
   ```ts
   deleteShelf.mutate(shelf.id)
   goBack()
   ```
   `goBack()` fires immediately — before the mutation resolves — so the query cache may not have been invalidated yet when the list renders.

2. **Wrong navigation target**: `goBack()` returns to the *previous* history entry, which is `/shelves/:id` (the detail page the user came from). After a deletion, the correct destination is `/shelves/` (the list). Since the shelf no longer exists, landing on its detail page shows a stale or empty view.

## Fix Applied

Three changes in commit `4374019`:

1. **`apps/web/src/routes/settings/shelves/$shelfId/index.tsx`**: Changed `onDelete` handler to pass an `onSuccess` callback to `deleteShelf.mutate`. Navigation now fires inside `onSuccess` (after mutation resolves) via `navigate({ to: '/shelves' })` instead of calling `goBack()` immediately after `mutate`. Added `useNavigate` import from `@tanstack/react-router`. `goBack` is kept because it's still used in the `handleSave` handler.

2. **`apps/web/src/components/shared/DeleteButton/DeleteButton.tsx`**: Added `type="button"` to the trigger `Button` to prevent it from accidentally submitting ancestor `<form>` elements (which would short-circuit the alert dialog interaction).

## Test Added

`apps/web/src/routes/settings/shelves/$shelfId/index.test.tsx` — "user can delete a shelf and navigate to the shelf list" (in `describe('delete navigates to shelf list after mutation succeeds')`):

- Mocks `useDeleteShelfMutation` to capture the `mutate` call without resolving
- Clicks "Delete shelf" trigger + confirms the alert dialog
- Asserts `mutate` is called with `(shelf.id, { onSuccess: Function })` (the callback)
- Asserts navigation has NOT happened yet (form still visible)
- Manually fires `onSuccess` and asserts navigation happens (form gone)

## PR / Commit

Commit `4374019` — part of feature branch `feature/shelf-data-ops`
