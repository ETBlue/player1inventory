import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface PantryControlBarProps {
  allShelfIds: string[]
  expandedIds: Set<string>
  onExpandAll: () => void
  onCollapseAll: () => void
}

export function PantryControlBar({
  allShelfIds,
  expandedIds,
  onExpandAll,
  onCollapseAll,
}: PantryControlBarProps) {
  const { t } = useTranslation()

  const isAllExpanded = expandedIds.size === allShelfIds.length
  const isAllCollapsed = expandedIds.size === 0

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Button
        variant="neutral-ghost"
        size="icon"
        className="lg:w-auto lg:px-3"
        aria-label={t('pantry.controlBar.expandAll')}
        onClick={onExpandAll}
        disabled={isAllExpanded}
      >
        <ChevronsUpDown className="h-4 w-4" />
        <span className="hidden lg:inline">
          {t('pantry.controlBar.expandAll')}
        </span>
      </Button>
      <Button
        variant="neutral-ghost"
        size="icon"
        className="lg:w-auto lg:px-3"
        aria-label={t('pantry.controlBar.collapseAll')}
        onClick={onCollapseAll}
        disabled={isAllCollapsed}
      >
        <ChevronsDownUp className="h-4 w-4" />
        <span className="hidden lg:inline">
          {t('pantry.controlBar.collapseAll')}
        </span>
      </Button>
    </div>
  )
}
