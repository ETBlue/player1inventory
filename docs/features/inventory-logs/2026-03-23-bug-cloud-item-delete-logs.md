# Bug: Cloud Mode — Item Deletion Does Not Cascade-Delete Inventory Logs

## Bug Description

When an item is deleted in cloud mode, its related inventory logs are not deleted. The orphaned logs remain in the database indefinitely.

In local mode, `deleteItem` in `src/db/operations.ts` already cascade-deletes inventory logs (line 49). Cloud mode is inconsistent.

## Root Cause

The server-side `deleteItem` GraphQL resolver (`apps/server/src/resolvers/item.resolver.ts`) only cascades to recipes (removes item from recipe `items` arrays). It does not call `InventoryLogModel.deleteMany()` for the deleted item's logs.

## Affected Files

- `apps/server/src/resolvers/item.resolver.ts` — resolver missing log cascade
- `apps/server/src/resolvers/item.resolver.test.ts` — no regression test for log cascade

## Fix Applied

Added `await InventoryLogModel.deleteMany({ itemId: id, userId })` inside the `deleteItem` resolver in `apps/server/src/resolvers/item.resolver.ts`, before `ItemModel.deleteOne`. Also imported `InventoryLogModel`.

## Test Added

`deleting an item cascade-deletes its inventory logs` — in `apps/server/src/resolvers/item.resolver.test.ts`. Creates an item + two inventory logs, deletes the item, then asserts the logs no longer exist in MongoDB.

Confirmed failing before the fix (got `expected [ {…}, {…} ] to have a length of 0 but got 2`), passing after.

## PR / Commit

- Fix commit: `56c2578` — `fix(cloud): cascade-delete inventory logs when item is deleted`
- PR: *TBD*
