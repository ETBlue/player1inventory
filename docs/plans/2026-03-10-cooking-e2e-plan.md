# Cooking E2E Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an e2e test for the cooking page happy path — check recipe, expand, uncheck one item, increase servings, confirm, and verify correct inventory deduction.

**Architecture:** Two new files following existing conventions: a `CookingPage` page object (`e2e/pages/CookingPage.ts`) and a test file (`e2e/tests/cooking.spec.ts`). Test setup seeds the database via `page.evaluate()` to skip UI-based recipe creation. Verification navigates to pantry and checks item detail quantities.

**Tech Stack:** Playwright (`@playwright/test`), raw IndexedDB API for seeding, existing page objects (`PantryPage`, `ItemPage`).

---

### Task 1: Create the `CookingPage` page object

**Files:**
- Create: `e2e/pages/CookingPage.ts`

**Step 1: Create the file**

```typescript
import type { Page } from '@playwright/test'

export class CookingPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/cooking')
  }

  async checkRecipe(name: string) {
    // Recipe-level checkbox: aria-label={recipe.name} (src/routes/cooking.tsx:438)
    await this.page.getByLabel(name).click()
  }

  async expandRecipe(name: string) {
    // Expand/collapse chevron: aria-label=`Expand ${recipe.name}` (src/routes/cooking.tsx:456)
    await this.page.getByLabel(`Expand ${name}`).click()
  }

  async uncheckItem(name: string) {
    // Per-item checkbox when item is checked: aria-label=`Remove ${item.name}` (src/components/item/ItemCard/index.tsx:143)
    await this.page.getByLabel(`Remove ${name}`).click()
  }

  async increaseServings() {
    // Serving stepper + button: aria-label="Increase servings" (src/routes/cooking.tsx:489)
    await this.page.getByLabel('Increase servings').click()
  }

  async clickDone() {
    // Done button in toolbar — always visible, disabled when nothing checked (src/routes/cooking.tsx)
    await this.page.getByRole('button', { name: 'Done' }).click()
  }

  async confirmDone() {
    // Done confirmation dialog title: "Consume from N recipe(s)?" — confirm button: "Confirm"
    // (src/routes/cooking.tsx:601)
    await this.page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  }
}
```

**Step 2: Verify file compiles**

```bash
cd /Users/etblue/Code/GitHub/player1inventory
npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to the new file).

**Step 3: Commit**

```bash
git add e2e/pages/CookingPage.ts
git commit -m "feat(e2e): add CookingPage page object"
```

---

### Task 2: Create the cooking e2e test

**Files:**
- Create: `e2e/tests/cooking.spec.ts`

**Step 1: Create the file**

```typescript
import { test, expect } from '@playwright/test'
import { CookingPage } from '../pages/CookingPage'
import { PantryPage } from '../pages/PantryPage'
import { ItemPage } from '../pages/ItemPage'

// Seed items and a recipe directly into IndexedDB.
// This avoids 10-15 UI steps for creating items + recipe before testing cooking.
// The app must load at '/' first so Dexie initialises the DB schema.
async function seedDatabase(page: typeof test.prototype['page']) {
  await page.goto('/')

  // Generate IDs in Node context so we can return them for later verification
  const flourId = crypto.randomUUID()
  const eggsId = crypto.randomUUID()
  const recipeId = crypto.randomUUID()
  const now = new Date().toISOString()

  await page.evaluate(
    async ({ flourId, eggsId, recipeId, now }) => {
      // Open the already-initialised DB (Dexie created it on page load)
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      const put = (storeName: string, record: object) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite')
          const req = tx.objectStore(storeName).put(record)
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error)
        })

      await put('items', {
        id: flourId,
        name: 'Flour',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 10,
        unpackedQuantity: 0,
        consumeAmount: 1,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      await put('items', {
        id: eggsId,
        name: 'Eggs',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 12,
        unpackedQuantity: 0,
        consumeAmount: 1,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })

      await put('recipes', {
        id: recipeId,
        name: 'Pancakes',
        items: [
          { itemId: flourId, defaultAmount: 2 },
          { itemId: eggsId, defaultAmount: 3 },
        ],
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
    },
    { flourId, eggsId, recipeId, now },
  )

  return { flourId, eggsId, recipeId }
}

test.afterEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(
      dbs.map(({ name }) => {
        return new Promise<void>((resolve, reject) => {
          if (!name) {
            resolve()
            return
          }
          const req = indexedDB.deleteDatabase(name)
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error)
          req.onblocked = () => {
            console.warn(`[afterEach] IndexedDB delete blocked for "${name}"...`)
            resolve()
          }
        })
      }),
    )
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('user can cook a recipe with partial items and multiple servings', async ({ page }) => {
  const cooking = new CookingPage(page)
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given: items "Flour" (qty 10) and "Eggs" (qty 12) exist, linked in "Pancakes" recipe
  await seedDatabase(page)

  // When: navigate to cooking page
  await cooking.navigateTo()

  // And: check "Pancakes" recipe (both items checked by default since defaultAmount > 0)
  await expect(page.getByLabel('Pancakes')).toBeVisible()
  await cooking.checkRecipe('Pancakes')

  // And: expand the recipe to see items
  await cooking.expandRecipe('Pancakes')

  // And: uncheck "Eggs" (leave only Flour checked)
  await expect(page.getByLabel('Remove Eggs')).toBeVisible()
  await cooking.uncheckItem('Eggs')

  // And: increase servings from 1 to 2
  await cooking.increaseServings()

  // And: click Done and confirm
  await cooking.clickDone()
  await cooking.confirmDone()

  // Then: navigate to pantry and verify Flour quantity reduced by 2 servings × 2 defaultAmount = 4
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Flour')).toBeVisible()
  await pantry.getItemCard('Flour').click()
  await expect(item.getPackedQuantityInput()).toHaveValue('6')

  // And: navigate back to pantry and verify Eggs quantity unchanged (was unchecked)
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Eggs')).toBeVisible()
  await pantry.getItemCard('Eggs').click()
  await expect(item.getPackedQuantityInput()).toHaveValue('12')
})
```

**Step 2: Run the test (expect it to fail initially — this confirms the test is wired up)**

```bash
cd /Users/etblue/Code/GitHub/player1inventory
pnpm test:e2e e2e/tests/cooking.spec.ts
```

Expected: The test runs. If it fails due to a selector mismatch, read the error and adjust the selector in `CookingPage.ts`. Common issues:
- Aria label casing — check `cooking.tsx` and `ItemCard/index.tsx` for exact strings
- The recipe checkbox `getByLabel('Pancakes')` might match multiple elements if the recipe name also appears in headings — scope it with `.first()` if needed

**Step 3: Fix any selector issues and re-run until green**

```bash
pnpm test:e2e e2e/tests/cooking.spec.ts
```

Expected: `1 passed`

**Step 4: Commit**

```bash
git add e2e/tests/cooking.spec.ts
git commit -m "feat(e2e): add cooking happy path e2e test"
```

---

### Task 3: Verify full e2e suite still passes

**Step 1: Run all e2e tests**

```bash
pnpm test:e2e
```

Expected: All tests pass (item-management, shopping, cooking).

**Step 2: Commit (only if any fixes were needed)**

If Task 3 required no fixes, no additional commit is needed.
