import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MyLocationSortDocument,
  type MyLocationSortQuery,
  useMyLocationSortQuery,
  useSetLocationSortMutation,
} from '@/generated/graphql'
import { convertDetectedLanguage } from '@/lib/language'
import {
  CLOUD_LOCATION_SORTS,
  LOCAL_LOCATION_SORT_KEY,
  LOCAL_LOCATION_SORTS,
  type LocationSortValue,
  type SortableLocation,
  sortLocations,
  toLocationSort,
} from '@/lib/locationSort'
import { useDataMode } from './useDataMode'

// ── Local mode: one value on the device (owner decision O54-B) ──
//
// The choice is kept in `localStorage['location-sort']`, not in Dexie, so no
// Dexie version is added. The settings page and the switcher both read it,
// so a change on one must show on the other at once: a module-level list of
// listeners does that, and the `storage` event does it for other tabs.
//
// Every read and write is in `try/catch`. A blocked storage (a private
// window, a sandboxed frame) then gives `custom`, the default.

const localListeners = new Set<() => void>()

function readLocalSort(): LocationSortValue {
  try {
    return toLocationSort(
      localStorage.getItem(LOCAL_LOCATION_SORT_KEY),
      LOCAL_LOCATION_SORTS,
    )
  } catch {
    return toLocationSort(null, LOCAL_LOCATION_SORTS)
  }
}

function writeLocalSort(sort: LocationSortValue) {
  try {
    localStorage.setItem(LOCAL_LOCATION_SORT_KEY, sort)
  } catch {
    // ignore write failures (e.g. private mode). The listeners below read the
    // storage again, which still gives the old value, or Custom when the
    // read is blocked too. Nothing is kept only in memory.
  }
  for (const listener of localListeners) listener()
}

function subscribeLocalSort(listener: () => void) {
  localListeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCAL_LOCATION_SORT_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    localListeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export interface LocationSortState {
  /** The sort to show now. `custom` until a cloud answer arrives. */
  sort: LocationSortValue
  /** The sorts this mode offers, in the order the control lists them. */
  options: readonly LocationSortValue[]
  /** Saves a new sort. The lists re-sort at once. */
  setSort: (sort: LocationSortValue) => void
  /**
   * `sortLocations` with this sort and the app language (`zh-TW` names for
   * `tw`). Returns a new array.
   */
  sorted: <T extends SortableLocation>(locations: readonly T[]) => T[]
}

/**
 * The person's sort of their location lists (households H7b, decisions T74
 * and T81). The settings page and the location switcher both call it
 * (owner decision O53-A).
 *
 * - Cloud: `myLocationSort`, saved per person on the server, so every device
 *   shows the same sort. A change writes the cache first (an optimistic
 *   answer), so the lists re-sort before the server answers.
 * - Local: `localStorage['location-sort']`, `name` or `custom` only
 *   (owner decision O54-B). A missing, unknown or cloud-only value gives
 *   `custom`.
 */
export function useLocationSort(): LocationSortState {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { i18n } = useTranslation()
  const language = convertDetectedLanguage(i18n.language ?? 'en')

  const localSort = useSyncExternalStore(
    subscribeLocalSort,
    readLocalSort,
    readLocalSort,
  )

  const cloud = useMyLocationSortQuery({
    skip: !isCloud,
    fetchPolicy: 'cache-and-network',
  })
  const [cloudSetSort] = useSetLocationSortMutation()

  const setCloudSort = useCallback(
    (sort: LocationSortValue) => {
      cloudSetSort({
        variables: { sort },
        optimisticResponse: { setLocationSort: sort },
        update: (cache, { data }) => {
          if (!data?.setLocationSort) return
          cache.writeQuery<MyLocationSortQuery>({
            query: MyLocationSortDocument,
            data: { myLocationSort: data.setLocationSort },
          })
        },
      }).catch(() => {
        // The optimistic answer is rolled back by Apollo, so the list goes
        // back to the stored sort. Offline, `offlineWriteLink` has already
        // shown its own toast. No second message here.
      })
    },
    [cloudSetSort],
  )

  const sort = isCloud
    ? toLocationSort(cloud.data?.myLocationSort, CLOUD_LOCATION_SORTS)
    : localSort
  const sorted = useCallback(
    <T extends SortableLocation>(locations: readonly T[]) =>
      sortLocations(locations, sort, language),
    [sort, language],
  )

  if (isCloud) {
    return {
      sort,
      options: CLOUD_LOCATION_SORTS,
      setSort: setCloudSort,
      sorted,
    }
  }

  return {
    sort,
    options: LOCAL_LOCATION_SORTS,
    setSort: writeLocalSort,
    sorted,
  }
}
