import type { Item } from '@/types'

export type SortField = 'name' | 'stock' | 'purchased' | 'expiring'
export type SortDirection = 'asc' | 'desc'

export function sortItems(
  items: Item[],
  quantities: Map<string, number>,
  expiryDates: Map<string, Date | undefined>,
  purchaseDates: Map<string, Date | null>,
  sortBy: SortField,
  sortDirection: SortDirection,
): Item[] {
  const sorted = [...items].sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name)
        break

      case 'stock': {
        const qtyA = quantities.get(a.id) ?? 0
        const qtyB = quantities.get(b.id) ?? 0
        const progressA = a.targetQuantity > 0 ? qtyA / a.targetQuantity : 1
        const progressB = b.targetQuantity > 0 ? qtyB / b.targetQuantity : 1
        comparison = progressA - progressB
        break
      }

      case 'purchased': {
        const dateA = purchaseDates.get(a.id) ?? null
        const dateB = purchaseDates.get(b.id) ?? null

        // null dates always sort last regardless of direction
        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1

        comparison = dateA.getTime() - dateB.getTime()
        break
      }

      case 'expiring': {
        const dateA = expiryDates.get(a.id)
        const dateB = expiryDates.get(b.id)

        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1

        comparison = dateA.getTime() - dateB.getTime()
        break
      }
    }

    return sortDirection === 'asc' ? comparison : -comparison
  })

  return sorted
}
