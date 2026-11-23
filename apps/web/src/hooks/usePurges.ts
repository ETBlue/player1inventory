import { useApolloClient } from '@apollo/client/react'
import { useState } from 'react'
import { useRefetchAfterWrite } from '@/apollo/refetchAfterWrite'
import {
  useClearAllDataMutation,
  useDeleteAllLocationsMutation,
  useDeleteHouseholdMutation,
  useRemoveAllLocationItemsMutation,
} from '@/generated/graphql'
import { createOncePerKey } from '@/lib/oncePerKey'
import { expectLocationLoss } from '@/lib/seenLocations'
import { moveToCurrentHousehold } from './useHouseholdMembers'

// The purges (households H6, task J.5; decision T55, owner decision O38-A).
// Cloud only: local mode clears through the import's `clear` strategy. The
// danger zones (task J.7) ask for the typed name first; these hooks only
// write. The server checks every role.
//
// | Hook | Mutation | Who (server) |
// |---|---|---|
// | `useClearHousehold` | `clearAllData` | household owner |
// | `useDeleteAllLocations` | `deleteAllLocations` | household owner |
// | `useRemoveAllLocationItems(locationId)` | `removeAllLocationItems` | organizer of that location |
// | `useDeleteHousehold` | `deleteHousehold` | household owner |
//
// The acting tab gets NO live event for its own change. A purge changes many
// lists at once (the pantry, the carts, the switcher, the activity log), so
// the first three read again EVERY active query (`refetchAfterWrite(…,
// 'active')`), the same set the household-level `LOCATION` event reads in
// other tabs. Through `refetchAfterWrite`, never `awaitRefetchQueries`: a
// failed read must not reject a purge the server has done
// (`hooks/CLAUDE.md`, *Reading again after a cloud write*). A refused purge
// still rejects.
//
// **No lost-access toast for the person's own purge** (the rule of households
// H5c task H.7). `clearAllData`, `deleteAllLocations` and `deleteHousehold`
// delete the active location, so they mark every seen location with
// `expectLocationLoss()` BEFORE the write and take the mark back when the
// write fails, exactly as the `clear` import does. `removeAllLocationItems`
// keeps the location, so it marks nothing.

const once = createOncePerKey()

/**
 * Mark every seen location as an expected loss, run the write, and take the
 * mark back when the write fails. Not when a read after it fails: the write
 * worked, and the locations are gone.
 */
async function expectingLoss<T>(write: () => Promise<T>): Promise<T> {
  const takeBack = expectLocationLoss()
  try {
    return await write()
  } catch (err) {
    takeBack()
    throw err
  }
}

/**
 * Clear the household: delete the catalog and every location with
 * everything in them, then the server makes one new location, "Home", with
 * the caller as organizer (`ClearAllData`, the same mutation the `clear`
 * import sends). Resolves to the server's answer once every list on screen
 * has been read again.
 */
export function useClearHousehold() {
  const { refetchAfterWrite, isRefetching } = useRefetchAfterWrite()
  const [clearAllData, { loading }] = useClearAllDataMutation()
  return {
    clear: (): Promise<boolean> =>
      once('clear', async () => {
        const result = await expectingLoss(() => clearAllData())
        await refetchAfterWrite('active')
        return result.data?.clearAllData === true
      }),
    isPending: loading || isRefetching,
  }
}

/**
 * Delete every location of the household, with their stock, logs, carts and
 * roles. The catalog stays, and no new location is made (owner decision
 * O34-A), so the app then shows the "no locations" screen. `false` when the
 * household had no location.
 */
export function useDeleteAllLocations() {
  const { refetchAfterWrite, isRefetching } = useRefetchAfterWrite()
  const [deleteAllLocations, { loading }] = useDeleteAllLocationsMutation()
  return {
    deleteAll: (): Promise<boolean> =>
      once('deleteAll', async () => {
        const result = await expectingLoss(() => deleteAllLocations())
        await refetchAfterWrite('active')
        return result.data?.deleteAllLocations === true
      }),
    isPending: loading || isRefetching,
  }
}

/**
 * Remove every item from one location: its stock rows and the rows of its
 * carts. The location, its carts, its logs and its roles stay. `false` when
 * there was nothing to remove.
 */
export function useRemoveAllLocationItems(locationId: string) {
  const { refetchAfterWrite, isRefetching } = useRefetchAfterWrite()
  const [removeAllLocationItems, { loading }] =
    useRemoveAllLocationItemsMutation()
  return {
    removeAll: (): Promise<boolean> =>
      once(`removeAll:${locationId}`, async () => {
        const result = await removeAllLocationItems({
          variables: { locationId },
        })
        await refetchAfterWrite('active')
        return result.data?.removeAllLocationItems === true
      }),
    isPending: loading || isRefetching,
  }
}

/**
 * Delete the household the caller acts in, with all its data (owner decision
 * O38-A). Then move the device, as `leave()` does (`moveToCurrentHousehold`
 * in `useHouseholdMembers.ts`):
 *
 * | The server answers `GetHousehold` | What happens |
 * |---|---|
 * | the person's other household | `switchToHousehold(id, { to: '/' })`: clears the Apollo cache, in memory and in `Player1InventoryCloudCache`, then loads `/` |
 * | `NO_HOUSEHOLD` | `forgetHousehold()` (the same clear), then load `/`, where the no-household screen shows |
 * | anything else | load `/`; the next load asks again |
 *
 * The server sends NO live event for a deleted household: nobody is a member
 * any more, so the event would reach nobody (`What this plan got wrong`,
 * J.4). So this hook is what moves the owner's own tab. Other members' tabs
 * find out on their next request (the household guard, `NoHouseholdGate`).
 *
 * A refused delete rejects, takes the lost-access mark back, and moves
 * nothing. Resolves once the device has started to load `/`. `isPending`
 * stays `true` from the press until then.
 */
export function useDeleteHousehold() {
  const client = useApolloClient()
  const [deleteHousehold] = useDeleteHouseholdMutation()
  const [running, setRunning] = useState(false)
  return {
    deleteHousehold: (): Promise<void> =>
      once('deleteHousehold', async () => {
        setRunning(true)
        try {
          await expectingLoss(() => deleteHousehold())
          await moveToCurrentHousehold(client)
        } finally {
          setRunning(false)
        }
      }),
    isPending: running,
  }
}
