// The quantity rules that BOTH the web and the server need.
//
// Moved here from `apps/web/src/lib/quantityUtils.ts` in households H3b (task
// B.1), so that the server's checkout and cooking resolvers can use the same
// rules as the web. `quantityUtils.ts` re-exports these functions, so web code
// and web tests import them from the same place as before.
//
// This package has no test runner. The tests for these functions live in
// `apps/web/src/lib/quantityUtils.test.ts` and
// `apps/web/src/lib/quantityUtils.integration.test.ts`, and they run against
// this file through that re-export.
//
// (`buildCheckoutLogQuantities` also lived here, moved from
// `apps/web/src/lib/checkoutQuantities.ts`. No production code called it after
// task B.5, so it was deleted. The server's `checkout` computes the log total
// itself.)
//
// Nothing here may import from `apps/web` or `apps/server`.

import type { StockConfigFields, StockFields } from './index'

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
