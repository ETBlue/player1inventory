// `buildCheckoutLogQuantities` lives in `packages/types/src/quantity.ts` since
// households H3b task B.1, because the server needs the same rule. It is
// re-exported here so the shopping page and `checkoutQuantities.test.ts` keep
// their imports unchanged, and the test runs against the shared code.
export {
  buildCheckoutLogQuantities,
  type CheckoutLogQuantity,
} from '@p1i/types'
