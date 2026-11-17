import { NetworkStatus } from '@apollo/client'
import { useEffect, useRef } from 'react'
import { useGetHouseholdQuery } from '@/generated/graphql'
import {
  getLastHouseholdId,
  setLastHouseholdId,
  switchToHousehold,
} from './householdGuard'

/**
 * Clears this device's household data when the SERVER answers a different
 * household (households H5b, decision T23). Renders nothing.
 *
 * Mounted by `__root.tsx` in cloud mode, in the Clerk tree and in the E2E
 * tree. The account guard in `ApolloWrapper` does not see a household
 * change: the account is the same.
 *
 * What reaches it: any change that leaves the person in ANOTHER household,
 * so `GetHousehold` answers a new id. For example a join made in another
 * tab, or a leave or a removal when the person has a second household to
 * fall back to. What does NOT reach it: a leave or a removal that leaves the
 * person in no household. Then `GetHousehold` fails with `NO_HOUSEHOLD`,
 * there is no id, and this guard does nothing. `NoHouseholdGate` (task G.8)
 * clears the cache then (`forgetHousehold`). The join page calls
 * `switchToHousehold` directly.
 *
 * Only an answer from the server counts (`networkStatus === ready`).
 * `GetHousehold` is read `cache-and-network`, so the first answer can come
 * from the cache restored from `Player1InventoryCloudCache`. That copy may be
 * older than the stored id (another tab may still save its old cache), and
 * acting on it would reload for nothing and store a wrong id for a moment.
 *
 * What it compares the new id with:
 * - the id THIS page saw first, when it has seen one. A person's other tab
 *   must clear too, but the tab that changed household has already stored
 *   the new id in `localStorage`, which every tab shares. So the stored id
 *   alone would say "nothing changed" in the other tab.
 * - else the stored id (`last-household-id`), the household this device
 *   showed last time.
 *
 * No previous id: store it, nothing else. A different id:
 * `switchToHousehold` with no target (clear the cache, forget the active
 * location, store the id, reload this page).
 *
 * When the cache cannot be cleared, it logs the error and does NOT reload.
 * A reload would bring back the old saved copy, and the stored id would then
 * no longer match it, so the next load tries again.
 */
export function HouseholdChangeGuard() {
  // The same query and policy as `useHousehold`, so Apollo sends one
  // request for both. This hook is used here only for `networkStatus`.
  const { data, networkStatus } = useGetHouseholdQuery({
    fetchPolicy: 'cache-and-network',
  })
  const id =
    networkStatus === NetworkStatus.ready ? data?.household.id : undefined
  const seenId = useRef<string | null>(null)

  useEffect(() => {
    if (!id) return
    const previous = seenId.current ?? getLastHouseholdId()
    seenId.current = id
    if (previous === null) setLastHouseholdId(id)
    if (previous === null || previous === id) return
    switchToHousehold(id).catch((err: unknown) => {
      console.error('Could not clear the data of the old household', err)
    })
  }, [id])

  return null
}
