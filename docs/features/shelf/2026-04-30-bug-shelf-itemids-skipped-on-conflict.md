---
title: Bug — Shelf itemIds not merged when shelf conflicts in skip/replace import
date: 2026-04-30
area: shelf / import
---

## Bug Description

After adding items to a selection shelf in offline mode and switching to cloud with
"copy data > skip conflicts", the item is created in cloud but not in the shelf.
The shelf's `itemIds` in cloud still reflects the old state (before the items were added locally).

## Root Cause

The "skip" strategy filters conflicting shelves out of `toCreate` entirely
(`partitionPayload`, `importData.ts`). When a shelf with the same ID already exists in cloud,
the whole shelf record — including its updated `itemIds` — is skipped. Items referenced in
`itemIds` may be newly created (non-conflicting) but the shelf is never updated to reference
them.

The same gap exists for "replace": `bulkUpsertShelves` replaces the entire shelf, but if the
item IDs in the shelf's `itemIds` do not yet exist in cloud at upsert time (because shelves are
processed last in the batch), the reference is stored correctly — but the server would reject a
foreign key violation if `itemIds` referenced a non-existent item. (No FK enforcement in the
current Prisma schema since `itemIds` is a plain `String[]`, so this part is actually fine for
replace.)

The core issue is specifically in "skip": newly-created items that belong to an existing shelf
are never added to that shelf's `itemIds` in cloud.

The same issue applies to local import when a shelf already exists in local IndexedDB.

## Fix Applied

Two-sided fix in `apps/web/src/lib/importData.ts`:

1. **`importLocalData` (skip strategy):** After `db.shelves.bulkAdd(...)`, iterate over all
   conflicting shelves. For each, compute which of the newly-created item IDs belong to that
   shelf (by filtering `payloadShelf.itemIds` against the `newItemIds` Set). If any are found,
   read the existing shelf from IndexedDB and write back a merged `itemIds` array using
   `db.shelves.update(...)`.

2. **`importCloudData` (skip strategy):** Same logic after `bulkCreate(...)`, but instead of
   hitting IndexedDB we look up the existing cloud shelf from the `existing.shelves` array
   (already fetched) and call `client.mutate<UpdateShelfMutation>({ mutation: UpdateShelfDocument, variables: { id, itemIds: mergedIds } })`.

`UpdateShelfDocument` and `type UpdateShelfMutation` were added to the generated graphql imports.

## Test Added

Three new test cases in `apps/web/src/lib/importData.test.ts`:

1. **`importCloudData — batched cloud import > merges newly created item IDs into a conflicting shelf on skip (cloud)`** — Verifies that when a cloud shelf conflict exists and a new item is created, `UpdateShelf` is called with merged `itemIds`.

2. **`importLocalData — shelf itemIds merge on skip conflict > user can merge newly created item IDs into a conflicting shelf on skip`** — Verifies that the local shelf's `itemIds` is updated to include the newly created item.

3. **`importLocalData — shelf itemIds merge on skip conflict > does not modify a conflicting shelf when no newly created items belong to it`** — Verifies no spurious updates when the conflicting shelf's items are all themselves conflicting (none newly created).

Also added `await db.shelves.clear()` to `clearAllTables()` helper.

## PR / Commit

- Fix commit: `4aa0aa5` — `fix(shelf): merge new itemIds into conflicting shelf on skip import`
- Part of feature branch `feature/shelf-data-ops`
