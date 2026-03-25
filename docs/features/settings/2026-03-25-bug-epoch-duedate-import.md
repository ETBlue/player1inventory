# Bug: Epoch Date on Import (1970-01-01)

## Bug Description

After exporting data from local mode and importing into cloud mode, all items with no explicit expiration setup display "Expires on 1970-01-01" on their item cards.

## Root Cause

In `apps/web/src/lib/importData.ts`, `deserializeItem()` checks:

```typescript
if (item.dueDate !== undefined) {
  result.dueDate = new Date(item.dueDate as string)
}
```

When JSON is exported, optional fields that were `undefined` in the source object are serialized as `null`. On re-import, `null !== undefined` evaluates to `true`, so `new Date(null)` is called — which JavaScript interprets as Unix epoch: `1970-01-01T00:00:00.000Z`.

The same pattern affects `estimatedDueDays` and `expirationThreshold`, which may also be stored with null/zero values from a bad import.

## Fix Applied

In `apps/web/src/lib/importData.ts`, `deserializeItem()` was updated to use explicit `!== null && !== undefined` double-checks for all three optional expiry fields (`dueDate`, `estimatedDueDays`, `expirationThreshold`). A `delete result.<field>` fallback ensures null values spread from `...item` are cleaned up before the item is stored.

## Test Added

Three new tests in `apps/web/src/lib/importData.test.ts`:
- `user can import item with dueDate: null — stored as undefined, not epoch`
- `user can import item with estimatedDueDays: null — stored as undefined`
- `user can import item with expirationThreshold: null — stored as undefined`

## PR / Commit

Branch: `fix/import-epoch-duedate`

- `fix(import): handle null dueDate, estimatedDueDays, expirationThreshold on import`
- `test(e2e): add regression test for epoch dueDate after import with null fields`
- `docs(bug): add epoch dueDate import bug report and fix notes`
