import { useApolloClient } from '@apollo/client/react'
import { useAuth } from '@clerk/react'
import { useEffect, useRef, useState } from 'react'
import { getAllItems } from '@/db/operations'
import { fetchLocalPayload } from '@/lib/exportData'
import { type ImportStrategy, importCloudData } from '@/lib/importData'
import { DEFAULT_LOCATION_ID } from '@/types'
import { readStoredLocationId, useActiveLocation } from './useActiveLocation'
import { useLocations } from './useLocations'

export const MIGRATION_PROMPTED_KEY = 'migration-prompted'
export const MIGRATION_STRATEGY_KEY = 'migration-strategy'

export type MigrationState =
  | 'idle'
  | 'prompting'
  | 'conflict'
  | 'importing'
  | 'auto-importing'
  | 'done'

export function usePostLoginMigration() {
  const { isSignedIn, isLoaded } = useAuth()
  const [state, setState] = useState<MigrationState>('idle')
  const apolloClient = useApolloClient()
  // Cloud HAS per-location ItemStock since PR 1, but the cloud IMPORT surface
  // is still flat (`ItemInput` carries stock inline, no `locationId` — PR 4
  // gives it `LocationInput`/`ItemStockInput`). So the copy sends the stock of
  // ONE location out of the LOCAL payload `fetchLocalPayload` builds —
  // `importCloudData` flattens the payload onto it.
  //
  // That id has to be a LOCAL one. This hook only ever runs in cloud mode (it
  // is gated on `isSignedIn`), where `useActiveLocation().activeLocationId` is
  // the cloud active id — a server-generated cuid naming a cloud `Location`.
  // No `ItemStock` row in a local payload carries it, so flattening by it
  // uploads every item with zeroed stock and drops every cart. Read the local
  // slot instead: it holds the pantry the user was in before signing in.
  const migrationLocationId = readStoredLocationId('local')
  const { activeLocationId } = useActiveLocation()
  const { data: locations } = useLocations()
  // Hold the one-shot auto-import until the app has settled on a location: the
  // list has loaded and names the active id (the default is always allowed — it
  // is undeletable, and gating on it would deadlock a table still being seeded).
  //
  // NOTE (PR 4): since the copy id moved to the local slot above, this gate no
  // longer validates the id being copied by. `useLocations()` returns the CLOUD
  // list in cloud mode, so it cannot: validating the local slot against the
  // local `locations` table is a separate decision, deliberately left to PR 4
  // rather than guessed at here. The gate is kept because it still delays the
  // destructive one-shot copy until the session has stabilised.
  const locationResolved =
    locations !== undefined &&
    (activeLocationId === DEFAULT_LOCATION_ID ||
      locations.some((loc) => loc.id === activeLocationId))
  // The auto-import is one-shot. `locationResolved` is a dependency of the
  // effect below, and MIGRATION_PROMPTED_KEY is only written once the import
  // resolves — so without this guard a location change landing mid-flight would
  // re-enter and start a second copy over the rows the first one just wrote.
  // There is a real trigger: `ActiveLocationProvider` resets a stale stored id
  // to the default once `useLocations()` resolves, which is asynchronous, and
  // that flips `locationResolved`.
  const autoImportStarted = useRef(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    if (localStorage.getItem(MIGRATION_PROMPTED_KEY)) return

    const storedStrategy = localStorage.getItem(
      MIGRATION_STRATEGY_KEY,
    ) as ImportStrategy | null

    if (storedStrategy) {
      // Only the auto-import is gated: it is one-shot and destructive on the
      // cloud side. The prompting path below merely decides whether to show the
      // dialog, and the dialog gates its own confirm button on the same list.
      if (!locationResolved) return
      if (autoImportStarted.current) return
      autoImportStarted.current = true
      setState('auto-importing')
      fetchLocalPayload()
        .then((payload) =>
          importCloudData(payload, storedStrategy, apolloClient, {
            locationId: migrationLocationId,
          }),
        )
        .then(() => {
          localStorage.removeItem(MIGRATION_STRATEGY_KEY)
          localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
          setState('done')
        })
        .catch(() => {
          // Import failed — clean up strategy key and dismiss so the user
          // isn't stuck. MIGRATION_PROMPTED_KEY is intentionally NOT set here
          // so the user can retry after refreshing.
          localStorage.removeItem(MIGRATION_STRATEGY_KEY)
          setState('done')
        })
      return
    }

    getAllItems().then((items) => {
      if (items.length > 0) {
        setState('prompting')
      } else {
        localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
      }
    })
  }, [
    isLoaded,
    isSignedIn,
    apolloClient,
    migrationLocationId,
    locationResolved,
  ])

  function dismiss() {
    localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
    setState('done')
  }

  async function importData(conflictResolution: 'append' | 'replace') {
    setState('importing')
    const payload = await fetchLocalPayload()
    const strategy = conflictResolution === 'replace' ? 'replace' : 'skip'
    await importCloudData(payload, strategy, apolloClient, {
      locationId: migrationLocationId,
    })
    localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
    setState('done')
  }

  return { state, dismiss, importData }
}
