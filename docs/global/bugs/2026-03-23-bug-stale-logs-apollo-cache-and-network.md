# Bug: Stale Inventory Logs After Shopping/Cooking Confirmation

**Date:** 2026-03-23
**Branch:** `worktree-fix-apollo-cache-and-network`

## Bug Description

In cloud mode, after confirming shopping checkout or cooking completion, navigating to an item page and viewing its log tab shows stale/outdated log history. New logs created during checkout or cooking are missing.

## Root Cause

Apollo Client's cache is not invalidated when inventory logs are created during checkout or cooking. Unlike TanStack Query (local mode) which marks cache stale regardless of active subscriptions, Apollo's `refetchQueries` only refetches queries that are currently mounted. When the user navigates away from the log tab before checkout/cooking, the query becomes inactive and `refetchQueries` silently skips it. On next navigation to the log tab, Apollo serves the stale cached data.

The same underlying issue was previously patched with `cache.modify()` + `DELETE` sentinel in `useUpdateItem` and `useUpdateRecipe`, but a cleaner fix is to use `fetchPolicy: 'cache-and-network'` on the affected queries.

**Affected cloud mode flows:**
- Shopping checkout (`useCheckout` in `src/hooks/useShoppingCart.ts`) — creates logs server-side, no log cache invalidation
- Cooking completion (`useAddInventoryLog` in `src/hooks/useInventoryLogs.ts`) — no refetchQueries for log query

## Fix Applied

Two changes applied:

1. **`useInventoryLogs.ts`** — Added `fetchPolicy: 'cache-and-network'` to `useItemLogsQuery` so item logs are always refetched from the server on mount, regardless of what's in the Apollo cache. Also fixed a pre-existing TypeScript error in the `note` field mapping (`null` → absent).

2. **`useItems.ts`, `useRecipes.ts`, `useTags.ts`, `useVendors.ts`** — Removed `update(cache) { cache.modify(...DELETE...) }` callbacks from `useUpdateItemMutation` and `useUpdateRecipeMutation`. Added `fetchPolicy: 'cache-and-network'` to `useItemCountByTagQuery`, `useItemCountByVendorQuery`, and `useItemCountByRecipeQuery` instead. This replaces the brittle cache manipulation with a simpler approach that always fetches fresh counts on mount.

Commits: `8c05f98` (useItemLogsQuery fix), `68189f4` (cache.modify() migration)

## Test Added

- **`useInventoryLogs.test.ts`** — Added test: `useItemLogsQuery is called with fetchPolicy cache-and-network to avoid stale logs after checkout`. Captures options passed to the mocked `useItemLogsQuery` and asserts `fetchPolicy: 'cache-and-network'` is present.

- **`useTags.test.ts`** — Added test: `useItemCountByTagQuery is called with fetchPolicy cache-and-network to avoid stale counts after item update`. Captures options and asserts `fetchPolicy: 'cache-and-network'`.

- **`useVendors.test.ts`** — Added test: `useItemCountByVendorQuery is called with fetchPolicy cache-and-network to avoid stale counts after item update`. Same pattern.

- **`useRecipes.test.ts`** — Added test: `useItemCountByRecipeQuery is called with fetchPolicy cache-and-network to avoid stale counts after recipe update`. Same pattern.

## PR / Commit

*TBD*
