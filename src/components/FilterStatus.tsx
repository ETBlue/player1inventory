import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FilterStatusProps {
  filteredCount: number
  totalCount: number
  hasActiveFilters: boolean
  onClearAll: () => void
}

export function FilterStatus({
  filteredCount,
  totalCount,
  hasActiveFilters,
  onClearAll,
}: FilterStatusProps) {
  return (
    <div className="flex items-center h-6 py-1">
      <div className="ml-3 text-xs text-foreground-muted">
        Showing {filteredCount} of {totalCount} items
      </div>
      <div className="flex-1" />
      {hasActiveFilters && (
        <Button variant="neutral-ghost" size="xs" onClick={onClearAll}>
          <X />
          Clear filter
        </Button>
      )}
    </div>
  )
}
