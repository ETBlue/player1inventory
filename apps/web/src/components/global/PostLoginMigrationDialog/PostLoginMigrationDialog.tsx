import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MigrationLocationWarningDialog } from '@/components/shared/MigrationLocationWarningDialog'
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
import { useActiveLocation } from '@/hooks/useActiveLocation'
import { useLocations } from '@/hooks/useLocations'
import { usePostLoginMigration } from '@/hooks/usePostLoginMigration'

export function PostLoginMigrationDialog() {
  const { state, dismiss, importData } = usePostLoginMigration()
  const { t } = useTranslation()
  const [showLocationWarning, setShowLocationWarning] = useState(false)

  // The copy sends only the active location's stock (cloud has no per-location
  // ItemStock yet), so warn first when another location would be left behind.
  // A single-location pantry — the common case — is never interrupted.
  const { data: locations } = useLocations()
  const { activeLocationId, activeLocation } = useActiveLocation()
  // Until the list has loaded there is no way to tell a single-location pantry
  // from a multi-location one, and defaulting to "no warning" would let a fast
  // click skip it. Hold the import instead — `locations` is undefined only while
  // the query is in flight.
  const locationsLoaded = locations !== undefined
  const otherLocations = (locations ?? []).filter(
    (loc) => loc.id !== activeLocationId,
  )

  function handleImport() {
    if (otherLocations.length > 0) {
      setShowLocationWarning(true)
      return
    }
    importData('append')
  }

  return (
    <>
      {/* Auto-import progress dialog — no buttons, user already chose strategy
          (and was already warned about locations before the reload). */}
      <AlertDialog open={state === 'auto-importing'}>
        <AlertDialogContent aria-describedby={undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.postLoginMigration.autoImporting')}
            </AlertDialogTitle>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual import prompt dialog */}
      <AlertDialog
        open={
          (state === 'prompting' || state === 'importing') &&
          !showLocationWarning
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.postLoginMigration.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.postLoginMigration.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={dismiss}
              disabled={state === 'importing'}
            >
              {t('settings.postLoginMigration.skip')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleImport}
              disabled={state === 'importing' || !locationsLoaded}
            >
              {state === 'importing'
                ? '...'
                : t('settings.postLoginMigration.import')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Multi-location warning — shown in place of the prompt, before any copy */}
      <MigrationLocationWarningDialog
        open={showLocationWarning}
        activeLocationName={activeLocation?.name ?? activeLocationId}
        otherLocationNames={otherLocations.map((loc) => loc.name)}
        onConfirm={() => {
          setShowLocationWarning(false)
          importData('append')
        }}
        onCancel={() => setShowLocationWarning(false)}
      />
    </>
  )
}
