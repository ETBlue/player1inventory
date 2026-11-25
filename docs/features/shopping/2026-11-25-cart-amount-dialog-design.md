# Design: set a cart amount in a dialog

Date: 2026-11-25. Branch `feature/cart-amount-dialog`, from `develop` at `333dc2ca`.
Brainstorming: `2026-11-25-brainstorming-cart-amount-dialog.md`.

## Summary

1. **Where it sits.** On a cart page every `+` or `−` click is one request. Buying 10 of
   something costs 9 round trips, which is slow on a poor connection.
2. **Relations.** Web only. No server or schema change. Independent of
   `feature/inventory-log-layout`, which touches checkout's log params in the same page file
   (`routes/shopping/$vendorId.tsx`), so the second of the two to merge rebases.
3. **What the user gets** once merged and deployed: tap the amount, type or step to any
   number, Save once. Ticking a new item opens the same dialog with a suggested amount.
   Amount 0 keeps the item in the cart for next time, and the dialog says so.
4. **What the developer gets:** one small dialog component with a story. The cart page no
   longer uses `ItemCard`'s `−`/`+` control. Cost: `ItemCard` gets one more way to show an
   amount.

## The row

- The `− n +` group is replaced by ONE button showing the amount and the package unit, for
  example `10 pack` with a pencil icon. A 0 row shows `0 pack`.
- The checkbox keeps its meaning: ticked = in the cart, unticked = `removeFromCart`. It never
  changes the amount.
- A location viewer sees the button disabled, described by the view-only note, as today.
- The Cooking page keeps its `− n +` control (no requests there).

## The dialog (`CartAmountDialog`)

| Part | Rule |
|---|---|
| Title | the item name |
| Context | "In stock {n} · target {t} {unit}" for the active location |
| Amount | `QuantityStepper` and a number field. Whole numbers, 0 or more, step 1 |
| Amount 0 note | when the amount in the field is 0, a muted line under it: "Amount 0 keeps the item in the cart. It is not bought now; buy it next time." / 「數量為 0 時，品項會留在購物車，這次不買，下次再買。」 |
| Buttons | Cancel (`neutral-outline`) · Save (`primary`, spinner while saving) |
| Save disabled | the field is empty or invalid, the amount did not change (editing an existing row), or a save runs |
| Save | ONE request: `updateCartItem(id, amount)` for a row in the cart, `addToCart(cartId, itemId, amount)` for a new one |
| Save fails | the usual save error shows in the dialog, the dialog stays open with the number kept |
| Cancel / Escape | closes, sends nothing |

**Ticking an item not in the cart** opens the dialog for adding:

- Pre-filled with `max(1, ceil(target − stock now))` in packs, for the active location.
  Use the same "stock now" number the card already shows.
- Save adds; Cancel adds nothing and leaves it unticked.
- If another household member adds the same item while the dialog is open, `addToCart`
  ADDS the amount to theirs (it is an `upsert` with `increment`). Known, not changed here.

## Tests

- Dialog: renders the context, steps and typing, 0 shows the note and other amounts do not,
  Save disabled rules, one `onSubmit` call, a failed save keeps it open.
- Page: tapping the amount opens the dialog; Save sends one `updateCartItem` with the typed
  amount; ticking opens the add dialog with the suggested amount, Save sends one `addToCart`,
  Cancel sends nothing; a viewer cannot open it. Local and cloud, where the page has a cloud
  test file.
- Mutation checks: Save sends per step instead of once → red; Cancel still adds → red; the
  note shown for every amount → red; the suggested amount ignores the stock → red.
- E2E, local and cloud: add an item with 10 through the dialog; change one to 0, check out,
  and the 0 row is still in the cart; axe scans of the dialog in light and dark.
- Story and smoke test for `CartAmountDialog`.

## Not in this design

- Fractional cart amounts (the server type is `Int`).
- The Cooking page's controls.
