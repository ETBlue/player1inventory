import { ShelvingUnit } from 'lucide-react'
import { GroupCard } from '@/components/shared/GroupCard'
import type { Shelf } from '@/types'

interface ShelfListProps {
  shelves: Shelf[]
  onShelfClick: (shelfId: string) => void
  getItemCount: (shelfId: string) => number
  getFilterSummary?: (shelf: Shelf) => string | undefined
  getOutOfStockCount?: (shelfId: string) => number
  getLowStockCount?: (shelfId: string) => number
  getActiveCount?: (shelfId: string) => number
  getPackTotals?: (shelfId: string) => {
    totalPacked: number
    totalTarget: number
    totalRefill: number
  }
}

export function ShelfList({
  shelves,
  onShelfClick,
  getItemCount,
  getFilterSummary,
  getOutOfStockCount,
  getLowStockCount,
  getActiveCount,
  getPackTotals,
}: ShelfListProps) {
  if (shelves.length === 0) return null

  return (
    <div className="flex flex-col gap-px">
      {shelves.map((shelf) => {
        const summary = getFilterSummary ? getFilterSummary(shelf) : undefined
        return (
          <GroupCard
            key={shelf.id}
            name={shelf.name}
            icon={<ShelvingUnit className="h-4 w-4 text-foreground-muted" />}
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
            {...(getPackTotals !== undefined
              ? (() => {
                  const t = getPackTotals(shelf.id)
                  return {
                    totalPackedQuantity: t.totalPacked,
                    totalTargetInPacks: t.totalTarget,
                    totalRefillInPacks: t.totalRefill,
                  }
                })()
              : {})}
            onClick={() => onShelfClick(shelf.id)}
          />
        )
      })}
    </div>
  )
}
