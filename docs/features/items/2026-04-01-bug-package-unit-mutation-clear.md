# Bug: Package Unit Not Cleared on Item Save (Cloud Mode)

## Bug Description

On the item info page, when a user clears the "package unit" field and saves, the GraphQL mutation does not send `packageUnit` to the backend. The backend's MongoDB `$set` operator only updates fields that are present in the input, so it keeps the old value. After the mutation succeeds, the Apollo cache reflects the unchanged backend value — the UI shows the stale package unit.

## Root Cause

**File:** `apps/web/src/hooks/useItems.ts`, `toUpdateItemInput()` (lines 40–46)

When the user clears an optional field, `buildUpdates()` (`apps/web/src/routes/items/$id/index.tsx`) removes it via `delete updates.packageUnit`. The `toUpdateItemInput()` function then spreads `...rest`, so the deleted field is simply absent from the GraphQL mutation input — not `null`.

GraphQL with MongoDB `$set` interprets an absent field as "do not touch this field." To actually clear a field, the mutation must explicitly send `null`.

The same issue affects all optional clearable fields: `packageUnit`, `measurementUnit`, `amountPerPackage`, `dueDate`, `estimatedDueDays`, `expirationThreshold`.

## Fix Applied

In `toUpdateItemInput()` (`apps/web/src/hooks/useItems.ts`), explicitly send `null` for all absent optional clearable fields instead of omitting them:

```ts
packageUnit: rest.packageUnit ?? null,
measurementUnit: rest.measurementUnit ?? null,
amountPerPackage: rest.amountPerPackage ?? null,
estimatedDueDays: rest.estimatedDueDays ?? null,
expirationThreshold: rest.expirationThreshold ?? null,
dueDate: dueDate instanceof Date ? dueDate.toISOString() : null,
```

Also added a comment on `useUpdateItem`'s cloud branch noting that in cloud mode `updates` must be a complete payload (as produced by `buildUpdates`) — absent optional fields are treated as explicit clears.

## Test Added

`apps/web/src/hooks/useItems.test.tsx` — `useUpdateItem (cloud mode)` describe block: asserts that calling `mutateAsync` with only `{ name: 'Milk' }` results in the Apollo mutation receiving `packageUnit: null`, `measurementUnit: null`, `amountPerPackage: null`, `estimatedDueDays: null`, `expirationThreshold: null`, and `dueDate: null` in the input variables.

## PR / Commit

Commit `920401f` on branch `fix/items-unit-conversion-recipe-default`
