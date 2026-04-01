# Bug: Expiration badge shows wrong message in cloud mode

## Bug description

In cloud mode, `ItemCard` shows "Expired 1 days ago" for an item with `estimatedDueDays: 6` that was last purchased on March 31 (today is April 1). The correct message is "Expires in 6 days".

## Root cause

`useLastPurchaseDate(itemId)` in `src/hooks/useItems.ts` (line 131) always queries Dexie (local IndexedDB), regardless of the current data mode. In cloud mode, new inventory logs are written to the cloud server — not to Dexie. Dexie only contains logs from before the user switched to cloud mode.

The result: `lastPurchase` returned by the hook is the date of the most recent *local* log (from around `item.createdAt`, e.g. March 25), not the most recent cloud log (March 31). The expiration is then computed as `createdAt + estimatedDueDays = March 25 + 6 = March 31`, which is 1 day in the past.

`useItemSortData` (used for sorting on list pages) already handles this correctly by using `useLastPurchaseDatesQuery` (Apollo) in cloud mode and Dexie in local mode.

## Fix applied

Modified `useLastPurchaseDate` in `apps/web/src/hooks/useItems.ts` to be cloud-aware:
- Calls `useDataMode()` to detect the current mode
- In cloud mode: calls `useLastPurchaseDatesQuery({ variables: { itemIds: [itemId] } })` (Apollo) and returns the matching date as a `Date` object, or `undefined` if null
- In local mode: falls back to the original Dexie/TanStack Query path (unchanged)
- Both hooks are called unconditionally to comply with the Rules of Hooks; the return value is selected based on mode

## Test added

Two tests added to `apps/web/src/hooks/useItems.test.tsx` under `describe('useLastPurchaseDate (cloud mode)')`:
1. `user can get last purchase date via Apollo in cloud mode` — verifies that the hook calls `useLastPurchaseDatesQuery` with the correct `itemIds` and returns a proper `Date` object
2. `returns undefined when Apollo returns null date in cloud mode` — verifies `null` from Apollo is converted to `undefined`

## PR / commit

Commit: `fix(items): make useLastPurchaseDate cloud-aware` (00c4024)
