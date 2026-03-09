# Playwright E2E Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Playwright E2E tests with Page Object Model pattern, starting with a 5-test item management suite.

**Architecture:** Standalone `e2e/` folder at repo root with `playwright.config.ts`, `pages/` for POMs, and `tests/` for specs. Playwright connects to the Vite dev server via `webServer` config with `reuseExistingServer: true` — no impact on a running dev server. Tests use Page Object Model: page classes own selectors and actions; spec files read like user stories.

**Tech Stack:** Playwright (`playwright` already in devDependencies), TypeScript, Vite dev server (`pnpm dev` on port 5173)

---

### Task 1: Install Playwright browsers and configure

**Files:**
- Create: `e2e/playwright.config.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Step 1: Install Playwright browsers**

Playwright is already in `devDependencies` but browsers must be installed separately:

```bash
pnpm playwright install chromium
```

Expected: Chromium browser downloaded to `~/.cache/ms-playwright/`. No errors.

**Step 2: Create `e2e/playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
```

**Step 3: Add scripts to `package.json`**

In the `"scripts"` section, add three entries after `"test:ui"`:

```json
"test:e2e": "playwright test --config=e2e/playwright.config.ts",
"test:e2e:ui": "playwright test --config=e2e/playwright.config.ts --ui",
"test:e2e:debug": "playwright test --config=e2e/playwright.config.ts --debug"
```

**Step 4: Add Playwright artifacts to `.gitignore`**

Append to `.gitignore`:

```
# Playwright
playwright-report
test-results
```

**Step 5: Verify config is valid**

```bash
pnpm test:e2e --list
```

Expected: `0 tests` listed with no errors. If `pnpm dev` isn't running, Playwright will start it automatically — this is fine.

**Step 6: Commit**

```bash
git add e2e/playwright.config.ts package.json .gitignore
git commit -m "chore(e2e): add Playwright config and scripts"
```

---

### Task 2: Create PantryPage POM

**Files:**
- Create: `e2e/pages/PantryPage.ts`
- Create: `e2e/tests/item-management.spec.ts` (skeleton)

**Step 1: Write a failing test that imports PantryPage**

Create `e2e/tests/item-management.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { PantryPage } from '../pages/PantryPage'

test('user can create an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  await pantry.navigateTo()
  await pantry.clickAddItem()
  // ItemPage interaction added in next task
})
```

**Step 2: Run to confirm error**

```bash
pnpm test:e2e
```

Expected: FAIL — `Cannot find module '../pages/PantryPage'`

**Step 3: Create `e2e/pages/PantryPage.ts`**

```typescript
import type { Page, Locator } from '@playwright/test'

export class PantryPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/')
  }

  async clickAddItem() {
    // The add-item button uses aria-label="Add item" (src/routes/index.tsx:201)
    await this.page.getByRole('button', { name: 'Add item' }).click()
  }

  async searchFor(name: string) {
    await this.page.getByRole('searchbox').fill(name)
  }

  getItemCard(name: string): Locator {
    // Item cards are rendered as list items containing the item name
    return this.page.getByRole('listitem').filter({ hasText: name })
  }
}
```

**Step 4: Run test**

```bash
pnpm test:e2e
```

Expected: Test runs (no import error). It will likely fail at `clickAddItem` if it navigates to `/items/new` instead of clicking a button — that's fine, we fix it in the next task. If selectors don't match, use `pnpm test:e2e:ui` to inspect the UI interactively.

**Step 5: Commit**

```bash
git add e2e/pages/PantryPage.ts e2e/tests/item-management.spec.ts
git commit -m "feat(e2e): add PantryPage POM"
```

---

### Task 3: Create ItemPage POM

**Files:**
- Create: `e2e/pages/ItemPage.ts`
- Modify: `e2e/tests/item-management.spec.ts`

**Step 1: Update the test to use ItemPage**

Replace `e2e/tests/item-management.spec.ts` with:

```typescript
import { test, expect } from '@playwright/test'
import { ItemPage } from '../pages/ItemPage'
import { PantryPage } from '../pages/PantryPage'

test('user can create an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given user is on the pantry page
  await pantry.navigateTo()

  // When user creates a new item
  await pantry.clickAddItem()
  await item.fillName('Test Milk')
  await item.save()

  // Then the item appears in the pantry list
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Test Milk')).toBeVisible()
})
```

**Step 2: Run to confirm error**

```bash
pnpm test:e2e
```

Expected: FAIL — `Cannot find module '../pages/ItemPage'`

**Step 3: Create `e2e/pages/ItemPage.ts`**

```typescript
import type { Page } from '@playwright/test'

export class ItemPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async fillName(name: string) {
    // The name field is a text input labeled "Name" in ItemForm
    await this.page.getByLabel('Name').fill(name)
  }

  async save() {
    await this.page.getByRole('button', { name: /save/i }).click()
  }

  async navigateToTab(tab: string) {
    await this.page.getByRole('tab', { name: tab }).click()
  }

  async delete() {
    // DeleteButton opens a confirmation dialog — confirm it
    await this.page.getByRole('button', { name: /delete/i }).click()
    await this.page.getByRole('button', { name: /delete/i }).last().click()
  }

  async createAndAssignTag(name: string) {
    await this.navigateToTab('Tags')
    await this.page.getByRole('button', { name: /new tag/i }).click()
    await this.page.getByRole('dialog').getByRole('textbox').fill(name)
    await this.page.getByRole('dialog').getByRole('button', { name: /add/i }).click()
  }

  async createAndAssignVendor(name: string) {
    await this.navigateToTab('Vendors')
    await this.page.getByRole('button', { name: /new vendor/i }).click()
    await this.page.getByRole('dialog').getByRole('textbox').fill(name)
    await this.page.getByRole('dialog').getByRole('button', { name: /add/i }).click()
  }
}
```

Note: Tab names (`Tags`, `Vendors`) and dialog button text (`Add`) must match the actual UI. Check `src/routes/items/$id.tsx` and `src/components/AddNameDialog/index.tsx` for exact labels if tests fail.

**Step 4: Run test**

```bash
pnpm test:e2e
```

Expected: First test passes. If selectors fail, use `pnpm test:e2e:ui` to inspect and adjust.

**Step 5: Commit**

```bash
git add e2e/pages/ItemPage.ts e2e/tests/item-management.spec.ts
git commit -m "feat(e2e): add ItemPage POM"
```

---

### Task 4: Write remaining four item management tests

**Files:**
- Modify: `e2e/tests/item-management.spec.ts`

**Step 1: Append the remaining 4 tests to the spec file**

Add after the first test:

```typescript
test('user can edit an item name', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an existing item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Edit Me')
  await item.save()

  // When user navigates back and reopens the item to edit it
  await pantry.navigateTo()
  await pantry.getItemCard('Edit Me').click()
  await item.fillName('Edited Name')
  await item.save()

  // Then the updated name appears in the pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Edited Name')).toBeVisible()
  await expect(pantry.getItemCard('Edit Me')).not.toBeVisible()
})

test('user can assign a tag to an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given a new item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Tagged Item')
  await item.save()

  // When user creates and assigns a tag inline
  await pantry.navigateTo()
  await pantry.getItemCard('Tagged Item').click()
  await item.createAndAssignTag('Dairy')

  // Then the tag badge is visible on the item card
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Tagged Item')).toContainText('Dairy')
})

test('user can assign a vendor to an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given a new item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Vendor Item')
  await item.save()

  // When user creates and assigns a vendor inline
  await pantry.navigateTo()
  await pantry.getItemCard('Vendor Item').click()
  await item.createAndAssignVendor('Costco')

  // Then the vendor badge is visible on the item card
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Vendor Item')).toContainText('Costco')
})

test('user can delete an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an existing item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Delete Me')
  await item.save()

  // When user deletes the item
  await pantry.navigateTo()
  await pantry.getItemCard('Delete Me').click()
  await item.delete()

  // Then the item no longer appears in the pantry
  await expect(pantry.getItemCard('Delete Me')).not.toBeVisible()
})
```

**Step 2: Run all 5 tests**

```bash
pnpm test:e2e
```

Expected: All 5 tests pass. If any fail, use `pnpm test:e2e:ui` to step through visually and identify selector mismatches.

**Step 3: Run with UI mode to verify visually**

```bash
pnpm test:e2e:ui
```

Watch each test execute step-by-step. Confirm the browser interactions match the intended user flow.

**Step 4: Commit**

```bash
git add e2e/tests/item-management.spec.ts
git commit -m "feat(e2e): add item management E2E test suite"
```

---

### Task 5: Handle IndexedDB state between tests

**Context:** Each test creates data (items, tags, vendors) in IndexedDB. Since tests run against the same browser profile, earlier tests may leave data that affects later ones (e.g. stale item cards from previous runs). Fix with an `afterEach` that clears IndexedDB.

**Files:**
- Modify: `e2e/tests/item-management.spec.ts`

**Step 1: Add `afterEach` cleanup at the top of the spec file**

Add after the imports, before the first `test(...)`:

```typescript
test.afterEach(async ({ page }) => {
  // Clear all IndexedDB databases to reset app state between tests
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map(({ name }) => {
      return new Promise<void>((resolve, reject) => {
        if (!name) { resolve(); return }
        const req = indexedDB.deleteDatabase(name)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    }))
  })
})
```

**Step 2: Run all tests**

```bash
pnpm test:e2e
```

Expected: All 5 tests pass independently regardless of run order.

**Step 3: Verify isolation by running tests in random order**

```bash
pnpm test:e2e --repeat-each=2
```

Expected: All 10 runs pass.

**Step 4: Commit**

```bash
git add e2e/tests/item-management.spec.ts
git commit -m "feat(e2e): add IndexedDB cleanup between tests for isolation"
```
