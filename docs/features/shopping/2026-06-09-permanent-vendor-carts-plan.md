# Permanent Vendor Carts — Implementation Plan

**Date:** 2026-06-09  
**Branch:** `worktree-feature-vendor-carts-cloud`  
**Brainstorm:** `2026-06-09-brainstorming-permanent-vendor-carts.md`  
**Status:** 🔲 Pending

---

## Summary

Replace the multiple-cart-per-vendor model with permanent 1:1 vendor↔cart. Cart ID = vendor ID. Carts are created/deleted with their vendor. Checkout clears active items (quantity > 0) and stamps `lastPurchasedAt`. Abandon clears all items.

Overwrites the uncommitted Phase 7 implementation.

---

## New Data Model

### ShoppingCart

```typescript
interface ShoppingCart {
  id: string           // = vendorId, or 'no-vendor' for null-vendor cart
  lastPurchasedAt?: Date
}
```

Removed: `status`, `createdAt`, `completedAt`, `vendorId` (id IS the vendor id now)

### ShoppingCartItem (unchanged)

```typescript
interface ShoppingCartItem {
  id: string
  cartId: string
  itemId: string
  quantity: number   // 0 = pinned; > 0 = active
}
```

---

## Key Behaviors

| Operation | Effect |
|---|---|
| Create vendor | Create cart with `id = vendorId` in same transaction |
| Delete vendor | Delete cart + all cart items |
| Bootstrap | On app start: create carts for vendors without one; create `'no-vendor'` cart if missing; migrate old carts |
| Checkout | Set `lastPurchasedAt = now`; delete items where `quantity > 0`; keep items where `quantity === 0` |
| Abandon | Delete ALL items; do NOT update `lastPurchasedAt` |
| Sort (recent) | Read `cart.lastPurchasedAt` directly — no completed-cart query needed |

---

## Implementation Phases

### Phase A — Types and Dexie Schema

**Files:** `packages/types/src/index.ts`, `apps/web/src/db/index.ts`

- Update `ShoppingCart` type: remove `status`, `createdAt`, `completedAt`, `vendorId`; add `lastPurchasedAt?: Date`
- Update Dexie schema version: new table layout for `shoppingCarts`
- Add Dexie upgrade migration (versionN.upgrade): move active items to permanent carts, extract lastPurchasedAt from completed carts, delete old carts
- Create `'no-vendor'` permanent cart in upgrade if missing

### Phase B — DB Operations

**Files:** `apps/web/src/db/operations.ts`, `apps/web/src/db/operations.test.ts`

- Remove `getOrCreateActiveCart(vendorId)` — replace with `getCart(vendorId)` (simple lookup by ID)
- Remove `getAllActiveCarts()` — replace with `getAllCarts()` (returns all carts, always)
- Update `checkout(cartId)`:
  - Set `lastPurchasedAt = new Date()`
  - Delete cart items where `quantity > 0`
  - Keep cart items where `quantity === 0`
- Update `abandonCart(cartId)`:
  - Delete ALL cart items
- Update `createVendor(...)`:
  - After creating vendor, create cart with `id = vendor.id`
- Update `deleteVendor(vendorId)`:
  - Delete cart items for this cart
  - Delete the cart
- Remove `updateCartLastVisited` (already removed in Phase 7 draft)
- Simplify `getLastPurchasedByVendor()`: reads `lastPurchasedAt` from each cart directly

### Phase C — Bootstrap on App Start

**Files:** `apps/web/src/db/index.ts` (or a dedicated `apps/web/src/db/bootstrap.ts`)

- `bootstrapCarts()`: called once at app init
  - Fetch all vendors
  - Fetch all carts
  - For each vendor with no cart → create cart with `id = vendorId`
  - If no `'no-vendor'` cart exists → create it
- Call `bootstrapCarts()` from app entry point (after DB is ready)

### Phase D — Hooks

**Files:** `apps/web/src/hooks/useShoppingCart.ts`, `apps/web/src/hooks/useShoppingCart.test.ts`

- `useVendorCart(vendorId)`: TanStack query key `['cart', vendorId]`; fetches `getCart(vendorId)` (no "or create")
- `useAllCarts()`: (rename from `useAllActiveCarts`); TanStack key `['cart', 'all']`; fetches `getAllCarts()`
- `useLastPurchasedByVendor()`: reads `lastPurchasedAt` from each cart; key `['cart', 'all']` (reuses same query)
- Update `useAddToCart` invalidations: `['cart', cartId, 'items']` only (no `['cart', 'all-active']` since cart always exists)
- Update `useCheckout` invalidation: `['cart']`, `['items']`, `['sort', 'purchaseDates']`
- Update `useAbandonCart` invalidation: `['cart']`
- Update `useCreateVendor` / `useDeleteVendor` invalidation: `['cart']`

### Phase E — Routes

**Files:**
- `apps/web/src/routes/shopping/index.tsx`, `apps/web/src/routes/shopping/index.test.tsx`
- `apps/web/src/routes/shopping/$vendorId.tsx`, `apps/web/src/routes/shopping/$vendorId.test.tsx`

**Index page:**
- Replace `useAllActiveCarts()` → `useAllCarts()`
- Read `cart.lastPurchasedAt` directly for sort (no separate `useLastPurchasedByVendor` query)
- Remove `AllCartItems` fan-out (cloud mode): replace with per-cart item query per vendor card

**Vendor cart page:**
- Remove `disabled={!cart}` guard (cart always exists after bootstrap)
- Remove `isCartLoading` from Done button (cart never loading)
- Cart is guaranteed present; simplify handlers

### Phase F — Prisma + GraphQL (Cloud Mode)

**Files:**
- `apps/server/prisma/schema.prisma`
- `apps/server/prisma/migrations/`
- `apps/server/src/schema/cart.graphql`
- `apps/server/src/resolvers/cart.resolver.ts`
- `apps/web/src/apollo/operations/shopping.graphql`
- `apps/web/src/generated/graphql.ts` (via codegen)

- Prisma `Cart` model: remove `status`, `createdAt`, `completedAt`, `vendorId`; add `lastPurchasedAt DateTime?`; `id` is now explicitly set to `vendorId` value at creation
- New migration
- GraphQL `Cart` type: remove `status`, `createdAt`, `completedAt`, `vendorId`; add `lastPurchasedAt`
- Add `createVendor` mutation that also creates cart; `deleteVendor` that cascades to cart
- Update `checkout` resolver: set `lastPurchasedAt`, delete `quantity > 0` items
- Update `abandonCart` resolver: delete all items
- Remove `allActiveCarts` query → `allCarts`
- Apollo operations: update fragments; replace `AllActiveCarts` with `AllCarts`
- Update cloud hooks in `useShoppingCart.ts` to use new operations

### Phase G — Verification Gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
pnpm test:e2e --grep "shopping|a11y"
```

---

## Files to Discard from Phase 7 Draft

The current uncommitted Phase 7 changes implement the wrong schema. They will be overwritten during phases A–F:

- `apps/server/prisma/migrations/20260608171912_add_vendor_cart_fields/` — replaced by new migration
- `apps/server/prisma/migrations/20260609000000_remove_last_visited_at/` — replaced by new migration
- `apps/web/src/db/index.ts` — overwritten
- `apps/web/src/db/operations.ts` — overwritten
- All hook and route changes — overwritten
