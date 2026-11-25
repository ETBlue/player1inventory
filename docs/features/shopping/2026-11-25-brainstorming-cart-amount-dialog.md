# Brainstorming: set a cart amount in a dialog

Date: 2026-11-25. Owner and main session.

## The request (owner)

On a cart page (`/shopping/$vendorId`) each `+` or `−` click sends one request. To buy 10 of
something the owner clicks `+` nine times and waits each time, which is slow in a supermarket
with a poor connection. Use a dialog with a Save button, like the pantry Quick update, so going
from 1 to 10 costs one request.

## What the code does today (checked)

| Part | Today |
|---|---|
| Row | `ItemCard mode="shopping"`: a checkbox, then `− n +` (`controlAmount`, `onAmountChange(±1)`) |
| Tick | `addToCart(quantity: 1)`; untick: `removeFromCart` |
| `−` / `+` | `updateCartItem(id, quantity)` with the new total, one request per click |
| Amount 0 | allowed (`minControlAmount` is 0). `isBeingBought` is `quantity > 0`, so a 0 row stays in the cart after checkout: "buy next time" |
| Amount type | `Int` packs on the server |
| Cooking page | also `− n +`, but local state only, no request |

## Decisions

| # | Question | Answer |
|---|---|---|
| Q1 | The control | **One amount button opens a dialog.** Considered: keep `− +` and add the dialog; batch clicks with no dialog (rejected by the owner) |
| Q2 | Ticking an item not in the cart | **Open the dialog**, pre-filled with the amount to reach the target (at least 1). Save adds; Cancel adds nothing |
| Q3 | What else the dialog shows | **Stock now and target** at the active location |
| Q4 | Amount 0 | **Allowed.** Owner: "amount 0 means buy next time. amount and checkbox should work separately". The checkbox is "in the cart"; the amount is how many to buy now |
| Q5 | Extra text | When the amount is 0, the dialog **shows a "buy next time" note** (owner, after approving the design) |

See `2026-11-25-cart-amount-dialog-design.md`.
