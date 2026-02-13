import type { Item } from '@/types'

export function getCurrentQuantity(item: Item): number {
  if (item.packageUnit && item.measurementUnit && item.amountPerPackage) {
    // Dual-unit mode: packed + unpacked
    const packedInMeasurement = item.packedQuantity * item.amountPerPackage
    return packedInMeasurement + item.unpackedQuantity
  }
  // Simple mode: just packed
  return item.packedQuantity
}

export function normalizeUnpacked(item: Item): void {
  if (!item.packageUnit || !item.measurementUnit || !item.amountPerPackage) {
    return
  }

  while (item.unpackedQuantity >= item.amountPerPackage) {
    item.packedQuantity += 1
    item.unpackedQuantity -= item.amountPerPackage
  }
}

export function consumeItem(item: Item, amount: number): void {
  if (item.packageUnit && item.amountPerPackage) {
    // Consume from unpacked first
    if (item.unpackedQuantity >= amount) {
      item.unpackedQuantity -= amount
    } else {
      // Need to break into packed
      const remaining = amount - item.unpackedQuantity
      item.unpackedQuantity = 0

      const packagesToOpen = Math.ceil(remaining / item.amountPerPackage)
      item.packedQuantity -= packagesToOpen

      // Calculate leftover from opened packages
      item.unpackedQuantity = packagesToOpen * item.amountPerPackage - remaining

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
