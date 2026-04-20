# Bug: Shelf Info Tab Shows Stale Form After Save + Return

**Date:** 2026-04-20
**Branch:** fix/shelf-info-stale-form

## Bug Description

Settings > Shelf Info tab shows stale/old form content after the user:
1. Edits and saves the form
2. Navigates away (e.g. to list view)
3. Returns to the Shelf Info tab

Expected: updated form content
Actual: pre-save form content

## Root Cause

In `ShelfInfoTab` (`apps/web/src/routes/settings/shelves/$shelfId/index.tsx`), `handleSave()` calls `goBack()` immediately after `updateShelf.mutate()` — it does not wait for the mutation to succeed.

Because navigation fires before the mutation's `onSuccess` handler runs, the TanStack Query cache is invalidated *after* the component has already unmounted. When the user returns to the tab, `useShelfQuery` may return stale cached data before the refetch completes. The `useEffect` that initializes local state (`name`, `sortBy`, `sortDir`) fires with this stale data, so the form shows the old values.

The fix: pass `onSuccess: goBack` as a per-call option to `updateShelf.mutate()` so navigation happens only after the DB write and cache invalidation complete.

## Fix Applied

Moved `goBack()` into per-call `onSuccess` callbacks on both `updateShelf.mutate()` calls in `handleSave()`. Removed the standalone `goBack()` at the end of the function.

File: `apps/web/src/routes/settings/shelves/$shelfId/index.tsx`, lines 91 and 96.

## Test Added

Two regression tests added to `apps/web/src/routes/settings/shelves/$shelfId/index.test.tsx` in a `describe('navigation happens only after mutation succeeds')` block:

1. **Regression guard:** mocks `useUpdateShelfMutation` so `mutate` never calls `onSuccess` → asserts the form stays visible (navigation did NOT happen)
2. **Happy path:** mocks `useUpdateShelfMutation` so `mutate` immediately calls `onSuccess` → asserts the form disappears (navigation DID happen)

## PR / Commit

*TBD*
