# Implementation Plan: Data Import/Export (Both Modes)

**Branch:** `feature/data-import-export`
**Design doc:** `2026-03-21-data-import-export-design.md`
**Status:** 🔲 Pending

---

## Step 1 — GraphQL schema: fetch-all queries (cloud export)

Add three new queries to the GraphQL schema and server resolvers:
- `inventoryLogs: [InventoryLog!]!` — all logs for the current user's family group
- `shoppingCarts: [ShoppingCart!]!` — all carts
- `cartItems: [CartItem!]!` — all cart items

Add corresponding `.graphql` operation files on the client:
- `src/apollo/operations/export.graphql` — three query definitions

Regenerate Apollo types if using codegen.

**Verification:** `pnpm build` passes, no TS errors.

---

## Step 2 — GraphQL schema: bulk-insert mutations (cloud import)

Add eight new mutations to the GraphQL schema and server resolvers:
- `bulkCreateItems(items: [ItemInput!]!): [Item!]!`
- `bulkCreateTags(tags: [TagInput!]!): [Tag!]!`
- `bulkCreateTagTypes(tagTypes: [TagTypeInput!]!): [TagType!]!`
- `bulkCreateVendors(vendors: [VendorInput!]!): [Vendor!]!`
- `bulkCreateRecipes(recipes: [RecipeInput!]!): [Recipe!]!`
- `bulkCreateInventoryLogs(logs: [InventoryLogInput!]!): [InventoryLog!]!`
- `bulkCreateShoppingCarts(carts: [ShoppingCartInput!]!): [ShoppingCart!]!`
- `bulkCreateCartItems(cartItems: [CartItemInput!]!): [CartItem!]!`

Also add upsert variants (or `upsert: Boolean` flag) for Replace mode, and clear mutations for Clear & Import mode:
- `bulkUpsertItems`, `bulkUpsertTags`, etc.
- `clearAllData: Boolean!` — single mutation to wipe all entities for the user

Add corresponding `.graphql` operation file: `src/apollo/operations/import.graphql`

Regenerate Apollo types.

**Verification:** `pnpm build` passes, no TS errors.

---

## Step 3 — Cloud export: `exportCloudData()`

In `src/lib/exportData.ts`:
- Add `exportCloudData(client: ApolloClient<object>): Promise<void>`
- Uses the three new fetch-all queries + five existing queries to fetch all 8 entities
- Builds `ExportPayload` with same shape as local export
- Triggers file download with same filename convention

Update `ExportCard` (`src/components/settings/ExportCard/index.tsx`):
- Accept `useDataMode()` internally
- Call `exportCloudData(apolloClient)` in cloud mode
- Call `exportAllData()` in local mode
- Update description text (remove "local")

Update settings page (`src/routes/settings/index.tsx`):
- Remove `mode === 'local'` guard — show ExportCard in both modes

Add/update stories and smoke tests for ExportCard.

**Verification:** Full quality gate passes.

---

## Step 4 — Conflict detection logic

In `src/lib/importData.ts` (new file):
- Define `ConflictSummary` type: per-entity-type list of `{ id, name, matchReasons: ('id' | 'name')[] }`
- Implement `detectConflicts(payload: ExportPayload, existing: ExistingData): ConflictSummary`
  - Fetches current data (passed in as param, not fetched internally — keeps pure/testable)
  - Matches by ID and by name per entity type
- Implement `partitionPayload(payload, conflicts, strategy: 'skip' | 'replace' | 'clear')`
  - Returns `{ toCreate, toUpsert }` split based on chosen strategy

Write unit tests in `src/lib/importData.test.ts`.

**Verification:** `pnpm test` passes. Full quality gate passes.

---

## Step 5 — Local import: `importLocalData()`

In `src/lib/importData.ts`:
- Implement `importLocalData(payload: ExportPayload, strategy: 'skip' | 'replace' | 'clear'): Promise<void>`
  - **skip**: `db.table.add()` non-conflicting only
  - **replace**: `db.table.put()` for conflicts, `db.table.add()` for new
  - **clear**: `db.table.clear()` all tables in dependency order, then `db.table.bulkAdd()` all

Handle dependency order for clear (cart items before carts, tags before tag types, etc.)

Write integration tests in `src/lib/importData.test.ts`.

**Verification:** `pnpm test` passes. Full quality gate passes.

---

## Step 6 — Cloud import: `importCloudData()`

In `src/lib/importData.ts`:
- Implement `importCloudData(payload: ExportPayload, strategy: 'skip' | 'replace' | 'clear', client: ApolloClient<object>): Promise<void>`
  - **skip**: call `bulkCreate*` for non-conflicting entities only
  - **replace**: call `bulkUpsert*` for conflicts, `bulkCreate*` for new
  - **clear**: call `clearAllData` mutation, then `bulkCreate*` for all entities

Invalidate all relevant Apollo cache keys after import.

**Verification:** Full quality gate passes.

---

## Step 7 — ConflictDialog component

Create `src/components/settings/ConflictDialog/index.tsx`:
- Props: `open: boolean`, `conflicts: ConflictSummary`, `onSkip`, `onReplace`, `onClear`, `onClose`
- Shows entity-type groups with conflict names and match reasons (ID match / name match)
- Three action buttons: Skip conflicts · Replace matches · Clear & import
- Cancel button

Create stories: `index.stories.tsx` with variants (no conflicts, few conflicts, many conflicts)
Create smoke test: `index.stories.test.tsx`

**Verification:** Full quality gate passes.

---

## Step 8 — ImportCard component

Create `src/components/settings/ImportCard/index.tsx`:
- No props — reads `useDataMode()` internally
- UI: Upload icon, "Import data" label, description, "Import" button
- Hidden `<input type="file" accept=".json">` triggered by button click
- Flow:
  1. User selects file → parse JSON → validate `ExportPayload` shape
  2. Fetch existing data (local: Dexie; cloud: Apollo)
  3. Run `detectConflicts()`
  4. If conflicts → open `ConflictDialog`; if no conflicts → import directly with `skip` strategy
  5. Call `importLocalData()` or `importCloudData()` with chosen strategy
  6. Show success toast / error message
- Loading state during import (disable button)

Create stories: `index.stories.tsx`
Create smoke test: `index.stories.test.tsx`

**Verification:** Full quality gate passes.

---

## Step 9 — Wire into settings page

In `src/routes/settings/index.tsx`:
- Import and render `<ImportCard />` below `<ExportCard />` in both modes

Add/update route-level story and smoke test.

**Verification:** Full quality gate passes. Run E2E:
```bash
pnpm test:e2e --grep "settings"
```

---

## Step 10 — Documentation

- Update `docs/INDEX.md` — mark feature as ✅
- Update `CLAUDE.md` if any new shared components or patterns introduced
- Verify design doc matches final implementation

---

## Dependency Order for Clear & Import

When clearing, delete in this order (children before parents):
1. `cartItems`
2. `shoppingCarts`
3. `inventoryLogs`
4. `tags` (references tagTypes)
5. `tagTypes`
6. `recipes`
7. `vendors`
8. `items`

When importing, insert in reverse order (parents before children).
