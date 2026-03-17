# Implementation Plan: Unified Recipe/Cooking E2E Tests

**Date:** 2026-03-17
**Branch:** feature/backend-recipes-migration
**Related brainstorming:** `2026-03-17-brainstorming-unified-e2e-tests.md`

## Goal

Unify `e2e/tests/settings/recipes.spec.ts` and `e2e/tests/cooking.spec.ts` so every test case runs in both local and cloud mode — no `test.skip` splits, no duplicate "Cloud mode tests" sections. Same pattern as `tags.spec.ts`.

## Steps

### Step 1 — Server: add RecipeModel to cleanup endpoint

**File:** `apps/server/src/index.ts`

- Import `RecipeModel` alongside the other model imports
- Add `RecipeModel.deleteMany({ userId })` to the `Promise.all([...])` in the `/e2e/cleanup` handler

**Verification:** `(cd apps/server && pnpm build)` passes (or TypeScript check if no build script).

---

### Step 2 — `settings/recipes.spec.ts`: unify tests

**File:** `e2e/tests/settings/recipes.spec.ts`

Changes:

1. Add `APIRequestContext` and `CLOUD_GRAPHQL_URL` imports.

2. Add a `seedRecipeViaApi` helper for cloud mode seeding that needs `defaultAmount`:
   ```ts
   async function seedRecipeViaApi(
     request: APIRequestContext,
     recipeName: string,
     items: { name: string; defaultAmount: number }[] = [],
   ): Promise<{ recipeId: string; itemIds: string[] }>
   ```
   Implementation:
   - For each item: `POST CLOUD_GRAPHQL_URL` with `mutation { createItem(name: $name) { id } }` → collect `itemId`
   - `POST CLOUD_GRAPHQL_URL` with `mutation { createRecipe(name: $name, items: [...]) { id } }` → collect `recipeId`
   - All requests include `{ 'x-e2e-user-id': E2E_USER_ID }` header

3. **`user can create a recipe`** — remove `test.skip`. No setup change needed (pure UI, works both modes).

4. **`user can navigate to recipe detail after creating`** — remove `test.skip`. No setup change needed.

5. **`user can delete a recipe`** — remove `test.skip`. Add cloud/local setup block:
   ```ts
   if (baseURL === CLOUD_WEB_URL) {
     // Cloud: create via UI
     await recipes.navigateTo()
     await recipes.clickNewRecipe()
     await recipes.fillRecipeName('Pancakes')
     await recipes.clickSave()
     await page.waitForURL(...)
     await recipes.navigateTo()
   } else {
     // Local: seed via IndexedDB
     await seedRecipe(page, 'Pancakes')
     await recipes.navigateTo()
   }
   ```

6. **`user can edit recipe name on Info tab`** — remove `test.skip`. Add cloud/local setup block:
   - Cloud: create recipe via UI, extract `recipeId` from URL
   - Local: existing `seedRecipe` + navigate by ID

7. **`user can assign and unassign an item on Items tab`** — remove `test.skip`. Add cloud/local setup block:
   - Cloud: create recipe via UI (get ID from URL), then create item via pantry UI (`PantryPage` + `ItemPage`), navigate to `detail.navigateToItems(recipeId)`
   - Local: existing `seedRecipe` + `seedItem`

8. **`user can adjust default amount for an assigned item`** — remove `test.skip`. Add cloud/local setup block:
   - Cloud: `seedRecipeViaApi(request, 'Pancakes', [{ name: 'Flour', defaultAmount: 2 }])` → extract `recipeId`, navigate to items tab
   - Local: existing `seedRecipe` + navigate

9. **Remove** the `// ─── Cloud mode tests ───` section and the two cloud-only tests at the bottom.

10. Add `PantryPage` and `ItemPage` imports (needed for cloud setup in assign/unassign test).

**Verification:** `pnpm test:e2e --grep "recipes"` passes in local mode.

---

### Step 3 — `cooking.spec.ts`: unify the cooking test

**File:** `e2e/tests/cooking.spec.ts`

Changes:

1. Add `APIRequestContext` and `CLOUD_GRAPHQL_URL` imports.

2. Replace `seedDatabase(page)` (IndexedDB-only) with a mode-aware seed:
   ```ts
   async function seedDatabase(page: Page, request: APIRequestContext, baseURL: string | undefined) {
     if (baseURL === CLOUD_WEB_URL) {
       // Cloud: seed via GraphQL API
       // 1. createItem("Flour") → flourId
       // 2. updateItem(flourId, { packedQuantity: 10 })
       // 3. createItem("Eggs") → eggsId
       // 4. updateItem(eggsId, { packedQuantity: 12 })
       // 5. createRecipe("Pancakes", items: [{itemId: flourId, defaultAmount: 2}, {itemId: eggsId, defaultAmount: 3}])
       return { flourId, eggsId, recipeId }
     } else {
       // Local: existing IndexedDB seeding
       ...
       return { flourId, eggsId, recipeId }
     }
   }
   ```

3. **`user can cook a recipe with partial items and multiple servings`** — remove `test.skip`. Pass `request` and `baseURL` to `seedDatabase`.

4. **Remove** the `// ─── Cloud mode tests ───` section and the two cloud-only tests at the bottom (`user can view recipes in cloud mode`, `user can mark a recipe as last cooked in cloud mode`).

**Verification:** `pnpm test:e2e --grep "cooking"` passes in local mode.

---

### Step 4 — Verify quality gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
pnpm test:e2e --grep "recipes|cooking"
```

All must pass before finishing.

---

## Out of Scope

- Adding new test cases (beyond what already existed)
- Changing test assertions
- Changing page objects
