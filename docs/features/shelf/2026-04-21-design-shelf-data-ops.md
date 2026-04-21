---
title: Design — Shelf in Data Operations
date: 2026-04-21
area: shelf
status: pending
---

## Goal

Include the `shelf` entity in all data operations: export, import, reset, cloud purge, and local↔cloud mode switch.

## Rules

- **System shelves** (`type === 'system'`) are excluded from all data operations — they are app-managed.
- **Conflict detection** in import: ID only (not name).
- **Clear strategy**: wipes shelves before restoring.
- **Mode switch**: shelves follow the same strategy as other entities.

## Affected Files

### 1. Export payload — `apps/web/src/lib/exportData.ts`

**`ExportPayload` interface**: add `shelves` field.

**Local export (`exportAllData`)**: query `db.shelves.toArray()`, filter out `type === 'system'`, include in payload.

**Cloud export (`exportCloudData`)**: add a `GetShelvesQuery` GraphQL fetch, sanitize result with `sanitiseCloudPayload`, filter system shelves.

### 2. Import — `apps/web/src/lib/importData.ts`

**`ImportablePayload`**: add optional `shelves` field (optional for backward compat with old backups).

**Conflict detection**: shelves use ID-only matching (simpler than named entities). No name-based conflict check.

**`importLocalData`**:
- `clear` strategy: add `db.shelves.clear()` before `db.items.clear()` (no FK deps)
- bulk-add: `db.shelves.bulkAdd(shelves)` after other tables
- `skip`: only add shelves whose IDs don't exist
- `replace`: upsert by ID

**`importCloudData`**:
- Add `toShelfInput()` mapper (strip server fields: `userId`, `familyId`, `__typename`)
- Batch-create via `createShelf` mutations (same 50-item batch pattern)
- `clear` strategy: `purgeUserData` already wipes shelves (after cloud purge fix)

### 3. Cloud purge — `apps/server/src/resolvers/purge.resolver.ts`

Add `prisma.shelf.deleteMany({ where: { userId } })` to the purge transaction, before junction tables but after dependent data (shelves have no FK children).

### 4. GraphQL — shelves query for cloud export

Add or use existing `GetShelves` query in `apps/web/src/graphql/`. If it already exists (from shelf cloud sync work), reuse it. Otherwise add:

```graphql
query GetShelves {
  shelves {
    id name type order sortBy sortDir filterConfig itemIds createdAt updatedAt
  }
}
```

### 5. No changes needed — mode switch

`DataModeCard` uses `exportCloudData` / `exportAllData` + `importLocalData` / `importCloudData`. Once shelves are added to those functions, mode switch automatically picks them up.

## Import Order

Shelves have no FK relationships to items/tags/vendors/recipes in the local DB (they reference them by ID in `filterConfig`/`itemIds` but without enforced FK). Safe to import shelves after all entity types:

```
tagTypes → tags → vendors → items → recipes → inventoryLogs → shoppingCarts → cartItems → shelves
```

## Backward Compatibility

Old backup files without a `shelves` field: treat as empty array — no shelves imported, existing shelves unaffected (for `skip`/`replace`) or cleared (for `clear`).

## Test Coverage

- Unit: `exportAllData` includes non-system shelves, excludes system shelves
- Unit: `importLocalData` with `clear` clears and restores shelves
- Unit: `importLocalData` with `skip` skips ID conflicts
- Unit: `importLocalData` with `replace` upserts by ID
- Unit: old payload (no `shelves` field) is handled gracefully
- Integration: cloud purge deletes shelves
