# Bug: Shopping index shows stale vendor card count after checkout/abandon in cloud mode

**Date:** 2026-06-10  
**Branch:** `worktree-feature-vendor-carts-cloud`

## Bug description

In cloud mode:
1. User enters vendor cart page, adds items
2. User checks out (or abandons) the cart
3. App navigates back to the shopping index
4. **Expected:** vendor card shows updated count (0 items in cart, updated lastPurchasedAt sort)
5. **Actual:** vendor card still shows the pre-checkout stale count

## Root cause

`useCheckout` and `useAbandonCart` cloud mutations include:
- `'VendorCart'` — string, OK (vendor cart page IS mounted during checkout)
- `'AllCarts'` — string, **SILENT NO-OP**: shopping index unmounted → no active observer → Apollo skips
- `AllCartItems` — **missing entirely** from both mutations

When the user returns to the shopping index, `useAllCartItemsQuery` and `useAllCartsQuery` read from stale Apollo cache.

**Affected files:**
- `apps/web/src/hooks/useShoppingCart.ts` — `useCheckout` and `useAbandonCart` cloud refetchQueries (4 call sites total: mutate + mutateAsync for each)

## Fix applied

`apps/web/src/hooks/useShoppingCart.ts` — 4 call sites updated:
- `useCheckout` `mutate` + `mutateAsync`: `'AllCarts'` → `{ query: AllCartsDocument }`, added `{ query: AllCartItemsDocument }`
- `useAbandonCart` `mutate` + `mutateAsync`: same changes

## Test added

`apps/web/src/hooks/useShoppingCart.test.ts`:
- `describe('useCheckout (cloud mode) — AllCartItems and AllCarts refetch strategy')`
- `describe('useAbandonCart (cloud mode)')`
Both verify DocumentNode presence in `refetchQueries`.

## PR / commit

`fix(shopping/cloud): use DocumentNode refetches for AllCartItems and AllCarts in useCheckout and useAbandonCart`
