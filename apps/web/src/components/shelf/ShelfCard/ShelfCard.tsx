import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { Shelf } from '@/types'

interface ShelfCardProps {
  shelf: Shelf
  itemCount: number
  onClick: () => void
  filterSummary?: string
  outOfStockCount?: number
  lowStockCount?: number
}

export function ShelfCard({
  shelf,
  itemCount,
  onClick,
  filterSummary,
  outOfStockCount,
  lowStockCount,
}: ShelfCardProps) {
  return (
    <Card className="flex items-center gap-2">
      <button
        type="button"
        className="flex-1 flex items-center justify-between gap-2 min-w-0 text-left cursor-pointer"
        onClick={onClick}
      >
        <CardContent className="flex-1 flex items-center justify-between gap-2 py-0 px-0 min-w-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <p className="font-medium capitalize truncate">{shelf.name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-sm text-foreground-muted">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
                {shelf.type === 'filter' && filterSummary && (
                  <span className="text-sm text-foreground-muted truncate">
                    · {filterSummary}
                  </span>
                )}
                {outOfStockCount != null && outOfStockCount > 0 && (
                  <Badge variant="error-inverse">
                    {outOfStockCount} out of stock
                  </Badge>
                )}
                {lowStockCount != null && lowStockCount > 0 && (
                  <Badge variant="warning-inverse">
                    {lowStockCount} low stock
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-foreground-muted" />
        </CardContent>
      </button>
    </Card>
  )
}
