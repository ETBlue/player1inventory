# Shopping Cart Pin Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to pin items in the shopping cart at quantity=0, so they persist across checkout trips without contributing to inventory counts.

**Architecture:** `CartItem.quantity=0` signals a pinned item. `checkout()` in `operations.ts` skips pinned items when updating inventory, marks the old cart completed, clears it, then re-adds pinned items to the new active cart. The shopping page removes the `if (newQty >= 1)` guard so quantity can reach 0, and disables the Done button only when no item has quantity > 0.

**Tech Stack:** React 19, TypeScript strict, Dexie.js (IndexedDB), TanStack Query, Vitest + React Testing Library

---

### Task 1: Write failing tests for checkout with pinned items

**Files:**
- Modify: `src/db/operations.test.ts`

**Step 1: Locate the existing checkout tests**

The existing checkout tests are in `src/db/operations.test.ts` inside the `describe` block that imports `checkout`, `addToCart`, etc. Find the last checkout-related test to append after it.

**Step 2: Append two failing tests**

Add these two tests after the existing checkout tests (search for `it('checkout increments packedQuantity` to find the insertion point):

```ts
it('checkout skips inventory update for cartItems with quantity=0 (pinned)', async () => {
  // Given an item with known packedQuantity
  const item = await createItem({
    name: 'Milk',
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 2,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
  })

  // And a cart with a pinned item (quantity=0)
  const cart = await getOrCreateActiveCart()
  await addToCart(cart.id, item.id, 1)
  await updateCartItem(
    (await getCartItems(cart.id))[0].id,
    0,
  )

  // When checkout is called
  await checkout(cart.id)

  // Then item.packedQuantity is unchanged (pinned item not consumed)
  const updated = await db.items.get(item.id)
  expect(updated?.packedQuantity).toBe(2)

  // And no inventory log was created for the pinned item
  const logs = await db.inventoryLogs
    .filter((l) => l.itemId === item.id)
    .toArray()
  expect(logs).toHaveLength(0)
})

it('checkout keeps pinned items in new active cart', async () => {
  // Given an item
  const item = await createItem({
    name: 'Eggs',
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 0,
    packedQuantity: 1,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
  })

  // And a cart with one pinned item (quantity=0) and one buying item (quantity=2)
  const buyItem = await createItem({
    name: 'Butter',
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
  })
  const cart = await getOrCreateActiveCart()
  await addToCart(cart.id, item.id, 1)
  await updateCartItem(
    (await getCartItems(cart.id))[0].id,
    0,
  )
  await addToCart(cart.id, buyItem.id, 2)

  // When checkout is called
  await checkout(cart.id)

  // Then old cart is completed
  const oldCart = await db.shoppingCarts.get(cart.id)
  expect(oldCart?.status).toBe('completed')

  // And a new active cart exists
  const newCart = await getOrCreateActiveCart()
  expect(newCart.id).not.toBe(cart.id)

  // And the pinned item is in the new active cart with quantity=0
  const newCartItems = await getCartItems(newCart.id)
  expect(newCartItems).toHaveLength(1)
  expect(newCartItems[0].itemId).toBe(item.id)
  expect(newCartItems[0].quantity).toBe(0)

  // And the buying item is NOT in the new cart
  expect(newCartItems.find((ci) => ci.itemId === buyItem.id)).toBeUndefined()
})
```

**Step 3: Run tests to verify they fail**

```bash
cd /Users/etblue/Code/GitHub/player1inventory && pnpm test src/db/operations.test.ts --run 2>&1 | tail -15
```

Expected: 2 new tests FAIL (current checkout doesn't skip qty=0 or re-add pinned items).

---

### Task 2: Implement checkout changes in operations.ts

**Files:**
- Modify: `src/db/operations.ts:282-307`

**Step 1: Replace the `checkout` function body**

Find the entire `checkout` function:

```ts
export async function checkout(cartId: string): Promise<void> {
  const cartItems = await getCartItems(cartId)
  const now = new Date()

  for (const cartItem of cartItems) {
    await addInventoryLog({
      itemId: cartItem.itemId,
      delta: cartItem.quantity,
      occurredAt: now,
    })
    const item = await db.items.get(cartItem.itemId)
    if (item) {
      await db.items.update(cartItem.itemId, {
        packedQuantity: item.packedQuantity + cartItem.quantity,
        updatedAt: now,
      })
    }
  }

  await db.shoppingCarts.update(cartId, {
    status: 'completed',
    completedAt: now,
  })

  await db.cartItems.where('cartId').equals(cartId).delete()
}
```

Replace with:

```ts
export async function checkout(cartId: string): Promise<void> {
  const cartItems = await getCartItems(cartId)
  const now = new Date()

  // Separate pinned (quantity=0) from items being purchased
  const pinnedItems = cartItems.filter((ci) => ci.quantity === 0)
  const buyingItems = cartItems.filter((ci) => ci.quantity > 0)

  for (const cartItem of buyingItems) {
    await addInventoryLog({
      itemId: cartItem.itemId,
      delta: cartItem.quantity,
      occurredAt: now,
    })
    const item = await db.items.get(cartItem.itemId)
    if (item) {
      await db.items.update(cartItem.itemId, {
        packedQuantity: item.packedQuantity + cartItem.quantity,
        updatedAt: now,
      })
    }
  }

  await db.shoppingCarts.update(cartId, {
    status: 'completed',
    completedAt: now,
  })

  await db.cartItems.where('cartId').equals(cartId).delete()

  // Move pinned items to the new active cart
  if (pinnedItems.length > 0) {
    const newCart = await getOrCreateActiveCart()
    for (const pinned of pinnedItems) {
      await db.cartItems.add({
        id: crypto.randomUUID(),
        cartId: newCart.id,
        itemId: pinned.itemId,
        quantity: 0,
      })
    }
  }
}
```

**Step 2: Run tests to verify they pass**

```bash
cd /Users/etblue/Code/GitHub/player1inventory && pnpm test src/db/operations.test.ts --run 2>&1 | tail -15
```

Expected: all tests PASS including the 2 new ones.

**Step 3: Commit**

```bash
cd /Users/etblue/Code/GitHub/player1inventory && git add src/db/operations.ts src/db/operations.test.ts && git commit -m "feat(checkout): skip pinned items (qty=0), move them to next cart"
```

---

### Task 3: Write failing tests for shopping page pin behavior

**Files:**
- Modify: `src/routes/shopping.test.tsx`

**Step 1: Add a helper at the top of the describe block**

The existing tests use `createItem` inline. Add a helper near the top of `describe('Shopping page')` after the `renderShoppingPage` function:

```ts
const makeItem = (name: string, packedQuantity = 0) =>
  createItem({
    name,
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
  })
```

**Step 2: Append three failing tests**

Add these tests at the end of `describe('Shopping page')` (before the final `}`):

```tsx
it('user can reduce cart item quantity to 0 (pin)', async () => {
  // Given an item in the cart with quantity 1
  const item = await makeItem('Milk', 2)
  const cart = await getOrCreateActiveCart()
  await import('@/db/operations').then(({ addToCart }) =>
    addToCart(cart.id, item.id, 1),
  )

  renderShoppingPage()
  const user = userEvent.setup()

  // When the item appears in the cart section
  await waitFor(() => {
    expect(screen.getByRole('checkbox', { name: /Remove Milk/i })).toBeChecked()
  })

  // And user clicks the minus button
  await user.click(
    screen.getByRole('button', { name: /Decrease quantity of Milk/i }),
  )

  // Then quantity becomes 0 (item stays checked/in cart section)
  await waitFor(() => {
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Remove Milk/i })).toBeChecked()
  })
})

it('Done button is disabled when all cart items have quantity 0 (pinned only)', async () => {
  // Given an item pinned in the cart (quantity=0)
  const item = await makeItem('Eggs', 1)
  const cart = await getOrCreateActiveCart()
  const { addToCart: addFn, updateCartItem: updateFn, getCartItems: getFn } =
    await import('@/db/operations')
  await addFn(cart.id, item.id, 1)
  const [ci] = await getFn(cart.id)
  await updateFn(ci.id, 0)

  renderShoppingPage()

  // Then Done button is disabled (nothing to actually buy)
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /done/i })).toBeDisabled()
  })
})

it('pinned items (quantity=0) survive checkout and appear in next trip', async () => {
  // Given one pinned item (qty=0) and one buying item (qty=2)
  const pinned = await makeItem('Always Buy Milk', 3)
  const buying = await makeItem('Butter', 0)
  const cart = await getOrCreateActiveCart()
  const { addToCart: addFn, updateCartItem: updateFn, getCartItems: getFn } =
    await import('@/db/operations')
  await addFn(cart.id, pinned.id, 1)
  const [ci] = await getFn(cart.id)
  await updateFn(ci.id, 0)
  await addFn(cart.id, buying.id, 2)

  renderShoppingPage()
  const user = userEvent.setup()

  // When user clicks Done and confirms
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
  })
  await user.click(screen.getByRole('button', { name: /done/i }))
  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: /confirm/i }),
    ).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /confirm/i }))

  // Then the pinned item is still checked (in cart section)
  await waitFor(() => {
    expect(
      screen.getByRole('checkbox', { name: /Remove Always Buy Milk/i }),
    ).toBeChecked()
  })

  // And the buying item is unchecked (no longer in cart)
  await waitFor(() => {
    expect(
      screen.getByRole('checkbox', { name: /Add Butter/i }),
    ).not.toBeChecked()
  })
})
```

**Step 3: Run tests to verify they fail**

```bash
cd /Users/etblue/Code/GitHub/player1inventory && pnpm test src/routes/shopping.test.tsx --run 2>&1 | tail -15
```

Expected: the 3 new tests FAIL (qty still gated at 1; Done still disabled/enabled based on `cartItems.length`).

---

### Task 4: Implement shopping page changes

**Files:**
- Modify: `src/routes/shopping.tsx`

**Step 1: Remove the `if (newQty >= 1)` guard in `onAmountChange`**

Find:
```tsx
          onAmountChange={(delta) => {
            const newQty = (ci?.quantity ?? 0) + delta
            if (newQty >= 1) handleUpdateCartQuantity(item, newQty)
          }}
```

Replace with:
```tsx
          onAmountChange={(delta) => {
            const newQty = (ci?.quantity ?? 0) + delta
            handleUpdateCartQuantity(item, newQty)
          }}
```

(The minus button is already disabled at qty=0 by `minControlAmount=0` in `ItemCard`, so `newQty` can never go negative from a button click.)

**Step 2: Update the Done button disabled condition**

Find:
```tsx
        <Button
          disabled={cartItems.length === 0}
          onClick={() => setShowCheckoutDialog(true)}
        >
          <Check /> Done
        </Button>
```

Replace with:
```tsx
        <Button
          disabled={!cartItems.some((ci) => ci.quantity > 0)}
          onClick={() => setShowCheckoutDialog(true)}
        >
          <Check /> Done
        </Button>
```

**Step 3: Run the shopping tests**

```bash
cd /Users/etblue/Code/GitHub/player1inventory && pnpm test src/routes/shopping.test.tsx --run 2>&1 | tail -15
```

Expected: all tests PASS including the 3 new ones.

**Step 4: Run the full test suite**

```bash
cd /Users/etblue/Code/GitHub/player1inventory && pnpm test --run 2>&1 | tail -5
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
cd /Users/etblue/Code/GitHub/player1inventory && git add src/routes/shopping.tsx src/routes/shopping.test.tsx && git commit -m "feat(shopping): allow qty=0 as pin, disable Done when only pinned items"
```

---

### Final verification

```bash
pnpm test --run
pnpm build
```

Both should succeed with no errors.
