import type { Item } from '@/types'

function decimalPlaces(n: number): number {
  const s = n.toString()
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
}

export function roundToStep(value: number, step: number | undefined): number {
  if (step === undefined || step <= 0) return value
  const places = decimalPlaces(step)
  return Math.round(value * 10 ** places) / 10 ** places
}

export function getCurrentQuantity(item: Item): number {
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
export function getPackedTotal(item: Item): number {
  if (item.amountPerPackage && item.amountPerPackage > 0) {
    return item.packedQuantity + item.unpackedQuantity / item.amountPerPackage
  }
  return item.packedQuantity + item.unpackedQuantity
}

export function getStockStatus(
  quantity: number,
  refillThreshold: number,
): 'error' | 'warning' | 'ok' {
  if (refillThreshold > 0 && quantity === refillThreshold) return 'warning'
  if (quantity < refillThreshold) return 'error'
  return 'ok'
}

export function normalizeUnpacked(item: Item): void {
  if (
    item.targetUnit === 'measurement' &&
    item.measurementUnit &&
    item.amountPerPackage
  ) {
    // When tracking in measurement: normalize when unpacked >= amountPerPackage
    while (item.unpackedQuantity >= item.amountPerPackage) {
      item.packedQuantity += 1
      item.unpackedQuantity -= item.amountPerPackage
    }
  } else {
    // When tracking in packages: normalize when unpacked >= 1
    while (item.unpackedQuantity >= 1) {
      item.packedQuantity += 1
      item.unpackedQuantity -= 1
    }
  }
}

export function packUnpacked(item: Item): void {
  if (
    item.targetUnit === 'measurement' &&
    item.measurementUnit &&
    item.amountPerPackage
  ) {
    // Measurement mode: pack complete packages based on amountPerPackage
    const packages = Math.floor(item.unpackedQuantity / item.amountPerPackage)
    if (packages > 0) {
      item.packedQuantity += packages
      item.unpackedQuantity =
        Math.round(
          (item.unpackedQuantity - packages * item.amountPerPackage) * 1000,
        ) / 1000
    }
  } else if (item.targetUnit === 'package') {
    // Package mode: pack complete units (floor of unpacked)
    const packages = Math.floor(item.unpackedQuantity)
    if (packages > 0) {
      item.packedQuantity += packages
      item.unpackedQuantity =
        Math.round((item.unpackedQuantity - packages) * 1000) / 1000
    }
  }
  // If no valid mode or insufficient quantity, do nothing
}

export function consumeItem(item: Item, amount: number): void {
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

export function addItem(
  item: Item,
  amount: number,
  purchaseDate: Date = new Date(),
): void {
  // Always add to unpacked (removed mode branching)
  // Use roundToStep only when consumeAmount has sub-unit precision (e.g. 0.1) to fix
  // float drift (0.1 + 0.1 + 0.1 = 0.30000000000000004). Integer consumeAmounts and
  // undefined consumeAmount skip rounding so existing unpacked fractions are preserved.
  const consumePlaces = item.consumeAmount
    ? decimalPlaces(item.consumeAmount)
    : 0
  item.unpackedQuantity =
    consumePlaces > 0
      ? roundToStep(item.unpackedQuantity + amount, item.consumeAmount)
      : item.unpackedQuantity + amount

  // Recalculate dueDate if quantity was 0 and estimatedDueDays exists
  if (item.estimatedDueDays && !item.dueDate && getCurrentQuantity(item) > 0) {
    const expirationMs =
      purchaseDate.getTime() + item.estimatedDueDays * 86400000
    item.dueDate = new Date(expirationMs)
  }
}

export function isInactive(item: Item): boolean {
  return item.targetQuantity === 0
}
