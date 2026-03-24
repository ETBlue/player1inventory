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
| TagType | "Fixture Category" | — |
| Tag | "Fixture Tag" | `typeId → TagType.id` |
| Vendor | "Fixture Vendor" | — |
| Item | "Fixture Item" | `tagIds: [Tag.id]`, `vendorIds: [Vendor.id]` |
| Recipe | "Fixture Recipe" | `items: [{ itemId: Item.id, defaultAmount: 1 }]` |
| InventoryLog | — | `itemId: Item.id`, `delta: 1`, `quantity: 1` |
| Cart | — | `status: "active"` |
| CartItem | — | `cartId: Cart.id`, `itemId: Item.id`, `quantity: 2` |

**`local-backup.json`** — all IDs are UUID strings (e.g. `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`).

**`cloud-backup.json`** — all IDs are MongoDB ObjectId hex strings (e.g. `"507f1f77bcf86cd799439011"`).

---

## Test Scenarios

### `import-export-local.spec.ts` (runs in `local` project)

**Test 1 — local → local round-trip**
```
Given: Seed all fixture entities into IndexedDB via page.evaluate()
When:  Navigate to /settings → click Export → capture download
Then:  Clear IndexedDB via page.evaluate()
When:  Set file input to the downloaded file path
Then:  Wait for "Import complete" state in ImportCard
Verify:
  - "Fixture Item" appears in pantry
  - "Fixture Tag" badge visible on item detail tags tab
  - "Fixture Vendor" listed in item detail vendors tab
  - Log entry exists in item detail log tab
  - "Fixture Recipe" shows "Fixture Item" as ingredient in /settings/recipes
  - /shopping shows "Fixture Item" in active cart (qty 2)
```

**Test 2 — cloud → local (fixture)**
```
Given: No existing local data (fresh context after afterEach teardown)
When:  Navigate to /settings → set file input to e2e/fixtures/cloud-backup.json
Then:  Wait for "Import complete"
Verify: [same 6 checks as Test 1]
```

### `import-export-cloud.spec.ts` (runs in `cloud` project)

**Test 3 — cloud → cloud round-trip**
```
Given: Seed all fixture entities via makeGql(bulkCreate* mutations)
When:  Navigate to /settings → click Export → capture download
Then:  Call DELETE /e2e/cleanup to clear all data
When:  Set file input to the downloaded file path
Then:  Wait for "Import complete"
Verify: [same 6 checks]
```

**Test 4 — local → cloud (fixture) ← regression for UUID bug**
```
Given: No existing cloud data (beforeEach cleanup)
When:  Navigate to /settings → set file input to e2e/fixtures/local-backup.json
Then:  Wait for "Import complete"
Verify: [same 6 checks]
```

---

## Playwright Config Change

Add one entry to the cloud project's `testMatch` in `e2e/playwright.config.ts`:

```ts
'**/settings/import-export-cloud.spec.ts'
```

Add a guard at the top of `import-export-cloud.spec.ts`:

```ts
test.skip(({ baseURL }) => baseURL !== CLOUD_WEB_URL, 'cloud mode only')
```

(The local project has no `testMatch` restriction so it picks up all spec files. The guard prevents the cloud spec from running under the local project.)

---

## Teardown

Both spec files use the existing teardown pattern from `shopping.spec.ts` verbatim:

- **Cloud** (`beforeEach` + `afterEach`): `DELETE /e2e/cleanup` with `x-e2e-user-id` header
- **Local** (`afterEach`): `page.evaluate()` clearing all IndexedDB databases + `localStorage.clear()` + `sessionStorage.clear()`

---

## Page Object Changes

All additions go into existing files — no new page object files needed.

### `SettingsPage` — 4 new methods

```ts
navigateTo()
// page.goto('/settings')

triggerExport()
// page.waitForEvent('download') + click Export button → returns Download

triggerImport(filePath: string)
// page.locator('input[type="file"][accept=".json"]').setInputFiles(filePath)

waitForImportDone()
// waits for the "Import complete" success text visible in ImportCard
```

### `PantryPage` — 1 new method

```ts
clickItemCard(name: string)
// clicks the <h3> item heading to navigate to item detail
```

### `ItemPage` — 2 new methods

```ts
getTagBadge(name: string): Locator
// tag badge in the tags tab

getAssignedVendorBadge(name: string): Locator
// assigned vendor button (aria-pressed=true) in the vendors tab
```

### `RecipeDetailPage` — 1 new method

```ts
navigateToItemsFromCurrentUrl()
// reads /settings/recipes/{id} from current URL → goto /settings/recipes/{id}/items
```

### Unchanged — already sufficient

- `ShoppingPage.getItemCard(name)` — verify cart item
- `ItemPage.getLogEntries()` — verify log entry exists
- `RecipesPage.getRecipeCard(name)` — find and click "Fixture Recipe"
- `RecipeDetailPage.getAssignedItemCheckbox(name)` — verify ingredient

---

## Verification Summary

After every import (all 4 scenarios), assert:

1. `PantryPage.getItemCard('Fixture Item')` is visible
2. Item detail tags tab → `ItemPage.getTagBadge('Fixture Tag')` is visible
3. Item detail vendors tab → `ItemPage.getAssignedVendorBadge('Fixture Vendor')` is visible
4. Item detail log tab → `ItemPage.getLogEntries()` count ≥ 1
5. `/settings/recipes` → click "Fixture Recipe" → items tab → `RecipeDetailPage.getAssignedItemCheckbox('Fixture Item')` is visible
6. `/shopping` → `ShoppingPage.getItemCard('Fixture Item')` is visible
