import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { getAllItems } from '@/db/operations'

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
    // TODO: call bulk import mutation with conflictResolution
    // const items = await getAllItems()
    // await bulkImport({ variables: { items, conflictResolution } })
    console.log(
      'TODO: bulk import local data to cloud, conflictResolution:',
      conflictResolution,
    )
    localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
    setState('done')
  }

  return { state, dismiss, importData }
}
