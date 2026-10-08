import { useApolloClient } from '@apollo/client/react'
import { useEffect, useRef, useState } from 'react'
import { getAllItems } from '@/db/operations'
import { fetchLocalPayload } from '@/lib/exportData'
import { type ImportStrategy, importCloudData } from '@/lib/importData'
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

/**
 * Whether the session is signed in, as the caller sees it.
 *
 * This hook used to call Clerk's `useAuth()` itself. It takes the two values as
 * an argument instead, so the hook can run with no `ClerkProvider` in the tree.
 * `PostLoginMigrationDialog` picks where they come from: Clerk in the real app,
 * a constant in E2E test mode.
 */
export type MigrationAuth = {
  isLoaded: boolean
  isSignedIn: boolean
}

export function usePostLoginMigration({ isLoaded, isSignedIn }: MigrationAuth) {
  const [state, setState] = useState<MigrationState>('idle')
  const apolloClient = useApolloClient()
  const { data: locations } = useLocations()
  // Hold the one-shot auto-import until this account's location list has
  // resolved at least once.
  //
  // PR 4b removed the other half of this gate. Until then the hook also picked
  // ONE local location and passed it to `importCloudData` as the single
  // location whose stock went up, because the cloud import surface was flat.
  // The remap rule keeps every location now, so there is no id left to pick
  // and none left to validate.
  //
  // Be careful about WHY this half survives. It is NOT what feeds the remap:
  // `importCloudData` reads the destination's default itself, with its own
  // `network-only` GetLocations query (`importData.ts`,
  // `fetchCloudDefaultLocationId` → `remapPayloadForCloud`), on every
  // strategy. So the copy cannot map the payload's default onto nothing even
  // with no gate at all. What this gate buys is ordering: the copy is one-shot
  // and destructive on the cloud side, and `clear` deletes every Location row
  // before the remap re-reads them, so starting it while this hook's own
  // GetLocations is still in flight lets a response that predates the clear
  // land in the Apollo cache after it. Waiting for one resolved list keeps the
  // session settled before the destructive write begins.
  const locationsLoaded = locations !== undefined
  // The auto-import is one-shot.
  //
  // `locationsLoaded` is a dependency of the effect below and it is a BOOLEAN,
  // so a location being added or renamed does not re-fire the effect. What does
  // is the list going unknown and then known again: `data` undefined →
  // defined, so the boolean true → false → true.
  //
  // There is a concrete trigger, and it is inside the copy itself.
  // `importCloudData` calls `client.resetStore()` at the end of the `clear`
  // path, which empties the Apollo cache and refetches every active query —
  // including the `GetLocations` behind `useLocations`. During that refetch
  // `cloud.data` is undefined. MIGRATION_PROMPTED_KEY is written only once
  // `importCloudData` RESOLVES, so the window is open while the copy is still
  // running: without this ref the effect re-enters and starts a second `clear`
  // import over the rows the first one just wrote.
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
      // dialog.
      if (!locationsLoaded) return
      if (autoImportStarted.current) return
      autoImportStarted.current = true
      setState('auto-importing')
      fetchLocalPayload()
        .then((payload) =>
          importCloudData(payload, storedStrategy, apolloClient),
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
  }, [isLoaded, isSignedIn, apolloClient, locationsLoaded])

  function dismiss() {
    localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
    setState('done')
  }

  async function importData(conflictResolution: 'append' | 'replace') {
    setState('importing')
    const payload = await fetchLocalPayload()
    const strategy = conflictResolution === 'replace' ? 'replace' : 'skip'
    await importCloudData(payload, strategy, apolloClient)
    localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
    setState('done')
  }

  return { state, dismiss, importData }
}
