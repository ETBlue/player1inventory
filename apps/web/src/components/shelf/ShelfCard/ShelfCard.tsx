import { ChevronRight } from 'lucide-react'
import { ItemProgressBar } from '@/components/item/ItemProgressBar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { getStockStatus } from '@/lib/quantityUtils'
import type { Shelf } from '@/types'

interface ShelfCardProps {
  shelf: Shelf
  itemCount: number
  onClick: () => void
  filterSummary?: string
  outOfStockCount?: number
  lowStockCount?: number
  activeCount?: number
  totalPackedQuantity?: number
  totalTargetInPacks?: number
  totalRefillInPacks?: number
}

export function ShelfCard({
  shelf,
  itemCount,
  onClick,
  filterSummary,
  outOfStockCount,
  lowStockCount,
  activeCount,
  totalPackedQuantity = 0,
  totalTargetInPacks = 0,
  totalRefillInPacks = 0,
}: ShelfCardProps) {
  const displayActiveCount = activeCount ?? itemCount
  const progressStatus =
    totalTargetInPacks === 0
      ? 'inactive'
      : getStockStatus(totalPackedQuantity, totalRefillInPacks)

  const displayPacked = parseFloat(totalPackedQuantity.toFixed(1))
  const displayTarget = parseFloat(totalTargetInPacks.toFixed(1))

  return (
    <Card className="flex items-center gap-2">
      <button
        type="button"
        className="flex-1 flex items-center justify-between gap-2 min-w-0 text-left cursor-pointer"
        onClick={onClick}
      >
        <CardContent className="flex-1 flex items-center justify-between gap-2 py-0 px-0 min-w-0">
          <div className="flex-1 min-w-0">
            {/* Row 1: name + quantity label */}
            <div className="flex gap-1 items-baseline justify-between mb-1">
              <p className="font-medium capitalize truncate">{shelf.name}</p>
              <div className="flex-1" />
              <span className="text-xs font-normal text-foreground-muted whitespace-nowrap">
                {displayPacked}/{displayTarget}
              </span>
              <span className="px-1 text-xs text-foreground-muted border border-foreground-muted opacity-75">
                pack
              </span>
            </div>
            {/* Row 2: progress bar */}
            <ItemProgressBar
              current={totalPackedQuantity}
              target={totalTargetInPacks}
              status={progressStatus}
              targetUnit="package"
              packed={totalPackedQuantity}
              unpacked={0}
            />
            {/* Row 3: counts and badges */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm text-foreground-muted">
                {displayActiveCount} of {itemCount} active
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
          <ChevronRight className="h-5 w-5 shrink-0 text-foreground-muted" />
        </CardContent>
      </button>
    </Card>
  )
}
