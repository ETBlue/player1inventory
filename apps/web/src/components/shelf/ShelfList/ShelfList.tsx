import { ShelfCard } from '@/components/shelf/ShelfCard'
import type { Shelf } from '@/types'

interface ShelfListProps {
  shelves: Shelf[]
  onShelfClick: (shelfId: string) => void
  getItemCount: (shelfId: string) => number
  getFilterSummary?: (shelf: Shelf) => string | undefined
}

export function ShelfList({
  shelves,
  onShelfClick,
  getItemCount,
  getFilterSummary,
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
            onClick={() => onShelfClick(shelf.id)}
          />
        )
      })}
    </div>
  )
}
