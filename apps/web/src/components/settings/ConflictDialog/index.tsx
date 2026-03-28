import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ConflictEntry, ConflictSummary } from '@/lib/importData'

interface ConflictDialogProps {
  open: boolean
  conflicts: ConflictSummary
  onSkip: () => void
  onReplace: () => void
  onClear: () => void
  onClose: () => void
}

type EntityKey = keyof ConflictSummary

const ENTITY_KEYS: EntityKey[] = [
  'items',
  'tags',
  'tagTypes',
  'vendors',
  'recipes',
  'inventoryLogs',
  'shoppingCarts',
  'cartItems',
]

function formatMatchReason(
  reasons: ('id' | 'name')[],
  t: (key: string) => string,
): string {
  if (reasons.includes('id') && reasons.includes('name')) {
    return t('settings.import.conflictDialog.bothMatch')
  }
  if (reasons.includes('id')) {
    return t('settings.import.conflictDialog.idMatch')
  }
  return t('settings.import.conflictDialog.nameMatch')
}

function formatConflictEntries(
  entries: ConflictEntry[],
  t: (key: string) => string,
): string {
  return entries
    .map((e) => `${e.name} (${formatMatchReason(e.matchReasons, t)})`)
    .join(', ')
}

export function ConflictDialog({
  open,
  conflicts,
  onSkip,
  onReplace,
  onClear,
  onClose,
}: ConflictDialogProps) {
  const { t } = useTranslation()

  const activeKeys = ENTITY_KEYS.filter((key) => conflicts[key].length > 0)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('settings.import.conflictDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogMain>
          <DialogDescription>
            {t('settings.import.conflictDialog.description')}
          </DialogDescription>

          <div className="space-y-2 py-2 max-h-64 overflow-y-auto">
            {activeKeys.map((key) => {
              const entries = conflicts[key]
              const label = t(
                `settings.import.conflictDialog.entityTypes.${key}`,
              )
              return (
                <div key={key} className="text-sm">
                  <span className="font-medium">
                    {label} ({entries.length}):
                  </span>{' '}
                  <span className="text-foreground-muted">
                    {formatConflictEntries(entries, t)}
                  </span>
                </div>
              )
            })}
          </div>
        </DialogMain>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="neutral-outline" onClick={onClose}>
            {t('settings.import.conflictDialog.cancel')}
          </Button>
          <Button variant="neutral-outline" onClick={onSkip}>
            {t('settings.import.conflictDialog.skip')}
          </Button>
          <Button onClick={onReplace}>
            {t('settings.import.conflictDialog.replace')}
          </Button>
          <Button variant="red" onClick={onClear}>
            {t('settings.import.conflictDialog.clear')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
