import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
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
  /**
   * Show "Clear & import". `false` for a household `manager`: `clear` is for
   * the owner only (households design, *Import: owner and manager only*,
   * Decision 27; H4 decision O7). Defaults to `true` (local mode, and the
   * owner).
   */
  allowClear?: boolean
  /**
   * The household name, in cloud mode. When set, "Clear & import" does not
   * run at once: it opens `DeleteButton`'s typed-name confirm, which works
   * only when this name is typed EXACTLY (owner decision O40, households H6
   * task K.0). `clear` deletes the same catalog as Clear household, so it
   * asks the same way. Local mode has no household and passes nothing, so
   * the button runs `onClear` with one press, as before.
   */
  clearConfirmName?: string
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
  allowClear = true,
  clearConfirmName,
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
          {allowClear &&
            (clearConfirmName === undefined ? (
              <Button variant="destructive" onClick={onClear}>
                {t('settings.import.conflictDialog.clear')}
              </Button>
            ) : (
              <DeleteButton
                trigger={t('settings.import.conflictDialog.clear')}
                buttonVariant="destructive"
                dialogTitle={t('settings.import.conflictDialog.clear')}
                dialogDescription={t(
                  'settings.import.conflictDialog.clearConfirmDescription',
                )}
                confirmLabel={t('settings.import.conflictDialog.clear')}
                confirmName={clearConfirmName}
                confirmNameLabel={t('settings.household.danger.typeName', {
                  name: clearConfirmName,
                })}
                // `onClear` only starts the import. The card shows its
                // progress and its errors, so this confirm closes at once.
                onDelete={onClear}
              />
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
