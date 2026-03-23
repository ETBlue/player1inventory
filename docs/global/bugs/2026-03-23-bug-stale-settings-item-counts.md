# Bug: Stale Item Counts in Settings List Pages After Assignment

## Bug Description

In the settings list pages (Tags, Vendors, Recipes), the item count badge shown per entity becomes stale after the user assigns or unassigns an item on the entity's items tab, then navigates back to the list page. The count does not reflect the change until a full page reload or manual navigation away-and-back.

Affects: both local mode and cloud mode.

## Root Cause

Two mutation hooks are missing count query invalidations:

### 1. `useUpdateItem` (`apps/web/src/hooks/useItems.ts`)

Used by the tag items page and vendor items page when toggling tag/vendor assignment on an item.

- **Local `onSuccess`**: invalidates `['items']` and `['items', id]` but **not** `['items', 'countByTag']` or `['items', 'countByVendor', *]`
- **Cloud `refetchQueries`**: refetches `GetItemsDocument` only — not `ItemCountByTag` or `ItemCountByVendor`

### 2. `useUpdateRecipe` (`apps/web/src/hooks/useRecipes.ts`)

Used by the recipe items page when toggling item assignment on a recipe.

- **Local `onSuccess`**: invalidates `['recipes']` and `['recipes', id]` but **not** `['recipes', 'itemCount', *]`
- **Cloud `refetchQueries`**: refetches `GetRecipesDocument` and `GetRecipeDocument` — not `ItemCountByRecipe`

## Affected Flows

| Page | Mutation hook | Missing local invalidation | Missing cloud refetch |
|------|--------------|---------------------------|----------------------|
| Settings > Tags > $id/items | `useUpdateItem` | `['items', 'countByTag']` | `'ItemCountByTag'` |
| Settings > Vendors > $id/items | `useUpdateItem` | `['items', 'countByVendor']` | `'ItemCountByVendor'` |
| Settings > Recipes > $id/items | `useUpdateRecipe` | `['recipes', 'itemCount']` | `'ItemCountByRecipe'` |

Note: `useVendorItemCounts` (the `useMemo` hook used by the vendor list page in local mode) auto-recomputes when `['items']` is invalidated — so it is already correct. The stale count affects `useItemCountByVendor` (individual hook, query key `['items', 'countByVendor', vendorId]`) which is used elsewhere.

## Fix Applied

**`useUpdateItem`** (`apps/web/src/hooks/useItems.ts`):
- Local `onSuccess`: added `queryClient.invalidateQueries({ queryKey: ['items', 'countByTag'] })` and `queryClient.invalidateQueries({ queryKey: ['items', 'countByVendor'] })`
- Cloud `refetchQueries`: added `'ItemCountByTag'` and `'ItemCountByVendor'` (Apollo refetches all active instances of those queries by operation name)

**`useUpdateRecipe`** (`apps/web/src/hooks/useRecipes.ts`):
- Local `onSuccess`: added `queryClient.invalidateQueries({ queryKey: ['recipes', 'itemCount'] })`
- Cloud `refetchQueries`: added `'ItemCountByRecipe'` to both `mutate` and `mutateAsync` arrays

## Tests Added

E2E regression tests added to:
- `e2e/tests/settings/tags.spec.ts` — `tag item count updates after tag is assigned to an item`
- `e2e/tests/settings/vendors.spec.ts` — `vendor item count updates after vendor is assigned to an item`
- `e2e/tests/settings/recipes.spec.ts` — `recipe item count updates after item is assigned to a recipe`

## PR / Commit

- Fix commit: `96a6562` — `fix(settings): invalidate item counts after tag/vendor/recipe assignment`
- Test commit: `c076d19` — `test(e2e): add regression tests for stale item counts after assignment`
- PR: *TBD*
