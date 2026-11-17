import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { clearCache } from './persistence'

/**
 * The household id this device last showed, in cloud mode (households H5b,
 * decision T23). `HouseholdChangeGuard` compares it with the id the server
 * answers, and the join page sets it through `switchToHousehold`.
 */
export const LAST_HOUSEHOLD_ID_KEY = 'last-household-id'

export function getLastHouseholdId(): string | null {
  return localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)
}

export function setLastHouseholdId(id: string): void {
  localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, id)
}

/**
 * Move this device to another household: forget everything stored for the
 * old one, then reload.
 *
 * A join, a leave, a removal (and H7's switch) change the household the
 * server answers for, but the device still holds the OLD household's rows:
 * in the in-memory Apollo cache, in the saved copy in
 * `Player1InventoryCloudCache`, and as the active location id. Without this
 * step the old household's pantry would stay on screen (Review Focus 5).
 *
 * The steps, in order:
 * 1. `clearCache()` empties the in-memory cache and the saved copy. It keeps
 *    `LAST_USER_ID_KEY` on purpose (see its comment): the account did not
 *    change, so the account guard in `ApolloWrapper` must stay armed.
 * 2. Remove `active-location-id:cloud`. The old location is not in the new
 *    household, so `ActiveLocationProvider` picks the first one there.
 * 3. Store the new id, so the guard does not fire again after the reload.
 * 4. Load a page again, so no component keeps an old row in its own state.
 *    With `to`, load that page (`location.replace`, so Back does not return
 *    to the old one). Without it, reload the current page.
 *
 * The join page passes `{ to: '/' }`. Reloading `/join/<token>` would ask
 * `invitePreview` about an invite that is now USED, and it answers INVALID,
 * so the person who just joined would read "This invite is no longer valid".
 * `HouseholdChangeGuard` passes no target: the page the person is on is
 * still right for them.
 */
export async function switchToHousehold(
  id: string,
  options: { to?: string } = {},
): Promise<void> {
  await clearCache()
  localStorage.removeItem(activeLocationStorageKey('cloud'))
  setLastHouseholdId(id)
  if (options.to === undefined) window.location.reload()
  else window.location.replace(options.to)
}
