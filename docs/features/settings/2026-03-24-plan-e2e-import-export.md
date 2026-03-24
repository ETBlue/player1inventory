# E2E Import/Export Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright E2E tests covering all four import mode combinations (local→local, cloud→cloud, cloud→local, local→cloud) with full relation verification after each import.

**Architecture:** Two spec files scoped by Playwright project (`local`/`cloud`), two JSON fixture files with all entity types fully cross-linked, and small additions to existing page objects. Same-mode tests do a full UI round-trip (export then import); cross-mode tests feed a pre-built fixture file directly to the import UI.

**Tech Stack:** Playwright, TypeScript, Dexie (IndexedDB), MongoDB/GraphQL (cloud), `makeGql` utility (`e2e/utils/cloud.ts`), `page.evaluate()` for IndexedDB seeding.

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Create | `e2e/fixtures/local-backup.json` | UUID-ID fixture simulating a local-mode export |
| Create | `e2e/fixtures/cloud-backup.json` | ObjectId-ID fixture simulating a cloud-mode export |
| Modify | `e2e/pages/SettingsPage.ts` | Add `navigateTo`, `triggerExport`, `triggerImport`, `waitForImportDone` |
| Modify | `e2e/pages/ItemPage.ts` | Add `getTagBadge`, `getAssignedVendorBadge` |
| Modify | `e2e/playwright.config.ts` | Add cloud spec to `testMatch` |
| Create | `e2e/tests/settings/import-export-local.spec.ts` | Tests 1 & 2 (local project) |
| Create | `e2e/tests/settings/import-export-cloud.spec.ts` | Tests 3 & 4 (cloud project) |

---

## Task 1: Create fixture files

**Files:**
- Create: `e2e/fixtures/local-backup.json`
- Create: `e2e/fixtures/cloud-backup.json`

No test needed — these are pure data files. All entities must be valid per the GraphQL input types in `apps/server/src/schema/import.graphql`. Do NOT include `userId` or `familyId` — the import mappers strip them.

- [ ] **Step 1: Create `e2e/fixtures/local-backup.json`**

```json
{
  "version": 1,
  "exportedAt": "2026-03-24T00:00:00.000Z",
  "tagTypes": [
    { "id": "aaaaaaaa-0000-0000-0000-000000000001", "name": "Fixture Category", "color": "blue" }
  ],
  "tags": [
    { "id": "aaaaaaaa-0000-0000-0000-000000000002", "name": "Fixture Tag", "typeId": "aaaaaaaa-0000-0000-0000-000000000001" }
  ],
  "vendors": [
    { "id": "aaaaaaaa-0000-0000-0000-000000000003", "name": "Fixture Vendor" }
  ],
  "items": [
    {
      "id": "aaaaaaaa-0000-0000-0000-000000000004",
      "name": "Fixture Item",
      "tagIds": ["aaaaaaaa-0000-0000-0000-000000000002"],
      "vendorIds": ["aaaaaaaa-0000-0000-0000-000000000003"],
      "targetUnit": "package",
      "targetQuantity": 1,
      "refillThreshold": 0,
      "packedQuantity": 0,
      "unpackedQuantity": 0,
      "consumeAmount": 1,
      "createdAt": "2026-03-24T00:00:00.000Z",
      "updatedAt": "2026-03-24T00:00:00.000Z"
    }
  ],
  "recipes": [
    {
      "id": "aaaaaaaa-0000-0000-0000-000000000005",
      "name": "Fixture Recipe",
      "items": [{ "itemId": "aaaaaaaa-0000-0000-0000-000000000004", "defaultAmount": 1 }]
    }
  ],
  "inventoryLogs": [
    {
      "id": "aaaaaaaa-0000-0000-0000-000000000006",
      "itemId": "aaaaaaaa-0000-0000-0000-000000000004",
      "delta": 1,
      "quantity": 1,
      "occurredAt": "2026-03-24T00:00:00.000Z"
    }
  ],
  "shoppingCarts": [
    {
      "id": "aaaaaaaa-0000-0000-0000-000000000007",
      "status": "active",
      "createdAt": "2026-03-24T00:00:00.000Z"
    }
  ],
  "cartItems": [
    {
      "id": "aaaaaaaa-0000-0000-0000-000000000008",
      "cartId": "aaaaaaaa-0000-0000-0000-000000000007",
      "itemId": "aaaaaaaa-0000-0000-0000-000000000004",
      "quantity": 2
    }
  ]
}
```

- [ ] **Step 2: Create `e2e/fixtures/cloud-backup.json`**

Same structure as above but with 24-hex MongoDB ObjectId strings as IDs. Each id is exactly 24 hex characters.

```json
{
  "version": 1,
  "exportedAt": "2026-03-24T00:00:00.000Z",
  "tagTypes": [
    { "id": "aaaaaa000000000000000001", "name": "Fixture Category", "color": "blue" }
  ],
  "tags": [
    { "id": "aaaaaa000000000000000002", "name": "Fixture Tag", "typeId": "aaaaaa000000000000000001" }
  ],
  "vendors": [
    { "id": "aaaaaa000000000000000003", "name": "Fixture Vendor" }
  ],
  "items": [
    {
      "id": "aaaaaa000000000000000004",
      "name": "Fixture Item",
      "tagIds": ["aaaaaa000000000000000002"],
      "vendorIds": ["aaaaaa000000000000000003"],
      "targetUnit": "package",
      "targetQuantity": 1,
      "refillThreshold": 0,
      "packedQuantity": 0,
      "unpackedQuantity": 0,
      "consumeAmount": 1,
      "createdAt": "2026-03-24T00:00:00.000Z",
      "updatedAt": "2026-03-24T00:00:00.000Z"
    }
  ],
  "recipes": [
    {
      "id": "aaaaaa000000000000000005",
      "name": "Fixture Recipe",
      "items": [{ "itemId": "aaaaaa000000000000000004", "defaultAmount": 1 }]
    }
  ],
  "inventoryLogs": [
    {
      "id": "aaaaaa000000000000000006",
      "itemId": "aaaaaa000000000000000004",
      "delta": 1,
      "quantity": 1,
      "occurredAt": "2026-03-24T00:00:00.000Z"
    }
  ],
  "shoppingCarts": [
    {
      "id": "aaaaaa000000000000000007",
      "status": "active",
      "createdAt": "2026-03-24T00:00:00.000Z"
    }
  ],
  "cartItems": [
    {
      "id": "aaaaaa000000000000000008",
      "cartId": "aaaaaa000000000000000007",
      "itemId": "aaaaaa000000000000000004",
      "quantity": 2
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add e2e/fixtures/local-backup.json e2e/fixtures/cloud-backup.json
git commit -m "test(e2e): add import/export fixture files (local UUID + cloud ObjectId)"
```

---

## Task 2: Add page object methods — SettingsPage

**Files:**
- Modify: `e2e/pages/SettingsPage.ts`

- [ ] **Step 1: Add imports and 4 methods to `SettingsPage`**

Open `e2e/pages/SettingsPage.ts`. Add `Download` to the Playwright import and add these methods to the class:

```ts
import type { Download, Page } from '@playwright/test'

export class SettingsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // existing createTagType method stays unchanged ...

  async navigateTo() {
    await this.page.goto('/settings')
  }

  async triggerExport(): Promise<Download> {
    // ExportCard button: t('settings.export.button') = "Download" (apps/web/src/i18n/locales/en.json:244)
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.page.getByRole('button', { name: 'Download' }).click(),
    ])
    return download
  }

  async triggerImport(filePath: string): Promise<void> {
    // Hidden file input in ImportCard (apps/web/src/components/settings/ImportCard/index.tsx:199-205)
    await this.page.locator('input[type="file"][accept=".json"]').setInputFiles(filePath)
  }

  async waitForImportDone(mode: 'local' | 'cloud'): Promise<void> {
    if (mode === 'local') {
      // Local import fires toast.success then resets to idle — no inline text shown
      // t('settings.import.success') = "Data imported successfully" (apps/web/src/i18n/locales/en.json:255)
      await this.page.getByText('Data imported successfully').waitFor({ state: 'visible', timeout: 15000 })
    } else {
      // Cloud import sets phase:'done' which renders inline text for 2 seconds
      // t('settings.import.importDone') = "Import complete." (apps/web/src/i18n/locales/en.json:254)
      await this.page.getByText('Import complete.').waitFor({ state: 'visible', timeout: 30000 })
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/pages/SettingsPage.ts
git commit -m "test(e2e): add import/export methods to SettingsPage"
```

---

## Task 3: Add page object methods — ItemPage

**Files:**
- Modify: `e2e/pages/ItemPage.ts`

Tag and vendor badges in the item detail tabs use `role="button"` with `aria-pressed` — same pattern as recipe badges already in `ItemPage`. Check `src/routes/items/$id/tags.tsx` and `src/routes/items/$id/vendors.tsx` to confirm the aria-label pattern matches `name` (exact: false).

- [ ] **Step 1: Add 2 methods to `ItemPage`**

Add at the end of the class in `e2e/pages/ItemPage.ts`:

```ts
getTagBadge(name: string): Locator {
  // Assigned tag badge: role="button" aria-pressed=true (src/routes/items/$id/tags.tsx)
  return this.page.getByRole('button', { name, exact: false, pressed: true })
}

getAssignedVendorBadge(name: string): Locator {
  // Assigned vendor badge: role="button" aria-pressed=true (src/routes/items/$id/vendors.tsx)
  // Same pattern as assignVendor() which clicks pressed:false to assign
  return this.page.getByRole('button', { name, exact: false, pressed: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/pages/ItemPage.ts
git commit -m "test(e2e): add getTagBadge and getAssignedVendorBadge to ItemPage"
```

---

## Task 4: Update Playwright config

**Files:**
- Modify: `e2e/playwright.config.ts`

- [ ] **Step 1: Add `import-export-cloud.spec.ts` to cloud project `testMatch`**

In `e2e/playwright.config.ts`, find the `testMatch` array in the `cloud` project config (around line 46) and add the new spec:

```ts
testMatch: [
  '**/item-management.spec.ts',
  '**/settings/tags.spec.ts',
  '**/settings/vendors.spec.ts',
  '**/settings/recipes.spec.ts',
  '**/cooking.spec.ts',
  '**/item-list-state-restore.spec.ts',
  '**/tests/shopping.spec.ts',
  '**/tests/item-logs.spec.ts',
  '**/settings/import-export-cloud.spec.ts',   // ← add this line
],
```

- [ ] **Step 2: Commit**

```bash
git add e2e/playwright.config.ts
git commit -m "test(e2e): add import-export-cloud spec to cloud project testMatch"
```

---

## Task 5: Write `import-export-local.spec.ts`

**Files:**
- Create: `e2e/tests/settings/import-export-local.spec.ts`

This file runs in the `local` Playwright project (no testMatch restriction — local runs all spec files). Contains two tests:
- Test 1: local → local round-trip (seed IndexedDB → export → clear → import → verify)
- Test 2: cloud → local (use `cloud-backup.json` fixture → import → verify)

**Teardown note:** Use the same `afterEach` pattern as `e2e/tests/shopping.spec.ts` for clearing IndexedDB.

**IndexedDB seeding note:** Navigate to `/` first so Dexie initialises the schema, then open `indexedDB.open('Player1Inventory')` and write records. The DB has tables: `items`, `tags`, `tagTypes`, `inventoryLogs`, `shoppingCarts`, `cartItems`, `vendors`, `recipes`.

- [ ] **Step 1: Create `e2e/tests/settings/import-export-local.spec.ts`**

```ts
import * as path from 'node:path'
import { test, expect } from '@playwright/test'
import { ItemPage } from '../../pages/ItemPage'
import { PantryPage } from '../../pages/PantryPage'
import { SettingsPage } from '../../pages/SettingsPage'
import { ShoppingPage } from '../../pages/ShoppingPage'
import { RecipesPage } from '../../pages/settings/RecipesPage'
import { RecipeDetailPage } from '../../pages/settings/RecipeDetailPage'
import localFixture from '../../fixtures/local-backup.json'
import cloudFixture from '../../fixtures/cloud-backup.json'

const CLOUD_FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/cloud-backup.json')

afterEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map(({ name }) => {
      return new Promise<void>((resolve, reject) => {
        if (!name) { resolve(); return }
        const req = indexedDB.deleteDatabase(name)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
        req.onblocked = () => { resolve() }
      })
    }))
    localStorage.clear()
    sessionStorage.clear()
  })
})

// Helper: seed all fixture entities into IndexedDB via page.evaluate
async function seedLocalFixture(page: import('@playwright/test').Page, fixture: typeof localFixture) {
  await page.goto('/')
  // Wait for Dexie to initialise the DB
  await page.waitForFunction(() => {
    return new Promise((resolve) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => { req.result.close(); resolve(true) }
      req.onerror = () => resolve(false)
    })
  })
  await page.evaluate(async (fixture) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const entries: [string, unknown[]][] = [
      ['tagTypes', fixture.tagTypes],
      ['tags', fixture.tags],
      ['vendors', fixture.vendors],
      ['items', fixture.items],
      ['recipes', fixture.recipes],
      ['inventoryLogs', fixture.inventoryLogs],
      ['shoppingCarts', fixture.shoppingCarts],
      ['cartItems', fixture.cartItems],
    ]
    for (const [storeName, records] of entries) {
      const tx = db.transaction([storeName], 'readwrite')
      const store = tx.objectStore(storeName)
      for (const record of records as object[]) {
        store.put(record)
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }
    db.close()
  }, fixture)
}

// Helper: run all 6 relation verifications after any import
async function verifyRelations(page: import('@playwright/test').Page) {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)
  const shopping = new ShoppingPage(page)
  const recipes = new RecipesPage(page)
  const recipeDetail = new RecipeDetailPage(page)

  // 1. Item in pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Fixture Item')).toBeVisible()

  // 2. Tag assigned to item
  await pantry.getItemCard('Fixture Item').click()
  await page.waitForURL(/\/items\//)
  await item.navigateToTab('tags')
  await expect(item.getTagBadge('Fixture Tag')).toBeVisible()

  // 3. Vendor assigned to item
  await item.navigateToTab('vendors')
  await expect(item.getAssignedVendorBadge('Fixture Vendor')).toBeVisible()

  // 4. Inventory log entry
  await item.navigateToLogTab()
  await expect(item.getLogEntries()).toHaveCount(1)

  // 5. Recipe has item as ingredient
  await recipes.navigateTo()
  await recipes.getRecipeCard('Fixture Recipe').click()
  await page.waitForURL(/\/settings\/recipes\//)
  const recipeId = page.url().match(/\/settings\/recipes\/([^/]+)/)?.[1]
  if (!recipeId) throw new Error('Could not extract recipe ID from URL')
  await recipeDetail.navigateToItems(recipeId)
  await expect(recipeDetail.getAssignedItemCheckbox('Fixture Item')).toBeVisible()

  // 6. Cart item in shopping page
  await shopping.navigateTo()
  await expect(shopping.getItemCard('Fixture Item')).toBeVisible()
}

test('user can export and re-import local data (local → local)', async ({ page }) => {
  const settings = new SettingsPage(page)

  // Given: all fixture entities seeded into IndexedDB
  await seedLocalFixture(page, localFixture as typeof localFixture)

  // When: export via UI
  await settings.navigateTo()
  const download = await settings.triggerExport()
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('Download path is null')

  // Then: clear IndexedDB
  await page.goto('/')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map(({ name }) => {
      return new Promise<void>((resolve) => {
        if (!name) { resolve(); return }
        const req = indexedDB.deleteDatabase(name)
        req.onsuccess = () => resolve()
        req.onblocked = () => resolve()
        req.onerror = () => resolve()
      })
    }))
  })

  // When: import the downloaded file
  await settings.navigateTo()
  await settings.triggerImport(downloadPath)
  await settings.waitForImportDone('local')

  // Then: verify all relations
  await verifyRelations(page)
})

test('user can import a cloud backup into local mode (cloud → local)', async ({ page }) => {
  const settings = new SettingsPage(page)

  // Given: no existing local data (fresh context from afterEach teardown)
  // When: import the cloud fixture directly (ObjectId IDs)
  await settings.navigateTo()
  await settings.triggerImport(CLOUD_FIXTURE_PATH)
  await settings.waitForImportDone('local')

  // Then: verify all relations
  await verifyRelations(page)
})
```

- [ ] **Step 2: Run local spec to verify both tests pass**

```bash
(cd /path/to/worktree && pnpm test:e2e --grep "local")
```

Expected: 2 tests pass in the `local` project.

If `getTagBadge` or `getAssignedVendorBadge` don't match, open `src/routes/items/$id/tags.tsx` and `src/routes/items/$id/vendors.tsx` to find the correct aria attributes and update the selectors in `ItemPage.ts`.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/settings/import-export-local.spec.ts
git commit -m "test(e2e): add local→local and cloud→local import E2E tests"
```

---

## Task 6: Write `import-export-cloud.spec.ts`

**Files:**
- Create: `e2e/tests/settings/import-export-cloud.spec.ts`

This file runs ONLY in the `cloud` Playwright project (added to `testMatch` in Task 4). Contains two tests:
- Test 3: cloud → cloud round-trip (seed via GraphQL → export → cleanup → import → verify)
- Test 4: local → cloud (use `local-backup.json` with UUID IDs → import → verify) ← regression test for the UUID bug

**Teardown note:** Use the same `beforeEach` + `afterEach` DELETE `/e2e/cleanup` pattern as `e2e/tests/shopping.spec.ts`.

**Cloud seeding note:** Use `makeGql` from `e2e/utils/cloud.ts`. Insert in dependency order: tagTypes → tags → vendors → items → recipes → inventoryLogs → shoppingCarts → cartItems.

- [ ] **Step 1: Create `e2e/tests/settings/import-export-cloud.spec.ts`**

```ts
import * as path from 'node:path'
import { test, expect } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../../constants'
import { makeGql } from '../../utils/cloud'
import { ItemPage } from '../../pages/ItemPage'
import { PantryPage } from '../../pages/PantryPage'
import { SettingsPage } from '../../pages/SettingsPage'
import { ShoppingPage } from '../../pages/ShoppingPage'
import { RecipesPage } from '../../pages/settings/RecipesPage'
import { RecipeDetailPage } from '../../pages/settings/RecipeDetailPage'
import cloudFixture from '../../fixtures/cloud-backup.json'

const LOCAL_FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/local-backup.json')

test.beforeEach(async ({ request }) => {
  await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
    headers: { 'x-e2e-user-id': E2E_USER_ID },
  })
})

test.afterEach(async ({ request }) => {
  await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
    headers: { 'x-e2e-user-id': E2E_USER_ID },
  })
})

// Helper: seed all fixture entities via GraphQL bulk create mutations.
// Use variables (not inline JSON strings) to avoid escaping issues.
async function seedCloudFixture(request: import('@playwright/test').APIRequestContext) {
  const gql = makeGql(request)

  // Insert in dependency order: tagTypes → tags → vendors → items → recipes → logs → carts → cartItems
  await gql(
    `mutation BulkCreateTagTypes($tagTypes: [TagTypeInput!]!) { bulkCreateTagTypes(tagTypes: $tagTypes) { id } }`,
    { tagTypes: cloudFixture.tagTypes },
  )
  await gql(
    `mutation BulkCreateTags($tags: [TagInput!]!) { bulkCreateTags(tags: $tags) { id } }`,
    { tags: cloudFixture.tags },
  )
  await gql(
    `mutation BulkCreateVendors($vendors: [VendorInput!]!) { bulkCreateVendors(vendors: $vendors) { id } }`,
    { vendors: cloudFixture.vendors },
  )
  await gql(
    `mutation BulkCreateItems($items: [ItemInput!]!) { bulkCreateItems(items: $items) { id } }`,
    { items: cloudFixture.items },
  )
  await gql(
    `mutation BulkCreateRecipes($recipes: [RecipeInput!]!) { bulkCreateRecipes(recipes: $recipes) { id } }`,
    { recipes: cloudFixture.recipes },
  )
  await gql(
    `mutation BulkCreateInventoryLogs($logs: [InventoryLogInput!]!) { bulkCreateInventoryLogs(logs: $logs) { id } }`,
    { logs: cloudFixture.inventoryLogs },
  )
  await gql(
    `mutation BulkCreateShoppingCarts($carts: [ShoppingCartInput!]!) { bulkCreateShoppingCarts(carts: $carts) { id } }`,
    { carts: cloudFixture.shoppingCarts },
  )
  await gql(
    `mutation BulkCreateCartItems($cartItems: [CartItemInput!]!) { bulkCreateCartItems(cartItems: $cartItems) { id } }`,
    { cartItems: cloudFixture.cartItems },
  )
}

// Helper: run all 6 relation verifications after any import
async function verifyRelations(page: import('@playwright/test').Page) {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)
  const shopping = new ShoppingPage(page)
  const recipes = new RecipesPage(page)
  const recipeDetail = new RecipeDetailPage(page)

  // 1. Item in pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Fixture Item')).toBeVisible()

  // 2. Tag assigned to item
  await pantry.getItemCard('Fixture Item').click()
  await page.waitForURL(/\/items\//)
  await item.navigateToTab('tags')
  await expect(item.getTagBadge('Fixture Tag')).toBeVisible()

  // 3. Vendor assigned to item
  await item.navigateToTab('vendors')
  await expect(item.getAssignedVendorBadge('Fixture Vendor')).toBeVisible()

  // 4. Inventory log entry
  await item.navigateToLogTab()
  await expect(item.getLogEntries()).toHaveCount(1)

  // 5. Recipe has item as ingredient
  await recipes.navigateTo()
  await recipes.getRecipeCard('Fixture Recipe').click()
  await page.waitForURL(/\/settings\/recipes\//)
  const recipeId = page.url().match(/\/settings\/recipes\/([^/]+)/)?.[1]
  if (!recipeId) throw new Error('Could not extract recipe ID from URL')
  await recipeDetail.navigateToItems(recipeId)
  await expect(recipeDetail.getAssignedItemCheckbox('Fixture Item')).toBeVisible()

  // 6. Cart item in shopping page
  await shopping.navigateTo()
  await expect(shopping.getItemCard('Fixture Item')).toBeVisible()
}

test('user can export and re-import cloud data (cloud → cloud)', async ({ page, request }) => {
  const settings = new SettingsPage(page)

  // Given: all fixture entities seeded via GraphQL
  await seedCloudFixture(request)

  // When: export via UI
  await settings.navigateTo()
  const download = await settings.triggerExport()
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('Download path is null')

  // Then: clear all cloud data
  await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
    headers: { 'x-e2e-user-id': E2E_USER_ID },
  })

  // When: import the downloaded file
  await settings.navigateTo()
  await settings.triggerImport(downloadPath)
  await settings.waitForImportDone('cloud')

  // Then: verify all relations
  await verifyRelations(page)
})

test('user can import a local backup into cloud mode (local → cloud)', async ({ page }) => {
  const settings = new SettingsPage(page)

  // Given: no existing cloud data (beforeEach cleanup ran)
  // When: import local fixture (UUID IDs — regression test for the UUID→ObjectId bug)
  await settings.navigateTo()
  await settings.triggerImport(LOCAL_FIXTURE_PATH)
  await settings.waitForImportDone('cloud')

  // Then: verify all relations
  await verifyRelations(page)
})
```

- [ ] **Step 2: Run cloud spec to verify both tests pass**

```bash
(cd /path/to/worktree && pnpm test:e2e --grep "cloud")
```

Expected: 2 tests pass in the `cloud` project (cloud→cloud and local→cloud). Test 4 (local→cloud with UUID IDs) is the key regression guard.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/settings/import-export-cloud.spec.ts
git commit -m "test(e2e): add cloud→cloud and local→cloud import E2E tests"
```

---

## Task 7: Run full E2E suite and verify

- [ ] **Step 1: Run all import/export E2E tests**

```bash
(cd /path/to/worktree && pnpm test:e2e --grep "import")
```

Expected: 4 tests pass (2 in `local` project, 2 in `cloud` project).

- [ ] **Step 2: Run full E2E suite to confirm no regressions**

```bash
(cd /path/to/worktree && pnpm test:e2e)
```

Expected: All existing tests still pass.

- [ ] **Step 3: Update `docs/INDEX.md`**

Mark the import/export E2E tests entry as ✅ in `docs/INDEX.md` (this file tracks feature status per CLAUDE.md SOP).
