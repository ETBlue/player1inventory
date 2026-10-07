import type { CartItem, StockConfigFields, StockFields } from '@/types'
import { getPackedTotal } from './quantityUtils'

/**
 * One entry of the cloud `checkout` mutation's `items` argument. Matches
 * `CheckoutItemInput` in apps/server/src/schema/cart.graphql.
 */
export interface CheckoutLogQuantity {
  itemId: string
  quantity: number
}

// Only the two fields this reads, so a test fixture need not build a whole
// CartItem.
type CheckoutCartItem = Pick<CartItem, 'itemId' | 'quantity'>

// The pantry row this reads: an id to join on, the two per-location
// quantities, and the global `amountPerPackage`. A PantryItem satisfies it.
type CheckoutStockItem = { id: string } & Pick<
  StockFields,
  'packedQuantity' | 'unpackedQuantity'
> &
  Partial<Pick<StockConfigFields, 'amountPerPackage'>>

/**
 * Builds the `items` argument the cloud `checkout` mutation requires: for each
 * item being bought, its on-hand total in PACKAGE units AFTER the purchase.
 *
 * The client owns this number because the cloud resolver cannot compute it.
 * `amountPerPackage` is a global `Item` field and the resolver holds only the
 * per-location `ItemStock` row, so it used to write `packedQuantity +
 * unpackedQuantity` raw — 6 where local mode gives 3.5 for an item with
 * `amountPerPackage` 6 holding 2 packed and 3 unpacked, plus 1 bought.
 * Issue #336.
 *
 * Local mode computes the same number itself inside `checkout`
 * (src/db/operations.ts) and never calls this.
 */
export function buildCheckoutLogQuantities(
  cartItems: readonly CheckoutCartItem[],
  items: readonly CheckoutStockItem[],
): CheckoutLogQuantity[] {
  return (
    cartItems
      // Must match the server's `buyingItems` rule, `ci.quantity > 0`
      // (apps/server/src/resolvers/cart.resolver.ts:167). A bought item with
      // no entry in the result fails the whole checkout with
      // `BAD_USER_INPUT` — the resolver has no fallback on purpose, so the two
      // filters have to stay in step.
      .filter((ci) => ci.quantity > 0)
      .flatMap((ci) => {
        const item = items.find((i) => i.id === ci.itemId)
        // A cart row whose item is not in `items` is skipped rather than sent
        // with a guessed total. The page renders from the same `items` list,
        // so this only happens when another device added the cart row after
        // this page rendered — the accepted race. The checkout then fails with
        // `BAD_USER_INPUT` naming the item and the user retries.
        if (!item) return []
        return [
          {
            itemId: ci.itemId,
            // THE ORDER OF THE TWO TERMS MATTERS. `getPackedTotal` converts
            // the PRE-purchase stock, turning the unpacked remainder into
            // fractional packs. `ci.quantity` is added AFTER it, because the
            // cart quantity is already counted in packs and must not be
            // divided by `amountPerPackage`. This is exactly what local
            // `checkout` (src/db/operations.ts) computes.
            quantity: getPackedTotal(item) + ci.quantity,
          },
        ]
      })
  )
}
