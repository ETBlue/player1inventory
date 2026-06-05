# Implementation Plan — Vendor-Based Shopping Carts

**Design doc:** `2026-06-06-vendor-carts-design.md`
**Branch:** `worktree-feature-vendor-carts`

---

## Overview

This plan expands the single shopping cart into per-vendor carts. The work is split into 5 implementation phases, each independently verifiable. Cloud-mode support for multi-vendor carts is **out of scope** — cloud hooks fall back to the existing single-cart behavior (no regression) until a dedicated backend update.

---

## Phase 1 — Data Layer: Types, Schema, Operations

### Step 1.1 — Update `ShoppingCart` type

File: `packages/types/src/index.ts`

Add two optional fields to `ShoppingCart`:

```ts
export interface ShoppingCart {
  id: string
  vendorId: string | null    // null = "No vendor" cart; string = specific vendor
  lastVisitedAt: Date | null // used for "last visited" sort on root shopping page
  status: 'active' | 'completed' | 'abandoned'
  createdAt: Date
  completedAt?: Date
}
```

### Step 1.2 — Dexie schema migration

File: `apps/web/src/db/index.ts`

Add version 12:

```ts
// Version 12: Add vendorId and lastVisitedAt to shoppingCarts for per-vendor carts
db.version(12)
  .stores({
    items: 'id, name, targetUnit, createdAt, updatedAt',
    tags: 'id, typeId, parentId, createdAt',
    tagTypes: 'id, name',
    inventoryLogs: 'id, itemId, occurredAt, createdAt',
    shoppingCarts: 'id, status, vendorId, createdAt, completedAt',
    cartItems: 'id, cartId, itemId',
    vendors: 'id, name',
    recipes: 'id, name, lastCookedAt',
    shelves: 'id, name, type, order',
  })
  .upgrade((tx) =>
    tx.table('shoppingCarts').toCollection().modify((cart) => {
      cart.vendorId = null
      cart.lastVisitedAt = null
    }),
  )
```

### Step 1.3 — Update database operations

File: `apps/web/src/db/operations.ts`

**a. Update `getOrCreateActiveCart` to accept `vendorId`:**

```ts
export async function getOrCreateActiveCart(
  vendorId: string | null = null
): Promise<ShoppingCart> {
  const existing = await db.shoppingCarts
    .where('status').equals('active')
    .filter((c) => (c.vendorId ?? null) === vendorId)
    .first()
  if (existing) return existing

  const cart: ShoppingCart = {
    id: crypto.randomUUID(),
    vendorId,
    lastVisitedAt: null,
    status: 'active',
    createdAt: new Date(),
  }
  await db.shoppingCarts.add(cart)
  return cart
}
```

**b. Add `getAllActiveCarts`:**

```ts
export async function getAllActiveCarts(): Promise<ShoppingCart[]> {
  return db.shoppingCarts.where('status').equals('active').toArray()
}
```

**c. Add `updateCartLastVisited`:**

```ts
export async function updateCartLastVisited(cartId: string): Promise<void> {
  await db.shoppingCarts.update(cartId, { lastVisitedAt: new Date() })
}
```

**d. Update `checkout` — pinned items go to the SAME vendor's new cart:**

Change the existing call from:
```ts
const newCart = await getOrCreateActiveCart()
```
to:
```ts
const completedCart = await db.shoppingCarts.get(cartId)
const newCart = await getOrCreateActiveCart(completedCart?.vendorId ?? null)
```

### Step 1.4 — Update unit tests

File: `apps/web/src/db/operations.test.ts`

Add/update tests for:
- `getOrCreateActiveCart(null)` creates a "No vendor" cart
- `getOrCreateActiveCart(vendorId)` creates a vendor-specific cart
- Two calls with different vendorIds create two independent active carts
- Two calls with the same vendorId reuse the same cart
- `getAllActiveCarts()` returns all active carts
- `checkout()` — pinned items move to same-vendor's new cart (not a fresh null-vendor cart)

**Verification gate after Phase 1:**
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
(cd apps/web && pnpm test -- --run)
```

---

## Phase 2 — Hooks

File: `apps/web/src/hooks/useShoppingCart.ts`

### Step 2.1 — Add `useVendorCart(vendorId)`

New hook, local-mode only. Cloud mode returns existing `useActiveCart()` behavior (single cart, no vendorId).

```ts
export function useVendorCart(vendorId: string | null) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['cart', 'vendor', vendorId],
    queryFn: () => getOrCreateActiveCart(vendorId),
    enabled: !isCloud,
  })

  // Cloud fallback: use the single active cart (no vendor-cart support yet)
  const cloud = useActiveCartQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.activeCart
        ? deserializeCart(cloud.data.activeCart as Record<string, unknown>)
        : undefined,
      isLoading: cloud.loading,
      isError: !!cloud.error,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}
```

### Step 2.2 — Add `useAllActiveCarts()`

New hook, local-mode only.

```ts
export function useAllActiveCarts() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['cart', 'all-active'],
    queryFn: getAllActiveCarts,
    enabled: !isCloud,
  })

  // Cloud fallback: wrap single cart in an array
  const cloud = useActiveCartQuery({ skip: !isCloud })

  if (isCloud) {
    const cart = cloud.data?.activeCart
      ? deserializeCart(cloud.data.activeCart as Record<string, unknown>)
      : undefined
    return {
      data: cart ? [cart] : [],
      isLoading: cloud.loading,
      isError: !!cloud.error,
    }
  }

  return {
    data: local.data ?? [],
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}
```

### Step 2.3 — Add `useUpdateCartLastVisited()`

```ts
export function useUpdateCartLastVisited() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateCartLastVisited,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart', 'all-active'] })
    },
  })
}
```

Export all three new hooks from `src/hooks/index.ts`.

**Verification gate after Phase 2:**
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Phase 3 — VendorCartCard Component

### Step 3.1 — Create component

New component: `apps/web/src/components/shopping/VendorCartCard/`
- `VendorCartCard.tsx`
- `index.ts`
- `VendorCartCard.stories.tsx`
- `VendorCartCard.stories.test.tsx`

**Props:**
```ts
interface VendorCartCardProps {
  vendorName: string       // Vendor name, or i18n key for "No vendor"
  isNoVendor?: boolean     // true = show "No vendor" label (never capitalize)
  checkedCount: number     // number of cart items with quantity > 0
  checkedQuantity: number  // total packs/quantity in cart
  availableCount: number   // total items available from this vendor
  onClick: () => void
}
```

**Layout:**
```
[Vendor name (bold)]           [badge: N packs ✓]
[N of M items available →]
```

- Clicking anywhere navigates to the vendor cart page
- When `checkedQuantity > 0`: show a highlighted badge or border
- When `checkedQuantity === 0`: normal card style (no de-emphasis — all cards always shown)
- Vendor name uses `capitalize` class (same as item names); "No vendor" uses `normal-case` (like vendor badges)

**Stories:** Default, WithCheckedItems, NoVendorCard, EmptyCard

**Smoke test:** asserts vendor name and item count text are visible.

**Verification gate after Phase 3:**
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
(cd apps/web && pnpm test -- --run)
```

---

## Phase 4 — Root Shopping Page (Vendor Cart List)

### Step 4.1 — Restructure routes

**a. Transform `shopping.tsx` into a layout:**

Replace its component with a thin layout that just renders `<Outlet />`:

```ts
export const Route = createFileRoute('/shopping')({
  component: () => <Outlet />,
})
```

**b. Create `shopping.index.tsx`** — the new `/shopping` index page (vendor cart list).

**c. Rename the existing `shopping.stories.tsx` → `shopping.index.stories.tsx`** and update for the new cart list UI.

**d. Update `shopping.stories.test.tsx` → `shopping.index.stories.test.tsx`** accordingly.

### Step 4.2 — Build `shopping/index.tsx` (cart list page)

`validateSearch`:
```ts
validateSearch: (s) => ({
  sort: ['alpha', 'count'].includes(s.sort as string) ? (s.sort as string) : 'recent',
})
```

**Data needed:**
- `useVendors()` → all vendors
- `useAllActiveCarts()` → all active carts (to get checkedQuantity per vendor)
- `useCartItems(cartId)` per cart → cart item quantities (use per-cart queries via a helper)
- `useVendorItemCounts()` → total available items per vendor
- Items with no vendor: `items.filter(i => !i.vendorIds?.length)` count
- "No vendor" cart: from `allActiveCarts.find(c => c.vendorId === null)`

**Sort logic:**
- `'recent'` (default): sort by `cart.lastVisitedAt` descending (nulls last); "No vendor" card always last regardless of sort
- `'alpha'`: sort by vendor name A–Z; "No vendor" card always last
- `'count'`: sort by `availableCount` descending; "No vendor" card always last

**Navigation:** clicking a `VendorCartCard` → `navigate({ to: '/shopping/$vendorId', params: { vendorId: v.id } })` or `navigate({ to: '/shopping/$vendorId', params: { vendorId: 'no-vendor' } })`

**Toolbar:**
```tsx
<Toolbar>
  <span>{t('shopping.title')}</span>
  <div className="flex-1" />
  <SortButton ... />  {/* or a Select with sort options */}
</Toolbar>
```

**i18n keys to add** (both `en.json` and `tw.json`):
```json
"shopping": {
  "title": "Shopping",
  "noVendor": "No vendor",
  "cartList": {
    "sort": {
      "recent": "Last visited",
      "alpha": "A–Z",
      "count": "Most items"
    }
  },
  "cartCard": {
    "packsChecked_one": "{{count}} pack checked",
    "packsChecked_other": "{{count}} packs checked",
    "available_one": "{{count}} item available",
    "available_other": "{{count}} items available"
  }
}
```

**Verification gate after Phase 4:**
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
(cd apps/web && pnpm test -- --run)
```

---

## Phase 5 — Vendor Cart Page

### Step 5.1 — Create `shopping.$vendorId.tsx`

This file is the current `shopping.tsx` logic, adapted for vendor-scoping.

**Route params:**
```ts
export const Route = createFileRoute('/shopping/$vendorId')({
  component: VendorCart,
  validateSearch: (s) => ({ /* same as current shopping.tsx */ }),
})
```

**`vendorId` → `cartVendorId` resolution:**
```ts
const { vendorId: vendorIdParam } = Route.useParams()
const cartVendorId: string | null = vendorIdParam === 'no-vendor' ? null : vendorIdParam
const vendor = vendors.find(v => v.id === cartVendorId)  // undefined for "No vendor"
```

**Item scoping:**
- Normal vendor: `items.filter(i => (i.vendorIds ?? []).includes(cartVendorId))`
- No-vendor: `items.filter(i => !i.vendorIds?.length)`

**Cart:** `useVendorCart(cartVendorId)` instead of `useActiveCart()`

**Toolbar layout (3 rows):**

Row 1 (back + vendor name):
```tsx
<Toolbar>
  <Button variant="ghost" onClick={() => navigate({ to: '/shopping' })}>
    <ChevronLeft /> {t('common.back')}
  </Button>
  <div className="flex-1" />
  <span className={vendor ? 'normal-case' : ''}>
    {vendor?.name ?? t('shopping.noVendor')}
  </span>
</Toolbar>
```

Row 2 (count + actions):
```tsx
<Toolbar>
  <span aria-live="polite">{t('shopping.toolbar.cartCount', { count: cartTotal })}</span>
  <div className="flex-1" />
  {cartItems.length > 0 && <Button variant="destructive-ghost" ...>Cancel</Button>}
  <Button disabled={!cartItems.some(ci => ci.quantity > 0)} ...>Done</Button>
</Toolbar>
```

Row 3 (filter/sort): `<ItemListToolbar>` WITHOUT the vendor `leading` prop (no vendor dropdown in vendor cart context).

**Abandon dialog:** copy from current `shopping.tsx`, but after abandoning navigate back to `/shopping` (not `/shopping` with vendor param reset).

**Checkout dialog:** same as current, but:
- Log key is always `'shopping.log.purchasedAt'` (vendor is always known)
- Log params: `{ vendor: vendor?.name ?? t('shopping.noVendor') }`
- After checkout, navigate back to `/shopping`

**`lastVisitedAt` tracking:** call `updateCartLastVisited.mutate(cart.id)` on mount (inside `useEffect(() => { if (cart?.id) updateCartLastVisited.mutate(cart.id) }, [cart?.id])`).

**Stories:** `shopping.$vendorId.stories.tsx` — Default (with items), WithCheckedItems, WithNoVendorCart, EmptyCart

**Smoke test:** `shopping.$vendorId.stories.test.tsx`

**Update `shopping.test.tsx`:** shopping tests currently test the single-cart page. Migrate tests to:
- `shopping.index.test.tsx` — tests for cart list page (vendor cards render, sort works)
- `shopping.$vendorId.test.tsx` — tests for vendor cart page (same assertions as current tests, adapted for new route)

**Verification gate after Phase 5:**
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
(cd apps/web && pnpm test -- --run)
```

---

## Final Phase — E2E and CLAUDE.md

### Step 6.1 — Update E2E tests

File: `e2e/tests/shopping.spec.ts`

Update the two existing tests:
1. `'user can see expiration badge updated after checkout...'` — update navigation to go through `/shopping` → click vendor card → vendor cart page
2. `'user can checkout items from shopping cart'` — same navigation update

Add new tests:
- `'user can see vendor cart cards on the shopping page'`
- `'user can navigate to a vendor's cart and back'`
- `'user can checkout from a vendor cart without affecting other carts'`

### Step 6.2 — Update CLAUDE.md files

- `apps/web/src/routes/CLAUDE.md` — update Shopping Page section to reflect new route structure, 3-toolbar layout, per-vendor cart semantics
- `CLAUDE.md` (project root) — no changes needed (no architectural pattern changes)

### Final verification gate:
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports" || echo "OK"
pnpm test:e2e --grep "shopping|a11y"
```

---

## Out of Scope

- Cloud mode (GraphQL) multi-vendor cart support — requires backend schema changes; tracked as a follow-up
- Import/export data format changes for the new `vendorId` field on carts (low impact, carts are ephemeral)

---

## File Checklist

| File | Action |
|---|---|
| `packages/types/src/index.ts` | Update `ShoppingCart` type |
| `apps/web/src/db/index.ts` | Add Dexie version 12 |
| `apps/web/src/db/operations.ts` | Update `getOrCreateActiveCart`, add `getAllActiveCarts`, `updateCartLastVisited`, update `checkout` |
| `apps/web/src/db/operations.test.ts` | Add tests for new operations |
| `apps/web/src/hooks/useShoppingCart.ts` | Add `useVendorCart`, `useAllActiveCarts`, `useUpdateCartLastVisited` |
| `apps/web/src/hooks/index.ts` | Export new hooks |
| `apps/web/src/components/shopping/VendorCartCard/VendorCartCard.tsx` | New component |
| `apps/web/src/components/shopping/VendorCartCard/index.ts` | Barrel |
| `apps/web/src/components/shopping/VendorCartCard/VendorCartCard.stories.tsx` | Stories |
| `apps/web/src/components/shopping/VendorCartCard/VendorCartCard.stories.test.tsx` | Smoke test |
| `apps/web/src/routes/shopping.tsx` | Reduce to layout (`<Outlet />`) |
| `apps/web/src/routes/shopping.index.tsx` | New: vendor cart list page |
| `apps/web/src/routes/shopping.index.stories.tsx` | New: stories for cart list |
| `apps/web/src/routes/shopping.index.stories.test.tsx` | Smoke test |
| `apps/web/src/routes/shopping.index.test.tsx` | Unit tests for cart list |
| `apps/web/src/routes/shopping.$vendorId.tsx` | New: per-vendor cart page (from shopping.tsx) |
| `apps/web/src/routes/shopping.$vendorId.stories.tsx` | New: stories for vendor cart |
| `apps/web/src/routes/shopping.$vendorId.stories.test.tsx` | Smoke test |
| `apps/web/src/routes/shopping.$vendorId.test.tsx` | Unit tests for vendor cart |
| `apps/web/src/routes/shopping.test.tsx` | Delete (split into two files above) |
| `apps/web/src/routes/shopping.stories.tsx` | Delete (replaced by index + $vendorId stories) |
| `apps/web/src/routes/shopping.stories.test.tsx` | Delete (replaced) |
| `apps/web/src/i18n/locales/en.json` | Add new shopping keys |
| `apps/web/src/i18n/locales/tw.json` | Add new shopping keys (Chinese) |
| `apps/web/src/routes/CLAUDE.md` | Update Shopping Page section |
| `e2e/tests/shopping.spec.ts` | Update and add E2E tests |

---

## Status

🔲 Pending — implementation not started
