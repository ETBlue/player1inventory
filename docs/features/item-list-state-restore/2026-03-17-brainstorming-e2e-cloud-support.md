# Brainstorming Log: E2E Cloud Mode Support — State Restore & Shopping

**Date:** 2026-03-17
**Outcome:** Two separate implementation plans:
1. `feature/e2e-cloud-state-restore` — item-list-state-restore E2E cloud mode support
2. `feature/backend-shopping-migration` — shopping cart backend migration + E2E cloud mode support

---

## Context

Seven E2E test suites exist. Cloud mode coverage was already completed for 5 of them
(`cooking`, `item-management`, `tags`, `vendors`, `recipes`). Two remained:

- `shopping.spec.ts` — no cloud mode, IndexedDB/local only
- `item-list-state-restore.spec.ts` — no cloud mode, IndexedDB/local only

---

## Questions & Answers

**Q: Is the scope just those two files, or also refactoring shared seeding utilities?**
A: Primary scope is those two files. Refactoring/consolidating shared utilities goes in a
subsequent plan.

**Q: Does the shopping cart backend already exist for cloud mode?**
A: Should exist in theory, but E2E tests may expose gaps. Fix the backend if tests fail.

**Q: What data does cloud mode need to seed for item-list-state-restore?**
A: Same data as local mode (items, tag types, tags assigned to items).

**Q: Should we add a shared `gql()` helper?**
A: Yes — if it makes the codebase easier to maintain.

**Q: Does the cleanup endpoint clear shopping cart data?**
A: Unknown — needs to be verified. Add cart cleanup if missing.

---

## Findings

### item-list-state-restore.spec.ts — straightforward

All required GraphQL mutations already exist:
- `createItem` ✓ (items.graphql)
- `createTagType` ✓ (tags.graphql)
- `createTag` ✓ (tags.graphql)
- `updateItem` (for assigning `tagIds`) ✓ (items.graphql)
- `DELETE /e2e/cleanup` already clears items, tags, tagTypes ✓

The scroll tests seed 40 items via individual GraphQL mutations — slower than IndexedDB
but acceptable for E2E.

In cloud mode, no need to clear existing tagTypes before seeding (unlike local mode where
Dexie seeds defaults on `populate`). Cloud backend starts empty after cleanup.

### shopping.spec.ts — requires full cart backend migration

The shopping cart has **no cloud implementation at all**:
- No GraphQL schema for Cart or CartItem
- No MongoDB models
- No resolvers
- `useShoppingCart.ts` only calls local Dexie.js operations
- `DELETE /e2e/cleanup` does not clear cart data

Scope is similar to the recipes backend migration.

The E2E test itself is entirely UI-driven (creates item via pantry UI, uses shopping UI
for cart/checkout). No special GraphQL seeding needed in the test — just need the
underlying cloud hooks to work.

### Dual-mode hook pattern (confirmed from useRecipes.ts)

Both local and cloud hooks are initialized unconditionally. Queries return a normalized
`{ data, isLoading, isError }` shape. Mutations use a wrapper that adapts Apollo's
`[mutateFunction, { loading }]` to TanStack Query's `{ mutateAsync, isPending }` shape.

---

## Decision

Two separate plans, each on its own branch:

1. **Plan 1** (`feature/e2e-cloud-state-restore`): item-list-state-restore cloud support
   - Create `e2e/utils/cloud.ts` with shared `makeGql()` helper
   - Update seed functions in `item-list-state-restore.spec.ts` with cloud branches
   - Add cloud cleanup (before/afterEach) to the test file
   - Add the test to `testMatch` in `playwright.config.ts`

2. **Plan 2** (`feature/backend-shopping-migration`): Shopping cart backend + E2E
   - Server: Cart + CartItem MongoDB models
   - Server: GraphQL schema + resolvers
   - Server: Extend cleanup endpoint to clear cart data
   - Frontend: `operations/shopping.graphql`
   - Frontend: Regenerate `src/generated/graphql.ts`
   - Frontend: Dual-mode `useShoppingCart.ts`
   - E2E: Add cloud cleanup to `shopping.spec.ts` + add to `testMatch`
