import type { ExpirationMode, StockFields } from '@/types'

export function inferExpirationMode(
  item: Pick<StockFields, 'expirationMode' | 'dueDate' | 'estimatedDueDays'>,
): ExpirationMode {
  return (
    item.expirationMode ??
    (item.estimatedDueDays != null
      ? 'days from purchase'
      : item.dueDate
        ? 'date'
        : 'disabled')
  )
}

export function computeExpiryDate(
  item: Pick<StockFields, 'expirationMode' | 'dueDate' | 'estimatedDueDays'>,
  lastPurchaseDate?: Date,
): Date | undefined {
  const mode = inferExpirationMode(item)
  if (mode === 'disabled') return undefined
  if (mode === 'date') return item.dueDate
  // 'days from purchase'
  if (!lastPurchaseDate || !item.estimatedDueDays) return undefined
  return new Date(
    lastPurchaseDate.getTime() + item.estimatedDueDays * 24 * 60 * 60 * 1000,
  )
}
