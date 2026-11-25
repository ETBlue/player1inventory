# Design: set a cart amount in a dialog

Date: 2026-11-25. Branch `feature/cart-amount-dialog`, from `develop` at `aba1f314`.
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

## As built (2026-11-25)

Built on `feature/cart-amount-dialog`. Web only, as designed: no server, schema or Dexie
change. Not merged, not deployed.

| Part | Where |
|---|---|
| the dialog | `apps/web/src/components/shopping/CartAmountDialog/` (component, stories, smoke test, unit tests) |
| the amount button | `ItemCard`'s new `onAmountEdit` and `amountUnit` props |
| the suggested amount | `suggestedCartAmount(item)` in `apps/web/src/lib/quantityUtils.ts` |
| the page | `apps/web/src/routes/shopping/$vendorId.tsx`: `amountDialog` state, `handleToggleCart`, `handleSaveAmount`. `handleUpdateCartQuantity` is deleted |
| texts | `shopping.amountDialog.*` in `en.json` and `tw.json` |

**Where the build differs from the design, or adds to it:**

1. **`ItemCard` gets a callback, not a mode.** `onAmountEdit` switches the `− n +` group to
   one button. `onAmountChange` keeps the group, so the Cooking page and the recipe items tab
   need no change. When both are passed, `onAmountEdit` wins.
2. **The suggested amount is counted in packs, with the card's numbers turned into packs
   first.** The card shows stock and target in the TRACKING unit (`getCurrentQuantity`,
   `targetQuantity`, the measurement unit for a measurement item). A cart amount counts
   packages. So `suggestedCartAmount` uses `getItemPackUnits` (packed + open stock, and the
   target, both in packs) and takes `max(1, ceil(target − stock))`. Without this, a 750 ml
   bottle with a 2000 ml target would suggest 1150 bottles. A measurement item with no
   `amountPerPackage` gets 1. The difference is rounded to 6 places before `ceil`, because
   `2.1 / 0.3` is `7.000000000000001` in JavaScript (that would suggest 8, not 7).
3. **The context line uses the card's numbers and unit**, with at most 2 decimals. So a
   measurement item reads "In stock 1.7 · target 2 L", and the amount field below reads
   "Amount (bottle)".
4. **Adding with 0 is allowed.** Neither `addToCart` in `db/operations.ts` nor the
   `addToCart` resolver checks the amount, so 0 writes a pinned row in both modes, the same
   as `updateCartItem(0)`. The suggested amount is never 0, so this happens only when the
   person types 0, and the 0 note says what it means.
5. **A failed save shows only in the dialog**, as `common.saveFailed` in a `role="alert"`
   line. The old `−`/`+` path showed a toast; the dialog does not add one.
6. **Enter in the amount field saves**, the same as Save, and only when Save is enabled.
7. **The English 0 note was split into two sentences:** "Amount 0 keeps the item in the cart.
   It is not bought this time. Buy it next time." The Chinese text is the owner's, unchanged.
8. **The dialog is mounted only while open**, keyed by item and mode, and keeps the amount it
   opened with. A live refetch of the cart does not reset what the person typed.

**A defect found on the way:** the cart page story `WithCartItems` added its two rows to the
bare vendor id, not to `${locationId}:${vendorId}`, so it showed an EMPTY cart, and its smoke
test only checked that "Milk" was on the page. The story now uses `cartIdFor`, and the smoke
test checks both amount buttons.
