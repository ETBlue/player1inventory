import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getLastPurchaseDate } from '@/db/operations'
import { useLastPurchaseDatesQuery } from '@/generated/graphql'
import { useDataMode } from '@/hooks/useDataMode'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { Item } from '@/types'

export function useItemSortData(items: Item[] | undefined) {
  const safeItems = items ?? []
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  // quantities: sync from item fields — already cloud-compatible, unchanged
  const quantities = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of safeItems) {
      map.set(item.id, getCurrentQuantity(item))
    }
    return map
  }, [safeItems])

  // ── Cloud: batch Apollo query for all item purchase dates ─────────────────
  const itemIds = safeItems.map((i) => i.id)
  const { data: cloudDatesData } = useLastPurchaseDatesQuery({
    variables: { itemIds },
    skip: !isCloud || safeItems.length === 0,
  })
  const cloudPurchaseDates = useMemo(() => {
    const map = new Map<string, Date | null>()
    for (const r of cloudDatesData?.lastPurchaseDates ?? []) {
      map.set(r.itemId, r.date ? new Date(r.date) : null)
    }
    return map
  }, [cloudDatesData])

  // ── Local: TanStack Query (unchanged from before) ─────────────────────────
  const expiryKey = safeItems
    .map((i) => `${i.id}:${String(i.dueDate)}:${String(i.estimatedDueDays)}`)
    .join(',')

  const { data: localExpiryDates } = useQuery({
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
    enabled: !isCloud && safeItems.length > 0,
  })

  const purchaseKey = safeItems.map((i) => i.id).join(',')

  const { data: localPurchaseDates } = useQuery({
    queryKey: ['sort', 'purchaseDates', purchaseKey],
    queryFn: async () => {
      const map = new Map<string, Date | null>()
      for (const item of safeItems) {
        map.set(item.id, await getLastPurchaseDate(item.id))
      }
      return map
    },
    enabled: !isCloud && safeItems.length > 0,
  })

  // ── Compute cloud expiryDates from cloudPurchaseDates + item fields ───────
  const cloudExpiryDates = useMemo(() => {
    if (!isCloud) return undefined
    const map = new Map<string, Date | undefined>()
    for (const item of safeItems) {
      const lastPurchase = cloudPurchaseDates.get(item.id) ?? null
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
  }, [isCloud, safeItems, cloudPurchaseDates])

  return {
    quantities,
    expiryDates: isCloud ? cloudExpiryDates : localExpiryDates,
    purchaseDates: isCloud ? cloudPurchaseDates : localPurchaseDates,
  }
}
