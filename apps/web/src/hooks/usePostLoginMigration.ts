import { useApolloClient } from '@apollo/client/react'
import { useAuth } from '@clerk/react'
import { useEffect, useRef, useState } from 'react'
import { getAllItems } from '@/db/operations'
import { fetchLocalPayload } from '@/lib/exportData'
import { type ImportStrategy, importCloudData } from '@/lib/importData'
import { useActiveLocation } from './useActiveLocation'

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
  }, [isLoaded, isSignedIn, apolloClient, activeLocationId])

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
