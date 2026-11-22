import type { Language } from '@/lib/language'
import { LANGUAGE_LOCALE } from '@/lib/language'

/**
 * The four ways a person can sort their locations (households H7b,
 * decisions T74 and T81). The same names as the server's `LocationSort`
 * enum, so a cloud value needs no mapping.
 *
 * Local mode offers only `name` and `custom` (owner decision O54-B): it has
 * no `dataUpdatedAt` and no visits.
 */
export type LocationSortValue =
  | 'name'
  | 'lastUpdated'
  | 'lastVisited'
  | 'custom'

/** Every sort, in the order the **Sort by** control lists them. */
export const CLOUD_LOCATION_SORTS: readonly LocationSortValue[] = [
  'custom',
  'name',
  'lastUpdated',
  'lastVisited',
]

/** The two sorts local mode offers (owner decision O54-B). */
export const LOCAL_LOCATION_SORTS: readonly LocationSortValue[] = [
  'custom',
  'name',
]

/** The sort when the person never chose one (owner decision O52-A). */
export const DEFAULT_LOCATION_SORT: LocationSortValue = 'custom'

/** The `localStorage` key that holds local mode's choice (O54-B). */
export const LOCAL_LOCATION_SORT_KEY = 'location-sort'

/** The fields `sortLocations` reads. Dates are ISO strings, or null. */
export interface SortableLocation {
  id: string
  name: string
  order: number
  dataUpdatedAt?: string | null
  lastVisitedAt?: string | null
}

/** A time in milliseconds, or `null` for a missing or unreadable date. */
function timeOf(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/** Newest first; a missing date goes last. `0` when both are the same. */
function newestFirst(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return b - a
}

/**
 * Sorts a list of locations by the person's choice (decision T81). Returns a
 * new array; the input is not changed.
 *
 * - `name`: `localeCompare` in the app language (`zh-TW` for `tw`), with
 *   `sensitivity: 'base'`, so "apple" and "Apple" sort together.
 * - `lastUpdated`: `dataUpdatedAt`, newest first, `null` last.
 * - `lastVisited`: `lastVisitedAt`, newest first, `null` last.
 * - `custom`: by `order`.
 *
 * Ties: by name (the same compare as `name`), then by `id`, so the result
 * never depends on the order of the input.
 */
export function sortLocations<T extends SortableLocation>(
  locations: readonly T[],
  sort: LocationSortValue,
  language: Language,
): T[] {
  const locale = LANGUAGE_LOCALE[language]
  const byName = (a: T, b: T) =>
    a.name.localeCompare(b.name, locale, { sensitivity: 'base' })
  const tieBreak = (a: T, b: T) => {
    const name = byName(a, b)
    if (name !== 0) return name
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  }
  const primary = (a: T, b: T): number => {
    switch (sort) {
      case 'name':
        return 0
      case 'lastUpdated':
        return newestFirst(timeOf(a.dataUpdatedAt), timeOf(b.dataUpdatedAt))
      case 'lastVisited':
        return newestFirst(timeOf(a.lastVisitedAt), timeOf(b.lastVisitedAt))
      case 'custom':
        return a.order - b.order
    }
  }
  return [...locations].sort((a, b) => primary(a, b) || tieBreak(a, b))
}

/**
 * Reads a stored or received value as a sort. Anything else (missing,
 * unknown, or a sort this mode does not offer) gives `custom`.
 */
export function toLocationSort(
  value: unknown,
  allowed: readonly LocationSortValue[],
): LocationSortValue {
  return allowed.includes(value as LocationSortValue)
    ? (value as LocationSortValue)
    : DEFAULT_LOCATION_SORT
}
