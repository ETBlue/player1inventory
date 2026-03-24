# Design: E2E Tests for Import/Export (All Mode Combinations)

## Context

The import/export feature supports two data modes (local/Dexie and cloud/MongoDB). A production bug was discovered where data exported from local mode (UUID IDs) failed to import into cloud mode silently — Mongoose rejected UUID strings as ObjectId `_id` values and the error was swallowed. This design covers a test suite that acts as a regression guard for all four mode-combination import flows.

---

## Scope

Four scenarios, two spec files:

| Scenario | Source data | Playwright project |
|---|---|---|
| local → local | UI round-trip (export then import) | `local` |
| cloud → local | Fixture file | `local` |
| cloud → cloud | UI round-trip (export then import) | `cloud` |
| local → cloud | Fixture file ← regression for the UUID bug | `cloud` |

**Same-mode tests** (local→local, cloud→cloud) use Option A: seed data → click Export → capture downloaded file → clear data → import file → verify. This confirms the full export+import pipeline end-to-end.

**Cross-mode tests** (cloud→local, local→cloud) use Option B: pre-built fixture files with the source mode's ID format. Simpler, more focused, and avoids two-context complexity.

---

## File Structure

```
e2e/
  fixtures/
    local-backup.json      # UUID IDs — simulates a Dexie/local export
    cloud-backup.json      # ObjectId hex IDs — simulates a MongoDB/cloud export
  tests/settings/
    import-export-local.spec.ts   # local→local, cloud→local
    import-export-cloud.spec.ts   # cloud→cloud, local→cloud
```

---

## Fixture Schema

Both fixtures follow the `ExportPayload` shape (`version`, `exportedAt`, plus all 8 entity arrays). Each contains exactly one record per entity type, all cross-linked so relation integrity can be verified after import.

### Entity graph

```
TagType ←── Tag.typeId
                ↓
            Item.tagIds[]  ←── Vendor (via Item.vendorIds[])
                ↓
         Recipe.items[].itemId
         InventoryLog.itemId
         CartItem.itemId ←── Cart (via CartItem.cartId)
```

### Entities and sentinel names

| Entity | Name/note | Key relation fields |
|---|---|---|
| TagType | "Fixture Category" | `name`, `color: "blue"` |
| Tag | "Fixture Tag" | `typeId → TagType.id` |
| Vendor | "Fixture Vendor" | `name` |
| Item | "Fixture Item" | `tagIds: [Tag.id]`, `vendorIds: [Vendor.id]`, `targetUnit: "package"`, `targetQuantity: 1`, `refillThreshold: 0`, `packedQuantity: 0`, `unpackedQuantity: 0`, `consumeAmount: 1` |
| Recipe | "Fixture Recipe" | `items: [{ itemId: Item.id, defaultAmount: 1 }]` |
| InventoryLog | — | `itemId: Item.id`, `delta: 1`, `quantity: 1`, `occurredAt: <ISO string>` |
| Cart | — | `status: "active"` (must be active — export code filters out non-active carts), `createdAt: <ISO string>` |
| CartItem | — | `cartId: Cart.id`, `itemId: Item.id`, `quantity: 2` |

**Do not include `userId` or `familyId`** in fixture objects — the import mappers (`toItemInput`, `toTagInput`, etc.) strip these fields before sending to GraphQL mutations, and they are not indexed in Dexie so including them pollutes local records unnecessarily.

**`local-backup.json`** — all IDs are UUID strings (e.g. `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`).

**`cloud-backup.json`** — all IDs are MongoDB ObjectId hex strings (e.g. `"507f1f77bcf86cd799439011"`).

Both fixtures must include `version: 1` and `exportedAt: <ISO string>` at the top level.

---

## Test Scenarios

### `import-export-local.spec.ts` (runs in `local` project)

**Test 1 — local → local round-trip**
```
Given: Seed all fixture entities into IndexedDB via page.evaluate()
When:  Navigate to /settings → click "Download" button (ExportCard) → capture download via page.waitForEvent('download')
Then:  Clear IndexedDB via page.evaluate()
When:  Set file input to the downloaded file path via setInputFiles()
Then:  Wait for the success toast ("Data imported successfully") — local mode fires a toast on completion, it does NOT show the "Import complete." inline text (that is cloud-only)
Verify:
  1. PantryPage.getItemCard('Fixture Item') is visible
  2. getItemCard('Fixture Item').click() → waitForURL(/\/items\//) → navigateToTab('tags') → getTagBadge('Fixture Tag') is visible
  3. navigateToTab('vendors') → getAssignedVendorBadge('Fixture Vendor') is visible
  4. navigateToLogTab() → getLogEntries() count ≥ 1
  5. RecipesPage.navigateTo() → getRecipeCard('Fixture Recipe').click() → extract ID from URL → RecipeDetailPage.navigateToItems(id) → getAssignedItemCheckbox('Fixture Item') is visible
  6. ShoppingPage.navigateTo() → getItemCard('Fixture Item') is visible
```

**Test 2 — cloud → local (fixture)**
```
Given: No existing local data (fresh context after afterEach teardown)
When:  Navigate to /settings → set file input to e2e/fixtures/cloud-backup.json
Then:  Wait for the success toast ("Data imported successfully")
       — no ConflictDialog appears because local DB is empty (no conflicts)
Verify: [same 6 checks as Test 1]
```

### `import-export-cloud.spec.ts` (runs in `cloud` project only via testMatch)

**Test 3 — cloud → cloud round-trip**
```
Given: Seed all fixture entities via makeGql() using the bulk mutations:
       BulkCreateTagTypes, BulkCreateTags, BulkCreateVendors,
       BulkCreateItems, BulkCreateRecipes, BulkCreateInventoryLogs,
       BulkCreateShoppingCarts, BulkCreateCartItems
       (same mutations used by importData.ts — see bulkCreate() in apps/web/src/lib/importData.ts)
When:  Navigate to /settings → click "Download" button → capture download
Then:  Call DELETE /e2e/cleanup to clear all data
When:  Set file input to the downloaded file path
Then:  Wait for the "Import complete." inline text (cloud mode sets phase: 'done' on success)
Verify: [same 6 checks as Test 1]
```

**Test 4 — local → cloud (fixture) ← regression for UUID bug**
```
Given: No existing cloud data (beforeEach cleanup)
When:  Navigate to /settings → set file input to e2e/fixtures/local-backup.json
Then:  Wait for the "Import complete." inline text
       — no ConflictDialog appears because cloud DB is empty (no conflicts)
Verify: [same 6 checks as Test 1]
```

---

## Import Completion Signals

Local and cloud modes use different completion signals — callers must wait for the right one:

| Mode | Signal | How to wait |
|---|---|---|
| Local | `toast.success` — "Data imported successfully" | `page.getByText('Data imported successfully')` |
| Cloud | `phase: 'done'` inline text — "Import complete." | `page.getByText('Import complete.')` |

---

## Playwright Config Change

Add one entry to the cloud project's `testMatch` in `e2e/playwright.config.ts`:

```ts
'**/settings/import-export-cloud.spec.ts'
```

No `test.skip` guard needed — the cloud project's `testMatch` already prevents `import-export-cloud.spec.ts` from running in the local project. Adding a guard would require `test.beforeEach(() => { test.skip(baseURL !== CLOUD_WEB_URL) })` syntax (not a callback to `test.skip`), but it is unnecessary given `testMatch` already handles scoping.

---

## Teardown

Both spec files use the existing teardown pattern from `shopping.spec.ts` verbatim:

- **Cloud** (`beforeEach` + `afterEach`): `DELETE /e2e/cleanup` with `x-e2e-user-id: E2E_USER_ID` header
- **Local** (`afterEach`): `page.evaluate()` clearing all IndexedDB databases + `localStorage.clear()` + `sessionStorage.clear()`

---

## Page Object Changes

All additions go into existing files — no new page object files needed.

### `SettingsPage` — 4 new methods

```ts
navigateTo()
// page.goto('/settings')

triggerExport(): Promise<Download>
// const [download] = await Promise.all([
//   page.waitForEvent('download'),
//   page.getByRole('button', { name: 'Download' }).click(),  // ExportCard button label
// ])
// return download

triggerImport(filePath: string): Promise<void>
// page.locator('input[type="file"][accept=".json"]').setInputFiles(filePath)

waitForImportDone(mode: 'local' | 'cloud'): Promise<void>
// local: await expect(page.getByText('Data imported successfully')).toBeVisible()
// cloud: await expect(page.getByText('Import complete.')).toBeVisible()
```

### `ItemPage` — 2 new methods

```ts
getTagBadge(name: string): Locator
// tag badge rendered in the tags tab

getAssignedVendorBadge(name: string): Locator
// assigned vendor button (aria-pressed=true) in the vendors tab
```

### Unchanged — already sufficient

- `PantryPage.getItemCard(name)` — use `.click()` directly to navigate to item detail
- `ItemPage.navigateToTab(tab)` — navigate between tags / vendors / log tabs
- `ItemPage.getLogEntries()` — verify log entry exists (navigate to log tab first via `navigateToLogTab()`)
- `ShoppingPage.navigateTo()` + `getItemCard(name)` — verify cart item
- `RecipesPage.navigateTo()` + `getRecipeCard(name)` — find and click "Fixture Recipe" (`.click()` navigates to detail)
- `RecipeDetailPage.navigateToItems(id)` — navigate to recipe's items tab (extract `id` from URL after clicking the recipe card)
- `RecipeDetailPage.getAssignedItemCheckbox(name)` — verify ingredient

---

## Verification Navigation Sequence

The full navigation flow for verifying all 6 relations after import:

```
1. page.goto('/') OR PantryPage.navigateTo()
   → expect(PantryPage.getItemCard('Fixture Item')).toBeVisible()

2. PantryPage.getItemCard('Fixture Item').click()
   → page.waitForURL(/\/items\//)
   → ItemPage.navigateToTab('tags')
   → expect(ItemPage.getTagBadge('Fixture Tag')).toBeVisible()

3. ItemPage.navigateToTab('vendors')
   → expect(ItemPage.getAssignedVendorBadge('Fixture Vendor')).toBeVisible()

4. ItemPage.navigateToLogTab()
   → expect(ItemPage.getLogEntries()).toHaveCount(1) // or ≥ 1

5. RecipesPage.navigateTo()
   → RecipesPage.getRecipeCard('Fixture Recipe').click()
   → page.waitForURL(/\/settings\/recipes\//)
   → const id = page.url().match(/\/settings\/recipes\/([^/]+)/)[1]
   → RecipeDetailPage.navigateToItems(id)
   → expect(RecipeDetailPage.getAssignedItemCheckbox('Fixture Item')).toBeVisible()

6. ShoppingPage.navigateTo()
   → expect(ShoppingPage.getItemCard('Fixture Item')).toBeVisible()
```
