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

## Phase 7 — Cloud Mode (GraphQL + Prisma)

Phases 1–6 leave cloud-mode hooks on a graceful fallback (single cart, no vendor separation). This phase replaces those fallbacks with full vendor-cart support in cloud mode.

> **Prerequisite:** Phases 1–6 complete and merged. Run on top of the same branch.

### Step 7.1 — Prisma schema

File: `apps/server/prisma/schema.prisma`

Add `vendorId` and `lastVisitedAt` to the `Cart` model, and update the index:

```prisma
model Cart {
  id            String     @id @default(cuid())
  status        CartStatus
  userId        String
  familyId      String?
  vendorId      String?        // NEW: null = "No vendor" cart
  lastVisitedAt DateTime?      // NEW: for last-visited sort on root page
  completedAt   DateTime?
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  items CartItem[]

  @@index([userId, status])
  @@index([userId, status, vendorId])   // NEW: vendor-scoped active cart lookup
}
```

No `@relation` to Vendor — `vendorId` is stored as a plain string. Vendor deletion cascade is handled at the application level (same pattern as `item.vendorIds`).

Generate and apply migration:
```bash
(cd apps/server && npx prisma migrate dev --name add-vendor-cart-fields)
```

### Step 7.2 — GraphQL schema

File: `apps/server/src/schema/cart.graphql`

Add two fields to `Cart`, two new queries, and one new mutation:

```graphql
type Cart {
  id: ID!
  status: String!
  vendorId: ID            # NEW
  lastVisitedAt: String   # NEW
  createdAt: String!
  completedAt: String
}

extend type Query {
  activeCart: Cart!
  vendorCart(vendorId: ID): Cart!    # NEW — gets or creates the active cart for a specific vendor (null = no-vendor)
  allActiveCarts: [Cart!]!           # NEW — all active carts for the current user
  cartItems(cartId: ID!): [CartItem!]!
  cartItemCountByItem(itemId: ID!): Int!
  shoppingCarts: [Cart!]!
  allCartItems: [CartItem!]!
}

extend type Mutation {
  addToCart(cartId: ID!, itemId: ID!, quantity: Int!): CartItem!
  updateCartItem(id: ID!, quantity: Int!): CartItem!
  removeFromCart(id: ID!): Boolean!
  checkout(cartId: ID!, note: String, logKey: String, logParams: JSON): Cart!
  abandonCart(cartId: ID!): Cart!
  updateCartLastVisited(cartId: ID!): Cart!   # NEW
}
```

### Step 7.3 — Cart resolver

File: `apps/server/src/resolvers/cart.resolver.ts`

**a. Add `vendorCart` query:**
```ts
vendorCart: async (_, { vendorId = null }, ctx) => {
  const userId = requireAuth(ctx)
  const vId = vendorId ?? null
  let cart = await prisma.cart.findFirst({
    where: { userId, status: 'active', vendorId: vId },
  })
  if (!cart) {
    cart = await prisma.cart.create({
      data: { userId, status: 'active', vendorId: vId },
    })
  }
  return cart as unknown as Cart
},
```

**b. Add `allActiveCarts` query:**
```ts
allActiveCarts: async (_, __, ctx) => {
  const userId = requireAuth(ctx)
  return prisma.cart.findMany({
    where: { userId, status: 'active' },
    orderBy: [{ lastVisitedAt: 'desc' }, { createdAt: 'asc' }],
  }) as unknown as Promise<Cart[]>
},
```

**c. Add `updateCartLastVisited` mutation:**
```ts
updateCartLastVisited: async (_, { cartId }, ctx) => {
  const userId = requireAuth(ctx)
  const cart = await prisma.cart.update({
    where: { id: cartId },
    data: { lastVisitedAt: new Date() },
  })
  if (!cart || cart.userId !== userId) throw new GraphQLError('Cart not found', { extensions: { code: 'NOT_FOUND' } })
  return cart as unknown as Cart
},
```

**d. Update `checkout` — pinned items go to the same vendor's new cart:**
```ts
// Replace the existing pinned-items block:
if (pinnedItems.length > 0) {
  const completedCart = await prisma.cart.findUnique({ where: { id: cartId } })
  const vId = completedCart?.vendorId ?? null
  let newCart = await prisma.cart.findFirst({ where: { userId, status: 'active', vendorId: vId } })
  if (!newCart) newCart = await prisma.cart.create({ data: { userId, status: 'active', vendorId: vId } })
  for (const ci of pinnedItems) {
    await prisma.cartItem.create({ data: { cartId: newCart.id, itemId: ci.itemId, quantity: 0, userId } })
  }
}
```

**e. Add `Cart` field resolvers for the two new fields:**
```ts
Cart: {
  createdAt: (cart) => { /* existing */ },
  completedAt: (cart) => { /* existing */ },
  vendorId: (cart) => (cart as unknown as { vendorId?: string | null }).vendorId ?? null,
  lastVisitedAt: (cart) => {
    const lv = (cart as unknown as { lastVisitedAt?: Date | null }).lastVisitedAt
    return lv ? lv.toISOString() : null
  },
},
```

### Step 7.4 — Import/export schema + resolver

**a.** File: `apps/server/src/schema/import.graphql`

Add `vendorId` and `lastVisitedAt` to `ShoppingCartInput`:
```graphql
input ShoppingCartInput {
  id: ID!
  status: String!
  vendorId: ID         # NEW
  lastVisitedAt: String  # NEW
  createdAt: String!
  completedAt: String
}
```

**b.** File: `apps/server/src/resolvers/import.resolver.ts`

Update `bulkCreateShoppingCarts` and `bulkUpsertShoppingCarts` to pass `vendorId` and `lastVisitedAt` through to Prisma — both are optional fields, so existing import payloads (without them) continue to work without changes.

### Step 7.5 — Code generation

```bash
(cd apps/web && pnpm codegen)
```

This regenerates `apps/web/src/generated/graphql.ts` from the updated schema + operations. Verify that `Cart` now includes `vendorId` and `lastVisitedAt` fields.

### Step 7.6 — Update frontend GraphQL operations

File: `apps/web/src/apollo/operations/shopping.graphql`

Add `vendorId` and `lastVisitedAt` to the `ActiveCart` query selection, and add two new queries plus one new mutation:

```graphql
query ActiveCart {
  activeCart {
    id
    status
    vendorId
    lastVisitedAt
    createdAt
    completedAt
  }
}

# NEW
query VendorCart($vendorId: ID) {
  vendorCart(vendorId: $vendorId) {
    id
    status
    vendorId
    lastVisitedAt
    createdAt
    completedAt
  }
}

# NEW
query AllActiveCarts {
  allActiveCarts {
    id
    status
    vendorId
    lastVisitedAt
    createdAt
    completedAt
  }
}

# NEW
mutation UpdateCartLastVisited($cartId: ID!) {
  updateCartLastVisited(cartId: $cartId) {
    id
    lastVisitedAt
  }
}

# ... existing operations unchanged
```

Then re-run codegen again after adding the operations:
```bash
(cd apps/web && pnpm codegen)
```

### Step 7.7 — Update deserialization

File: `apps/web/src/lib/deserialization.ts`

```ts
export function deserializeCart(raw: Record<string, unknown>): ShoppingCart {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt as string),
    completedAt: raw.completedAt ? new Date(raw.completedAt as string) : undefined,
    lastVisitedAt: raw.lastVisitedAt ? new Date(raw.lastVisitedAt as string) : null,  // NEW
  } as ShoppingCart
}
```

### Step 7.8 — Update hooks to use cloud queries

File: `apps/web/src/hooks/useShoppingCart.ts`

Replace the cloud fallbacks in the three new hooks with real Apollo queries:

**`useVendorCart(vendorId)`** — replace `useActiveCartQuery` fallback with `useVendorCartQuery`:
```ts
const cloud = useVendorCartQuery({
  variables: { vendorId: vendorId },
  skip: !isCloud,
})
// deserialize: cloud.data?.vendorCart ? deserializeCart(...) : undefined
```

**`useAllActiveCarts()`** — replace wrapped-single-cart fallback with `useAllActiveCartsQuery`:
```ts
const cloud = useAllActiveCartsQuery({ skip: !isCloud })
// data: cloud.data?.allActiveCarts?.map(deserializeCart) ?? []
```

**`useUpdateCartLastVisited()`** — add cloud branch:
```ts
const [cloudUpdate] = useUpdateCartLastVisitedMutation()
if (mode === 'cloud') {
  return {
    mutate: (cartId: string) => cloudUpdate({ variables: { cartId } }),
    isPending: false,
  }
}
return localMutation
```

### Step 7.9 — Cloud E2E tests

Add a `test.describe('cloud mode vendor carts')` block in `e2e/tests/shopping.spec.ts` guarded by `test.skip(!process.env.TEST_CLOUD_MODE, ...)`, covering:
- `'user can see vendor cart cards (cloud mode)'`
- `'user can checkout from vendor cart in cloud mode'`

**Verification gate after Phase 7:**
```bash
(cd apps/server && npx prisma migrate dev --name add-vendor-cart-fields)
(cd apps/web && pnpm codegen)
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
(cd apps/web && pnpm test -- --run)
pnpm test:e2e --grep "shopping|a11y"
```

---

## Out of Scope

- Import/export data format changes for the new `vendorId` field on carts (low impact, carts are ephemeral; existing payloads import fine since both fields are optional)

---

## File Checklist

| File | Action |
|---|---|
| `packages/types/src/index.ts` | Update `ShoppingCart` type |
| `apps/web/src/db/index.ts` | Add Dexie version 12 |
| `apps/web/src/db/operations.ts` | Update `getOrCreateActiveCart`, add `getAllActiveCarts`, `updateCartLastVisited`, update `checkout` |
| `apps/web/src/db/operations.test.ts` | Add tests for new operations |
| `apps/web/src/hooks/useShoppingCart.ts` | Add `useVendorCart`, `useAllActiveCarts`, `useUpdateCartLastVisited` (cloud fallbacks in Phases 1–6; replaced in Phase 7) |
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
| `apps/server/prisma/schema.prisma` | Add `vendorId`, `lastVisitedAt` to Cart + new index *(Phase 7)* |
| `apps/server/src/schema/cart.graphql` | Add fields + `vendorCart`, `allActiveCarts`, `updateCartLastVisited` *(Phase 7)* |
| `apps/server/src/schema/import.graphql` | Add `vendorId`, `lastVisitedAt` to `ShoppingCartInput` *(Phase 7)* |
| `apps/server/src/resolvers/cart.resolver.ts` | Add resolvers, update checkout pinned-item logic *(Phase 7)* |
| `apps/server/src/resolvers/import.resolver.ts` | Pass new fields through bulk ops *(Phase 7)* |
| `apps/web/src/apollo/operations/shopping.graphql` | Add `VendorCart`, `AllActiveCarts`, `UpdateCartLastVisited` *(Phase 7)* |
| `apps/web/src/lib/deserialization.ts` | Handle `lastVisitedAt` in `deserializeCart` *(Phase 7)* |

---

## Status

🔲 Pending — implementation not started
