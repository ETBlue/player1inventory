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
// Cloud: no Location/ItemStock backend, so items never carry a stockId. A
// naive stockId guard would zero out every count, so cloud bypasses the
// location gate entirely (keeping the pre-existing global count) and never
// reports an inactive count — a cloud item's targetQuantity is real user
// data, not "not stocked here".
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
