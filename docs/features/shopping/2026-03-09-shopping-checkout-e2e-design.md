# Shopping Checkout E2E Design

## Goal

Add happy-path E2E tests for the shopping page, focused on the core checkout flow.

## Scope

One test covering: add item to cart → checkout → verify inventory updated in pantry.

## Files

- `e2e/pages/ShoppingPage.ts` — new page object
- `e2e/tests/shopping.spec.ts` — new spec file
- `e2e/pages/ItemPage.ts` — minor addition: `setPackedQuantity(n)` for test setup

## ShoppingPage Page Object API

```ts
class ShoppingPage {
  navigateTo()         // go to /shopping
  getItemCard(name)    // locator for any item card by name
  getItemCheckbox(name) // the checkbox associated with an item
  addItemToCart(name)  // click the unchecked item's checkbox
  clickDone()          // click the Done button
  confirmCheckout()    // confirm the checkout dialog
}
```

**Note:** The cart and pending sections share the same DOM structure — separated only by a 1px `<div>`, with no semantic heading labels. Cart items are distinguished by having a checked checkbox. Post-checkout verification uses the Done button's disabled state (empty cart → no items with qty > 0), not section location.

## Test Case

```
test('user can checkout items from shopping cart')

  Given: item "Test Milk" exists with 0 packed quantity

  When:
    - Navigate to shopping page
    - Check "Test Milk" checkbox (adds to cart with qty = 1)
    - Click Done → confirm checkout dialog

  Then:
    - Done button is disabled (cart is empty)
    - Navigate to pantry → "Test Milk" shows quantity 1 (was 0, increased by purchase)
```

## Notes

- Exact pantry quantity locator (e.g. `"1 pack"` text) resolved during implementation by reading ItemCard source.
- No vendor/tag filter tests in this scope — happy path only.
- Uses existing `afterEach` IndexedDB cleanup pattern from `item-management.spec.ts`.
