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
