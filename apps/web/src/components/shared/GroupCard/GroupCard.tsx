import { ChevronRight } from 'lucide-react'
import type React from 'react'
import { ItemProgressBar } from '@/components/item/ItemProgressBar'
import { UnitBadge } from '@/components/shared/UnitBadge'
import {
  Card,
  CardContent,
  CardMetadata,
  CardTitle,
} from '@/components/ui/card'
import { getStockStatus } from '@/lib/quantityUtils'

interface GroupCardProps {
  name: string
  icon?: React.ReactNode
  itemCount: number
  onClick: () => void
  filterSummary?: string
  outOfStockCount?: number
  lowStockCount?: number
  activeCount?: number
  totalPackedQuantity?: number
  totalTargetInPacks?: number
  totalRefillInPacks?: number
  nameClassName?: string
}

export function GroupCard({
  name,
  icon,
  itemCount,
  onClick,
  filterSummary,
  outOfStockCount,
  lowStockCount,
  activeCount,
  totalPackedQuantity = 0,
  totalTargetInPacks = 0,
  totalRefillInPacks = 0,
  nameClassName = 'capitalize',
}: GroupCardProps) {
  const displayActiveCount = activeCount ?? itemCount
  const progressStatus =
    totalTargetInPacks === 0
      ? 'inactive'
      : getStockStatus(totalPackedQuantity, totalRefillInPacks)

  const displayPacked = parseFloat(totalPackedQuantity.toFixed(1))
  const displayTarget = parseFloat(totalTargetInPacks.toFixed(1))

  return (
    <Card className="flex items-center gap-4">
      {icon}
      <CardContent
        className="flex-1 flex items-center justify-between gap-2 py-0 px-0 min-w-0 cursor-pointer"
        onClick={onClick}
      >
        <div className="flex-1 min-w-0">
          {/* Row 1: name + quantity label */}
          <div className="flex gap-1 items-baseline justify-between mb-1">
            <CardTitle className={`flex-1 truncate ${nameClassName}`}>
              {name}
            </CardTitle>
            <CardMetadata>{`${displayPacked}/${displayTarget}`}</CardMetadata>
            <UnitBadge />
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
          <div className="flex items-center gap-x-1 gap-y-1 mt-1 flex-wrap">
            <span className="text-xs text-foreground-muted">
              {displayActiveCount} / {itemCount} active
            </span>
            {[
              outOfStockCount != null && outOfStockCount > 0
                ? {
                    key: 'out-of-stock',
                    className: 'text-status-error-foreground text-xs',
                    label: `${outOfStockCount} empty`,
                  }
                : null,
              lowStockCount != null && lowStockCount > 0
                ? {
                    key: 'low-stock',
                    className: 'text-status-warning-foreground text-xs',
                    label: `${lowStockCount} low stock`,
                  }
                : null,
              filterSummary
                ? {
                    key: 'filter-summary',
                    className: 'text-xs text-foreground-muted truncate',
                    label: filterSummary,
                  }
                : null,
            ]
              .filter((item): item is NonNullable<typeof item> => item !== null)
              .map((item) => (
                <span key={item.key} className="flex items-center gap-x-1">
                  · <span className={item.className}>{item.label}</span>
                </span>
              ))}
          </div>
        </div>
      </CardContent>

      <ChevronRight className="h-4 w-4 shrink-0 text-foreground-muted" />
    </Card>
  )
}
