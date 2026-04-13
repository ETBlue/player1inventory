import { useApolloClient } from '@apollo/client/react'
import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { getAllItems } from '@/db/operations'
import { fetchLocalPayload } from '@/lib/exportData'
import { importCloudData } from '@/lib/importData'

const MIGRATION_PROMPTED_KEY = 'migration-prompted'

export type MigrationState =
  | 'idle'
  | 'prompting'
  | 'conflict'
  | 'importing'
  | 'done'

export function usePostLoginMigration() {
  const { isSignedIn, isLoaded } = useAuth()
  const [state, setState] = useState<MigrationState>('idle')
  const apolloClient = useApolloClient()

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    if (localStorage.getItem(MIGRATION_PROMPTED_KEY)) return

    getAllItems().then((items) => {
      if (items.length > 0) {
        setState('prompting')
      } else {
        localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
      }
    })
  }, [isLoaded, isSignedIn])

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
