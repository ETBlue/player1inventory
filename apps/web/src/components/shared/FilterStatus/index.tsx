import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  return (
    <div
      className={cn('flex items-center h-6 py-1', disabled ? 'opacity-50' : '')}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="ml-3 text-xs text-foreground-muted">
        {t('filterStatus.showing', {
          filtered: filteredCount,
          total: totalCount,
        })}
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
          {t('filterStatus.clearFilter')}
        </Button>
      )}
    </div>
  )
}
