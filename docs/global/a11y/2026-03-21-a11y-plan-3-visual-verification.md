# A11y Plan 3 — Visual Verification

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Extend automated axe coverage to detail pages (not yet in the spec), fix any new violations found, and verify focus indicators via keyboard testing.

**Updated scope (after rebase onto main 2026-03-25):**

PR #143 added `e2e/tests/a11y.spec.ts` — 14 tests covering 7 main pages × light+dark mode with `checkA11y()` (all axe rules, including `color-contrast`). This spec is **already passing**, which means:
- Color contrast for all 7 main pages passes in both light and dark mode ✓
- Design tokens were already tightened (`--foreground-muted`, `--importance-primary`, `--importance-neutral`) ✓
- Structural violations (button-name, nested-interactive, heading-order) were fixed ✓

**What remains:**
1. Detail pages and form pages are NOT covered by the axe spec — extend it
2. Focus indicator visibility — axe's `focus-visible` rule is limited; manual keyboard testing still needed
3. Inactive items `opacity-50` — color-as-sole-indicator; verify and add non-color indicator

**WCAG References:**
- 1.4.3 Contrast (Minimum) (AA) — normal text ≥ 4.5:1, large text ≥ 3:1
- 1.4.11 Non-text Contrast (AA) — UI components ≥ 3:1
- 1.4.1 Use of Color (A) — color must not be the only means of conveying information
- 2.4.7 Focus Visible (AA) — keyboard focus must be visible

---

## Task 1: Extend axe Spec to Detail Pages

**Issue:** The following pages are NOT covered by `e2e/tests/a11y.spec.ts`:
- `/items/new` — new item form
- `/items/$id` — item detail (requires a seeded item)
- `/items/$id/tags`, `/items/$id/vendors`, `/items/$id/recipes` — item detail tabs
- `/settings/tags/$id` — tag detail
- `/settings/vendors/$id` — vendor detail
- `/settings/recipes/$id` — recipe detail
- `/settings/vendors/new`, `/settings/recipes/new` — new vendor/recipe forms

These pages include fixed `<header>` bars, detail tab content, and settings forms — all with unique UI that may have violations.

**Files:**
- `e2e/tests/a11y.spec.ts`

**Step 1: Read `e2e/tests/a11y.spec.ts`**

Read the full file to understand the teardown pattern and existing test structure.

**Step 2: Add seeded-data detail page tests**

Use `page.evaluate()` to seed entities directly into IndexedDB (navigate to `/` first so Dexie initializes the schema). Then navigate to detail pages and run `checkA11y()`.

Pattern for seeding and testing an item detail page:

```ts
test('user can view item detail page without accessibility violations', async ({ page }) => {
  // Given a seeded item
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const itemId = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const id = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('items', 'readwrite')
      tx.objectStore('items').add({
        id,
        name: 'test item',
        tagIds: [],
        vendorIds: [],
        recipeIds: [],
        targetQuantity: 1,
        refillThreshold: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return id
  })

  // When axe scans the item detail page
  await page.goto(`/items/${itemId}`)
  await page.waitForLoadState('networkidle')
  await injectAxe(page)

  // Then there should be no violations
  await checkA11y(page)
})
```

Add tests for:
- `/items/new` (no seeding needed — just navigate)
- `/items/${itemId}/tags`, `/items/${itemId}/vendors`, `/items/${itemId}/recipes` (same seeded item)
- `/settings/tags/${tagId}` (seed a tag type + tag)
- `/settings/vendors/${vendorId}` (seed a vendor)
- `/settings/recipes/${recipeId}` (seed a recipe)
- `/settings/vendors/new`, `/settings/recipes/new` (no seeding needed)

Add dark-mode variants inside the existing `test.describe('dark mode a11y')` block.

**Step 3: Run the extended spec and fix all failures**

```bash
pnpm test:e2e --grep "a11y"
```

For each failure, read the axe report (it includes the rule ID, node selector, and help URL). Fix the violation in the relevant file. Common violations to expect:
- `color-contrast` → fix in `src/design-tokens/theme.css`
- `button-name` → add `aria-label` to icon-only buttons on detail pages
- `landmark-one-main` → ensure `<main>` is present (detail pages use fixed top bars, verify main content is wrapped)
- `heading-order` → verify h1→h2 sequence on detail pages (fixed top bar has h1; tabs/sections should use h2)

Re-run after each fix until the spec is fully green.

**Step 4: Verify**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
pnpm test:e2e --grep "a11y"
```

---

## Task 2: Inactive Items — Non-Color Indicator

**Issue:** Inactive items in `ItemCard` use `opacity-50` as the sole visual indicator of inactive state. This violates WCAG 1.4.1 (Use of Color) — a non-color means must also convey the state. Reduced opacity may also cause contrast failures when items are seeded in the extended axe spec.

**Files:**
- `apps/web/src/components/item/ItemCard/index.tsx`

**Step 1: Read ItemCard and check axe results**

After Task 1's extended spec passes (or during its fix cycle), check if any `color-contrast` violations appear for inactive items. Whether or not axe flags it, add a non-color indicator per WCAG 1.4.1.

Read `src/components/item/ItemCard/index.tsx`. Find where `opacity-50` is applied to inactive items.

**Step 2: Add a non-color indicator**

Keep reduced opacity but add a supplementary screen-reader and/or visual indicator:

```tsx
{!item.isActive && (
  <span className="sr-only">Inactive</span>
)}
```

If opacity reduction causes contrast failures, raise it to `opacity-60` or `opacity-70`.

**Step 3: Verify**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
pnpm test:e2e --grep "a11y"
```

---

## Task 3: Focus Indicator Manual Audit

**Issue:** axe's `focus-visible` checks are limited — they detect missing focus management but do not validate whether the rendered focus ring is visually sufficient. Manual Tab-key testing is required to confirm focus rings are visible in both themes.

**WCAG 2.4.7 (AA):** Every interactive element must have a visible focus indicator when focused via keyboard.

**Step 1: Tab through each page in Light mode**

With `pnpm dev` running at `http://localhost:5173`, set theme to Light. Use Tab (and Shift+Tab) to navigate through:
1. `/` (Pantry) — toolbar buttons, item cards, quantity steppers, tag/vendor/recipe badges
2. `/shopping` — toolbar, cart items, checkout button
3. `/cooking` — toolbar, recipe cards, checkboxes, expand buttons, serving adjusters
4. `/settings` — nav cards, theme buttons, language select, export/import buttons
5. `/settings/tags` — tag type headings, draggable tag badges, delete buttons
6. Item detail page — back button, edit button, tab links, tab content

For each element: is the focus ring visible and clearly distinguishable from its background?

**Step 2: Repeat in Dark mode**

Set theme to Dark. Repeat the same Tab traversal. Focus rings visible in light mode may disappear against dark backgrounds.

**Step 3: Fix invisible focus rings**

Option A — Global fallback in `src/index.css` (preferred):
```css
:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
```

Option B — Per-component via Tailwind: `focus-visible:ring-2 focus-visible:ring-primary`

Use Option A as a broad safety net; Option B only when a component needs custom overrides.

**Step 4: Verify**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
pnpm test:e2e --grep "a11y"
```

---

## Task 4: Final Verification & Commit

**Step 1: Full quality gate**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
pnpm test:e2e --grep "a11y"
```

**Step 2: Commit (up to 3 commits)**

```
test(a11y): extend axe spec to cover detail pages in light and dark mode
fix(a11y): fix violations found in extended detail page axe coverage
fix(a11y): add non-color inactive indicator and fix focus ring visibility
```

Split further if fixes span unrelated concerns (e.g. a contrast fix in theme.css vs a focus fix in index.css = 2 commits).
