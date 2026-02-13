import type { Item } from '@/types'

export type SortField = 'name' | 'quantity' | 'stock' | 'updatedAt' | 'expiring'
export type SortDirection = 'asc' | 'desc'

type StatusValue = 'error' | 'warning' | 'ok'

function getStatus(item: Item, quantity: number | undefined): StatusValue {
  if (quantity === undefined) return 'ok'
  if (quantity < item.refillThreshold) return 'error'
  if (item.refillThreshold > 0 && quantity === item.refillThreshold)
    return 'warning'
  return 'ok'
}

export function sortItems(
  items: Item[],
  quantities: Map<string, number>,
  expiryDates: Map<string, Date | undefined>,
  sortBy: SortField,
  sortDirection: SortDirection,
): Item[] {
  const sorted = [...items].sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name)
        break

      case 'quantity': {
        const qtyA = quantities.get(a.id) ?? 0
        const qtyB = quantities.get(b.id) ?? 0
        comparison = qtyA - qtyB
        break
      }

      case 'stock': {
        const statusOrder: Record<StatusValue, number> = {
          error: 0,
          warning: 1,
          ok: 2,
        }
        const statusA = getStatus(a, quantities.get(a.id))
        const statusB = getStatus(b, quantities.get(b.id))
        comparison = statusOrder[statusA] - statusOrder[statusB]
        break
      }

      case 'updatedAt':
        comparison = a.updatedAt.getTime() - b.updatedAt.getTime()
        break

      case 'expiring': {
        const dateA = expiryDates.get(a.id)
        const dateB = expiryDates.get(b.id)

        // Undefined dates always sort last regardless of direction
        if (!dateA && !dateB) {
          return 0
        } else if (!dateA) {
          return 1
        } else if (!dateB) {
          return -1
        } else {
          comparison = dateA.getTime() - dateB.getTime()
        }
        break
      }
    }

    return sortDirection === 'asc' ? comparison : -comparison
  })

  return sorted
}
