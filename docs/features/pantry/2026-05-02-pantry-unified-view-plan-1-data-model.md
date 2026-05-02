# Plan 1: Shelf Data Model Cleanup

**Feature:** Pantry Unified View
**Design doc:** [2026-05-02-pantry-unified-view-design.md](./2026-05-02-pantry-unified-view-design.md)
**PR scope:** Remove `sortBy` / `sortDir` from the Shelf entity across the full stack
**Status:** 🔲 Pending

## Context

The Shelf entity currently has `sortBy` and `sortDir` fields that allow per-shelf sort configuration. In the unified pantry view, a single global sort control replaces this. These fields must be removed from the type definition, Dexie schema, Prisma schema, GraphQL schema, and all UI that reads or writes them.

This PR has no visual changes on the pantry page — it is purely a data-model and settings-page cleanup.

## Steps

### Step 1 — Type definition

**File:** `packages/types/src/index.ts`

Remove `sortBy` and `sortDir` from the `Shelf` interface:
```ts
// remove these two lines:
sortBy?: 'name' | 'stock' | 'expiring' | 'lastPurchased'
sortDir?: 'asc' | 'desc'
```

Run the verification gate after this step — TypeScript will surface every remaining usage.

---

### Step 2 — Dexie schema migration

**File:** `apps/web/src/db/index.ts`

- Bump the Dexie version (currently version 9 has the `sortBy`/`sortDir` migration; new version should drop them)
- Add a migration callback that deletes these properties from all existing shelf records using `db.shelves.toCollection().modify(shelf => { delete shelf.sortBy; delete shelf.sortDir })`

---

### Step 3 — Database operations and tests

**File:** `apps/web/src/db/operations.ts`

- Remove any `sortBy`/`sortDir` params from `createShelf` and `updateShelf` operations

**File:** `apps/web/src/db/operations.test.ts`

- Remove or update any test cases that pass/assert `sortBy`/`sortDir`

---

### Step 4 — Deserialization and import utilities

**File:** `apps/web/src/lib/deserialization.ts`

- Remove `sortBy`/`sortDir` from the Shelf deserialization logic

**File:** `apps/web/src/lib/deserialization.test.ts`

- Update tests accordingly

**File:** `apps/web/src/lib/importData.ts`

- Remove `sortBy`/`sortDir` from shelf import mapping

---

### Step 5 — GraphQL operations (web client)

**File:** `apps/web/src/apollo/operations/shelves.graphql`

- Remove `sortBy` and `sortDir` from `CreateShelf` and `UpdateShelf` mutation variables and input types

After editing, regenerate types:
```bash
(cd apps/web && pnpm codegen)
```

**File:** `apps/web/src/generated/graphql.ts` — auto-regenerated; do not edit manually

---

### Step 6 — GraphQL schema (server)

**File:** `apps/server/src/schema/shelf.graphql`

- Remove `sortBy` and `sortDir` from the `Shelf` type, `CreateShelfInput`, and `UpdateShelfInput`

**File:** `apps/server/src/resolvers/shelf.resolver.ts`

- Remove `sortBy`/`sortDir` from `createShelf` and `updateShelf` resolver logic

---

### Step 7 — Prisma migration

**File:** `apps/server/prisma/schema.prisma`

- Remove `sortBy` and `sortDir` fields from the `Shelf` model

Generate and apply the migration:
```bash
(cd apps/server && pnpm prisma migrate dev --name remove-shelf-sort-fields)
```

---

### Step 8 — Settings shelf edit page

**File:** `apps/web/src/routes/settings/shelves/$shelfId/index.tsx`

- Remove sort field UI (sort-by select, sort-direction select)
- Remove the corresponding `useState` for sort fields
- Remove sort fields from the form submit handler

**File:** `apps/web/src/routes/settings/shelves/$shelfId/index.stories.tsx`

- Remove sort-related story variants / args

**File:** `apps/web/src/routes/settings/shelves/$shelfId/index.test.tsx`

- Remove or update sort-related test cases

---

### Step 9 — AddShelfDialog

**File:** `apps/web/src/components/shelf/AddShelfDialog/AddShelfDialog.tsx`

- Remove sort field inputs from the dialog
- Remove sort field state and submit logic

Update stories and tests if they exist.

---

### Step 10 — Shelf view route (sort defaults)

**File:** `apps/web/src/routes/shelves/$shelfId.tsx`

- Remove the logic that reads `shelf.sortBy` / `shelf.sortDir` as default sort values
- This route will be deleted in Plan 3; for now, fall back to the global pantry sort default

**File:** `apps/web/src/routes/shelves/$shelfId.stories.tsx`

- Remove sort-related story args

---

### Step 11 — Verification gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

All must pass before opening a PR.

## Acceptance Criteria

- [ ] `Shelf` type has no `sortBy` or `sortDir` fields
- [ ] Dexie migration removes the fields from existing records on upgrade
- [ ] Prisma migration removes the columns from the cloud DB
- [ ] GraphQL schema and generated types contain no `sortBy`/`sortDir` for Shelf
- [ ] Settings shelf edit page shows no sort controls
- [ ] AddShelfDialog shows no sort controls
- [ ] All tests pass; no TypeScript errors
