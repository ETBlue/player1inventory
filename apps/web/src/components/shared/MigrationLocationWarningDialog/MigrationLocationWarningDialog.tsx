import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export interface MigrationLocationWarningDialogProps {
  open: boolean
  /** Name of the location whose stock will be copied to cloud. */
  activeLocationName: string
  /** Names of the locations that will NOT be copied. Never empty when open. */
  otherLocationNames: string[]
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Shown before a local → cloud copy when the pantry has more than one location.
 *
 * Cloud has no per-location `ItemStock` (deferred in PR D), so the copy collapses
 * the pantry onto the location that is active at migration time. Everything in
 * the other locations is simply not migrated and is not preserved anywhere in
 * the cloud — this dialog informs the user of that; it does not rescue the data.
 *
 * Purely presentational: both call sites (`DataModeCard`'s copy action and
 * `PostLoginMigrationDialog`'s sign-in prompt) resolve the names via
 * `useLocations()` + `useActiveLocation()` and own the confirm/cancel flow.
 */
export function MigrationLocationWarningDialog({
  open,
  activeLocationName,
  otherLocationNames,
  onConfirm,
  onCancel,
}: MigrationLocationWarningDialogProps) {
  const { t } = useTranslation()

  return (
    // No onOpenChange: the buttons drive every state transition (matches the
    // sibling dialogs in DataModeCard).
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('settings.migrationLocationWarning.title', {
              location: activeLocationName,
            })}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogDescription>
          {t('settings.migrationLocationWarning.description', {
            location: activeLocationName,
          })}
        </AlertDialogDescription>
        <AlertDialogDescription>
          {t('settings.migrationLocationWarning.leftBehind', {
            locations: otherLocationNames.join(', '),
          })}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t('settings.migrationLocationWarning.continue')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
