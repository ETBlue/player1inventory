import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FilterStatusProps {
  filteredCount: number
  totalCount: number
  hasActiveFilters: boolean
  onClearAll: () => void
  disabled?: boolean
}

export function FilterStatus({
  filteredCount,
  totalCount,
  hasActiveFilters,
  onClearAll,
  disabled,
}: FilterStatusProps) {
  return (
    <div
      className={cn('flex items-center h-6 py-1', disabled ? 'opacity-50' : '')}
    >
      <div className="ml-3 text-xs text-foreground-muted">
        Showing {filteredCount} of {totalCount} items
      </div>
      <div className="flex-1" />
      {hasActiveFilters && (
        <Button
          variant="neutral-ghost"
          size="xs"
          onClick={onClearAll}
          disabled={disabled}
        >
          <X />
          Clear filter
        </Button>
      )}
    </div>
  )
}
