import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getLastPurchaseDate } from '@/db/operations'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { Item } from '@/types'

export function useItemSortData(items: Item[] | undefined) {
  const safeItems = items ?? []

  // quantities: pure synchronous derivation — no race condition possible
  const quantities = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of safeItems) {
      map.set(item.id, getCurrentQuantity(item))
    }
    return map
  }, [safeItems])

  // expiryDates: queryKey includes dueDate + estimatedDueDays per item so the key
  // changes when items update, forcing a fresh queryFn run with current items
  const expiryKey = safeItems
    .map((i) => `${i.id}:${String(i.dueDate)}:${String(i.estimatedDueDays)}`)
    .join(',')

  const { data: expiryDates } = useQuery({
    queryKey: ['sort', 'expiryDates', expiryKey],
    queryFn: async () => {
      const map = new Map<string, Date | undefined>()
      for (const item of safeItems) {
        const lastPurchase = await getLastPurchaseDate(item.id)
        const estimatedDate =
          item.estimatedDueDays && lastPurchase
            ? new Date(
                lastPurchase.getTime() +
                  item.estimatedDueDays * 24 * 60 * 60 * 1000,
              )
            : (item.dueDate ?? undefined)
        map.set(item.id, estimatedDate)
      }
      return map
    },
    enabled: safeItems.length > 0,
  })

  // purchaseDates: queryKey uses item IDs — stable during item edits, changes when
  // items are added/removed. After checkout, the checkout mutation explicitly
  // invalidates ['sort', 'purchaseDates'] to refresh purchase dates.
  const purchaseKey = safeItems.map((i) => i.id).join(',')

  const { data: purchaseDates } = useQuery({
    queryKey: ['sort', 'purchaseDates', purchaseKey],
    queryFn: async () => {
      const map = new Map<string, Date | null>()
      for (const item of safeItems) {
        map.set(item.id, await getLastPurchaseDate(item.id))
      }
      return map
    },
    enabled: safeItems.length > 0,
  })

  return { quantities, expiryDates, purchaseDates }
}
