import { ShelvingUnit, SlidersVertical, SquareMousePointer } from 'lucide-react'
import { GroupCard } from '@/components/shared/GroupCard'
import type { Shelf } from '@/types'

// Shelf type is legible at a glance from the card icon, using the same pairing
// as the shelf settings list: sliders for a filter shelf, a pointer for a
// selection shelf. Shelves with no type (legacy rows) keep the generic icon.
function ShelfTypeIcon({ type }: { type: Shelf['type'] }) {
  const className = 'h-4 w-4 text-foreground-muted'
  if (type === 'filter') return <SlidersVertical className={className} />
  if (type === 'selection') return <SquareMousePointer className={className} />
  return <ShelvingUnit className={className} />
}

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
            icon={<ShelfTypeIcon type={shelf.type} />}
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
