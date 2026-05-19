import { ShelfCard } from '@/components/shelf/ShelfCard'
import type { Shelf } from '@/types'

interface ShelfListProps {
  shelves: Shelf[]
  onShelfClick: (shelfId: string) => void
  getItemCount: (shelfId: string) => number
  getFilterSummary?: (shelf: Shelf) => string | undefined
  getOutOfStockCount?: (shelfId: string) => number
  getLowStockCount?: (shelfId: string) => number
  getActiveCount?: (shelfId: string) => number
  getInactiveCount?: (shelfId: string) => number
}

export function ShelfList({
  shelves,
  onShelfClick,
  getItemCount,
  getFilterSummary,
  getOutOfStockCount,
  getLowStockCount,
  getActiveCount,
  getInactiveCount,
}: ShelfListProps) {
  if (shelves.length === 0) return null

  return (
    <div className="flex flex-col gap-px">
      {shelves.map((shelf) => {
        const summary = getFilterSummary ? getFilterSummary(shelf) : undefined
        return (
          <ShelfCard
            key={shelf.id}
            shelf={shelf}
            itemCount={getItemCount(shelf.id)}
            {...(summary !== undefined ? { filterSummary: summary } : {})}
            {...(getOutOfStockCount !== undefined
              ? { outOfStockCount: getOutOfStockCount(shelf.id) }
              : {})}
            {...(getLowStockCount !== undefined
              ? { lowStockCount: getLowStockCount(shelf.id) }
              : {})}
            {...(getActiveCount !== undefined
              ? { activeCount: getActiveCount(shelf.id) }
              : {})}
            {...(getInactiveCount !== undefined
              ? { inactiveCount: getInactiveCount(shelf.id) }
              : {})}
            onClick={() => onShelfClick(shelf.id)}
          />
        )
      })}
    </div>
  )
}
