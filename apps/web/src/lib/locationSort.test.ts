import { describe, expect, it } from 'vitest'
import {
  CLOUD_LOCATION_SORTS,
  LOCAL_LOCATION_SORTS,
  type SortableLocation,
  sortLocations,
  toLocationSort,
} from './locationSort'

// Each sort gives a DIFFERENT order of these three, so a sort that falls
// back to another one cannot pass by chance:
//   name        → Apple, banana, Cherry
//   lastUpdated → banana, Cherry, Apple (Apple has no date)
//   lastVisited → Apple, Cherry, banana (banana has no date)
//   custom      → Cherry, banana, Apple
// "Cherry" has a capital C on purpose: a plain `<` compare puts it before
// "banana", `localeCompare` does not.
const LOCATIONS: SortableLocation[] = [
  {
    id: 'loc-a',
    name: 'banana',
    order: 1,
    dataUpdatedAt: '2026-03-01T00:00:00.000Z',
    lastVisitedAt: null,
  },
  {
    id: 'loc-b',
    name: 'Apple',
    order: 2,
    dataUpdatedAt: null,
    lastVisitedAt: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 'loc-c',
    name: 'Cherry',
    order: 0,
    dataUpdatedAt: '2026-02-01T00:00:00.000Z',
    lastVisitedAt: '2026-01-01T00:00:00.000Z',
  },
]

const names = (rows: SortableLocation[]) => rows.map((l) => l.name)

describe('sortLocations', () => {
  it('sorts by name without caring about case', () => {
    expect(names(sortLocations(LOCATIONS, 'name', 'en'))).toEqual([
      'Apple',
      'banana',
      'Cherry',
    ])
  })

  it('treats names that differ only in case as a tie, broken by id', () => {
    // With `sensitivity: 'base'` "apple" and "Apple" are equal, so the id
    // decides: loc-1 first. Without it, ICU puts lower case first.
    const rows: SortableLocation[] = [
      { id: 'loc-2', name: 'apple', order: 0 },
      { id: 'loc-1', name: 'Apple', order: 1 },
    ]
    expect(sortLocations(rows, 'name', 'en').map((l) => l.id)).toEqual([
      'loc-1',
      'loc-2',
    ])
  })

  it('sorts tw names with zh-TW, by stroke count', () => {
    // 書 (U+66F8, 10 strokes) comes before 木 (U+6728, 4 strokes) by code
    // point, and after it by stroke count. `en` keeps the code point order,
    // so the two languages must give different answers.
    const rows: SortableLocation[] = [
      { id: 'loc-1', name: '書', order: 0 },
      { id: 'loc-2', name: '木', order: 1 },
    ]
    expect(names(sortLocations(rows, 'name', 'tw'))).toEqual(['木', '書'])
    expect(names(sortLocations(rows, 'name', 'en'))).toEqual(['書', '木'])
  })

  it('sorts by last updated, newest first, with no date last', () => {
    expect(names(sortLocations(LOCATIONS, 'lastUpdated', 'en'))).toEqual([
      'banana',
      'Cherry',
      'Apple',
    ])
  })

  it('sorts by last visited, newest first, with no date last', () => {
    expect(names(sortLocations(LOCATIONS, 'lastVisited', 'en'))).toEqual([
      'Apple',
      'Cherry',
      'banana',
    ])
  })

  it('puts every location with no date after the dated ones, by name', () => {
    const rows: SortableLocation[] = [
      { id: 'loc-1', name: 'Zeta', order: 0, lastVisitedAt: null },
      { id: 'loc-2', name: 'Alpha', order: 1, lastVisitedAt: null },
      {
        id: 'loc-3',
        name: 'Middle',
        order: 2,
        lastVisitedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    expect(names(sortLocations(rows, 'lastVisited', 'en'))).toEqual([
      'Middle',
      'Alpha',
      'Zeta',
    ])
  })

  it('sorts by the custom order', () => {
    expect(names(sortLocations(LOCATIONS, 'custom', 'en'))).toEqual([
      'Cherry',
      'banana',
      'Apple',
    ])
  })

  it('breaks a tie of the same date by name, then by id', () => {
    const same = '2026-01-01T00:00:00.000Z'
    const rows: SortableLocation[] = [
      { id: 'loc-9', name: 'Beta', order: 0, dataUpdatedAt: same },
      { id: 'loc-3', name: 'Alpha', order: 1, dataUpdatedAt: same },
      { id: 'loc-1', name: 'Alpha', order: 2, dataUpdatedAt: same },
    ]
    expect(sortLocations(rows, 'lastUpdated', 'en').map((l) => l.id)).toEqual([
      'loc-1',
      'loc-3',
      'loc-9',
    ])
  })

  it('does not change the input array', () => {
    const before = names(LOCATIONS)
    sortLocations(LOCATIONS, 'name', 'en')
    expect(names(LOCATIONS)).toEqual(before)
  })
})

describe('toLocationSort', () => {
  it('keeps a sort this mode offers', () => {
    expect(toLocationSort('name', LOCAL_LOCATION_SORTS)).toBe('name')
    expect(toLocationSort('lastVisited', CLOUD_LOCATION_SORTS)).toBe(
      'lastVisited',
    )
  })

  it('falls back to custom for a missing, unknown or cloud-only value', () => {
    expect(toLocationSort(null, LOCAL_LOCATION_SORTS)).toBe('custom')
    expect(toLocationSort('banana', LOCAL_LOCATION_SORTS)).toBe('custom')
    expect(toLocationSort('lastUpdated', LOCAL_LOCATION_SORTS)).toBe('custom')
    expect(toLocationSort('lastVisited', LOCAL_LOCATION_SORTS)).toBe('custom')
  })
})
