# Implementation Plan: Shopping Cart Backend Migration + E2E Cloud Support

**Date:** 2026-03-17
**Branch:** `feature/backend-shopping-migration`
**Related brainstorming:** `docs/features/item-list-state-restore/2026-03-17-brainstorming-e2e-cloud-support.md`
**Milestone:** `v0.2.0 — Cloud Foundation`

## Goal

Migrate the shopping cart feature to support cloud mode, following the same dual-mode
hook pattern as items, tags, vendors, and recipes. Then add cloud mode coverage to
`e2e/tests/shopping.spec.ts`.

The E2E test is fully UI-driven (creates item via pantry UI, uses shopping UI for
cart/checkout) — no special GraphQL seeding needed in the test itself.

---

## Steps

### Step 1 — Server: Cart and CartItem MongoDB models

**Files:**
- `apps/server/src/models/Cart.model.ts` (new)

```ts
import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose'

@modelOptions({ schemaOptions: { timestamps: true, collection: 'carts' } })
@index({ userId: 1, status: 1 })
class CartClass {
  @prop({ required: true })
  status!: 'active' | 'completed' | 'abandoned'

  @prop({ required: true })
  userId!: string

  @prop()
  familyId?: string

  @prop()
  completedAt?: Date

  createdAt!: Date
  updatedAt!: Date
}

export const CartModel = getModelForClass(CartClass)

@modelOptions({ schemaOptions: { timestamps: false, collection: 'cartItems' } })
@index({ cartId: 1 })
@index({ itemId: 1 })
class CartItemClass {
  @prop({ required: true })
  cartId!: string

  @prop({ required: true })
  itemId!: string

  @prop({ required: true })
  quantity!: number

  @prop({ required: true })
  userId!: string
}

export const CartItemModel = getModelForClass(CartItemClass)
```

Note: Both models include `userId` for cleanup endpoint support. `CartItemModel` does not
use timestamps (mirrors the `CartItem` interface which has no timestamps).

**Verification:** `(cd apps/server && pnpm build)` passes.

---

### Step 2 — Server: GraphQL schema

**Files:**
- `apps/server/src/schema/cart.graphql` (new)
- `apps/server/src/schema/index.ts` (add `cart.graphql`)

```graphql
# cart.graphql

type Cart {
  id: ID!
  status: String!
  createdAt: String!
  completedAt: String
}

type CartItem {
  id: ID!
  cartId: String!
  itemId: String!
  quantity: Int!
}

type Query {
  activeCart: Cart!
  cartItems(cartId: ID!): [CartItem!]!
  cartItemCountByItem(itemId: String!): Int!
}

type Mutation {
  addToCart(cartId: ID!, itemId: String!, quantity: Int!): CartItem!
  updateCartItem(id: ID!, quantity: Int!): CartItem!
  removeFromCart(id: ID!): Boolean!
  checkout(cartId: ID!): Cart!
  abandonCart(cartId: ID!): Cart!
}
```

Register in `schema/index.ts` by adding `load('cart.graphql')` to the `typeDefs` array.

**Verification:** `(cd apps/server && pnpm build)` passes.

---

### Step 3 — Server: Cart resolver

**Files:**
- `apps/server/src/resolvers/cart.resolver.ts` (new)
- `apps/server/src/resolvers/index.ts` (register cartResolvers)

Key resolver logic:

**`activeCart`** — returns or creates the active cart for the user:
```ts
async activeCart(_, __, { userId }) {
  if (!userId) throw new Error('Unauthorized')
  let cart = await CartModel.findOne({ userId, status: 'active' })
  if (!cart) {
    cart = await CartModel.create({ userId, status: 'active' })
  }
  return { ...cart.toObject(), id: cart._id.toString() }
}
```

**`cartItems`** — returns all CartItems for a cart:
```ts
async cartItems(_, { cartId }, { userId }) {
  if (!userId) throw new Error('Unauthorized')
  const items = await CartItemModel.find({ cartId, userId })
  return items.map(i => ({ ...i.toObject(), id: i._id.toString() }))
}
```

**`cartItemCountByItem`** — count of cart items for an item:
```ts
async cartItemCountByItem(_, { itemId }, { userId }) {
  if (!userId) throw new Error('Unauthorized')
  return CartItemModel.countDocuments({ itemId, userId })
}
```

**`addToCart`** — upsert: increment quantity if item already in cart, else create:
```ts
async addToCart(_, { cartId, itemId, quantity }, { userId }) {
  if (!userId) throw new Error('Unauthorized')
  const existing = await CartItemModel.findOne({ cartId, itemId, userId })
  if (existing) {
    existing.quantity += quantity
    await existing.save()
    return { ...existing.toObject(), id: existing._id.toString() }
  }
  const item = await CartItemModel.create({ cartId, itemId, quantity, userId })
  return { ...item.toObject(), id: item._id.toString() }
}
```

**`updateCartItem`**:
```ts
async updateCartItem(_, { id, quantity }, { userId }) {
  if (!userId) throw new Error('Unauthorized')
  const item = await CartItemModel.findOneAndUpdate(
    { _id: id, userId },
    { quantity },
    { new: true },
  )
  if (!item) throw new Error('CartItem not found')
  return { ...item.toObject(), id: item._id.toString() }
}
```

**`removeFromCart`**:
```ts
async removeFromCart(_, { id }, { userId }) {
  if (!userId) throw new Error('Unauthorized')
  await CartItemModel.deleteOne({ _id: id, userId })
  return true
}
```

**`checkout`** — mirrors local `checkout()` in `db/operations.ts`:
- Fetch all cart items
- Separate pinned items (quantity === 0) from buying items (quantity > 0)
- For each buying item: increment `packedQuantity` on the Item, create an InventoryLog
- Mark cart as `completed`, set `completedAt`
- Delete all cart items for the cart
- Move pinned items to the new active cart

```ts
async checkout(_, { cartId }, { userId }) {
  if (!userId) throw new Error('Unauthorized')
  const cartItems = await CartItemModel.find({ cartId, userId })
  const pinnedItems = cartItems.filter(ci => ci.quantity === 0)
  const buyingItems = cartItems.filter(ci => ci.quantity > 0)

  const now = new Date()
  for (const ci of buyingItems) {
    await ItemModel.findOneAndUpdate(
      { _id: ci.itemId, userId },
      { $inc: { packedQuantity: ci.quantity }, updatedAt: now },
    )
    await InventoryLogModel.create({
      itemId: ci.itemId,
      delta: ci.quantity,
      loggedAt: now,
      userId,
    })
  }

  await CartModel.findOneAndUpdate(
    { _id: cartId, userId },
    { status: 'completed', completedAt: now },
  )
  await CartItemModel.deleteMany({ cartId, userId })

  // Move pinned items to the new active cart
  if (pinnedItems.length > 0) {
    let newCart = await CartModel.findOne({ userId, status: 'active' })
    if (!newCart) newCart = await CartModel.create({ userId, status: 'active' })
    for (const ci of pinnedItems) {
      await CartItemModel.create({ cartId: newCart._id.toString(), itemId: ci.itemId, quantity: 0, userId })
    }
  }

  const updatedCart = await CartModel.findById(cartId)
  return { ...updatedCart!.toObject(), id: updatedCart!._id.toString() }
}
```

**`abandonCart`**:
```ts
async abandonCart(_, { cartId }, { userId }) {
  if (!userId) throw new Error('Unauthorized')
  await CartItemModel.deleteMany({ cartId, userId })
  const cart = await CartModel.findOneAndUpdate(
    { _id: cartId, userId },
    { status: 'abandoned' },
    { new: true },
  )
  if (!cart) throw new Error('Cart not found')
  return { ...cart.toObject(), id: cart._id.toString() }
}
```

Add `cartResolvers` to `resolvers/index.ts`.

**Verification:** `(cd apps/server && pnpm build)` passes.

---

### Step 4 — Server: Extend cleanup endpoint

**File:** `apps/server/src/index.ts`

Add `CartModel` and `CartItemModel` imports. Add them to the `Promise.all([...])` in the
`/e2e/cleanup` handler:

```ts
import { CartItemModel, CartModel } from './models/Cart.model.js'
// ...
await Promise.all([
  ItemModel.deleteMany({ userId }),
  TagModel.deleteMany({ userId }),
  TagTypeModel.deleteMany({ userId }),
  VendorModel.deleteMany({ userId }),
  RecipeModel.deleteMany({ userId }),
  CartModel.deleteMany({ userId }),        // added
  CartItemModel.deleteMany({ userId }),    // added
])
```

**Verification:** `(cd apps/server && pnpm build)` passes.

---

### Step 5 — Frontend: GraphQL operations

**File:** `apps/web/src/apollo/operations/shopping.graphql` (new)

```graphql
query ActiveCart {
  activeCart {
    id
    status
    createdAt
    completedAt
  }
}

query CartItems($cartId: ID!) {
  cartItems(cartId: $cartId) {
    id
    cartId
    itemId
    quantity
  }
}

query CartItemCountByItem($itemId: String!) {
  cartItemCountByItem(itemId: $itemId)
}

mutation AddToCart($cartId: ID!, $itemId: String!, $quantity: Int!) {
  addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) {
    id
    cartId
    itemId
    quantity
  }
}

mutation UpdateCartItem($id: ID!, $quantity: Int!) {
  updateCartItem(id: $id, quantity: $quantity) {
    id
    cartId
    itemId
    quantity
  }
}

mutation RemoveFromCart($id: ID!) {
  removeFromCart(id: $id)
}

mutation Checkout($cartId: ID!) {
  checkout(cartId: $cartId) {
    id
    status
    completedAt
  }
}

mutation AbandonCart($cartId: ID!) {
  abandonCart(cartId: $cartId) {
    id
    status
  }
}
```

**Regenerate `src/generated/graphql.ts`:**

```bash
(cd apps/web && pnpm codegen)
```

Verify the following hooks are generated:
- `useActiveCartQuery`
- `useCartItemsQuery`
- `useCartItemCountByItemQuery`
- `useAddToCartMutation`
- `useUpdateCartItemMutation`
- `useRemoveFromCartMutation`
- `useCheckoutMutation`
- `useAbandonCartMutation`

**Verification:** `(cd apps/web && pnpm build)` passes.

---

### Step 6 — Frontend: Dual-mode `useShoppingCart.ts`

**File:** `apps/web/src/hooks/useShoppingCart.ts`

Rewrite each exported hook to branch on `dataMode`, following the same pattern as
`useRecipes.ts`. Both local and cloud hooks are initialized unconditionally; the active
branch is selected at render time.

Normalized return shape for queries: `{ data, isLoading, isError }`
Normalized return shape for mutations: `{ mutate, mutateAsync, isPending, error, reset }`

Key hooks:

**`useActiveCart()`** — query, returns `ShoppingCart | undefined`:
```ts
export function useActiveCart() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['cart', 'active'],
    queryFn: getOrCreateActiveCart,
    enabled: !isCloud,
  })
  const cloud = useActiveCartQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.activeCart as ShoppingCart | undefined,
      isLoading: cloud.loading,
      isError: !!cloud.error,
    }
  }
  return { data: local.data, isLoading: local.isPending ?? false, isError: local.isError }
}
```

**`useCartItems(cartId)`** — query, returns `CartItem[] | undefined`:
Similar pattern using `useCartItemsQuery({ variables: { cartId }, skip: !isCloud || !cartId })`.

**`useAddToCart()`** — mutation:
```ts
export function useAddToCart() {
  const { mode } = useDataMode()
  const queryClient = useQueryClient()

  const localMutation = useMutation({
    mutationFn: ({ cartId, itemId, quantity }: { cartId: string; itemId: string; quantity: number }) =>
      addToCart(cartId, itemId, quantity),
    onSuccess: (_, { cartId }) => {
      queryClient.invalidateQueries({ queryKey: ['cart', cartId, 'items'] })
    },
    enabled: mode !== 'cloud',
  })
  const [cloudAddToCart] = useAddToCartMutation()

  if (mode === 'cloud') {
    return {
      mutate: (vars: { cartId: string; itemId: string; quantity: number }) =>
        cloudAddToCart({ variables: vars }),
      mutateAsync: (vars: { cartId: string; itemId: string; quantity: number }) =>
        cloudAddToCart({ variables: vars }).then(r => r.data?.addToCart),
      isPending: false,
      error: null,
      reset: () => {},
    }
  }
  return localMutation
}
```

Repeat the same pattern for `useUpdateCartItem`, `useRemoveFromCart`, `useCheckout`,
`useAbandonCart`.

**`useCheckout()`** — cloud must also invalidate items cache after checkout:
After the Apollo mutation resolves, call:
```ts
await queryClient.invalidateQueries({ queryKey: ['cart'] })
await queryClient.invalidateQueries({ queryKey: ['items'] })
await queryClient.invalidateQueries({ queryKey: ['sort', 'purchaseDates'] })
```

**Verification:** `(cd apps/web && pnpm build)` passes. `(cd apps/web && pnpm test)` passes.

---

### Step 7 — E2E: Update `shopping.spec.ts` and `playwright.config.ts`

**File:** `e2e/tests/shopping.spec.ts`

1. Add imports:
   ```ts
   import type { APIRequestContext } from '@playwright/test'
   import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../constants'
   ```

2. Add `beforeEach` cloud cleanup:
   ```ts
   test.beforeEach(async ({ request, baseURL }) => {
     if (baseURL === CLOUD_WEB_URL) {
       await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
         headers: { 'x-e2e-user-id': E2E_USER_ID },
       })
     }
   })
   ```

3. Extend `afterEach` to handle cloud:
   ```ts
   test.afterEach(async ({ page, request, baseURL }) => {
     if (baseURL === CLOUD_WEB_URL) {
       await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
         headers: { 'x-e2e-user-id': E2E_USER_ID },
       })
       return
     }
     // existing IndexedDB cleanup unchanged
   })
   ```

4. The test body itself (`user can checkout items from shopping cart`) is entirely
   UI-driven — no changes needed to the test logic. It will run identically in both
   local and cloud modes.

**File:** `e2e/playwright.config.ts`

Add `'**/tests/shopping.spec.ts'` to the `testMatch` array for the `cloud` project.

**Verification:** `pnpm test:e2e --grep "shopping"` passes in both local and cloud mode.

---

### Step 8 — Final quality gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports" || echo "OK"
(cd apps/web && pnpm test)
pnpm test:e2e --grep "shopping"
```

All must pass before finishing.

---

## Out of Scope

- Refactoring existing test files to use the shared `makeGql` helper
- Adding new shopping test cases
- InventoryLog model on the server (use the existing one if available; create minimally if not)
- UI changes to the shopping page
