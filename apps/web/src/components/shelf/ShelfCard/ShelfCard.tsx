import { ChevronRight, SlidersVertical, SquareMousePointer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { Shelf } from '@/types'

interface ShelfCardProps {
  shelf: Shelf
  itemCount: number
  onClick: () => void
  filterSummary?: string
}

export function ShelfCard({
  shelf,
  itemCount,
  onClick,
  filterSummary,
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
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm text-foreground-muted">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
                {shelf.type === 'filter' && filterSummary && (
                  <span className="text-sm text-foreground-muted truncate">
                    · {filterSummary}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {shelf.type !== 'system' && (
              <Badge
                variant="neutral-outline"
                className="text-xs capitalize shrink-0 gap-1"
              >
                {shelf.type === 'filter' && (
                  <SlidersVertical className="h-3 w-3 text-foreground-muted" />
                )}
                {shelf.type === 'selection' && (
                  <SquareMousePointer className="h-3 w-3 text-foreground-muted" />
                )}
                {shelf.type}
              </Badge>
            )}
            <ChevronRight className="h-5 w-5 text-foreground-muted" />
          </div>
        </CardContent>
      </button>
    </Card>
  )
}
