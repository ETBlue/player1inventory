# Bug: Cloud import "replace" silently skips the rows it was asked to overwrite

Issue: #330

## Bug Description

On the cloud import **replace** strategy, the rows the user chose to overwrite are
not overwritten. The import reports success. Nothing warns the user.

Steps to reproduce:

1. Be in cloud mode with one existing item, `Milk`.
2. Import a backup holding two items: `Milk` (the same id — a conflict) and
   `Bread` (new).
3. Choose **replace**, which means "overwrite what is already there".

What happens:

| Pass | Data | Batch key | Result |
|---|---|---|---|
| create | `[Bread]` | `items:0` | sent, key recorded |
| upsert | `[Milk]` | `items:0` | **skipped** — the key is already in the set |

`Bread` is created. `Milk` is **not** updated.

Affected entities are every one that can appear in both passes on `replace`:
`items`, `tags`, `tagTypes`, `vendors`, `recipes`, `inventoryLogs`,
`shoppingCarts`, `cartItems`, `shelves`.

**Local mode is unaffected.** `importLocalData` does not batch and holds no session.

The two entities cloud-locations PR 4b added cannot hit it either, because
`partitionPayload` routes `locations` only to the create pass and `itemStocks` only
to the upsert pass.

## Root Cause

`apps/web/src/lib/importData.ts`. The resumable-batch key does not record which of
the two passes it came from. Built in `runBulkBatches`:

```ts
const key = `${spec.entityType}:${i}`   // no mode
if (session.completedBatchKeys.has(key)) { continue }
...
session.completedBatchKeys.add(key)
```

`bulkCreate` and `bulkUpsert` are both thin wrappers over `runBulkBatches`,
differing only in the `mode` argument — which never reaches the key. On the
`replace` path, `importCloudData` passes **the same `session` object** to both, so
the upsert pass finds the create pass's key and treats its own batch as already
sent.

## Why no test caught it

Every existing test of this path uses a payload where each entity appears in only
one pass, so the two passes never collide on a key. `importCloudData — batched
cloud import` has 5 tests and none mixes a conflicting row and a new row of the
same entity.

## Fix Applied

*TBD*

## Test Added

*TBD*

## PR / Commit

*TBD*
