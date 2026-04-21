---
title: Plan — Shelf in Data Operations
date: 2026-04-21
area: shelf
status: pending
---

## Implementation Plan

### Step 1 — Cloud purge: delete shelves on `purgeUserData`

**File**: `apps/server/src/resolvers/purge.resolver.ts`

Add `prisma.shelf.deleteMany({ where: { userId } })` inside the purge transaction. Insert it after `cartItems` / `carts` and before `items` (shelves have no FK children).

**Verification gate**: `(cd apps/server && pnpm build)` (or lint check) — confirm no TypeScript errors.

---

### Step 2 — Export: add shelves to payload

**Files**:
- `apps/web/src/lib/exportData.ts` — `ExportPayload` interface + `exportAllData` + `exportCloudData`
- `apps/web/src/graphql/` — add `GetShelves` query if not present

Changes:
1. Add `shelves: Shelf[]` to `ExportPayload`.
2. In `exportAllData`: `const shelves = (await db.shelves.toArray()).filter(s => s.type !== 'system')`; add to payload.
3. In `exportCloudData`: fetch via `GetShelvesQuery` (network-only), filter system shelves, sanitize, add to payload.

**Verification gate**: `(cd apps/web && pnpm lint) && (cd apps/web && pnpm build)`.

---

### Step 3 — Import: add shelves to local import

**File**: `apps/web/src/lib/importData.ts`

Changes:
1. Add `shelves?: Shelf[]` to importable payload type (optional for backward compat).
2. Add ID-only conflict detection for shelves (simpler helper, no name check).
3. `clear` strategy: add `await db.shelves.clear()` (after `db.cartItems.clear()`, before bulk-add phase).
4. Bulk-add: `await db.shelves.bulkAdd(shelves)` (last in the sequence).
5. `skip`: add shelves whose IDs don't already exist.
6. `replace`: upsert shelves by ID.
7. Handle missing `shelves` field in payload gracefully (treat as `[]`).

**Verification gate**: `(cd apps/web && pnpm lint) && (cd apps/web && pnpm build) && (cd apps/web && pnpm test)`.

---

### Step 4 — Import: add shelves to cloud import

**File**: `apps/web/src/lib/importData.ts` (cloud section)

Changes:
1. Add `toShelfInput()` mapper (strip `userId`, `familyId`, `__typename`; serialize dates to ISO).
2. Add shelves to the `bulkCreate` sequence after `cartItems`.
3. For `clear` strategy: after `ClearAllData` mutation (which now purges shelves), bulk-create from payload.
4. For `skip`/`replace`: fetch existing shelf IDs, skip/upsert accordingly.

**Verification gate**: `(cd apps/web && pnpm lint) && (cd apps/web && pnpm build) && (cd apps/web && pnpm test)`.

---

### Step 5 — Tests

**File**: `apps/web/src/lib/exportData.test.ts` and `apps/web/src/lib/importData.test.ts`

Add/update tests per design doc test coverage list:
- Export excludes system shelves, includes filter/selection shelves
- Import `clear` clears and restores shelves
- Import `skip` skips ID conflicts
- Import `replace` upserts by ID
- Old payload (no `shelves` field) handled gracefully

**Verification gate**: `(cd apps/web && pnpm test)`.

---

### Final Phase — E2E + accessibility

```bash
pnpm test:e2e --grep "settings|a11y"
```

Fix any failures before finishing the branch.
