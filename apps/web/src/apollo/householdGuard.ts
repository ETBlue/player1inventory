import type { ApolloClient } from '@apollo/client'
import {
  GetHouseholdDocument,
  type GetHouseholdQuery,
} from '@/generated/graphql'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { graphQLErrorCode } from '@/lib/graphqlErrorCode'
import { clearCache } from './persistence'

/**
 * The household id this device last showed, in cloud mode (households H5b,
 * decision T23). `HouseholdChangeGuard` compares it with the id the server
 * answers, and the join page sets it through `switchToHousehold`.
 */
export const LAST_HOUSEHOLD_ID_KEY = 'last-household-id'

// Storage can throw (a private window, blocked site data, a full disk), and
// so can reading the `localStorage` or `sessionStorage` property itself.
// These three never throw, so a storage problem never breaks a request or a
// switch. A failed read counts as "nothing stored". `area` picks the storage:
// `localStorage` (every tab of the site shares it) unless told otherwise.
type StorageArea = 'local' | 'session'

function storageOf(area: StorageArea): Storage {
  return area === 'session' ? sessionStorage : localStorage
}

function readStorage(key: string, area: StorageArea = 'local'): string | null {
  try {
    return storageOf(area).getItem(key)
  } catch {
    return null
  }
}

function writeStorage(
  key: string,
  value: string,
  area: StorageArea = 'local',
): void {
  try {
    storageOf(area).setItem(key, value)
  } catch {
    // Nothing to do: the value is lost, and the next load reads nothing.
  }
}

function removeStorage(key: string, area: StorageArea = 'local'): void {
  try {
    storageOf(area).removeItem(key)
  } catch {
    // Nothing to do.
  }
}

export function getLastHouseholdId(): string | null {
  return readStorage(LAST_HOUSEHOLD_ID_KEY)
}

export function setLastHouseholdId(id: string): void {
  writeStorage(LAST_HOUSEHOLD_ID_KEY, id)
  pageHouseholdId = id
}

/**
 * The household id THIS PAGE shows, or `null` (households H7 task L.3,
 * decision T66). The Apollo link sends it in the `x-household-id` header,
 * and the server refuses a request with `HOUSEHOLD_CHANGED` when it is not
 * the household the person acts in now (T67).
 *
 * It is NOT simply `last-household-id`. Every tab shares `localStorage`, so
 * when one tab switches it stores the NEW id before it reloads. A second tab
 * that still shows the old household would then send the new id, the server
 * would accept it, and that tab would show the new household's catalog next
 * to the old household's locations. So the value is read from storage ONCE,
 * on this page's first request, and kept for the life of the page.
 *
 * It changes inside a page only through this file:
 * - `setLastHouseholdId`: `HouseholdChangeGuard` stores the first household
 *   a page sees when nothing was stored yet, and `switchToHousehold` stores
 *   the new id just before it reloads.
 * - `forgetHousehold`: the person is in no household; send no header.
 *
 * Before the first `household` answer of a fresh device nothing is stored,
 * so no header is sent and the server compares nothing. That is right: a
 * page that has shown no household cannot be showing the wrong one.
 */
let pageHouseholdId: string | null | undefined

export function getShownHouseholdId(): string | null {
  if (pageHouseholdId === undefined) pageHouseholdId = getLastHouseholdId()
  return pageHouseholdId
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
  removeStorage(activeLocationStorageKey('cloud'))
  setLastHouseholdId(id)
  if (options.to === undefined) window.location.reload()
  else window.location.replace(options.to)
}

/**
 * Forget the old household on this device, and stay on the page (households
 * H5b, task G.8, Step 3b). `NoHouseholdGate` calls it once when it shows the
 * no-household screen.
 *
 * A leave or a removal that leaves the person in NO household does not reach
 * `HouseholdChangeGuard`: `GetHousehold` fails with `NO_HOUSEHOLD`, so there
 * is no new id to compare. Without this step the old household's rows would
 * stay in memory and in `Player1InventoryCloudCache`.
 *
 * Like `switchToHousehold` it keeps `LAST_USER_ID_KEY` (see `clearCache`).
 * Unlike it, it stores NO id and does not reload: the person has no
 * household, and the screen they see is the right one. With no stored id,
 * `HouseholdChangeGuard` simply stores the next household it sees.
 */
export async function forgetHousehold(): Promise<void> {
  await clearCache()
  removeStorage(activeLocationStorageKey('cloud'))
  removeStorage(LAST_HOUSEHOLD_ID_KEY)
  pageHouseholdId = null
}

/**
 * The key of the one-time message after a reload caused by
 * `HOUSEHOLD_CHANGED` (owner decision O51-A). `HouseholdChangedNotice`
 * shows it once and removes it.
 *
 * It lives in `sessionStorage`, not `localStorage`. The message is for the
 * ONE tab that recovered. `sessionStorage` belongs to one tab and survives
 * that tab's reload (and its `location.replace`). In `localStorage`, which
 * every tab shares, a second tab that loads at the same moment (for example
 * after **Create new**) would show the message or remove it before the
 * recovered tab reads it.
 *
 * The value is JSON, `{ household, oldHousehold }`: the name of the household
 * the person is in now, and the name the page showed before, or `null` when
 * it is not known. Both names must be stored BEFORE the reload: the reload
 * starts from an empty cache, so the old name cannot be read afterwards.
 */
export const HOUSEHOLD_CHANGED_NOTICE_KEY = 'household-changed-notice'

export interface HouseholdChangedNotice {
  household: string
  oldHousehold: string | null
}

/**
 * Read the stored message, or `null` when there is none or it cannot be
 * read. It does not remove it; `clearHouseholdChangedNotice` does.
 */
export function readHouseholdChangedNotice(): HouseholdChangedNotice | null {
  const raw = readStorage(HOUSEHOLD_CHANGED_NOTICE_KEY, 'session')
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { household, oldHousehold } = value as Record<string, unknown>
    if (typeof household !== 'string') return null
    return {
      household,
      oldHousehold: typeof oldHousehold === 'string' ? oldHousehold : null,
    }
  } catch {
    return null
  }
}

export function clearHouseholdChangedNotice(): void {
  removeStorage(HOUSEHOLD_CHANGED_NOTICE_KEY, 'session')
}

// `true` from the first `HOUSEHOLD_CHANGED` of this page load until the page
// reloads. A stale tab often gets several refusals at once (every active
// query refetched after a live event), and each one reaches the error link.
// Only the first may start a recovery, or the page would clear the cache and
// reload once per refusal.
let recovering = false

/** Tests only: forget the page's state, as a new page load would. */
export function resetHouseholdGuardForTests(): void {
  recovering = false
  pageHouseholdId = undefined
}

/**
 * The web's answer to `HOUSEHOLD_CHANGED` (households H7 task L.3, decision
 * T72, owner decision O51-A). The error link in `client.ts` calls it for
 * every refusal with that code; only the first call of a page load does
 * anything.
 *
 * 1. Ask the server which household the person is in now (`GetHousehold`,
 *    which the server answers whatever the header says). `no-cache`, not
 *    `network-only`: written to the cache, the answer would reach the
 *    WATCHED `GetHousehold` too, and `HouseholdChangeGuard` would start a
 *    second switch and a second reload.
 * 2. Another household: store the message for after the reload, with the
 *    old name read from the cache first, then `switchToHousehold` (clear the
 *    cache, forget the active location, store the id, reload this page).
 * 3. `NO_HOUSEHOLD`: `forgetHousehold`, then reload. No message: the
 *    no-household screen says what happened.
 *
 * The refused write is NOT sent again. It was meant for the old household,
 * and in the new one it would land where the person did not mean.
 *
 * When the question fails (offline, a server error), or the answer is the
 * household this page already shows, nothing happens and the flag is reset,
 * so a later refusal can try again. Neither case can loop: every recovery
 * starts from one refusal by the server, and a reload happens only when the
 * answer names a household this page does not show. After that reload the
 * page shows it, so the same answer cannot start another reload.
 */
export async function recoverFromHouseholdChange(
  client: ApolloClient,
): Promise<void> {
  if (recovering) return
  recovering = true

  const shown = getShownHouseholdId()
  // The cached household is the one this page shows. Read its name now: the
  // reload clears the cache.
  let oldHousehold: string | null = null
  try {
    const cached = client.readQuery<GetHouseholdQuery>({
      query: GetHouseholdDocument,
    })?.household
    if (cached && cached.id === shown) oldHousehold = cached.name
  } catch {
    // No cached household: the message names none.
  }

  let now: GetHouseholdQuery['household'] | undefined
  try {
    const answer = await client.query<GetHouseholdQuery>({
      query: GetHouseholdDocument,
      fetchPolicy: 'no-cache',
    })
    now = answer.data?.household
  } catch (err) {
    if (graphQLErrorCode(err) === 'NO_HOUSEHOLD') {
      try {
        await forgetHousehold()
        window.location.reload()
      } catch (clearErr) {
        recovering = false
        console.error('Could not clear the data of the old household', clearErr)
      }
      return
    }
    recovering = false
    return
  }

  if (!now || now.id === shown) {
    recovering = false
    return
  }

  writeStorage(
    HOUSEHOLD_CHANGED_NOTICE_KEY,
    JSON.stringify({ household: now.name, oldHousehold }),
    'session',
  )
  try {
    await switchToHousehold(now.id)
  } catch (err) {
    // Same rule as `HouseholdChangeGuard`: no reload when the cache could
    // not be cleared, or the old saved copy would come back. The message
    // goes too, because nothing moved.
    clearHouseholdChangedNotice()
    recovering = false
    console.error('Could not clear the data of the old household', err)
  }
}
