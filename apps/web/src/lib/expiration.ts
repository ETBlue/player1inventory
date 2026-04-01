import type { Item } from '@/types'

export function computeExpiryDate(
  item: Pick<Item, 'expirationMode' | 'dueDate' | 'estimatedDueDays'>,
  lastPurchaseDate?: Date,
): Date | undefined {
  const mode = item.expirationMode
  if (!mode || mode === 'disabled') return undefined
  if (mode === 'date') return item.dueDate
  // 'days from purchase'
  if (!lastPurchaseDate || !item.estimatedDueDays) return undefined
  return new Date(
    lastPurchaseDate.getTime() + item.estimatedDueDays * 24 * 60 * 60 * 1000,
  )
}
