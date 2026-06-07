import { ShelvingUnit } from 'lucide-react'
import { GroupCard } from '@/components/shared/GroupCard'
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
  totalPackedQuantity,
  totalTargetInPacks,
  totalRefillInPacks,
}: ShelfCardProps) {
  return (
    <GroupCard
      name={shelf.name}
      icon={<ShelvingUnit size={16} />}
      itemCount={itemCount}
      onClick={onClick}
      {...(shelf.type === 'filter' && filterSummary !== undefined
        ? { filterSummary }
        : {})}
      {...(outOfStockCount !== undefined ? { outOfStockCount } : {})}
      {...(lowStockCount !== undefined ? { lowStockCount } : {})}
      {...(activeCount !== undefined ? { activeCount } : {})}
      {...(totalPackedQuantity !== undefined ? { totalPackedQuantity } : {})}
      {...(totalTargetInPacks !== undefined ? { totalTargetInPacks } : {})}
      {...(totalRefillInPacks !== undefined ? { totalRefillInPacks } : {})}
    />
  )
}
