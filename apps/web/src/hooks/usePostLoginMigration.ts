import { useApolloClient } from '@apollo/client/react'
import { useAuth } from '@clerk/react'
import { useEffect, useRef, useState } from 'react'
import { getAllItems } from '@/db/operations'
import { fetchLocalPayload } from '@/lib/exportData'
import { type ImportStrategy, importCloudData } from '@/lib/importData'
import { DEFAULT_LOCATION_ID } from '@/types'
import { useActiveLocation } from './useActiveLocation'
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
  // Cloud has no per-location ItemStock (deferred in PR D), so the copy sends
  // the stock of the location that is active at migration time — what the user
  // was last looking at. `importCloudData` flattens the payload onto it.
  const { activeLocationId } = useActiveLocation()
  const { data: locations } = useLocations()
  // On the first render `activeLocationId` is whatever localStorage held, which
  // may name a location that no longer exists — `ActiveLocationProvider` only
  // corrects it once `useLocations()` resolves, which is asynchronous. Copying
  // by a stale id flattens against stock nothing matches: every item uploads
  // zeroed and every cart is dropped, and the one-shot ref below then blocks the
  // corrected retry. So wait until the list has loaded AND names the active
  // location. The default location is always allowed — it is undeletable, and
  // gating on it would deadlock a database whose table is still being seeded.
  const locationResolved =
    locations !== undefined &&
    (activeLocationId === DEFAULT_LOCATION_ID ||
      locations.some((loc) => loc.id === activeLocationId))
  // The auto-import is one-shot. `activeLocationId` is a dependency of the
  // effect below, and MIGRATION_PROMPTED_KEY is only written once the import
  // resolves — so without this guard a location change landing mid-flight would
  // re-enter and start a second copy over the rows the first one just wrote.
  // There is a real trigger: `ActiveLocationProvider` resets a stale stored id
  // to the default once `useLocations()` resolves, which is asynchronous.
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
            locationId: activeLocationId,
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
  }, [isLoaded, isSignedIn, apolloClient, activeLocationId, locationResolved])

  function dismiss() {
    localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
    setState('done')
  }

  async function importData(conflictResolution: 'append' | 'replace') {
    setState('importing')
    const payload = await fetchLocalPayload()
    const strategy = conflictResolution === 'replace' ? 'replace' : 'skip'
    await importCloudData(payload, strategy, apolloClient, {
      locationId: activeLocationId,
    })
    localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
    setState('done')
  }

  return { state, dismiss, importData }
}
