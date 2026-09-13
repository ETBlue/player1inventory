import { useMemo } from 'react'
import { isInactiveHere, isStockedHere } from '@/lib/quantityUtils'
import { useItems } from './index'
import { useDataMode } from './useDataMode'

export interface VendorCartCounts {
  // Items with this vendor id stocked in the active location (cloud: global).
  count: number
  // Of those, items whose targetQuantity is 0 (cloud: always 0 — see below).
  inactiveCount: number
}

// Location-scoped vendor item counts for the shopping cart cards + sort.
// Distinct from useVendorItemCounts(), which stays global (location-unaware)
// for the vendors settings page, where entities are location-independent.
//
// Cloud keeps a GLOBAL tally until PR 3 — and the reason is the CART, not the
// item. Since PR 2 a cloud item does carry a `stockId` (`useItems()` joins
// `PantryData` per location), so `isStockedHere` would work here; but a cloud
// `Cart` has no `locationId` until PR 3, so the cart these counts label still
// holds items from every location. Scoping the count to the active location
// would under-report what the card actually opens onto. `inactiveCount` stays
// 0 for the same reason: it is the subset of a count that is not location-
// scoped. Both become location-scoped in PR 3, when `Cart.locationId` lands.
export function useVendorCartCounts(): Map<string, VendorCartCounts> {
  const { data: items = [] } = useItems()
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  return useMemo(() => {
    const counts = new Map<string, VendorCartCounts>()
    const scopedItems = isCloud ? items : items.filter(isStockedHere)

    for (const item of scopedItems) {
      for (const vendorId of item.vendorIds ?? []) {
        const existing = counts.get(vendorId) ?? { count: 0, inactiveCount: 0 }
        existing.count += 1
        if (!isCloud && isInactiveHere(item)) {
          existing.inactiveCount += 1
        }
        counts.set(vendorId, existing)
      }
    }

    return counts
  }, [items, isCloud])
}
