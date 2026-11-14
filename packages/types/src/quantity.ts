// The quantity rules that BOTH the web and the server need.
//
// Moved here from `apps/web/src/lib/quantityUtils.ts` and
// `apps/web/src/lib/checkoutQuantities.ts` in households H3b (task B.1), so
// that the server's checkout and cooking resolvers can use the same rules as
// the web. The two web modules re-export these functions, so web code and web
// tests import them from the same place as before.
//
// This package has no test runner. The tests for these functions live in
// `apps/web/src/lib/quantityUtils.test.ts`,
// `apps/web/src/lib/quantityUtils.integration.test.ts` and
// `apps/web/src/lib/checkoutQuantities.test.ts`, and they run against this
// file through those re-exports.
//
// Nothing here may import from `apps/web` or `apps/server`.

import {
  type CartItem,
  isBeingBought,
  type StockConfigFields,
  type StockFields,
} from './index'

// Quantity helpers operate on the whole joined stock shape: the per-location
// state (StockFields, on ItemStock) plus the global configuration
// (StockConfigFields, on Item since v16). A joined PantryItem satisfies both.
type Stock = StockFields & StockConfigFields

export function decimalPlaces(n: number): number {
  const s = n.toString()
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
}

export function roundToStep(value: number, step: number | undefined): number {
  if (step === undefined || step <= 0) return value
  const places = decimalPlaces(step)
  return Math.round(value * 10 ** places) / 10 ** places
}

export function getCurrentQuantity(item: Stock): number {
  if (
    item.targetUnit === 'measurement' &&
    item.measurementUnit &&
    item.amountPerPackage
  ) {
    // Tracking in measurement: convert packed to measurement and add unpacked (already in measurement)
    const packedInMeasurement = item.packedQuantity * item.amountPerPackage
    return packedInMeasurement + item.unpackedQuantity
  }
  // Tracking in packages (or simple mode): packed + unpacked (both in packages)
  return item.packedQuantity + item.unpackedQuantity
}

/**
 * Returns the total quantity in package units, regardless of targetUnit.
 * For dual-unit items, unpacked measurement quantity is converted to fractional packs.
 */
// Takes the three fields it actually reads rather than a whole Stock, because
// `amountPerPackage` is global (on the Item) since v16: a caller holding only
// an ItemStock row has to supply it separately.
export function getPackedTotal(
  item: Pick<Stock, 'packedQuantity' | 'unpackedQuantity'> &
    Partial<Pick<Stock, 'amountPerPackage'>>,
): number {
  if (item.amountPerPackage && item.amountPerPackage > 0) {
    return item.packedQuantity + item.unpackedQuantity / item.amountPerPackage
  }
  return item.packedQuantity + item.unpackedQuantity
}

export function consumeItem(item: Stock, amount: number): void {
  if (
    item.targetUnit === 'measurement' &&
    item.measurementUnit &&
    item.amountPerPackage
  ) {
    // Tracking in measurement: amount and unpacked are both in measurement units
    if (item.unpackedQuantity >= amount) {
      item.unpackedQuantity = roundToStep(
        item.unpackedQuantity - amount,
        item.consumeAmount,
      )
    } else {
      // Need to break into packed
      const remaining = amount - item.unpackedQuantity
      item.unpackedQuantity = 0

      const packagesToOpen = Math.ceil(remaining / item.amountPerPackage)
      item.packedQuantity -= packagesToOpen

      // Calculate leftover from opened packages (in measurement units)
      item.unpackedQuantity = roundToStep(
        packagesToOpen * item.amountPerPackage - remaining,
        item.consumeAmount,
      )

      // Prevent negative quantities
      if (item.packedQuantity < 0) {
        item.packedQuantity = 0
        item.unpackedQuantity = 0
      }
    }
  } else {
    // Tracking in packages (or simple mode): amount and unpacked are both in packages
    if (item.unpackedQuantity >= amount) {
      item.unpackedQuantity = roundToStep(
        item.unpackedQuantity - amount,
        item.consumeAmount,
      )
    } else {
      // Need to open packages - open minimum needed
      if (item.packedQuantity > 0) {
        const remaining = amount - item.unpackedQuantity
        const packagesToOpen = Math.ceil(remaining) // In package mode, each package = 1 unit

        if (packagesToOpen <= item.packedQuantity) {
          item.packedQuantity -= packagesToOpen
          item.unpackedQuantity = roundToStep(
            item.unpackedQuantity + packagesToOpen - amount,
            item.consumeAmount,
          )
        } else {
          // Not enough packages - consume everything
          item.packedQuantity = 0
          item.unpackedQuantity = 0
        }
      } else {
        // No packages left, consume what's available
        item.unpackedQuantity = 0
      }
    }
  }

  // Clear expiration date when quantity reaches 0
  if (getCurrentQuantity(item) === 0) {
    delete item.dueDate
  }
}

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
 * (apps/web/src/db/operations.ts) and never calls this.
 */
export function buildCheckoutLogQuantities(
  cartItems: readonly CheckoutCartItem[],
  items: readonly CheckoutStockItem[],
): CheckoutLogQuantity[] {
  return (
    cartItems
      // `isBeingBought` is the SHARED rule, defined in `./index.ts`. The
      // server's `buyingItems` filter must accept the same set: a bought item
      // with no entry in the result fails the whole checkout with
      // `BAD_USER_INPUT`, and the resolver has no fallback on purpose. The
      // server imports the same function from `@p1i/types`, so there is one
      // copy of the rule. `apps/server/src/lib/isBeingBought.test.ts` pins it.
      .filter(isBeingBought)
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
            // `checkout` (apps/web/src/db/operations.ts) computes.
            quantity: getPackedTotal(item) + ci.quantity,
          },
        ]
      })
  )
}
