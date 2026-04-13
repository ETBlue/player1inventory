# Rename index.tsx to ComponentName.tsx

**Date:** 2026-04-13
**Status:** Implemented (refactor/rename-index-tsx)

## Problem

Component `.tsx` files in `src/components/` are all named `index.tsx`. When pressing Cmd+P in VS Code, all results show as `index.tsx`, making it hard to navigate to a specific component quickly.

## Goal

Rename each `index.tsx` to `ComponentName.tsx` so VS Code's quick-open (Cmd+P) can find components by name.

## Scope

- **In scope:** All 39 `index.tsx` files under `apps/web/src/components/`
- **Out of scope:** Route files in `src/routes/` — TanStack Router requires `index.tsx` as a routing convention

## Approach

For each component directory, two operations:

1. **Rename** `index.tsx` → `ComponentName.tsx`  
   Example: `ItemCard/index.tsx` → `ItemCard/ItemCard.tsx`

2. **Create barrel** `index.ts` with a single re-export:  
   ```ts
   export * from './ComponentName'
   ```

The barrel preserves existing import paths (e.g. `@/components/item/ItemCard`) so no import sites change.

Stories (`.stories.tsx`), tests (`.test.tsx`), and sub-components are not included in the barrel — they are never imported by other modules.

## Special Cases

- `TemplateItemsBrowser/` and `TemplateVendorsBrowser/` each contain a sub-component (`TemplateItemRow.tsx`, `TemplateVendorRow.tsx`). Only their `index.tsx` is renamed; sub-components are untouched.

## Verification

After the rename:

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build)
(cd apps/web && pnpm check)
(cd apps/web && pnpm test)
(cd apps/web && pnpm build-storybook)
```

All five must pass. No E2E tests required — no runtime behavior changes.

## Branch and Commit

- **Worktree:** `.worktrees/refactor-rename-index-tsx`
- **Branch:** `refactor/rename-index-tsx`
- **Commit:** Single commit — all 39 renames + 39 barrel files
  - Message: `refactor(components): rename index.tsx to ComponentName.tsx for VS Code discoverability`
- **PR:** Attach to relevant milestone if one exists
