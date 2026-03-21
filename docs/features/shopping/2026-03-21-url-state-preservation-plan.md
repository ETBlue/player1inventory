# Implementation Plan — URL State Preservation for Cooking & Shopping

**Date:** 2026-03-21
**Design doc:** `2026-03-21-url-state-preservation-design.md`
**Branch:** `feature/preserve-url-state`

## Overview

Two independent tasks:
1. Cooking page: persist expand/collapse state in `?expanded` URL param
2. Shopping page: persist vendor selection in `?vendor` URL param

---

## Step 1 — Cooking: `?expanded` URL param

### Files

- `apps/web/src/routes/cooking.tsx`
- `apps/web/src/routes/cooking.test.tsx`
- `apps/web/src/routes/cooking.stories.tsx`

### Changes

**`cooking.tsx`:**

1. Add `expanded` to `validateSearch`:
   ```ts
   expanded: typeof search.expanded === 'string' ? search.expanded : '',
   ```

2. Remove `const [expandedRecipeIds, setExpandedRecipeIds] = useState<Set<string>>(new Set())`

3. Add after destructuring `Route.useSearch()`:
   ```ts
   const expandedRecipeIds = useMemo(
     () => new Set(expanded ? expanded.split(',') : []),
     [expanded],
   )
   ```

4. Replace all `setExpandedRecipeIds(...)` calls with `navigate({ search: ... }, { replace: true })`:

   - **Single card chevron toggle:**
     ```ts
     const newSet = new Set(expandedRecipeIds)
     if (newSet.has(recipe.id)) { newSet.delete(recipe.id) } else { newSet.add(recipe.id) }
     navigate({ search: (prev) => ({ ...prev, expanded: [...newSet].join(',') }) }, { replace: true })
     ```

   - **`onExpandAll` (passed to `CookingControlBar`):**
     ```ts
     navigate({ search: (prev) => ({ ...prev, expanded: recipes.map(r => r.id).join(',') }) }, { replace: true })
     ```

   - **`onCollapseAll` (passed to `CookingControlBar`):**
     ```ts
     navigate({ search: (prev) => ({ ...prev, expanded: '' }) }, { replace: true })
     ```

5. Remove `useState` import if no longer used elsewhere (check — other state still uses it).

**`cooking.test.tsx`:**

Add tests:
- `user can expand a recipe and see it preserved in URL`
- `user can collapse all recipes and see expanded param cleared`
- `user can expand all recipes and see all IDs in URL`

**`cooking.stories.tsx`:**

Update stories that rely on `expandedRecipeIds` (e.g. `WithExpandedRecipe`) to set initial URL search `expanded: '<recipeId>'` instead of relying on component state.

### Verification

```bash
(cd apps/web && pnpm test -- cooking)
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
(cd apps/web && pnpm build-storybook)
```

---

## Step 2 — Shopping: `?vendor` URL param

### Files

- `apps/web/src/routes/shopping.tsx`
- `apps/web/src/routes/shopping.test.tsx`

### Changes

**`shopping.tsx`:**

1. Add `validateSearch` to the route:
   ```ts
   export const Route = createFileRoute('/shopping')({
     component: Shopping,
     validateSearch: (search: Record<string, unknown>) => ({
       vendor: typeof search.vendor === 'string' ? search.vendor : '',
     }),
   })
   ```

2. Remove `const [selectedVendorId, setSelectedVendorId] = useState<string>('')`

3. Destructure from `Route.useSearch()`:
   ```ts
   const { vendor: selectedVendorId } = Route.useSearch()
   ```

4. Update vendor dropdown `onValueChange`:
   ```ts
   onValueChange={(value) =>
     navigate({
       search: (prev) => ({ ...prev, vendor: value === 'all' ? '' : value }),
     }, { replace: true })
   }
   ```
   (Check current select value sentinel — "all" or empty string — and match accordingly.)

5. After checkout success, clear vendor:
   ```ts
   navigate({ search: (prev) => ({ ...prev, vendor: '' }) })
   ```

6. After abandon success, clear vendor:
   ```ts
   navigate({ search: (prev) => ({ ...prev, vendor: '' }) })
   ```

**`shopping.test.tsx`:**

Add tests:
- `user can select a vendor and see it preserved in URL`
- `vendor selection is cleared from URL after checkout`
- `vendor selection is cleared from URL after cart abandonment`

### Verification

```bash
(cd apps/web && pnpm test -- shopping)
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Step 3 — Update CLAUDE.md

### File

- `CLAUDE.md` (project root)

### Changes

1. **Shopping page section:** Remove "State is not persisted." from the vendor filter bullet. Replace with: "Persisted in `?vendor` URL param; cleared on checkout or cart abandonment."

2. **Cooking page section:** Update the **State** block under `CookingPage` to note that `expandedRecipeIds` is now derived from the `?expanded` URL param (not local `useState`).

### Verification

```bash
(cd apps/web && pnpm check)
```

---

## Final Verification

After all steps are complete:

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
pnpm test:e2e --grep "shopping|cooking"
```
