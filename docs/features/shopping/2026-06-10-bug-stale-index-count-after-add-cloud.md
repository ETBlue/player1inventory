# Bug: Shopping index shows stale vendor card count after adding item in cloud mode

**Date:** 2026-06-10  
**Branch:** `worktree-feature-vendor-carts-cloud`

## Bug description

In cloud mode:
1. User enters the shopping page — vendor card shows "0 / N items in cart"
2. User enters a vendor cart, adds an item — toolbar shows "1 pack in cart"
3. User presses back to return to the shopping page
4. **Expected:** vendor card shows "1 / N items in cart"
5. **Actual:** vendor card still shows "0 / N items in cart"

## Root cause

`useAddToCart` cloud mutation passes `refetchQueries: ['CartItems', 'AllCartItems', 'AllCarts']` as **strings**. Apollo Client's string-based `refetchQueries` only refetches queries that have **active observers at the time the mutation fires**.

When the user is on the vendor cart page (`/shopping/$vendorId`), the shopping index (`/shopping`) is unmounted — `useAllCartItemsQuery` and `useAllCartsQuery` have no active observers. Apollo silently skips the refetch. The `AllCartItems` Apollo cache stays at `[]` (from the first load). When the shopping index re-mounts, it reads the stale `[]` from cache and shows "0 / N".

**Affected files:**
- `apps/web/src/hooks/useShoppingCart.ts` — `useAddToCart` cloud mutation `refetchQueries`

## Fix applied

`apps/web/src/hooks/useShoppingCart.ts` — `useAddToCart` cloud mode:
- Removed `refetchQueries` from `useAddToCartMutation()` hook init
- Added `refetchQueries: ['CartItems', { query: AllCartItemsDocument }, { query: AllCartsDocument }]` at mutation call sites (`mutate` and `mutateAsync`)
- Imported `AllCartItemsDocument` and `AllCartsDocument` from `@/generated/graphql`

## Test added

`apps/web/src/hooks/useShoppingCart.test.ts` — `describe('useAddToCart (cloud mode)')`:
- Verifies that `cloudAddToCart` is called with `AllCartItems` and `AllCarts` as DocumentNode objects in `refetchQueries`

## PR / commit

`fix(shopping/cloud): use DocumentNode refetches for AllCartItems and AllCarts in useAddToCart`
