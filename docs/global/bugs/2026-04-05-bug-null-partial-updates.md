# Bug: Expiration and Measurement Fields Nulled on Partial Item Updates in Cloud Mode

**Date:** 2026-04-05
**Branch:** fix/null-partial-updates

## Bug Description

In cloud mode, expiration-related fields (`dueDate`, `estimatedDueDays`, `expirationThreshold`, `expirationMode`) and measurement unit-related fields (`packageUnit`, `measurementUnit`, `amountPerPackage`) are cleared to `null` whenever an item is updated via any path other than the full ItemForm. Affected actions include:

- Pantry +/− quantity buttons
- Pantry "add to cart" / consume actions
- Cooking page consume/unconsume
- Tag and vendor assignment pages
- Vendor item list assignment

The full ItemForm (`/items/$id`) is unaffected because it always includes all fields in the payload.

## Root Cause

`toUpdateItemInput()` in `apps/web/src/hooks/useItems.ts` (lines 46–58) converts every optional clearable field to `null` via `?? null` regardless of whether that field was included in the update payload:

```ts
packageUnit: rest.packageUnit ?? null,
measurementUnit: rest.measurementUnit ?? null,
// ...etc.
```

Partial update call sites (quantity buttons, tag/vendor assignment, etc.) only pass the fields they need to change. All other optional fields are absent from the payload, but `toUpdateItemInput()` maps the absent (`undefined`) values to `null`. The resulting GraphQL input sends explicit `null` for every optional field, and the server's `$set` operator writes them all to `null` in MongoDB.

There are 11 partial-update call sites affected across 6 route files.

## Fix Applied

Two coordinated changes:

1. `toUpdateItemInput()` in `apps/web/src/hooks/useItems.ts` now uses sparse spreading via `'key' in rest` checks. Fields absent from the update payload are omitted from the GraphQL input; the server leaves them untouched. Fields present (even as `undefined`) are still sent as `null` to clear them.

2. `buildUpdates()` in `apps/web/src/routes/items/$id/index.tsx` replaces `delete updates.field` with `updates.field = undefined` for the four optional clearable fields (`packageUnit`, `measurementUnit`, `amountPerPackage`, `expirationThreshold`). This keeps the key present in the object so `toUpdateItemInput()` correctly includes it as `null` when the user blanks the field in the full ItemForm.

## Test Added

Three unit tests added in `apps/web/src/hooks/useItems.test.ts` under `describe('toUpdateItemInput')`:
- Partial payload (only `packedQuantity`) → the 7 optional fields are absent from the output
- Payload with `packageUnit: undefined` → `packageUnit: null` is present in the output
- Full payload with all optional fields → all fields serialized correctly (including `dueDate` as ISO string)

## PR / Commit

- Commit 1: `fix(items): use sparse building in toUpdateItemInput for cloud mode` (0296169)
- Commit 2: `fix(items): replace delete with undefined in buildUpdates for cloud clears` (fa1e891)
- PR: TBD

---

## Design

### Approach

Sparse building in `toUpdateItemInput()` combined with explicit `null` in `buildUpdates()`.

**Rule:** absent key = "leave it alone"; key present with `null` value = "clear this field".

### Change 1 — `toUpdateItemInput()` (`apps/web/src/hooks/useItems.ts`)

Replace `?? null` assignments with sparse spread syntax for all 7 optional clearable fields:

```ts
// Before
packageUnit: rest.packageUnit ?? null,

// After
...('packageUnit' in rest && { packageUnit: rest.packageUnit ?? null }),
```

Apply the same pattern to: `measurementUnit`, `amountPerPackage`, `estimatedDueDays`, `expirationThreshold`, `expirationMode`, `dueDate`.

A field is now only included in the GraphQL input when it is explicitly present in the update object. Absent = omitted from payload = server leaves it alone.

### Change 2 — `buildUpdates()` (`apps/web/src/routes/items/$id/index.tsx`)

Replace `delete updates.<field>` with explicit `null` assignment so that when a user clears an optional field in the full form, `toUpdateItemInput()` still sees the key and sends `null` to the server (clearing the field in MongoDB):

```ts
// Before
if (values.packageUnit) {
  updates.packageUnit = values.packageUnit
} else {
  delete updates.packageUnit
}

// After
updates.packageUnit = values.packageUnit || null
```

Apply the same pattern to: `measurementUnit`, `amountPerPackage`, `expirationThreshold`. Confirm `expirationMode`, `dueDate`, and `estimatedDueDays` already set the key explicitly (no `delete` calls) — if any use `delete`, apply the same `|| null` fix.

### Testing

**Unit tests** for `toUpdateItemInput()`:
1. Partial payload (only `packedQuantity`) → optional fields must be absent from output
2. Payload with `packageUnit: null` → `packageUnit: null` present in output
3. Full payload → all fields serialized as before

**Regression** — existing `useItems` tests must continue to pass.
