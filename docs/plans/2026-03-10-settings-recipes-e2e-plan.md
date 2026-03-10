# Settings Recipes E2E Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full e2e test coverage for recipe management — recipes list page, new recipe page, and recipe detail page (Info + Items tabs including default amount adjustment).

**Architecture:** Hierarchical structure: `e2e/pages/settings/RecipesPage.ts` + `RecipeDetailPage.ts` for page objects, `e2e/tests/settings/recipes.spec.ts` for tests. Simple tests 1–2 use UI-driven setup (testing the create page flow); tests 3–6 seed IndexedDB via `page.evaluate()`.

**Tech Stack:** Playwright, `@playwright/test`, Dexie/IndexedDB (for seeding)

---

### Key Selectors Reference

- **Recipes list — "New Recipe" button:** `getByRole('button', { name: /new recipe/i })` (`src/routes/settings/recipes/index.tsx:33`)
- **New recipe page — Name input:** `getByLabel('Name')` (label `htmlFor="recipe-name"`, `src/components/recipe/RecipeNameForm/index.tsx:29`)
- **New recipe page — Save button:** `getByRole('button', { name: 'Save' })`
- **Recipe card — link:** `getByRole('link', { name: recipeName })` (RecipeCard Link, `src/components/recipe/RecipeCard/index.tsx:19`)
- **Recipe card — Delete button:** `getByRole('button', { name: \`Delete ${recipeName}\` })` (buttonAriaLabel, `src/components/recipe/RecipeCard/index.tsx:38`)
- **Delete confirm button:** `getByRole('button', { name: 'Delete' })` (DeleteButton `confirmLabel` defaults to `'Delete'`)
- **Detail Info — Name input:** `getByLabel('Name')` (same RecipeNameForm component)
- **Detail Info — Save button:** `getByRole('button', { name: 'Save' })`
- **Items tab — checkbox (unchecked):** `getByLabel(\`Add ${itemName}\`)` (`src/components/item/ItemCard/index.tsx:143`)
- **Items tab — checkbox (checked):** `getByLabel(\`Remove ${itemName}\`)`
- **Items tab — Decrease button:** `getByRole('button', { name: \`Decrease quantity of ${itemName}\` })` (`src/components/item/ItemCard/index.tsx:157`)
- **Items tab — Increase button:** `getByRole('button', { name: \`Increase quantity of ${itemName}\` })` (`src/components/item/ItemCard/index.tsx:173`)
- **Items tab — amount display:** sibling `<span>` between the ±buttons — locate via `.locator('span').filter({ hasText: /^\d+$/ })` scoped to the item row

---

### Task 1: Create page objects and spec stub

**Files:**
- Create: `e2e/pages/settings/RecipesPage.ts`
- Create: `e2e/pages/settings/RecipeDetailPage.ts`
- Create: `e2e/tests/settings/recipes.spec.ts`

**Step 1: Create the files**

Create `e2e/pages/settings/RecipesPage.ts`:

```ts
import type { Page, Locator } from '@playwright/test'

export class RecipesPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/settings/recipes')
  }

  async clickNewRecipe() {
    // "New Recipe" button in toolbar (src/routes/settings/recipes/index.tsx:33)
    await this.page.getByRole('button', { name: /new recipe/i }).click()
  }

  async fillRecipeName(name: string) {
    // Name input: label htmlFor="recipe-name" (src/components/recipe/RecipeNameForm/index.tsx:29)
    await this.page.getByLabel('Name').fill(name)
  }

  async clickSave() {
    // Save button in RecipeNameForm (src/components/recipe/RecipeNameForm/index.tsx:38)
    await this.page.getByRole('button', { name: 'Save' }).click()
  }

  getRecipeCard(name: string): Locator {
    // RecipeCard link text (src/components/recipe/RecipeCard/index.tsx:19)
    return this.page.getByRole('link', { name })
  }

  async clickDeleteRecipe(name: string) {
    // buttonAriaLabel="Delete ${recipe.name}" on trash DeleteButton (src/components/recipe/RecipeCard/index.tsx:38)
    await this.page.getByRole('button', { name: `Delete ${name}` }).click()
  }

  async confirmDelete() {
    // AlertDialog confirm — DeleteButton confirmLabel defaults to 'Delete'
    await this.page.getByRole('button', { name: 'Delete' }).click()
  }
}
```

Create `e2e/pages/settings/RecipeDetailPage.ts`:

```ts
import type { Page, Locator } from '@playwright/test'

export class RecipeDetailPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo(id: string) {
    await this.page.goto(`/settings/recipes/${id}`)
  }

  async navigateToItems(id: string) {
    await this.page.goto(`/settings/recipes/${id}/items`)
  }

  async fillName(name: string) {
    // Name input: label htmlFor="recipe-name" (src/components/recipe/RecipeNameForm/index.tsx:29)
    await this.page.getByLabel('Name').fill(name)
  }

  async clickSave() {
    // Save button in RecipeNameForm (src/components/recipe/RecipeNameForm/index.tsx:38)
    await this.page.getByRole('button', { name: 'Save' }).click()
  }

  getItemCheckbox(name: string): Locator {
    // Unchecked: aria-label="Add {name}" (src/components/item/ItemCard/index.tsx:143)
    return this.page.getByLabel(`Add ${name}`)
  }

  getAssignedItemCheckbox(name: string): Locator {
    // Checked: aria-label="Remove {name}" (src/components/item/ItemCard/index.tsx:143)
    return this.page.getByLabel(`Remove ${name}`)
  }

  async toggleItem(name: string) {
    // Click whichever checkbox state is currently showing
    const addCheckbox = this.page.getByLabel(`Add ${name}`)
    const removeCheckbox = this.page.getByLabel(`Remove ${name}`)
    const isAdd = await addCheckbox.isVisible()
    if (isAdd) {
      await addCheckbox.click()
    } else {
      await removeCheckbox.click()
    }
  }

  async clickIncreaseAmount(name: string) {
    // aria-label="Increase quantity of {name}" (src/components/item/ItemCard/index.tsx:173)
    await this.page.getByRole('button', { name: `Increase quantity of ${name}` }).click()
  }

  async clickDecreaseAmount(name: string) {
    // aria-label="Decrease quantity of {name}" (src/components/item/ItemCard/index.tsx:157)
    await this.page.getByRole('button', { name: `Decrease quantity of ${name}` }).click()
  }

  getAmountDisplay(name: string): Locator {
    // The <span> showing controlAmount between ±buttons, scoped to the item row
    // The span is a sibling of the Decrease/Increase buttons inside the absolute-positioned div
    return this.page.getByRole('button', { name: `Decrease quantity of ${name}` })
      .locator('xpath=following-sibling::span[1]')
  }
}
```

Create `e2e/tests/settings/recipes.spec.ts` as a stub:

```ts
import { test } from '@playwright/test'

// Tests will be added in Tasks 2-7
```

**Step 2: Verify files exist**

```bash
ls e2e/pages/settings/
ls e2e/tests/settings/
```

Expected: `RecipesPage.ts`, `RecipeDetailPage.ts`, `TagsPage.ts`, `TagDetailPage.ts` in pages/settings/; `recipes.spec.ts`, `tags.spec.ts` in tests/settings/.

**Step 3: Commit**

```bash
git add e2e/pages/settings/RecipesPage.ts e2e/pages/settings/RecipeDetailPage.ts e2e/tests/settings/recipes.spec.ts
git commit -m "feat(e2e): add settings recipes page objects and test stub"
```

---

### Task 2: Add shared teardown and seed helpers

**Files:**
- Modify: `e2e/tests/settings/recipes.spec.ts`

**Step 1: Replace stub with teardown + seed helpers**

```ts
import { test, expect, type Page } from '@playwright/test'
import { RecipesPage } from '../../pages/settings/RecipesPage'
import { RecipeDetailPage } from '../../pages/settings/RecipeDetailPage'

// Seed recipes (and optionally items) directly into IndexedDB.
// Navigate to '/' first so Dexie initialises the DB schema.
async function seedRecipe(
  page: Page,
  recipeName: string,
  items: { name: string; defaultAmount: number }[] = [],
): Promise<{ recipeId: string; itemIds: string[] }> {
  await page.goto('/')

  const recipeId = crypto.randomUUID()
  const itemIds = items.map(() => crypto.randomUUID())
  const now = new Date().toISOString()

  await page.evaluate(
    async ({ recipeId, itemIds, recipeName, items, now }) => {
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

      // Seed items first (recipe references them)
      for (let i = 0; i < items.length; i++) {
        await put('items', {
          id: itemIds[i],
          name: items[i].name,
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 0,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
      }

      // Seed recipe with item references
      await put('recipes', {
        id: recipeId,
        name: recipeName,
        items: items.map((item, i) => ({
          itemId: itemIds[i],
          defaultAmount: item.defaultAmount,
        })),
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
    },
    { recipeId, itemIds, recipeName, items, now },
  )

  return { recipeId, itemIds }
}

test.afterEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(
      dbs.map(({ name }) => {
        return new Promise<void>((resolve, reject) => {
          if (!name) { resolve(); return }
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

// Tests will be added in Tasks 3-8
```

**Step 2: Run to verify no parse errors**

```bash
pnpm test:e2e e2e/tests/settings/recipes.spec.ts
```

Expected: 0 tests, no errors.

**Step 3: Commit**

```bash
git add e2e/tests/settings/recipes.spec.ts
git commit -m "feat(e2e): add seed helper and teardown for recipes e2e"
```

---

### Task 3: Test — user can create a recipe

**Files:**
- Modify: `e2e/tests/settings/recipes.spec.ts`

**Step 1: Add the test**

```ts
test('user can create a recipe', async ({ page }) => {
  const recipes = new RecipesPage(page)

  // Given: recipes list is empty
  await recipes.navigateTo()

  // When: user clicks "New Recipe"
  await recipes.clickNewRecipe()

  // And: fills the name and saves
  await recipes.fillRecipeName('Pancakes')
  await recipes.clickSave()

  // Then: redirected to detail page — navigate back to list to verify
  await recipes.navigateTo()
  await expect(recipes.getRecipeCard('Pancakes')).toBeVisible()
})
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/recipes.spec.ts --grep "user can create a recipe$"
```

Expected: PASS.

**Step 3: Commit**

```bash
git add e2e/tests/settings/recipes.spec.ts
git commit -m "feat(e2e): test user can create a recipe"
```

---

### Task 4: Test — user can navigate to recipe detail after creating

**Files:**
- Modify: `e2e/tests/settings/recipes.spec.ts`

**Step 1: Add the test**

```ts
test('user can navigate to recipe detail after creating', async ({ page }) => {
  const recipes = new RecipesPage(page)

  // Given: recipes list is empty
  await recipes.navigateTo()

  // When: user creates "Pancakes"
  await recipes.clickNewRecipe()
  await recipes.fillRecipeName('Pancakes')
  await recipes.clickSave()

  // Then: URL is /settings/recipes/<id> (detail page)
  await expect(page).toHaveURL(/\/settings\/recipes\/[^/]+$/)
})
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/recipes.spec.ts --grep "navigate to recipe detail after creating"
```

Expected: PASS.

**Step 3: Commit**

```bash
git add e2e/tests/settings/recipes.spec.ts
git commit -m "feat(e2e): test user can navigate to recipe detail after creating"
```

---

### Task 5: Test — user can delete a recipe

**Files:**
- Modify: `e2e/tests/settings/recipes.spec.ts`

**Step 1: Add the test**

```ts
test('user can delete a recipe', async ({ page }) => {
  const recipes = new RecipesPage(page)

  // Given: recipe "Pancakes" exists (seeded via IndexedDB)
  await seedRecipe(page, 'Pancakes')

  // When: navigate to recipes list
  await recipes.navigateTo()
  await expect(recipes.getRecipeCard('Pancakes')).toBeVisible()

  // And: user clicks delete and confirms
  await recipes.clickDeleteRecipe('Pancakes')
  await recipes.confirmDelete()

  // Then: "Pancakes" card is gone
  await expect(recipes.getRecipeCard('Pancakes')).not.toBeVisible()
})
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/recipes.spec.ts --grep "user can delete a recipe"
```

Expected: PASS.

**Note on confirmDelete:** If there are two "Delete" buttons visible simultaneously (the trigger and the confirm), Playwright will throw a strict-mode error. In practice: after clicking the trigger, the AlertDialog opens and the trigger button is no longer in the DOM. `getByRole('button', { name: 'Delete' })` should match only the AlertDialogAction. If strict mode still fails, scope to the alertdialog: `page.getByRole('alertdialog').getByRole('button', { name: 'Delete' })` and update `confirmDelete()` in RecipesPage accordingly.

**Step 3: Commit**

```bash
git add e2e/tests/settings/recipes.spec.ts e2e/pages/settings/RecipesPage.ts
git commit -m "feat(e2e): test user can delete a recipe"
```

---

### Task 6: Test — user can edit recipe name on Info tab

**Files:**
- Modify: `e2e/tests/settings/recipes.spec.ts`

**Step 1: Add the test**

```ts
test('user can edit recipe name on Info tab', async ({ page }) => {
  const detail = new RecipeDetailPage(page)

  // Given: recipe "Pancakes" exists
  const { recipeId } = await seedRecipe(page, 'Pancakes')

  // When: navigate to detail page (Info tab is default)
  await detail.navigateTo(recipeId)

  // And: change name to "Waffles" and save
  await detail.fillName('Waffles')
  await detail.clickSave()

  // Then: re-navigate to verify persistence
  await detail.navigateTo(recipeId)
  await expect(page.getByLabel('Name')).toHaveValue('Waffles')
})
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/recipes.spec.ts --grep "edit recipe name"
```

Expected: PASS.

**Note:** After save, `goBack()` navigates away. The test re-navigates directly to the detail page to verify persistence. If the input still shows the old value on re-navigation (race condition), add `await page.waitForURL(/\/settings\/recipes\/${recipeId}/)` before the assertion.

**Step 3: Commit**

```bash
git add e2e/tests/settings/recipes.spec.ts
git commit -m "feat(e2e): test user can edit recipe name on Info tab"
```

---

### Task 7: Test — user can assign and unassign an item

**Files:**
- Modify: `e2e/tests/settings/recipes.spec.ts`

**Step 1: Add the test**

```ts
test('user can assign and unassign an item on Items tab', async ({ page }) => {
  const detail = new RecipeDetailPage(page)

  // Given: recipe "Pancakes" with no items; item "Eggs" exists (unassigned)
  const { recipeId } = await seedRecipe(page, 'Pancakes', [])
  // Seed "Eggs" as a separate item (not in recipe)
  await seedRecipe(page, '__seed_only__', [{ name: 'Eggs', defaultAmount: 0 }])
  // Actually: seed Eggs by creating a dummy recipe that just creates the item,
  // then use a different approach — seed the item directly
  // (see Note below for the simpler approach)

  // When: navigate to Items tab
  await detail.navigateToItems(recipeId)

  // Then: "Eggs" shows as unassigned
  await expect(detail.getItemCheckbox('Eggs')).toBeVisible()

  // When: check the checkbox (assign)
  await detail.toggleItem('Eggs')

  // Then: "Eggs" shows as assigned
  await expect(detail.getAssignedItemCheckbox('Eggs')).toBeVisible()

  // When: uncheck (unassign)
  await detail.toggleItem('Eggs')

  // Then: "Eggs" shows as unassigned again
  await expect(detail.getItemCheckbox('Eggs')).toBeVisible()
})
```

**Note:** The above uses two `seedRecipe` calls to create the item "Eggs". A cleaner approach is to add a standalone `seedItem` helper (same pattern as in `tags.spec.ts`). Add this helper to `recipes.spec.ts`:

```ts
async function seedItem(page: Page, name: string): Promise<string> {
  const itemId = crypto.randomUUID()
  const now = new Date().toISOString()
  await page.evaluate(
    async ({ itemId, name, now }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('items', 'readwrite')
        const req = tx.objectStore('items').put({
          id: itemId, name, tagIds: [], vendorIds: [],
          targetUnit: 'package', targetQuantity: 0, refillThreshold: 0,
          packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1,
          createdAt: new Date(now), updatedAt: new Date(now),
        })
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    },
    { itemId, name, now },
  )
  return itemId
}
```

Then rewrite the test:

```ts
test('user can assign and unassign an item on Items tab', async ({ page }) => {
  const detail = new RecipeDetailPage(page)

  // Given: recipe "Pancakes" (no items) and unassigned item "Eggs"
  const { recipeId } = await seedRecipe(page, 'Pancakes')
  await seedItem(page, 'Eggs')

  // When: navigate to Items tab
  await detail.navigateToItems(recipeId)

  // Then: "Eggs" shows as unassigned (Add checkbox visible)
  await expect(detail.getItemCheckbox('Eggs')).toBeVisible()

  // When: check (assign)
  await detail.toggleItem('Eggs')

  // Then: "Eggs" shows as assigned (Remove checkbox visible)
  await expect(detail.getAssignedItemCheckbox('Eggs')).toBeVisible()

  // When: uncheck (unassign)
  await detail.toggleItem('Eggs')

  // Then: back to unassigned
  await expect(detail.getItemCheckbox('Eggs')).toBeVisible()
})
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/recipes.spec.ts --grep "assign and unassign"
```

Expected: PASS.

**Step 3: Commit**

```bash
git add e2e/tests/settings/recipes.spec.ts
git commit -m "feat(e2e): test user can assign and unassign item on Items tab"
```

---

### Task 8: Test — user can adjust default amount for an assigned item

**Files:**
- Modify: `e2e/tests/settings/recipes.spec.ts`

**Step 1: Add the test**

```ts
test('user can adjust default amount for an assigned item', async ({ page }) => {
  const detail = new RecipeDetailPage(page)

  // Given: recipe "Pancakes" with "Flour" assigned at defaultAmount=2
  const { recipeId } = await seedRecipe(page, 'Pancakes', [
    { name: 'Flour', defaultAmount: 2 },
  ])

  // When: navigate to Items tab
  await detail.navigateToItems(recipeId)

  // Then: Flour is assigned (Remove checkbox visible) and amount is 2
  await expect(detail.getAssignedItemCheckbox('Flour')).toBeVisible()
  await expect(detail.getAmountDisplay('Flour')).toHaveText('2')

  // When: click + (increase)
  await detail.clickIncreaseAmount('Flour')

  // Then: amount is 3 (step = consumeAmount = 1)
  await expect(detail.getAmountDisplay('Flour')).toHaveText('3')

  // When: click − twice
  await detail.clickDecreaseAmount('Flour')
  await detail.clickDecreaseAmount('Flour')

  // Then: amount is 1
  await expect(detail.getAmountDisplay('Flour')).toHaveText('1')
})
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/recipes.spec.ts --grep "adjust default amount"
```

Expected: PASS.

**Note on `getAmountDisplay`:** The locator uses XPath `following-sibling::span[1]` relative to the Decrease button. If this locator is unreliable, alternative approach:

```ts
getAmountDisplay(name: string): Locator {
  // The amount span is between the Decrease and Increase buttons
  // Scope to the container div that holds all three elements
  const decreaseBtn = this.page.getByRole('button', { name: `Decrease quantity of ${name}` })
  return decreaseBtn.locator('xpath=parent::div/span')
}
```

**Note on step size:** The step size for amount adjustment is `item.consumeAmount` (`src/routes/settings/recipes/$id/items.tsx:250`). We seed `consumeAmount: 1` in `seedRecipe`, so each click changes the amount by 1. If you seed a different `consumeAmount`, adjust the expected values accordingly.

**Step 3: Run all recipes tests**

```bash
pnpm test:e2e e2e/tests/settings/recipes.spec.ts
```

Expected: 6 tests, all PASS.

**Step 4: Commit**

```bash
git add e2e/tests/settings/recipes.spec.ts e2e/pages/settings/RecipeDetailPage.ts
git commit -m "feat(e2e): test user can adjust default amount for assigned item"
```

---

### Task 9: Run full e2e suite and verify no regressions

**Step 1: Run all e2e tests**

```bash
pnpm test:e2e
```

Expected: All tests pass (shopping, cooking, item-management, settings/tags, settings/recipes).

**Step 2: If any test fails, investigate**

Common causes:
- `confirmDelete()` strict-mode error (two "Delete" buttons) → scope to `alertdialog` role
- `getAmountDisplay` XPath locator breaks → use parent div approach from Task 8 notes
- `seedItem` called after `seedRecipe` — both call `page.goto('/')` which is idempotent, fine

**Step 3: Commit any fixes**

```bash
pnpm test:e2e
```

Expected: All pass.
