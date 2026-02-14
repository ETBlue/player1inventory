import type { Item } from '@/types'

export function getCurrentQuantity(item: Item): number {
  if (item.measurementUnit && item.amountPerPackage) {
    // Measurement tracking: convert packed to measurement and add unpacked
    const packedInMeasurement = item.packedQuantity * item.amountPerPackage
    return packedInMeasurement + item.unpackedQuantity
  }
  // Simple mode: packed + unpacked
  return item.packedQuantity + item.unpackedQuantity
}

export function getDisplayQuantity(item: Item): number {
  if (item.targetUnit === 'package') {
    // When tracking in packages, convert unpacked to packages if dual-unit
    if (item.measurementUnit && item.amountPerPackage) {
      const unpackedInPackages = item.unpackedQuantity / item.amountPerPackage
      return item.packedQuantity + unpackedInPackages
    }
    // Simple mode: just packed
    return item.packedQuantity
  }
  // When tracking in measurement units, show total measurement
  return getCurrentQuantity(item)
}

export function normalizeUnpacked(item: Item): void {
  if (!item.measurementUnit || !item.amountPerPackage) {
    return
  }

  while (item.unpackedQuantity >= item.amountPerPackage) {
    item.packedQuantity += 1
    item.unpackedQuantity -= item.amountPerPackage
  }
}

export function consumeItem(item: Item, amount: number): void {
  if (item.measurementUnit && item.amountPerPackage) {
    // Convert amount to measurement units if tracking in packages
    const amountInMeasurement =
      item.targetUnit === 'package' ? amount * item.amountPerPackage : amount

    // Measurement tracking: consume from unpacked first
    if (item.unpackedQuantity >= amountInMeasurement) {
      item.unpackedQuantity =
        Math.round((item.unpackedQuantity - amountInMeasurement) * 1000) / 1000
    } else {
      // Need to break into packed
      const remaining = amountInMeasurement - item.unpackedQuantity
      item.unpackedQuantity = 0

      const packagesToOpen = Math.ceil(remaining / item.amountPerPackage)
      item.packedQuantity -= packagesToOpen

      // Calculate leftover from opened packages
      item.unpackedQuantity =
        Math.round(
          (packagesToOpen * item.amountPerPackage - remaining) * 1000,
        ) / 1000

      // Prevent negative quantities
      if (item.packedQuantity < 0) {
        item.packedQuantity = 0
        item.unpackedQuantity = 0
      }
    }
  } else {
    // Simple mode
    item.packedQuantity -= amount
    if (item.packedQuantity < 0) {
      item.packedQuantity = 0
    }
  }

  // Clear expiration date when quantity reaches 0
  if (getCurrentQuantity(item) === 0) {
    item.dueDate = undefined
  }
}

export function addItem(
  item: Item,
  amount: number,
  purchaseDate: Date = new Date(),
): void {
  if (item.targetUnit === 'measurement') {
    // When tracking in measurement units: add to unpacked
    item.unpackedQuantity += amount
  } else {
    // When tracking in packages (or simple mode): add to packed
    item.packedQuantity += amount
  }

  // Recalculate dueDate if quantity was 0 and estimatedDueDays exists
  if (item.estimatedDueDays && !item.dueDate && getCurrentQuantity(item) > 0) {
    const expirationMs =
      purchaseDate.getTime() + item.estimatedDueDays * 86400000
    item.dueDate = new Date(expirationMs)
  }
}

export function isInactive(item: Item): boolean {
  return item.targetQuantity === 0 && getCurrentQuantity(item) === 0
}
