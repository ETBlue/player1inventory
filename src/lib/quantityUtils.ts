import type { Item } from '@/types'

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

export function getDisplayQuantity(item: Item): number {
  // Both package and measurement tracking use getCurrentQuantity
  // which already handles the unit conversion based on targetUnit
  return getCurrentQuantity(item)
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

export function consumeItem(item: Item, amount: number): void {
  if (
    item.targetUnit === 'measurement' &&
    item.measurementUnit &&
    item.amountPerPackage
  ) {
    // Tracking in measurement: amount and unpacked are both in measurement units
    if (item.unpackedQuantity >= amount) {
      item.unpackedQuantity =
        Math.round((item.unpackedQuantity - amount) * 1000) / 1000
    } else {
      // Need to break into packed
      const remaining = amount - item.unpackedQuantity
      item.unpackedQuantity = 0

      const packagesToOpen = Math.ceil(remaining / item.amountPerPackage)
      item.packedQuantity -= packagesToOpen

      // Calculate leftover from opened packages (in measurement units)
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
    // Tracking in packages (or simple mode): amount and unpacked are both in packages
    if (item.unpackedQuantity >= amount) {
      item.unpackedQuantity =
        Math.round((item.unpackedQuantity - amount) * 1000) / 1000
    } else {
      // Consume from unpacked first, then from packed
      const remaining = amount - item.unpackedQuantity
      item.unpackedQuantity = 0
      item.packedQuantity -= remaining

      // Prevent negative quantities
      if (item.packedQuantity < 0) {
        item.packedQuantity = 0
      }
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
