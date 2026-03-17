# Brainstorming: Unified Recipe/Cooking E2E Tests

**Date:** 2026-03-17
**Branch:** feature/backend-recipes-migration

## Context

The worktree's `recipes.spec.ts` and `cooking.spec.ts` had every test skipped for cloud mode (`test.skip(baseURL === CLOUD_WEB_URL, ...)`), with separate "Cloud mode tests" sections duplicating the same behaviors. The goal is to unify them so one test case runs in both modes — the same pattern used in `tags.spec.ts` and `vendors.spec.ts`.

## Questions & Answers

**Q1: Which files does this apply to?**
Both `cooking.spec.ts` and `settings/recipes.spec.ts`.

**Q2: Should afterEach/beforeEach adopt the dual-mode teardown pattern (like tags/vendors)?**
Yes — same pattern: cloud calls `/e2e/cleanup` endpoint, local clears IndexedDB/localStorage/sessionStorage.

**Q3: For complex seeding (cooking test with items + quantities + recipe), what approach?**
Option B — seed via E2E GraphQL API (not UI-driven, not IndexedDB-only).

**Q4: Does cooking behavior differ between cloud and local mode?**
No — identical. Quantity reduction, partial item selection, multiple servings all work the same.

## Decisions

### 1. Add `RecipeModel` to server cleanup endpoint
The `/e2e/cleanup` handler in `apps/server/src/index.ts` deletes Items, Tags, TagTypes, Vendors — but **not Recipes**. Must add `RecipeModel.deleteMany({ userId })`.

### 2. Seeding strategy per test

| Test | Cloud setup | Local setup |
|------|-------------|-------------|
| `user can create a recipe` | UI (already works) | UI (same) |
| `user can navigate to recipe detail after creating` | UI (already works) | UI (same) |
| `user can delete a recipe` | UI: create via form | IndexedDB seed |
| `user can edit recipe name on Info tab` | UI: create recipe, extract ID from URL | IndexedDB seed |
| `user can assign and unassign an item on Items tab` | UI: create recipe + item via pantry, extract recipe ID from URL | IndexedDB seed |
| `user can adjust default amount for an assigned item` | GraphQL API: `createItem` + `createRecipe(items:[{itemId, defaultAmount:2}])` | IndexedDB seed |
| `user can cook a recipe (cooking.spec.ts)` | GraphQL API: `createItem` × 2 + `updateItem` × 2 (set quantities) + `createRecipe` with items | IndexedDB seed |

### 3. GraphQL API seeding format
Uses `request.post(CLOUD_GRAPHQL_URL, { headers: { 'x-e2e-user-id': E2E_USER_ID }, data: { query, variables } })`. `CLOUD_GRAPHQL_URL` is already exported from `e2e/constants.ts`.

### 4. Remove all test splits
- Remove all `test.skip(baseURL === CLOUD_WEB_URL, ...)`
- Remove the "Cloud mode tests" sections at the bottom of both files
- Replace with `if (baseURL === CLOUD_WEB_URL) { /* cloud setup */ } else { /* local setup */ }` blocks, then shared assertions
