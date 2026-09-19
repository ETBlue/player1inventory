import { useMemo } from 'react'
import { isInactiveHere, isStockedHere } from '@/lib/quantityUtils'
import { useItems } from './index'

export interface VendorCartCounts {
  // Items with this vendor id stocked in the active location.
  count: number
  // Of those, items whose targetQuantity is 0.
  inactiveCount: number
}

// Location-scoped vendor item counts for the shopping cart cards + sort.
// Distinct from useVendorItemCounts(), which stays global (location-unaware)
// for the vendors settings page, where entities are location-independent.
//
// NO MODE BRANCH since PR 3b. Cloud used to keep a GLOBAL tally, and the
// reason was the CART, not the item: a cloud `Cart` had no `locationId`, so
// the cart a card opened onto held items from every location and a
// location-scoped count would have under-reported it. PR 3a gave `Cart` its
// `locationId` column and PR 3b re-keyed `Cart.id` to
// `${locationId}:${vendorId | 'no-vendor'}`, so a cloud cart now holds one
// location's rows exactly as a local one does. Both modes count the same way.
export function useVendorCartCounts(): Map<string, VendorCartCounts> {
  const { data: items = [] } = useItems()

  return useMemo(() => {
    const counts = new Map<string, VendorCartCounts>()
    const scopedItems = items.filter(isStockedHere)

    for (const item of scopedItems) {
      for (const vendorId of item.vendorIds ?? []) {
        const existing = counts.get(vendorId) ?? { count: 0, inactiveCount: 0 }
        existing.count += 1
        if (isInactiveHere(item)) {
          existing.inactiveCount += 1
        }
        counts.set(vendorId, existing)
      }
    }

    return counts
  }, [items])
}
