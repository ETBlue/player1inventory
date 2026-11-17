import { useEffect, useRef } from 'react'
import { useHousehold } from '@/hooks/useHousehold'
import {
  getLastHouseholdId,
  setLastHouseholdId,
  switchToHousehold,
} from './householdGuard'

/**
 * Clears this device's household data when the server answers a different
 * household (households H5b, decision T23). Renders nothing.
 *
 * Mounted by `__root.tsx` in cloud mode, in the Clerk tree and in the E2E
 * tree. A join, a leave or a removal changes the caller's household, and the
 * account guard in `ApolloWrapper` does not see it: the account is the same.
 *
 * What it compares the new id with:
 * - the id THIS page saw first, when it has seen one. A person's other tab
 *   must clear too, but the tab that joined has already stored the new id in
 *   `localStorage`, which every tab shares. So the stored id alone would say
 *   "nothing changed" in the other tab.
 * - else the stored id (`last-household-id`), the household this device
 *   showed last time.
 *
 * No previous id: store it, nothing else. A different id:
 * `switchToHousehold` (clear the cache, forget the active location, store the
 * id, reload). Loading or error (`data` undefined): nothing.
 *
 * When the cache cannot be cleared, it logs the error and does NOT reload.
 * A reload would bring back the old saved copy, and the stored id would then
 * no longer match it, so the next load tries again.
 */
export function HouseholdChangeGuard() {
  const { data } = useHousehold()
  const id = data?.id
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
