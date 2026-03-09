# Shopping Checkout E2E Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a happy-path E2E test covering the core shopping checkout flow: add item to cart → checkout → verify inventory updated.

**Architecture:** Two new files — a `ShoppingPage` page object following the existing pattern, and a `shopping.spec.ts` spec file. No new app code needed. The packed quantity after checkout is verified via the item detail form's `#packedQuantity` input rather than the ItemCard display text, which has a complex format.

**Tech Stack:** Playwright, TypeScript, existing `PantryPage` / `ItemPage` page objects.

---

### Task 1: Create the ShoppingPage page object

**Files:**
- Create: `e2e/pages/ShoppingPage.ts`

**Step 1: Create the file**

```ts
import type { Page, Locator } from '@playwright/test'

export class ShoppingPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/shopping')
  }

  getItemCard(name: string): Locator {
    // ItemCard renders item name as <h3> (same pattern as PantryPage)
    return this.page.getByRole('heading', { name, level: 3 })
  }

  getItemCheckbox(name: string): Locator {
    // Checkbox aria-label is "Add {name}" when unchecked (pending section)
    // (src/components/item/ItemCard/index.tsx: aria-label computed from isChecked)
    return this.page.getByLabel(`Add ${name}`)
  }

  async addItemToCart(name: string) {
    await this.getItemCheckbox(name).click()
  }

  async clickDone() {
    // Toolbar "Done" button — visible when cart has items
    // Text: "Done" with Check icon (src/routes/shopping.tsx)
    await this.page.getByRole('button', { name: 'Done' }).click()
  }

  async confirmCheckout() {
    // Checkout dialog title: "Complete shopping trip?"
    // Confirm button text: "Done" scoped inside alertdialog
    await this.page.getByRole('alertdialog').getByRole('button', { name: 'Done' }).click()
  }
}
```

**Step 2: Commit**

```bash
git add e2e/pages/ShoppingPage.ts
git commit -m "feat(e2e): add ShoppingPage page object"
```

---

### Task 2: Write the checkout E2E test

**Files:**
- Create: `e2e/tests/shopping.spec.ts`

**Step 1: Create the test file**

```ts
import { test, expect } from '@playwright/test'
import { ItemPage } from '../pages/ItemPage'
import { PantryPage } from '../pages/PantryPage'
import { ShoppingPage } from '../pages/ShoppingPage'

test.afterEach(async ({ page }) => {
  // Same IndexedDB cleanup as item-management.spec.ts
  await page.goto('/')
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map(({ name }) => {
      return new Promise<void>((resolve, reject) => {
        if (!name) { resolve(); return }
        const req = indexedDB.deleteDatabase(name)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
        req.onblocked = () => {
          console.warn(`[afterEach] IndexedDB delete blocked for "${name}" — data may persist`)
          resolve()
        }
      })
    }))
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('user can checkout items from shopping cart', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)
  const shopping = new ShoppingPage(page)

  // Given: item "Test Milk" exists with 0 packed quantity (default)
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Test Milk')
  await item.save()
  // item.save() waits for navigation to /items/$id — packed quantity defaults to 0

  // When: navigate to shopping page, add item to cart, checkout
  await shopping.navigateTo()
  await shopping.addItemToCart('Test Milk')
  await shopping.clickDone()
  await shopping.confirmCheckout()

  // Then: cart is empty — Done button is disabled
  await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled()

  // And: navigate to pantry and open the item — packed quantity is now 1
  await pantry.navigateTo()
  await pantry.getItemCard('Test Milk').click()
  await expect(page.locator('#packedQuantity')).toHaveValue('1')
})
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/shopping.spec.ts
```

Expected output:
```
✓  user can checkout items from shopping cart
1 passed
```

If the test fails, check:
- Is the item visible on the shopping page? (It starts with 0 packed and 0 target — it should appear as an active item in pending.)
- Is the Done button locator matching the toolbar button or the dialog button? (Dialog scoping in `confirmCheckout` should prevent this.)
- Is the `#packedQuantity` value after checkout `"1"` as expected? (If checkout adds the cart qty to packed, yes.)

**Step 3: Commit**

```bash
git add e2e/tests/shopping.spec.ts
git commit -m "feat(e2e): add shopping checkout happy path test"
```
