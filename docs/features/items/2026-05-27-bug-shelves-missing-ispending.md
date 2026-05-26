# Bug: Shelves Page — +/- Buttons Missing Loading State

## Bug Description

On the shelves page (`/shelves/:shelfId`), clicking the +/- buttons on ItemCard does not show a loading spinner while the mutation is in flight.

## Root Cause

`apps/web/src/routes/shelves/$shelfId.tsx` renders `ItemCard` with `onAmountChange` but:
1. Has no `pendingItemIds: Set<string>` state to track in-flight mutations per item
2. Does not pass `isPending` or `disabled` to ItemCard

The pantry page pattern (add item ID on mutation start, remove in `finally`) is missing entirely.

## Fix Applied

Added `pendingItemIds: Set<string>` state, wrapped `onAmountChange` with add/finally-delete pattern, and passed `disabled` and `isPending` to ItemCard in `renderItemCard`.

## Test Added

`apps/web/src/routes/shelves/$shelfId.test.tsx` — two new tests in `describe('ShelfDetailPage - ItemCard loading states')` using `vi.spyOn(db.items, 'update')` to hold the mutation open while asserting `.animate-spin` on the clicked button.

## PR / Commit

Commits `5816d8c1` (test) and `325b15b7` (fix) on `feature/button-loading-states`.
