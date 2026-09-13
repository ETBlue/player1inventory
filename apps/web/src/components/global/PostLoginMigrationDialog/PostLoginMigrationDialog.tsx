import { useQuery } from '@tanstack/react-query'
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
import { getLocations } from '@/db/operations'
import { resolveLocalActiveLocationId } from '@/hooks/useActiveLocation'
import { usePostLoginMigration } from '@/hooks/usePostLoginMigration'

export function PostLoginMigrationDialog() {
  const { state, dismiss, importData } = usePostLoginMigration()
  const { t } = useTranslation()
  const [showLocationWarning, setShowLocationWarning] = useState(false)

  // The copy sends only one location's stock — `flattenPayloadForCloud`
  // collapses the local payload onto the location `usePostLoginMigration`
  // passes as `importCloudData`'s `locationId`, because the cloud IMPORT path
  // is still flat (`ItemInput` carries stock inline and the payload's
  // `itemStocks`/`locations` are dropped). So warn first when another location
  // would be left behind. A single-location pantry — the common case — is
  // never interrupted.
  //
  // Both the list and the active id must be the LOCAL ones. This dialog only
  // ever runs in cloud mode (its hook is gated on `isSignedIn`), where
  // `useLocations()` returns the CLOUD list and `useActiveLocation()` the cloud
  // slot — neither describes the local pantry being copied UP, so the warning
  // would enumerate locations that are not at risk while missing the local ones
  // that are. Read local Dexie directly, by the same local-slot id
  // `usePostLoginMigration` copies by (`readStoredLocationId('local')`) — here
  // VALIDATED against the local table, exactly as the provider validates its
  // own, so the name shown and the id filtered on can never name two different
  // rows. The copy id itself is still the raw slot; whether that read should be
  // validated too is the PR 4 question `usePostLoginMigration` documents.
  const { data: localSource } = useQuery({
    queryKey: ['locations', 'local-migration-source'],
    queryFn: async () => ({
      locations: await getLocations(),
      activeLocationId: await resolveLocalActiveLocationId(),
    }),
  })
  // Until the read has landed there is no way to tell a single-location pantry
  // from a multi-location one, and defaulting to "no warning" would let a fast
  // click skip it. Hold the import instead.
  const locationsLoaded = localSource !== undefined
  const activeLocationId = localSource?.activeLocationId
  const activeLocation = localSource?.locations.find(
    (loc) => loc.id === activeLocationId,
  )
  const otherLocations = (localSource?.locations ?? []).filter(
    (loc) => loc.id !== activeLocationId,
  )
  // The name the warning displays comes from the same row the filter above
  // keeps out of `otherLocations` — naming one location while filtering by
  // another would be worse than not warning at all. It is missing only for a
  // local table with no rows, where the resolved id is the seed sentinel.
  const activeLocationName = activeLocation?.name ?? activeLocationId ?? ''

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
        activeLocationName={activeLocationName}
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
