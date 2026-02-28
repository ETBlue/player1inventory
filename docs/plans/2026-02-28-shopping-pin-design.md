# Design: Pinned Items in Shopping Cart (quantity=0)

## Overview

Allow users to "pin" items in the shopping cart at quantity=0. Pinned items sit at the top of the shopping list across trips without contributing to the purchase count. After checkout, pinned items survive and are ready for the next trip.

## Approach

Use `CartItem.quantity=0` as the pin signal. No schema change required. The existing `minControlAmount=0` default (set in the cooking mode PR) means the minus button in `ItemCard` already disables at 0.

## Design Decisions

### 1. ItemCard — allow quantity=0 in shopping mode

Remove the `if (newQty >= 1)` guard in the shopping page's `onAmountChange` handler so quantity can reach 0. When quantity hits 0, `updateCartItem` saves `quantity: 0` and the item remains in the cart section (still has a CartItem record). The minus button is already disabled at 0 by `minControlAmount=0`.

### 2. Checkout — skip qty=0 items

In `checkout` (`src/db/operations.ts`), add a guard at the top of the cartItem loop:

```ts
if (cartItem.quantity === 0) continue  // pinned — skip inventory update + log
```

At the end of checkout, only delete cartItems with `quantity > 0`. Pinned (qty=0) cartItems are kept, so they automatically appear in the next trip's cart section.

### 3. Cart total and Done button

- `cartTotal` (sum of all cartItem quantities) is unaffected — qty=0 items contribute 0 naturally.
- Done button currently disables when `cartItems.length === 0`. Change to disable when no cartItem has `quantity > 0`:

```ts
const hasItemsToBuy = cartItems.some(ci => ci.quantity > 0)
// Done button: disabled={!hasItemsToBuy}
```

### 4. Abandon cart

`abandonCart` deletes all cartItems including pinned ones — intentional. Abandoning a trip clears everything.

## Files Changed

- `src/db/operations.ts` — `checkout`: skip qty=0 in loop; only delete qty>0 cartItems at the end
- `src/routes/shopping.tsx` — remove `if (newQty >= 1)` guard; update Done button disabled condition
- `src/routes/shopping.test.tsx` — tests: qty reaches 0, pinned item survives checkout, Done disabled when only pinned items
