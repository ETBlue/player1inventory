import { useMemo } from 'react'
import { useItems } from './index'

export function useVendorItemCounts(): Map<string, number> {
  const { data: items = [] } = useItems()

  return useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of items) {
      for (const vendorId of item.vendorIds ?? []) {
        counts.set(vendorId, (counts.get(vendorId) ?? 0) + 1)
      }
    }

    return counts
  }, [items])
}
